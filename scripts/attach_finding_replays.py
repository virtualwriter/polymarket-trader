#!/usr/bin/env python3
"""Attach replay evidence to top-ranked FIND records (Phase G).

Plans or runs short offline replay harness windows for the highest opportunity
FIND records only, then appends replay links and best-effort replay evidence to
registry records. Harness failures are recorded as skipped evidence so nightly
research can continue.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
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

DEFAULT_OPPORTUNITIES = REPO / "data" / "research-opportunities.json"
DEFAULT_PLAN = REPO / "data" / "finding-replay-plan.json"
ARCHIVE_RE = re.compile(r"instrument-snapshots-(\d{4})(\d{2})(\d{2})T")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def signal_from_cluster_key(cluster_key: str) -> str:
    return cluster_key.split("|", 1)[0].strip()


def available_archive_dates(repo: Path = REPO) -> list[str]:
    dates: set[str] = set()
    archive_dir = repo / "data" / "instrument-snapshot-archives"
    if archive_dir.exists():
        for path in archive_dir.iterdir():
            match = ARCHIVE_RE.search(path.name)
            if match:
                dates.add(f"{match.group(1)}-{match.group(2)}-{match.group(3)}")
    return sorted(dates)


def choose_replay_window(repo: Path = REPO, env: dict[str, str] | None = None) -> dict[str, Any]:
    env = env or os.environ
    if env.get("REPLAY_START") and env.get("REPLAY_END"):
        return {"start": env["REPLAY_START"], "end": env["REPLAY_END"], "source": "env"}

    dates = available_archive_dates(repo)
    parsed = []
    for value in dates:
        try:
            parsed.append(datetime.strptime(value, "%Y-%m-%d").date())
        except ValueError:
            continue
    date_set = set(parsed)

    for day in sorted(parsed, reverse=True):
        if day.weekday() == 6:
            saturday = day.fromordinal(day.toordinal() - 1)
            if saturday in date_set:
                return {
                    "start": saturday.isoformat(),
                    "end": day.isoformat(),
                    "source": "latest_complete_weekend_archives",
                }

    if len(parsed) >= 2:
        last_two = sorted(parsed)[-2:]
        return {
            "start": last_two[0].isoformat(),
            "end": last_two[1].isoformat(),
            "source": "latest_two_archive_dates",
        }

    return {"start": "2026-07-11", "end": "2026-07-12", "source": "fallback_known_good"}


def opportunities_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        rows = payload.get("opportunities") or []
    elif isinstance(payload, list):
        rows = payload
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)]


def select_candidates(opportunities_payload: Any, registry: dict[str, Any], *, top_k: int) -> list[dict[str, Any]]:
    records = list(registry.get("records") or [])
    rows = sorted(
        opportunities_list(opportunities_payload),
        key=lambda row: float(row.get("opportunityScore") or 0),
        reverse=True,
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(out) >= top_k:
            break
        if row.get("status") == "negative":
            continue
        rid = row.get("id")
        if not isinstance(rid, str):
            continue
        record = find_record_by_id(records, rid)
        if record is None or record.get("type") != "finding" or record.get("status") == "negative":
            continue
        body = record.get("body") or {}
        cluster_key = str(row.get("clusterKey") or body.get("clusterKey") or "")
        signal = signal_from_cluster_key(cluster_key)
        if not signal:
            continue
        out.append(
            {
                "id": rid,
                "rank": row.get("rank"),
                "title": row.get("title") or record.get("title"),
                "clusterKey": cluster_key,
                "signals": signal,
                "opportunityScore": row.get("opportunityScore", body.get("opportunityScore")),
                "confidenceScore": row.get("confidenceScore", body.get("confidenceScore")),
                "status": record.get("status"),
            }
        )
    return out


def sandbox_for_finding(finding_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", finding_id)
    return f"/tmp/finding-replay-{safe}"


def build_harness_command(candidate: dict[str, Any], *, start: str, end: str, sandbox: str, limit_hours: int) -> list[str]:
    return [
        "npx", "tsx", "scripts/replay-harness.ts",
        "--start", start,
        "--end", end,
        "--sandbox", sandbox,
        "--signals", str(candidate["signals"]),
        "--limit-hours", str(limit_hours),
        "--keep-going",
    ]


def reproducible_command(command: list[str]) -> str:
    return "cd /opt/polymarket-trader && " + shlex.join(command)


def build_plan(candidates: list[dict[str, Any]], *, window: dict[str, Any], limit_hours: int, attach_from: Path | None = None, now: datetime | None = None) -> dict[str, Any]:
    now = now or utc_now()
    planned = []
    for candidate in candidates:
        sandbox = str(attach_from) if attach_from else sandbox_for_finding(str(candidate["id"]))
        command = build_harness_command(candidate, start=str(window["start"]), end=str(window["end"]), sandbox=sandbox, limit_hours=limit_hours)
        row = dict(candidate)
        row.update({
            "sandbox": sandbox,
            "summaryPath": str(Path(sandbox) / "replay-report.json"),
            "reproducibleCommand": reproducible_command(command),
        })
        planned.append(row)
    return {
        "generatedAt": isoformat_z(now),
        "mode": "plan",
        "window": window,
        "limitHours": limit_hours,
        "candidateCount": len(planned),
        "candidates": planned,
    }


def parse_replay_report(summary_path: Path, *, candidate: dict[str, Any], attached_at: str) -> dict[str, Any]:
    report = load_json(summary_path)
    totals = report.get("totals") or {}
    window = report.get("window") or {}
    config = report.get("config") or {}
    signals = config.get("signalsFilter") or [candidate.get("signals")]
    return {
        "status": "attached",
        "tradeCount": int(totals.get("closedTrades") or 0),
        "totalPnl": float(totals.get("totalPnl") or 0),
        "window": {
            "start": window.get("start"),
            "end": window.get("end"),
            "hoursReplayed": report.get("hoursReplayed"),
            "hoursFailed": report.get("hoursFailed"),
        },
        "signals": signals,
        "opportunityScoreAtAttach": candidate.get("opportunityScore"),
        "attachedAt": attached_at,
    }


def skipped_evidence(*, reason: str, candidate: dict[str, Any], window: dict[str, Any], attached_at: str) -> dict[str, Any]:
    return {
        "status": "skipped",
        "reason": reason,
        "tradeCount": 0,
        "totalPnl": 0,
        "window": {"start": window.get("start"), "end": window.get("end")},
        "signals": [candidate.get("signals")],
        "opportunityScoreAtAttach": candidate.get("opportunityScore"),
        "attachedAt": attached_at,
    }


def attach_to_registry(registry_path: Path, candidate: dict[str, Any], *, sandbox: str, summary_path: Path, evidence: dict[str, Any], started: str, ended: str, reproducible_cmd: str, dry_run: bool = False) -> dict[str, Any]:
    data = load_registry(registry_path)
    records = list(data.get("records") or [])
    record = find_record_by_id(records, str(candidate["id"]))
    if record is None or record.get("type") != "finding":
        raise ValueError(f"missing FIND record {candidate['id']}")

    links = dict(record.get("links") or {})
    replays = list(links.get("replays") or [])
    link_entry = {
        "sandbox": sandbox,
        "started": started,
        "ended": ended,
        "signals": [candidate.get("signals")],
        "summaryPath": str(summary_path),
        "attachedAt": evidence.get("attachedAt") or ended,
        "reproducibleCommand": reproducible_cmd,
    }
    if evidence.get("status") == "skipped":
        link_entry["status"] = "skipped"
        link_entry["reason"] = evidence.get("reason")
    replays.append(link_entry)
    links["replays"] = replays

    body = dict(record.get("body") or {})
    body["replayEvidence"] = evidence
    record["links"] = links
    record["body"] = body

    if not dry_run:
        data["records"] = records
        data["version"] = REGISTRY_VERSION
        errors = validate_registry(data)
        if errors:
            raise ValueError("; ".join(errors))
        write_registry(registry_path, data)
    return record


def run_or_attach(candidate: dict[str, Any], *, registry_path: Path, window: dict[str, Any], limit_hours: int, attach_from: Path | None, dry_run: bool) -> dict[str, Any]:
    sandbox = str(attach_from) if attach_from else sandbox_for_finding(str(candidate["id"]))
    command = build_harness_command(candidate, start=str(window["start"]), end=str(window["end"]), sandbox=sandbox, limit_hours=limit_hours)
    repro = reproducible_command(command)
    summary_path = Path(sandbox) / "replay-report.json"
    started = isoformat_z(utc_now())
    reason = ""

    if dry_run:
        return {"id": candidate["id"], "status": "planned", "sandbox": sandbox, "reproducibleCommand": repro}

    if attach_from is None:
        try:
            result = subprocess.run(command, cwd=REPO, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=None, check=False)
            if result.returncode != 0:
                reason = f"harness exited {result.returncode}"
        except Exception as exc:  # noqa: BLE001
            reason = f"harness error: {exc}"

    ended = isoformat_z(utc_now())
    attached_at = ended
    if summary_path.exists() and not reason:
        try:
            evidence = parse_replay_report(summary_path, candidate=candidate, attached_at=attached_at)
        except Exception as exc:  # noqa: BLE001
            reason = f"could not parse replay report: {exc}"
            evidence = skipped_evidence(reason=reason, candidate=candidate, window=window, attached_at=attached_at)
    else:
        if not reason:
            reason = f"missing replay report {summary_path}"
        evidence = skipped_evidence(reason=reason, candidate=candidate, window=window, attached_at=attached_at)

    attach_to_registry(
        registry_path,
        candidate,
        sandbox=sandbox,
        summary_path=summary_path,
        evidence=evidence,
        started=started,
        ended=ended,
        reproducible_cmd=repro,
        dry_run=False,
    )
    return {"id": candidate["id"], "status": evidence.get("status"), "sandbox": sandbox, "summaryPath": str(summary_path), "reason": evidence.get("reason"), "replayEvidence": evidence}


def attach_finding_replays(*, registry_path: Path, opportunities_path: Path, plan_path: Path, top_k: int, limit_hours: int, plan_only: bool, dry_run: bool, attach_from: Path | None = None) -> dict[str, Any]:
    registry = load_registry(registry_path)
    opportunities_payload = load_json(opportunities_path)
    candidates = select_candidates(opportunities_payload, registry, top_k=top_k)
    window = choose_replay_window(REPO)
    plan = build_plan(candidates, window=window, limit_hours=limit_hours, attach_from=attach_from)
    write_json(plan_path, plan)

    results: list[dict[str, Any]] = []
    if not plan_only:
        for candidate in candidates:
            results.append(run_or_attach(candidate, registry_path=registry_path, window=window, limit_hours=limit_hours, attach_from=attach_from, dry_run=dry_run))

    return {"planPath": str(plan_path), "candidateCount": len(candidates), "planOnly": plan_only, "dryRun": dry_run, "window": window, "results": results}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--top-k", type=int, default=1)
    ap.add_argument("--limit-hours", type=int, default=2)
    ap.add_argument("--plan-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--registry", type=Path, default=default_registry_path())
    ap.add_argument("--opportunities", type=Path, default=DEFAULT_OPPORTUNITIES)
    ap.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    ap.add_argument("--attach-from", type=Path)
    args = ap.parse_args()

    if args.top_k < 1:
        raise SystemExit("--top-k must be >= 1")
    if args.limit_hours < 1:
        raise SystemExit("--limit-hours must be >= 1")

    result = attach_finding_replays(
        registry_path=args.registry,
        opportunities_path=args.opportunities,
        plan_path=args.plan,
        top_k=args.top_k,
        limit_hours=args.limit_hours,
        plan_only=args.plan_only or args.dry_run,
        dry_run=args.dry_run,
        attach_from=args.attach_from,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
