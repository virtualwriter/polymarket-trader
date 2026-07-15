#!/usr/bin/env python3
"""One-way sync: data/hypotheses.json -> data/registry.json experiment records."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REGISTRY_VERSION = 1

TYPE_PREFIX = {
    "strategy": "STRAT",
    "experiment": "EXP",
    "decision": "DEC",
    "incident": "INC",
    "parameter-change": "PARAM",
}

ID_PATTERN = re.compile(r"^(STRAT|EXP|DEC|INC|PARAM)-(\d{4})$")

STATUS_MAP = {
    "active": "running",
    "testing": "running",
    "promoted": "final",
    "killed": "retired",
    "retired": "retired",
    "expired": "retired",
    "archived": "retired",
}

SOURCE = "sync_hypotheses_registry"


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def default_hypotheses_path() -> Path:
    return repo_root() / "data" / "hypotheses.json"


def default_registry_path() -> Path:
    return repo_root() / "data" / "registry.json"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_registry(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    fd, tmp = tempfile.mkstemp(
        dir=path.parent, prefix=".registry-", suffix=".json.tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def deep_merge(base: Any, patch: Any) -> Any:
    if isinstance(base, dict) and isinstance(patch, dict):
        result = dict(base)
        for key, value in patch.items():
            if key in result:
                result[key] = deep_merge(result[key], value)
            else:
                result[key] = value
        return result
    if isinstance(base, list) and isinstance(patch, list):
        return base + patch
    return patch


def next_id(records: list[dict[str, Any]], rtype: str) -> str:
    prefix = TYPE_PREFIX[rtype]
    max_num = 0
    for record in records:
        rid = record.get("id", "")
        m = ID_PATTERN.match(rid)
        if m and m.group(1) == prefix:
            max_num = max(max_num, int(m.group(2)))
    return f"{prefix}-{max_num + 1:04d}"


def truncate(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def map_status(hypothesis_status: str) -> str:
    mapped = STATUS_MAP.get(hypothesis_status)
    if mapped is None:
        print(
            f"warning: unknown hypothesis status '{hypothesis_status}', "
            "defaulting registry status to 'running'",
            file=sys.stderr,
        )
        return "running"
    return mapped


def test_stats(hypothesis: dict[str, Any]) -> dict[str, Any]:
    tests = hypothesis.get("tests") or []
    completed = [t for t in tests if t.get("outcome") != "pending"]
    wins = [t for t in completed if t.get("outcome") == "win"]
    pending = [t for t in tests if t.get("outcome") == "pending"]
    return {
        "total": len(tests),
        "completed": len(completed),
        "wins": len(wins),
        "pending": len(pending),
        "winRate": hypothesis.get("winRate", 0),
    }


def build_body(hypothesis: dict[str, Any]) -> dict[str, Any]:
    body: dict[str, Any] = {
        "hypothesisId": hypothesis["id"],
        "hypothesisStatus": hypothesis.get("status"),
        "description": hypothesis.get("description", ""),
        "prediction": hypothesis.get("prediction", ""),
        "conditions": hypothesis.get("conditions", {}),
        "confidence": hypothesis.get("confidence"),
        "timeframeDays": hypothesis.get("timeframeDays"),
        "testStats": test_stats(hypothesis),
        "promotedToSignal": bool(hypothesis.get("promotedToSignal")),
        "source": hypothesis.get("source", "unknown"),
        "created": hypothesis.get("created"),
    }
    if hypothesis.get("setupId"):
        body["setupId"] = hypothesis["setupId"]
    if hypothesis.get("setupLabel"):
        body["setupLabel"] = hypothesis["setupLabel"]
    post_mortem = hypothesis.get("postMortem")
    if post_mortem:
        body["postMortem"] = truncate(str(post_mortem), 2000)
    return body


def build_title(hypothesis: dict[str, Any]) -> str:
    hid = hypothesis.get("id", "unknown")
    desc = hypothesis.get("description", "")
    return truncate(f"{hid}: {desc}", 160)


def is_promoted(hypothesis: dict[str, Any]) -> bool:
    return hypothesis.get("status") == "promoted" or bool(
        hypothesis.get("promotedToSignal")
    )


def body_needs_update(existing_body: dict[str, Any], desired_body: dict[str, Any]) -> bool:
    for key, value in desired_body.items():
        if existing_body.get(key) != value:
            return True
    return False


def index_experiments(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_hypothesis: dict[str, dict[str, Any]] = {}
    for record in records:
        if record.get("type") != "experiment":
            continue
        body = record.get("body")
        if not isinstance(body, dict):
            continue
        hid = body.get("hypothesisId")
        if isinstance(hid, str) and hid:
            by_hypothesis[hid] = record
    return by_hypothesis


def index_promotion_decisions(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_hypothesis: dict[str, dict[str, Any]] = {}
    for record in records:
        if record.get("type") != "decision":
            continue
        body = record.get("body")
        if isinstance(body, dict):
            hid = body.get("hypothesisId")
            if isinstance(hid, str) and hid:
                by_hypothesis[hid] = record
                continue
        title = record.get("title", "")
        m = re.search(r"Promote hypothesis (H-\d+)", title)
        if m:
            by_hypothesis.setdefault(m.group(1), record)
    return by_hypothesis


def build_decision_record(
    hypothesis: dict[str, Any],
    experiment_id: str,
    records: list[dict[str, Any]],
) -> dict[str, Any]:
    hid = hypothesis["id"]
    stats = test_stats(hypothesis)
    return {
        "id": next_id(records, "decision"),
        "type": "decision",
        "evidenceClass": "DERIVED",
        "status": "final",
        "title": f"Promote hypothesis {hid} to live signal",
        "body": {
            "rationale": (
                f"Hypothesis {hid} reached promotion criteria "
                f"({stats['wins']}/{stats['completed']} wins, "
                f"winRate={stats['winRate']:.2f}) and is emitted as "
                f"PROMOTED_HYPOTHESIS by the trading engine."
            ),
            "hypothesisId": hid,
            "winRate": stats["winRate"],
            "completedTests": stats["completed"],
        },
        "links": {"relatedRecords": [experiment_id]},
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE,
    }


def sync(
    hypotheses_path: Path,
    registry_path: Path,
    apply: bool,
) -> dict[str, int]:
    hypotheses = load_json(hypotheses_path)
    if not isinstance(hypotheses, list):
        raise ValueError("hypotheses.json must be an array")

    registry = load_json(registry_path) if registry_path.exists() else {
        "version": REGISTRY_VERSION,
        "records": [],
    }
    records: list[dict[str, Any]] = list(registry.get("records", []))

    experiments_by_hid = index_experiments(records)
    decisions_by_hid = index_promotion_decisions(records)

    counts = {
        "created": 0,
        "updated": 0,
        "decisions_created": 0,
        "skipped": 0,
    }

    planned_creates: list[dict[str, Any]] = []
    planned_updates: list[tuple[dict[str, Any], str, dict[str, Any]]] = []
    planned_decisions: list[dict[str, Any]] = []

    for hypothesis in hypotheses:
        if not isinstance(hypothesis, dict) or "id" not in hypothesis:
            print("warning: skipping malformed hypothesis entry", file=sys.stderr)
            continue

        hid = hypothesis["id"]
        desired_status = map_status(str(hypothesis.get("status", "active")))
        desired_body = build_body(hypothesis)
        desired_title = build_title(hypothesis)

        existing = experiments_by_hid.get(hid)
        if existing is None:
            new_record = {
                "id": next_id(records + planned_creates, "experiment"),
                "type": "experiment",
                "evidenceClass": "HYPOTHESIS",
                "status": desired_status,
                "title": desired_title,
                "body": desired_body,
                "links": {},
                "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": SOURCE,
            }
            print(f"[CREATE] {new_record['id']} {hid} status={desired_status}")
            planned_creates.append(new_record)
            experiments_by_hid[hid] = new_record
            counts["created"] += 1
        else:
            status_changed = existing.get("status") != desired_status
            body_changed = body_needs_update(
                existing.get("body", {}) if isinstance(existing.get("body"), dict) else {},
                desired_body,
            )
            title_changed = existing.get("title") != desired_title
            if status_changed or body_changed or title_changed:
                changes: list[str] = []
                if status_changed:
                    changes.append(
                        f"status {existing.get('status')}->{desired_status}"
                    )
                if body_changed:
                    changes.append("body test-stats/fields")
                if title_changed:
                    changes.append("title")
                print(
                    f"[UPDATE] {existing['id']} {hid} "
                    + ", ".join(changes)
                )
                planned_updates.append((existing, desired_status, desired_body))
                if title_changed:
                    existing["title"] = desired_title
                counts["updated"] += 1
            else:
                print(f"[SKIP] {hid} unchanged")
                counts["skipped"] += 1

        if is_promoted(hypothesis):
            exp_record = experiments_by_hid[hid]
            exp_id = exp_record["id"]
            if hid not in decisions_by_hid:
                decision = build_decision_record(hypothesis, exp_id, records + planned_creates + planned_decisions)
                print(f"[DECISION CREATE] {decision['id']} Promote hypothesis {hid}")
                planned_decisions.append(decision)
                decisions_by_hid[hid] = decision
                counts["decisions_created"] += 1
            else:
                print(f"[DECISION SKIP] {hid} decision already exists")

    if apply:
        for record in planned_creates:
            records.append(record)
        for existing, desired_status, desired_body in planned_updates:
            existing["status"] = desired_status
            existing["body"] = deep_merge(
                existing.get("body", {}) if isinstance(existing.get("body"), dict) else {},
                desired_body,
            )
        for decision in planned_decisions:
            records.append(decision)

        registry["version"] = REGISTRY_VERSION
        registry["records"] = records
        write_registry(registry_path, registry)

    print(
        f"\nSummary: created {counts['created']}, updated {counts['updated']}, "
        f"decisions created {counts['decisions_created']}, "
        f"skipped unchanged {counts['skipped']}"
    )
    if not apply:
        print("(dry-run: no changes written; pass --apply to execute)")
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync hypotheses.json into registry experiment records"
    )
    parser.add_argument(
        "--hypotheses",
        type=Path,
        default=default_hypotheses_path(),
        help="path to hypotheses.json",
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=default_registry_path(),
        help="path to registry.json",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print planned changes without writing (default when --apply omitted)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write changes to registry",
    )
    args = parser.parse_args()

    if args.apply and args.dry_run:
        print("error: --apply and --dry-run are mutually exclusive", file=sys.stderr)
        return 1

    try:
        sync(args.hypotheses, args.registry, apply=args.apply)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
