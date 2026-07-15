#!/usr/bin/env python3
"""Research Registry CLI — manages data/registry.json (Phase 0)."""

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

VALID_TYPES = frozenset(TYPE_PREFIX)
VALID_EVIDENCE = frozenset({"VALID", "INVALID", "DERIVED", "HYPOTHESIS"})
VALID_STATUS = frozenset(
    {"proposed", "running", "final", "superseded", "retired", "active"}
)

ID_PATTERN = re.compile(
    r"^(STRAT|EXP|DEC|INC|PARAM)-(\d{4})$"
)

REQUIRED_BODY_FIELDS: dict[str, frozenset[str]] = {
    "incident": frozenset({"rootCause", "fix", "costUsd", "guard"}),
    "decision": frozenset({"rationale"}),
    "parameter-change": frozenset({"parameter", "from", "to"}),
}


def default_registry_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "registry.json"


def load_registry(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": REGISTRY_VERSION, "records": []}
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError("registry root must be an object")
    return data


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


def validate_record(record: Any, index: int | None = None) -> list[str]:
    errors: list[str] = []
    prefix = f"record[{index}]" if index is not None else "record"

    if not isinstance(record, dict):
        return [f"{prefix}: must be an object"]

    rid = record.get("id")
    if not isinstance(rid, str) or not ID_PATTERN.match(rid):
        errors.append(f"{prefix}: invalid or missing id '{rid}'")

    rtype = record.get("type")
    if rtype not in VALID_TYPES:
        errors.append(f"{prefix}: invalid type '{rtype}'")

    evidence = record.get("evidenceClass")
    if evidence not in VALID_EVIDENCE:
        errors.append(f"{prefix}: invalid evidenceClass '{evidence}'")

    status = record.get("status")
    if status not in VALID_STATUS:
        errors.append(f"{prefix}: invalid status '{status}'")

    title = record.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append(f"{prefix}: title must be a non-empty string")

    body = record.get("body")
    if not isinstance(body, dict):
        errors.append(f"{prefix}: body must be an object")
    elif rtype in REQUIRED_BODY_FIELDS:
        for field in REQUIRED_BODY_FIELDS[rtype]:
            if field not in body:
                errors.append(
                    f"{prefix}: body missing required field '{field}' for type '{rtype}'"
                )

    links = record.get("links")
    if links is not None and not isinstance(links, dict):
        errors.append(f"{prefix}: links must be an object")

    created = record.get("created")
    if not isinstance(created, str):
        errors.append(f"{prefix}: created must be an ISO timestamp string")
    else:
        try:
            datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            errors.append(f"{prefix}: created is not valid ISO timestamp '{created}'")

    source = record.get("source")
    if not isinstance(source, str) or not source.strip():
        errors.append(f"{prefix}: source must be a non-empty string")

    if "needsOperatorAnnotation" in record:
        if not isinstance(record["needsOperatorAnnotation"], bool):
            errors.append(f"{prefix}: needsOperatorAnnotation must be boolean")

    if isinstance(rid, str) and isinstance(rtype, str) and ID_PATTERN.match(rid):
        expected_prefix = TYPE_PREFIX.get(rtype)
        actual_prefix = rid.split("-")[0]
        if expected_prefix != actual_prefix:
            errors.append(
                f"{prefix}: id prefix '{actual_prefix}' does not match type '{rtype}'"
            )

    return errors


def validate_registry(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    if data.get("version") != REGISTRY_VERSION:
        errors.append(f"version must be {REGISTRY_VERSION}")

    records = data.get("records")
    if not isinstance(records, list):
        errors.append("records must be an array")
        return errors

    seen_ids: set[str] = set()
    for i, record in enumerate(records):
        rec_errors = validate_record(record, i)
        errors.extend(rec_errors)
        rid = record.get("id") if isinstance(record, dict) else None
        if isinstance(rid, str):
            if rid in seen_ids:
                errors.append(f"duplicate id '{rid}'")
            seen_ids.add(rid)

    return errors


def next_id(records: list[dict[str, Any]], rtype: str) -> str:
    prefix = TYPE_PREFIX[rtype]
    max_num = 0
    for record in records:
        rid = record.get("id", "")
        m = ID_PATTERN.match(rid)
        if m and m.group(1) == prefix:
            max_num = max(max_num, int(m.group(2)))
    return f"{prefix}-{max_num + 1:04d}"


def parse_json_arg(raw: str, label: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON for {label}: {exc}", file=sys.stderr)
        sys.exit(1)


def record_matches_text(record: dict[str, Any], text: str) -> bool:
    needle = text.casefold()
    haystack = json.dumps(
        {"title": record.get("title", ""), "body": record.get("body", {})},
        ensure_ascii=False,
    ).casefold()
    return needle in haystack


def cmd_validate(args: argparse.Namespace) -> int:
    data = load_registry(args.registry)
    errors = validate_registry(data)
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1
    print(f"ok: {len(data.get('records', []))} record(s) valid")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    if args.type not in VALID_TYPES:
        print(f"error: invalid type '{args.type}'", file=sys.stderr)
        return 1
    if args.evidence_class not in VALID_EVIDENCE:
        print(f"error: invalid evidenceClass '{args.evidence_class}'", file=sys.stderr)
        return 1
    if args.status not in VALID_STATUS:
        print(f"error: invalid status '{args.status}'", file=sys.stderr)
        return 1

    body = parse_json_arg(args.body, "--body")
    if not isinstance(body, dict):
        print("error: --body must be a JSON object", file=sys.stderr)
        return 1

    links = {}
    if args.links:
        links = parse_json_arg(args.links, "--links")
        if not isinstance(links, dict):
            print("error: --links must be a JSON object", file=sys.stderr)
            return 1

    data = load_registry(args.registry)
    records = data.setdefault("records", [])

    record: dict[str, Any] = {
        "id": next_id(records, args.type),
        "type": args.type,
        "evidenceClass": args.evidence_class,
        "status": args.status,
        "title": args.title,
        "body": body,
        "links": links,
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": args.source,
    }

    rec_errors = validate_record(record)
    if rec_errors:
        for err in rec_errors:
            print(f"error: {err}", file=sys.stderr)
        return 1

    errors = validate_registry({"version": REGISTRY_VERSION, "records": records + [record]})
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1

    records.append(record)
    data["version"] = REGISTRY_VERSION
    write_registry(args.registry, data)
    print(json.dumps(record, indent=2, ensure_ascii=False))
    return 0


def deep_merge(base: Any, patch: Any) -> Any:
    """Merge `patch` into `base`. Dicts are merged key-by-key (recursively);
    lists are concatenated (base + patch) so callers can "append" to an
    existing array field (e.g. body.runs) without clobbering prior entries;
    any other type in `patch` overwrites the corresponding `base` value."""
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


def cmd_update_body(args: argparse.Namespace) -> int:
    data = load_registry(args.registry)
    records = data.get("records", [])
    target = None
    for record in records:
        if record.get("id") == args.id:
            target = record
            break
    if target is None:
        print(f"error: record not found: {args.id}", file=sys.stderr)
        return 1

    patch = parse_json_arg(args.body, "--body")
    if not isinstance(patch, dict):
        print("error: --body must be a JSON object", file=sys.stderr)
        return 1

    target["body"] = deep_merge(target.get("body", {}), patch)

    errors = validate_registry(data)
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1

    write_registry(args.registry, data)
    print(json.dumps(target, indent=2, ensure_ascii=False))
    return 0


def filter_records(
    records: list[dict[str, Any]], args: argparse.Namespace
) -> list[dict[str, Any]]:
    result = records
    if getattr(args, "type", None):
        result = [r for r in result if r.get("type") == args.type]
    if getattr(args, "id", None):
        result = [r for r in result if r.get("id") == args.id]
    if getattr(args, "status", None):
        result = [r for r in result if r.get("status") == args.status]
    if getattr(args, "text", None):
        result = [r for r in result if record_matches_text(r, args.text)]
    return result


def cmd_query(args: argparse.Namespace) -> int:
    data = load_registry(args.registry)
    records = filter_records(data.get("records", []), args)
    print(json.dumps(records, indent=2, ensure_ascii=False))
    return 0


def cmd_timeline(args: argparse.Namespace) -> int:
    data = load_registry(args.registry)
    records = filter_records(data.get("records", []), args)

    def sort_key(r: dict[str, Any]) -> str:
        return r.get("created", "")

    for record in sorted(records, key=sort_key):
        created = record.get("created", "")
        date_part = created[:10] if len(created) >= 10 else created
        print(
            f"{record.get('id')} | {date_part} | {record.get('type')} | "
            f"{record.get('status')} | {record.get('title')}"
        )
    return 0


def cmd_supersede(args: argparse.Namespace) -> int:
    data = load_registry(args.registry)
    records = data.get("records", [])
    old_record = None
    new_record = None
    for record in records:
        if record.get("id") == args.id:
            old_record = record
        if record.get("id") == args.by:
            new_record = record

    if old_record is None:
        print(f"error: record not found: {args.id}", file=sys.stderr)
        return 1
    if new_record is None:
        print(f"error: record not found: {args.by}", file=sys.stderr)
        return 1

    old_record["status"] = "superseded"
    links = old_record.setdefault("links", {})
    links["supersededBy"] = args.by

    errors = validate_registry(data)
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1

    write_registry(args.registry, data)
    print(f"ok: {args.id} superseded by {args.by}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Research Registry CLI")
    parser.add_argument(
        "--registry",
        type=Path,
        default=default_registry_path(),
        help="path to registry.json (default: ../data/registry.json)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("validate", help="validate registry schema")

    add_p = sub.add_parser("add", help="add a new record")
    add_p.add_argument("--type", required=True, choices=sorted(VALID_TYPES))
    add_p.add_argument("--title", required=True)
    add_p.add_argument("--evidence-class", required=True, dest="evidence_class")
    add_p.add_argument("--status", required=True)
    add_p.add_argument("--body", required=True)
    add_p.add_argument("--links", default=None)
    add_p.add_argument("--source", default="operator")

    query_p = sub.add_parser("query", help="query records")
    query_p.add_argument("--type", default=None, choices=sorted(VALID_TYPES))
    query_p.add_argument("--id", default=None)
    query_p.add_argument("--text", default=None)
    query_p.add_argument("--status", default=None, choices=sorted(VALID_STATUS))

    timeline_p = sub.add_parser("timeline", help="chronological one-line summary")
    timeline_p.add_argument("--text", default=None)

    supersede_p = sub.add_parser("supersede", help="mark record superseded")
    supersede_p.add_argument("--id", required=True)
    supersede_p.add_argument("--by", required=True)

    update_body_p = sub.add_parser(
        "update-body",
        help="merge a JSON fragment into an existing record's body (dicts merge "
        "key-by-key; lists concatenate, i.e. append)",
    )
    update_body_p.add_argument("--id", required=True)
    update_body_p.add_argument("--body", required=True, help="JSON object fragment to merge into body")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    handlers = {
        "validate": cmd_validate,
        "add": cmd_add,
        "query": cmd_query,
        "timeline": cmd_timeline,
        "supersede": cmd_supersede,
        "update-body": cmd_update_body,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
