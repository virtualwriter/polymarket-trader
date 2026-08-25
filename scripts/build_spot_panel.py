#!/usr/bin/env python3
"""Build the spot/perp outcome panel: every (asset, day) in the daily
valuation history with forward spot returns at fixed horizons, plus funding,
positioning, momentum and macro features known at entry time.

The non-Polymarket counterpart of build_outcome_panel.py: it widens research
sourcing for spot/perp ideas beyond "shadow trades the engine happened to
open". The miner (scripts/mine_spot_panel_findings.py) and the nightly LLM's
retrieval layer (kind "spot_panel") both read the CSV this writes.

Usage:
  python3 scripts/build_spot_panel.py \
      --valuations data/daily-valuations.csv \
      --macro data/daily-macro.csv \
      --out data/research-spot-panel.csv
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

from lib.panel_common import load_macro_by_day  # noqa: E402
from lib.spot_panel_common import (  # noqa: E402
    SPOT_ASSETS,
    SPOT_HORIZONS_DAYS,
    SPOT_PANEL_VERSION,
    TrailingSeries,
    build_spot_panel_row,
    entry_is_stale,
    sample_daily_rows,
    spot_panel_header,
)

DEFAULT_VALUATIONS = REPO / "data" / "daily-valuations.csv"
DEFAULT_MACRO = REPO / "data" / "daily-macro.csv"
DEFAULT_OUT = REPO / "data" / "research-spot-panel.csv"
DEFAULT_META = REPO / "data" / "research-spot-panel-meta.json"


def build_spot_panel(
    valuations_path: Path,
    macro_path: Path,
    out_path: Path,
    meta_path: Path,
) -> dict:
    with open(valuations_path, newline="", encoding="utf-8") as fh:
        valuation_rows = list(csv.DictReader(fh))
    samples = sample_daily_rows(valuation_rows)
    if not samples:
        raise SystemExit(f"no sampled days in {valuations_path}")

    all_days = sorted(samples)
    macro_by_day = load_macro_by_day(macro_path)
    max_horizon = max(SPOT_HORIZONS_DAYS)

    def series_or_none(column: str | None) -> TrailingSeries | None:
        if not column:
            return None
        s = TrailingSeries(samples, column)
        return s if s.points else None

    rows_written = 0
    skipped_stale_entries = 0
    skipped_no_price = 0
    quality_counts: dict[str, int] = {}

    header = spot_panel_header()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".csv.tmp")
    with open(tmp_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=header)
        writer.writeheader()
        for asset, cols in SPOT_ASSETS.items():
            price_series = series_or_none(cols.get("price"))
            if price_series is None:
                continue
            fund_series = series_or_none(cols.get("funding"))
            pc_series = series_or_none(cols.get("pc"))
            iv30_series = series_or_none(cols.get("iv30"))
            iv90_series = series_or_none(cols.get("iv90"))

            for day in all_days:
                # Entries need forward room; later days are features-only
                # until history catches up.
                if day > all_days[-1] - timedelta(days=max_horizon):
                    continue
                if price_series.value_on(day) is None:
                    skipped_no_price += 1
                    continue
                if entry_is_stale(price_series, day):
                    skipped_stale_entries += 1
                    continue
                row = build_spot_panel_row(
                    asset, day, price_series, fund_series, pc_series,
                    iv30_series, iv90_series, macro_by_day,
                )
                for h in SPOT_HORIZONS_DAYS:
                    q = str(row.get(f"outcome_quality_{h}d"))
                    key = f"{h}d:{q}"
                    quality_counts[key] = quality_counts.get(key, 0) + 1
                writer.writerow(row)
                rows_written += 1
    tmp_path.replace(out_path)

    meta = {
        "panelVersion": SPOT_PANEL_VERSION,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valuationsPath": str(valuations_path),
        "dayCount": len(all_days),
        "firstDay": all_days[0].isoformat(),
        "lastDay": all_days[-1].isoformat(),
        "assets": sorted(SPOT_ASSETS.keys()),
        "rows": rows_written,
        "skippedStaleEntries": skipped_stale_entries,
        "skippedNoPrice": skipped_no_price,
        "outcomeQualityCounts": quality_counts,
        "horizonsDays": list(SPOT_HORIZONS_DAYS),
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--valuations", type=Path, default=DEFAULT_VALUATIONS)
    ap.add_argument("--macro", type=Path, default=DEFAULT_MACRO)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--meta", type=Path, default=DEFAULT_META)
    args = ap.parse_args()

    meta = build_spot_panel(args.valuations, args.macro, args.out, args.meta)
    print(
        "spot panel: %s rows over %s days (%s .. %s), "
        "skipped %s stale entries, %s missing-price days"
        % (
            meta["rows"], meta["dayCount"], meta["firstDay"], meta["lastDay"],
            meta["skippedStaleEntries"], meta["skippedNoPrice"],
        )
    )
    for key, count in sorted(meta["outcomeQualityCounts"].items()):
        print(f"  outcome {key}: {count}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
