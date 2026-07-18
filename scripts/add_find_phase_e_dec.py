#!/usr/bin/env python3
"""Add DEC-0019 documenting Phase E nightly research report."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import default_registry_path, load_registry, next_id, write_registry  # noqa: E402

MARKER_TITLE = "Phase E: nightly research report for operators"


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
        "evidenceClass": "DERIVED",
        "status": "final",
        "title": MARKER_TITLE,
        "body": {
            "rationale": (
                "Phase E aggregates ranked FIND opportunities, research themes, "
                "and nightly LLM-authored hypotheses into data/nightly-research-report.md "
                "and .json. build_nightly_research_report.py runs after shadow mining "
                "and nightly-research.ts; the morning daily Telegram report surfaces a "
                "truncated Nightly Research Loop section so operators see evidence-first "
                "context instead of journal-only writeups."
            ),
            "artifacts": [
                "data/nightly-research-report.md",
                "data/nightly-research-report.json",
            ],
        },
        "links": {"relatedRecords": ["DEC-0017"]},
        "created": now,
        "source": "add_find_phase_e_dec.py",
    }
    records.append(dec)
    data["version"] = 1
    write_registry(registry_path, data)
    print(json.dumps(dec, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
