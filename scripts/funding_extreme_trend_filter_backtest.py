#!/usr/bin/env python3
"""
Stratify FUNDING_EXTREME_* backtests by the live trend-blocking filter to
quantify the shadow-vs-live alpha gap the LLM keeps surfacing.

The live trader rejects short signals (FUNDING_EXTREME_LONG fires shorts) when:
    aboveTrendPct >= contrarianTrendMarginPct (default 0.5)
    AND momentumPct >= positiveMomentum24hPct  (default 1.5)
with a 24h lookback window (see scripts/trading-engine.ts:isShortSignalBlockedByTrend).

This script replays funding-extreme entries from hourly data and stratifies
results into three buckets PER (asset, signal_type, threshold, target, stop, hold):
  - filter_off     : every funding-extreme trigger taken
  - filter_default : only entries the live filter would have allowed
  - filter_blocked : only entries the live filter would have blocked (the "shadow" universe)

Compare avg PnL across buckets to answer: "Is the trend filter capturing the
losers (working as designed) or rejecting trades that would have made money
(too aggressive)?"

Output:
  - CSV: per-cell rollup with mode counts and PnL stats
  - Markdown: top-level summary highlighting filter_blocked alpha by asset/signal

Usage:
  python scripts/funding_extreme_trend_filter_backtest.py
  python scripts/funding_extreme_trend_filter_backtest.py --daily data/daily-valuations.csv
"""

from __future__ import annotations

import argparse
import csv
import math
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DAILY_INPUT = ROOT / "data" / "daily-valuations.csv"
DEFAULT_RESULTS = ROOT / "analysis" / "funding-rules" / "funding_trend_filter_results.csv"
DEFAULT_SUMMARY = ROOT / "analysis" / "funding-rules" / "funding_trend_filter_summary.md"

ASSETS = ["BTC", "OIL", "HYPE", "GOLD", "AMZN"]
# Smaller param grid than the full sweep — we mostly want to compare the three
# filter modes at the live trader's actual entry threshold (>15) and a couple
# of adjacent thresholds, with target/stop pairs that match the live defaults.
THRESHOLDS = [10, 15, 20, 30, 50]
HOLDS_HOURS = [24, 48, 72]
# (target_pct, stop_pct) — match the live FUNDING_EXTREME_LONG defaults plus
# a few alternatives to make sure conclusions aren't pinned to one shape.
TARGET_STOP_PAIRS: List[Tuple[float, float]] = [
    (3.0, 2.0),
    (4.0, 2.5),
    (5.0, 2.5),   # current FUNDING_EXTREME_LONG default
    (6.0, 3.0),
]
COOLDOWN = timedelta(hours=24)
LOOKBACK_HOURS = 24
DEFAULT_CONTRARIAN_TREND_MARGIN = 0.5
DEFAULT_POSITIVE_MOMENTUM = 1.5
TRAJECTORY_WINDOW_HOURS = 12


DAILY_COLUMNS = {
    "BTC": ("btc_spot", "btc_hl_funding_ann"),
    "HYPE": ("hype_spot", "hype_hl_funding_ann"),
    "GOLD": ("gold_gc_spot", "gold_hl_funding_ann"),
    # AMZN spot is the stock; the live engine uses amzn_hl_perp as the venue
    # mark for funding trades. Falls back to stock if perp column is missing.
    "AMZN": ("amzn_hl_perp", "amzn_hl_funding_ann"),
    "OIL": ("oil_wti_spot", "oil_hl_funding_ann"),
}


# Per-asset hard blocks that mirror fundingSignalAllowed() in trading-engine.ts.
HARD_BLOCKED_PAIRS: Dict[Tuple[str, str], str] = {
    ("FUNDING_EXTREME_LONG", "OIL"): "fundingSignalAllowed hardcodes OIL out of FUNDING_EXTREME_LONG",
    ("FUNDING_EXTREME_SHORT", "HYPE"): "fundingSignalAllowed hardcodes HYPE out of FUNDING_EXTREME_SHORT",
}


@dataclass(frozen=True)
class Point:
    ts: datetime
    asset: str
    mark_px: float
    funding_ann_pct: float


@dataclass(frozen=True)
class TradeResult:
    asset: str
    signal_type: str
    threshold: float
    target_pct: float
    stop_pct: float
    hold_hours: int
    entry_time: datetime
    exit_time: datetime
    close_reason: str
    entry_price: float
    exit_price: float
    entry_funding_ann_pct: float
    market_pnl_pct: float
    funding_pnl_pct: float
    total_pnl_pct: float
    above_trend_pct: Optional[float]
    momentum_pct: Optional[float]
    filter_mode: str  # "filter_off" | "filter_default" | "filter_blocked"


def safe_float(value: object) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
        if not math.isfinite(parsed):
            return None
        return parsed
    except (TypeError, ValueError):
        return None


def parse_time(value: object) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def fmt_time(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def read_daily_csv(path: Path) -> Dict[str, List[Point]]:
    series: Dict[str, List[Point]] = {asset: [] for asset in ASSETS}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            ts = parse_time(row.get("date"))
            if not ts:
                continue
            for asset, (price_col, funding_col) in DAILY_COLUMNS.items():
                mark = safe_float(row.get(price_col))
                funding = safe_float(row.get(funding_col))
                if mark is None or funding is None or mark <= 0:
                    continue
                series[asset].append(Point(ts, asset, mark, funding))
    return {asset: sorted(points, key=lambda p: p.ts) for asset, points in series.items()}


# ─── Trend metrics, replicated from scripts/trading-engine.ts ────────────────

def trend_metrics(points: List[Point], idx: int, lookback_hours: int = LOOKBACK_HOURS) -> Optional[Dict[str, float]]:
    if idx <= 0:
        return None
    cutoff = points[idx].ts - timedelta(hours=lookback_hours)
    window = [p for p in points[: idx + 1] if p.ts >= cutoff]
    if len(window) < 2:
        return None
    current = points[idx].mark_px
    lookback_price = window[0].mark_px
    if lookback_price <= 0:
        return None
    sma = sum(p.mark_px for p in window) / len(window)
    if sma <= 0:
        return None
    return {
        "current": current,
        "lookback": lookback_price,
        "sma": sma,
        "above_trend_pct": ((current - sma) / sma) * 100.0,
        "momentum_pct": ((current - lookback_price) / lookback_price) * 100.0,
    }


def short_blocked_by_trend(
    metrics: Optional[Dict[str, float]],
    contrarian_trend_margin: float = DEFAULT_CONTRARIAN_TREND_MARGIN,
    positive_momentum: float = DEFAULT_POSITIVE_MOMENTUM,
) -> bool:
    """Returns True iff the live engine would block this short via isShortSignalBlockedByTrend()."""
    if metrics is None:
        return False
    return (
        metrics["above_trend_pct"] >= contrarian_trend_margin
        and metrics["momentum_pct"] >= positive_momentum
    )


def is_funding_signal_blocked(signal_type: str, asset: str) -> bool:
    return (signal_type, asset) in HARD_BLOCKED_PAIRS


# ─── Trade simulation (mirrors funding_extreme_sweep_backtest.py) ────────────

def signal_direction(signal_type: str) -> str:
    return "short" if signal_type == "FUNDING_EXTREME_LONG" else "long"


def market_pnl_pct(entry_price: float, current_price: float, direction: str) -> float:
    if direction == "long":
        return (current_price / entry_price - 1.0) * 100.0
    return (entry_price / current_price - 1.0) * 100.0


def funding_accrual_pct(points: List[Point], start_idx: int, end_idx: int, direction: str) -> float:
    accrual = 0.0
    sign = 1.0 if direction == "short" else -1.0
    for i in range(start_idx, end_idx):
        hours = (points[i + 1].ts - points[i].ts).total_seconds() / 3600.0
        if hours <= 0:
            continue
        accrual += sign * points[i].funding_ann_pct * hours / (365.0 * 24.0)
    return accrual


def candidate_indices(points: List[Point], signal_type: str, threshold: float) -> List[int]:
    out: List[int] = []
    for i, point in enumerate(points):
        if signal_type == "FUNDING_EXTREME_LONG" and point.funding_ann_pct > threshold:
            out.append(i)
        elif signal_type == "FUNDING_EXTREME_SHORT" and point.funding_ann_pct < -threshold:
            out.append(i)
    return out


def dedup_indices(points: List[Point], indices: Iterable[int]) -> List[int]:
    out: List[int] = []
    last_entry: Optional[datetime] = None
    for idx in indices:
        if last_entry is None or points[idx].ts - last_entry >= COOLDOWN:
            out.append(idx)
            last_entry = points[idx].ts
    return out


def simulate_trade(
    points: List[Point],
    entry_idx: int,
    signal_type: str,
    threshold: float,
    target_pct: float,
    stop_pct: float,
    hold_hours: int,
    filter_mode: str,
    metrics: Optional[Dict[str, float]],
) -> Optional[TradeResult]:
    entry = points[entry_idx]
    direction = signal_direction(signal_type)
    horizon = entry.ts + timedelta(hours=hold_hours)
    exit_idx: Optional[int] = None
    close_reason = "hold"

    for i in range(entry_idx + 1, len(points)):
        point = points[i]
        if point.ts > horizon:
            break
        market = market_pnl_pct(entry.mark_px, point.mark_px, direction)
        funding = funding_accrual_pct(points, entry_idx, i, direction)
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
        eligible = [i for i in range(entry_idx + 1, len(points)) if points[i].ts <= horizon]
        if not eligible:
            return None
        exit_idx = eligible[-1]

    exit_point = points[exit_idx]
    market = market_pnl_pct(entry.mark_px, exit_point.mark_px, direction)
    funding = funding_accrual_pct(points, entry_idx, exit_idx, direction)
    return TradeResult(
        asset=entry.asset,
        signal_type=signal_type,
        threshold=threshold,
        target_pct=target_pct,
        stop_pct=stop_pct,
        hold_hours=hold_hours,
        entry_time=entry.ts,
        exit_time=exit_point.ts,
        close_reason=close_reason,
        entry_price=entry.mark_px,
        exit_price=exit_point.mark_px,
        entry_funding_ann_pct=entry.funding_ann_pct,
        market_pnl_pct=market,
        funding_pnl_pct=funding,
        total_pnl_pct=market + funding,
        above_trend_pct=metrics.get("above_trend_pct") if metrics else None,
        momentum_pct=metrics.get("momentum_pct") if metrics else None,
        filter_mode=filter_mode,
    )


# ─── Stratification ───────────────────────────────────────────────────────────

def classify_entries(points: List[Point], signal_type: str, indices: List[int]) -> Dict[str, List[Tuple[int, Optional[Dict[str, float]]]]]:
    """Bucket each entry index into filter_default vs filter_blocked.

    FUNDING_EXTREME_LONG fires shorts → the trend filter actually engages.
    FUNDING_EXTREME_SHORT fires longs → the trend filter does not engage in
    the live engine. We still compute trend metrics so the CSV is consistent,
    but the "filter_blocked" bucket will be empty for FUNDING_EXTREME_SHORT,
    matching live behavior.
    """
    direction = signal_direction(signal_type)
    buckets: Dict[str, List[Tuple[int, Optional[Dict[str, float]]]]] = {
        "filter_default": [],
        "filter_blocked": [],
    }
    for idx in indices:
        metrics = trend_metrics(points, idx)
        is_blocked = direction == "short" and short_blocked_by_trend(metrics)
        bucket = "filter_blocked" if is_blocked else "filter_default"
        buckets[bucket].append((idx, metrics))
    return buckets


def max_drawdown(values: List[float]) -> float:
    peak = 0.0
    equity = 0.0
    worst = 0.0
    for value in values:
        equity += value
        peak = max(peak, equity)
        worst = min(worst, equity - peak)
    return worst


def metric_row(
    asset: str,
    signal_type: str,
    threshold: float,
    target_pct: float,
    stop_pct: float,
    hold_hours: int,
    filter_mode: str,
    raw_hits: int,
    trades: List[TradeResult],
) -> Dict[str, object]:
    totals = [t.total_pnl_pct for t in trades]
    markets = [t.market_pnl_pct for t in trades]
    funding = [t.funding_pnl_pct for t in trades]
    wins = [v for v in totals if v > 0]
    stdev = statistics.pstdev(totals) if len(totals) > 1 else 0.0
    return {
        "asset": asset,
        "signal_type": signal_type,
        "filter_mode": filter_mode,
        "threshold": threshold,
        "target_pct": target_pct,
        "stop_pct": stop_pct,
        "hold_hours": hold_hours,
        "raw_hits": raw_hits,
        "dedup_trades": len(trades),
        "win_rate": (len(wins) / len(trades)) if trades else "",
        "avg_market_pnl_pct": statistics.mean(markets) if markets else "",
        "avg_funding_pnl_pct": statistics.mean(funding) if funding else "",
        "avg_total_pnl_pct": statistics.mean(totals) if totals else "",
        "median_total_pnl_pct": statistics.median(totals) if totals else "",
        "max_drawdown_pct": max_drawdown(totals) if totals else "",
        "sharpe_like": (statistics.mean(totals) / stdev) if stdev else "",
        "hard_blocked": "yes" if is_funding_signal_blocked(signal_type, asset) else "no",
    }


def sweep(series: Dict[str, List[Point]]) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for asset, points in series.items():
        if len(points) < 2:
            continue
        for signal_type in ["FUNDING_EXTREME_LONG", "FUNDING_EXTREME_SHORT"]:
            for threshold in THRESHOLDS:
                raw = candidate_indices(points, signal_type, threshold)
                deduped = dedup_indices(points, raw)
                bucketed = classify_entries(points, signal_type, deduped)
                # Build the three filter-mode universes.
                universes: Dict[str, List[Tuple[int, Optional[Dict[str, float]]]]] = {
                    "filter_off": [(idx, trend_metrics(points, idx)) for idx in deduped],
                    "filter_default": bucketed["filter_default"],
                    "filter_blocked": bucketed["filter_blocked"],
                }
                for hold_hours in HOLDS_HOURS:
                    for target_pct, stop_pct in TARGET_STOP_PAIRS:
                        for mode, entries in universes.items():
                            trades: List[TradeResult] = []
                            for idx, metrics in entries:
                                trade = simulate_trade(
                                    points, idx, signal_type, threshold, target_pct, stop_pct, hold_hours, mode, metrics,
                                )
                                if trade is not None:
                                    trades.append(trade)
                            rows.append(
                                metric_row(
                                    asset, signal_type, threshold, target_pct, stop_pct,
                                    hold_hours, mode, len(entries), trades,
                                )
                            )
    return rows


FIELDNAMES = [
    "asset",
    "signal_type",
    "filter_mode",
    "threshold",
    "target_pct",
    "stop_pct",
    "hold_hours",
    "raw_hits",
    "dedup_trades",
    "win_rate",
    "avg_market_pnl_pct",
    "avg_funding_pnl_pct",
    "avg_total_pnl_pct",
    "median_total_pnl_pct",
    "max_drawdown_pct",
    "sharpe_like",
    "hard_blocked",
]


def write_results(path: Path, rows: List[Dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def as_float(value: object) -> Optional[float]:
    if value == "" or value is None:
        return None
    return safe_float(value)


def filter_delta_summary(rows: List[Dict[str, object]]) -> List[Tuple[str, str, float, float, int, int]]:
    """For each (asset, signal_type, threshold, target, stop, hold), compute the
    avg-PnL delta between filter_blocked and filter_default to see whether
    blocking the trades was profitable (delta < 0) or costly (delta > 0).

    Returns rows sorted by absolute delta, with sample counts so we can
    weed out noise from sparse buckets.
    """
    keyed: Dict[Tuple, Dict[str, Dict[str, object]]] = {}
    for row in rows:
        if row["signal_type"] != "FUNDING_EXTREME_LONG":
            continue  # Only the LONG family triggers a short and engages the filter
        key = (
            row["asset"],
            row["signal_type"],
            row["threshold"],
            row["target_pct"],
            row["stop_pct"],
            row["hold_hours"],
        )
        keyed.setdefault(key, {})[str(row["filter_mode"])] = row

    out: List[Tuple[str, str, float, float, int, int]] = []
    for key, modes in keyed.items():
        default_row = modes.get("filter_default")
        blocked_row = modes.get("filter_blocked")
        if not default_row or not blocked_row:
            continue
        d_avg = as_float(default_row.get("avg_total_pnl_pct"))
        b_avg = as_float(blocked_row.get("avg_total_pnl_pct"))
        if d_avg is None or b_avg is None:
            continue
        d_n = int(default_row.get("dedup_trades", 0) or 0)
        b_n = int(blocked_row.get("dedup_trades", 0) or 0)
        if d_n < 3 or b_n < 3:
            continue
        delta = b_avg - d_avg
        label = (
            f"{key[0]} {key[1]} thr>{key[2]} t={key[3]} s={key[4]} hold={key[5]}h"
        )
        out.append((label, f"{delta:+.2f}", b_avg, d_avg, b_n, d_n))
    return sorted(out, key=lambda row: abs(float(row[1])), reverse=True)


def data_window(series: Dict[str, List[Point]]) -> List[str]:
    lines = []
    for asset in ASSETS:
        points = series.get(asset, [])
        if not points:
            lines.append(f"- {asset}: no data")
            continue
        lines.append(f"- {asset}: {len(points)} points, {fmt_time(points[0].ts)} to {fmt_time(points[-1].ts)}")
    return lines


def write_summary(path: Path, rows: List[Dict[str, object]], series: Dict[str, List[Point]], source_note: str) -> None:
    lines: List[str] = []
    lines.append("# Funding Extreme — Trend-Filter Stratification")
    lines.append("")
    lines.append(f"Source: {source_note}")
    lines.append("")
    lines.append("## Data window")
    lines.extend(data_window(series))
    lines.append("")
    lines.append("## What this measures")
    lines.append("")
    lines.append(
        "The live trader rejects FUNDING_EXTREME_LONG (short) signals when the "
        "asset has been trending up (above 24h SMA by >0.5% AND 24h momentum >+1.5%). "
        "This script replays the same funding triggers and partitions trades into:"
    )
    lines.append("")
    lines.append("- `filter_off` — every funding-extreme trigger taken")
    lines.append("- `filter_default` — only entries the live filter would have allowed (matches what hit the live ledger)")
    lines.append(
        "- `filter_blocked` — only entries the live filter *would have blocked*, the shadow universe the LLM keeps referencing"
    )
    lines.append("")
    lines.append(
        "The interesting delta is `filter_blocked - filter_default`. Negative → the "
        "filter is catching losers (working as designed). Positive → the filter is "
        "rejecting trades that would have made money (too aggressive)."
    )
    lines.append("")

    # Asset-level rollup at the live default thresholds.
    lines.append("## FUNDING_EXTREME_LONG asset-level rollup (live defaults: threshold>15, target=5, stop=2.5, hold=72h)")
    lines.append("")
    lines.append("| Asset | Mode | Trades | Win% | Avg PnL | Median | Max DD | Hard-blocked |")
    lines.append("|---|---|---:|---:|---:|---:|---:|:---:|")
    for row in rows:
        if (
            row["signal_type"] != "FUNDING_EXTREME_LONG"
            or row["threshold"] != 15
            or row["target_pct"] != 5.0
            or row["stop_pct"] != 2.5
            or row["hold_hours"] != 72
        ):
            continue
        trades = int(row["dedup_trades"]) if row["dedup_trades"] != "" else 0
        win = row["win_rate"]
        win_str = f"{float(win) * 100:.0f}%" if isinstance(win, (int, float)) else (
            f"{float(win) * 100:.0f}%" if win not in ("", None) else "—"
        )
        avg = row["avg_total_pnl_pct"]
        avg_str = f"{float(avg):+.2f}%" if isinstance(avg, (int, float)) else (
            f"{float(avg):+.2f}%" if avg not in ("", None) else "—"
        )
        med = row["median_total_pnl_pct"]
        med_str = f"{float(med):+.2f}%" if isinstance(med, (int, float)) else (
            f"{float(med):+.2f}%" if med not in ("", None) else "—"
        )
        dd = row["max_drawdown_pct"]
        dd_str = f"{float(dd):.2f}" if isinstance(dd, (int, float)) else (
            f"{float(dd):.2f}" if dd not in ("", None) else "—"
        )
        lines.append(
            f"| {row['asset']} | {row['filter_mode']} | {trades} | {win_str} | {avg_str} | {med_str} | {dd_str} | {row['hard_blocked']} |"
        )
    lines.append("")

    # Largest filter deltas across all params/assets.
    lines.append("## Largest filter_blocked vs filter_default deltas (n≥3 each side)")
    lines.append("")
    lines.append("Positive delta means the filter rejected profitable trades; negative means it caught losers.")
    lines.append("")
    lines.append("| Cell | Δ (blocked - default) | Blocked avg | Default avg | Blocked n | Default n |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    deltas = filter_delta_summary(rows)
    if not deltas:
        lines.append("| (no cells with ≥3 trades on each side) |  |  |  |  |  |")
    else:
        for label, delta_str, b_avg, d_avg, b_n, d_n in deltas[:15]:
            lines.append(
                f"| {label} | {delta_str}% | {b_avg:+.2f}% | {d_avg:+.2f}% | {b_n} | {d_n} |"
            )
    lines.append("")

    # Interpretive aside that anchors what counts as actionable.
    lines.append("## How to read this")
    lines.append("")
    lines.append("- If `filter_blocked` averages ≥ +0.50% across multiple assets at the live thresholds, the filter is too strict and loosening `contrarianTrendMarginPct` and/or `positiveMomentum24hPct` is justified.")
    lines.append("- If `filter_blocked` averages around 0% or negative, the filter is doing its job — keep it.")
    lines.append("- Sample sizes matter: a few hundred bps on n=3 is noise. Prefer cells with n≥10.")
    lines.append("- For FUNDING_EXTREME_SHORT the filter does not engage (longs aren't blocked), so the blocked bucket should be empty by construction.")
    lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Stratify FUNDING_EXTREME_* backtests by the live trend-blocking filter.")
    parser.add_argument("--daily", type=Path, default=DEFAULT_DAILY_INPUT, help=f"Hourly valuations CSV (default {DEFAULT_DAILY_INPUT})")
    parser.add_argument("--out-csv", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--out-summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()

    if not args.daily.exists():
        raise SystemExit(f"Daily valuations CSV not found: {args.daily}")
    series = read_daily_csv(args.daily)
    rows = sweep(series)
    write_results(args.out_csv, rows)
    write_summary(args.out_summary, rows, series, source_note=str(args.daily))
    print(f"Wrote {len(rows)} stratified rows -> {args.out_csv}")
    print(f"Summary -> {args.out_summary}")


if __name__ == "__main__":
    main()
