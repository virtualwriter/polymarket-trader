#!/usr/bin/env python3
"""One-shot: wire mine_shadow_hypotheses into nightly research + DEC-0014."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def wire_nightly() -> None:
    p = REPO / "scripts" / "run-polymarket-nightly-research.sh"
    lines = p.read_text().splitlines(True)
    if any("mine_shadow_hypotheses" in ln for ln in lines):
        print("nightly already wired")
    else:
        out: list[str] = []
        i = 0
        while i < len(lines):
            out.append(lines[i])
            if "npx tsx scripts/nightly-research.ts" in lines[i]:
                i += 1
                while i < len(lines):
                    out.append(lines[i])
                    if lines[i].strip() == "fi":
                        out.append("\n")
                        out.append(
                            "# Mine clean heatmap/blocked-signal shadows → data/shadow-mined-hypotheses.json.\n"
                        )
                        out.append(
                            "# Hourly engine ingests with source=shadow_mined (parallel retest queue).\n"
                        )
                        out.append(
                            'if ! timeout "${SHADOW_MINE_TIMEOUT:-3m}" python3 scripts/mine_shadow_hypotheses.py; then\n'
                        )
                        out.append(
                            '  echo "WARNING: mine_shadow_hypotheses.py failed; continuing."\n'
                        )
                        out.append("fi\n")
                        i += 1
                        break
                    i += 1
                continue
            i += 1
        text = "".join(out).replace(
            "  data/nightly-llm-advice.json\n",
            "  data/nightly-llm-advice.json\n  data/shadow-mined-hypotheses.json\n",
            1,
        )
        p.write_text(text)
        bin_path = Path("/usr/local/bin/run-polymarket-nightly-research")
        if bin_path.parent.is_dir():
            bin_path.write_text(text)
        print("wired nightly")


def archive_dup() -> None:
    path = REPO / "data" / "hypotheses.json"
    hs = json.loads(path.read_text())
    for h in hs:
        if h.get("id") == "H-533" and h.get("status") != "archived":
            h["status"] = "archived"
            h["postMortem"] = (h.get("postMortem") or "") + " | Archived: coarse duplicate of H-532."
            path.write_text(json.dumps(hs, indent=2) + "\n")
            print("archived H-533")
            return
    print("H-533 already archived or missing")


def add_dec() -> None:
    path = REPO / "data" / "registry.json"
    data = json.loads(path.read_text())
    if any(r["id"] == "DEC-0014" for r in data["records"]):
        print("DEC-0014 exists")
        return
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data["records"].append(
        {
            "id": "DEC-0014",
            "type": "decision",
            "evidenceClass": "DERIVED",
            "status": "final",
            "title": "Shadow→hypothesis mine path + parallel shadow_mined retest queue",
            "body": {
                "rationale": (
                    "Clean blocked-signal/heatmap shadows had no path into hypotheses.json. "
                    "Added mine_shadow_hypotheses.py → shadow-mined-hypotheses.json, engine "
                    "ingest as source=shadow_mined (bypasses LLM backlog), parallel retest "
                    "queue (40 families, up to 2 pending, timeframeDays=2)."
                ),
                "initialIngest": [
                    "H-532",
                    "H-534",
                    "H-535",
                    "H-536",
                    "H-537",
                    "H-538",
                    "H-539",
                ],
                "heatmapBacked": ["H-532", "H-534"],
                "acceleration": {
                    "shadowMinedRetestLimit": 40,
                    "maxPendingPerFamily": 2,
                    "timeframeDays": 2,
                },
            },
            "links": {"relatedRecords": ["DEC-0013", "EXP-0538"]},
            "created": now,
            "source": "operator",
        }
    )
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print("DEC-0014 added")


if __name__ == "__main__":
    wire_nightly()
    archive_dup()
    add_dec()
