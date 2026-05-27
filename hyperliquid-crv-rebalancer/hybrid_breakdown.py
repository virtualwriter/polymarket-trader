#!/usr/bin/env python3
"""
Hybrid Strategy Backtest — Short with Adaptive Switch to Long
==============================================================
Base state: 100% allocated to Short (3h EMA, 0.5%/0.5% entry/exit).
On signal (>10 coins above 50h EMA for 24 consecutive hours):
  → switch to Long (5h EMA, 1%/1% entry/exit), short sits in cash.
Signal clears when threshold falls below 10/12 at any point in the
  prior 24-hour window.

Usage:
    python hybrid_breakdown.py                          # all coins, summary table
    python hybrid_breakdown.py --coin fartcoin           # single coin detail
    python hybrid_breakdown.py --csv                     # export CSV
"""

import json
import math
import statistics
import calendar
import argparse
from pathlib import Path
from datetime import datetime, timezone
from collections import OrderedDict

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
INITIAL_CAPITAL = 10_000.0
TAKER_FEE = 0.045  # 4.5 bps — Hyperliquid standard taker (observed live).
# Historical reference: backtests run before 2026-05-27 assumed 3.5 bps; flip
# back with --fee 0.035 for apples-to-apples comparisons against older logs.

# Short leg (normal mode)
SHORT_EMA = 3
SHORT_ENTRY = 0.5   # %
SHORT_EXIT = 0.5    # %

# Long leg (deployed on signal)
LONG_EMA = 5
LONG_ENTRY = 1.0    # %
LONG_EXIT = 1.0     # %

# Signal — bull market detection
SIGNAL_LOOKBACK_HOURS = 24
SIGNAL_THRESHOLD = 10  # N out of 12 coins above 50h EMA
REGIME_EMA = 50        # hours

START_DATE = datetime(2025, 6, 1, tzinfo=timezone.utc)

COINS = OrderedDict([
    ("purr",     {"name": "PURR"}),
    ("fartcoin", {"name": "FARTCOIN"}),
])


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------
def discover_coins():
    discovered = OrderedDict()
    for k, v in COINS.items():
        if (BASE_DIR / f"{k}_prices_cg_range.json").exists():
            discovered[k] = v
    for path in sorted(BASE_DIR.glob("*_prices_cg_range.json")):
        if path.name.endswith("_raw.json"):
            continue
        key = path.stem.replace("_prices_cg_range", "")
        if key not in discovered:
            discovered[key] = {"name": key.upper()}
    return discovered


def compute_ema(prices, period):
    if len(prices) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    ema[period - 1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        ema[i] = prices[i] * k + ema[i - 1] * (1 - k)
    return ema


def load_data(coin):
    raw_path = BASE_DIR / f"{coin}_prices_cg_range_raw.json"
    prices_path = BASE_DIR / f"{coin}_prices_cg_range.json"
    if not raw_path.exists() or not prices_path.exists():
        return None, None
    raw = json.loads(raw_path.read_text())
    prices = json.loads(prices_path.read_text())
    n = min(len(prices), len(raw))
    timestamps = [datetime.fromtimestamp(raw[i][0] / 1000, tz=timezone.utc) for i in range(n)]
    prices = prices[:n]
    start_idx = next((i for i, dt in enumerate(timestamps) if dt >= START_DATE), 0)
    prices = prices[start_idx:]
    timestamps = timestamps[start_idx:]
    return prices, timestamps


# ---------------------------------------------------------------------------
# Signal builder (cross-coin EMA condition)
# ---------------------------------------------------------------------------
def build_signal_mask(coins_data, n_total):
    """
    Build a signal mask array of length n_total.
    signal[i] = True when >SIGNAL_THRESHOLD coins have price > 50h EMA for
    the entire preceding SIGNAL_LOOKBACK_HOURS window.
    """
    coins_above = []
    for i in range(n_total):
        ca = 0
        for coin, prices, ema50 in coins_data:
            if i < len(ema50) and ema50[i] is not None and i < len(prices):
                if prices[i] > ema50[i]:
                    ca += 1
        coins_above.append(ca)

    mask = [False] * n_total
    for i in range(SIGNAL_LOOKBACK_HOURS, n_total):
        active = True
        for li in range(i - SIGNAL_LOOKBACK_HOURS, i):
            if coins_above[li] < SIGNAL_THRESHOLD:
                active = False
                break
        if active:
            mask[i] = True
    return mask


# ---------------------------------------------------------------------------
# Hybrid strategy simulator
# ---------------------------------------------------------------------------
def backtest_hybrid(prices, signal_mask, start_idx):
    """
    Simulate the hybrid strategy: short normally, switch to long when signal fires.

    Returns dict with full-year metrics plus monthly breakdown.
    """
    n = len(prices)
    ema_s = compute_ema(prices, SHORT_EMA)
    ema_l = compute_ema(prices, LONG_EMA)

    capital = INITIAL_CAPITAL
    entry_p = None
    mode = 'short'
    trades = 0
    wins = 0
    hourly_equity = []

    for i in range(start_idx, n):
        p = prices[i]

        if signal_mask[i]:
            mode = 'long'
        else:
            mode = 'short'

        if mode == 'short':
            e = ema_s[i]
            if e is None:
                hourly_equity.append(capital)
                continue
            if entry_p is not None:
                if p > e * (1 + SHORT_EXIT / 100):
                    gross = entry_p / p - 1
                    net = (1 + gross) * (1 - TAKER_FEE / 100) / (1 + TAKER_FEE / 100) - 1
                    capital = capital * (1 + net)
                    if net > 0:
                        wins += 1
                    trades += 1
                    entry_p = None
            elif p < e * (1 - SHORT_ENTRY / 100):
                entry_p = p
        else:
            e = ema_l[i]
            if e is None:
                hourly_equity.append(capital)
                continue
            if entry_p is not None:
                if p < e * (1 - LONG_EXIT / 100):
                    gross = p / entry_p - 1
                    net = (1 + gross) * (1 - TAKER_FEE / 100) / (1 + TAKER_FEE / 100) - 1
                    capital = capital * (1 + net)
                    if net > 0:
                        wins += 1
                    trades += 1
                    entry_p = None
            elif p > e * (1 + LONG_ENTRY / 100):
                entry_p = p

        hourly_equity.append(capital)

    if entry_p is not None:
        p_final = prices[-1]
        if mode == 'short':
            gross = entry_p / p_final - 1
        else:
            gross = p_final / entry_p - 1
        net = (1 + gross) * (1 - TAKER_FEE / 100) / (1 + TAKER_FEE / 100) - 1
        capital = capital * (1 + net)
        if net > 0:
            wins += 1
        trades += 1
        hourly_equity[-1] = capital

    return {
        "final_capital": capital,
        "total_return_pct": (capital / INITIAL_CAPITAL - 1) * 100,
        "trades": trades,
        "wins": wins,
        "equity": hourly_equity,
    }


def backtest_short_only(prices, start_idx):
    """Pure short backtest for comparison."""
    ema = compute_ema(prices, SHORT_EMA)
    capital = INITIAL_CAPITAL
    entry_p = None
    trades = 0
    wins = 0

    for i in range(start_idx, len(prices)):
        p, e = prices[i], ema[i]
        if e is None:
            continue
        if entry_p is None:
            if p < e * (1 - SHORT_ENTRY / 100):
                entry_p = p
        else:
            if p > e * (1 + SHORT_EXIT / 100):
                gross = entry_p / p - 1
                net = (1 + gross) * (1 - TAKER_FEE / 100) / (1 + TAKER_FEE / 100) - 1
                capital = capital * (1 + net)
                if net > 0:
                    wins += 1
                trades += 1
                entry_p = None

    if entry_p is not None:
        gross = entry_p / prices[-1] - 1
        net = (1 + gross) * (1 - TAKER_FEE / 100) / (1 + TAKER_FEE / 100) - 1
        capital = capital * (1 + net)
        if net > 0:
            wins += 1
        trades += 1

    return (capital / INITIAL_CAPITAL - 1) * 100, trades, wins


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def compute_metrics(equity):
    ret = (equity[-1] / equity[0] - 1) * 100
    hrs = []
    for i in range(1, len(equity)):
        if equity[i - 1] > 0 and equity[i] > 0:
            r = equity[i] / equity[i - 1] - 1
            if abs(r) < 0.5:
                hrs.append(r)
    if len(hrs) < 2:
        return ret, 0, 0, 0

    mean_r = statistics.mean(hrs)
    std_r = max(statistics.stdev(hrs), 1e-10)
    sh = mean_r / std_r * math.sqrt(8760)

    neg_r = [r for r in hrs if r < 0]
    dd = statistics.stdev(neg_r) if len(neg_r) > 1 else abs(neg_r[0]) if neg_r else 1e-10
    so = mean_r / dd * math.sqrt(8760)

    peak = equity[0]
    mdd = 0
    for v in equity:
        if v > peak:
            peak = v
        mdd = max(mdd, (peak - v) / peak * 100)

    return ret, sh, so, mdd


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Hybrid strategy backtest")
    parser.add_argument("--coin", type=str, default=None, help="Single coin")
    parser.add_argument("--csv", action="store_true", help="Export CSV")
    parser.add_argument("--csv-file", type=str, default="hybrid_breakdown.csv",
                        help="CSV output filename")
    parser.add_argument("--fee", type=float, default=None,
                        help="Override taker fee in percent (e.g. 0.045 = 4.5 bps)")
    args = parser.parse_args()

    global TAKER_FEE
    if args.fee is not None:
        TAKER_FEE = args.fee

    all_coins = discover_coins()
    coin_list = [args.coin] if args.coin else list(all_coins.keys())

    # 1. Load all coin data and build signal mask
    coins_data = []
    for coin in coin_list:
        prices, ts = load_data(coin)
        if not prices:
            continue
        ema50 = compute_ema(prices, REGIME_EMA)
        coins_data.append((coin, prices, ema50, ts))

    n_total = max(len(c[1]) for c in coins_data)
    start_idx = max(SHORT_EMA, LONG_EMA, REGIME_EMA)

    signal_mask = build_signal_mask(
        [(c[0], c[1], c[2]) for c in coins_data], n_total
    )

    sig_pct = sum(signal_mask) / n_total * 100
    print(f"Hybrid Strategy: Short 3h/0.5% → Long 5h/1% on signal")
    print(f"Signal: {SIGNAL_LOOKBACK_HOURS}h/{SIGNAL_THRESHOLD} coins above 50h EMA")
    print(f"Signal fires {sig_pct:.1f}% of hours ({sum(signal_mask)}/{n_total})")
    print(f"Taker fee: {TAKER_FEE}%")
    print()

    # 2. Run per-coin
    all_rows = []

    print(f"{'Coin':>10}  {'Short':>8}  {'Hybrid':>8}  {'Diff':>8}  "
          f"{'Sharpe':>6}  {'Sortino':>6}  {'MaxDD':>6}  {'Trades':>6}  "
          f"{'Win%':>5}")
    print('-' * 78)

    total_s = 0.0
    total_h = 0.0
    total_sh = 0.0
    total_so = 0.0
    total_mdd = 0.0
    neg_coins = 0

    for coin, prices, ema50, ts in coins_data:
        n = min(len(prices), n_total)
        coin_mask = signal_mask[:n]
        c_start = min(start_idx, n - 1) if n > start_idx else 0

        ret_s, trades_s, wins_s = backtest_short_only(prices, c_start)
        result = backtest_hybrid(prices, coin_mask, c_start)
        ret_h = result["total_return_pct"]
        ret_h_metrics, sh, so, mdd = compute_metrics(result["equity"])

        win_pct = result["wins"] / result["trades"] * 100 if result["trades"] else 0

        coin_label = all_coins.get(coin, {}).get("name", coin.upper())
        diff = ret_h - ret_s
        total_s += ret_s
        total_h += ret_h
        total_sh += sh
        total_so += so
        total_mdd += mdd
        if ret_h < 0:
            neg_coins += 1

        print(f"{coin_label:>10}  {ret_s:>+7.1f}%  {ret_h:>+7.1f}%  {diff:>+7.1f}%  "
              f"{sh:>5.2f}  {so:>5.2f}  {mdd:>5.1f}%  {result['trades']:>5}  "
              f"{win_pct:>4.0f}%")

        all_rows.append({
            "coin": coin_label,
            "short_ret": round(ret_s, 1),
            "hybrid_ret": round(ret_h, 1),
            "diff": round(diff, 1),
            "sharpe": round(sh, 2),
            "sortino": round(so, 2),
            "max_dd": round(mdd, 1),
            "trades": result["trades"],
            "win_rate": round(win_pct, 0),
        })

    nc = len(coins_data)
    if nc > 0:
        print('-' * 78)
        print(f"{'AVERAGE':>10}  {total_s/nc:>+7.1f}%  {total_h/nc:>+7.1f}%  "
              f"{(total_h-total_s)/nc:>+7.1f}%  {total_sh/nc:>5.2f}  "
              f"{total_so/nc:>5.2f}  {total_mdd/nc:>5.1f}%  "
              f"  {neg_coins}/{nc} neg")

    # 3. CSV export
    if args.csv and all_rows:
        csv_path = Path(args.csv_file)
        fieldnames = ["coin", "short_ret", "hybrid_ret", "diff",
                       "sharpe", "sortino", "max_dd", "trades", "win_rate"]
        with open(csv_path, "w") as f:
            f.write(",".join(fieldnames) + "\n")
            for row in all_rows:
                f.write(",".join(str(row[k]) for k in fieldnames) + "\n")
        print(f"\n  CSV exported: {csv_path}")


if __name__ == "__main__":
    main()
