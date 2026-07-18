#!/usr/bin/env python3
"""Write back negative FIND status when linked hypotheses fail (Phase F).

Scans hypotheses.json for failed experiments with ``originFindingId``, marks the
linked FIND ``status=negative`` (anti-rediscovery), and records the failed hyp id
in ``links.failedHypotheses``. Does not remove evidence or provenance.
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
    REGISTRY_VERSION,
    default_registry_path,
    find_record_by_id,
    load_registry,
    validate_registry,
    write_registry,
)

SOURCE = "writeback_negative_findings_v1"
MIN_RESOLVED_TESTS = 5
FAIL_WIN_RATE = 0.40


def default_hypotheses_path() -> Path:
    return REPO / "data" / "hypotheses.json"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def resolved_test_count(hypothesis: dict[str, Any]) -> int:
    tests = hypothesis.get("tests") or []
    return sum(1 for t in tests if t.get("outcome") != "pending")


def hypothesis_failed(hypothesis: dict[str, Any]) -> tuple[bool, str]:
    """Return (failed, reason_code) using deterministic Phase F rules."""
    status = hypothesis.get("status")
    if status == "killed":
        return True, "killed"
    if status == "archived":
        return True, "archived"

    resolved = resolved_test_count(hypothesis)
    win_rate = float(hypothesis.get("winRate") or 0)
    if resolved >= MIN_RESOLVED_TESTS and win_rate < FAIL_WIN_RATE:
        return True, f"low_win_rate_{win_rate:.2f}_n_{resolved}"

    return False, ""


def negative_reason(hypothesis: dict[str, Any], reason_code: str) -> str:
    hid = hypothesis.get("id", "?")
    status = hypothesis.get("status", "?")
    win_rate = float(hypothesis.get("winRate") or 0)
    return (
        f"Linked hyp {hid} failed ({reason_code}, "
        f"status={status}, winRate={win_rate:.2f})"
    )


def _append_unique(items: list[Any], value: Any) -> None:
    if value not in items:
        items.append(value)


def apply_writeback(
    hypotheses_path: Path,
    registry_path: Path,
    *,
    dry_run: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    now_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    hypotheses = load_json(hypotheses_path)
    if not isinstance(hypotheses, list):
        raise ValueError("hypotheses.json must be an array")

    data = load_registry(registry_path)
    records: list[dict[str, Any]] = list(data.get("records", []))

    marked = 0
    skipped_already_negative = 0
    skipped_not_failed = 0
    skipped_missing_find = 0
    linked_only = 0
    actions: list[str] = []

    for hypothesis in hypotheses:
        if not isinstance(hypothesis, dict):
            continue
        finding_id = hypothesis.get("originFindingId")
        if not isinstance(finding_id, str) or not finding_id.strip():
            continue

        failed, reason_code = hypothesis_failed(hypothesis)
        if not failed:
            skipped_not_failed += 1
            continue

        hid = hypothesis.get("id", "?")
        finding = find_record_by_id(records, finding_id)
        if finding is None or finding.get("type") != "finding":
            skipped_missing_find += 1
            actions.append(f"SKIP {finding_id}: missing FIND for failed hyp {hid}")
            continue

        old_links = dict(finding.get("links") or {})
        if finding.get("status") == "negative" and hid in (
            old_links.get("failedHypotheses") or []
        ):
            skipped_already_negative += 1
            continue

        links = dict(old_links)
        failed_hyps = list(links.get("failedHypotheses") or [])
        hyp_history = list(links.get("hypotheses") or [])
        _append_unique(hyp_history, hid)
        links["hypotheses"] = hyp_history
        _append_unique(failed_hyps, hid)
        links["failedHypotheses"] = failed_hyps

        already_negative = finding.get("status") == "negative"
        if already_negative:
            finding["links"] = links
            linked_only += 1
            actions.append(f"LINK {finding_id}: already negative, linked failed hyp {hid}")
            continue

        finding["status"] = "negative"
        body = dict(finding.get("body") or {})
        body["negativeReason"] = negative_reason(hypothesis, reason_code)
        body["resolvedAt"] = now_iso
        finding["body"] = body
        finding["links"] = links
        finding["source"] = SOURCE
        marked += 1
        actions.append(
            f"MARK {finding_id} negative via failed hyp {hid} ({reason_code})"
        )

    if not dry_run and (marked > 0 or linked_only > 0):
        data["records"] = records
        data["version"] = REGISTRY_VERSION
        registry_errors = validate_registry(data)
        if registry_errors:
            raise ValueError("; ".join(registry_errors))
        write_registry(registry_path, data)

    return {
        "marked": marked,
        "linkedOnly": linked_only,
        "skippedAlreadyNegative": skipped_already_negative,
        "skippedNotFailed": skipped_not_failed,
        "skippedMissingFind": skipped_missing_find,
        "actions": actions,
        "dryRun": dry_run,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--registry", type=Path, default=default_registry_path())
    ap.add_argument("--hypotheses", type=Path, default=default_hypotheses_path())
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    result = apply_writeback(
        args.hypotheses,
        args.registry,
        dry_run=args.dry_run,
    )
    print(
        f"writeback_negative_findings: marked={result['marked']} "
        f"linked_only={result['linkedOnly']} "
        f"skipped_not_failed={result['skippedNotFailed']} "
        f"skipped_missing_find={result['skippedMissingFind']} "
        f"skipped_already_negative={result['skippedAlreadyNegative']}"
        + (" (dry-run)" if result["dryRun"] else "")
    )
    for line in result["actions"]:
        print(f"  {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
