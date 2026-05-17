#!/usr/bin/env python3
"""Backfill heatmap row snapshots onto open one-touch shadow trades.

The hourly engine started persisting `heatmapRowSnapshot` on
`one_touch_high_edge_shadow` records, but earlier shadows do not have one. The
trader-performance report falls back to `nearestRelativeValueEntryRow`, which
can pick up archived heatmap rows generated during a TradingView option-chain
failure (where `iv_resolution=valuations_fallback`). That makes
`entry_one_touch_model_recomputed` swing by tens of points for reasons that
are pure data-pipeline artifacts.

This script finds, for each open one-touch shadow missing a snapshot, the
nearest sibling blocked-signal (manual entry or other shadow) on the same
instrument that already has a clean snapshot (non-`valuations_fallback`
`iv_resolution`) within a 36 hour window, and copies that row across. We do
not invent rows for shadows that have no sibling source, so they keep their
existing fallback behaviour and we don't silently masquerade a fabricated
entry model.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BLOCKED_SIGNALS = DATA_DIR / "blocked-signals.json"
MAX_WINDOW_HOURS = 36


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def parse_iso(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def instrument_key(signal: dict[str, Any]) -> str | None:
    instrument_id = (signal.get("position") or {}).get("instrumentId")
    if not instrument_id or "::" not in instrument_id:
        return None
    return instrument_id


def snapshot_uses_fallback_iv(snapshot: dict[str, Any]) -> bool:
    row = snapshot.get("row") if isinstance(snapshot, dict) else None
    if not isinstance(row, dict):
        return True
    if row.get("iv_resolution") == "valuations_fallback":
        return True
    option_source = (row.get("option_source") or "").lower()
    if "valuation" in option_source and "tradingview" not in option_source:
        return True
    return False


def selected_side_for(signal: dict[str, Any]) -> str:
    position = signal.get("position") or {}
    if position.get("instrumentType") == "pm_no":
        return "no"
    return "yes"


def main() -> None:
    signals = read_json(BLOCKED_SIGNALS, [])
    if not isinstance(signals, list):
        raise SystemExit("blocked-signals.json is not a list")

    snapshots_by_instrument: dict[str, list[tuple[datetime, dict[str, Any], dict[str, Any]]]] = {}
    for signal in signals:
        key = instrument_key(signal)
        snapshot = signal.get("heatmapRowSnapshot")
        opened_at = parse_iso(signal.get("blockedAt", ""))
        if not key or not snapshot or not opened_at:
            continue
        if snapshot_uses_fallback_iv(snapshot):
            continue
        snapshots_by_instrument.setdefault(key, []).append((opened_at, snapshot, signal))

    updated = 0
    skipped_no_sibling = 0
    skipped_out_of_window = 0
    for signal in signals:
        if signal.get("status") != "open":
            continue
        if signal.get("blockedReason") != "one_touch_high_edge_shadow":
            continue
        if signal.get("heatmapRowSnapshot"):
            continue
        key = instrument_key(signal)
        opened_at = parse_iso(signal.get("blockedAt", ""))
        if not key or not opened_at:
            continue
        candidates = snapshots_by_instrument.get(key)
        if not candidates:
            skipped_no_sibling += 1
            continue

        best: tuple[float, dict[str, Any], dict[str, Any]] | None = None
        for candidate_time, snapshot, source_signal in candidates:
            delta_hours = abs((candidate_time - opened_at).total_seconds()) / 3600.0
            if delta_hours > MAX_WINDOW_HOURS:
                continue
            if best is None or delta_hours < best[0]:
                best = (delta_hours, snapshot, source_signal)

        if best is None:
            skipped_out_of_window += 1
            continue

        delta_hours, snapshot, source_signal = best
        new_snapshot: dict[str, Any] = {
            "schemaVersion": snapshot.get("schemaVersion", 1),
            "source": snapshot.get("source", "cross_venue_relative_value_heatmap"),
            "row": snapshot["row"],
            "selectedSide": selected_side_for(signal),
            "selectedSignalType": str(signal.get("signalType", "")),
            "backfill": {
                "fromSignalId": str(source_signal.get("id", "")),
                "fromBlockedAt": str(source_signal.get("blockedAt", "")),
                "ageHours": round(delta_hours, 2),
                "rationale": "Copied from nearest sibling blocked-signal on same instrument with non-fallback IV row; original one-touch shadow did not persist its own heatmap row.",
            },
        }
        signal["heatmapRowSnapshot"] = new_snapshot
        updated += 1

    if updated:
        write_json(BLOCKED_SIGNALS, signals)
    print(
        f"Backfilled heatmapRowSnapshot on {updated} one-touch shadow(s); "
        f"skipped {skipped_no_sibling} without a same-instrument sibling and "
        f"{skipped_out_of_window} outside the {MAX_WINDOW_HOURS}h window."
    )


if __name__ == "__main__":
    main()
