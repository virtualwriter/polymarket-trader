#!/usr/bin/env python3
"""Quick exit-policy comparison for Agent B Attack 7.

For each (asset, signal_type) pair, simulate two exit policies starting from
the production entry threshold T=15 with 24h dedup:

  policy A: current production fixed-hold target/stop
            (FE_LONG: target=5, stop=2.5, hold=72h;
             FE_SHORT: target=4, stop=2.5, hold=72h)
  policy B: hold-to-funding-zero — close when |funding_ann_pct| reverts to <=5
            with a hard cap at 168h to prevent runaway holds.

Reuses the loader and accrual helpers from funding_extreme_sweep_backtest.py
to avoid drift in funding-sign convention.
"""

from __future__ import annotations

import csv
import statistics
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

# Reuse exact helpers from A's sweep so the comparison stays apples-to-apples.
from funding_extreme_sweep_backtest import (  # type: ignore  # noqa: E402
    ASSETS,
    Point,
    candidate_indices,
    dedup_indices,
    funding_accrual_pct,
    market_pnl_pct,
    merge_series,
    read_compact_csv,
    read_daily_csv,
    signal_direction,
)


COMPACT = ROOT / "analysis" / "funding-rules" / "vps_instrument_snapshots_compact.csv"
DAILY = ROOT / "data" / "daily-valuations.csv"
OUTPUT = ROOT / "analysis" / "funding-rules" / "agent_b_funding_zero_revert.md"

THRESHOLD = 15
REVERT_BAND = 5.0
HARD_CAP_HOURS = 168
PROD_HOLD_HOURS = 72
PROD_STOP_PCT = 2.5
PROD_TARGET = {"FUNDING_EXTREME_LONG": 5.0, "FUNDING_EXTREME_SHORT": 4.0}


def simulate_fixed_hold(points, idx, signal_type, target_pct, stop_pct, hold_hours):
    entry = points[idx]
    direction = signal_direction(signal_type)
    horizon = entry.ts + timedelta(hours=hold_hours)
    exit_idx = None
    close_reason = "hold"
    for i in range(idx + 1, len(points)):
        if points[i].ts > horizon:
            break
        market = market_pnl_pct(entry.mark_px, points[i].mark_px, direction)
        funding = funding_accrual_pct(points, idx, i, direction)
        total = market + funding
        if total >= target_pct:
            exit_idx = i
            close_reason = "target"
            break
        if total <= -stop_pct:
            exit_idx = i
            close_reason = "stop"
            break
    if exit_idx is None:
        eligible = [i for i in range(idx + 1, len(points)) if points[i].ts <= horizon]
        if not eligible:
            return None
        exit_idx = eligible[-1]
    market = market_pnl_pct(entry.mark_px, points[exit_idx].mark_px, direction)
    funding = funding_accrual_pct(points, idx, exit_idx, direction)
    return market + funding, close_reason


def simulate_funding_zero(points, idx, signal_type, hard_cap_hours, revert_band):
    entry = points[idx]
    direction = signal_direction(signal_type)
    horizon = entry.ts + timedelta(hours=hard_cap_hours)
    exit_idx = None
    close_reason = "cap"
    for i in range(idx + 1, len(points)):
        if points[i].ts > horizon:
            break
        if abs(points[i].funding_ann_pct) <= revert_band:
            exit_idx = i
            close_reason = "revert"
            break
    if exit_idx is None:
        eligible = [i for i in range(idx + 1, len(points)) if points[i].ts <= horizon]
        if not eligible:
            return None
        exit_idx = eligible[-1]
    market = market_pnl_pct(entry.mark_px, points[exit_idx].mark_px, direction)
    funding = funding_accrual_pct(points, idx, exit_idx, direction)
    return market + funding, close_reason


def summarize(label, results):
    if not results:
        return f"  {label}: no trades"
    pnls = [r[0] for r in results]
    wins = sum(1 for p in pnls if p > 0)
    avg = statistics.mean(pnls)
    med = statistics.median(pnls)
    std = statistics.pstdev(pnls) if len(pnls) > 1 else 0.0
    sharpe = avg / std if std else float("nan")
    return (f"  {label}: n={len(pnls):>3}  wr={wins/len(pnls):.0%}  "
            f"avg={avg:+.2f}%  med={med:+.2f}%  sharpe={sharpe:+.2f}")


def main():
    primary = read_compact_csv(COMPACT) if COMPACT.exists() else {a: [] for a in ASSETS}
    fallback = read_daily_csv(DAILY) if DAILY.exists() else {a: [] for a in ASSETS}
    series = merge_series(primary, fallback)

    lines = [
        "# Hold-to-funding-zero vs production fixed-hold (Agent B / Attack 7)",
        "",
        f"Threshold T=±{THRESHOLD} (production), 24h dedup, hard cap {HARD_CAP_HOURS}h.",
        f"Funding-zero revert band |funding_ann_pct| <= {REVERT_BAND}.",
        f"Production fixed-hold uses hold={PROD_HOLD_HOURS}h, stop={PROD_STOP_PCT}, target=5/4.",
        "",
        "Source: VPS compact merged with daily-valuations fallback.",
        "",
        "| Asset | Signal | n | Prod fixed-hold avg | Prod wr | Funding-zero avg | Fund-zero wr | Δ avg |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]

    raw_summary = []
    for asset in ASSETS:
        pts = series.get(asset, [])
        if len(pts) < 2:
            continue
        for sig in ("FUNDING_EXTREME_LONG", "FUNDING_EXTREME_SHORT"):
            indices = dedup_indices(pts, candidate_indices(pts, sig, THRESHOLD))
            if not indices:
                continue
            tgt = PROD_TARGET[sig]
            fixed_results = [r for r in (simulate_fixed_hold(pts, i, sig, tgt, PROD_STOP_PCT, PROD_HOLD_HOURS) for i in indices) if r]
            zero_results = [r for r in (simulate_funding_zero(pts, i, sig, HARD_CAP_HOURS, REVERT_BAND) for i in indices) if r]
            if not fixed_results or not zero_results:
                continue
            f_avg = statistics.mean(r[0] for r in fixed_results)
            z_avg = statistics.mean(r[0] for r in zero_results)
            f_wr = sum(1 for r in fixed_results if r[0] > 0) / len(fixed_results)
            z_wr = sum(1 for r in zero_results if r[0] > 0) / len(zero_results)
            lines.append(
                f"| {asset} | {sig} | {len(fixed_results)} | "
                f"{f_avg:+.2f}% | {f_wr:.0%} | {z_avg:+.2f}% | {z_wr:.0%} | "
                f"{z_avg - f_avg:+.2f}% |"
            )
            raw_summary.append((asset, sig, len(fixed_results), f_avg, f_wr, z_avg, z_wr))

    lines.extend([
        "",
        "## Aggregated by side (trade-weighted)",
        "",
        "| Signal | Trades | Prod avg | Funding-zero avg | Δ |",
        "|---|---:|---:|---:|---:|",
    ])
    for sig in ("FUNDING_EXTREME_LONG", "FUNDING_EXTREME_SHORT"):
        rows_sig = [r for r in raw_summary if r[1] == sig]
        if not rows_sig:
            continue
        n = sum(r[2] for r in rows_sig)
        f_avg = sum(r[3] * r[2] for r in rows_sig) / n
        z_avg = sum(r[5] * r[2] for r in rows_sig) / n
        lines.append(f"| {sig} | {n} | {f_avg:+.2f}% | {z_avg:+.2f}% | {z_avg - f_avg:+.2f}% |")

    lines.append("")
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
