#!/usr/bin/env python3
"""Backfill engine-derived columns into data/daily-valuations.csv.

Two columns are managed by this script so the schema in market-scanner.ts stays
in sync with the CSV on disk:

  * btc_opt_iv_term_spread (= btc_opt_iv_30d - btc_opt_iv_90d, in IV points).
    Always recomputed from the source columns.
  * btc_hl_oi. We don't have historical Hyperliquid BTC OI to fill in retro-
    actively, so this column is inserted at the correct slot with blank values
    for existing rows; future snapshot writes will start populating it.

Idempotent: existing columns are kept at their canonical slot and recomputed
(or left blank) without disturbing anything else. Safe to re-run.
"""
from __future__ import annotations

import csv
import io
import os
import sys
from typing import List


CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "daily-valuations.csv")
SPREAD_COL = "btc_opt_iv_term_spread"
SPREAD_AFTER = "btc_opt_iv_90d"
OI_COL = "btc_hl_oi"
OI_AFTER = "btc_hl_funding_ann"
SOURCE_30 = "btc_opt_iv_30d"
SOURCE_90 = "btc_opt_iv_90d"


def _format_spread(v30: str, v90: str) -> str:
    if v30 == "" or v90 == "":
        return ""
    try:
        spread = float(v30) - float(v90)
    except ValueError:
        return ""
    return f"{spread:.2f}"


def _ensure_column_slot(rows: List[List[str]], col_name: str, after_col: str) -> bool:
    """Ensure `col_name` sits immediately after `after_col`.

    Inserts the column with blank values if missing. If the column exists but is
    misplaced, relocates it. Returns True if any structural change was applied.
    """
    headers = rows[0]
    if after_col not in headers:
        raise RuntimeError(f"anchor column {after_col!r} not found")

    if col_name in headers:
        current_idx = headers.index(col_name)
        target_idx = headers.index(after_col) + 1
        if current_idx == target_idx:
            return False
        # Relocate: pop from current_idx, insert at target slot of *trimmed* list
        new_headers = [h for j, h in enumerate(headers) if j != current_idx]
        target_in_trimmed = new_headers.index(after_col) + 1
        new_headers.insert(target_in_trimmed, col_name)
        reordered: List[List[str]] = [new_headers]
        for body in rows[1:]:
            if len(body) <= current_idx:
                body = body + [""] * (current_idx + 1 - len(body))
            value = body[current_idx]
            trimmed = [c for j, c in enumerate(body) if j != current_idx]
            trimmed.insert(target_in_trimmed, value)
            reordered.append(trimmed)
        rows.clear()
        rows.extend(reordered)
        return True

    target_idx = headers.index(after_col) + 1
    headers.insert(target_idx, col_name)
    for body in rows[1:]:
        if len(body) < target_idx:
            body.extend([""] * (target_idx - len(body)))
        body.insert(target_idx, "")
    return True


def main() -> int:
    if not os.path.exists(CSV_PATH):
        print(f"error: {CSV_PATH} not found", file=sys.stderr)
        return 1

    with open(CSV_PATH, newline="") as fh:
        reader = csv.reader(fh)
        rows: List[List[str]] = list(reader)

    if not rows:
        print("error: empty CSV", file=sys.stderr)
        return 1

    if SOURCE_30 not in rows[0] or SOURCE_90 not in rows[0]:
        print(f"error: source columns {SOURCE_30!r}/{SOURCE_90!r} not found", file=sys.stderr)
        return 1

    spread_structural_change = _ensure_column_slot(rows, SPREAD_COL, SPREAD_AFTER)
    oi_structural_change = _ensure_column_slot(rows, OI_COL, OI_AFTER)

    headers = rows[0]
    i30 = headers.index(SOURCE_30)
    i90 = headers.index(SOURCE_90)
    iSpread = headers.index(SPREAD_COL)

    updated = 0
    blanked = 0
    for body in rows[1:]:
        # Pad if previous writes left short rows
        while len(body) < len(headers):
            body.append("")
        v30 = body[i30]
        v90 = body[i90]
        spread = _format_spread(v30, v90)
        prior = body[iSpread]
        if spread != prior:
            body[iSpread] = spread
            if spread == "":
                blanked += 1
            else:
                updated += 1

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerows(rows)
    with open(CSV_PATH, "w") as fh:
        fh.write(buf.getvalue())

    spread_msg = "structural change" if spread_structural_change else "in place"
    oi_msg = "structural change" if oi_structural_change else "in place"
    print(f"{SPREAD_COL}: {spread_msg}; {updated} cells written, {blanked} blanked, {len(rows) - 1} rows total")
    print(f"{OI_COL}:   {oi_msg}; blank for existing rows (no historical Hyperliquid OI source)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
