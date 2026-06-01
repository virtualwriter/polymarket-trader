#!/usr/bin/env python3
"""
Execution-strategy backtest for the WEEKEND_HL_FUNDING_REVERSION_LONG signal.

Replays the existing weekend_funding_reversion.json trade ledger with one or
more execution enhancements layered on top, using all_stocks_candles.json for
hourly OHLC during each trade's hold window.

Enhancements supported:
  1) Time-of-day exit  — force-close at a UTC hour-of-day cutoff if still open
  2) Per-stock leverage — bucket stocks by realized hourly vol, assign leverage
  3) Funding-magnitude sizing — scale notional by abs(entry_funding) bucket
  4) Trailing take-profit — close if margin P&L drops X% below high-water mark

All four can be combined. Aggregate stats (cum return, WR, Sharpe, p10/p90,
max-trade-loss) are reported per cohort.
"""

from __future__ import annotations
import json, statistics, math
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

BUNDLE = Path(".runtime/funding-analysis-bundle/data")
TRADES_DOC = json.loads((BUNDLE / "weekend_funding_reversion.json").read_text())
CANDLES_ROOT = json.loads((BUNDLE / "all_stocks_candles.json").read_text())
CANDLES_DATA = CANDLES_ROOT["candles"]

BASE_LEVERAGE = 5.0


def parse_ts(s):
    if isinstance(s, datetime): return s
    s2 = s.replace("Z", "+00:00")
    dt = datetime.fromisoformat(s2)
    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
    return dt


# Pre-build per-stock candle list: (ts, low, high, close)
STOCK_CANDLES = {}
for stock, cs in CANDLES_DATA.items():
    arr = []
    for c in cs:
        ms = c.get("time") or c.get("t")
        t = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
        arr.append((t, float(c["low"]), float(c["high"]), float(c["close"])))
    arr.sort()
    STOCK_CANDLES[stock] = arr


def candle_at_or_before(stock, t):
    cs = STOCK_CANDLES.get(stock, [])
    best = None
    for c in cs:
        if c[0] <= t: best = c
        else: break
    return best


# Per-stock hourly close-to-close vol (annualization-agnostic — relative only)
STOCK_VOL = {}
for stock, cs in STOCK_CANDLES.items():
    if len(cs) < 50: continue
    rets = []
    for i in range(1, len(cs)):
        p, p0 = cs[i][3], cs[i - 1][3]
        if p0 > 0:
            rets.append(p / p0 - 1)
    if len(rets) > 10:
        STOCK_VOL[stock] = statistics.stdev(rets) * 100  # in %


def bucket_leverage(stock):
    """Three-bucket leverage scheme based on hourly close-to-close vol.

    Top-third by vol → 2x; middle → 3x; bottom → 5x. Determined once on the
    full candle sample; this is in-sample for the data we have but is the
    cleanest proxy for stock-specific tail risk that doesn't require future
    information. (Same backtest period generated both the vol estimates and
    the trade outcomes, so this is best-case for the bucket scheme — treat
    the improvement as an upper bound.)"""
    if stock not in STOCK_VOL: return BASE_LEVERAGE
    sorted_vols = sorted(STOCK_VOL.values())
    n = len(sorted_vols)
    p33 = sorted_vols[n // 3]
    p66 = sorted_vols[2 * n // 3]
    v = STOCK_VOL[stock]
    if v <= p33: return 5.0
    if v <= p66: return 3.0
    return 2.0


def bucket_funding_size(entry_funding_pct):
    """Funding-magnitude size multiplier on top of base notional.

    Entry condition requires funding ≤ -30%. Within that range:
      -30% to -50%   → 1.0x  (current behavior)
      -50% to -100%  → 1.5x
      ≤ -100%        → 2.0x
    Funding pays linearly to size held, so concentrate size where the
    funding pump is largest."""
    f = abs(entry_funding_pct)
    if f >= 100: return 2.0
    if f >= 50: return 1.5
    return 1.0


def simulate_trade(trade, opts):
    """Simulate one trade with the chosen enhancement options.

    opts keys (all optional, default-off):
      monday_open_exit:     bool         — force-close at first Mon ≥13:00 UTC after entry
      tod_cutoff_hour_utc:  int or None  — force exit at this UTC hour if open
      tod_min_hold_h:       float        — only allow ToD cutoff after this many hours
      per_stock_leverage:   bool         — apply bucket_leverage()
      funding_size:         bool         — apply bucket_funding_size()
      trailing_tp_pct:      float|None   — trailing stop X% below HWM (margin %)
      ttp_activation_pct:   float        — only arm TTP after HWM exceeds this (margin %)
    """
    stock = trade["stock"]
    entry_t = parse_ts(trade["entry_dt"])
    exit_t = parse_ts(trade["exit_dt"])
    hold_h = max(0.001, float(trade["hold_hours"]))
    full_price = float(trade["price_ret"])  # spot %
    full_fund = float(trade["fund_coll"])   # %
    entry_funding = float(trade["entry_funding"])

    leverage = bucket_leverage(stock) if opts.get("per_stock_leverage") else BASE_LEVERAGE
    size_mult = bucket_funding_size(entry_funding) if opts.get("funding_size") else 1.0

    # Find entry price from candles
    entry_c = candle_at_or_before(stock, entry_t)
    if entry_c is None:
        # Fall back: no candle data → use ledger-reported P&L
        margin_price = full_price * leverage
        return {"net": (margin_price + full_fund) * size_mult,
                "exited_via": "no_data", "leverage": leverage, "size_mult": size_mult}

    entry_p = entry_c[3]
    tod_cutoff = opts.get("tod_cutoff_hour_utc")
    tod_min_hold = opts.get("tod_min_hold_h", 0)
    monday_open = opts.get("monday_open_exit", False)
    trailing_pct = opts.get("trailing_tp_pct")
    ttp_arm_pct = opts.get("ttp_activation_pct", 0.0)
    ttp_armed = (ttp_arm_pct <= 0)
    hwm_margin = 0.0  # high-water mark of margin P&L
    cs = STOCK_CANDLES[stock]
    elapsed_h_at_close = hold_h
    margin_at_close = full_price * leverage  # default if no early exit
    fund_at_close = full_fund
    exit_reason = "ledger_exit"
    early_close = None

    # Walk candles intra-trade. Note: we check exits at each candle's CLOSE
    # (the hourly bar's close price). HWM uses high; we don't try to model
    # intra-bar fill points beyond stop fills.
    for (t, lo, hi, cl) in cs:
        if t <= entry_t: continue
        if t > exit_t: break

        elapsed_h = (t - entry_t).total_seconds() / 3600

        spot_close = (cl / entry_p - 1) * 100
        margin_close = spot_close * leverage
        spot_high = (hi / entry_p - 1) * 100
        margin_high = spot_high * leverage

        # 1) Trailing TP: arm only after HWM crosses activation threshold
        if trailing_pct is not None:
            if margin_high > hwm_margin:
                hwm_margin = margin_high
            if not ttp_armed and hwm_margin >= ttp_arm_pct:
                ttp_armed = True
            if ttp_armed and (hwm_margin - margin_close) >= trailing_pct:
                frac = min(1.0, max(0.0, elapsed_h / hold_h))
                margin_at_close = margin_close
                fund_at_close = full_fund * frac
                elapsed_h_at_close = elapsed_h
                exit_reason = "trailing_tp"
                early_close = t
                break

        # 2a) Monday-open exit: first weekday Mon at/after 13:00 UTC
        if monday_open and t.weekday() == 0 and t.hour >= 13:
            frac = min(1.0, max(0.0, elapsed_h / hold_h))
            margin_at_close = margin_close
            fund_at_close = full_fund * frac
            elapsed_h_at_close = elapsed_h
            exit_reason = "monday_open"
            early_close = t
            break

        # 2b) Generic hour-of-day cutoff (with min-hold guard)
        if tod_cutoff is not None and t.hour == tod_cutoff and elapsed_h >= tod_min_hold:
            frac = min(1.0, max(0.0, elapsed_h / hold_h))
            margin_at_close = margin_close
            fund_at_close = full_fund * frac
            elapsed_h_at_close = elapsed_h
            exit_reason = "tod_cutoff"
            early_close = t
            break

    net_pct = (margin_at_close + fund_at_close) * size_mult
    return {
        "net": net_pct,
        "margin": margin_at_close * size_mult,
        "fund": fund_at_close * size_mult,
        "exited_via": exit_reason,
        "leverage": leverage,
        "size_mult": size_mult,
        "hold_h": elapsed_h_at_close,
    }


def run_cohort(trades, opts, label):
    results = [simulate_trade(t, opts) for t in trades]
    nets = [r["net"] for r in results]
    nets_s = sorted(nets)
    n = len(nets)
    wins = sum(1 for v in nets if v > 0)
    avg = statistics.mean(nets)
    sd = statistics.stdev(nets) if n > 1 else 0
    sharpe = avg / sd if sd > 0 else 0
    p10 = nets_s[int(0.10 * n)]
    p90 = nets_s[int(0.90 * n)]
    worst = nets_s[0]
    early = sum(1 for r in results if r["exited_via"] in ("tod_cutoff", "trailing_tp", "monday_open"))
    return {
        "label": label, "n": n, "cum": sum(nets), "avg": avg,
        "wr": wins / n * 100, "sharpe": sharpe, "p10": p10, "p90": p90,
        "worst": worst, "early_exits": early,
    }


def print_summary(rows):
    print(f"{'label':<55}{'n':>6}{'cum%':>11}{'avg%':>10}{'WR%':>8}{'sharpe':>9}{'p10':>9}{'p90':>9}{'worst':>10}{'early':>8}")
    print("-" * 135)
    for r in rows:
        print(f"{r['label']:<55}{r['n']:>6}{r['cum']:>+10.1f}%{r['avg']:>+9.3f}%{r['wr']:>7.1f}%{r['sharpe']:>9.3f}{r['p10']:>+8.2f}{r['p90']:>+8.2f}{r['worst']:>+9.2f}{r['early_exits']:>8}"
        )


def main():
    print(f"Per-stock vol-based leverage buckets (hourly close-to-close vol):")
    sorted_stocks = sorted(STOCK_VOL.items(), key=lambda x: x[1])
    n = len(sorted_stocks)
    p33 = sorted_stocks[n // 3][1]
    p66 = sorted_stocks[2 * n // 3][1]
    print(f"  5x bucket (vol ≤ {p33:.3f}%): {[s for s,v in sorted_stocks if v <= p33]}")
    print(f"  3x bucket (vol ≤ {p66:.3f}%): {[s for s,v in sorted_stocks if p33 < v <= p66]}")
    print(f"  2x bucket (vol > {p66:.3f}%): {[s for s,v in sorted_stocks if v > p66]}")
    print()

    # We focus on the +5% exit cohort since it's the closest match to the
    # live signal config (exits when funding reverts back to non-extreme).
    block = TRADES_DOC["exit_5"]
    trades = block["trades"]
    print(f"=== Cohort: {block['label']} ({len(trades)} trades) ===\n")

    # Baseline (no enhancements)
    rows = [run_cohort(trades, {}, "baseline (current strategy)")]

    # Backtest 1: time-of-day exit — focus on "Monday-open" (calendar-aware)
    # and a generic hour-of-day cutoff with a min-hold guard so it doesn't fire
    # immediately on Friday-night entries.
    print(">>> Backtest 1: time-of-day / Monday-open exit <<<")
    tod_rows = []
    tod_rows.append(("MON-13", run_cohort(trades, {"monday_open_exit": True},
                                          "  + Mon ≥13:00 UTC exit (calendar-aware)")))
    for h in [13, 11, 9, 4]:
        for mh in [12, 24]:  # min-hold to skip too-early triggers
            r = run_cohort(trades, {"tod_cutoff_hour_utc": h, "tod_min_hold_h": mh},
                           f"  + ToD @ {h:02d}:00 UTC (min-hold {mh}h)")
            tod_rows.append((f"H{h}_MH{mh}", r))
    print_summary([rows[0]] + [r for _, r in tod_rows])
    best_tod = max(tod_rows, key=lambda x: x[1]["cum"])
    print(f"\nBest ToD variant: {best_tod[0]}  cum={best_tod[1]['cum']:+.1f}% (baseline {rows[0]['cum']:+.1f}%)\n")
    best_tod_opts = ({"monday_open_exit": True} if best_tod[0] == "MON-13"
                     else {"tod_cutoff_hour_utc": int(best_tod[0].split("_")[0][1:]),
                           "tod_min_hold_h": int(best_tod[0].split("MH")[1])})

    # Backtest 4 alone and combined
    print(">>> Backtest 4: trailing take-profit (arm after HWM crosses activation) <<<")
    ttp_rows = []
    for arm in [1.0, 2.0, 3.0, 5.0]:
        for ttp in [0.5, 1.0, 1.5, 2.0]:
            label = f"  + TTP {ttp}% (arm @ {arm}%)"
            ttp_rows.append(((arm, ttp), run_cohort(trades,
                {"trailing_tp_pct": ttp, "ttp_activation_pct": arm}, label)))
    print_summary([rows[0]] + [r for _, r in ttp_rows])
    best_ttp = max(ttp_rows, key=lambda x: x[1]["cum"])
    print(f"\nBest TTP variant: arm={best_ttp[0][0]}% drop={best_ttp[0][1]}%  cum={best_ttp[1]['cum']:+.1f}% (baseline {rows[0]['cum']:+.1f}%)")
    best_ttp_opts = {"trailing_tp_pct": best_ttp[0][1], "ttp_activation_pct": best_ttp[0][0]}

    # Combinations: TTP × each other enhancement, and all four together
    print("\n>>> Backtest 4 + other enhancements <<<")
    def merged(*ds):
        out = {}
        for d in ds: out.update(d)
        return out
    combo_rows = [rows[0]]
    combo_rows.append(run_cohort(trades, best_ttp_opts, "  + TTP only  (Backtest 4 alone)"))
    combo_rows.append(run_cohort(trades, best_tod_opts, "  + best ToD only  (Backtest 1 alone)"))
    combo_rows.append(run_cohort(trades, {"per_stock_leverage": True}, "  + per-stock leverage  (Backtest 2 alone)"))
    combo_rows.append(run_cohort(trades, {"funding_size": True}, "  + funding-magnitude size  (Backtest 3 alone)"))
    combo_rows.append(run_cohort(trades, merged(best_ttp_opts, best_tod_opts), "  + TTP + best ToD"))
    combo_rows.append(run_cohort(trades, merged(best_ttp_opts, {"per_stock_leverage": True}), "  + TTP + per-stock lev"))
    combo_rows.append(run_cohort(trades, merged(best_ttp_opts, {"funding_size": True}), "  + TTP + funding size"))
    combo_rows.append(run_cohort(trades, merged(best_tod_opts, {"per_stock_leverage": True, "funding_size": True}),
                                 "  + ToD + lev + size (no TTP)"))
    combo_rows.append(run_cohort(trades, merged(best_ttp_opts, best_tod_opts,
                                                 {"per_stock_leverage": True, "funding_size": True}),
                                 "  + ALL FOUR"))
    print_summary(combo_rows)


if __name__ == "__main__":
    main()
