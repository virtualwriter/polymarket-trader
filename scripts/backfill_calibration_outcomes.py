#!/usr/bin/env python3
"""Backfill resolved outcomes and forward marks into the NO-bias calibration log.

Closes the calibration loop for relative-value/calibration/no_bias_candidates.jsonl:

1. resolved_outcome: for markets past expiry, fetch resolution from the
   Polymarket gamma API ("YES"/"NO") and stamp it on every row of that market.
   Results are cached in resolutions_cache.json so each market is queried until
   it resolves and never again afterwards.
2. forward_marks: for each row, look up the archived hourly heatmap CSVs at
   +24h/+72h/+168h and record the Polymarket quote at that time.

The JSONL is rewritten atomically and the script is idempotent, so it is safe
to run every hour after the relative-value report.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
CALIBRATION_PATH = REPO_ROOT / "relative-value" / "calibration" / "no_bias_candidates.jsonl"
RESOLUTIONS_CACHE_PATH = REPO_ROOT / "relative-value" / "calibration" / "resolutions_cache.json"
DEFAULT_ARCHIVE_DIRS = [REPO_ROOT / "relative-value" / "history"]

GAMMA_MARKET_URL = "https://gamma-api.polymarket.com/markets/{market_id}"
HTTP_HEADERS = {"Accept": "application/json", "User-Agent": "calibration-outcome-backfill/1.0"}

FORWARD_HORIZONS_HOURS = (24, 72, 168)
ARCHIVE_MATCH_TOLERANCE_HOURS = 2.0
PENDING_RECHECK_HOURS = 6.0
ARCHIVE_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{6}Z)-cross_venue_relative_value\.csv$")


def parse_row_timestamp(value: str) -> Optional[datetime]:
    for fmt in ("%Y-%m-%dT%H", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def parse_expiry(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, AttributeError):
        return None


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def resolve_market_outcome(market_id: str) -> Tuple[Optional[str], str]:
    """Return (outcome, status). outcome is "YES"/"NO" once UMA-resolved."""
    try:
        payload = fetch_json(GAMMA_MARKET_URL.format(market_id=market_id))
    except Exception as exc:
        return None, f"fetch_error: {exc}"
    if not isinstance(payload, dict):
        return None, "unexpected_payload"
    status = str(payload.get("umaResolutionStatus", ""))
    if not payload.get("closed") or status != "resolved":
        return None, status or "open"
    try:
        outcomes = json.loads(payload.get("outcomes", "[]"))
        prices = [float(p) for p in json.loads(payload.get("outcomePrices", "[]"))]
    except (json.JSONDecodeError, ValueError):
        return None, "unparseable_outcome"
    if len(outcomes) != len(prices) or not outcomes:
        return None, "unparseable_outcome"
    winner = max(zip(outcomes, prices), key=lambda pair: pair[1])
    if winner[1] < 0.99:  # not a clean binary settlement
        return None, "ambiguous_settlement"
    label = str(winner[0]).strip().upper()
    if label in {"YES", "NO"}:
        return label, "resolved"
    return None, f"non_binary_outcome:{label}"


class ArchiveIndex:
    """Index of hourly heatmap CSV archives across one or more directories."""

    def __init__(self, archive_dirs: List[Path]):
        self.files: List[Tuple[datetime, Path]] = []
        for root in archive_dirs:
            if not root.is_dir():
                continue
            for path in root.rglob("*-cross_venue_relative_value.csv"):
                match = ARCHIVE_FILE_RE.match(path.name)
                if not match:
                    continue
                ts = datetime.strptime(match.group(1), "%Y-%m-%dT%H%M%SZ").replace(tzinfo=timezone.utc)
                self.files.append((ts, path))
        self.files.sort(key=lambda item: item[0])
        self.timestamps = [ts for ts, _ in self.files]
        self.newest: Optional[datetime] = self.timestamps[-1] if self.timestamps else None
        self._quote_cache: Dict[Path, Dict[str, Dict[str, Optional[float]]]] = {}

    def nearest(self, target: datetime) -> Optional[Tuple[datetime, Path]]:
        if not self.files:
            return None
        from bisect import bisect_left

        idx = bisect_left(self.timestamps, target)
        best: Optional[Tuple[datetime, Path]] = None
        for candidate in (idx - 1, idx):
            if 0 <= candidate < len(self.files):
                ts, path = self.files[candidate]
                if best is None or abs((ts - target).total_seconds()) < abs((best[0] - target).total_seconds()):
                    best = (ts, path)
        if best is None:
            return None
        if abs((best[0] - target).total_seconds()) > ARCHIVE_MATCH_TOLERANCE_HOURS * 3600:
            return None
        return best

    def quotes(self, path: Path) -> Dict[str, Dict[str, Optional[float]]]:
        cached = self._quote_cache.get(path)
        if cached is not None:
            return cached
        quotes: Dict[str, Dict[str, Optional[float]]] = {}
        try:
            with path.open(newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    market_id = str(row.get("market_id", ""))
                    if not market_id:
                        continue
                    quotes[market_id] = {
                        "pm_yes_price": _safe_float(row.get("pm_yes_price")),
                        "pm_best_bid": _safe_float(row.get("pm_best_bid")),
                        "pm_best_ask": _safe_float(row.get("pm_best_ask")),
                    }
        except OSError:
            pass
        # Keep the cache bounded; hourly incremental runs touch few files.
        if len(self._quote_cache) > 600:
            self._quote_cache.clear()
        self._quote_cache[path] = quotes
        return quotes


def _safe_float(value: Any) -> Optional[float]:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result


def load_resolutions_cache(path: Path) -> Dict[str, Dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def save_resolutions_cache(path: Path, cache: Dict[str, Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def backfill(
    calibration_path: Path,
    archive_dirs: List[Path],
    max_resolution_fetches: int,
    dry_run: bool,
) -> None:
    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []
    with calibration_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    print(f"Loaded {len(rows)} calibration rows from {calibration_path}")

    # ---- 1. Resolved outcomes ----
    cache = load_resolutions_cache(RESOLUTIONS_CACHE_PATH)
    expired_unresolved: Dict[str, datetime] = {}
    for row in rows:
        market_id = str(row.get("market_id", ""))
        expiry = parse_expiry(str(row.get("expiry", "")))
        if not market_id or expiry is None or expiry > now - timedelta(hours=2):
            continue
        cached = cache.get(market_id)
        if cached and cached.get("outcome") in ("YES", "NO"):
            continue
        if cached and cached.get("checked_at"):
            checked = parse_expiry(str(cached["checked_at"]))
            if checked and now - checked < timedelta(hours=PENDING_RECHECK_HOURS):
                continue
        expired_unresolved[market_id] = expiry

    fetched = 0
    for market_id in sorted(expired_unresolved, key=lambda mid: expired_unresolved[mid]):
        if fetched >= max_resolution_fetches:
            print(f"Hit resolution fetch cap ({max_resolution_fetches}); remaining markets next run.")
            break
        outcome, status = resolve_market_outcome(market_id)
        cache[market_id] = {
            "outcome": outcome,
            "status": status,
            "checked_at": now.isoformat(timespec="seconds"),
        }
        fetched += 1
        time.sleep(0.15)
    if fetched and not dry_run:
        save_resolutions_cache(RESOLUTIONS_CACHE_PATH, cache)

    outcomes_filled = 0
    for row in rows:
        if row.get("resolved_outcome") in ("YES", "NO"):
            continue
        cached = cache.get(str(row.get("market_id", "")))
        if cached and cached.get("outcome") in ("YES", "NO"):
            row["resolved_outcome"] = cached["outcome"]
            outcomes_filled += 1

    # ---- 2. Forward marks ----
    index = ArchiveIndex(archive_dirs)
    print(f"Archive index: {len(index.files)} hourly CSVs"
          + (f", newest {index.newest.isoformat()}" if index.newest else " (none found)"))
    marks_filled = 0
    for row in rows:
        row_ts = parse_row_timestamp(str(row.get("timestamp", "")))
        market_id = str(row.get("market_id", ""))
        if row_ts is None or not market_id:
            continue
        marks = row.get("forward_marks")
        if not isinstance(marks, dict):
            marks = {}
            row["forward_marks"] = marks
        expiry = parse_expiry(str(row.get("expiry", "")))
        for horizon in FORWARD_HORIZONS_HOURS:
            key = f"h{horizon}"
            if key in marks:
                continue
            target = row_ts + timedelta(hours=horizon)
            if index.newest is None or target > index.newest:
                continue  # horizon not reachable yet; later run fills it
            if expiry is not None and target > expiry:
                marks[key] = {"status": "past_expiry"}
                continue
            found = index.nearest(target)
            if found is None:
                marks[key] = {"status": "no_archive"}
                continue
            ts, path = found
            quote = index.quotes(path).get(market_id)
            if quote is None:
                marks[key] = {"status": "market_absent", "snapshot": ts.isoformat(timespec="seconds")}
                continue
            marks[key] = {"status": "ok", "snapshot": ts.isoformat(timespec="seconds"), **quote}
            marks_filled += 1

    total_with_outcome = sum(1 for row in rows if row.get("resolved_outcome") in ("YES", "NO"))
    total_with_marks = sum(1 for row in rows if any(
        isinstance(m, dict) and m.get("status") == "ok" for m in (row.get("forward_marks") or {}).values()
    ))
    print(f"Resolution fetches this run: {fetched}")
    print(f"Outcome labels newly stamped on rows: {outcomes_filled} (total labeled rows: {total_with_outcome})")
    print(f"Forward marks newly filled: {marks_filled} (rows with >=1 ok mark: {total_with_marks})")

    if dry_run:
        print("Dry run: not rewriting calibration JSONL")
        return
    if not outcomes_filled and not marks_filled:
        print("No changes; calibration JSONL left untouched")
        return
    tmp = calibration_path.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n")
    os.replace(tmp, calibration_path)
    print(f"Rewrote {calibration_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill resolved outcomes and forward marks into the calibration JSONL.")
    parser.add_argument("--calibration-jsonl", type=Path, default=CALIBRATION_PATH)
    parser.add_argument("--archive-dir", type=Path, action="append", default=None,
                        help="Heatmap CSV archive directory (repeatable). Default: relative-value/history")
    parser.add_argument("--max-resolution-fetches", type=int, default=150,
                        help="Cap on gamma API lookups per run to bound runtime")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    archive_dirs = args.archive_dir if args.archive_dir else DEFAULT_ARCHIVE_DIRS
    if not args.calibration_jsonl.exists():
        print(f"No calibration file at {args.calibration_jsonl}; nothing to do")
        sys.exit(0)
    backfill(args.calibration_jsonl, archive_dirs, args.max_resolution_fetches, args.dry_run)


if __name__ == "__main__":
    main()
