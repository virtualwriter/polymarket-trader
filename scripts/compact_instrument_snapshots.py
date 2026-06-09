#!/usr/bin/env python3
"""Archive old raw instrument snapshots without losing training history.

The hourly trader only needs recent records from data/instrument-snapshots.jsonl,
but historical heatmap reconstruction still needs the raw snapshots. When the
hot JSONL file grows past a threshold, this script gzips older complete records
into data/instrument-snapshot-archives/ and rewrites the hot file with the
newest records.
"""

from __future__ import annotations

import gzip
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_FILE = DATA_DIR / "instrument-snapshots.jsonl"
ARCHIVE_DIR = DATA_DIR / "instrument-snapshot-archives"
MIN_BYTES = int(os.getenv("INSTRUMENT_SNAPSHOT_COMPACT_MIN_BYTES", str(200 * 1024 * 1024)))
# The engine reads the most recent 12 snapshots by default. Keep a small buffer
# above that while archiving older records off the hot JSONL file.
KEEP_LINES = int(os.getenv("INSTRUMENT_SNAPSHOT_COMPACT_KEEP_LINES", "18"))
CHUNK_SIZE = 1024 * 1024


def tail_start_offset(path: Path, keep_lines: int) -> int:
    """Return the byte offset where the newest keep_lines records begin."""
    if keep_lines <= 0:
        return path.stat().st_size

    with path.open("rb") as fh:
        fh.seek(0, os.SEEK_END)
        position = fh.tell()
        trailing_newline = False
        newline_offsets: list[int] = []

        while position > 0 and len(newline_offsets) <= keep_lines:
            read_size = min(CHUNK_SIZE, position)
            position -= read_size
            fh.seek(position)
            chunk = fh.read(read_size)
            for idx in range(len(chunk) - 1, -1, -1):
                if chunk[idx] != 10:
                    continue
                absolute = position + idx
                if absolute == path.stat().st_size - 1:
                    trailing_newline = True
                    continue
                newline_offsets.append(absolute)
                if len(newline_offsets) > keep_lines:
                    break

    if len(newline_offsets) < keep_lines:
        return 0

    return newline_offsets[keep_lines - 1] + 1 if trailing_newline else newline_offsets[keep_lines] + 1


def copy_range(src: Path, dst, start: int, end: int) -> None:
    remaining = end - start
    with src.open("rb") as fh:
        fh.seek(start)
        while remaining > 0:
            chunk = fh.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            dst.write(chunk)
            remaining -= len(chunk)


def main() -> None:
    if not SNAPSHOT_FILE.exists():
        print("No instrument snapshot file found; nothing to compact.")
        return

    size = SNAPSHOT_FILE.stat().st_size
    if size < MIN_BYTES:
        print(f"Instrument snapshots below compaction threshold: {size} bytes.")
        return

    split_at = tail_start_offset(SNAPSHOT_FILE, KEEP_LINES)
    if split_at <= 0:
        print(f"Instrument snapshots have <= {KEEP_LINES} records; nothing to compact.")
        return

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_tmp = ARCHIVE_DIR / f"instrument-snapshots-{stamp}.jsonl.gz.tmp"
    archive_path = ARCHIVE_DIR / f"instrument-snapshots-{stamp}.jsonl.gz"
    tail_tmp = SNAPSHOT_FILE.with_suffix(".jsonl.tmp")

    with gzip.open(archive_tmp, "wb", compresslevel=6) as gz:
        copy_range(SNAPSHOT_FILE, gz, 0, split_at)

    with tail_tmp.open("wb") as tail:
        copy_range(SNAPSHOT_FILE, tail, split_at, size)

    archive_tmp.replace(archive_path)
    tail_tmp.replace(SNAPSHOT_FILE)

    archived = split_at
    kept = SNAPSHOT_FILE.stat().st_size
    compressed = archive_path.stat().st_size
    print(
        "Compacted instrument snapshots: "
        f"archived {archived} bytes to {archive_path} ({compressed} bytes gz), "
        f"kept {kept} bytes in {SNAPSHOT_FILE}."
    )


if __name__ == "__main__":
    main()
