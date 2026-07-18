#!/usr/bin/env python3
"""Add DEC-0017 documenting Phase C research theme layer."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import default_registry_path, load_registry, next_id, write_registry  # noqa: E402

MARKER_TITLE = "Phase C: research themes grouping FIND records"


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
                "Phase C groups FIND records into coarse Research Themes (THEME-*) "
                "via deterministic signal-family slugs. assign_research_themes.py "
                "sets finding.body.themeId and theme.links.findings, and writes "
                "data/research-themes.json for Phase D hypothesis authorship."
            ),
            "assignmentVersion": "research_theme_v1",
            "themeSlugs": [
                "heatmap_one_touch",
                "weekend_hl_funding",
                "funding_extreme",
                "other_{signal_slug}",
            ],
            "artifacts": ["data/research-themes.json"],
        },
        "links": {"relatedRecords": ["DEC-0016"]},
        "created": now,
        "source": "add_find_phase_c_dec.py",
    }
    records.append(dec)
    data["version"] = 1
    write_registry(registry_path, data)
    print(json.dumps(dec, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
