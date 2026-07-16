#!/usr/bin/env python3
"""Run heatmap-audit replay experiments 1 (oil cutoff) and 2 (lineage-suspect exclusion).

Safety: only writes under /tmp/replay-heatmap-* and data/experiments/. Does not
restart services or mutate production portfolios.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
START = os.environ.get("HEATMAP_REPLAY_START", "2026-07-01")
END = os.environ.get("HEATMAP_REPLAY_END", "2026-07-14")
SHARED_STORE = Path("/tmp/replay-heatmap-store")
OUT_DIR = REPO / "data" / "experiments"
REGISTRY = REPO / "scripts" / "registry.py"

# Audit cohort (HANDOFF-vps-heatmap-audit.md / shadow snapshot audit)
LINEAGE_SUSPECT_IDS = [
    "MANUAL-IVTOUCH-OIL-NO-2074237-1777996309",
    "MANUAL-IVTOUCH-GOLD-YES-2074203-1778625442",
    "OT-1779330545196-1sqi",
    "OT-1779467353409-vwz1",
    "OT-1779481755789-p52i",
    "OT-1779481755790-dg12",
    "OT-1779481755790-ib4m",
    "OT-1779805767726-fu2y",
    "OT-1784048736086-glrs",
]


def run(cmd: list[str], env: dict[str, str] | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.check_call(cmd, cwd=str(REPO), env=env or os.environ.copy())


def ensure_shared_store() -> None:
    SHARED_STORE.mkdir(parents=True, exist_ok=True)
    index = SHARED_STORE / "index.json"
    if index.exists() and not os.environ.get("HEATMAP_REPLAY_REBUILD_STORE"):
        print(f"[store] reusing {SHARED_STORE}", flush=True)
        return
    run(
        [
            "python3",
            str(REPO / "scripts" / "replay-snapshot-store.py"),
            "--repo",
            str(REPO),
            "--store",
            str(SHARED_STORE),
            *(["--rebuild"] if os.environ.get("HEATMAP_REPLAY_REBUILD_STORE") else []),
        ]
    )


def link_store(sandbox: Path) -> None:
    sandbox.mkdir(parents=True, exist_ok=True)
    target = sandbox / "snapshot-store"
    if target.exists() or target.is_symlink():
        if target.is_symlink() or target.is_dir():
            if target.is_symlink():
                target.unlink()
            else:
                # keep existing store dir if already populated
                return
    target.symlink_to(SHARED_STORE, target_is_directory=True)


def run_arm(tag: str, sandbox: Path, extra: list[str]) -> dict:
    link_store(sandbox)
    cmd = [
        "npx",
        "tsx",
        str(REPO / "scripts" / "replay-harness.ts"),
        "--start",
        START,
        "--end",
        END,
        "--sandbox",
        str(sandbox),
        "--keep-going",
        "--tag",
        tag,
        *extra,
    ]
    run(cmd)
    report_path = sandbox / "replay-report.json"
    report = json.loads(report_path.read_text())
    dest = OUT_DIR / f"{tag}-report.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, indent=2) + "\n")
    print(f"[arm] {tag} -> {dest}", flush=True)
    return report


def static_suspect_cohort() -> dict:
    path = REPO / "data" / "blocked-signals.json"
    rows = json.loads(path.read_text()) if path.exists() else []
    by_id = {r.get("id"): r for r in rows}
    out = []
    for sid in LINEAGE_SUSPECT_IDS:
        s = by_id.get(sid)
        if not s:
            out.append({"id": sid, "found": False})
            continue
        row = ((s.get("heatmapRowSnapshot") or {}).get("row") or {})
        hyp = s.get("hypotheticalResult") or {}
        out.append(
            {
                "id": sid,
                "found": True,
                "asset": s.get("asset"),
                "signalType": s.get("signalType"),
                "status": s.get("status"),
                "option_symbol": row.get("option_symbol"),
                "pnl": hyp.get("pnl", s.get("pnl")),
                "learningExcluded": bool(s.get("learningExcluded")),
            }
        )
    return {"cohortIds": LINEAGE_SUSPECT_IDS, "rows": out}


def summarize_pair(name: str, a: dict, b: dict, a_label: str, b_label: str) -> dict:
    def tot(r: dict) -> dict:
        return {
            "closed": r.get("totals", {}).get("closedTrades"),
            "pnl": r.get("totals", {}).get("totalPnl"),
            "oilGoldClosed": r.get("totals", {}).get("oilGoldClosed"),
            "oilGoldPnl": r.get("totals", {}).get("oilGoldPnl"),
            "hypeOneTouchShadows": r.get("shadowSummary", {}).get("hypeOneTouch"),
            "lineageSuspectOptionSymbolShadows": r.get("shadowSummary", {}).get(
                "lineageSuspectOptionSymbol"
            ),
            "shadowTotal": r.get("shadowSummary", {}).get("total"),
        }

    return {
        "experiment": name,
        "window": {"start": START, "end": END},
        a_label: tot(a),
        b_label: tot(b),
        "delta": {
            "closed": (tot(b)["closed"] or 0) - (tot(a)["closed"] or 0),
            "pnl": round((tot(b)["pnl"] or 0) - (tot(a)["pnl"] or 0), 6),
            "oilGoldClosed": (tot(b)["oilGoldClosed"] or 0) - (tot(a)["oilGoldClosed"] or 0),
            "oilGoldPnl": round((tot(b)["oilGoldPnl"] or 0) - (tot(a)["oilGoldPnl"] or 0), 6),
            "hypeOneTouchShadows": (tot(b)["hypeOneTouchShadows"] or 0)
            - (tot(a)["hypeOneTouchShadows"] or 0),
        },
    }


def registry_add(title: str, body: dict) -> str:
    cmd = [
        "python3",
        str(REGISTRY),
        "add",
        "--type",
        "experiment",
        "--evidence-class",
        "DERIVED",
        "--status",
        "final",
        "--title",
        title,
        "--body",
        json.dumps(body),
        "--source",
        "run_heatmap_audit_replays",
    ]
    out = subprocess.check_output(cmd, cwd=str(REPO), text=True)
    print(out, flush=True)
    try:
        rec = json.loads(out)
        return rec.get("id", "")
    except json.JSONDecodeError:
        return ""


def main() -> int:
    print(f"[run] window {START}..{END}", flush=True)
    ensure_shared_store()
    suspect = static_suspect_cohort()

    # Exp 1: contamination cutoff
    dirty = run_arm(
        "EXP-heatmap-oil-dirty",
        Path("/tmp/replay-heatmap-oil-dirty"),
        [
            "--set-env",
            "OIL_CRUDE_HISTORY_START=2026-04-03",
        ],
    )
    clean = run_arm(
        "EXP-heatmap-oil-clean",
        Path("/tmp/replay-heatmap-oil-clean"),
        [
            "--set-env",
            "OIL_CRUDE_HISTORY_START=2026-04-28",
            "--null-features-before",
            "2026-04-28",
            "--null-feature-prefixes",
            "oil_,gold_",
        ],
    )
    exp1 = summarize_pair(
        "oil_contamination_cutoff", dirty, clean, "includePreCutoffHistory", "cleanCutoff_2026-04-28"
    )

    # Exp 2: lineage-suspect exclusion
    included = run_arm(
        "EXP-heatmap-suspect-included",
        Path("/tmp/replay-heatmap-suspect-included"),
        [],
    )
    excluded = run_arm(
        "EXP-heatmap-suspect-excluded",
        Path("/tmp/replay-heatmap-suspect-excluded"),
        [
            "--set-env",
            "EXCLUDE_LINEAGE_SUSPECT_SHADOWS=1",
        ],
    )
    exp2 = summarize_pair(
        "lineage_suspect_exclusion",
        included,
        excluded,
        "suspectIncluded",
        "suspectExcluded",
    )
    exp2["productionSuspectCohort"] = suspect

    summary = {
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {"start": START, "end": END},
        "exp1_oil_contamination_cutoff": exp1,
        "exp2_lineage_suspect_exclusion": exp2,
    }
    summary_path = OUT_DIR / "heatmap-audit-replay-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"[summary] {summary_path}", flush=True)
    print(json.dumps(summary, indent=2), flush=True)

    id1 = registry_add(
        f"EXP: oil contamination cutoff replay ({START}..{END})",
        {
            "question": "Does excluding pre-2026-04-28 oil/gold feature history change engine decisions vs including contaminated April history?",
            "method": "A/B sandbox replay via scripts/replay-harness.ts. Dirty arm: OIL_CRUDE_HISTORY_START=2026-04-03. Clean arm: OIL_CRUDE_HISTORY_START=2026-04-28 and null oil_/gold_ valuation/macro columns before that date.",
            "window": {"start": START, "end": END},
            "results": exp1,
            "sourceAudit": "HANDOFF-vps-heatmap-audit.md",
        },
    )
    id2 = registry_add(
        f"EXP: lineage-suspect shadow exclusion replay ({START}..{END})",
        {
            "question": "Does gating out HYPE/PURR one-touch and *_VALUATION_IV lineage-suspect heatmap shadows change replay shadow book / P&L vs including them?",
            "method": "A/B sandbox replay. Included arm: default engine. Excluded arm: EXCLUDE_LINEAGE_SUSPECT_SHADOWS=1 (skips HYPE and option_symbol PURR/OIL_VALUATION_IV/GOLD_VALUATION_IV in one-touch eligibility). Production cohort of 9 audit IDs analyzed statically (manual VALUATION_IV shadows are not re-emitted by the engine).",
            "window": {"start": START, "end": END},
            "results": exp2,
            "sourceAudit": "HANDOFF-vps-heatmap-audit.md",
            "relatedSuspectIds": LINEAGE_SUSPECT_IDS,
        },
    )
    print(f"[registry] {id1} {id2}", flush=True)
    subprocess.check_call(["python3", str(REGISTRY), "validate"], cwd=str(REPO))
    return 0


if __name__ == "__main__":
    sys.exit(main())
