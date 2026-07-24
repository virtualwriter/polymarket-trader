#!/usr/bin/env python3
"""Build wallet-level records from trade tapes and score wallet skill.

Outputs (under data/flow-study/):
- wallet_market_records.jsonl: one row per (wallet, market) with net YES
  exposure, realized PnL vs resolution, and capital at risk.
- wallet_skill.json: walk-forward skill classification inputs + persistence
  check results.

PnL convention (per trade, settled at resolution y in {0,1} for YES):
  BUY  Yes at p, size s: s * (y - p)
  SELL Yes at p, size s: s * (p - y)
  BUY  No  at p, size s: s * ((1-y) - p)
  SELL No  at p, size s: s * (p - (1-y))
Summing per-trade PnL is exact for round trips as well as held positions.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional


def load_first_snaps(root: Path) -> Dict[str, Dict[str, Any]]:
    first: Dict[str, Dict[str, Any]] = {}
    with (root / "relative-value" / "calibration" / "no_bias_candidates.jsonl").open() as fh:
        for line in fh:
            r = json.loads(line)
            mid = str(r.get("market_id"))
            if mid not in first:
                first[mid] = r
    return first


def parse_created_ms(name: Optional[str]) -> Optional[int]:
    # Wallet display names look like "0xABC...-1763746245367" (ms epoch suffix).
    if not name or "-" not in name:
        return None
    tail = name.rsplit("-", 1)[-1]
    if tail.isdigit() and len(tail) == 13:
        return int(tail)
    return None


def trade_pnl_and_risk(side: str, outcome_index: int, price: float, size: float, y: int) -> tuple[float, float]:
    token_pays = y if outcome_index == 0 else (1 - y)
    if side == "BUY":
        return size * (token_pays - price), size * price
    return size * (price - token_pays), size * (1.0 - price)


def spearman(xs: List[float], ys: List[float]) -> Optional[float]:
    n = len(xs)
    if n < 5:
        return None

    def ranks(vals: List[float]) -> List[float]:
        order = sorted(range(n), key=lambda i: vals[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    vy = math.sqrt(sum((b - my) ** 2 for b in ry))
    if vx == 0 or vy == 0:
        return None
    return cov / (vx * vy)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default="/opt/polymarket-trader")
    args = parser.parse_args()
    root = Path(args.repo_root)
    out_dir = root / "data" / "flow-study"

    resolutions = json.loads((root / "relative-value" / "calibration" / "resolutions_cache.json").read_text())
    meta = json.loads((out_dir / "market_meta.json").read_text())
    manifest = json.loads((out_dir / "manifest.json").read_text())
    first_snaps = load_first_snaps(root)

    records: List[Dict[str, Any]] = []
    wallet_created: Dict[str, int] = {}

    for mid, m in manifest.items():
        if m.get("status") != "complete":
            continue
        snap = first_snaps.get(mid)
        if not snap or snap.get("contract_type") != "touch":
            continue
        outcome = str(resolutions.get(mid, {}).get("outcome", "")).lower()
        if outcome not in ("yes", "no"):
            continue
        y = 1 if outcome == "yes" else 0
        info = meta.get(mid, {})
        end_date = str(info.get("end_date") or "")

        per_wallet: Dict[str, Dict[str, float]] = defaultdict(
            lambda: {"pnl": 0.0, "risk": 0.0, "net_yes": 0.0, "yes_buy_usd": 0.0, "n": 0.0}
        )
        tape_path = out_dir / "tapes" / f"{mid}.jsonl"
        with tape_path.open() as fh:
            for line in fh:
                t = json.loads(line)
                w = t.get("proxyWallet")
                price = t.get("price")
                size = t.get("size")
                oi = t.get("outcomeIndex")
                side = t.get("side")
                if not w or price is None or size is None or oi not in (0, 1) or side not in ("BUY", "SELL"):
                    continue
                created = parse_created_ms(t.get("name"))
                if created and w not in wallet_created:
                    wallet_created[w] = created
                pnl, risk = trade_pnl_and_risk(side, oi, float(price), float(size), y)
                rec = per_wallet[w]
                rec["pnl"] += pnl
                rec["risk"] += risk
                rec["n"] += 1
                # Directional YES exposure: buying YES or selling NO is bullish-YES.
                sign = 1.0 if ((side == "BUY") == (oi == 0)) else -1.0
                rec["net_yes"] += sign * float(size)
                if side == "BUY" and oi == 0:
                    rec["yes_buy_usd"] += float(price) * float(size)

        for w, rec in per_wallet.items():
            records.append(
                {
                    "wallet": w,
                    "market_id": mid,
                    "asset": snap.get("asset"),
                    "direction": snap.get("direction"),
                    "y": y,
                    "end_date": end_date,
                    "pnl": round(rec["pnl"], 4),
                    "risk": round(rec["risk"], 4),
                    "net_yes": round(rec["net_yes"], 4),
                    "yes_buy_usd": round(rec["yes_buy_usd"], 4),
                    "n_trades": int(rec["n"]),
                }
            )

    records.sort(key=lambda r: (r["end_date"], r["market_id"]))
    with (out_dir / "wallet_market_records.jsonl").open("w") as fh:
        for r in records:
            fh.write(json.dumps(r) + "\n")
    (out_dir / "wallet_created.json").write_text(json.dumps(wallet_created))

    markets = sorted({(r["end_date"], r["market_id"]) for r in records})
    n_wallets = len({r["wallet"] for r in records})
    print(f"records={len(records)} markets={len(markets)} wallets={n_wallets}")

    # Persistence: split markets by median end_date; wallets active >=5 in each half.
    mids_sorted = [m for _, m in markets]
    half = set(mids_sorted[: len(mids_sorted) // 2])
    by_wallet_half: Dict[str, Dict[str, List[Dict[str, Any]]]] = defaultdict(lambda: {"h1": [], "h2": []})
    for r in records:
        key = "h1" if r["market_id"] in half else "h2"
        by_wallet_half[r["wallet"]][key].append(r)

    rois1: List[float] = []
    rois2: List[float] = []
    eligible = 0
    for w, halves in by_wallet_half.items():
        if len(halves["h1"]) >= 5 and len(halves["h2"]) >= 5:
            risk1 = sum(r["risk"] for r in halves["h1"])
            risk2 = sum(r["risk"] for r in halves["h2"])
            if risk1 <= 0 or risk2 <= 0:
                continue
            eligible += 1
            rois1.append(sum(r["pnl"] for r in halves["h1"]) / risk1)
            rois2.append(sum(r["pnl"] for r in halves["h2"]) / risk2)

    rho = spearman(rois1, rois2)
    print(f"persistence: wallets with >=5 markets in each half: {eligible}, spearman(ROI h1, ROI h2) = {rho}")

    (out_dir / "wallet_skill.json").write_text(
        json.dumps(
            {
                "n_records": len(records),
                "n_markets": len(markets),
                "n_wallets": n_wallets,
                "persistence_eligible_wallets": eligible,
                "persistence_spearman": rho,
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
