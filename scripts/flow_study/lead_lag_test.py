#!/usr/bin/env python3
"""Lead-lag test: does Polymarket YES richening lead spot moves?

For touch contracts in the hourly heatmap archive, define an event as the
PM-vs-model gap widening by >= GAP_PTS in one hour with PM itself rising
(flow-driven richening). Then compare forward spot returns (24h / 72h)
after events vs the unconditional baseline for the same asset.

Informed dip flow predicts: after dip-YES richening, spot falls more than
baseline. Lottery high flow predicts: after high-YES richening, spot does
not rise more than baseline.

Events are deduped to (asset, hour, direction) so one macro move that
richens five strikes at once counts once.

Writes data/flow-study/results/lead_lag_results.json.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

random.seed(42)

GAP_PTS = 2.0
PM_PTS = 1.0
HORIZONS_H = (24, 72)
NBOOT = 3000


def parse_ts(raw: str) -> Optional[int]:
    try:
        return int(datetime.strptime(raw, "%Y-%m-%dT%H").replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        return None


def safe_float(x) -> Optional[float]:
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def bootstrap_diff_means(a: List[float], b: List[float], nboot: int = NBOOT) -> Dict[str, float]:
    if not a or not b:
        return {"diff": float("nan"), "lo": float("nan"), "hi": float("nan"), "p": float("nan")}
    obs = mean(a) - mean(b)
    diffs = []
    for _ in range(nboot):
        ra = [a[random.randrange(len(a))] for _ in range(len(a))]
        rb = [b[random.randrange(len(b))] for _ in range(len(b))]
        diffs.append(mean(ra) - mean(rb))
    diffs.sort()
    lo, hi = diffs[int(0.025 * nboot)], diffs[int(0.975 * nboot)]
    p = 2 * (sum(1 for d in diffs if d <= 0) if obs >= 0 else sum(1 for d in diffs if d >= 0)) / nboot
    return {"diff": obs, "lo": lo, "hi": hi, "p": min(1.0, p)}


def load_history(history_dir: Path):
    """Return contract series {market_id: [(ts, pm, model, direction, asset)]}
    and spot series {asset: {ts: spot}}."""
    contract: Dict[str, List[Tuple[int, float, float, str, str]]] = defaultdict(list)
    spot: Dict[str, Dict[int, float]] = defaultdict(dict)
    files = sorted(history_dir.glob("*/*.csv"))
    for path in files:
        with path.open() as fh:
            reader = csv.DictReader(fh)
            if not reader.fieldnames or "options_touch_adjusted_prob" not in reader.fieldnames:
                continue
            for row in reader:
                ts = parse_ts(str(row.get("timestamp", "")))
                if ts is None:
                    continue
                asset = row.get("asset") or ""
                s = safe_float(row.get("spot"))
                if asset and s:
                    spot[asset][ts] = s
                q = (row.get("contract_question") or "").lower()
                if not ("hit" in q or "reach" in q or "dip" in q):
                    continue
                pm = safe_float(row.get("pm_yes_price"))
                model = safe_float(row.get("options_touch_adjusted_prob"))
                direction = row.get("direction") or ""
                mid = str(row.get("market_id") or "")
                if pm is None or model is None or direction not in ("above", "below") or not mid:
                    continue
                contract[mid].append((ts, pm, model, direction, asset))
    for mid in contract:
        contract[mid].sort()
    return contract, spot, len(files)


def forward_return(spot_by_ts: Dict[int, float], ts: int, hours: int) -> Optional[float]:
    s0 = spot_by_ts.get(ts)
    target = ts + hours * 3600
    s1 = None
    for dt in range(0, 4 * 3600, 3600):  # allow up to 3h gap in archive
        s1 = spot_by_ts.get(target + dt)
        if s1:
            break
    if not s0 or not s1:
        return None
    return s1 / s0 - 1.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history-dir", default="/var/lib/polymarket-trader/relative-value-history")
    parser.add_argument("--repo-root", default="/opt/polymarket-trader")
    args = parser.parse_args()

    contract, spot, n_files = load_history(Path(args.history_dir))
    print(f"files={n_files} contracts={len(contract)} assets={sorted(spot)}")

    # Event detection, deduped by (asset, ts, direction).
    events: Dict[Tuple[str, int, str], bool] = {}
    for series in contract.values():
        for i in range(1, len(series)):
            ts0, pm0, m0, d, asset = series[i - 1]
            ts1, pm1, m1, _, _ = series[i]
            if ts1 - ts0 != 3600:
                continue
            gap_delta = ((pm1 - m1) - (pm0 - m0)) * 100
            pm_delta = (pm1 - pm0) * 100
            if gap_delta >= GAP_PTS and pm_delta >= PM_PTS:
                events[(asset, ts1, d)] = True

    print(f"events: {len(events)} (deduped)")

    results = {"gap_pts": GAP_PTS, "pm_pts": PM_PTS, "n_files": n_files, "horizons": {}}
    for hours in HORIZONS_H:
        # Baselines: all archive hours per asset.
        baseline: Dict[str, List[float]] = defaultdict(list)
        for asset, by_ts in spot.items():
            for ts in by_ts:
                r = forward_return(by_ts, ts, hours)
                if r is not None:
                    baseline[asset].append(r)

        cohorts: Dict[str, List[float]] = {"above": [], "below": []}
        cohort_baseline: Dict[str, List[float]] = {"above": [], "below": []}
        per_asset: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: {"above": [], "below": []})
        for (asset, ts, d), _ in events.items():
            r = forward_return(spot.get(asset, {}), ts, hours)
            if r is None:
                continue
            cohorts[d].append(r)
            cohort_baseline[d].extend([])  # baseline handled per-asset below
            per_asset[asset][d].append(r)

        h: Dict[str, object] = {}
        for d, label, expect in (("below", "dip_yes_richening", "spot falls if informed"),
                                 ("above", "high_yes_richening", "spot rises if informed")):
            ev = cohorts[d]
            # Asset-matched baseline: weight baseline pool by event asset counts.
            base_pool: List[float] = []
            for asset, sides in per_asset.items():
                k = len(sides[d])
                if k and baseline.get(asset):
                    base_pool.extend(baseline[asset])
            test = bootstrap_diff_means(ev, base_pool)
            h[label] = {
                "expectation": expect,
                "n_events": len(ev),
                "mean_fwd_return_pct": mean(ev) * 100 if ev else None,
                "baseline_mean_pct": mean(base_pool) * 100 if base_pool else None,
                "diff_vs_baseline_pct": test["diff"] * 100 if ev else None,
                "ci_pct": [test["lo"] * 100, test["hi"] * 100] if ev else None,
                "p": test["p"],
            }
        results["horizons"][f"h{hours}"] = h
        print(json.dumps({f"h{hours}": h}, indent=1))

    out = Path(args.repo_root) / "data" / "flow-study" / "results"
    out.mkdir(parents=True, exist_ok=True)
    (out / "lead_lag_results.json").write_text(json.dumps(results, indent=1))
    print(f"wrote {out / 'lead_lag_results.json'}")


if __name__ == "__main__":
    main()
