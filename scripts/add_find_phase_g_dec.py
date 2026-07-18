#!/usr/bin/env python3
"""Add DEC-0021 documenting Phase G replay evidence attachment."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import default_registry_path, load_registry, next_id, write_registry  # noqa: E402

MARKER_TITLE = "Phase G: attach replay evidence to top FIND opportunities"


def main() -> int:
    registry_path = default_registry_path()
    if not registry_path.exists():
        print(f"skip: {registry_path} not found (VPS-only registry)")
        return 0

    data = load_registry(registry_path)
    records = data.setdefault("records", [])
    for record in records:
        if record.get("type") == "decision" and record.get("title") == MARKER_TITLE:
            print(f"skip: decision already exists ({record['id']})")
            return 0

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dec = {
        "id": next_id(records, "decision"),
        "type": "decision",
        "evidenceClass": "VALID",
        "status": "final",
        "title": MARKER_TITLE,
        "body": {
            "rationale": (
                "Phase G attaches replay harness evidence to only the highest ranked "
                "non-negative FIND records. Nightly always writes a cheap replay plan, "
                "and full harness execution is gated behind FIND_REPLAY_ATTACH=1 so "
                "research jobs do not replay every finding by default. Harness failures "
                "or missing archives are recorded as skipped replayEvidence instead of "
                "failing nightly hard."
            ),
            "selection": {"source": "data/research-opportunities.json", "defaultTopK": 1, "skipStatus": ["negative"]},
            "artifacts": [
                "scripts/attach_finding_replays.py",
                "data/finding-replay-plan.json",
            ],
        },
        "links": {"relatedRecords": ["DEC-0020"]},
        "created": now,
        "source": "add_find_phase_g_dec.py",
    }
    records.append(dec)
    data["version"] = 1
    write_registry(registry_path, data)
    print(json.dumps(dec, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
