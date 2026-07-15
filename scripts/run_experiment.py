#!/usr/bin/env python3
"""Reproducible experiment runner tied to the Research Registry (Phase 3).

Reads a registry record's body.spec = {command, dataRange, description},
executes `command` (an argv list) with cwd at the repo root, captures
stdout/stderr/exit code and the current git HEAD commit, writes an artifact
file under data/experiments/, and appends a run summary into the record's
body.runs array via `scripts/registry.py update-body`.

This script never touches trading engine / portfolio / ledger / signal
weight / engine-state files itself — it only runs whatever `command` the
registry record specifies, and that command is responsible for its own
read/write behavior (calibration and analysis scripts here are read-only).

Usage:
    python3 scripts/run_experiment.py --id EXP-XXXX --dry-run
    python3 scripts/run_experiment.py --id EXP-XXXX
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DATA_DIR = ROOT / "data"
EXPERIMENTS_DIR = DATA_DIR / "experiments"

sys.path.insert(0, str(SCRIPT_DIR))
import registry as registry_cli  # noqa: E402  (local import after sys.path setup)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def load_record(registry_path: Path, exp_id: str) -> dict[str, Any]:
    data = registry_cli.load_registry(registry_path)
    for record in data.get("records", []):
        if record.get("id") == exp_id:
            return record
    raise SystemExit(f"error: record not found: {exp_id}")


def get_git_commit() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return f"<unknown: git exited {result.returncode}: {result.stderr.strip()}>"
    except (OSError, subprocess.SubprocessError) as exc:
        return f"<unknown: {exc.__class__.__name__}: {exc}>"


def tail_lines(text: str, n: int = 200) -> str:
    lines = text.splitlines()
    return "\n".join(lines[-n:])


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--id", required=True, help="registry record id, e.g. EXP-0003")
    parser.add_argument("--dry-run", action="store_true", help="print the plan without executing")
    parser.add_argument(
        "--registry", type=Path, default=registry_cli.default_registry_path()
    )
    parser.add_argument(
        "--timeout", type=float, default=1800.0, help="seconds before the subprocess is killed"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)

    record = load_record(args.registry, args.id)
    body = record.get("body", {})
    spec = body.get("spec")
    if not isinstance(spec, dict):
        print(f"error: record {args.id} has no body.spec; nothing to run", file=sys.stderr)
        return 1

    command = spec.get("command")
    if not isinstance(command, list) or not command or not all(isinstance(c, str) for c in command):
        print("error: body.spec.command must be a non-empty list of strings", file=sys.stderr)
        return 1
    data_range = spec.get("dataRange", "<unspecified>")
    description = spec.get("description", "<no description>")

    if args.dry_run:
        print(f"[dry-run] {args.id}: {record.get('title')}")
        print(f"  description: {description}")
        print(f"  dataRange:   {data_range}")
        print(f"  command:     {' '.join(command)}")
        print(f"  cwd:         {ROOT}")
        print(f"  would write: {EXPERIMENTS_DIR}/{args.id}-run-<timestamp>.json")
        print(f"  would append a run summary into {args.id}'s body.runs via registry.py update-body")
        return 0

    EXPERIMENTS_DIR.mkdir(parents=True, exist_ok=True)

    git_commit = get_git_commit()
    started_at = now_iso()
    started_perf = datetime.now(timezone.utc)
    timed_out = False
    try:
        proc = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=args.timeout)
        exit_code: int | None = proc.returncode
        stdout, stderr = proc.stdout, proc.stderr
    except subprocess.TimeoutExpired as exc:
        exit_code = None
        stdout = exc.stdout or ""
        stderr = (exc.stderr or "") + f"\n[run_experiment.py] killed after {args.timeout}s timeout"
        timed_out = True
    finished_at = now_iso()
    duration_ms = int((datetime.now(timezone.utc) - started_perf).total_seconds() * 1000)

    filename_ts = started_at.replace(":", "").replace(".", "")
    artifact_path = EXPERIMENTS_DIR / f"{args.id}-run-{filename_ts}.json"
    artifact = {
        "expId": args.id,
        "gitCommit": git_commit,
        "startedAt": started_at,
        "finishedAt": finished_at,
        "exitCode": exit_code,
        "timedOut": timed_out,
        "durationMs": duration_ms,
        "stdoutTail": tail_lines(stdout, 200),
        "stderrTail": tail_lines(stderr, 200),
        "spec": spec,
    }
    artifact_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    sys.stdout.write(stdout)
    if stdout and not stdout.endswith("\n"):
        sys.stdout.write("\n")
    if stderr:
        sys.stderr.write(stderr)
        if not stderr.endswith("\n"):
            sys.stderr.write("\n")

    print(
        f"\n[run_experiment.py] exit_code={exit_code} timedOut={timed_out} "
        f"duration_ms={duration_ms} artifact={artifact_path.relative_to(ROOT)}"
    )

    run_summary = {
        "runAt": started_at,
        "finishedAt": finished_at,
        "gitCommit": git_commit,
        "exitCode": exit_code,
        "timedOut": timed_out,
        "durationMs": duration_ms,
        "artifact": str(artifact_path.relative_to(ROOT)),
    }
    patch = {"runs": [run_summary]}
    update_args = argparse.Namespace(registry=args.registry, id=args.id, body=json.dumps(patch))
    rc = registry_cli.cmd_update_body(update_args)
    if rc != 0:
        print("warning: failed to append run summary to registry record body.runs", file=sys.stderr)
        return rc

    if exit_code == 0:
        return 0
    return exit_code if isinstance(exit_code, int) else 1


if __name__ == "__main__":
    sys.exit(main())
