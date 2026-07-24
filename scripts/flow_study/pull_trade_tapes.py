#!/usr/bin/env python3
"""Pull wallet-level trade tapes for resolved calibration markets.

Reads market ids from relative-value/calibration/resolutions_cache.json,
maps them to condition ids via the Gamma API, then pages through the
public data-api trades endpoint and writes one JSONL tape per market to
data/flow-study/tapes/{market_id}.jsonl.

The data API only exposes the newest 10,000 trades per query (offset cap).
When a market hits the cap we re-pull per side (BUY / SELL) which doubles
the reachable window, and mark the tape as truncated if a side still caps.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

GAMMA_URL = "https://gamma-api.polymarket.com/markets/{market_id}"
TRADES_URL = "https://data-api.polymarket.com/trades"
PAGE_LIMIT = 1000
OFFSET_CAP = 10000
REQUEST_SLEEP_S = 0.15

TRADE_FIELDS = [
    "proxyWallet",
    "side",
    "outcome",
    "outcomeIndex",
    "price",
    "size",
    "timestamp",
    "transactionHash",
    "name",
    "pseudonym",
]


def fetch_json(url: str, retries: int = 4) -> Any:
    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "flow-study/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - retry any transient failure
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"fetch failed after {retries} tries: {url}: {last_err}")


def fetch_market_meta(market_id: str) -> Optional[Dict[str, Any]]:
    try:
        data = fetch_json(GAMMA_URL.format(market_id=market_id))
    except RuntimeError as exc:
        print(f"  gamma FAILED {market_id}: {exc}")
        return None
    if not isinstance(data, dict) or not data.get("conditionId"):
        return None
    return {
        "market_id": market_id,
        "condition_id": data["conditionId"],
        "question": data.get("question"),
        "slug": data.get("slug"),
        "start_date": data.get("startDate"),
        "end_date": data.get("endDate"),
        "volume_num": data.get("volumeNum"),
        "uma_status": data.get("umaResolutionStatus"),
        "closed": data.get("closed"),
    }


def trade_key(t: Dict[str, Any]) -> tuple:
    return (
        t.get("transactionHash"),
        t.get("proxyWallet"),
        t.get("side"),
        t.get("outcomeIndex"),
        t.get("price"),
        t.get("size"),
        t.get("timestamp"),
    )


def pull_pages(condition_id: str, side: Optional[str] = None) -> tuple[List[Dict[str, Any]], bool]:
    """Return (trades, hit_cap). Pages newest-first until a short page or the offset cap."""
    trades: List[Dict[str, Any]] = []
    offset = 0
    while offset < OFFSET_CAP:
        limit = min(PAGE_LIMIT, OFFSET_CAP - offset)
        params = {"market": condition_id, "limit": str(limit), "offset": str(offset)}
        if side:
            params["side"] = side
        url = f"{TRADES_URL}?{urllib.parse.urlencode(params)}"
        page = fetch_json(url)
        if not isinstance(page, list):
            break
        trades.extend(page)
        if len(page) < limit:
            return trades, False
        offset += limit
        time.sleep(REQUEST_SLEEP_S)
    return trades, True


def pull_market_tape(condition_id: str) -> tuple[List[Dict[str, Any]], bool]:
    trades, hit_cap = pull_pages(condition_id)
    if not hit_cap:
        return trades, False
    # Cap hit: side-split doubles the reachable window.
    merged: Dict[tuple, Dict[str, Any]] = {trade_key(t): t for t in trades}
    truncated = False
    for side in ("BUY", "SELL"):
        side_trades, side_cap = pull_pages(condition_id, side=side)
        truncated = truncated or side_cap
        for t in side_trades:
            merged[trade_key(t)] = t
    return list(merged.values()), truncated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default="/opt/polymarket-trader")
    parser.add_argument("--out-dir", default=None, help="Defaults to <repo-root>/data/flow-study")
    parser.add_argument("--max-markets", type=int, default=None)
    args = parser.parse_args()

    root = Path(args.repo_root)
    out_dir = Path(args.out_dir) if args.out_dir else root / "data" / "flow-study"
    tapes_dir = out_dir / "tapes"
    tapes_dir.mkdir(parents=True, exist_ok=True)

    resolutions = json.loads((root / "relative-value" / "calibration" / "resolutions_cache.json").read_text())
    market_ids = sorted(mid for mid, v in resolutions.items() if v.get("status") == "resolved")
    if args.max_markets:
        market_ids = market_ids[: args.max_markets]
    print(f"resolved markets: {len(market_ids)}")

    meta_path = out_dir / "market_meta.json"
    meta: Dict[str, Any] = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    manifest_path = out_dir / "manifest.json"
    manifest: Dict[str, Any] = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    done = skipped = failed = 0
    for i, mid in enumerate(market_ids):
        if manifest.get(mid, {}).get("status") == "complete":
            skipped += 1
            continue
        if mid not in meta:
            m = fetch_market_meta(mid)
            time.sleep(REQUEST_SLEEP_S)
            if not m:
                manifest[mid] = {"status": "no_condition_id"}
                failed += 1
                continue
            meta[mid] = m
            meta_path.write_text(json.dumps(meta, indent=1))
        condition_id = meta[mid]["condition_id"]

        try:
            trades, truncated = pull_market_tape(condition_id)
        except RuntimeError as exc:
            print(f"  trades FAILED {mid}: {exc}")
            manifest[mid] = {"status": "fetch_error", "error": str(exc)}
            failed += 1
            manifest_path.write_text(json.dumps(manifest, indent=1))
            continue

        tape_path = tapes_dir / f"{mid}.jsonl"
        with tape_path.open("w") as fh:
            for t in sorted(trades, key=lambda x: x.get("timestamp") or 0):
                fh.write(json.dumps({k: t.get(k) for k in TRADE_FIELDS}) + "\n")

        manifest[mid] = {
            "status": "complete",
            "n_trades": len(trades),
            "truncated": truncated,
            "resolution": resolutions[mid].get("outcome"),
        }
        manifest_path.write_text(json.dumps(manifest, indent=1))
        done += 1
        if done % 20 == 0 or truncated:
            flag = " TRUNCATED" if truncated else ""
            print(f"[{i+1}/{len(market_ids)}] {mid}: {len(trades)} trades{flag}")
        time.sleep(REQUEST_SLEEP_S)

    n_trunc = sum(1 for v in manifest.values() if v.get("truncated"))
    total_trades = sum(v.get("n_trades", 0) for v in manifest.values())
    print(f"\ndone={done} skipped={skipped} failed={failed} truncated={n_trunc} total_trades={total_trades}")


if __name__ == "__main__":
    main()
