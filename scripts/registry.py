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
    "finding": "FIND",
    "theme": "THEME",
}

VALID_TYPES = frozenset(TYPE_PREFIX)
VALID_EVIDENCE = frozenset({"VALID", "INVALID", "DERIVED", "HYPOTHESIS"})
VALID_STATUS = frozenset(
    {
        "proposed",
        "running",
        "final",
        "superseded",
        "retired",
        "active",
        "open",
        "strengthened",
        "weakened",
        "resolved",
        "negative",
    }
)

ID_PATTERN = re.compile(
    r"^(STRAT|EXP|DEC|INC|PARAM|FIND|THEME)-(\d{4})$"
)

REQUIRED_BODY_FIELDS: dict[str, frozenset[str]] = {
    "incident": frozenset({"rootCause", "fix", "costUsd", "guard"}),
    "decision": frozenset({"rationale"}),
    "parameter-change": frozenset({"parameter", "from", "to"}),
    "finding": frozenset({"clusterKey", "evidence", "provenance"}),
    "theme": frozenset({"slug", "family"}),
}

PROVENANCE_REQUIRED_KEYS = frozenset(
    {
        "generatedBy",
        "inputWindow",
        "featureSet",
        "scoringVersion",
        "gitSha",
        "inputArtifacts",
        "filters",
        "reproducibleCommand",
    }
)

EVIDENCE_REQUIRED_KEYS = frozenset({"n", "winRate", "sumPnl"})


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


def validate_provenance(provenance: Any, prefix: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(provenance, dict):
        return [f"{prefix}: provenance must be an object"]
    for key in PROVENANCE_REQUIRED_KEYS:
        if key not in provenance:
            errors.append(f"{prefix}: provenance missing required key '{key}'")
    input_window = provenance.get("inputWindow")
    if not isinstance(input_window, dict):
        errors.append(f"{prefix}: provenance.inputWindow must be an object")
    else:
        for key in ("start", "end"):
            if key not in input_window:
                errors.append(
                    f"{prefix}: provenance.inputWindow missing required key '{key}'"
                )
    if "inputArtifacts" in provenance and not isinstance(
        provenance["inputArtifacts"], list
    ):
        errors.append(f"{prefix}: provenance.inputArtifacts must be a list")
    if "filters" in provenance and not isinstance(provenance["filters"], dict):
        errors.append(f"{prefix}: provenance.filters must be an object")
    git_sha = provenance.get("gitSha")
    if git_sha is not None and not isinstance(git_sha, str):
        errors.append(f"{prefix}: provenance.gitSha must be a string")
    return errors


def validate_evidence(evidence: Any, prefix: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(evidence, dict):
        return [f"{prefix}: evidence must be an object"]
    for key in EVIDENCE_REQUIRED_KEYS:
        if key not in evidence:
            errors.append(f"{prefix}: evidence missing required key '{key}'")
    return errors


def validate_finding_body(body: dict[str, Any], prefix: str) -> list[str]:
    errors: list[str] = []
    errors.extend(validate_evidence(body.get("evidence"), f"{prefix}.body"))
    errors.extend(validate_provenance(body.get("provenance"), f"{prefix}.body"))
    history = body.get("provenanceHistory")
    if history is not None:
        if not isinstance(history, list):
            errors.append(f"{prefix}.body: provenanceHistory must be a list")
        else:
            for i, item in enumerate(history):
                errors.extend(
                    validate_provenance(item, f"{prefix}.body.provenanceHistory[{i}]")
                )
    score_history = body.get("scoreHistory")
    if score_history is not None and not isinstance(score_history, list):
        errors.append(f"{prefix}.body: scoreHistory must be a list")
    return errors


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
        if rtype == "finding":
            errors.extend(validate_finding_body(body, prefix))

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


def find_finding_by_cluster_key(
    records: list[dict[str, Any]], cluster_key: str
) -> dict[str, Any] | None:
    for record in records:
        if record.get("type") != "finding":
            continue
        body = record.get("body") or {}
        if body.get("clusterKey") == cluster_key:
            return record
    return None


def _evidence_strengthened(old_evidence: dict[str, Any], new_evidence: dict[str, Any]) -> bool:
    old_n = old_evidence.get("n")
    old_wr = old_evidence.get("winRate")
    new_n = new_evidence.get("n")
    new_wr = new_evidence.get("winRate")
    if isinstance(old_n, (int, float)) and isinstance(new_n, (int, float)) and new_n > old_n:
        return True
    if (
        isinstance(old_wr, (int, float))
        and isinstance(new_wr, (int, float))
        and new_wr > old_wr
    ):
        return True
    return False


def _evidence_weakened(old_evidence: dict[str, Any], new_evidence: dict[str, Any]) -> bool:
    old_n = old_evidence.get("n")
    old_wr = old_evidence.get("winRate")
    new_n = new_evidence.get("n")
    new_wr = new_evidence.get("winRate")
    if isinstance(old_n, (int, float)) and isinstance(new_n, (int, float)) and new_n < old_n:
        return True
    if (
        isinstance(old_wr, (int, float))
        and isinstance(new_wr, (int, float))
        and new_wr < old_wr
    ):
        return True
    return False


def upsert_finding(
    registry_path: Path,
    body: dict[str, Any],
    title: str,
    source: str = "shadow_miner_v1",
    evidence_class: str = "DERIVED",
    links: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create or update a FIND record keyed by body['clusterKey']."""
    cluster_key = body.get("clusterKey")
    if not isinstance(cluster_key, str) or not cluster_key.strip():
        raise ValueError("body.clusterKey must be a non-empty string")
    if evidence_class not in VALID_EVIDENCE:
        raise ValueError(f"invalid evidenceClass '{evidence_class}'")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = load_registry(registry_path)
    records = data.setdefault("records", [])
    existing = find_finding_by_cluster_key(records, cluster_key)

    if existing is None:
        create_body = dict(body)
        create_body.setdefault("detectedAt", now)
        create_body["lastSeenAt"] = now
        record: dict[str, Any] = {
            "id": next_id(records, "finding"),
            "type": "finding",
            "evidenceClass": evidence_class,
            "status": "open",
            "title": title,
            "body": create_body,
            "links": links or {},
            "created": now,
            "source": source,
        }
        rec_errors = validate_record(record)
        if rec_errors:
            raise ValueError("; ".join(rec_errors))
        records.append(record)
        data["version"] = REGISTRY_VERSION
        write_registry(registry_path, data)
        return record

    old_body = dict(existing.get("body") or {})
    old_status = existing.get("status")
    old_evidence = dict(old_body.get("evidence") or {})
    new_evidence = body.get("evidence") or {}

    updated_body = dict(old_body)
    updated_body["evidence"] = new_evidence
    updated_body["lastSeenAt"] = now

    if "provenance" in body:
        old_provenance = old_body.get("provenance")
        if old_provenance:
            history = list(updated_body.get("provenanceHistory") or [])
            history.append(old_provenance)
            updated_body["provenanceHistory"] = history
        updated_body["provenance"] = body["provenance"]

    optional_fields = (
        "asset",
        "signalType",
        "side",
        "bucket",
        "mineStats",
        "sampleShadowIds",
        "opportunityScore",
        "confidenceScore",
    )
    for field in optional_fields:
        if field in body:
            updated_body[field] = body[field]

    if body.get("opportunityScore") is not None or body.get("confidenceScore") is not None:
        score_entry: dict[str, Any] = {"at": now}
        if body.get("opportunityScore") is not None:
            score_entry["opportunityScore"] = body["opportunityScore"]
        if body.get("confidenceScore") is not None:
            score_entry["confidenceScore"] = body["confidenceScore"]
        score_history = list(updated_body.get("scoreHistory") or [])
        score_history.append(score_entry)
        updated_body["scoreHistory"] = score_history

    existing["title"] = title
    existing["body"] = updated_body

    if old_status != "negative":
        if old_status == "open":
            if _evidence_strengthened(old_evidence, new_evidence):
                existing["status"] = "strengthened"
            elif _evidence_weakened(old_evidence, new_evidence):
                existing["status"] = "weakened"

    rec_errors = validate_record(existing)
    if rec_errors:
        raise ValueError("; ".join(rec_errors))

    data["version"] = REGISTRY_VERSION
    write_registry(registry_path, data)
    return existing


def find_theme_by_slug(
    records: list[dict[str, Any]], slug: str
) -> dict[str, Any] | None:
    for record in records:
        if record.get("type") != "theme":
            continue
        body = record.get("body") or {}
        if body.get("slug") == slug:
            return record
    return None


def find_record_by_id(
    records: list[dict[str, Any]], record_id: str
) -> dict[str, Any] | None:
    for record in records:
        if record.get("id") == record_id:
            return record
    return None


def upsert_theme(
    registry_path: Path,
    slug: str,
    title: str,
    body_extra: dict[str, Any] | None = None,
    source: str = "assign_research_themes_v1",
) -> dict[str, Any]:
    """Create or update a THEME record keyed by body['slug']."""
    if not isinstance(slug, str) or not slug.strip():
        raise ValueError("slug must be a non-empty string")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = load_registry(registry_path)
    records = data.setdefault("records", [])
    existing = find_theme_by_slug(records, slug)

    family = (body_extra or {}).get("family") or slug
    body: dict[str, Any] = {"slug": slug, "family": family}
    if body_extra:
        body.update(body_extra)
    body["slug"] = slug
    body.setdefault("family", family)

    if existing is None:
        record: dict[str, Any] = {
            "id": next_id(records, "theme"),
            "type": "theme",
            "evidenceClass": "DERIVED",
            "status": "active",
            "title": title,
            "body": body,
            "links": {"findings": []},
            "created": now,
            "source": source,
        }
        rec_errors = validate_record(record)
        if rec_errors:
            raise ValueError("; ".join(rec_errors))
        records.append(record)
        data["version"] = REGISTRY_VERSION
        write_registry(registry_path, data)
        return record

    existing["title"] = title
    merged_body = dict(existing.get("body") or {})
    merged_body.update(body)
    existing["body"] = merged_body
    existing.setdefault("links", {}).setdefault("findings", [])

    rec_errors = validate_record(existing)
    if rec_errors:
        raise ValueError("; ".join(rec_errors))

    data["version"] = REGISTRY_VERSION
    write_registry(registry_path, data)
    return existing


def assign_finding_theme(
    registry_path: Path,
    finding_id: str,
    theme_id: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Link a FIND to a THEME via body.themeId and links.findings."""
    data = load_registry(registry_path)
    records = data.setdefault("records", [])
    finding = find_record_by_id(records, finding_id)
    theme = find_record_by_id(records, theme_id)

    if finding is None:
        raise ValueError(f"finding not found: {finding_id}")
    if theme is None:
        raise ValueError(f"theme not found: {theme_id}")
    if finding.get("type") != "finding":
        raise ValueError(f"{finding_id} is not a finding record")
    if theme.get("type") != "theme":
        raise ValueError(f"{theme_id} is not a theme record")

    body = dict(finding.get("body") or {})
    body["themeId"] = theme_id
    finding["body"] = body

    links = theme.setdefault("links", {})
    findings = list(links.get("findings") or [])
    if finding_id not in findings:
        findings.append(finding_id)
        findings.sort()
    links["findings"] = findings

    rec_errors = validate_record(finding)
    if rec_errors:
        raise ValueError(f"{finding_id}: {'; '.join(rec_errors)}")
    rec_errors = validate_record(theme)
    if rec_errors:
        raise ValueError(f"{theme_id}: {'; '.join(rec_errors)}")

    data["version"] = REGISTRY_VERSION
    write_registry(registry_path, data)
    return finding, theme


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
