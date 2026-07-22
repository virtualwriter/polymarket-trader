#!/usr/bin/env python3
"""Quarantine contaminated scorer-v1 hypothesis tests and reopen FIND-0003 / H-540.

Scorer v1 ignored hypothesis.direction and defaulted to long-biased spot moves, which
falsely zeroed short ONE_TOUCH families (e.g. H-540 / FIND-0003 at 0W/20L while gold fell).

This script:
1. Marks historical-backfill / pre-v2 completed tests as excludedFromSetupStats when they
   lack scorer-v2 method tags.
2. Reactivates H-540 (and optionally other --hyp-ids).
3. Reopens FIND-0003 (status open) and clears failedHypotheses writeback links for revived hyps.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import (  # noqa: E402
    default_registry_path,
    find_record_by_id,
    load_registry,
    validate_registry,
    write_registry,
)

EXCLUSION_REASON = "scorer_v1_direction_bug_quarantine"
SOURCE = "quarantine_scorer_v1_hypothesis_tests_v1"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def is_contaminated_test(test: dict[str, Any]) -> bool:
    if test.get("outcome") not in ("win", "loss"):
        return False
    if test.get("excludedFromSetupStats"):
        return False
    move = str(test.get("actualMove") or "")
    # Scorer v2 tags method= in actualMove; keep those.
    if "method=" in move and "method=spot_directional_" in move:
        return False
    if "method=funding_" in move or "method=spot_abs_move" in move:
        return False
    if move.startswith("UNSCORABLE:"):
        return True
    # Legacy backfill / live resolves without direction tags.
    if "[historical-backfill]" in move:
        return True
    if " moved " in move and "needs" not in move and "method=" not in move:
        return True
    return False


def recount_win_rate(hypothesis: dict[str, Any]) -> None:
    countable = [
        t
        for t in (hypothesis.get("tests") or [])
        if t.get("outcome") in ("win", "loss") and not t.get("excludedFromSetupStats")
    ]
    if not countable:
        hypothesis["winRate"] = 0.0
        return
    wins = sum(1 for t in countable if t.get("outcome") == "win")
    hypothesis["winRate"] = wins / len(countable)


def quarantine_and_revive(
    *,
    hypotheses_path: Path,
    registry_path: Path,
    revive_hyp_ids: set[str],
    reopen_finding_ids: set[str],
    dry_run: bool,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    hypotheses = load_json(hypotheses_path)
    if not isinstance(hypotheses, list):
        raise ValueError("hypotheses.json must be an array")

    quarantined = 0
    revived = 0
    for hyp in hypotheses:
        if not isinstance(hyp, dict):
            continue
        for test in hyp.get("tests") or []:
            if not isinstance(test, dict):
                continue
            if is_contaminated_test(test):
                test["excludedFromSetupStats"] = True
                test["exclusionReason"] = EXCLUSION_REASON
                quarantined += 1
        recount_win_rate(hyp)

        hid = str(hyp.get("id") or "")
        if hid in revive_hyp_ids:
            hyp["status"] = "active"
            hyp["promotedToSignal"] = False
            hyp["postMortem"] = (
                f"{now}: reopened after scorer-v1 quarantine ({EXCLUSION_REASON}); "
                "prior completed tests excluded from setup stats. Re-test under scorer v2."
            )
            revived += 1

    registry = load_registry(registry_path)
    records = list(registry.get("records") or [])
    reopened_finds = 0
    for finding_id in sorted(reopen_finding_ids):
        finding = find_record_by_id(records, finding_id)
        if finding is None or finding.get("type") != "finding":
            continue
        body = dict(finding.get("body") or {})
        links = dict(finding.get("links") or {})
        failed = [x for x in (links.get("failedHypotheses") or []) if x not in revive_hyp_ids]
        if failed:
            links["failedHypotheses"] = failed
        else:
            links.pop("failedHypotheses", None)
        body["reopenedAt"] = now
        body["reopenedReason"] = (
            f"Scorer v1 direction bug contaminated linked hyp tests; "
            f"quarantined and revived {sorted(revive_hyp_ids)}"
        )
        finding["body"] = body
        finding["links"] = links
        finding["status"] = "open"
        finding["source"] = SOURCE
        reopened_finds += 1

    errors = validate_registry({"version": registry.get("version", 1), "records": records})
    if errors:
        raise ValueError("registry invalid after reopen: " + "; ".join(errors[:5]))

    summary = {
        "dryRun": dry_run,
        "quarantinedTests": quarantined,
        "revivedHypotheses": revived,
        "reopenedFindings": reopened_finds,
        "reviveHypIds": sorted(revive_hyp_ids),
        "reopenFindingIds": sorted(reopen_finding_ids),
        "at": now,
    }

    if not dry_run:
        save_json(hypotheses_path, hypotheses)
        write_registry(registry_path, {"version": registry.get("version", 1), "records": records})

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hypotheses", type=Path, default=REPO / "data" / "hypotheses.json")
    parser.add_argument("--registry", type=Path, default=default_registry_path())
    parser.add_argument(
        "--revive-hyp-ids",
        default="H-540",
        help="Comma-separated hypothesis ids to set active (default H-540)",
    )
    parser.add_argument(
        "--reopen-finding-ids",
        default="FIND-0003",
        help="Comma-separated FIND ids to set status=open (default FIND-0003)",
    )
    parser.add_argument("--apply", action="store_true", help="Write changes (default dry-run)")
    args = parser.parse_args()

    summary = quarantine_and_revive(
        hypotheses_path=args.hypotheses,
        registry_path=args.registry,
        revive_hyp_ids={x.strip() for x in args.revive_hyp_ids.split(",") if x.strip()},
        reopen_finding_ids={x.strip() for x in args.reopen_finding_ids.split(",") if x.strip()},
        dry_run=not args.apply,
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
