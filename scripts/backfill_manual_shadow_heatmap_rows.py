#!/usr/bin/env python3
"""Backfill heatmap row snapshots onto manual IV-touch shadow trades."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
HEATMAP_CSV = ROOT / "relative-value" / "cross_venue_relative_value.csv"


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def row_snapshot(row: Dict[str, str], selected_side: str, selected_signal_type: str) -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "source": "cross_venue_relative_value_heatmap",
        "row": row,
        "selectedSide": selected_side,
        "selectedSignalType": selected_signal_type,
    }


def selected_side(signal_type: str, instrument_type: str) -> str:
    if signal_type == "USER_PM_IV_TOUCH_RICH_NO" or instrument_type == "pm_no":
        return "no"
    return "yes"


def main() -> None:
    rows_by_key: dict[tuple[str, str], Dict[str, str]] = {}
    with HEATMAP_CSV.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            rows_by_key[(row.get("event_slug", ""), row.get("market_id", ""))] = row

    blocked_path = DATA_DIR / "blocked-signals.json"
    blocked = read_json(blocked_path, [])
    updated = 0
    for shadow in blocked:
        if shadow.get("blockedReason") != "manual_shadow_trade":
            continue
        if shadow.get("heatmapRowSnapshot"):
            continue
        position = shadow.get("position", {}) or {}
        instrument_id = str(position.get("instrumentId", ""))
        if "::" not in instrument_id:
            continue
        event_slug, market_id = instrument_id.split("::", 1)
        row = rows_by_key.get((event_slug, market_id))
        if not row:
            continue
        side = selected_side(str(shadow.get("signalType", "")), str(position.get("instrumentType", "")))
        shadow["heatmapRowSnapshot"] = row_snapshot(row, side, str(shadow.get("signalType", "")))
        updated += 1

    if updated:
        write_json(blocked_path, blocked)
    print(f"Backfilled heatmapRowSnapshot on {updated} manual shadow trade(s).")


if __name__ == "__main__":
    main()
