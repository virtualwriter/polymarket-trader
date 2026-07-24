#!/usr/bin/env python3
"""Score smart-wallet YES stance per market for the heatmap join.

For each market_id in the latest relative-value CSV (and any cached tapes):
  net_yes = sum over smart wallets of signed YES exposure from the trade tape
  stance  = +1 if net_yes > +MIN_NET, -1 if net_yes < -MIN_NET, else 0

Writes data/flow-study/smart_flow_stance.json consumed by the heatmap report
and trading-engine direction/flow gates.

Live/open markets without a local tape are pulled from the Polymarket data API
(newest 2k trades) so the scorer stays current.
"""

from __future__ import annotations

import argparse
import csv
import json
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

MIN_NET = 50.0  # shares; ignore noise
PAGE_LIMIT = 500
MAX_LIVE_TRADES = 2000
REQUEST_SLEEP_S = 0.12


def fetch_json(url: str, retries: int = 3) -> Any:
    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "flow-study-score/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last_err}")


def iter_tape_trades(path: Path) -> Iterable[Dict[str, Any]]:
    with path.open() as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)


def pull_live_trades(condition_id: str) -> List[Dict[str, Any]]:
    trades: List[Dict[str, Any]] = []
    offset = 0
    while offset < MAX_LIVE_TRADES:
        limit = min(PAGE_LIMIT, MAX_LIVE_TRADES - offset)
        params = urllib.parse.urlencode({"market": condition_id, "limit": limit, "offset": offset})
        page = fetch_json(f"https://data-api.polymarket.com/trades?{params}")
        if not isinstance(page, list) or not page:
            break
        trades.extend(page)
        if len(page) < limit:
            break
        offset += limit
        time.sleep(REQUEST_SLEEP_S)
    return trades


def score_trades(trades: Iterable[Dict[str, Any]], smart: Set[str]) -> Dict[str, float]:
    net = 0.0
    smart_buys = 0.0
    smart_sells = 0.0
    n_smart_trades = 0
    for t in trades:
        w = t.get("proxyWallet")
        if w not in smart:
            continue
        oi = t.get("outcomeIndex")
        side = t.get("side")
        size = float(t.get("size") or 0)
        if oi not in (0, 1) or side not in ("BUY", "SELL") or size <= 0:
            continue
        # +YES exposure: buy YES or sell NO
        sign = 1.0 if ((side == "BUY") == (oi == 0)) else -1.0
        net += sign * size
        n_smart_trades += 1
        if sign > 0:
            smart_buys += size
        else:
            smart_sells += size
    if net > MIN_NET:
        stance = 1.0
    elif net < -MIN_NET:
        stance = -1.0
    else:
        stance = 0.0
    return {
        "net_yes": round(net, 2),
        "stance": stance,
        "smart_buy_yes": round(smart_buys, 2),
        "smart_sell_yes": round(smart_sells, 2),
        "n_smart_trades": n_smart_trades,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default="/opt/polymarket-trader")
    parser.add_argument("--fetch-missing", action="store_true", help="Pull live tapes for markets without cache")
    args = parser.parse_args()
    root = Path(args.repo_root)
    out_dir = root / "data" / "flow-study"

    wallets = json.loads((out_dir / "smart_wallets.json").read_text())
    smart = set(wallets.get("smart_wallets") or [])
    print(f"smart wallets loaded: {len(smart)}")

    meta = {}
    meta_path = out_dir / "market_meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())

    heatmap = root / "relative-value" / "cross_venue_relative_value.csv"
    market_ids: List[str] = []
    if heatmap.exists():
        with heatmap.open() as fh:
            for row in csv.DictReader(fh):
                mid = str(row.get("market_id") or "")
                if mid and mid not in market_ids:
                    market_ids.append(mid)

    # Also score every cached tape (resolved calibration set).
    tapes_dir = out_dir / "tapes"
    for path in tapes_dir.glob("*.jsonl"):
        mid = path.stem
        if mid not in market_ids:
            market_ids.append(mid)

    markets: Dict[str, Dict[str, Any]] = {}
    fetched = cached = skipped = 0
    for mid in market_ids:
        tape_path = tapes_dir / f"{mid}.jsonl"
        trades: List[Dict[str, Any]] = []
        source = "none"
        if tape_path.exists():
            trades = list(iter_tape_trades(tape_path))
            source = "cache"
            cached += 1
        elif args.fetch_missing:
            condition_id = (meta.get(mid) or {}).get("condition_id")
            if not condition_id:
                try:
                    g = fetch_json(f"https://gamma-api.polymarket.com/markets/{mid}")
                    condition_id = g.get("conditionId")
                    meta.setdefault(mid, {})["condition_id"] = condition_id
                    time.sleep(REQUEST_SLEEP_S)
                except RuntimeError:
                    condition_id = None
            if condition_id:
                try:
                    trades = pull_live_trades(condition_id)
                    source = "live"
                    fetched += 1
                except RuntimeError as exc:
                    print(f"  live pull failed {mid}: {exc}")
                    skipped += 1
                    continue
            else:
                skipped += 1
                continue
        else:
            skipped += 1
            continue

        scored = score_trades(trades, smart)
        scored["source"] = source
        scored["n_trades_scored"] = len(trades)
        markets[mid] = scored

    if meta_path.exists() or meta:
        meta_path.write_text(json.dumps(meta, indent=1))

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "min_net": MIN_NET,
        "n_markets": len(markets),
        "n_stance_long_yes": sum(1 for m in markets.values() if m["stance"] > 0),
        "n_stance_short_yes": sum(1 for m in markets.values() if m["stance"] < 0),
        "n_stance_flat": sum(1 for m in markets.values() if m["stance"] == 0),
        "cached": cached,
        "fetched": fetched,
        "skipped": skipped,
        "markets": markets,
    }
    out = out_dir / "smart_flow_stance.json"
    out.write_text(json.dumps(payload, indent=1))
    print(
        f"wrote {out}: markets={len(markets)} "
        f"longYES={payload['n_stance_long_yes']} shortYES={payload['n_stance_short_yes']} "
        f"flat={payload['n_stance_flat']} cached={cached} fetched={fetched} skipped={skipped}"
    )


if __name__ == "__main__":
    main()
