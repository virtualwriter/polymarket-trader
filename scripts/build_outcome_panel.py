#!/usr/bin/env python3
"""Build the outcome panel: every archived Polymarket contract-day with
forward YES/NO returns at fixed horizons, plus the features the system knew
at entry time (contract quotes/edges, smart flow, perp funding, macro,
cross-asset spot moves).

This is the research substrate that widens sourcing beyond shadow trades:
the miner (scripts/mine_panel_findings.py) and the nightly LLM's retrieval
layer both read the CSV this writes.

Usage:
  python3 scripts/build_outcome_panel.py \
      --history-dir /var/lib/polymarket-trader/relative-value-history \
      --history-dir relative-value/history \
      --out data/research-panel.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lib.panel_common import (  # noqa: E402
    ENTRY_MAX_SPREAD,
    ENTRY_MIN_LIQUIDITY,
    HORIZONS_DAYS,
    PANEL_VERSION,
    build_panel_row,
    discover_history_days,
    entry_eligible,
    load_day_rows,
    load_macro_by_day,
    panel_header,
)

DEFAULT_OUT = REPO / "data" / "research-panel.csv"
DEFAULT_META = REPO / "data" / "research-panel-meta.json"
DEFAULT_MACRO = REPO / "data" / "daily-macro.csv"


def build_panel(
    history_dirs: list[Path],
    macro_path: Path,
    out_path: Path,
    meta_path: Path,
) -> dict:
    day_files = discover_history_days(history_dirs)
    if not day_files:
        raise SystemExit(f"no history snapshots found under: {[str(d) for d in history_dirs]}")

    all_days = sorted(day_files)
    day_maps = {day: load_day_rows(path) for day, path in day_files.items()}
    macro_by_day = load_macro_by_day(macro_path)

    max_horizon = max(HORIZONS_DAYS)
    rows_written = 0
    skipped_ineligible = 0
    quality_counts: dict[str, int] = {}

    header = panel_header()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".csv.tmp")
    with open(tmp_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=header)
        writer.writeheader()
        for i, day in enumerate(all_days):
            # Entries need at least the max horizon of forward data; later
            # days are features-only until history catches up.
            if day > all_days[-1] - timedelta(days=max_horizon):
                continue
            prev_rows = day_maps.get(day - timedelta(days=1))
            for entry_row in day_maps[day].values():
                if not entry_eligible(entry_row):
                    skipped_ineligible += 1
                    continue
                row = build_panel_row(
                    entry_row, day, day_maps, all_days, macro_by_day, prev_rows
                )
                for h in HORIZONS_DAYS:
                    q = str(row.get(f"outcome_quality_{h}d"))
                    quality_counts[f"{h}d:{q}"] = quality_counts.get(f"{h}d:{q}", 0) + 1
                writer.writerow(row)
                rows_written += 1
    tmp_path.replace(out_path)

    meta = {
        "panelVersion": PANEL_VERSION,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "historyDirs": [str(d) for d in history_dirs],
        "dayCount": len(all_days),
        "firstDay": all_days[0].isoformat(),
        "lastDay": all_days[-1].isoformat(),
        "rows": rows_written,
        "skippedIneligible": skipped_ineligible,
        "outcomeQualityCounts": quality_counts,
        "entryFilters": {
            "maxSpread": ENTRY_MAX_SPREAD,
            "minLiquidity": ENTRY_MIN_LIQUIDITY,
        },
        "horizonsDays": list(HORIZONS_DAYS),
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--history-dir",
        action="append",
        type=Path,
        default=None,
        help="RV history root (repeatable; first match per day wins)",
    )
    ap.add_argument("--macro", type=Path, default=DEFAULT_MACRO)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--meta", type=Path, default=DEFAULT_META)
    args = ap.parse_args()

    history_dirs = args.history_dir or [REPO / "relative-value" / "history"]
    meta = build_panel(history_dirs, args.macro, args.out, args.meta)
    print(
        f"panel: {meta['rows']} rows over {meta['dayCount']} days "
        f"({meta['firstDay']} .. {meta['lastDay']}), "
        f"skipped {meta['skippedIneligible']} ineligible entries"
    )
    for key, count in sorted(meta["outcomeQualityCounts"].items()):
        print(f"  outcome {key}: {count}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
