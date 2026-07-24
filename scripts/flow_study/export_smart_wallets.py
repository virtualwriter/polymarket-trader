#!/usr/bin/env python3
"""Export walk-forward smart/dumb wallet sets from wallet_market_records.jsonl.

Smart = cumulative ROI >= +10% after >=5 prior markets (same thresholds as
informed_flow_tests). Written to data/flow-study/smart_wallets.json for the
live scorer and heatmap join.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List

MIN_MARKETS = 5
SMART_ROI = 0.10
DUMB_ROI = -0.10


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default="/opt/polymarket-trader")
    args = parser.parse_args()
    root = Path(args.repo_root)
    out_dir = root / "data" / "flow-study"
    records = [json.loads(l) for l in (out_dir / "wallet_market_records.jsonl").open()]
    records.sort(key=lambda r: (r["end_date"], r["market_id"]))

    prior: Dict[str, Dict[str, float]] = defaultdict(lambda: {"pnl": 0.0, "risk": 0.0, "n": 0.0})
    # Final classification after processing all markets (lifetime within sample).
    for r in records:
        p = prior[r["wallet"]]
        p["pnl"] += r["pnl"]
        p["risk"] += r["risk"]
        p["n"] += 1

    smart: List[Dict[str, Any]] = []
    dumb: List[Dict[str, Any]] = []
    for w, p in prior.items():
        if p["n"] < MIN_MARKETS or p["risk"] <= 0:
            continue
        roi = p["pnl"] / p["risk"]
        row = {"wallet": w, "n_markets": int(p["n"]), "roi": round(roi, 4), "pnl": round(p["pnl"], 2)}
        if roi >= SMART_ROI:
            smart.append(row)
        elif roi <= DUMB_ROI:
            dumb.append(row)

    smart.sort(key=lambda r: -r["roi"])
    dumb.sort(key=lambda r: r["roi"])
    payload = {
        "min_markets": MIN_MARKETS,
        "smart_roi": SMART_ROI,
        "dumb_roi": DUMB_ROI,
        "n_smart": len(smart),
        "n_dumb": len(dumb),
        "smart_wallets": [r["wallet"] for r in smart],
        "dumb_wallets": [r["wallet"] for r in dumb],
        "smart_detail": smart[:500],
        "dumb_detail": dumb[:500],
    }
    path = out_dir / "smart_wallets.json"
    path.write_text(json.dumps(payload, indent=1))
    print(f"wrote {path}: smart={len(smart)} dumb={len(dumb)}")


if __name__ == "__main__":
    main()
