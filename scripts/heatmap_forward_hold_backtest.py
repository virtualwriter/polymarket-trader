#!/usr/bin/env python3
"""
Backtest eligible cross-venue heatmap rows with a fixed forward hold.

The script reads archived heatmap CSVs from relative-value/history/YYYY-MM-DD/,
opens the first eligible row per contract/expression, and marks it at the first
matching snapshot at or after entry + hold-days. It uses bid/ask accounting:

  - buy_yes enters at YES ask and exits at YES bid
  - sell_yes_or_buy_no is modeled as buying NO, entering at 1 - YES bid and
    exiting at 1 - YES ask

With only one archived day, results will be open/pending until future archives
accumulate.
"""

from __future__ import annotations

import argparse
import csv
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HISTORY_DIR = ROOT / "relative-value" / "history"
DEFAULT_RESULTS_PATH = ROOT / "relative-value" / "backtest_results.csv"
DEFAULT_SUMMARY_PATH = ROOT / "relative-value" / "backtest_summary.md"


def safe_float(value: object) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
        if parsed != parsed or parsed in (float("inf"), float("-inf")):
            return None
        return parsed
    except (TypeError, ValueError):
        return None


def parse_bool(value: object) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def parse_time(value: object) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        pass
    try:
        return datetime.strptime(raw, "%Y-%m-%dT%H").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def fmt_time(value: Optional[datetime]) -> str:
    return value.isoformat().replace("+00:00", "Z") if value else ""


def fmt_num(value: Optional[float], places: int = 8) -> str:
    return "" if value is None else f"{value:.{places}f}"


def archive_files(history_dir: Path) -> List[Path]:
    if not history_dir.exists():
        return []
    return sorted(history_dir.glob("*/cross_venue_relative_value.csv"))


def read_history(history_dir: Path) -> List[Tuple[datetime, Path, List[Dict[str, str]]]]:
    snapshots: List[Tuple[datetime, Path, List[Dict[str, str]]]] = []
    for path in archive_files(history_dir):
        with path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        if not rows:
            continue
        ts = parse_time(rows[0].get("timestamp"))
        if not ts:
            continue
        snapshots.append((ts, path, rows))
    return sorted(snapshots, key=lambda item: item[0])


def row_key(row: Dict[str, str]) -> Tuple[str, str]:
    return (row.get("market_id", ""), row.get("best_expression", ""))


def entry_side(row: Dict[str, str]) -> str:
    return "no" if row.get("best_expression") == "sell_yes_or_buy_no" else "yes"


def entry_price(row: Dict[str, str]) -> Optional[float]:
    bid = safe_float(row.get("pm_best_bid"))
    ask = safe_float(row.get("pm_best_ask"))
    if entry_side(row) == "yes":
        return ask
    if bid is None:
        return None
    return 1.0 - bid


def exit_price(row: Dict[str, str], side: str) -> Optional[float]:
    bid = safe_float(row.get("pm_best_bid"))
    ask = safe_float(row.get("pm_best_ask"))
    if side == "yes":
        return bid
    if ask is None:
        return None
    return 1.0 - ask


def valid_price(value: Optional[float]) -> bool:
    return value is not None and 0.0 < value < 1.0


@dataclass
class Position:
    key: Tuple[str, str]
    side: str
    asset: str
    contract_question: str
    entry_time: datetime
    target_exit_time: datetime
    expiry_time: Optional[datetime]
    entry_price: float
    entry_pm_yes_price: Optional[float]
    entry_edge_score: Optional[float]
    entry_edge_pts_per_dte: Optional[float]
    entry_edge_pts_per_dte_7d_change: Optional[float]
    model_version: str
    iv_resolution: str
    flags: str


def result_row(position: Position, status: str, exit_time: Optional[datetime], exit_px: Optional[float], exit_row: Optional[Dict[str, str]], note: str = "") -> Dict[str, str]:
    pnl_pct = None
    if valid_price(exit_px):
        pnl_pct = ((exit_px or 0.0) / position.entry_price - 1.0) * 100.0
    return {
        "status": status,
        "asset": position.asset,
        "market_id": position.key[0],
        "best_expression": position.key[1],
        "side": position.side,
        "contract_question": position.contract_question,
        "entry_time": fmt_time(position.entry_time),
        "target_exit_time": fmt_time(position.target_exit_time),
        "exit_time": fmt_time(exit_time),
        "entry_price": fmt_num(position.entry_price),
        "exit_price": fmt_num(exit_px),
        "pnl_pct": fmt_num(pnl_pct, 4),
        "entry_pm_yes_price": fmt_num(position.entry_pm_yes_price),
        "exit_pm_yes_price": fmt_num(safe_float(exit_row.get("pm_yes_price")) if exit_row else None),
        "entry_edge_score": fmt_num(position.entry_edge_score),
        "entry_edge_pts_per_dte": fmt_num(position.entry_edge_pts_per_dte),
        "entry_edge_pts_per_dte_7d_change": fmt_num(position.entry_edge_pts_per_dte_7d_change),
        "exit_edge_score": fmt_num(safe_float(exit_row.get("edge_score")) if exit_row else None),
        "model_version": position.model_version,
        "iv_resolution": position.iv_resolution,
        "entry_flags": position.flags,
        "note": note,
    }


def backtest(snapshots: List[Tuple[datetime, Path, List[Dict[str, str]]]], hold_days: int) -> List[Dict[str, str]]:
    open_positions: Dict[Tuple[str, str], Position] = {}
    entered_keys: set[Tuple[str, str]] = set()
    results: List[Dict[str, str]] = []
    hold_delta = timedelta(days=hold_days)

    for snapshot_time, _path, rows in snapshots:
        rows_by_key = {row_key(row): row for row in rows}

        for key, position in list(open_positions.items()):
            if snapshot_time < position.target_exit_time:
                continue
            exit_row = rows_by_key.get(key)
            if not exit_row:
                continue
            px = exit_price(exit_row, position.side)
            if not valid_price(px):
                continue
            results.append(result_row(position, "closed", snapshot_time, px, exit_row))
            del open_positions[key]

        for row in rows:
            if not parse_bool(row.get("eligible_for_backtest")):
                continue
            key = row_key(row)
            if not key[0] or key in entered_keys or key in open_positions:
                continue
            px = entry_price(row)
            if not valid_price(px):
                continue
            ts = parse_time(row.get("timestamp")) or snapshot_time
            expiry = parse_time(row.get("expiry"))
            target_exit = ts + hold_delta
            if expiry and expiry < target_exit:
                target_exit = expiry
            position = Position(
                key=key,
                side=entry_side(row),
                asset=row.get("asset", ""),
                contract_question=row.get("contract_question", ""),
                entry_time=ts,
                target_exit_time=target_exit,
                expiry_time=expiry,
                entry_price=px,
                entry_pm_yes_price=safe_float(row.get("pm_yes_price")),
                entry_edge_score=safe_float(row.get("edge_score")),
                entry_edge_pts_per_dte=safe_float(row.get("edge_pts_per_dte")),
                entry_edge_pts_per_dte_7d_change=safe_float(row.get("edge_pts_per_dte_7d_change")),
                model_version=row.get("model_version", ""),
                iv_resolution=row.get("iv_resolution", ""),
                flags=row.get("flags", ""),
            )
            open_positions[key] = position
            entered_keys.add(key)

    for position in open_positions.values():
        results.append(result_row(position, "open", None, None, None, "No archive at or after target exit yet."))

    return results


FIELDNAMES = [
    "status",
    "asset",
    "market_id",
    "best_expression",
    "side",
    "contract_question",
    "entry_time",
    "target_exit_time",
    "exit_time",
    "entry_price",
    "exit_price",
    "pnl_pct",
    "entry_pm_yes_price",
    "exit_pm_yes_price",
    "entry_edge_score",
    "entry_edge_pts_per_dte",
    "entry_edge_pts_per_dte_7d_change",
    "exit_edge_score",
    "model_version",
    "iv_resolution",
    "entry_flags",
    "note",
]


def write_results(rows: List[Dict[str, str]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def grouped(rows: Iterable[Dict[str, str]], key: str) -> Dict[str, List[float]]:
    out: Dict[str, List[float]] = {}
    for row in rows:
        pnl = safe_float(row.get("pnl_pct"))
        if pnl is None:
            continue
        out.setdefault(row.get(key, "") or "unknown", []).append(pnl)
    return out


def summary_lines(results: List[Dict[str, str]], snapshots: List[Tuple[datetime, Path, List[Dict[str, str]]]], hold_days: int) -> List[str]:
    closed = [row for row in results if row["status"] == "closed"]
    open_rows = [row for row in results if row["status"] == "open"]
    pnls = [safe_float(row.get("pnl_pct")) for row in closed]
    pnls = [pnl for pnl in pnls if pnl is not None]
    wins = sum(1 for pnl in pnls if pnl > 0)
    losses = sum(1 for pnl in pnls if pnl <= 0)

    lines = [
        "# Heatmap Forward-Hold Backtest",
        "",
        f"Generated: {datetime.now(timezone.utc).replace(microsecond=0).isoformat()}",
        f"Archives read: {len(snapshots)}",
        f"Hold days: {hold_days}",
        "",
        "## Summary",
        "",
        f"- Total entries: {len(results)}",
        f"- Closed entries: {len(closed)}",
        f"- Open/pending entries: {len(open_rows)}",
    ]
    if pnls:
        lines.extend([
            f"- Win rate: {(wins / len(pnls)) * 100:.1f}% ({wins}W/{losses}L)",
            f"- Average P&L: {statistics.mean(pnls):.2f}%",
            f"- Median P&L: {statistics.median(pnls):.2f}%",
            f"- Total P&L points: {sum(pnls):.2f}",
        ])
    else:
        lines.append("- No closed entries yet. Keep archiving heatmap CSVs until entries reach their target exit dates.")

    for group_key in ("asset", "side", "iv_resolution"):
        groups = grouped(closed, group_key)
        if not groups:
            continue
        lines.extend(["", f"## By {group_key}", ""])
        lines.append("| Group | Trades | Win Rate | Avg P&L |")
        lines.append("|---|---:|---:|---:|")
        for name, values in sorted(groups.items(), key=lambda item: statistics.mean(item[1]), reverse=True):
            group_wins = sum(1 for value in values if value > 0)
            lines.append(f"| {name} | {len(values)} | {(group_wins / len(values)) * 100:.1f}% | {statistics.mean(values):.2f}% |")

    return lines


def write_summary(results: List[Dict[str, str]], snapshots: List[Tuple[datetime, Path, List[Dict[str, str]]]], hold_days: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(summary_lines(results, snapshots, hold_days)) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest eligible heatmap rows with bid/ask forward-hold accounting.")
    parser.add_argument("--history-dir", type=Path, default=DEFAULT_HISTORY_DIR, help="Directory containing dated heatmap CSV archives")
    parser.add_argument("--out", type=Path, default=DEFAULT_RESULTS_PATH, help="Output trade-level CSV")
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY_PATH, help="Output markdown summary")
    parser.add_argument("--hold-days", type=int, default=7, help="Forward hold period in days")
    args = parser.parse_args()

    snapshots = read_history(args.history_dir)
    results = backtest(snapshots, args.hold_days)
    write_results(results, args.out)
    write_summary(results, snapshots, args.hold_days, args.summary)

    closed = sum(1 for row in results if row["status"] == "closed")
    open_count = sum(1 for row in results if row["status"] == "open")
    print(f"Archives read: {len(snapshots)}")
    print(f"Entries: {len(results)} ({closed} closed, {open_count} open)")
    print(f"Wrote results: {args.out}")
    print(f"Wrote summary: {args.summary}")


if __name__ == "__main__":
    main()
