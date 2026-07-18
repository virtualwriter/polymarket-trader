#!/usr/bin/env python3
"""Attach short replay evidence to top-ranked FIND records (Phase G).

The script is intentionally conservative: it plans every run into
``data/finding-replay-plan.json`` and only replays the highest opportunity FINDs
selected from ``data/research-opportunities.json``. Nightly can run this in
``--plan-only`` mode cheaply, and operators can opt into real attachment with
``FIND_REPLAY_ATTACH=1``.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import REGISTRY_VERSION, load_registry, validate_registry, write_registry  # noqa: E402

DEFAULT_REGISTRY = REPO / "data" / "registry.json"
DEFAULT_OPPORTUNITIES = REPO / "data" / "research-opportunities.json"
DEFAULT_PLAN = REPO / "data" / "finding-replay-plan.json"
DEFAULT_LIMIT_HOURS = 2
DEFAULT_TOP_K = 1
FALLBACK_START = "2026-07-11"
FALLBACK_END = "2026-07-12"


@dataclass(frozen=True)
class ReplayCandidate:
    finding_id: str
    rank: int | None
    title: str
    cluster_key: str
    signals: str
    opportunity_score: float | None
    confidence_score: float | None
    status: str | None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_z(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def signal_family(cluster_key: str) -> str:
    return str(cluster_key or "").split("|", 1)[0].strip()


def registry_status_by_id(registry: dict[str, Any]) -> dict[str, str]:
    return {
        str(r.get("id")): str(r.get("status"))
        for r in registry.get("records", [])
        if isinstance(r, dict) and r.get("type") == "finding"
    }


def select_candidates(
    opportunities: dict[str, Any],
    registry: dict[str, Any],
    top_k: int,
) -> list[ReplayCandidate]:
    statuses = registry_status_by_id(registry)
    rows = list(opportunities.get("opportunities") or [])
    rows.sort(
        key=lambda r: (
            float(r.get("opportunityScore") or 0),
            float(r.get("confidenceScore") or 0),
        ),
        reverse=True,
    )
    selected: list[ReplayCandidate] = []
    for row in rows:
        if len(selected) >= top_k:
            break
        finding_id = str(row.get("id") or "")
        if not finding_id:
            continue
        status = statuses.get(finding_id, row.get("status"))
        if status == "negative":
            continue
        cluster_key = str(row.get("clusterKey") or "")
        signals = signal_family(cluster_key)
        if not signals:
            continue
        selected.append(
            ReplayCandidate(
                finding_id=finding_id,
                rank=row.get("rank") if isinstance(row.get("rank"), int) else None,
                title=str(row.get("title") or ""),
                cluster_key=cluster_key,
                signals=signals,
                opportunity_score=(float(row["opportunityScore"]) if row.get("opportunityScore") is not None else None),
                confidence_score=(float(row["confidenceScore"]) if row.get("confidenceScore") is not None else None),
                status=str(status) if status is not None else None,
            )
        )
    return selected


def archive_dates(repo: Path = REPO) -> set[date]:
    archive_dir = repo / "data" / "instrument-snapshot-archives"
    dates: set[date] = set()
    if not archive_dir.exists():
        return dates
    pattern = re.compile(r"(\d{4})(\d{2})(\d{2})T\d{6}Z")
    for path in archive_dir.iterdir():
        match = pattern.search(path.name)
        if not match:
            continue
        try:
            dates.add(date(int(match.group(1)), int(match.group(2)), int(match.group(3))))
        except ValueError:
            continue
    return dates


def choose_window(repo: Path = REPO) -> tuple[str, str, str]:
    env_start = os.environ.get("REPLAY_START")
    env_end = os.environ.get("REPLAY_END")
    if env_start and env_end:
        return env_start, env_end, "env"

    dates = sorted(archive_dates(repo))
    if dates:
        date_set = set(dates)
        ordinals = {x.toordinal() for x in date_set}
        for d in reversed(dates):
            if d.weekday() == 5 and d.toordinal() + 1 in ordinals:
                end = date.fromordinal(d.toordinal() + 1)
                return d.isoformat(), end.isoformat(), "latest_available_weekend"
        if len(dates) >= 2:
            return dates[-2].isoformat(), dates[-1].isoformat(), "latest_two_archive_days"
        return dates[-1].isoformat(), dates[-1].isoformat(), "latest_archive_day"

    return FALLBACK_START, FALLBACK_END, "fallback"


def sandbox_for(candidate: ReplayCandidate) -> Path:
    return Path("/tmp") / f"finding-replay-{candidate.finding_id}"


def replay_command(candidate: ReplayCandidate, start: str, end: str, limit_hours: int, sandbox: Path) -> list[str]:
    return [
        "npx",
        "tsx",
        "scripts/replay-harness.ts",
        "--start",
        start,
        "--end",
        end,
        "--sandbox",
        str(sandbox),
        "--signals",
        candidate.signals,
        "--limit-hours",
        str(limit_hours),
        "--keep-going",
    ]


def shell_join(argv: list[str]) -> str:
    return " ".join(_shell_quote(arg) for arg in argv)


def _shell_quote(s: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_./:=+-]+", s):
        return s
    return "'" + s.replace("'", "'\\''") + "'"


def build_plan(
    candidates: list[ReplayCandidate],
    *,
    start: str,
    end: str,
    window_source: str,
    limit_hours: int,
    generated_at: str,
    attach_from: Path | None = None,
) -> dict[str, Any]:
    planned: list[dict[str, Any]] = []
    for c in candidates:
        sandbox = attach_from or sandbox_for(c)
        command = replay_command(c, start, end, limit_hours, sandbox)
        planned.append(
            {
                "id": c.finding_id,
                "rank": c.rank,
                "title": c.title,
                "clusterKey": c.cluster_key,
                "signals": c.signals,
                "status": c.status,
                "opportunityScore": c.opportunity_score,
                "confidenceScore": c.confidence_score,
                "sandbox": str(sandbox),
                "summaryPath": str(sandbox / "replay-report.json"),
                "reproducibleCommand": shell_join(command),
                "argv": command,
            }
        )
    return {
        "generatedAt": generated_at,
        "topK": len(candidates),
        "limitHours": limit_hours,
        "window": {"start": start, "end": end, "source": window_source},
        "candidates": planned,
    }


def read_replay_summary(sandbox: Path) -> tuple[Path, dict[str, Any]]:
    path = sandbox / "replay-report.json"
    if not path.exists():
        raise FileNotFoundError(f"missing replay summary: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"replay summary is not an object: {path}")
    return path, data


def evidence_from_summary(
    summary: dict[str, Any],
    candidate: ReplayCandidate,
    *,
    start: str,
    end: str,
) -> dict[str, Any]:
    totals = summary.get("totals") or {}
    by_signal = summary.get("tradesClosedBySignal") or {}
    sig_row = by_signal.get(candidate.signals) if isinstance(by_signal, dict) else None
    if isinstance(sig_row, dict):
        trade_count = int(sig_row.get("count") or 0)
        total_pnl = float(sig_row.get("pnl") or 0)
    else:
        trade_count = int(totals.get("closedTrades") or 0)
        total_pnl = float(totals.get("totalPnl") or 0)
    window = summary.get("window") if isinstance(summary.get("window"), dict) else {}
    return {
        "status": "attached",
        "tradeCount": trade_count,
        "totalPnl": total_pnl,
        "window": {
            "start": window.get("start") or start,
            "end": window.get("end") or end,
            "hoursReplayed": summary.get("hoursReplayed"),
            "hoursFailed": summary.get("hoursFailed"),
        },
        "signals": candidate.signals,
        "opportunityScoreAtAttach": candidate.opportunity_score,
    }


def skipped_evidence(candidate: ReplayCandidate, reason: str, *, start: str, end: str) -> dict[str, Any]:
    return {
        "status": "skipped",
        "reason": reason,
        "window": {"start": start, "end": end},
        "signals": candidate.signals,
        "opportunityScoreAtAttach": candidate.opportunity_score,
    }


def update_finding_replay(
    registry_path: Path,
    candidate: ReplayCandidate,
    *,
    sandbox: Path,
    start: str,
    end: str,
    summary_path: Path | None,
    evidence: dict[str, Any],
    attached_at: str,
    reproducible_command: str,
    dry_run: bool = False,
) -> dict[str, Any]:
    data = load_registry(registry_path)
    updated: dict[str, Any] | None = None
    for record in data.get("records", []):
        if record.get("id") != candidate.finding_id:
            continue
        links = record.setdefault("links", {})
        replays = list(links.get("replays") or [])
        entry = {
            "sandbox": str(sandbox),
            "started": start,
            "ended": end,
            "signals": candidate.signals,
            "summaryPath": str(summary_path) if summary_path else None,
            "attachedAt": attached_at,
            "reproducibleCommand": reproducible_command,
        }
        replays.append(entry)
        links["replays"] = replays
        body = record.setdefault("body", {})
        body["replayEvidence"] = evidence
        updated = record
        break
    if updated is None:
        raise KeyError(f"finding not found in registry: {candidate.finding_id}")

    data["version"] = REGISTRY_VERSION
    errors = validate_registry(data)
    if errors:
        raise ValueError("; ".join(errors))
    if not dry_run:
        write_registry(registry_path, data)
    return updated


def attach_from_sandbox(
    registry_path: Path,
    candidate: ReplayCandidate,
    *,
    sandbox: Path,
    start: str,
    end: str,
    limit_hours: int,
    attached_at: str,
    dry_run: bool = False,
) -> dict[str, Any]:
    command = replay_command(candidate, start, end, limit_hours, sandbox)
    try:
        summary_path, summary = read_replay_summary(sandbox)
        evidence = evidence_from_summary(summary, candidate, start=start, end=end)
    except Exception as exc:  # noqa: BLE001 - attach failure should not break nightly
        summary_path = None
        evidence = skipped_evidence(candidate, str(exc), start=start, end=end)
    update_finding_replay(
        registry_path,
        candidate,
        sandbox=sandbox,
        start=start,
        end=end,
        summary_path=summary_path,
        evidence=evidence,
        attached_at=attached_at,
        reproducible_command=shell_join(command),
        dry_run=dry_run,
    )
    return evidence


def run_and_attach(
    registry_path: Path,
    candidate: ReplayCandidate,
    *,
    start: str,
    end: str,
    limit_hours: int,
    attached_at: str,
    dry_run: bool = False,
) -> dict[str, Any]:
    sandbox = sandbox_for(candidate)
    command = replay_command(candidate, start, end, limit_hours, sandbox)
    summary_path: Path | None = None
    if dry_run:
        evidence = skipped_evidence(candidate, "dry-run", start=start, end=end)
    else:
        result = subprocess.run(command, cwd=REPO, text=True, capture_output=True, check=False)
        if result.returncode != 0:
            reason = f"harness exited {result.returncode}: {((result.stderr or result.stdout).strip())[-500:]}"
            evidence = skipped_evidence(candidate, reason, start=start, end=end)
        else:
            try:
                summary_path, summary = read_replay_summary(sandbox)
                evidence = evidence_from_summary(summary, candidate, start=start, end=end)
            except Exception as exc:  # noqa: BLE001
                evidence = skipped_evidence(candidate, str(exc), start=start, end=end)
    update_finding_replay(
        registry_path,
        candidate,
        sandbox=sandbox,
        start=start,
        end=end,
        summary_path=summary_path,
        evidence=evidence,
        attached_at=attached_at,
        reproducible_command=shell_join(command),
        dry_run=dry_run,
    )
    return evidence


def attach_finding_replays(
    *,
    registry_path: Path = DEFAULT_REGISTRY,
    opportunities_path: Path = DEFAULT_OPPORTUNITIES,
    plan_path: Path = DEFAULT_PLAN,
    top_k: int = DEFAULT_TOP_K,
    limit_hours: int = DEFAULT_LIMIT_HOURS,
    plan_only: bool = False,
    dry_run: bool = False,
    attach_from: Path | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or utc_now()
    generated_at = iso_z(now)
    registry = load_registry(registry_path)
    opportunities = load_json(opportunities_path, {"opportunities": []})
    start, end, window_source = choose_window(REPO)
    candidates = select_candidates(opportunities, registry, top_k)
    plan = build_plan(
        candidates,
        start=start,
        end=end,
        window_source=window_source,
        limit_hours=limit_hours,
        generated_at=generated_at,
        attach_from=attach_from,
    )
    write_json(plan_path, plan)

    results: list[dict[str, Any]] = []
    if not plan_only:
        for candidate in candidates:
            if attach_from is not None:
                evidence = attach_from_sandbox(
                    registry_path,
                    candidate,
                    sandbox=attach_from,
                    start=start,
                    end=end,
                    limit_hours=limit_hours,
                    attached_at=generated_at,
                    dry_run=dry_run,
                )
            else:
                evidence = run_and_attach(
                    registry_path,
                    candidate,
                    start=start,
                    end=end,
                    limit_hours=limit_hours,
                    attached_at=generated_at,
                    dry_run=dry_run,
                )
            results.append({"id": candidate.finding_id, "replayEvidence": evidence})

    return {"plan": plan, "results": results}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    ap.add_argument("--limit-hours", type=int, default=DEFAULT_LIMIT_HOURS)
    ap.add_argument("--plan-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--opportunities", type=Path, default=DEFAULT_OPPORTUNITIES)
    ap.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    ap.add_argument("--attach-from", type=Path, default=None)
    args = ap.parse_args()

    result = attach_finding_replays(
        registry_path=args.registry,
        opportunities_path=args.opportunities,
        plan_path=args.plan,
        top_k=args.top_k,
        limit_hours=args.limit_hours,
        plan_only=args.plan_only,
        dry_run=args.dry_run,
        attach_from=args.attach_from,
    )
    print(f"planned {len(result['plan']['candidates'])} finding replay(s) -> {args.plan}")
    if args.plan_only:
        print("plan-only: no harness runs or registry updates")
    elif args.dry_run:
        print("dry-run: planned attachment without mutating registry")
    else:
        attached = [r for r in result["results"] if r["replayEvidence"].get("status") == "attached"]
        skipped = [r for r in result["results"] if r["replayEvidence"].get("status") == "skipped"]
        print(f"attached={len(attached)} skipped={len(skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
