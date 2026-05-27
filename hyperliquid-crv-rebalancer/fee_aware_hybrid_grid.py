#!/usr/bin/env python3
"""
Fee-aware HYBRID parameter grid search.

Unlike fee_aware_grid.py (which sweeps the short leg in isolation), this
script jointly sweeps:
  - Short leg:  SHORT_EMA, SHORT_ENTRY, SHORT_EXIT
  - Long leg:   LONG_EMA,  LONG_ENTRY,  LONG_EXIT
  - Regime:     SIGNAL_THRESHOLD (N-of-13 coins above 50h EMA, sustained
                SIGNAL_LOOKBACK_HOURS hours)
At each parameter combo it runs the full hybrid strategy on every coin
(using a shared cross-coin bull signal mask), at the chosen leverage and
fee level, and aggregates portfolio-wide metrics.

Liquidation model matches fee_aware_grid.py: at leverage L the position
is wiped on a (1/L * 0.95) adverse move. Fees scale 2 * L * fee_pct per
round-trip.

Outputs are written to disk so the run can be referenced later:
  - fee_aware_hybrid_grid_<lev>x.csv  : every combo, per-portfolio metrics
  - fee_aware_hybrid_grid_<lev>x_summary.json : top-10 + metadata

Usage:
    python fee_aware_hybrid_grid.py --leverage 1
    python fee_aware_hybrid_grid.py --leverage 5
    python fee_aware_hybrid_grid.py --leverage 5 --coarse
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).parent
START_DATE = datetime(2025, 6, 1, tzinfo=timezone.utc)
INITIAL_CAPITAL = 10_000.0
SIGNAL_LOOKBACK_HOURS = 24
REGIME_EMA = 50


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def discover_coins() -> list[str]:
    coins = []
    for f in sorted(BASE_DIR.glob("*_prices_cg_range.json")):
        if f.name.endswith("_raw.json"):
            continue
        coins.append(f.stem.replace("_prices_cg_range", ""))
    return coins


def load_data(coin: str) -> list[float]:
    raw_path = BASE_DIR / f"{coin}_prices_cg_range_raw.json"
    prices_path = BASE_DIR / f"{coin}_prices_cg_range.json"
    if not raw_path.exists() or not prices_path.exists():
        return []
    raw = json.loads(raw_path.read_text())
    prices = json.loads(prices_path.read_text())
    n = min(len(prices), len(raw))
    timestamps = [datetime.fromtimestamp(raw[i][0] / 1000, tz=timezone.utc) for i in range(n)]
    prices = prices[:n]
    start_idx = next((i for i, dt in enumerate(timestamps) if dt >= START_DATE), 0)
    return prices[start_idx:]


def compute_ema(prices: list[float], period: int) -> list[float | None]:
    if not prices or period <= 0 or len(prices) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    out: list[float | None] = [None] * len(prices)
    out[period - 1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        out[i] = prices[i] * k + out[i - 1] * (1 - k)  # type: ignore[operator]
    return out


# ---------------------------------------------------------------------------
# Cross-coin bull signal: aligned by index across coins of differing length.
# Coins are aligned to the SHORTEST series (right-aligned would distort
# the older-history coins; here we just truncate to the common length so
# every bar i is comparable).
# ---------------------------------------------------------------------------
def build_signal_mask(coin_prices: dict[str, list[float]], threshold: int) -> list[bool]:
    n = min(len(p) for p in coin_prices.values())
    ema50s = {c: compute_ema(p[:n], REGIME_EMA) for c, p in coin_prices.items()}
    above = []
    for i in range(n):
        count = 0
        for c, p in coin_prices.items():
            e = ema50s[c][i]
            if e is not None and p[i] > e:
                count += 1
        above.append(count)
    mask = [False] * n
    for i in range(SIGNAL_LOOKBACK_HOURS, n):
        if all(above[j] >= threshold for j in range(i - SIGNAL_LOOKBACK_HOURS, i)):
            mask[i] = True
    return mask


# ---------------------------------------------------------------------------
# Hybrid backtest with leverage + liquidation
# ---------------------------------------------------------------------------
def backtest_hybrid(prices: list[float], signal_mask: list[bool],
                    short_ema: int, short_entry: float, short_exit: float,
                    long_ema: int, long_entry: float, long_exit: float,
                    fee_pct: float, leverage: float = 1.0,
                    liq_buffer: float = 0.95) -> dict:
    n = min(len(prices), len(signal_mask))
    ema_s = compute_ema(prices[:n], short_ema)
    ema_l = compute_ema(prices[:n], long_ema)

    capital = INITIAL_CAPITAL
    entry_p: float | None = None
    entry_mode: str | None = None
    trades = 0
    wins = 0
    liqs = 0
    equity: list[float] = []

    fee_cost = 2 * leverage * fee_pct / 100
    liq_move_pct = (1.0 / leverage) * liq_buffer * 100 if leverage > 1 else None

    start_idx = max(short_ema, long_ema, REGIME_EMA, SIGNAL_LOOKBACK_HOURS)

    for i in range(start_idx, n):
        p = prices[i]
        mode = 'long' if signal_mask[i] else 'short'

        # If holding a position, check exit (or liquidation) first under the
        # mode it was opened in (don't suddenly flip the position mid-trade
        # when the regime switches — close it under the original rules).
        if entry_p is not None:
            if entry_mode == 'short':
                adverse = (p / entry_p - 1) * 100
                if liq_move_pct is not None and adverse >= liq_move_pct:
                    capital = 0.0
                    liqs += 1
                    trades += 1
                    entry_p = None
                    entry_mode = None
                    equity.extend([0.0] * (n - i))
                    return {
                        "return_pct": (capital / INITIAL_CAPITAL - 1) * 100,
                        "trades": trades, "wins": wins, "liquidations": liqs,
                        "equity": equity,
                    }
                e = ema_s[i]
                if e is not None and p > e * (1 + short_exit / 100):
                    gross = (entry_p / p - 1) * leverage
                    net = gross - fee_cost
                    capital *= 1 + net
                    if net > 0:
                        wins += 1
                    trades += 1
                    entry_p = None
                    entry_mode = None
            elif entry_mode == 'long':
                adverse = (entry_p / p - 1) * 100  # adverse for long = price drop
                if liq_move_pct is not None and adverse >= liq_move_pct:
                    capital = 0.0
                    liqs += 1
                    trades += 1
                    entry_p = None
                    entry_mode = None
                    equity.extend([0.0] * (n - i))
                    return {
                        "return_pct": (capital / INITIAL_CAPITAL - 1) * 100,
                        "trades": trades, "wins": wins, "liquidations": liqs,
                        "equity": equity,
                    }
                e = ema_l[i]
                if e is not None and p < e * (1 - long_exit / 100):
                    gross = (p / entry_p - 1) * leverage
                    net = gross - fee_cost
                    capital *= 1 + net
                    if net > 0:
                        wins += 1
                    trades += 1
                    entry_p = None
                    entry_mode = None
        else:
            # Flat: try to open under current regime.
            if mode == 'short':
                e = ema_s[i]
                if e is not None and p < e * (1 - short_entry / 100):
                    entry_p = p
                    entry_mode = 'short'
            else:
                e = ema_l[i]
                if e is not None and p > e * (1 + long_entry / 100):
                    entry_p = p
                    entry_mode = 'long'

        equity.append(capital)

    # Force-close trailing open position at last price.
    if entry_p is not None:
        p = prices[n - 1]
        if entry_mode == 'short':
            gross = (entry_p / p - 1) * leverage
        else:
            gross = (p / entry_p - 1) * leverage
        net = gross - fee_cost
        capital *= 1 + net
        if net > 0:
            wins += 1
        trades += 1
        if equity:
            equity[-1] = capital

    return {
        "return_pct": (capital / INITIAL_CAPITAL - 1) * 100,
        "trades": trades, "wins": wins, "liquidations": liqs,
        "equity": equity,
    }


def sharpe(equity: list[float]) -> float:
    if len(equity) < 2:
        return 0.0
    rets = []
    for i in range(1, len(equity)):
        if equity[i - 1] > 0:
            rets.append(equity[i] / equity[i - 1] - 1)
    if len(rets) < 2:
        return 0.0
    std = statistics.stdev(rets)
    if std == 0:
        return 0.0
    return statistics.mean(rets) / std * math.sqrt(24 * 365)


def max_drawdown(equity: list[float]) -> float:
    if not equity:
        return 0.0
    peak = equity[0]
    mdd = 0.0
    for v in equity:
        if v > peak:
            peak = v
        if peak > 0:
            mdd = max(mdd, (peak - v) / peak * 100)
    return mdd


# ---------------------------------------------------------------------------
# Grid search
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Fee-aware HYBRID parameter grid")
    parser.add_argument("--fee", type=float, default=0.045)
    parser.add_argument("--leverage", type=float, default=1.0)
    parser.add_argument("--coarse", action="store_true",
                        help="Smaller grid (fast). ~108 combos vs ~972.")
    parser.add_argument("--top", type=int, default=15,
                        help="How many top combos to print (default 15).")
    args = parser.parse_args()

    if args.coarse:
        short_emas = [4, 8]
        short_entries = [0.30, 0.75]
        short_exits = [0.75, 1.50]
        long_emas = [5, 8]
        long_entries = [0.5, 1.0]
        long_exits = [0.5, 1.0]
        thresholds = [9, 11]
    else:
        short_emas = [4, 6, 8]
        short_entries = [0.30, 0.50, 1.00]
        short_exits = [0.75, 1.00, 1.50]
        long_emas = [3, 5, 8]
        long_entries = [0.50, 1.00]
        long_exits = [0.50, 1.00]
        thresholds = [8, 10, 12]

    total_combos = (len(short_emas) * len(short_entries) * len(short_exits)
                    * len(long_emas) * len(long_entries) * len(long_exits)
                    * len(thresholds))

    coins = discover_coins()
    coin_prices = {c: load_data(c) for c in coins}
    coin_prices = {c: p for c, p in coin_prices.items() if p}
    common_n = min(len(p) for p in coin_prices.values())
    coin_prices = {c: p[:common_n] for c, p in coin_prices.items()}

    print(f"Loaded {len(coin_prices)} coins, {common_n} hourly bars  "
          f"|  fee = {args.fee}% ({args.fee*100:.1f} bps)  "
          f"|  leverage = {args.leverage}x")
    print(f"Grid: short EMA{short_emas} entry{short_entries} exit{short_exits}, "
          f"long EMA{long_emas} entry{long_entries} exit{long_exits}, "
          f"threshold{thresholds}")
    print(f"Total combos: {total_combos:,}  × {len(coin_prices)} coins "
          f"= {total_combos * len(coin_prices):,} backtests")
    if args.leverage > 1:
        liq_pct = (1.0 / args.leverage) * 0.95 * 100
        print(f"Liquidation: positions wiped on {liq_pct:.1f}% adverse move")
    print()

    # Precompute signal masks per threshold (independent of short/long params).
    masks: dict[int, list[bool]] = {}
    for thr in thresholds:
        masks[thr] = build_signal_mask(coin_prices, thr)
        fire_pct = sum(masks[thr]) / len(masks[thr]) * 100
        print(f"Signal threshold {thr}/{len(coin_prices)}: fires {fire_pct:.1f}% of bars "
              f"({sum(masks[thr])}/{len(masks[thr])})")
    print()

    # Sweep
    results = []  # list of dicts (one row per param combo, aggregated)
    combo_idx = 0
    for thr in thresholds:
        mask = masks[thr]
        for se in short_emas:
            for s_in in short_entries:
                for s_out in short_exits:
                    for le in long_emas:
                        for l_in in long_entries:
                            for l_out in long_exits:
                                combo_idx += 1
                                per_coin = []
                                for coin, prices in coin_prices.items():
                                    r = backtest_hybrid(
                                        prices, mask, se, s_in, s_out,
                                        le, l_in, l_out, args.fee,
                                        args.leverage,
                                    )
                                    per_coin.append((
                                        coin, r["return_pct"], r["trades"],
                                        r["wins"], r["liquidations"], r["equity"],
                                    ))
                                avg_ret = sum(x[1] for x in per_coin) / len(per_coin)
                                avg_trades = sum(x[2] for x in per_coin) / len(per_coin)
                                neg = sum(1 for x in per_coin if x[1] < 0)
                                total_liqs = sum(x[4] for x in per_coin)
                                # Equal-weight portfolio sharpe: average per-coin sharpe.
                                avg_sharpe = sum(sharpe(x[5]) for x in per_coin) / len(per_coin)
                                avg_mdd = sum(max_drawdown(x[5]) for x in per_coin) / len(per_coin)
                                results.append({
                                    "thr": thr, "s_ema": se, "s_in": s_in, "s_out": s_out,
                                    "l_ema": le, "l_in": l_in, "l_out": l_out,
                                    "avg_ret": avg_ret, "avg_trades": avg_trades,
                                    "neg_coins": neg, "total_coins": len(per_coin),
                                    "total_liqs": total_liqs,
                                    "avg_sharpe": avg_sharpe, "avg_mdd": avg_mdd,
                                    "per_coin_ret": {x[0]: x[1] for x in per_coin},
                                })
                                if combo_idx % 50 == 0:
                                    print(f"  ... {combo_idx}/{total_combos} combos done")

    print()
    results.sort(key=lambda r: r["avg_ret"], reverse=True)

    # ----- Print top N -----
    print(f"TOP {args.top} HYBRID PARAM SETS  (fee={args.fee*100:.1f} bps, lev={args.leverage}x)")
    print("-" * 130)
    print(f"{'Rank':>4}  {'Thr':>3}  {'sEMA':>4} {'sIn%':>5} {'sOut%':>6}  "
          f"{'lEMA':>4} {'lIn%':>5} {'lOut%':>6}  {'AvgRet':>11}  {'Trades':>7}  "
          f"{'Neg':>5}  {'Sharpe':>7}  {'MDD':>6}  {'Liqs':>5}")
    print("-" * 130)
    for i, r in enumerate(results[:args.top], 1):
        print(f"{i:>4}  {r['thr']:>3}  {r['s_ema']:>4} {r['s_in']:>4.2f}% {r['s_out']:>5.2f}%  "
              f"{r['l_ema']:>4} {r['l_in']:>4.2f}% {r['l_out']:>5.2f}%  "
              f"{r['avg_ret']:>+10.1f}%  {r['avg_trades']:>7.0f}  "
              f"{r['neg_coins']:>2}/{r['total_coins']:<2}  "
              f"{r['avg_sharpe']:>6.2f}  {r['avg_mdd']:>5.1f}%  {r['total_liqs']:>5}")

    # ----- Compare vs current live (4/0.30/1.50 short, 5/1.0/1.0 long, thr=10) -----
    cur = next((r for r in results
                if r["s_ema"] == 4 and r["s_in"] == 0.30 and r["s_out"] == 1.50
                and r["l_ema"] == 5 and r["l_in"] == 1.00 and r["l_out"] == 1.00
                and r["thr"] == 10), None)
    if cur:
        print()
        print(f"CURRENT LIVE CONFIG (thr=10, short 4/0.30/1.50, long 5/1.0/1.0):")
        print(f"  avg ret {cur['avg_ret']:+.1f}%  trades {cur['avg_trades']:.0f}  "
              f"neg {cur['neg_coins']}/{cur['total_coins']}  "
              f"sharpe {cur['avg_sharpe']:.2f}  MDD {cur['avg_mdd']:.1f}%  "
              f"liqs {cur['total_liqs']}")
        top = results[0]
        print(f"BEST            (thr={top['thr']}, short {top['s_ema']}/{top['s_in']:.2f}/{top['s_out']:.2f}, "
              f"long {top['l_ema']}/{top['l_in']:.2f}/{top['l_out']:.2f}):")
        print(f"  avg ret {top['avg_ret']:+.1f}%  trades {top['avg_trades']:.0f}  "
              f"neg {top['neg_coins']}/{top['total_coins']}  "
              f"sharpe {top['avg_sharpe']:.2f}  MDD {top['avg_mdd']:.1f}%  "
              f"liqs {top['total_liqs']}")

    # ----- Persist to repo -----
    lev_tag = f"{int(args.leverage)}x" if args.leverage.is_integer() else f"{args.leverage}x"
    csv_path = BASE_DIR / f"fee_aware_hybrid_grid_{lev_tag}.csv"
    json_path = BASE_DIR / f"fee_aware_hybrid_grid_{lev_tag}_summary.json"

    fieldnames = ["thr", "s_ema", "s_in", "s_out", "l_ema", "l_in", "l_out",
                  "avg_ret", "avg_trades", "neg_coins", "total_coins",
                  "total_liqs", "avg_sharpe", "avg_mdd"]
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in results:
            w.writerow({k: round(r[k], 4) if isinstance(r[k], float) else r[k]
                        for k in fieldnames})

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "leverage": args.leverage,
        "fee_pct": args.fee,
        "n_coins": len(coin_prices),
        "n_bars": common_n,
        "grid": {
            "short_emas": short_emas, "short_entries": short_entries,
            "short_exits": short_exits, "long_emas": long_emas,
            "long_entries": long_entries, "long_exits": long_exits,
            "thresholds": thresholds,
        },
        "signal_fire_pct": {thr: sum(m) / len(m) * 100 for thr, m in masks.items()},
        "top": [{k: r[k] for k in fieldnames} | {"per_coin_ret": r["per_coin_ret"]}
                for r in results[:args.top]],
        "current_live": cur and {k: cur[k] for k in fieldnames},
    }
    json_path.write_text(json.dumps(summary, indent=2))

    print()
    print(f"Saved {len(results)} rows to {csv_path.name}")
    print(f"Saved top-{args.top} summary to {json_path.name}")


if __name__ == "__main__":
    main()
