#!/usr/bin/env python3
"""
Fee-aware parameter grid search for the short leg.

The default backtest used SHORT_EMA=3h, SHORT_ENTRY=0.5%, SHORT_EXIT=0.5%
at an assumed 3.5 bps taker. With real Hyperliquid taker fees of 4.5 bps,
high-trade-count coins (FARTCOIN, PURR, INJ, CRV) lose meaningful edge to
fees. This script sweeps a range of (SHORT_EMA, ENTRY, EXIT) settings on
each coin at the 4.5 bps fee level and prints:

  1. Best params per coin (by total return)
  2. Best portfolio-wide params (by average return across all coins)
  3. Trade-count and Sharpe at each promising operating point

It only sweeps the short leg — the long-leg parameters and bull-signal
mechanics are unchanged. The hybrid switch fires <7% of the time so the
short leg dominates the strategy economics.

Usage:
    python fee_aware_grid.py
    python fee_aware_grid.py --fee 0.045
    python fee_aware_grid.py --coarse        # fewer combos for quick iteration
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).parent


# ---------------------------------------------------------------------------
# Data loading (mirrors hybrid_breakdown.py)
# ---------------------------------------------------------------------------
START_DATE = datetime(2025, 6, 1, tzinfo=timezone.utc)


def discover_coins() -> list[str]:
    coins = []
    for f in sorted(BASE_DIR.glob("*_prices_cg_range.json")):
        coin = f.stem.replace("_prices_cg_range", "")
        coins.append(coin)
    return coins


def load_data(coin: str) -> list[float]:
    """Load post-START_DATE hourly prices for a coin.

    Layout on disk (mirrors hybrid_breakdown.py):
      - <coin>_prices_cg_range.json:     list[float] of prices
      - <coin>_prices_cg_range_raw.json: list[[ts_ms, price]] aligned 1:1
    """
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
    if not prices or period <= 0:
        return [None] * len(prices)
    alpha = 2 / (period + 1)
    out: list[float | None] = []
    ema: float | None = None
    for i, p in enumerate(prices):
        if i < period - 1:
            out.append(None)
            continue
        if ema is None:
            ema = sum(prices[: period]) / period
        else:
            ema = alpha * p + (1 - alpha) * ema
        out.append(ema)
    return out


# ---------------------------------------------------------------------------
# Short-only backtest at parameterized (EMA, entry, exit, fee)
# ---------------------------------------------------------------------------
def backtest_short(prices: list[float], ema_period: int, entry_pct: float,
                   exit_pct: float, fee_pct: float) -> dict:
    """Hourly short-only simulation. Returns dict with capital metrics."""
    ema = compute_ema(prices, ema_period)
    capital = 10_000.0
    entry_p = None
    trades = 0
    wins = 0
    equity = []
    start_idx = ema_period

    for i in range(start_idx, len(prices)):
        p, e = prices[i], ema[i]
        if e is None:
            equity.append(capital)
            continue
        if entry_p is None:
            if p < e * (1 - entry_pct / 100):
                entry_p = p
        else:
            if p > e * (1 + exit_pct / 100):
                gross = entry_p / p - 1
                # Two legs of fees per round-trip (entry + exit)
                net = (1 + gross) * (1 - fee_pct / 100) / (1 + fee_pct / 100) - 1
                capital = capital * (1 + net)
                if net > 0:
                    wins += 1
                trades += 1
                entry_p = None
        equity.append(capital)

    if entry_p is not None and prices:
        gross = entry_p / prices[-1] - 1
        net = (1 + gross) * (1 - fee_pct / 100) / (1 + fee_pct / 100) - 1
        capital = capital * (1 + net)
        if net > 0:
            wins += 1
        trades += 1
        if equity:
            equity[-1] = capital

    return {
        "return_pct": (capital / 10_000 - 1) * 100,
        "trades": trades,
        "wins": wins,
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
    mean = statistics.mean(rets)
    std = statistics.stdev(rets) if len(rets) > 1 else 0.0
    if std == 0:
        return 0.0
    # Annualize from hourly: sqrt(24 * 365)
    return mean / std * math.sqrt(24 * 365)


# ---------------------------------------------------------------------------
# Grid search
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Fee-aware parameter grid")
    parser.add_argument("--fee", type=float, default=0.045,
                        help="Taker fee percent (default 0.045 = 4.5 bps)")
    parser.add_argument("--coarse", action="store_true",
                        help="Use a smaller param grid for faster iteration")
    args = parser.parse_args()

    if args.coarse:
        ema_grid = [3, 5, 8]
        threshold_grid = [0.5, 1.0, 1.5]
    else:
        ema_grid = [2, 3, 4, 5, 6, 8, 10, 12]
        threshold_grid = [0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

    coins = discover_coins()
    print(f"Loaded {len(coins)} coins  |  fee = {args.fee}% ({args.fee*100:.1f} bps)")
    print(f"Grid: EMA in {ema_grid}, entry/exit in {threshold_grid}")
    print(f"Total combos per coin: {len(ema_grid) * len(threshold_grid) * len(threshold_grid)}")
    print()

    coin_data: dict[str, list[float]] = {}
    for coin in coins:
        prices = load_data(coin)
        if prices:
            coin_data[coin] = prices

    # ----- Sweep params per coin -----
    best_per_coin: dict[str, dict] = {}
    all_results_by_params: dict[tuple, list[tuple[str, float, int]]] = {}

    for coin, prices in coin_data.items():
        best = None
        for ema in ema_grid:
            for entry in threshold_grid:
                for exit_p in threshold_grid:
                    r = backtest_short(prices, ema, entry, exit_p, args.fee)
                    score = r["return_pct"]
                    key = (ema, entry, exit_p)
                    all_results_by_params.setdefault(key, []).append(
                        (coin, score, r["trades"])
                    )
                    if best is None or score > best["return_pct"]:
                        best = {
                            "ema": ema, "entry": entry, "exit": exit_p,
                            "return_pct": score, "trades": r["trades"],
                            "wins": r["wins"], "sharpe": sharpe(r["equity"]),
                        }
        best_per_coin[coin] = best

    # ----- Per-coin optimum -----
    print("BEST PARAMS PER COIN (4.5 bps)")
    print("-" * 88)
    print(f"{'Coin':>10} {'EMA':>4} {'Entry':>6} {'Exit':>6} {'Return':>10} {'Trades':>7} {'Win%':>6} {'Sharpe':>7}")
    print("-" * 88)
    default_ret = {}
    for coin, b in sorted(best_per_coin.items()):
        # Also compute default params (3h, 0.5%, 0.5%) for comparison
        prices = coin_data[coin]
        d = backtest_short(prices, 3, 0.5, 0.5, args.fee)
        default_ret[coin] = d["return_pct"]
        wr = b["wins"] / b["trades"] * 100 if b["trades"] else 0
        print(f"{coin:>10} {b['ema']:>4} {b['entry']:>5.2f}% {b['exit']:>5.2f}% "
              f"{b['return_pct']:>+9.1f}% {b['trades']:>7} {wr:>5.0f}% {b['sharpe']:>6.2f}")

    # ----- Portfolio-wide optimum -----
    print()
    print("BEST SINGLE PARAM SET (averaged across all coins)")
    print("-" * 88)
    portfolio_scores = []
    for key, results in all_results_by_params.items():
        ema, entry, exit_p = key
        avg_ret = sum(r[1] for r in results) / len(results)
        avg_trades = sum(r[2] for r in results) / len(results)
        portfolio_scores.append((avg_ret, ema, entry, exit_p, avg_trades, results))
    portfolio_scores.sort(reverse=True)

    print(f"{'Rank':>4} {'EMA':>4} {'Entry':>6} {'Exit':>6} {'AvgRet':>10} {'AvgTrades':>10} {'NegCoins':>10}")
    print("-" * 88)
    for rank, (avg_ret, ema, entry, exit_p, avg_trades, results) in enumerate(portfolio_scores[:8], 1):
        neg = sum(1 for _, r, _ in results if r < 0)
        print(f"{rank:>4} {ema:>4} {entry:>5.2f}% {exit_p:>5.2f}% "
              f"{avg_ret:>+9.1f}% {avg_trades:>10.0f} {neg:>6}/{len(results)}")

    # ----- Default comparison -----
    print()
    print("VS CURRENT LIVE BOT SETTING (EMA=3, entry=0.5%, exit=0.5%)")
    print("-" * 88)
    cur_key = (3, 0.5, 0.5)
    cur = all_results_by_params.get(cur_key)
    if cur:
        cur_avg = sum(r[1] for r in cur) / len(cur)
        cur_neg = sum(1 for _, r, _ in cur if r < 0)
        cur_trades = sum(r[2] for r in cur) / len(cur)
        print(f"Current (3/0.5/0.5): avg return {cur_avg:+.1f}%, avg trades {cur_trades:.0f}, neg coins {cur_neg}/{len(cur)}")

        top = portfolio_scores[0]
        print(f"Best portfolio     : ({top[1]}/{top[2]:.2f}/{top[3]:.2f})  "
              f"avg return {top[0]:+.1f}%, avg trades {top[4]:.0f}, "
              f"neg coins {sum(1 for _, r, _ in top[5] if r < 0)}/{len(top[5])}")
        print(f"Improvement        : {top[0] - cur_avg:+.1f}pt return, "
              f"{cur_trades - top[4]:+.0f} fewer trades/coin")


if __name__ == "__main__":
    main()
