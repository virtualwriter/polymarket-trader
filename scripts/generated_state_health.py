#!/usr/bin/env python3
"""Read-only disk health report for generated trader state."""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

from prune_generated_state import (
    DEFAULT_STATE_DIR,
    ROOT,
    backup_candidates,
    human_size,
    path_size,
    relative_value_history_candidates,
    snapshot_archive_candidates,
)


DATA_DIR = ROOT / "data"


def disk_usage(path: Path) -> tuple[int, int, int]:
    existing = path
    while not existing.exists() and existing != existing.parent:
        existing = existing.parent
    usage = shutil.disk_usage(existing)
    return usage.total, usage.used, usage.free


def print_disk(path: Path, warn_used_pct: float, critical_used_pct: float, min_free_bytes: int) -> str:
    total, used, free = disk_usage(path)
    used_pct = (used / total * 100) if total else 0.0
    status = "ok"
    if used_pct >= critical_used_pct or free < min_free_bytes:
        status = "critical"
    elif used_pct >= warn_used_pct:
        status = "warn"
    print(f"{status.upper():8} {used_pct:5.1f}% used  free={human_size(free):>8}  total={human_size(total):>8}  path={path}")
    return status


def print_path_size(label: str, path: Path) -> None:
    if path.exists():
        print(f"{human_size(path_size(path)):>10}  {label:34}  {path}")
    else:
        print(f"{'missing':>10}  {label:34}  {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Report generated-state disk health without deleting anything.")
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE_DIR, help="runtime state directory")
    parser.add_argument("--warn-used-pct", type=float, default=90.0, help="warn at this filesystem used percentage")
    parser.add_argument("--critical-used-pct", type=float, default=95.0, help="fail at this filesystem used percentage")
    parser.add_argument("--min-free-gb", type=float, default=1.0, help="fail below this free-space threshold")
    parser.add_argument("--snapshot-archive-days", type=int, default=180, help="retention assumption for pruning estimate")
    parser.add_argument("--relative-value-history-days", type=int, default=180, help="retention assumption for pruning estimate")
    parser.add_argument("--backup-days", type=int, default=7, help="retention assumption for pruning estimate")
    args = parser.parse_args()

    min_free_bytes = int(args.min_free_gb * 1024 * 1024 * 1024)

    print("Generated-state disk health")
    print(f"repo={ROOT}")
    print(f"state_dir={args.state_dir}")
    print("")
    print("Filesystems:")
    statuses = [
        print_disk(ROOT, args.warn_used_pct, args.critical_used_pct, min_free_bytes),
        print_disk(args.state_dir, args.warn_used_pct, args.critical_used_pct, min_free_bytes),
    ]

    print("")
    print("Key generated-state sizes:")
    print_path_size("hot instrument snapshots", DATA_DIR / "instrument-snapshots.jsonl")
    print_path_size("snapshot archives", DATA_DIR / "instrument-snapshot-archives")
    print_path_size("relative-value history", args.state_dir / "relative-value-history")
    print_path_size("generated backups", args.state_dir / "generated-artifact-backups")
    print_path_size("repo git object store", ROOT / ".git")

    candidates = [
        *snapshot_archive_candidates(args.snapshot_archive_days),
        *relative_value_history_candidates(args.relative_value_history_days, args.state_dir),
        *backup_candidates(args.backup_days, args.state_dir),
    ]
    reclaimable = sum(candidate.size for candidate in candidates)

    print("")
    print("Default prune estimate:")
    print(f"candidates={len(candidates)} reclaimable={human_size(reclaimable)}")
    print("Run `npm run cleanup:disk` for the full dry-run list, then `npm run cleanup:disk -- --apply` only after operator review.")

    return 2 if "critical" in statuses else 0


if __name__ == "__main__":
    raise SystemExit(main())
