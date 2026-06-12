#!/usr/bin/env python3
"""Event-level (deduplicated) calibration report for the NO-bias signal.

The calibration JSONL holds hourly snapshots, so row counts wildly overstate
the evidence. This report collapses to one observation per market:

- entry = the FIRST snapshot per market (or first gate-pass snapshot for the
  gate cohort), priced as buy-NO at the ask (1 - pm_best_bid)
- outcome = resolved_outcome stamped by backfill_calibration_outcomes.py
  (real UMA resolutions only; unresolved markets are excluded from win rates)

Outputs a console summary and relative-value/calibration/event_report.md,
including progress toward the 200-resolved-event bar required before the
NO-bias gate can be considered for live promotion.
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
CALIBRATION_PATH = REPO_ROOT / "relative-value" / "calibration" / "no_bias_candidates.jsonl"
REPORT_PATH = REPO_ROOT / "relative-value" / "calibration" / "event_report.md"
RESOLVED_EVENT_TARGET = 200

GAP_BINS = [(-999, 0), (0, 4), (4, 8), (8, 12), (12, 999)]


def load_markets(path: Path) -> Dict[str, List[Dict[str, Any]]]:
    markets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            market_id = str(row.get("market_id", ""))
            if market_id:
                markets[market_id].append(row)
    for rows in markets.values():
        rows.sort(key=lambda row: str(row.get("timestamp", "")))
    return markets


def no_entry_price(row: Dict[str, Any]) -> Optional[float]:
    yes_bid = row.get("pm_best_bid")
    if yes_bid is None:
        return None
    entry = 1.0 - float(yes_bid)
    if entry <= 0.0 or entry >= 1.0:
        return None
    return entry


def buy_no_return(entry: float, outcome: str) -> float:
    return (1.0 - entry) / entry if outcome == "NO" else -1.0


def gap_bin_label(gap: Optional[float]) -> str:
    if gap is None:
        return "n/a"
    for lo, hi in GAP_BINS:
        if lo <= gap < hi:
            lo_s = "<0" if lo == -999 else str(lo)
            return f"{lo_s}-{hi}" if hi != 999 else f">={lo}"
    return "n/a"


def summarize(events: List[Tuple[float, str, Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """events: list of (entry_price, outcome, entry_row)."""
    if not events:
        return None
    returns = [buy_no_return(entry, outcome) for entry, outcome, _ in events]
    wins = sum(1 for _, outcome, _ in events if outcome == "NO")
    return {
        "n": len(events),
        "win_rate": wins / len(events),
        "avg_return": statistics.mean(returns),
        "total_return": sum(returns),
        "median_entry": statistics.median(entry for entry, _, _ in events),
    }


def fmt(stats: Optional[Dict[str, Any]]) -> str:
    if stats is None:
        return "n=0"
    return (f"n={stats['n']:3d} | NO-win {100*stats['win_rate']:5.1f}% | "
            f"avg {100*stats['avg_return']:+7.2f}% | total {100*stats['total_return']:+8.1f}% | "
            f"median NO entry {stats['median_entry']:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Event-level calibration report (deduplicated, resolution-labeled).")
    parser.add_argument("--calibration-jsonl", type=Path, default=CALIBRATION_PATH)
    parser.add_argument("--report-md", type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    markets = load_markets(args.calibration_jsonl)
    total_rows = sum(len(rows) for rows in markets.values())

    resolved_events: List[Tuple[float, str, Dict[str, Any]]] = []
    gate_events: List[Tuple[float, str, Dict[str, Any]]] = []
    gate_open = 0
    unresolved = 0
    for rows in markets.values():
        outcome = next((str(r["resolved_outcome"]) for r in rows if r.get("resolved_outcome") in ("YES", "NO")), None)
        first = rows[0]
        first_pass = next((r for r in rows if r.get("candidate_passed")), None)
        if outcome is None:
            unresolved += 1
            if first_pass is not None:
                gate_open += 1
            continue
        entry = no_entry_price(first)
        if entry is not None:
            resolved_events.append((entry, outcome, first))
        if first_pass is not None:
            gate_entry = no_entry_price(first_pass)
            if gate_entry is not None:
                gate_events.append((gate_entry, outcome, first_pass))

    lines: List[str] = []
    lines.append("# NO-bias calibration: event-level report")
    lines.append("")
    lines.append(f"- Rows in log: {total_rows} | unique markets: {len(markets)}")
    lines.append(f"- Resolved markets (real UMA labels): {len(resolved_events)} usable, {unresolved} still open")
    lines.append(f"- Gate-passed markets: resolved {len(gate_events)}, still open {gate_open}")
    lines.append("")
    lines.append(f"## Promotion bar: {len(gate_events)} / {RESOLVED_EVENT_TARGET} resolved gate-passed events")
    pct = 100 * len(gate_events) / RESOLVED_EVENT_TARGET
    lines.append(f"Progress: {pct:.1f}%. NO-bias stays shadow-only until the bar is met "
                 f"with positive expectancy.")
    lines.append("")
    lines.append("## Headline cohorts (buy NO at first qualifying snapshot)")
    lines.append("```")
    lines.append(f"all resolved markets:    {fmt(summarize(resolved_events))}")
    lines.append(f"gate-passed (resolved):  {fmt(summarize(gate_events))}")
    lines.append("```")

    def bucket_section(title: str, key_fn) -> None:
        groups: Dict[str, List[Tuple[float, str, Dict[str, Any]]]] = defaultdict(list)
        for event in resolved_events:
            groups[key_fn(event[2])].append(event)
        lines.append("")
        lines.append(f"## {title}")
        lines.append("```")
        for label in sorted(groups, key=lambda k: -len(groups[k])):
            lines.append(f"{label:<22s} {fmt(summarize(groups[label]))}")
        lines.append("```")

    bucket_section("By asset", lambda r: str(r.get("asset", "?")))
    bucket_section("By adjusted gap bin (at entry)", lambda r: gap_bin_label(r.get("adjusted_no_gap_pts")))
    bucket_section("By moneyness bucket", lambda r: str(r.get("moneyness_bucket") or "?"))
    bucket_section("By DTE bucket", lambda r: str(r.get("dte_bucket") or "?"))
    bucket_section("By contract type / direction", lambda r: f"{r.get('contract_type','?')}/{r.get('direction','?')}")

    lines.append("")
    lines.append("## Reading guide")
    lines.append("- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.")
    lines.append("- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.")
    lines.append("- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.")

    report = "\n".join(lines) + "\n"
    args.report_md.parent.mkdir(parents=True, exist_ok=True)
    args.report_md.write_text(report, encoding="utf-8")
    print(report)
    print(f"Wrote {args.report_md}")


if __name__ == "__main__":
    main()
