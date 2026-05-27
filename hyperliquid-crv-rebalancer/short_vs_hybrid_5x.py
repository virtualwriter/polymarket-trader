#!/usr/bin/env python3
"""
Apples-to-apples 5x comparison: short-only vs hybrid.

Two questions this answers:

  1. Is the portfolio Sharpe better for 5x short-only than 5x hybrid?
     (The fee_aware_grid.py short-only run only printed per-coin Sharpe,
      and the per-coin best Sharpes use *different params per coin*,
      which is not what would actually be deployed live.)

  2. Does the long switch actually save the portfolio during a sustained
     bull regime (i.e. the multi-month black-swan scenario)? We identify
     every sustained bull stretch in the data and report per-strategy
     P&L over each stretch and over the cumulative bull period.

Output saved to short_vs_hybrid_5x.json in the repo.
"""

from __future__ import annotations

import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

from fee_aware_hybrid_grid import (
    BASE_DIR, START_DATE, REGIME_EMA, SIGNAL_LOOKBACK_HOURS,
    discover_coins, load_data, compute_ema, build_signal_mask,
    backtest_hybrid, sharpe, max_drawdown, INITIAL_CAPITAL,
)


def backtest_short_only(prices, short_ema, s_in, s_out, fee_pct, leverage):
    """Match backtest_hybrid signature semantics for apples-to-apples Sharpe.

    Same liquidation + fee model as backtest_hybrid, but never flips to long.
    """
    n = len(prices)
    ema_s = compute_ema(prices, short_ema)
    capital = INITIAL_CAPITAL
    entry_p = None
    trades = 0
    wins = 0
    liqs = 0
    equity = []
    fee_cost = 2 * leverage * fee_pct / 100
    liq_move_pct = (1.0 / leverage) * 0.95 * 100 if leverage > 1 else None
    start = max(short_ema, REGIME_EMA, SIGNAL_LOOKBACK_HOURS)

    for i in range(start, n):
        p = prices[i]
        if entry_p is not None:
            adverse = (p / entry_p - 1) * 100
            if liq_move_pct is not None and adverse >= liq_move_pct:
                capital = 0.0
                liqs += 1
                trades += 1
                entry_p = None
                equity.extend([0.0] * (n - i))
                break
            e = ema_s[i]
            if e is not None and p > e * (1 + s_out / 100):
                gross = (entry_p / p - 1) * leverage
                net = gross - fee_cost
                capital *= 1 + net
                if net > 0:
                    wins += 1
                trades += 1
                entry_p = None
        else:
            e = ema_s[i]
            if e is not None and p < e * (1 - s_in / 100):
                entry_p = p
        equity.append(capital)

    if entry_p is not None and prices:
        gross = (entry_p / prices[-1] - 1) * leverage
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


def identify_bull_stretches(mask: list[bool], min_len: int = 24 * 7):
    """Find contiguous runs of bull-signal-active bars >= min_len hours.

    Returns list of (start_idx, end_idx, length_hours).
    """
    stretches = []
    i = 0
    n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            length = j - i
            if length >= min_len:
                stretches.append((i, j, length))
            i = j
        else:
            i += 1
    return stretches


def equity_slice_return(equity: list[float], a: int, b: int) -> float:
    """Return % of equity[a..b]. Handles 0-floored equity."""
    if a >= len(equity) or b > len(equity) or a >= b:
        return 0.0
    start_v = equity[a]
    end_v = equity[b - 1]
    if start_v <= 0:
        return 0.0
    return (end_v / start_v - 1) * 100


def main():
    coins = discover_coins()
    coin_prices = {c: load_data(c) for c in coins}
    coin_prices = {c: p for c, p in coin_prices.items() if p}
    n_common = min(len(p) for p in coin_prices.values())
    coin_prices = {c: p[:n_common] for c, p in coin_prices.items()}
    print(f"Loaded {len(coin_prices)} coins, {n_common} hourly bars")

    leverage = 5.0
    fee = 0.045

    # Three strategy configurations to compare apples-to-apples at 5x.
    configs = [
        {
            "name": "short_only_best_portfolio_5x",
            "type": "short_only",
            "params": {"s_ema": 8, "s_in": 0.30, "s_out": 0.75},
            "note": "fee_aware_grid.py portfolio-best at 5x",
        },
        {
            "name": "hybrid_current_live_params",
            "type": "hybrid",
            "params": {"s_ema": 4, "s_in": 0.30, "s_out": 1.50,
                       "l_ema": 5, "l_in": 1.00, "l_out": 1.00, "thr": 10},
            "note": "what the live bot would do if leverage flipped to 5x",
        },
        {
            "name": "hybrid_best_portfolio_5x",
            "type": "hybrid",
            "params": {"s_ema": 6, "s_in": 0.30, "s_out": 0.75,
                       "l_ema": 5, "l_in": 0.50, "l_out": 0.50, "thr": 8},
            "note": "fee_aware_hybrid_grid.py portfolio-best at 5x",
        },
    ]

    # Precompute bull masks needed by hybrid configs.
    masks = {}
    for cfg in configs:
        if cfg["type"] == "hybrid":
            thr = cfg["params"]["thr"]
            if thr not in masks:
                masks[thr] = build_signal_mask(coin_prices, thr)

    # Scan multiple thresholds to characterize bull-regime presence in data.
    print("\nBULL-REGIME PREVALENCE IN HISTORICAL DATA")
    print("-" * 80)
    print(f"{'thr':>4}  {'fires%':>7}  {'stretches>=24h':>14}  "
          f"{'stretches>=7d':>14}  {'longest_stretch':>16}")
    for thr in [6, 7, 8, 9, 10, 11, 12]:
        m = masks.get(thr) or build_signal_mask(coin_prices, thr)
        masks[thr] = m
        fire_pct = sum(m) / len(m) * 100
        s24 = identify_bull_stretches(m, min_len=24)
        s7d = identify_bull_stretches(m, min_len=24 * 7)
        longest = max((L for _, _, L in s24), default=0)
        print(f"{thr:>4}  {fire_pct:>6.1f}%  {len(s24):>14}  {len(s7d):>14}  "
              f"{longest:>10}h ({longest/24:.1f}d)")

    # Use thr=10 (the live threshold) for stress-test reporting, even if no
    # week-long stretch exists. Fall back to >=24h stretches so we have data.
    primary_mask = masks[10]
    bull_stretches = identify_bull_stretches(primary_mask, min_len=24)
    print(f"\nUsing >=24h stretches at thr=10: {len(bull_stretches)} found")
    for idx, (s, e, L) in enumerate(bull_stretches[:8]):
        print(f"  #{idx}: bar {s}-{e}  ({L} hours, {L/24:.1f} days)")
    total_bull_hours = sum(L for _, _, L in bull_stretches)
    print(f"Total sustained-bull hours: {total_bull_hours} "
          f"({total_bull_hours/n_common*100:.1f}% of all bars)")

    # Run each config across every coin, aggregate.
    results = {}
    for cfg in configs:
        per_coin = {}
        for coin, prices in coin_prices.items():
            if cfg["type"] == "short_only":
                p = cfg["params"]
                r = backtest_short_only(prices, p["s_ema"], p["s_in"], p["s_out"],
                                        fee, leverage)
            else:
                p = cfg["params"]
                r = backtest_hybrid(prices, masks[p["thr"]],
                                    p["s_ema"], p["s_in"], p["s_out"],
                                    p["l_ema"], p["l_in"], p["l_out"],
                                    fee, leverage)
            per_coin[coin] = r

        avg_ret = sum(r["return_pct"] for r in per_coin.values()) / len(per_coin)
        neg = sum(1 for r in per_coin.values() if r["return_pct"] < 0)
        avg_sharpe = sum(sharpe(r["equity"]) for r in per_coin.values()) / len(per_coin)
        avg_mdd = sum(max_drawdown(r["equity"]) for r in per_coin.values()) / len(per_coin)
        total_liqs = sum(r["liquidations"] for r in per_coin.values())
        avg_trades = sum(r["trades"] for r in per_coin.values()) / len(per_coin)

        # P&L during sustained bull stretches.
        bull_returns_per_coin = {}
        for coin, r in per_coin.items():
            eq = r["equity"]
            seg_rets = []
            for s, e, _ in bull_stretches:
                # Equity index is offset by `start` from price index; for hybrid
                # backtest start = max(short_ema, long_ema, 50, 24). Conservatively
                # offset by 50 (REGIME_EMA) which both configs share.
                a = max(0, s - REGIME_EMA)
                b = min(len(eq), e - REGIME_EMA)
                if a < b:
                    seg_rets.append(equity_slice_return(eq, a, b))
            bull_returns_per_coin[coin] = seg_rets
        # Average each stretch across coins.
        avg_per_stretch = []
        for idx, (s, e, L) in enumerate(bull_stretches):
            vals = [bull_returns_per_coin[c][idx]
                    for c in per_coin if idx < len(bull_returns_per_coin[c])]
            avg_per_stretch.append({
                "stretch_idx": idx,
                "length_hours": L,
                "avg_coin_return_pct": sum(vals) / len(vals) if vals else 0.0,
                "neg_coins_in_stretch": sum(1 for v in vals if v < 0),
            })

        results[cfg["name"]] = {
            "config": cfg,
            "avg_ret_pct": avg_ret,
            "neg_coins": neg,
            "total_coins": len(per_coin),
            "avg_sharpe": avg_sharpe,
            "avg_mdd_pct": avg_mdd,
            "total_liquidations": total_liqs,
            "avg_trades": avg_trades,
            "per_coin_ret": {c: r["return_pct"] for c, r in per_coin.items()},
            "per_coin_liqs": {c: r["liquidations"] for c, r in per_coin.items()},
            "bull_stretch_returns": avg_per_stretch,
        }

    # Print comparison table
    print()
    print("APPLES-TO-APPLES 5x COMPARISON  (fee=4.5 bps, 13 coins)")
    print("=" * 110)
    print(f"{'Config':>38}  {'AvgRet':>10}  {'Sharpe':>7}  {'MDD':>6}  "
          f"{'Neg':>5}  {'Trades':>7}  {'Liqs':>5}")
    print("-" * 110)
    for name, r in results.items():
        print(f"{name:>38}  {r['avg_ret_pct']:>+9.1f}%  "
              f"{r['avg_sharpe']:>6.2f}  {r['avg_mdd_pct']:>5.1f}%  "
              f"{r['neg_coins']:>2}/{r['total_coins']:<2}  "
              f"{r['avg_trades']:>7.0f}  {r['total_liquidations']:>5}")

    # Print bull-stretch behavior
    print()
    print("BULL-REGIME STRESS TEST (per sustained-bull stretch, avg across 13 coins)")
    print("=" * 110)
    header = f"{'stretch':>9} {'len(h)':>7}"
    for name in results:
        header += f"  {name[:24]:>26}"
    print(header)
    for idx in range(len(bull_stretches)):
        L = bull_stretches[idx][2]
        line = f"{idx:>9} {L:>7}"
        for name, r in results.items():
            seg = r["bull_stretch_returns"][idx]
            line += f"  {seg['avg_coin_return_pct']:>+22.1f}%  ({seg['neg_coins_in_stretch']}neg)"
        print(line)

    # Save
    out_path = BASE_DIR / "short_vs_hybrid_5x.json"
    out_path.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "fee_pct": fee,
        "leverage": leverage,
        "n_coins": len(coin_prices),
        "n_bars": n_common,
        "bull_stretches": [{"start": s, "end": e, "length_hours": L}
                            for s, e, L in bull_stretches],
        "results": results,
    }, indent=2))
    print(f"\nSaved to {out_path.name}")


if __name__ == "__main__":
    main()
