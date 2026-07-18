#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def main() -> int:
    engine = REPO / "scripts" / "trading-engine.ts"
    text = engine.read_text(encoding="utf-8")
    text2, n1 = re.subn(
        r"hypothesis\.setupId = `find_\$\{hypothesis\.originFindingId\.toLowerCase\(\)\.replace\(/-/g, \"_\"\)\}`;",
        'hypothesis.setupId = `find_${hypothesis.originFindingId.replace(/^FIND-/i, "").toLowerCase()}`;',
        text,
    )
    text2, n2 = re.subn(
        r"hypothesis\.setupId = `find_\$\{nh\.originFindingId!\.toLowerCase\(\)\.replace\(/-/g, \"_\"\)\}`;",
        'hypothesis.setupId = `find_${nh.originFindingId!.replace(/^FIND-/i, "").toLowerCase()}`;',
        text2,
    )
    if n1 or n2:
        engine.write_text(text2, encoding="utf-8")
    print(f"engine replacements: ensure={n1} ingest={n2}")

    hyps_path = REPO / "data" / "hypotheses.json"
    hyps = json.loads(hyps_path.read_text(encoding="utf-8"))
    changed = 0
    for h in hyps:
        oid = h.get("originFindingId")
        if isinstance(oid, str) and oid.startswith("FIND-"):
            want = "find_" + oid.removeprefix("FIND-").lower()
            if h.get("setupId") != want:
                h["setupId"] = want
                h["setupLabel"] = f"FIND-linked {oid}"
                changed += 1
    if changed:
        hyps_path.write_text(json.dumps(hyps, indent=2) + "\n", encoding="utf-8")
    print(
        "hyps",
        changed,
        [(h["id"], h.get("setupId")) for h in hyps if h.get("originFindingId")],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
