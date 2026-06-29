#!/usr/bin/env python3
"""Relabel weekend HL funding trades that hit a spurious mechanical stop.

Root cause: ``applyFundingRiskShapeToOpenPositions`` treated
``WEEKEND_HL_FUNDING_REVERSION_LONG`` as a generic funding signal and overwrote
``stopPct`` from 100 to the default 3%, so small adverse moves at 5x leverage
closed as ``stop`` before the funding-normalization exit could fire.

This script (idempotent):
  1. Finds closed ``WEEKEND_HL_FUNDING_REVERSION_LONG`` rows with
     ``close_reason=stop`` in ``data/trades-detailed.csv``.
  2. Relabels them ``data_quality_artifact`` with an explanatory thesis suffix.
  3. Recomputes portfolio counters from the cleaned ledger (artifacts excluded)
     and updates ``data/portfolio.json`` plus the live portfolio file if present.

Usage::

    python3 scripts/relabel_weekend_funding_misstop_artifacts.py [--dry-run]
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
PORTFOLIO_JSON = DATA_DIR / "portfolio.json"
LIVE_PORTFOLIO_PATH = Path(
    os.environ.get(
        "POLYMARKET_TRADER_LIVE_PORTFOLIO",
        "/var/lib/polymarket-trader/portfolio-live.json",
    )
)

SIGNAL = "WEEKEND_HL_FUNDING_REVERSION_LONG"
ARTIFACT_NOTE = (
    "Mis-labeled mechanical stop: applyFundingRiskShapeToOpenPositions overwrote "
    "weekend HL funding stopPct from 100 to default 3%, causing premature price "
    "stops before funding-normalization exit. Excluded from counted P&L."
)
THESIS_MARKER = "weekend HL funding stopPct from 100 to default 3%"


def is_contaminated(row: dict[str, str]) -> bool:
    reason = row.get("close_reason") or ""
    if reason == "data_quality_artifact":
        return True
    if "DATA_CORRECTION_ARTIFACT" in reason:
        return True
    thesis = row.get("thesis") or ""
    if "NON_LEARNING_CLOSE" in thesis:
        return True
    return False


def recompute_totals(rows: list[dict[str, str]]) -> dict[str, float | int]:
    by_id: dict[str, dict[str, str]] = {}
    for row in rows:
        tid = row.get("id") or ""
        if not tid or not row.get("closed_at"):
            continue
        existing = by_id.get(tid)
        if existing is None or (row.get("closed_at") or "") < (existing.get("closed_at") or ""):
            by_id[tid] = row

    total_pnl = 0.0
    win_count = 0
    loss_count = 0
    for row in by_id.values():
        if is_contaminated(row):
            continue
        try:
            pnl = float(row.get("pnl") or 0)
        except ValueError:
            pnl = 0.0
        total_pnl += pnl
        if pnl >= 0:
            win_count += 1
        else:
            loss_count += 1
    return {
        "totalRealizedPnl": total_pnl,
        "totalTrades": win_count + loss_count,
        "winCount": win_count,
        "lossCount": loss_count,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not TRADES_CSV.exists():
        print(f"FATAL: {TRADES_CSV} missing")
        return 1

    with TRADES_CSV.open(newline="") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    relabel_candidates = [
        row for row in rows
        if row.get("signal_type") == SIGNAL
        and row.get("close_reason") == "stop"
        and THESIS_MARKER not in (row.get("thesis") or "")
    ]
    if not relabel_candidates:
        print("No weekend funding mis-stop rows to relabel.")
        return 0

    before = recompute_totals(rows)

    relabeled: list[str] = []
    for row in relabel_candidates:
        row["close_reason"] = "data_quality_artifact"
        thesis = (row.get("thesis") or "").rstrip()
        row["thesis"] = f"{thesis} | [CLOSED {row.get('closed_at', '')[:10]} data_quality_artifact]: {ARTIFACT_NOTE}"
        relabeled.append(f"{row['id']} {row.get('asset')} pnl={row.get('pnl')}")

    after = recompute_totals(rows)

    print(f"Relabeling {len(relabeled)} weekend funding mis-stop trades:")
    for line in relabeled:
        print(f"  - {line}")
    print()
    print(
        f"Counted realized P&L: ${before['totalRealizedPnl']:+.4f} -> ${after['totalRealizedPnl']:+.4f} "
        f"(removed ${after['totalRealizedPnl'] - before['totalRealizedPnl']:+.4f})"
    )
    print(
        f"Counted trades: {before['totalTrades']} -> {after['totalTrades']} "
        f"(wins {before['winCount']}->{after['winCount']}, losses {before['lossCount']}->{after['lossCount']})"
    )

    if args.dry_run:
        print("\nDRY RUN — no files written.")
        return 0

    backup = TRADES_CSV.with_suffix(TRADES_CSV.suffix + ".bak")
    shutil.copy2(TRADES_CSV, backup)
    with TRADES_CSV.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    for path in [PORTFOLIO_JSON, LIVE_PORTFOLIO_PATH]:
        if not path.exists():
            continue
        portfolio = json.loads(path.read_text())
        portfolio["totalRealizedPnl"] = after["totalRealizedPnl"]
        portfolio["totalTrades"] = after["totalTrades"]
        portfolio["winCount"] = after["winCount"]
        portfolio["lossCount"] = after["lossCount"]
        portfolio["lastUpdated"] = now
        path.write_text(json.dumps(portfolio, indent=2) + "\n")
        print(f"Updated {path}")

    print(f"\nWrote {TRADES_CSV} (backup {backup})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
