#!/usr/bin/env python3
"""One-time reconciliation: prune trades-detailed.csv + reset portfolio counters.

What this script does (idempotent — safe to re-run):

  1. Reads ``data/trades-detailed.csv``.
  2. Loads the canonical tainted-trade list from
     ``data/operationally-tainted-trades.json``.
  3. Splits rows into three buckets:
       - clean:      kept in ``data/trades-detailed.csv``
       - duplicates: rows with a trade ID that appears more than once
                     (we keep the row with the earliest ``closed_at``;
                     later duplicates go to the archive).
       - artifacts:  tainted-ID rows OR ``close_reason`` containing
                     ``data_quality_artifact`` / ``DATA_CORRECTION_ARTIFACT``,
                     OR ``thesis`` containing ``NON_LEARNING_CLOSE``.
  4. Writes duplicates + artifacts to ``data/trades-detailed-archive.csv``
     (appending if the file already exists, so re-runs do not lose
     earlier archive history) with two extra columns
     ``archived_at`` and ``archive_reason``.
  5. Writes the clean rows back to ``data/trades-detailed.csv``.
  6. Recomputes ``totalRealizedPnl``, ``totalTrades``, ``winCount``,
     ``lossCount`` from the clean ledger and rewrites:
       - ``data/portfolio.json``
       - ``$POLYMARKET_TRADER_LIVE_PORTFOLIO`` (default
         ``/var/lib/polymarket-trader/portfolio-live.json``) — only if
         it already exists.
     ``cash`` and ``positions`` are NOT touched (those reflect open
     exposure, not closed-trade history).
  7. Prints a before/after summary.

Usage::

    python3 scripts/reconcile_portfolio_and_ledger.py [--dry-run]

After a real run, commit the resulting ``trades-detailed.csv``,
``trades-detailed-archive.csv``, and ``portfolio.json``.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
TRADES_CSV = DATA_DIR / "trades-detailed.csv"
ARCHIVE_CSV = DATA_DIR / "trades-detailed-archive.csv"
PORTFOLIO_JSON = DATA_DIR / "portfolio.json"
TAINTED_JSON = DATA_DIR / "operationally-tainted-trades.json"
LIVE_PORTFOLIO_PATH = Path(
    os.environ.get(
        "POLYMARKET_TRADER_LIVE_PORTFOLIO",
        "/var/lib/polymarket-trader/portfolio-live.json",
    )
)

ARCHIVE_EXTRA_COLUMNS = ("archived_at", "archive_reason")


def load_tainted_ids() -> dict[str, str]:
    if not TAINTED_JSON.exists():
        return {}
    try:
        with TAINTED_JSON.open() as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def parse_closed_at(value: str) -> float:
    if not value:
        return float("inf")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.timestamp()
    except ValueError:
        return float("inf")


def is_artifact_row(row: dict[str, str], tainted: dict[str, str]) -> tuple[bool, str]:
    tid = row.get("id", "")
    if tid in tainted:
        return True, f"operationally_tainted:{tainted[tid]}"
    reason = row.get("close_reason", "") or ""
    if reason == "data_quality_artifact":
        return True, "close_reason=data_quality_artifact"
    if "DATA_CORRECTION_ARTIFACT" in reason:
        return True, "close_reason contains DATA_CORRECTION_ARTIFACT"
    thesis = row.get("thesis", "") or ""
    if "NON_LEARNING_CLOSE" in thesis:
        return True, "thesis contains NON_LEARNING_CLOSE"
    return False, ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing any files.",
    )
    args = parser.parse_args()

    if not TRADES_CSV.exists():
        print(f"FATAL: {TRADES_CSV} does not exist.")
        return 1

    with TRADES_CSV.open(newline="") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    tainted = load_tainted_ids()

    # Pass 1: identify artifacts and duplicates.
    artifact_indices: set[int] = set()
    artifact_reasons: dict[int, str] = {}
    for idx, row in enumerate(rows):
        is_art, reason = is_artifact_row(row, tainted)
        if is_art:
            artifact_indices.add(idx)
            artifact_reasons[idx] = reason

    by_id: dict[str, list[int]] = {}
    for idx, row in enumerate(rows):
        by_id.setdefault(row.get("id", ""), []).append(idx)

    duplicate_indices: set[int] = set()
    duplicate_reasons: dict[int, str] = {}
    for tid, idx_list in by_id.items():
        if len(idx_list) <= 1:
            continue
        ordered = sorted(idx_list, key=lambda i: parse_closed_at(rows[i].get("closed_at", "")))
        keep = ordered[0]
        for i in ordered[1:]:
            if i in artifact_indices:
                continue
            duplicate_indices.add(i)
            duplicate_reasons[i] = f"duplicate_of:{tid} (kept_row_closed_at={rows[keep].get('closed_at','')})"

    archive_indices = sorted(artifact_indices | duplicate_indices)
    clean_indices = [i for i in range(len(rows)) if i not in artifact_indices and i not in duplicate_indices]

    # Recompute portfolio counters from clean rows.
    total_pnl = 0.0
    total_trades = 0
    win_count = 0
    loss_count = 0
    for i in clean_indices:
        try:
            pnl = float(rows[i].get("pnl", "0") or 0)
        except ValueError:
            pnl = 0.0
        total_pnl += pnl
        total_trades += 1
        if pnl >= 0:
            win_count += 1
        else:
            loss_count += 1

    # Load current portfolio.json for before/after diff.
    if PORTFOLIO_JSON.exists():
        with PORTFOLIO_JSON.open() as fh:
            portfolio = json.load(fh)
    else:
        portfolio = {
            "cash": 100.0,
            "positions": [],
            "totalRealizedPnl": 0,
            "totalTrades": 0,
            "winCount": 0,
            "lossCount": 0,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
        }

    before = {
        "totalRealizedPnl": portfolio.get("totalRealizedPnl", 0),
        "totalTrades": portfolio.get("totalTrades", 0),
        "winCount": portfolio.get("winCount", 0),
        "lossCount": portfolio.get("lossCount", 0),
    }

    print("=" * 70)
    print("RECONCILIATION SUMMARY")
    print("=" * 70)
    print(f"Raw rows in trades-detailed.csv: {len(rows)}")
    print(f"  duplicates to archive:          {len(duplicate_indices)}")
    print(f"  artifacts to archive:           {len(artifact_indices)}")
    print(f"  clean rows kept:                {len(clean_indices)}")
    print()
    print("Portfolio counters:")
    print(f"  BEFORE: trades={before['totalTrades']:3d}  wins={before['winCount']:3d}  losses={before['lossCount']:3d}  realizedPnl=${before['totalRealizedPnl']:+.4f}")
    print(f"  AFTER:  trades={total_trades:3d}  wins={win_count:3d}  losses={loss_count:3d}  realizedPnl=${total_pnl:+.4f}")
    print(f"  DRIFT REMOVED: ${total_pnl - before['totalRealizedPnl']:+.4f}")
    print()

    if archive_indices:
        print("Archiving rows:")
        for i in archive_indices:
            tid = rows[i].get("id", "")
            reason = artifact_reasons.get(i) or duplicate_reasons.get(i, "unknown")
            print(f"  - {tid}  closed_at={rows[i].get('closed_at','')}  pnl={rows[i].get('pnl','')}  reason={reason}")
        print()

    if args.dry_run:
        print("DRY RUN — no files written.")
        return 0

    # Write archive (append-safe).
    archive_header = list(fieldnames) + list(ARCHIVE_EXTRA_COLUMNS)
    archive_exists = ARCHIVE_CSV.exists()
    with ARCHIVE_CSV.open("a", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=archive_header)
        if not archive_exists:
            writer.writeheader()
        archived_at = datetime.now(timezone.utc).isoformat()
        for i in archive_indices:
            row_out = dict(rows[i])
            row_out["archived_at"] = archived_at
            reason = artifact_reasons.get(i) or duplicate_reasons.get(i, "unknown")
            row_out["archive_reason"] = reason
            writer.writerow(row_out)

    # Backup original CSV, then write the clean version.
    backup = TRADES_CSV.with_suffix(TRADES_CSV.suffix + ".bak")
    shutil.copy2(TRADES_CSV, backup)
    with TRADES_CSV.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for i in clean_indices:
            writer.writerow(rows[i])

    # Update portfolio.json.
    portfolio["totalRealizedPnl"] = total_pnl
    portfolio["totalTrades"] = total_trades
    portfolio["winCount"] = win_count
    portfolio["lossCount"] = loss_count
    portfolio["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    with PORTFOLIO_JSON.open("w") as fh:
        json.dump(portfolio, fh, indent=2)
        fh.write("\n")

    # Update live portfolio (only if it already exists; never create on dev box).
    if LIVE_PORTFOLIO_PATH.exists():
        with LIVE_PORTFOLIO_PATH.open() as fh:
            live = json.load(fh)
        live["totalRealizedPnl"] = total_pnl
        live["totalTrades"] = total_trades
        live["winCount"] = win_count
        live["lossCount"] = loss_count
        live["lastUpdated"] = portfolio["lastUpdated"]
        with LIVE_PORTFOLIO_PATH.open("w") as fh:
            json.dump(live, fh, indent=2)
            fh.write("\n")
        print(f"Updated live portfolio at {LIVE_PORTFOLIO_PATH}")
    else:
        print(f"Live portfolio at {LIVE_PORTFOLIO_PATH} does not exist; skipped.")

    print()
    print(f"Wrote {ARCHIVE_CSV} (+{len(archive_indices)} rows)")
    print(f"Wrote {TRADES_CSV} ({len(clean_indices)} rows; backup at {backup})")
    print(f"Wrote {PORTFOLIO_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
