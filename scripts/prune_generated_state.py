#!/usr/bin/env python3
"""Prune local-only generated state from the production checkout.

This intentionally does not touch tracked audit, LLM, portfolio, trade, or
published heatmap files. Use the default dry-run first; pass --apply to delete.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DEFAULT_STATE_DIR = Path(os.environ.get("POLYMARKET_TRADER_STATE_DIR", "/var/lib/polymarket-trader"))


@dataclass(frozen=True)
class Candidate:
    path: Path
    size: int
    reason: str


def human_size(value: int) -> str:
    scaled = float(value)
    for unit in ("B", "KB", "MB", "GB"):
        if scaled < 1024 or unit == "GB":
            return f"{scaled:.1f} {unit}"
        scaled /= 1024
    return f"{scaled:.1f} GB"


def path_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    total = 0
    for root, _, files in os.walk(path):
        for filename in files:
            item = Path(root) / filename
            try:
                total += item.stat().st_size
            except FileNotFoundError:
                pass
    return total


def is_git_tracked(path: Path) -> bool:
    try:
        subprocess.run(
            ["git", "ls-files", "--error-unmatch", str(path.relative_to(ROOT))],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except (ValueError, subprocess.CalledProcessError):
        return False


def add_candidate(candidates: list[Candidate], path: Path, reason: str) -> None:
    if not path.exists():
        return
    if path.resolve() == ROOT.resolve() or ROOT.resolve() in path.resolve().parents and is_git_tracked(path):
        print(f"SKIP tracked path: {path}")
        return
    candidates.append(Candidate(path=path, size=path_size(path), reason=reason))


def older_than(path: Path, cutoff: datetime) -> bool:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc) < cutoff


def snapshot_archive_candidates(days: int) -> list[Candidate]:
    archive_dir = DATA_DIR / "instrument-snapshot-archives"
    if days < 0 or not archive_dir.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    candidates: list[Candidate] = []
    for path in archive_dir.iterdir():
        if path.is_file() and path.name.endswith(".jsonl.gz") and older_than(path, cutoff):
            add_candidate(candidates, path, f"snapshot archive older than {days}d")
    return candidates


def relative_value_history_candidates(days: int, state_dir: Path) -> list[Candidate]:
    history_dir = state_dir / "relative-value-history"
    if days < 0 or not history_dir.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    candidates: list[Candidate] = []
    for path in history_dir.iterdir():
        if path.is_dir() and older_than(path, cutoff):
            add_candidate(candidates, path, f"relative-value history older than {days}d")
    return candidates


def backup_candidates(days: int, state_dir: Path) -> list[Candidate]:
    if days < 0 or not state_dir.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    prefixes = (
        "generated-artifact-backups",
        "generated-conflict-backup-",
        "pre-sync-backup-",
    )
    candidates: list[Candidate] = []
    for path in state_dir.iterdir():
        if not any(path.name.startswith(prefix) for prefix in prefixes):
            continue
        if older_than(path, cutoff):
            add_candidate(candidates, path, f"generated backup older than {days}d")
    return candidates


def remove_candidate(candidate: Candidate) -> None:
    if candidate.path.is_dir():
        shutil.rmtree(candidate.path)
    else:
        candidate.path.unlink()


def print_disk_usage(paths: list[Path]) -> None:
    existing = [str(path) for path in paths if path.exists()]
    if not existing:
        return
    subprocess.run(["df", "-h", *existing], check=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prune local-only generated state safely.")
    parser.add_argument("--apply", action="store_true", help="delete candidates; default is dry-run")
    parser.add_argument("--snapshot-archive-days", type=int, default=14, help="keep this many days of gzipped instrument snapshot archives; -1 disables")
    parser.add_argument("--relative-value-history-days", type=int, default=21, help="keep this many days of relative-value history; -1 disables")
    parser.add_argument("--backup-days", type=int, default=7, help="keep this many days of generated backup dirs; -1 disables")
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE_DIR, help="runtime state directory")
    args = parser.parse_args()

    candidates = [
        *snapshot_archive_candidates(args.snapshot_archive_days),
        *relative_value_history_candidates(args.relative_value_history_days, args.state_dir),
        *backup_candidates(args.backup_days, args.state_dir),
    ]
    candidates.sort(key=lambda item: str(item.path))

    print("Generated-state prune")
    print(f"mode={'apply' if args.apply else 'dry-run'}")
    print(f"repo={ROOT}")
    print(f"state_dir={args.state_dir}")
    print("")
    print("Disk before:")
    print_disk_usage([ROOT, args.state_dir])

    total = sum(candidate.size for candidate in candidates)
    print("")
    print(f"Candidates: {len(candidates)} files/dirs, {human_size(total)}")
    for candidate in candidates:
      print(f"{human_size(candidate.size):>10}  {candidate.reason:40}  {candidate.path}")

    if args.apply:
        for candidate in candidates:
            remove_candidate(candidate)
        print("")
        print(f"Removed {len(candidates)} files/dirs, {human_size(total)}")
        print("")
        print("Disk after:")
        print_disk_usage([ROOT, args.state_dir])
    else:
        print("")
        print("Dry-run only. Re-run with --apply to delete these local-only generated artifacts.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
