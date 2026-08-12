"""Measure how fast a relative-value edge closes, from archived hourly snapshots.

The Monte Carlo in simulate_binary_ladder_ev.py shows that the cost of the
ladder's price stop is governed almost entirely by one number: how much edge is
still on the table when the stop fires. That in turn depends on how quickly the
quoted edge decays after it appears. Sweeping the parameter was the placeholder;
this measures it.

Anchors are the first hour a market is observed rich enough to trade, and the
edge is then followed forward in wall-clock hours and in fraction of remaining
contract life, since the simulation works in the latter.
"""

from __future__ import annotations

import argparse
import csv
import math
from bisect import bisect_left
from collections import defaultdict
from pathlib import Path

Observation = tuple[float, float, float]  # (hours since epoch, edge pts, dte days)

HORIZONS_HOURS = [1, 3, 6, 12, 24, 48, 72, 120, 168]
LIFE_FRACTIONS = [0.02, 0.05, 0.10, 0.20, 0.35, 0.50, 0.75]


def parse_hours(name: str) -> float | None:
    """Hours since epoch from a `YYYY-MM-DDTHHMMSSZ-...` snapshot filename."""
    stamp = name.split("-cross_venue")[0]
    try:
        date_part, time_part = stamp.split("T")
        y, m, d = (int(v) for v in date_part.split("-"))
        hh = int(time_part[0:2])
        days = (
            367 * y - (7 * (y + (m + 9) // 12)) // 4 + (275 * m) // 9 + d - 730531
        )
        return days * 24 + hh
    except (ValueError, IndexError):
        return None


def num(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def load(history_dir: Path) -> dict[str, list[Observation]]:
    series: dict[str, list[Observation]] = defaultdict(list)
    files = sorted(history_dir.glob("*/*cross_venue_relative_value.csv"))
    for path in files:
        hours = parse_hours(path.name)
        if hours is None:
            continue
        with path.open(newline="") as handle:
            for row in csv.DictReader(handle):
                market = row.get("market_id") or ""
                edge = num(row.get("sell_yes_edge_pts"))
                dte = num(row.get("dte_days"))
                if not market or edge is None:
                    continue
                series[market].append((hours, edge, dte if dte is not None else float("nan")))
    for obs in series.values():
        obs.sort()
    print(f"loaded {len(files)} snapshots covering {len(series)} markets")
    return series


def value_at(obs: list[Observation], target_hours: float, tolerance: float) -> float | None:
    """Edge at the observation nearest `target_hours`, if one is close enough."""
    idx = bisect_left(obs, (target_hours, -math.inf, -math.inf))
    best: tuple[float, float] | None = None
    for j in (idx - 1, idx, idx + 1):
        if 0 <= j < len(obs):
            gap = abs(obs[j][0] - target_hours)
            if best is None or gap < best[0]:
                best = (gap, obs[j][1])
    if best is None or best[0] > tolerance:
        return None
    return best[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--history-dir", default="/var/lib/polymarket-trader/relative-value-history"
    )
    parser.add_argument("--min-edge", type=float, default=3.0)
    args = parser.parse_args()

    series = load(Path(args.history_dir))

    anchors: list[tuple[list[Observation], int, float, float]] = []
    for obs in series.values():
        for i, (_, edge, dte) in enumerate(obs):
            if edge >= args.min_edge:
                anchors.append((obs, i, edge, dte))
                break
    print(f"anchors (first hour at >= {args.min_edge}pt sell-YES edge): {len(anchors)}\n")

    print("=== decay in wall-clock hours ===")
    print("%8s %8s %12s %12s %12s %12s" % ("horizon", "n", "mean e0", "mean e_t", "retained", "flipped<0"))
    for h in HORIZONS_HOURS:
        e0s: list[float] = []
        ets: list[float] = []
        for obs, i, e0, _ in anchors:
            et = value_at(obs, obs[i][0] + h, tolerance=1.5)
            if et is None:
                continue
            e0s.append(e0)
            ets.append(et)
        if len(e0s) < 30:
            continue
        mean_e0 = sum(e0s) / len(e0s)
        mean_et = sum(ets) / len(ets)
        flipped = sum(1 for e in ets if e < 0) / len(ets)
        print(
            "%7dh %8d %12.2f %12.2f %11.0f%% %11.0f%%"
            % (h, len(e0s), mean_e0, mean_et, 100 * mean_et / mean_e0, 100 * flipped)
        )

    print("\n=== decay in fraction of remaining contract life ===")
    print("%10s %8s %12s %12s %12s" % ("fraction", "n", "mean e0", "mean e_t", "retained"))
    half_life_estimate: float | None = None
    for frac in LIFE_FRACTIONS:
        e0s, ets = [], []
        for obs, i, e0, dte in anchors:
            if not math.isfinite(dte) or dte <= 0:
                continue
            et = value_at(obs, obs[i][0] + frac * dte * 24, tolerance=1.5)
            if et is None:
                continue
            e0s.append(e0)
            ets.append(et)
        if len(e0s) < 30:
            continue
        retained = (sum(ets) / len(ets)) / (sum(e0s) / len(e0s))
        if half_life_estimate is None and retained > 0:
            half_life_estimate = -frac / math.log(retained) if retained < 1 else None
        print(
            "%9.0f%% %8d %12.2f %12.2f %11.0f%%"
            % (100 * frac, len(e0s), sum(e0s) / len(e0s), sum(ets) / len(ets), 100 * retained)
        )

    if half_life_estimate:
        print(
            f"\nimplied exponential half-life parameter (fraction of contract life): "
            f"{half_life_estimate:.3f}"
        )


if __name__ == "__main__":
    main()
