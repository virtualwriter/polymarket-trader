#!/usr/bin/env python3
"""Backfill structured closeTrigger fields onto historical shadow-trade records.

Reads data/blocked-signals.json (or --path override), classifies resolved shadows
whose hypotheticalResult lacks closeTrigger using ordered legacy heuristics, and
optionally rewrites the file atomically with --apply.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = ROOT / "data" / "blocked-signals.json"

CLOSE_TRIGGERS = (
    "target_hit",
    "stop_hit",
    "expiry",
    "observed_gap_closed",
    "adjusted_no_gap_disappeared",
    "weekend_window_closed",
    "weekend_funding_normalized",
    "legacy_gate_force_close",
)


def load_shadow_store(path: Path) -> Tuple[Any, List[Dict[str, Any]], str]:
    """Return (raw document, shadow list, container kind).

    container kind is one of: "list", "dict:<key>"
    """
    if not path.exists():
        raise SystemExit(f"File not found: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return raw, raw, "list"
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(value, list) and (
                not value or all(isinstance(item, dict) for item in value)
            ):
                return raw, value, f"dict:{key}"
        raise SystemExit(
            "blocked-signals document is an object but no list-of-shadows key was found"
        )
    raise SystemExit("blocked-signals document must be a JSON array or object")


def save_shadow_store(path: Path, raw: Any) -> None:
    tmp_path = path.with_name(path.name + ".tmp")
    payload = json.dumps(raw, indent=2) + "\n"
    tmp_path.write_text(payload, encoding="utf-8")
    os.replace(tmp_path, path)


def _learning_excluded_reason(shadow: Dict[str, Any]) -> Optional[str]:
    learning_excluded = shadow.get("learningExcluded")
    if not isinstance(learning_excluded, dict):
        return None
    reason = learning_excluded.get("reason")
    return str(reason) if reason is not None else None


def infer_close_trigger(shadow: Dict[str, Any]) -> Optional[str]:
    """Apply ordered backfill rules; return closeTrigger or None to leave untagged."""
    hypothetical = shadow.get("hypotheticalResult")
    if not isinstance(hypothetical, dict):
        return None

    thesis = str(shadow.get("thesis") or "")
    blocked_reason = str(shadow.get("blockedReason") or "")
    close_reason = str(hypothetical.get("closeReason") or "")

    # 1. thesis contains "observed_gap_closed"
    if "observed_gap_closed" in thesis:
        return "observed_gap_closed"

    # 2. one_touch_high_edge_shadow + edge_disappeared in thesis
    if blocked_reason == "one_touch_high_edge_shadow" and "edge_disappeared" in thesis:
        return "legacy_gate_force_close"

    # 3. adjusted_no_gap_disappeared in thesis
    if "adjusted_no_gap_disappeared" in thesis:
        if _learning_excluded_reason(shadow) == "no_bias_coverage_loss_force_close":
            return "legacy_gate_force_close"
        return "adjusted_no_gap_disappeared"

    # 4. weekend_hl_funding_shadow
    if blocked_reason == "weekend_hl_funding_shadow":
        if close_reason in ("thesis_validated_profitable", "thesis_compressed_loss"):
            return "weekend_funding_normalized"
        if close_reason == "expiry":
            return None
        # fall through for other close reasons (e.g. stop/target) to rule 5

    # 5. mechanical exits
    if close_reason == "target":
        return "target_hit"
    if close_reason in ("stop", "breakeven_stop"):
        return "stop_hit"
    if close_reason == "expiry":
        return "expiry"

    # 6. everything else stays untagged
    return None


def stamp_close_trigger(hypothetical: Dict[str, Any], close_trigger: str) -> Dict[str, Any]:
    """Insert closeTrigger after closeReason while preserving other field order."""
    updated: Dict[str, Any] = {}
    inserted = False
    for key, value in hypothetical.items():
        updated[key] = value
        if key == "closeReason" and not inserted:
            updated["closeTrigger"] = close_trigger
            inserted = True
    if not inserted:
        updated = {"closeTrigger": close_trigger, **updated}
    return updated


def process_shadows(
    shadows: List[Dict[str, Any]], apply: bool
) -> Dict[str, Any]:
    assigned_counts: Dict[str, int] = defaultdict(int)
    untagged_by_close_reason: Dict[str, int] = defaultdict(int)
    already_tagged = 0
    not_resolved = 0
    missing_hypothetical = 0
    modified = 0

    for shadow in shadows:
        if shadow.get("status") != "resolved":
            not_resolved += 1
            continue

        hypothetical = shadow.get("hypotheticalResult")
        if not isinstance(hypothetical, dict):
            missing_hypothetical += 1
            continue

        if hypothetical.get("closeTrigger"):
            already_tagged += 1
            continue

        close_trigger = infer_close_trigger(shadow)
        if close_trigger is None:
            close_reason = str(hypothetical.get("closeReason") or "<missing>")
            untagged_by_close_reason[close_reason] += 1
            continue

        assigned_counts[close_trigger] += 1
        if apply:
            shadow["hypotheticalResult"] = stamp_close_trigger(hypothetical, close_trigger)
            modified += 1

    return {
        "assigned_counts": dict(assigned_counts),
        "untagged_by_close_reason": dict(untagged_by_close_reason),
        "already_tagged": already_tagged,
        "not_resolved": not_resolved,
        "missing_hypothetical": missing_hypothetical,
        "modified": modified,
    }


def print_summary(path: Path, total_scanned: int, stats: Dict[str, Any], apply: bool) -> None:
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"=== backfill_shadow_close_context ({mode}) ===")
    print(f"path: {path}")
    print(f"total records scanned: {total_scanned}")
    print(f"already tagged (skipped): {stats['already_tagged']}")
    print(f"not resolved (skipped): {stats['not_resolved']}")
    print(f"resolved without hypotheticalResult: {stats['missing_hypothetical']}")

    assigned_total = sum(stats["assigned_counts"].values())
    untagged_total = sum(stats["untagged_by_close_reason"].values())
    print(f"would assign closeTrigger: {assigned_total}")
    print(f"would leave untagged: {untagged_total}")

    print("\nassigned closeTrigger counts:")
    if stats["assigned_counts"]:
        for trigger in CLOSE_TRIGGERS:
            count = stats["assigned_counts"].get(trigger, 0)
            if count:
                print(f"  {trigger}: {count}")
        for trigger, count in sorted(stats["assigned_counts"].items()):
            if trigger not in CLOSE_TRIGGERS:
                print(f"  {trigger}: {count}")
    else:
        print("  (none)")

    print("\nuntagged (by closeReason):")
    if stats["untagged_by_close_reason"]:
        for close_reason, count in sorted(
            stats["untagged_by_close_reason"].items(),
            key=lambda item: (-item[1], item[0]),
        ):
            print(f"  {close_reason}: {count}")
    else:
        print("  (none)")

    if apply:
        print(f"\nrecords modified: {stats['modified']}")
    else:
        print("\nNo changes written (dry-run). Re-run with --apply to persist.")


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill hypotheticalResult.closeTrigger on resolved shadow trades."
    )
    parser.add_argument(
        "--path",
        type=Path,
        default=DEFAULT_PATH,
        help="Path to blocked-signals.json (default: data/blocked-signals.json)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes atomically; default is dry-run only.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    path = args.path.resolve()
    raw, shadows, container_kind = load_shadow_store(path)

    stats = process_shadows(shadows, apply=args.apply)
    print_summary(path, total_scanned=len(shadows), stats=stats, apply=args.apply)

    if args.apply and stats["modified"] > 0:
        save_shadow_store(path, raw)
        print(f"Wrote {stats['modified']} update(s) to {path} ({container_kind})")
    elif args.apply:
        print("No updates needed; file left unchanged.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
