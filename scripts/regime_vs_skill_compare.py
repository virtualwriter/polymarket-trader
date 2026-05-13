#!/usr/bin/env python3
"""
Settle the regime-vs-skill question by comparing the one_touch and legacy_2x
models on the same dates, at the same hold lengths, using identical dedup and
eligibility rules.

For each model x hold pair, computes:
- Headline (all daily-deduped trades, bid/ask + midpoint P&L, win rate)
- Candidate slice: Strict + side=no + |edge|>=10 (no OIL)
- Inverse-sanity slice: Strict + side=yes + |edge|>=10
- Asset breakdown
- Side breakdown

Dedup rule: at most one entry per (market_id, best_expression) per UTC day,
earliest snapshot wins. Strict eligibility drops rows whose entry_flags
intersect STRICT_BAD_FLAGS.

Outputs to stdout AND writes:
- relative-value/backtests/regime_vs_skill_summary.md
"""
from __future__ import annotations

import csv
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
BACKTESTS = ROOT / "relative-value" / "backtests"

STRICT_BAD_FLAGS = {
    "wide_pm_spread",
    "low_pm_liquidity",
    "extreme_perp_funding",
    "above_underlying_cap",
    "near_underlying_cap_bullish",
    "missing_options_iv",
    "no_listed_options_mapping",
}


def safe_float(value):
    try:
        if value in (None, ""):
            return None
        v = float(value)
        if v != v or v in (float("inf"), float("-inf")):
            return None
        return v
    except (TypeError, ValueError):
        return None


def parse_time(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        p = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if p.tzinfo is None:
            p = p.replace(tzinfo=timezone.utc)
        return p.astimezone(timezone.utc)
    except ValueError:
        return None


def flag_set(s):
    return {t.strip() for t in (s or "").split(";") if t.strip()}


def midpoint_pnl(side, entry_mid, exit_mid):
    if entry_mid is None or exit_mid is None:
        return None
    if side == "yes":
        if not (0 < entry_mid < 1):
            return None
        return (exit_mid / entry_mid - 1.0) * 100.0
    entry_no = 1.0 - entry_mid
    exit_no = 1.0 - exit_mid
    if not (0 < entry_no < 1):
        return None
    return (exit_no / entry_no - 1.0) * 100.0


def load_and_dedupe(path: Path) -> List[Dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    enriched = []
    for r in rows:
        if r.get("status") != "closed":
            continue
        pnl_b = safe_float(r.get("pnl_pct"))
        if pnl_b is None:
            continue
        et = parse_time(r.get("entry_time"))
        if et is None:
            continue
        side = r.get("side", "")
        entry_mid = safe_float(r.get("entry_pm_yes_price"))
        exit_mid = safe_float(r.get("exit_pm_yes_price"))
        edge = safe_float(r.get("entry_edge_score"))
        enriched.append({
            "entry_time": et,
            "entry_date": et.date().isoformat(),
            "iso_week": et.strftime("%G-W%V"),
            "asset": r.get("asset", ""),
            "side": side,
            "market_id": r.get("market_id", ""),
            "best_expression": r.get("best_expression", ""),
            "contract_question": r.get("contract_question", ""),
            "edge": edge,
            "iv_resolution": r.get("iv_resolution", "") or "unknown",
            "flags": flag_set(r.get("entry_flags", "")),
            "pnl_bidask": pnl_b,
            "pnl_mid": midpoint_pnl(side, entry_mid, exit_mid),
        })

    chosen = {}
    for r in sorted(enriched, key=lambda x: x["entry_time"]):
        key = (r["market_id"], r["best_expression"], r["entry_date"])
        if key not in chosen:
            chosen[key] = r
    return list(chosen.values())


def summarize(rows: List[Dict]) -> Dict:
    if not rows:
        return {"n": 0}
    b = [r["pnl_bidask"] for r in rows if r["pnl_bidask"] is not None]
    m = [r["pnl_mid"] for r in rows if r["pnl_mid"] is not None]
    by_wk = defaultdict(list)
    for r in rows:
        by_wk[r["iso_week"]].append(r["pnl_bidask"])
    weekly_means = [statistics.mean(v) for v in by_wk.values() if v]
    return {
        "n": len(rows),
        "unique": len({r["market_id"] for r in rows}),
        "weeks": len(by_wk),
        "bidask_win": (sum(1 for v in b if v > 0) / len(b) * 100) if b else None,
        "bidask_avg": statistics.mean(b) if b else None,
        "bidask_median": statistics.median(b) if b else None,
        "mid_win": (sum(1 for v in m if v > 0) / len(m) * 100) if m else None,
        "mid_avg": statistics.mean(m) if m else None,
        "weekly_std": statistics.stdev(weekly_means) if len(weekly_means) > 1 else None,
    }


def filter_strict(rows):
    return [r for r in rows if not (r["flags"] & STRICT_BAD_FLAGS)]


def candidate_no_oil(rows):
    strict = filter_strict(rows)
    return [r for r in strict
            if r["side"] == "no" and r["edge"] is not None and abs(r["edge"]) >= 10
            and "oil_snapshot_uses_brent" not in r["flags"]]


def inverse_yes(rows):
    strict = filter_strict(rows)
    return [r for r in strict
            if r["side"] == "yes" and r["edge"] is not None and abs(r["edge"]) >= 10]


def by_asset(rows, asset):
    return [r for r in rows if r["asset"] == asset]


def by_side(rows, side):
    return [r for r in rows if r["side"] == side]


def fmt(v, sign=True):
    if v is None:
        return "—"
    return (f"{v:+.2f}%" if sign else f"{v:.1f}%")


def fmt_std(v):
    if v is None:
        return "—"
    return f"{v:.2f}pp"


def main():
    holds = [7, 10, 14, 17]
    out_lines = []

    def emit(s=""):
        print(s)
        out_lines.append(s)

    emit("# One-touch vs Legacy-2x — regime-vs-skill comparison")
    emit("")
    emit(f"Generated: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    emit("Source: VPS archive `relative-value/backtest-history/{one_touch,legacy_2x}`, 325 hourly snapshots Apr 7 → May 13 2026.")
    emit("Dedup: 1 entry per (market_id, best_expression) per UTC day, earliest snapshot wins.")
    emit("Conventions: side=yes enters at YES ask, exits at YES bid; side=no enters at NO ask (=1-YES bid), exits at NO bid (=1-YES ask). All long, no shorting.")
    emit("")

    # Load all 8 datasets
    data = {}
    for model in ("one_touch", "legacy_2x"):
        for h in holds:
            if model == "one_touch" and h == 7:
                path = BACKTESTS / "one_touch_all_trades.csv"
            else:
                path = BACKTESTS / f"{model}_{h}d_all_trades.csv"
            data[(model, h)] = load_and_dedupe(path)
            emit(f"Loaded {model} {h}d: {len(data[(model, h)])} daily-deduped rows from {path.name}")
    emit("")

    def table(title, slice_fn, kind="bidask"):
        emit(f"## {title}")
        emit("")
        emit("| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |")
        emit("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
        for h in holds:
            ot = summarize(slice_fn(data[("one_touch", h)]))
            lg = summarize(slice_fn(data[("legacy_2x", h)]))
            ot_avg = ot.get(f"{kind}_avg")
            lg_avg = lg.get(f"{kind}_avg")
            diff = (ot_avg - lg_avg) if (ot_avg is not None and lg_avg is not None) else None
            emit(
                f"| {h}d | {ot.get('n', 0)} | {fmt(ot.get(f'{kind}_win'), sign=False)} | {fmt(ot_avg)} | {fmt_std(ot.get('weekly_std'))} | "
                f"{lg.get('n', 0)} | {fmt(lg.get(f'{kind}_win'), sign=False)} | {fmt(lg_avg)} | {fmt_std(lg.get('weekly_std'))} | "
                f"**{fmt(diff)}** |"
            )
        emit("")

    table("Headline — all daily-deduped (bid/ask)", lambda r: r, kind="bidask")
    table("Headline — all daily-deduped (MIDPOINT)", lambda r: r, kind="mid")
    table("Candidate: Strict + side=no + |edge|>=10 (no OIL) — bid/ask", candidate_no_oil, kind="bidask")
    table("Candidate: Strict + side=no + |edge|>=10 (no OIL) — MIDPOINT", candidate_no_oil, kind="mid")
    table("Inverse sanity: Strict + side=yes + |edge|>=10 — bid/ask", inverse_yes, kind="bidask")
    table("Inverse sanity: Strict + side=yes + |edge|>=10 — MIDPOINT", inverse_yes, kind="mid")
    table("BTC slice (all daily-dedup) — bid/ask", lambda r: by_asset(r, "BTC"), kind="bidask")
    table("GOLD slice (all daily-dedup) — bid/ask", lambda r: by_asset(r, "GOLD"), kind="bidask")
    table("OIL slice (all daily-dedup) — bid/ask", lambda r: by_asset(r, "OIL"), kind="bidask")
    table("side=no (all daily-dedup) — bid/ask", lambda r: by_side(r, "no"), kind="bidask")
    table("side=yes (all daily-dedup) — bid/ask", lambda r: by_side(r, "yes"), kind="bidask")

    # Verdict heuristic
    emit("## Verdict heuristic")
    emit("")
    cand_14d_ot = summarize(candidate_no_oil(data[("one_touch", 14)])).get("bidask_avg")
    cand_14d_lg = summarize(candidate_no_oil(data[("legacy_2x", 14)])).get("bidask_avg")
    inv_14d_ot = summarize(inverse_yes(data[("one_touch", 14)])).get("bidask_avg")
    inv_14d_lg = summarize(inverse_yes(data[("legacy_2x", 14)])).get("bidask_avg")

    emit(f"- Candidate slice (Strict+NO+|edge|>=10, no OIL) at 14d bid/ask: one_touch {fmt(cand_14d_ot)}, legacy_2x {fmt(cand_14d_lg)}")
    emit(f"- Inverse sanity (Strict+YES+|edge|>=10) at 14d bid/ask: one_touch {fmt(inv_14d_ot)}, legacy_2x {fmt(inv_14d_lg)}")
    emit("")

    if cand_14d_ot is None or cand_14d_lg is None:
        emit("Verdict: insufficient data at 14d to call.")
    else:
        diff = cand_14d_ot - cand_14d_lg
        if cand_14d_lg >= 5:
            emit(f"Verdict: **REGIME**. Legacy-2x is also +{cand_14d_lg:.2f}% on the candidate slice — the model adds nothing. Both work because the period worked. Kill the candidate strategy.")
        elif cand_14d_lg >= 1:
            emit(f"Verdict: **MOSTLY REGIME**. Legacy-2x is mildly positive ({fmt(cand_14d_lg)}); one_touch only adds {fmt(diff)} of skill at most. Marginal.")
        elif -2 <= cand_14d_lg <= 2:
            emit(f"Verdict: **SKILL**. Legacy-2x is near zero ({fmt(cand_14d_lg)}); one_touch shows {fmt(cand_14d_ot)}. The candidate slice can graduate to shadow-tracking.")
        else:
            emit(f"Verdict: **STRONG SKILL**. Legacy-2x is negative ({fmt(cand_14d_lg)}); one_touch is {fmt(cand_14d_ot)}. The model genuinely outperforms the simpler heuristic.")

    out_path = BACKTESTS / "regime_vs_skill_summary.md"
    out_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
