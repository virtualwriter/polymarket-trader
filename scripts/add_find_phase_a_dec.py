#!/usr/bin/env python3
"""Add a DEC record documenting Phase A FIND schema (optional helper).

Skips quietly when data/registry.json is not present locally (typical dev clone).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import default_registry_path, load_registry, next_id, write_registry  # noqa: E402


def main() -> int:
    registry_path = default_registry_path()
    if not registry_path.exists():
        print(f"skip: {registry_path} not found (VPS-only registry)")
        return 0

    data = load_registry(registry_path)
    records = data.setdefault("records", [])
    marker_title = "Phase A: permanent FIND records with provenance"
    for record in records:
        if record.get("type") == "decision" and record.get("title") == marker_title:
            print(f"skip: decision already exists ({record['id']})")
            return 0

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dec = {
        "id": next_id(records, "decision"),
        "type": "decision",
        "evidenceClass": "DERIVED",
        "status": "final",
        "title": marker_title,
        "body": {
            "rationale": (
                "Phase A stats-first research loop stores mined shadow clusters as "
                "FIND records (clusterKey upsert) with immutable provenance and "
                "evidence {n, winRate, sumPnl}. Auto H-* hypothesis promotion from "
                "shadow mine is deferred to Phase D; nightly runs "
                "mine_shadow_findings.py instead of mine_shadow_hypotheses.py."
            ),
            "schema": {
                "type": "finding",
                "prefix": "FIND",
                "requiredBody": ["clusterKey", "evidence", "provenance"],
                "statuses": ["open", "strengthened", "weakened", "resolved", "negative"],
            },
        },
        "links": {},
        "created": now,
        "source": "add_find_phase_a_dec.py",
    }
    records.append(dec)
    data["version"] = 1
    write_registry(registry_path, data)
    print(json.dumps(dec, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
