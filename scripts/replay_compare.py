#!/usr/bin/env python3
"""Compare a replay trade ledger against the production ledger.

Diffs replay vs production trades-detailed.csv for the same window + signal:
matched (same asset + entry hour), missed (production only), extra (replay only),
and P&L correlation over matched pairs.

Usage:
  python3 scripts/replay_compare.py \
      --replay-ledger /tmp/replay-1/data/trades-detailed.csv \
      --production-ledger /opt/polymarket-trader/data/trades-detailed.csv \
      --signal WEEKEND_HL_FUNDING_REVERSION_LONG \
      --start 2026-07-10 --end 2026-07-14 \
      [--match-on entry|close]

Read-only. Prints a JSON summary to stdout.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import defaultdict


def read_ledger(path: str) -> list[dict]:
    rows: list[dict] = []
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            rows.append(row)
    return rows


def hour(ts: str) -> str:
    return (ts or "")[:13]  # YYYY-MM-DDTHH


def day(ts: str) -> str:
    return (ts or "")[:10]


def in_window(d: str, start: str, end: str) -> bool:
    return start <= d <= end


def pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx <= 0 or syy <= 0:
        return None
    return sxy / math.sqrt(sxx * syy)


def select(rows: list[dict], signal: str, start: str, end: str, match_on: str) -> list[dict]:
    key_ts = "opened_at" if match_on == "entry" else "closed_at"
    out = []
    for r in rows:
        if r.get("signal_type") != signal:
            continue
        d = day(r.get(key_ts, ""))
        if not in_window(d, start, end):
            continue
        out.append(r)
    return out


def index_by_key(rows: list[dict], match_on: str) -> dict[tuple[str, str], list[dict]]:
    key_ts = "opened_at" if match_on == "entry" else "closed_at"
    idx: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        idx[(r.get("asset", ""), hour(r.get(key_ts, "")))].append(r)
    return idx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--replay-ledger", required=True)
    ap.add_argument("--production-ledger", required=True)
    ap.add_argument("--signal", required=True)
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--match-on", default="entry", choices=["entry", "close"])
    args = ap.parse_args()

    prod_all = read_ledger(args.production_ledger)
    replay_all = read_ledger(args.replay_ledger)

    prod = select(prod_all, args.signal, args.start, args.end, args.match_on)
    replay = select(replay_all, args.signal, args.start, args.end, args.match_on)

    prod_idx = index_by_key(prod, args.match_on)
    replay_idx = index_by_key(replay, args.match_on)

    all_keys = set(prod_idx) | set(replay_idx)
    matched, missed, extra = [], [], []
    corr_prod, corr_replay = [], []

    for key in sorted(all_keys):
        p = prod_idx.get(key, [])
        r = replay_idx.get(key, [])
        asset, hr = key
        if p and r:
            p_pnl = sum(float(x.get("pnl", 0) or 0) for x in p)
            r_pnl = sum(float(x.get("pnl", 0) or 0) for x in r)
            matched.append({
                "asset": asset, "entryHour": hr,
                "productionPnl": round(p_pnl, 6), "replayPnl": round(r_pnl, 6),
                "productionCloseReason": p[0].get("close_reason"),
                "replayCloseReason": r[0].get("close_reason"),
            })
            corr_prod.append(p_pnl)
            corr_replay.append(r_pnl)
        elif p and not r:
            missed.append({"asset": asset, "entryHour": hr,
                           "productionPnl": round(sum(float(x.get("pnl", 0) or 0) for x in p), 6),
                           "closeReason": p[0].get("close_reason")})
        elif r and not p:
            extra.append({"asset": asset, "entryHour": hr,
                          "replayPnl": round(sum(float(x.get("pnl", 0) or 0) for x in r), 6),
                          "closeReason": r[0].get("close_reason")})

    prod_pnl = round(sum(float(x.get("pnl", 0) or 0) for x in prod), 6)
    replay_pnl = round(sum(float(x.get("pnl", 0) or 0) for x in replay), 6)

    prod_assets = sorted({r.get("asset", "") for r in prod})
    replay_assets = sorted({r.get("asset", "") for r in replay})

    summary = {
        "signal": args.signal,
        "window": {"start": args.start, "end": args.end, "matchOn": args.match_on},
        "productionTrades": len(prod),
        "replayTrades": len(replay),
        "matchedWithProduction": len(matched),
        "missed": len(missed),
        "extra": len(extra),
        "productionPnl": prod_pnl,
        "replayPnl": replay_pnl,
        "pnlCorrelationMatched": (round(pearson(corr_prod, corr_replay), 4)
                                  if pearson(corr_prod, corr_replay) is not None else None),
        "assetOverlap": {
            "productionAssets": len(prod_assets),
            "replayAssets": len(replay_assets),
            "intersection": len(set(prod_assets) & set(replay_assets)),
            "productionOnly": sorted(set(prod_assets) - set(replay_assets)),
            "replayOnly": sorted(set(replay_assets) - set(prod_assets)),
        },
        "closeReasonBreakdown": {
            "production": _reason_counts(prod),
            "replay": _reason_counts(replay),
        },
        "detail": {"matched": matched, "missed": missed, "extra": extra},
    }
    json.dump(summary, sys.stdout, indent=2)
    print()
    return 0


def _reason_counts(rows: list[dict]) -> dict[str, int]:
    c: dict[str, int] = defaultdict(int)
    for r in rows:
        c[r.get("close_reason", "")] += 1
    return dict(sorted(c.items()))


if __name__ == "__main__":
    raise SystemExit(main())
