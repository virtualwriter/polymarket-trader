#!/usr/bin/env python3
"""
Multi-Coin Backtest — Long, Short & Regime-Switching Strategies
================================================================
Backtests EMA crossover strategies on any coin across three modes:
  --mode long              Long-only (buy when price > EMA + threshold)
  --mode short             Short-only (short when price < EMA - threshold)
  --mode regime            Regime-switching: long in bull, short in bear
                             (50d EMA determines regime; 5h/3h EMAs for entries)

Usage:
    # Quick run for all coins
    python multi_coin_backtest.py

    # Specific coin and mode
    python multi_coin_backtest.py --coin purr --mode regime
    python multi_coin_backtest.py --coin fartcoin --mode short --capital 5000

    # Dry run on the bot's strategy parameters
    python multi_coin_backtest.py --coin purr --mode long --long-ema 5 --entry 1 --exit 1
"""

import json
import os
import math
import statistics
import argparse
import sys
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
INITIAL_CAPITAL = 10_000.0

# Default strategies per mode
LONG_EMA_DEFAULT = 5
LONG_ENTRY_DEFAULT = 1.0    # %
LONG_EXIT_DEFAULT = 1.0     # %

SHORT_EMA_DEFAULT = 3
SHORT_ENTRY_DEFAULT = 0.0
SHORT_EXIT_DEFAULT = 0.0

REGIME_EMA = 50  # hours (for regime detection)

# Hybrid config (short → long on bull signal)
HYBRID_LONG_EMA = 5
HYBRID_LONG_ENTRY = 1.0
HYBRID_LONG_EXIT = 1.0
HYBRID_SHORT_ENTRY = 0.5
HYBRID_SHORT_EXIT = 0.5
HYBRID_SIGNAL_HOURS = 24
HYBRID_SIGNAL_THRESHOLD = 10

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
def load_prices(coin: str, prefer_longest: bool = False) -> list:
    """Load price data for a coin, trying multiple file paths.

    If prefer_longest is True, picks the file with the most data points
    (e.g. CoinGecko range data for full year analysis).
    """
    candidates = [
        BASE_DIR / f"{coin}_prices_cg_range.json",
        BASE_DIR / f"{coin}_prices_180d.json",
        BASE_DIR / f"{coin}_prices.json",
    ]
    loaded = []
    for path in candidates:
        if path.exists():
            with open(path) as f:
                data = json.load(f)
            loaded.append((len(data), data, path.name))

    if not loaded:
        return []

    if prefer_longest:
        # Return the dataset with the most data points
        loaded.sort(key=lambda x: x[0], reverse=True)
        return loaded[0][1]

    # Default: return the first existing file (CG range > 180d > original)
    return loaded[0][1]

def load_all_coins():
    """Discover available coins from JSON files."""
    coins = set()
    for f in BASE_DIR.glob("*_prices*.json"):
        parts = f.stem.split("_")
        if parts[0] and parts[0] not in ("purr", "fartcoin", "pump", "crv"):
            continue
        coins.add(parts[0])
    return sorted(coins)

def load_all_coins():
    """Discover available coins from JSON files."""
    coins = set()
    for f in BASE_DIR.glob("*_prices*.json"):
        parts = f.stem.split("_")
        if parts[0] and parts[0] not in ("purr", "fartcoin", "pump", "crv"):
            continue
        coins.add(parts[0])
    return sorted(coins)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def compute_ema(prices, period):
    if len(prices) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    ema[period-1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        ema[i] = prices[i] * k + ema[i-1] * (1 - k)
    return ema

def sharpe_ratio(returns, af=8760):
    if len(returns) < 2:
        return 0.0
    std = statistics.stdev(returns)
    return (statistics.mean(returns) / std * math.sqrt(af)) if std else 0.0

def sortino_ratio(returns, af=8760):
    """Downside deviation only."""
    if len(returns) < 2:
        return 0.0
    neg = [r for r in returns if r < 0]
    if not neg:
        return 0.0
    dd = statistics.stdev(neg) if len(neg) > 1 else abs(neg[0])
    return (statistics.mean(returns) / dd * math.sqrt(af)) if dd else 0.0

def max_drawdown(equity):
    peak = equity[0]
    mdd = 0
    dd_start = dd_end = 0
    peak_idx = 0
    for i, v in enumerate(equity):
        if v > peak:
            peak = v
            peak_idx = i
        dd = (peak - v) / peak * 100
        if dd > mdd:
            mdd = dd
            dd_start = peak_idx
            dd_end = i
    return mdd, dd_start, dd_end

def print_separator(char="=", width=72):
    print(char * width)

# ---------------------------------------------------------------------------
# Backtest: Long-Only / Short-Only
# ---------------------------------------------------------------------------
def backtest_single(prices, ema_period: int, entry_pct: float, exit_pct: float,
                    go_long: bool, capital: float) -> dict:
    """
    Backtest a single-direction EMA crossover strategy.

    go_long=True:  buy when price > EMA*(1+entry/100), sell when price < EMA*(1-exit/100)
    go_long=False: short when price < EMA*(1-entry/100), cover when price > EMA*(1+exit/100)
    """
    ema = compute_ema(prices, ema_period)
    n = len(prices)
    if n < 2 or ema_period >= n:
        return None

    equity = [capital] * ema_period
    in_pos = False
    entry_p = None
    entry_idx = None
    trades = wins = 0
    trade_log = []

    for i in range(ema_period, n):
        p, e = prices[i], ema[i]
        if e is None:
            equity.append(equity[-1])
            continue

        if not in_pos:
            # Entry signal
            if go_long and p > e * (1 + entry_pct / 100):
                in_pos = True
                entry_p = p
                entry_idx = i
                trades += 1
            elif not go_long and p < e * (1 - entry_pct / 100):
                in_pos = True
                entry_p = p
                entry_idx = i
                trades += 1
            equity.append(equity[-1])

        else:
            # Exit signal
            exit_signal = False
            if go_long and p < e * (1 - exit_pct / 100):
                exit_signal = True
            elif not go_long and p > e * (1 + exit_pct / 100):
                exit_signal = True

            if exit_signal:
                ret = (p / entry_p - 1) if go_long else (entry_p / p - 1)
                new_cap = equity[entry_idx] * (1 + ret)
                equity.append(new_cap)
                if ret > 0:
                    wins += 1
                trade_log.append({
                    "entry_idx": entry_idx, "exit_idx": i,
                    "entry_px": entry_p, "exit_px": p,
                    "return_pct": ret * 100,
                    "win": ret > 0,
                    "type": "LONG" if go_long else "SHORT",
                })
                in_pos = False
                entry_p = None
            else:
                equity.append(equity[-1])

    # Close any open position at end
    if in_pos:
        p = prices[-1]
        ret = (p / entry_p - 1) if go_long else (entry_p / p - 1)
        final = equity[entry_idx] * (1 + ret)
        equity[-1] = final
        if ret > 0:
            wins += 1
        trade_log.append({
            "entry_idx": entry_idx, "exit_idx": n - 1,
            "entry_px": entry_p, "exit_px": p,
            "return_pct": ret * 100,
            "win": ret > 0,
            "type": "LONG" if go_long else "SHORT",
        })

    final_capital = equity[-1]
    total_ret = (final_capital / capital - 1) * 100

    # Period returns for Sharpe/Sortino (skip zero-equity periods)
    rets = []
    for i in range(1, len(equity)):
        if equity[i-1] > 0:
            rets.append(equity[i] / equity[i-1] - 1)

    sh = sharpe_ratio(rets)
    so = sortino_ratio(rets)
    mdd, dd_s, dd_e = max_drawdown(equity)
    wr = (wins / trades * 100) if trades else 0

    # CAGR
    years = n / 8760
    cagr = ((final_capital / capital) ** (1 / years) - 1) * 100 if years > 0 else 0

    return {
        "total_return_pct": total_ret,
        "cagr_pct": cagr,
        "sharpe": sh,
        "sortino": so,
        "max_drawdown_pct": mdd,
        "dd_start": dd_s,
        "dd_end": dd_e,
        "trades": trades,
        "win_rate": wr,
        "final_capital": final_capital,
        "equity_curve": equity,
        "trade_log": trade_log,
    }

# ---------------------------------------------------------------------------
# Backtest: Regime-Switching
# ---------------------------------------------------------------------------
def backtest_regime(prices, regime_ema_period: int,
                    long_ema: int, long_entry: float, long_exit: float,
                    short_ema: int, short_entry: float, short_exit: float,
                    capital: float) -> dict:
    """
    Regime-switching backtest.

    - Uses `regime_ema_period` EMA as the trend filter.
    - When price > regime EMA → BULL regime → use LONG params
    - When price < regime EMA → BEAR regime → use SHORT params
    """
    n = len(prices)
    if n < max(regime_ema_period, long_ema, short_ema):
        return None

    regime_ema = compute_ema(prices, regime_ema_period)
    long_e = compute_ema(prices, long_ema)
    short_e = compute_ema(prices, short_ema)

    start_idx = max(regime_ema_period, long_ema, short_ema)

    equity = [capital] * start_idx
    in_pos = False
    entry_p = None
    entry_idx = None
    pos_type = None  # "LONG" or "SHORT"
    trades = wins = 0
    trade_log = []
    regime_log = []  # track what regime we were in each bar

    for i in range(start_idx, n):
        p = prices[i]
        r_e = regime_ema[i]
        l_e = long_e[i]
        s_e = short_e[i]

        # Determine regime
        if r_e is not None:
            bull_regime = p > r_e
        else:
            bull_regime = True  # default to bull if no regime EMA yet
        regime_log.append("BULL" if bull_regime else "BEAR")

        if not in_pos:
            equity.append(equity[-1])

            if bull_regime and l_e is not None:
                # BULL → look for long entry
                if p > l_e * (1 + long_entry / 100):
                    in_pos = True
                    entry_p = p
                    entry_idx = i
                    pos_type = "LONG"
                    trades += 1
            elif not bull_regime and s_e is not None:
                # BEAR → look for short entry
                if p < s_e * (1 - short_entry / 100):
                    in_pos = True
                    entry_p = p
                    entry_idx = i
                    pos_type = "SHORT"
                    trades += 1
        else:
            # In position — check exit
            exit_signal = False
            if pos_type == "LONG":
                # Exit long if price drops below long EMA
                if l_e is not None and p < l_e * (1 - long_exit / 100):
                    exit_signal = True
            elif pos_type == "SHORT":
                # Exit short if price rises above short EMA
                if s_e is not None and p > s_e * (1 + short_exit / 100):
                    exit_signal = True

            if exit_signal:
                ret = (p / entry_p - 1) if pos_type == "LONG" else (entry_p / p - 1)
                new_cap = equity[entry_idx] * (1 + ret)
                equity.append(new_cap)
                if ret > 0:
                    wins += 1
                trade_log.append({
                    "entry_idx": entry_idx, "exit_idx": i,
                    "entry_px": entry_p, "exit_px": p,
                    "return_pct": ret * 100,
                    "win": ret > 0,
                    "type": pos_type,
                })
                in_pos = False
                pos_type = None
            else:
                equity.append(equity[-1])

    # Close any open position
    if in_pos:
        p = prices[-1]
        ret = (p / entry_p - 1) if pos_type == "LONG" else (entry_p / p - 1)
        final = equity[entry_idx] * (1 + ret)
        equity[-1] = final
        if ret > 0:
            wins += 1
        trade_log.append({
            "entry_idx": entry_idx, "exit_idx": n - 1,
            "entry_px": entry_p, "exit_px": p,
            "return_pct": ret * 100,
            "win": ret > 0,
            "type": pos_type,
        })

    final_capital = equity[-1]
    total_ret = (final_capital / capital - 1) * 100

    rets = []
    for j in range(1, len(equity)):
        if equity[j-1] > 0:
            rets.append(equity[j] / equity[j-1] - 1)

    sh = sharpe_ratio(rets)
    so = sortino_ratio(rets)
    mdd, dd_s, dd_e = max_drawdown(equity)
    wr = (wins / trades * 100) if trades else 0
    years = n / 8760
    cagr = ((final_capital / capital) ** (1 / years) - 1) * 100 if years > 0 else 0

    # Count how many bars were spent in each regime
    bull_bars = regime_log.count("BULL")
    bear_bars = regime_log.count("BEAR")

    return {
        "total_return_pct": total_ret,
        "cagr_pct": cagr,
        "sharpe": sh,
        "sortino": so,
        "max_drawdown_pct": mdd,
        "dd_start": dd_s,
        "dd_end": dd_e,
        "trades": trades,
        "win_rate": wr,
        "final_capital": final_capital,
        "equity_curve": equity,
        "trade_log": trade_log,
        "bull_bars": bull_bars,
        "bear_bars": bear_bars,
    }

# ---------------------------------------------------------------------------
# Hybrid backtest (Short -> Long on bull signal)
# ---------------------------------------------------------------------------
def backtest_hybrid(prices, signal_mask, capital: float) -> dict:
    n = len(prices)
    ema_s = compute_ema(prices, SHORT_EMA_DEFAULT)
    ema_l = compute_ema(prices, HYBRID_LONG_EMA)
    start_idx = max(SHORT_EMA_DEFAULT, HYBRID_LONG_EMA)
    equity = [capital] * start_idx
    entry_p = None; mode = 'short'; trades = wins = 0
    trade_log = []; cap = capital
    for i in range(start_idx, n):
        p = prices[i]
        mode = 'long' if (i < len(signal_mask) and signal_mask[i]) else 'short'
        if mode == 'short':
            e = ema_s[i]
            if e is None: equity.append(equity[-1]); continue
            if entry_p is not None:
                if p > e * (1 + HYBRID_SHORT_EXIT / 100):
                    ret = entry_p / p - 1; cap = cap * (1 + ret)
                    if ret > 0: wins += 1; trades += 1
                    trade_log.append({'return_pct': ret * 100, 'win': ret > 0, 'type': 'SHORT'})
                    entry_p = None
            elif p < e * (1 - HYBRID_SHORT_ENTRY / 100): entry_p = p
        else:
            e = ema_l[i]
            if e is None: equity.append(equity[-1]); continue
            if entry_p is not None:
                if p < e * (1 - HYBRID_LONG_EXIT / 100):
                    ret = p / entry_p - 1; cap = cap * (1 + ret)
                    if ret > 0: wins += 1; trades += 1
                    trade_log.append({'return_pct': ret * 100, 'win': ret > 0, 'type': 'LONG'})
                    entry_p = None
            elif p > e * (1 + HYBRID_LONG_ENTRY / 100): entry_p = p
        if entry_p is not None:
            ur = (entry_p / p - 1) if mode == 'short' else (p / entry_p - 1)
            equity.append(cap * (1 + ur))
        else: equity.append(cap)
    if entry_p is not None:
        p_final = prices[-1]
        ret = (entry_p / p_final - 1) if mode == 'short' else (p_final / entry_p - 1)
        cap = cap * (1 + ret)
        if ret > 0: wins += 1; trades += 1
        trade_log.append({'return_pct': ret * 100, 'win': ret > 0, 'type': mode.upper()})
        equity[-1] = cap
    total_ret = (cap / capital - 1) * 100
    rets = [equity[j]/equity[j-1]-1 for j in range(1, len(equity)) if equity[j-1] > 0]
    sh = sharpe_ratio(rets); so = sortino_ratio(rets)
    mdd, dd_s, dd_e = max_drawdown(equity)
    wr = (wins / trades * 100) if trades else 0
    years = n / 8760
    cagr = ((cap / capital) ** (1 / years) - 1) * 100 if years > 0 else 0
    return {
        'total_return_pct': total_ret, 'cagr_pct': cagr,
        'sharpe': sh, 'sortino': so, 'max_drawdown_pct': mdd,
        'dd_start': dd_s, 'dd_end': dd_e, 'trades': trades,
        'win_rate': wr, 'final_capital': cap, 'equity_curve': equity,
        'trade_log': trade_log,
    }



# ---------------------------------------------------------------------------
# Grid search over multiple coins
# ---------------------------------------------------------------------------
def grid_search_single(prices, go_long: bool, capital: float) -> list:
    """Search EMA 2-48, entry/exit thresholds 0%-5%."""
    results = []
    for ep in range(2, 49):
        for ent in range(0, 6):
            for ext in range(0, 6):
                r = backtest_single(prices, ep, ent, ext, go_long, capital)
                if r:
                    results.append({
                        "ema": ep,
                        "entry": ent,
                        "exit": ext,
                        **r,
                    })
    return results

def print_top_strategies(results, title, n=15):
    print(f"\n  {title}")
    print(f"  {'#' * 65}")
    print(f"  {'Rank':<5} {'EMA':<6} {'Entry':<8} {'Exit':<8} {'Sharpe':<8} {'Sortino':<9} {'Return':<10} {'CAGR':<9} {'MaxDD':<8} {'Trades':<7} {'Win%':<7}")
    print(f"  {'-' * 72}")
    by_sharpe = sorted(results, key=lambda x: x["sharpe"], reverse=True)[:n]
    for i, r in enumerate(by_sharpe, 1):
        print(f"  {i:<5} {r['ema']:<5}h {r['entry']:<7}% {r['exit']:<7}% "
              f"{r['sharpe']:<8.2f} {r['sortino']:<9.2f} {r['total_return_pct']:<+9.1f}% "
              f"{r['cagr_pct']:<8.1f}% {r['max_drawdown_pct']:<7.1f}% "
              f"{r['trades']:<7} {r['win_rate']:<5.1f}%")
    return by_sharpe

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def print_coin_header(name, n_points, first_date, last_date):
    print()
    print_separator()
    print(f"  {name}")
    print(f"  {n_points} hourly data points ({first_date} → {last_date})")
    print_separator()

def guess_date_range(prices):
    """Rough date range based on data point count."""
    n = len(prices)
    if n > 8000:
        return "~1 year", f"{n} pts"
    hours = n
    days = hours / 24
    if days > 180:
        return f"~{days/30:.0f} months", f"{n} pts"
    return f"~{days:.0f} days", f"{n} pts"

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Multi-Coin EMA Strategy Backtester"
    )
    parser.add_argument("--coin", type=str, default=None,
                        help="Coin to backtest (e.g. purr, fartcoin, pump). Default: all")
    parser.add_argument("--mode", type=str, choices=["long", "short", "regime", "hybrid", "all"],
                        default="all", help="Strategy mode")
    parser.add_argument("--capital", type=float, default=INITIAL_CAPITAL,
                        help="Starting capital")
    parser.add_argument("--regime-ema", type=int, default=REGIME_EMA,
                        help="Regime detection EMA period (hours)")
    parser.add_argument("--long-ema", type=int, default=LONG_EMA_DEFAULT,
                        help="Long EMA period")
    parser.add_argument("--entry", type=float, default=None,
                        help="Entry threshold % (overrides defaults)")
    parser.add_argument("--exit", type=float, default=None,
                        help="Exit threshold % (overrides defaults)")
    parser.add_argument("--short-ema", type=int, default=SHORT_EMA_DEFAULT,
                        help="Short EMA period")
    parser.add_argument("--grid", action="store_true",
                        help="Run grid search (find optimal params)")
    parser.add_argument("--no-detail", action="store_true",
                        help="Skip detailed per-coin output, just summary")
    args = parser.parse_args()

    # Determine which coins
    if args.coin:
        coins = [args.coin]
    else:
        coins = load_all_coins()

    if not coins:
        print("No coin data found. Run fetch_cg_range.py first.")
        sys.exit(1)

    # Determine modes
    modes = []
    if args.mode == "all":
        modes = ["long", "short", "regime", "hybrid"]
    else:
        modes = [args.mode]

    # Entry/exit thresholds
    entry_pct = args.entry if args.entry is not None else LONG_ENTRY_DEFAULT
    exit_pct = args.exit if args.exit is not None else LONG_EXIT_DEFAULT

    # For hybrid mode, pre-compute the signal mask from all loaded coins
    hybrid_prices = {}
    for coin in ([args.coin] if args.coin else (coins if not args.coin else [])):
        hybrid_prices[coin] = load_prices(coin)
    hybrid_ema50 = {c: compute_ema(p, REGIME_EMA) for c, p in hybrid_prices.items() if len(p) > 50}
    hybrid_n_total = max(len(p) for p in hybrid_prices.values()) if hybrid_prices else 0
    hybrid_mask = [False] * hybrid_n_total
    if hybrid_n_total > 24:
        coins_above_list = []
        for i in range(hybrid_n_total):
            ca = 0
            for c, p in hybrid_prices.items():
                e = hybrid_ema50.get(c)
                if e and i < len(e) and e[i] is not None and i < len(p):
                    if p[i] > e[i]: ca += 1
            coins_above_list.append(ca)
        for i in range(HYBRID_SIGNAL_HOURS, hybrid_n_total):
            active = True
            for li in range(i - HYBRID_SIGNAL_HOURS, i):
                if coins_above_list[li] < HYBRID_SIGNAL_THRESHOLD:
                    active = False; break
            if active: hybrid_mask[i] = True

    # --------------------------------------------------------------------
    # Per-coin analysis
    # --------------------------------------------------------------------
    coin_results = {}

    for coin in coins:
        prices = load_prices(coin)
        if len(prices) < 50:
            print(f"\n  SKIP {coin}: only {len(prices)} data points")
            continue

        name = coin.capitalize()
        date_range, n_label = guess_date_range(prices)
        print_coin_header(name, len(prices), "N/A", "N/A")
        coin_results[coin] = {"prices": prices, "modes": {}}

        if not args.no_detail:
            # Show basic stats
            first_p, last_p = prices[0], prices[-1]
            high = max(prices)
            low = min(prices)
            change = (last_p / first_p - 1) * 100
            print(f"  Price: ${first_p:.4f} → ${last_p:.4f} ({change:+.1f}%) | "
                  f"High: ${high:.4f} | Low: ${low:.4f}")

        for mode in modes:
            if not args.no_detail:
                print(f"\n  ─── {mode.upper()} ───")

            if args.grid:
                # Grid search
                go_long = mode == "long"
                results = grid_search_single(prices, go_long, args.capital)
                if results:
                    print_top_strategies(results, f"{name} {mode.upper()} — Grid Search")
                    coin_results[coin]["modes"][mode] = {"grid": results}
                else:
                    print("  No valid strategies found")
                continue

            # Single strategy run
            if mode == "long":
                r = backtest_single(prices, args.long_ema, entry_pct, exit_pct,
                                    go_long=True, capital=args.capital)
                label = f"{args.long_ema}h EMA {entry_pct:.0f}%/{exit_pct:.0f}% LONG"
            elif mode == "short":
                r = backtest_single(prices, args.short_ema, SHORT_ENTRY_DEFAULT, SHORT_EXIT_DEFAULT,
                                    go_long=False, capital=args.capital)
                label = f"{args.short_ema}h EMA 0%/0% SHORT"
            elif mode == "regime":
                r = backtest_regime(prices, args.regime_ema,
                                    args.long_ema, entry_pct, exit_pct,
                                    args.short_ema, SHORT_ENTRY_DEFAULT, SHORT_EXIT_DEFAULT,
                                    args.capital)
                label = (f"REGIME (50h EMA) | Bull: {args.long_ema}h {entry_pct:.0f}%/{exit_pct:.0f}% LONG "
                         f"| Bear: {args.short_ema}h 0%/0% SHORT")
            elif mode == "hybrid":
                coin_mask = hybrid_mask[:len(prices)] if len(prices) <= len(hybrid_mask) else \
                    hybrid_mask + [False] * (len(prices) - len(hybrid_mask))
                r = backtest_hybrid(prices, coin_mask, args.capital)
                label = (f"HYBRID | Short 3h 0.5%/0.5% → Long 5h 1%/1% "
                         f"on {HYBRID_SIGNAL_HOURS}h/{HYBRID_SIGNAL_THRESHOLD} coin signal")

            if r is None:
                print(f"  {mode.upper()}: Insufficient data")
                continue

            coin_results[coin]["modes"][mode] = r

            if not args.no_detail:
                print(f"  Strategy: {label}")
                print(f"  Return:   {r['total_return_pct']:+8.1f}%")
                print(f"  CAGR:     {r['cagr_pct']:+8.1f}%")
                print(f"  Sharpe:   {r['sharpe']:<8.2f}")
                print(f"  Sortino:  {r['sortino']:<8.2f}")
                print(f"  Max DD:   {r['max_drawdown_pct']:<7.1f}%")
                print(f"  Trades:   {r['trades']:<7}")
                print(f"  Win Rate: {r['win_rate']:<5.1f}%")
                print(f"  Final:    ${r['final_capital']:,.2f}")

                if mode == "regime" and "bull_bars" in r:
                    total = r["bull_bars"] + r["bear_bars"]
                    bull_pct = r["bull_bars"] / total * 100
                    bear_pct = r["bear_bars"] / total * 100
                    print(f"  Regime:   {bull_pct:.0f}% bull | {bear_pct:.0f}% bear")

                # Trade breakdown
                trades = r.get("trade_log", [])
                if trades:
                    wins = [t for t in trades if t["win"]]
                    losses = [t for t in trades if not t["win"]]
                    avg_win = statistics.mean([t["return_pct"] for t in wins]) if wins else 0
                    avg_loss = statistics.mean([t["return_pct"] for t in losses]) if losses else 0
                    max_win = max([t["return_pct"] for t in trades], default=0)
                    max_loss = min([t["return_pct"] for t in trades], default=0)

                    # Long vs short breakdown (regime mode)
                    long_trades = [t for t in trades if t["type"] == "LONG"]
                    short_trades = [t for t in trades if t["type"] == "SHORT"]
                    print(f"  Avg win:  {avg_win:+6.2f}% | Avg loss: {avg_loss:+6.2f}% | "
                          f"Best: {max_win:+6.2f}% | Worst: {max_loss:+6.2f}%")
                    if long_trades and short_trades:
                        lr = sum(t["return_pct"] for t in long_trades)
                        sr = sum(t["return_pct"] for t in short_trades)
                        print(f"  Long trades: {len(long_trades)} (total: {lr:+6.1f}%) | "
                              f"Short trades: {len(short_trades)} (total: {sr:+6.1f}%)")

        print()

    # --------------------------------------------------------------------
    # Summary comparison table
    # --------------------------------------------------------------------
    if len(coin_results) > 1:
        print_separator("=")
        print("  SUMMARY — All Coins Comparison")
        print_separator("=")

        # Table header
        headers = ["Coin", "Mode", "Strategy", "Return", "CAGR", "Sharpe", "Sortino", "MaxDD", "Trades", "Win%"]
        col_widths = [12, 7, 30, 9, 8, 8, 9, 8, 7, 6]
        header_line = "  " + "".join(h.ljust(w) for h, w in zip(headers, col_widths))
        print(f"\n{header_line}")
        print("  " + "-" * sum(col_widths))

        for coin, data in coin_results.items():
            for mode, r in data["modes"].items():
                if isinstance(r, dict) and "total_return_pct" in r:
                    strat = (f"{args.long_ema}h E{entry_pct:.0f}X{exit_pct:.0f} L" if mode == "long"
                             else f"{args.short_ema}h E0 X0 S" if mode == "short"
                             else f"Regime({args.regime_ema}h)")
                    vals = [
                        coin.capitalize(),
                        mode.upper(),
                        strat,
                        f"{r['total_return_pct']:+7.1f}%",
                        f"{r['cagr_pct']:+6.1f}%",
                        f"{r['sharpe']:.2f}",
                        f"{r['sortino']:.2f}",
                        f"{r['max_drawdown_pct']:.1f}%",
                        str(r['trades']),
                        f"{r['win_rate']:.0f}%",
                    ]
                    print("  " + "".join(v.ljust(w) for v, w in zip(vals, col_widths)))

        print()

    # --------------------------------------------------------------------
    # Verdict
    # --------------------------------------------------------------------
    print_separator("=")
    print("  VERDICT — Which strategies work for each coin?")
    print_separator("=")

    for coin, data in coin_results.items():
        print(f"\n  {coin.capitalize()}:")
        for mode, r in data["modes"].items():
            if isinstance(r, dict) and "sharpe" in r:
                sh = r["sharpe"]
                ret = r["total_return_pct"]
                dd = r["max_drawdown_pct"]
                score = "✅ STRONG" if sh > 1.5 and ret > 20 else "👍 DECENT" if sh > 0.8 else "⚠️ MARGINAL" if sh > 0 else "❌ POOR"
                print(f"    {mode.upper():<10} Sharpe={sh:.2f}  Return={ret:+6.1f}%  DD={dd:.1f}%  → {score}")

    print_separator("=")
    print("  DONE")
    print_separator("=")


if __name__ == "__main__":
    main()
