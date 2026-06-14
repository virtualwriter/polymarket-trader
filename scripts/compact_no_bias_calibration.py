#!/usr/bin/env python3
"""Compact the NO-bias calibration JSONL without losing event-level labels.

The hourly heatmap appends repeated observations to
relative-value/calibration/no_bias_candidates.jsonl. That file is useful for
labeling, but it grows quickly and creates large git commits. This tool keeps a
small per-market spine that preserves calibration/event-report semantics:

- first observed row
- first gate-pass row
- first and latest resolved rows
- latest N rows for current context / future backfill

By default this is a dry-run. Use --apply to rewrite the JSONL and archive
removed rows as a gzip JSONL under .runtime/calibration-archives/ (gitignored).
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CALIBRATION_PATH = REPO_ROOT / "relative-value" / "calibration" / "no_bias_candidates.jsonl"
DEFAULT_ARCHIVE_DIR = REPO_ROOT / ".runtime" / "calibration-archives"


def market_key(row: Dict[str, Any]) -> str:
    for key in ("condition_id", "market_id", "market_slug"):
        value = row.get(key)
        if value:
            return f"{key}:{value}"
    event = row.get("event_slug") or ""
    question = row.get("contract_question") or ""
    asset = row.get("asset") or ""
    direction = row.get("direction") or ""
    strike = row.get("strike") or ""
    expiry = row.get("expiry") or ""
    return json.dumps([event, question, asset, direction, strike, expiry], separators=(",", ":"))


def read_jsonl(path: Path) -> Tuple[List[str], List[Dict[str, Any] | None]]:
    lines: List[str] = []
    rows: List[Dict[str, Any] | None] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            raw = line.rstrip("\n")
            if not raw.strip():
                continue
            lines.append(raw)
            try:
                parsed = json.loads(raw)
                rows.append(parsed if isinstance(parsed, dict) else None)
            except json.JSONDecodeError:
                rows.append(None)
    return lines, rows


def choose_keep_indices(rows: List[Dict[str, Any] | None], keep_latest_per_market: int) -> set[int]:
    by_market: Dict[str, List[int]] = defaultdict(list)
    keep: set[int] = set()

    for idx, row in enumerate(rows):
        if row is None:
            keep.add(idx)
            continue
        by_market[market_key(row)].append(idx)

    for indices in by_market.values():
        if not indices:
            continue

        keep.add(indices[0])
        keep.update(indices[-max(1, keep_latest_per_market):])

        first_pass = next((idx for idx in indices if rows[idx] and rows[idx].get("candidate_passed") is True), None)
        if first_pass is not None:
            keep.add(first_pass)

        resolved = [
            idx
            for idx in indices
            if rows[idx] and rows[idx].get("resolved_outcome") in ("YES", "NO")
        ]
        if resolved:
            keep.add(resolved[0])
            keep.add(resolved[-1])

        forward_marked = [
            idx
            for idx in indices
            if rows[idx] and rows[idx].get("forward_marks")
        ]
        if forward_marked:
            keep.add(forward_marked[0])
            keep.add(forward_marked[-1])

    return keep


def write_jsonl(path: Path, lines: Iterable[str]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        for line in lines:
            handle.write(line)
            handle.write("\n")
    tmp.replace(path)


def archive_removed(archive_dir: Path, source_path: Path, removed_lines: List[str]) -> Path:
    archive_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_path = archive_dir / f"{source_path.stem}-removed-{stamp}.jsonl.gz"
    with gzip.open(archive_path, "wt", encoding="utf-8") as handle:
        for line in removed_lines:
            handle.write(line)
            handle.write("\n")
    return archive_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=DEFAULT_CALIBRATION_PATH)
    parser.add_argument("--archive-dir", type=Path, default=DEFAULT_ARCHIVE_DIR)
    parser.add_argument("--keep-latest-per-market", type=int, default=3)
    parser.add_argument("--apply", action="store_true", help="rewrite the JSONL and archive removed rows")
    args = parser.parse_args()

    path = args.path
    if not path.exists():
        raise SystemExit(f"calibration file not found: {path}")
    if args.keep_latest_per_market < 1:
        raise SystemExit("--keep-latest-per-market must be >= 1")

    before_bytes = path.stat().st_size
    lines, rows = read_jsonl(path)
    keep = choose_keep_indices(rows, args.keep_latest_per_market)
    kept_lines = [line for idx, line in enumerate(lines) if idx in keep]
    removed_lines = [line for idx, line in enumerate(lines) if idx not in keep]
    after_bytes_est = sum(len(line.encode("utf-8")) + 1 for line in kept_lines)

    summary = {
        "path": str(path),
        "apply": args.apply,
        "input_rows": len(lines),
        "kept_rows": len(kept_lines),
        "removed_rows": len(removed_lines),
        "before_bytes": before_bytes,
        "after_bytes_estimate": after_bytes_est,
        "bytes_removed_estimate": max(0, before_bytes - after_bytes_est),
        "keep_latest_per_market": args.keep_latest_per_market,
    }

    if args.apply and removed_lines:
        archive_path = archive_removed(args.archive_dir, path, removed_lines)
        write_jsonl(path, kept_lines)
        summary["archive_path"] = str(archive_path)

    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
