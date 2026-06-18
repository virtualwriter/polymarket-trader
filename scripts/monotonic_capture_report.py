#!/usr/bin/env python3
"""Summarize daemon candidate-capture conversion audit rows.

Input is data/monotonic-capture-audit.jsonl, emitted by
scripts/polymarket-arb-daemon.ts. Unlike monotonic-middle-audit.jsonl (which says
"a clean pair existed"), this answers whether the daemon converted that moment
into preflight, sizing, submit, paired fill, or a specific terminal miss reason.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median
from typing import Any


BUCKETS = [
    (float("-inf"), 1.000, "<1.000"),
    (1.000, 1.005, "1.000-1.005"),
    (1.005, 1.020, "1.005-1.02"),
    (1.020, 1.050, "1.02-1.05"),
    (1.050, 1.100, "1.05-1.10"),
    (1.100, 1.160, "1.10-1.16"),
    (1.160, 1.250, "1.16-1.25"),
    (1.250, float("inf"), ">1.25"),
]


def bucket_for(cost: float) -> str:
    for lo, hi, label in BUCKETS:
        if lo <= cost <= hi:
            return label
    return "unknown"


def pct(num: int | float, den: int | float) -> float:
    return 0.0 if den == 0 else float(num) / float(den)


def q50(values: list[float]) -> float | None:
    return None if not values else float(median(values))


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open(errors="replace") as handle:
        for line in handle:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict):
                rows.append(row)
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_bucket: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_asset: Counter[str] = Counter()
    for row in rows:
        ws = row.get("ws") or {}
        cost = float(ws.get("cost", 99))
        by_bucket[bucket_for(cost)].append(row)
        by_asset[str(ws.get("asset") or "?")] += 1

    bucket_rows: list[dict[str, Any]] = []
    for _, _, label in BUCKETS:
        subset = by_bucket.get(label, [])
        if not subset:
            continue
        submitted = [r for r in subset if r.get("terminalStatus") == "submitted_result"]
        paired = [r for r in submitted if ((r.get("execution") or {}).get("matched") or 0) > 0]
        orphaned = [r for r in submitted if ((r.get("execution") or {}).get("nakedShares") or 0) > 0]
        no_fill = [r for r in submitted if ((r.get("execution") or {}).get("matched") or 0) <= 0]
        actual_pair_costs = [
            float((r.get("execution") or {}).get("actualPairCost"))
            for r in paired
            if (r.get("execution") or {}).get("actualPairCost") is not None
        ]
        slippages = [
            float((r.get("execution") or {}).get("actualPairCost")) - float((r.get("ws") or {}).get("cost", 0))
            for r in paired
            if (r.get("execution") or {}).get("actualPairCost") is not None
        ]
        elapsed = [float(r.get("elapsedMs")) for r in subset if isinstance(r.get("elapsedMs"), (int, float))]
        terminal_counts = Counter(str(r.get("terminalStatus")) for r in subset)
        miss_reasons = Counter(
            str(r.get("reason"))
            for r in subset
            if r.get("terminalStatus") != "submitted_result"
        )
        bucket_rows.append({
            "bucket": label,
            "captures": len(subset),
            "submitted": len(submitted),
            "pairedFilled": len(paired),
            "submittedNoFill": len(no_fill),
            "orphaned": len(orphaned),
            "submitRate": pct(len(submitted), len(subset)),
            "pairedFillRate": pct(len(paired), len(subset)),
            "orphanRateOfSubmitted": pct(len(orphaned), len(submitted)),
            "medianActualPairCost": q50(actual_pair_costs),
            "medianSlippageVsWsCost": q50(slippages),
            "medianElapsedMs": q50(elapsed),
            "terminalStatus": dict(terminal_counts.most_common()),
            "topMissReasons": dict(miss_reasons.most_common(8)),
        })

    submitted_all = [r for r in rows if r.get("terminalStatus") == "submitted_result"]
    paired_all = [r for r in submitted_all if ((r.get("execution") or {}).get("matched") or 0) > 0]
    return {
        "rows": len(rows),
        "buckets": bucket_rows,
        "terminalStatus": dict(Counter(str(r.get("terminalStatus")) for r in rows).most_common()),
        "assets": dict(by_asset.most_common()),
        "submitted": len(submitted_all),
        "pairedFilled": len(paired_all),
        "submitRate": pct(len(submitted_all), len(rows)),
        "pairedFillRate": pct(len(paired_all), len(rows)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize monotonic capture audit conversion.")
    parser.add_argument("--audit", default="data/monotonic-capture-audit.jsonl")
    parser.add_argument("--out")
    args = parser.parse_args()

    report = summarize(load_rows(Path(args.audit)))
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.out:
        Path(args.out).write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
