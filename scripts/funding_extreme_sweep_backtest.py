#!/usr/bin/env python3
"""
Sweep funding-extreme entry thresholds and risk shapes.

Inputs can be either:
  - compact CSV extracted from instrument-snapshots.jsonl with columns
    timestamp,asset,mark_px,funding_ann_pct
  - data/daily-valuations.csv from this repo.

The signal naming follows scripts/trading-engine.ts:
  FUNDING_EXTREME_LONG  => positive funding, enter perp short
  FUNDING_EXTREME_SHORT => negative funding, enter perp long
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_COMPACT_INPUT = ROOT / "analysis" / "funding-rules" / "vps_instrument_snapshots_compact.csv"
DEFAULT_DAILY_INPUT = ROOT / "data" / "daily-valuations.csv"
DEFAULT_RESULTS = ROOT / "analysis" / "funding-rules" / "funding_extreme_sweep_results.csv"
DEFAULT_SUMMARY = ROOT / "analysis" / "funding-rules" / "funding_extreme_sweep_summary.md"

ASSETS = ["BTC", "OIL", "HYPE", "GOLD", "AMZN"]
THRESHOLDS = [5, 8, 10, 12, 15, 18, 20, 25, 30, 40, 50]
HOLDS_HOURS = [12, 24, 48, 72, 168]
TARGETS = [3, 4, 5, 6, 8, 10]
STOPS = [1.5, 2.5, 4]
COOLDOWN = timedelta(hours=24)


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


def read_compact_csv(path: Path) -> Dict[str, List[Point]]:
    series: Dict[str, List[Point]] = {asset: [] for asset in ASSETS}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            asset = (row.get("asset") or "").upper()
            ts = parse_time(row.get("timestamp"))
            mark = safe_float(row.get("mark_px"))
            funding = safe_float(row.get("funding_ann_pct"))
            if asset in series and ts and mark and funding is not None:
                series[asset].append(Point(ts, asset, mark, funding))
    return {asset: sorted(points, key=lambda p: p.ts) for asset, points in series.items()}


def read_snapshot_jsonl(path: Path) -> Dict[str, List[Point]]:
    series: Dict[str, List[Point]] = {asset: [] for asset in ASSETS}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            obj = json.loads(line)
            ts = parse_time(obj.get("timestamp"))
            if not ts:
                continue
            for asset, quote in (obj.get("hyperliquid") or {}).items():
                if asset not in series or not isinstance(quote, dict):
                    continue
                mark = safe_float(quote.get("markPx"))
                funding = safe_float(quote.get("fundingAnnualized"))
                if mark and funding is not None:
                    series[asset].append(Point(ts, asset, mark, funding * 100.0))
    return {asset: sorted(points, key=lambda p: p.ts) for asset, points in series.items()}


DAILY_COLUMNS = {
    "BTC": ("btc_spot", "btc_hl_funding_ann"),
    "HYPE": ("hype_spot", "hype_hl_funding_ann"),
    "GOLD": ("gold_gc_spot", "gold_hl_funding_ann"),
    "AMZN": ("amzn_hl_perp", "amzn_hl_funding_ann"),
    "OIL": ("oil_wti_spot", "oil_hl_funding_ann"),
}


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
                if mark and funding is not None:
                    series[asset].append(Point(ts, asset, mark, funding))
    return {asset: sorted(points, key=lambda p: p.ts) for asset, points in series.items()}


def merge_series(primary: Dict[str, List[Point]], fallback: Dict[str, List[Point]]) -> Dict[str, List[Point]]:
    merged: Dict[str, List[Point]] = {}
    for asset in ASSETS:
        by_time = {p.ts: p for p in fallback.get(asset, [])}
        by_time.update({p.ts: p for p in primary.get(asset, [])})
        merged[asset] = [by_time[ts] for ts in sorted(by_time)]
    return merged


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
    )


def max_drawdown(values: List[float]) -> float:
    peak = 0.0
    equity = 0.0
    worst = 0.0
    for value in values:
        equity += value
        peak = max(peak, equity)
        worst = min(worst, equity - peak)
    return worst


def longest_losing_streak(values: List[float]) -> int:
    best = current = 0
    for value in values:
        if value <= 0:
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best


def metric_row(
    asset: str,
    signal_type: str,
    threshold: float,
    target_pct: float,
    stop_pct: float,
    hold_hours: int,
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
        "threshold": threshold,
        "target_pct": target_pct,
        "stop_pct": stop_pct,
        "hold_hours": hold_hours,
        "raw_hits": raw_hits,
        "dedup_trades": len(trades),
        "win_rate": len(wins) / len(trades) if trades else "",
        "avg_market_pnl_pct": statistics.mean(markets) if markets else "",
        "avg_funding_pnl_pct": statistics.mean(funding) if funding else "",
        "avg_total_pnl_pct": statistics.mean(totals) if totals else "",
        "median_total_pnl_pct": statistics.median(totals) if totals else "",
        "max_drawdown_pct": max_drawdown(totals) if totals else "",
        "longest_losing_streak": longest_losing_streak(totals),
        "sharpe_like": statistics.mean(totals) / stdev if stdev else "",
        "first_entry": fmt_time(min(t.entry_time for t in trades)) if trades else "",
        "last_entry": fmt_time(max(t.entry_time for t in trades)) if trades else "",
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
                for hold_hours in HOLDS_HOURS:
                    for target_pct in TARGETS:
                        for stop_pct in STOPS:
                            trades = [
                                result
                                for idx in deduped
                                if (
                                    result := simulate_trade(
                                        points,
                                        idx,
                                        signal_type,
                                        threshold,
                                        target_pct,
                                        stop_pct,
                                        hold_hours,
                                    )
                                )
                            ]
                            rows.append(metric_row(asset, signal_type, threshold, target_pct, stop_pct, hold_hours, len(raw), trades))
    return rows


FIELDNAMES = [
    "asset",
    "signal_type",
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
    "longest_losing_streak",
    "sharpe_like",
    "first_entry",
    "last_entry",
]


def write_results(path: Path, rows: List[Dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def as_float(row: Dict[str, object], key: str) -> Optional[float]:
    value = row.get(key)
    if value == "":
        return None
    return safe_float(value)


def best_rows(rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    grouped: Dict[Tuple[str, str], List[Dict[str, object]]] = {}
    for row in rows:
        grouped.setdefault((str(row["asset"]), str(row["signal_type"])), []).append(row)
    for key, candidates in grouped.items():
        viable = [r for r in candidates if int(r["dedup_trades"]) >= 3 and as_float(r, "avg_total_pnl_pct") is not None]
        if not viable:
            out.append({"asset": key[0], "signal_type": key[1], "note": "no cells with >=3 deduped trades"})
            continue
        viable.sort(key=lambda r: (float(r["avg_total_pnl_pct"]), int(r["dedup_trades"])), reverse=True)
        out.append(viable[0])
    return out


def best_rows_conservative(rows: List[Dict[str, object]], min_trades: int = 10) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    grouped: Dict[Tuple[str, str], List[Dict[str, object]]] = {}
    for row in rows:
        grouped.setdefault((str(row["asset"]), str(row["signal_type"])), []).append(row)
    for key, candidates in grouped.items():
        viable = [
            r for r in candidates
            if int(r["dedup_trades"]) >= min_trades
            and as_float(r, "avg_total_pnl_pct") is not None
            and as_float(r, "sharpe_like") is not None
        ]
        if not viable:
            out.append({"asset": key[0], "signal_type": key[1], "note": f"no cells with >={min_trades} deduped trades and finite Sharpe-like"})
            continue
        viable.sort(
            key=lambda r: (
                float(r["sharpe_like"]),
                float(r["avg_total_pnl_pct"]),
                int(r["dedup_trades"]),
            ),
            reverse=True,
        )
        out.append(viable[0])
    return out


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
    lines = [
        "# Funding Extreme Sweep Summary",
        "",
        f"Source: {source_note}",
        "",
        "## Data Window",
        *data_window(series),
        "",
        "## Best Cell Per Asset/Side",
        "",
        "| Asset | Signal | T | Target | Stop | Hold h | Raw hits | Dedup trades | Win rate | Avg market | Avg funding | Avg total | Max DD | Sharpe-like |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in best_rows(rows):
        if "note" in row:
            lines.append(f"| {row['asset']} | {row['signal_type']} |  |  |  |  |  |  |  |  |  | {row['note']} |  |  |")
            continue
        lines.append(
            "| {asset} | {signal_type} | {threshold} | {target_pct} | {stop_pct} | {hold_hours} | "
            "{raw_hits} | {dedup_trades} | {win_rate:.2%} | {avg_market_pnl_pct:.2f} | "
            "{avg_funding_pnl_pct:.2f} | {avg_total_pnl_pct:.2f} | {max_drawdown_pct:.2f} | {sharpe_like:.2f} |".format(
                **row
            )
        )
    lines.extend([
        "",
        "Note: best cells require only >=3 deduped trades, so this table is a search aid, not a production recommendation.",
        "",
        "## Conservative Best Cell Per Asset/Side",
        "",
        "Selector: require >=10 deduped trades and finite Sharpe-like, then sort by Sharpe-like, avg total P&L, and trade count.",
        "",
        "| Asset | Signal | T | Target | Stop | Hold h | Raw hits | Dedup trades | Win rate | Avg market | Avg funding | Avg total | Max DD | Sharpe-like |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ])
    for row in best_rows_conservative(rows):
        if "note" in row:
            lines.append(f"| {row['asset']} | {row['signal_type']} |  |  |  |  |  |  |  |  |  | {row['note']} |  |  |")
            continue
        lines.append(
            "| {asset} | {signal_type} | {threshold} | {target_pct} | {stop_pct} | {hold_hours} | "
            "{raw_hits} | {dedup_trades} | {win_rate:.2%} | {avg_market_pnl_pct:.2f} | "
            "{avg_funding_pnl_pct:.2f} | {avg_total_pnl_pct:.2f} | {max_drawdown_pct:.2f} | {sharpe_like:.2f} |".format(
                **row
            )
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compact-csv", type=Path, default=DEFAULT_COMPACT_INPUT)
    parser.add_argument("--daily-csv", type=Path, default=None)
    parser.add_argument("--snapshot-jsonl", type=Path, default=None)
    parser.add_argument("--include-daily-fallback", action="store_true")
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()

    source_note = ""
    if args.snapshot_jsonl:
        series = read_snapshot_jsonl(args.snapshot_jsonl)
        source_note = str(args.snapshot_jsonl)
    elif args.compact_csv.exists():
        series = read_compact_csv(args.compact_csv)
        source_note = str(args.compact_csv)
    elif args.daily_csv:
        series = read_daily_csv(args.daily_csv)
        source_note = str(args.daily_csv)
    else:
        series = read_daily_csv(DEFAULT_DAILY_INPUT)
        source_note = str(DEFAULT_DAILY_INPUT)

    if args.include_daily_fallback:
        daily_path = args.daily_csv or DEFAULT_DAILY_INPUT
        series = merge_series(series, read_daily_csv(daily_path))
        source_note += f" merged with {daily_path}"

    rows = sweep(series)
    write_results(args.results, rows)
    write_summary(args.summary, rows, series, source_note)


if __name__ == "__main__":
    main()
