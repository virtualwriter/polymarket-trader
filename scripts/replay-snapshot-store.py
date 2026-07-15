#!/usr/bin/env python3
"""Replay snapshot store builder.

Reconstructs an as-of-hour instrument-snapshot corpus for the replay harness.

The production engine reads instrument snapshots with readInstrumentSnapshotPrefix,
which cuts every JSONL line at the ',"options":' marker (options chains are never
used at decision time). We mirror that exactly: for every archived snapshot
(data/instrument-snapshot-archives/*.gz) and every hot line
(data/instrument-snapshots.jsonl), we extract the option-stripped prefix and the
snapshot's own "timestamp" field (hour-granular, e.g. "2026-07-11T14"), and write
one compact file per hour into <store>/<timestamp>.jsonl.

This is the heavy one-time setup step; the resulting store is small and is cached
(idempotent unless --rebuild). Output: <store>/index.json = { "<hour>": "<file>" }.

Read-only against production data. Never writes outside <store>.
"""
from __future__ import annotations

import argparse
import glob
import gzip
import json
import os
import re
import sys

OPTIONS_MARKER = b',"options":'
TS_RE = re.compile(rb'"timestamp"\s*:\s*"([^"]+)"')
CHUNK = 256 * 1024


def strip_prefix_from_stream(fh) -> bytes | None:
    """Read a decompressed byte stream until the options marker; return the
    option-stripped snapshot bytes (prefix + '}'), or the whole thing if no
    options field exists. Bounded read: stops as soon as options begins."""
    buf = bytearray()
    while True:
        chunk = fh.read(CHUNK)
        if not chunk:
            break
        buf += chunk
        idx = buf.find(OPTIONS_MARKER)
        if idx >= 0:
            return bytes(buf[:idx]) + b"}"
        # Keep memory bounded: options is the last key, so the prefix (spots +
        # hyperliquid + polymarket) is the only part we retain. If we have not
        # found the marker yet we must keep accumulating, but guard runaway.
        if len(buf) > 64 * 1024 * 1024:
            return bytes(buf).rstrip()
    return bytes(buf).rstrip() or None


def snapshot_from_bytes(raw: bytes) -> tuple[str, str] | None:
    if not raw:
        return None
    m = TS_RE.search(raw[:200])
    if not m:
        return None
    ts = m.group(1).decode("utf-8", "ignore").strip()
    # Validate JSON so a corrupt prefix never poisons a replay hour.
    try:
        json.loads(raw)
    except Exception:
        return None
    return ts, raw.decode("utf-8", "ignore")


def build(repo: str, store: str, rebuild: bool) -> dict:
    os.makedirs(store, exist_ok=True)
    index_path = os.path.join(store, "index.json")
    if os.path.exists(index_path) and not rebuild:
        with open(index_path) as fh:
            return json.load(fh)

    data_dir = os.path.join(repo, "data")
    archive_glob = os.path.join(data_dir, "instrument-snapshot-archives", "*.gz")
    hot_file = os.path.join(data_dir, "instrument-snapshots.jsonl")

    index: dict[str, str] = {}
    processed = 0

    archives = sorted(glob.glob(archive_glob))
    for f in archives:
        try:
            with gzip.open(f, "rb") as fh:
                raw = strip_prefix_from_stream(fh)
        except Exception as exc:  # noqa: BLE001
            print(f"  warn: failed {f}: {exc}", file=sys.stderr)
            continue
        parsed = snapshot_from_bytes(raw) if raw else None
        if not parsed:
            continue
        ts, line = parsed
        out = os.path.join(store, f"{ts}.jsonl")
        with open(out, "w", encoding="utf-8") as ofh:
            ofh.write(line.rstrip() + "\n")
        index[ts] = os.path.basename(out)
        processed += 1
        if processed % 100 == 0:
            print(f"  ...{processed} archives processed", file=sys.stderr)

    # Hot file lines (uncompressed). These are the most recent hours and may
    # override an archived duplicate of the same hour with fresher data.
    if os.path.exists(hot_file):
        with open(hot_file, "rb") as fh:
            for line in fh:
                idx = line.find(OPTIONS_MARKER)
                raw = (line[:idx] + b"}") if idx >= 0 else line.rstrip()
                parsed = snapshot_from_bytes(raw)
                if not parsed:
                    continue
                ts, sline = parsed
                out = os.path.join(store, f"{ts}.jsonl")
                with open(out, "w", encoding="utf-8") as ofh:
                    ofh.write(sline.rstrip() + "\n")
                index[ts] = os.path.basename(out)

    with open(index_path, "w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=0, sort_keys=True)

    hours = sorted(index)
    print(
        f"built store: {len(index)} hourly snapshots "
        f"({hours[0] if hours else 'n/a'} .. {hours[-1] if hours else 'n/a'})",
        file=sys.stderr,
    )
    return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--store", required=True)
    ap.add_argument("--rebuild", action="store_true")
    args = ap.parse_args()
    index = build(args.repo, args.store, args.rebuild)
    # Print index path for the caller.
    print(os.path.join(args.store, "index.json"))
    return 0 if index else 1


if __name__ == "__main__":
    raise SystemExit(main())
