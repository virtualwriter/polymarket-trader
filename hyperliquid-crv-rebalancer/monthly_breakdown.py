#!/usr/bin/env python3
"""
Monthly Strategy Breakdown — Long, Short, Regime & Hybrid per Coin
===================================================================
Shows month-by-month returns for each strategy per coin,
with months as rows and strategies as columns.

Strategies:
  - Buy & Hold
  - Long (5h EMA 1%/1%)
  - Short (3h EMA 0.5%/0.5%)
  - Regime-switching (50h EMA filter)
  - Hybrid (Short 3h 0.5% normal → Long 5h 1% on 24h/10 coin signal)

Usage:
    python monthly_breakdown.py                    # All coins
    python monthly_breakdown.py --coin purr         # Single coin
    python monthly_breakdown.py --csv               # Export combined CSV
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

LONG_EMA = 5
LONG_ENTRY = 1.0       # %
LONG_EXIT = 1.0        # %

SHORT_EMA = 3
SHORT_ENTRY = 0.5       # %
SHORT_EXIT = 0.5        # %

REGIME_EMA = 50

# Hybrid config
HYBRID_LONG_EMA = 5
HYBRID_LONG_ENTRY = 1.0
HYBRID_LONG_EXIT = 1.0
HYBRID_SIGNAL_HOURS = 24
HYBRID_SIGNAL_THRESHOLD = 10
HYBRID_TAKER_FEE = 0.035  # 3.5 bps

COINS = OrderedDict([
    ("purr",     {"name": "PURR"}),
    ("fartcoin", {"name": "FARTCOIN"}),
])


def discover_coins():
    """Find all coins with CG range data files and merge with hardcoded COINS."""
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def compute_ema(prices, period):
    if len(prices) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    ema[period - 1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        ema[i] = prices[i] * k + ema[i - 1] * (1 - k)
    return ema


START_DATE = datetime(2025, 6, 1, tzinfo=timezone.utc)


def load_data(coin):
    raw_path = BASE_DIR / f"{coin}_prices_cg_range_raw.json"
    prices_path = BASE_DIR / f"{coin}_prices_cg_range.json"
    if not raw_path.exists() or not prices_path.exists():
        prices_path = BASE_DIR / f"{coin}_prices_180d.json"
        if not prices_path.exists():
            return None, None
        prices = json.loads(prices_path.read_text())
        return prices, None
    raw = json.loads(raw_path.read_text())
    prices = json.loads(prices_path.read_text())
    n = min(len(prices), len(raw))
    timestamps = [datetime.fromtimestamp(raw[i][0] / 1000, tz=timezone.utc) for i in range(n)]
    prices = prices[:n]

    # Trim from START_DATE
    start_idx = 0
    for i, dt in enumerate(timestamps):
        if dt >= START_DATE:
            start_idx = i
            break
    prices = prices[start_idx:]
    timestamps = timestamps[start_idx:]
    return prices, timestamps


def backtest_single(prices, ep, entry_pct, exit_pct, go_long):
    """Returns (equity_curve, trades, wins)."""
    ema = compute_ema(prices, ep)
    n = len(prices)
    if n < 2 or ep >= n:
        return None, 0, 0
    capital = INITIAL_CAPITAL
    equity = [capital] * ep
    in_pos = False
    entry_p = entry_idx = None
    trades = wins = 0
    for i in range(ep, n):
        p, e = prices[i], ema[i]
        if e is None:
            equity.append(equity[-1])
            continue
        if not in_pos:
            if (go_long and p > e * (1 + entry_pct / 100)) or \
               (not go_long and p < e * (1 - entry_pct / 100)):
                in_pos = True
                entry_p = p
                entry_idx = i
                trades += 1
            equity.append(equity[-1])
        else:
            exit_sig = (go_long and p < e * (1 - exit_pct / 100)) or \
                       (not go_long and p > e * (1 + exit_pct / 100))
            if exit_sig:
                ret = (p / entry_p - 1) if go_long else (entry_p / p - 1)
                capital = equity[entry_idx] * (1 + ret)
                equity.append(capital)
                if ret > 0: wins += 1
                in_pos = False
            else:
                equity.append(equity[-1])
    if in_pos:
        p = prices[-1]
        ret = (p / entry_p - 1) if go_long else (entry_p / p - 1)
        capital = equity[entry_idx] * (1 + ret)
        equity[-1] = capital
        if ret > 0: wins += 1
    return equity, trades, wins


def backtest_regime_single(prices, regime_ep, long_ep, long_entry, long_exit,
                           short_ep, short_entry, short_exit):
    """Returns (equity_curve, trades, wins)."""
    n = len(prices)
    if n < max(regime_ep, long_ep, short_ep):
        return None, 0, 0
    r_ema = compute_ema(prices, regime_ep)
    l_ema = compute_ema(prices, long_ep)
    s_ema = compute_ema(prices, short_ep)
    start = max(regime_ep, long_ep, short_ep)
    capital = INITIAL_CAPITAL
    equity = [capital] * start
    in_pos = in_short = False
    entry_p = entry_idx = None
    trades = wins = 0
    for i in range(start, n):
        p = prices[i]
        bull = r_ema[i] is not None and p > r_ema[i]
        if not in_pos:
            equity.append(equity[-1])
            if bull and l_ema[i] is not None and p > l_ema[i] * (1 + long_entry / 100):
                in_pos = True; in_short = False
                entry_p = p; entry_idx = i; trades += 1
            elif not bull and s_ema[i] is not None and p < s_ema[i] * (1 - short_entry / 100):
                in_pos = True; in_short = True
                entry_p = p; entry_idx = i; trades += 1
        else:
            exit_sig = False
            if not in_short and l_ema[i] is not None and p < l_ema[i] * (1 - long_exit / 100):
                exit_sig = True
            elif in_short and s_ema[i] is not None and p > s_ema[i] * (1 + short_exit / 100):
                exit_sig = True
            if exit_sig:
                ret = (p / entry_p - 1) if not in_short else (entry_p / p - 1)
                capital = equity[entry_idx] * (1 + ret)
                equity.append(capital)
                if ret > 0: wins += 1
                in_pos = False
            else:
                equity.append(equity[-1])
    if in_pos:
        p = prices[-1]
        ret = (p / entry_p - 1) if not in_short else (entry_p / p - 1)
        capital = equity[entry_idx] * (1 + ret)
        equity[-1] = capital
        if ret > 0: wins += 1
    return equity, trades, wins


def backtest_hybrid_single(prices, signal_mask, start_idx):
    """
    Hybrid: short normally, switch to long when signal fires.
    Returns (equity_curve, trades, wins).
    """
    n = len(prices)
    ema_s = compute_ema(prices, SHORT_EMA)
    ema_l = compute_ema(prices, HYBRID_LONG_EMA)

    capital = INITIAL_CAPITAL
    equity = [capital] * start_idx
    entry_p = None
    mode = 'short'
    trades = wins = 0

    for i in range(start_idx, n):
        p = prices[i]
        mode = 'long' if (i < len(signal_mask) and signal_mask[i]) else 'short'

        if mode == 'short':
            e = ema_s[i]
            if e is None:
                equity.append(equity[-1])
                continue
            if entry_p is not None:
                if p > e * (1 + SHORT_EXIT / 100):
                    gross = entry_p / p - 1
                    net = (1 + gross) * (1 - HYBRID_TAKER_FEE / 100) / (1 + HYBRID_TAKER_FEE / 100) - 1
                    capital = capital * (1 + net)
                    if net > 0: wins += 1
                    trades += 1
                    entry_p = None
            elif p < e * (1 - SHORT_ENTRY / 100):
                entry_p = p
        else:
            e = ema_l[i]
            if e is None:
                equity.append(equity[-1])
                continue
            if entry_p is not None:
                if p < e * (1 - HYBRID_LONG_EXIT / 100):
                    gross = p / entry_p - 1
                    net = (1 + gross) * (1 - HYBRID_TAKER_FEE / 100) / (1 + HYBRID_TAKER_FEE / 100) - 1
                    capital = capital * (1 + net)
                    if net > 0: wins += 1
                    trades += 1
                    entry_p = None
            elif p > e * (1 + HYBRID_LONG_ENTRY / 100):
                entry_p = p
        equity.append(capital)

    if entry_p is not None:
        p_final = prices[-1]
        if mode == 'short':
            gross = entry_p / p_final - 1
        else:
            gross = p_final / entry_p - 1
        net = (1 + gross) * (1 - HYBRID_TAKER_FEE / 100) / (1 + HYBRID_TAKER_FEE / 100) - 1
        capital = capital * (1 + net)
        if net > 0: wins += 1
        trades += 1
        equity[-1] = capital

    return equity, trades, wins


def build_hybrid_signal_mask(coins_data):
    """Build per-hour bull signal mask across all coins."""
    n_total = max(len(c[1]) for c in coins_data)
    coins_above_list = []
    for i in range(n_total):
        ca = 0
        for _, prices, ema50 in coins_data:
            if i < len(ema50) and ema50[i] is not None and i < len(prices):
                if prices[i] > ema50[i]:
                    ca += 1
        coins_above_list.append(ca)

    mask = [False] * n_total
    for i in range(HYBRID_SIGNAL_HOURS, n_total):
        active = True
        for li in range(i - HYBRID_SIGNAL_HOURS, i):
            if coins_above_list[li] < HYBRID_SIGNAL_THRESHOLD:
                active = False
                break
        if active:
            mask[i] = True
    return mask


def get_monthly_slices(prices, timestamps):
    """Yield (label, start_i, end_i, month_prices) for each calendar month."""
    if timestamps is None:
        return
    months = OrderedDict()
    for i, dt in enumerate(timestamps):
        key = (dt.year, dt.month)
        if key not in months:
            months[key] = {"first": i, "last": i}
        months[key]["last"] = i
    for (yr, mo), idxs in months.items():
        label = f"{calendar.month_abbr[mo]}'{str(yr)[-2:]}"
        start, end = idxs["first"], idxs["last"] + 1
        yield label, start, end, prices[start:end]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Monthly strategy breakdown")
    parser.add_argument("--coin", type=str, default=None)
    parser.add_argument("--csv", action="store_true", help="Export to a single combined CSV")
    parser.add_argument("--csv-file", type=str, default="monthly_breakdown.csv",
                        help="CSV output filename (default: monthly_breakdown.csv)")
    args = parser.parse_args()

    all_coins = discover_coins()
    coins = [args.coin] if args.coin else list(all_coins.keys())

    # Pre-load all coin data for hybrid signal mask
    coin_data_for_mask = []
    for coin in coins:
        prices, timestamps = load_data(coin)
        if prices:
            ema50 = compute_ema(prices, REGIME_EMA)
            coin_data_for_mask.append((coin, prices, ema50))
    hybrid_mask = build_hybrid_signal_mask(coin_data_for_mask)

    # Collect all coin data for CSV
    all_coin_data = {}

    for coin in coins:
        conf = all_coins.get(coin, {"name": coin.upper()})
        prices, timestamps = load_data(coin)
        if not prices:
            print(f"\n  {conf['name']}: No data")
            continue

        slices = list(get_monthly_slices(prices, timestamps))
        if not slices:
            print(f"\n  {conf['name']}: No monthly data")
            continue

        n_prices = len(prices)
        coin_hybrid_mask = hybrid_mask[:n_prices] if n_prices > 0 else []
        start_idx = max(SHORT_EMA, HYBRID_LONG_EMA, REGIME_EMA)

        # Compute all rows
        rows = []
        for label, start, end, month_prices in slices:
            # Buy & Hold
            bh = (month_prices[-1] / month_prices[0] - 1) * 100
            # Long
            leq, ltr, lwn = backtest_single(month_prices, LONG_EMA, LONG_ENTRY, LONG_EXIT, True)
            lret = (leq[-1] / leq[0] - 1) * 100 if leq and len(leq) > 1 else 0
            lwr = lwn / ltr * 100 if ltr > 0 else 0
            # Short
            seq, str_, swn = backtest_single(month_prices, SHORT_EMA, SHORT_ENTRY, SHORT_EXIT, False)
            sret = (seq[-1] / seq[0] - 1) * 100 if seq and len(seq) > 1 else 0
            swr = swn / str_ * 100 if str_ > 0 else 0
            # Regime
            req, rtr, rwn = backtest_regime_single(month_prices, REGIME_EMA,
                                                   LONG_EMA, LONG_ENTRY, LONG_EXIT,
                                                   SHORT_EMA, SHORT_ENTRY, SHORT_EXIT)
            rret = (req[-1] / req[0] - 1) * 100 if req and len(req) > 1 else 0
            rwr = rwn / rtr * 100 if rtr > 0 else 0
            # Hybrid
            month_mask = coin_hybrid_mask[start:end] if end <= len(coin_hybrid_mask) else coin_hybrid_mask[start:]
            heq, htr, hwn = backtest_hybrid_single(month_prices, month_mask,
                                                     min(start_idx, len(month_prices)))
            hret = (heq[-1] / heq[0] - 1) * 100 if heq and len(heq) > 1 else 0
            hwr = hwn / htr * 100 if htr > 0 else 0
            rows.append({
                "month": label,
                "buy_hold": round(bh, 1),
                "long_ret": round(lret, 1),
                "long_trades": ltr,
                "long_wr": round(lwr, 0),
                "short_ret": round(sret, 1),
                "short_trades": str_,
                "short_wr": round(swr, 0),
                "regime_ret": round(rret, 1),
                "regime_trades": rtr,
                "regime_wr": round(rwr, 0),
                "hybrid_ret": round(hret, 1),
                "hybrid_trades": htr,
                "hybrid_wr": round(hwr, 0),
            })

        # Full year
        bh_full = (prices[-1] / prices[0] - 1) * 100
        leq, ltr, lwn = backtest_single(prices, LONG_EMA, LONG_ENTRY, LONG_EXIT, True)
        lret = (leq[-1] / leq[0] - 1) * 100 if leq and len(leq) > 1 else 0
        lwr = lwn / ltr * 100 if ltr > 0 else 0
        seq, str_, swn = backtest_single(prices, SHORT_EMA, SHORT_ENTRY, SHORT_EXIT, False)
        sret = (seq[-1] / seq[0] - 1) * 100 if seq and len(seq) > 1 else 0
        swr = swn / str_ * 100 if str_ > 0 else 0
        req, rtr, rwn = backtest_regime_single(prices, REGIME_EMA,
                                               LONG_EMA, LONG_ENTRY, LONG_EXIT,
                                               SHORT_EMA, SHORT_ENTRY, SHORT_EXIT)
        rret = (req[-1] / req[0] - 1) * 100 if req and len(req) > 1 else 0
        rwr = rwn / rtr * 100 if rtr > 0 else 0
        heq, htr, hwn = backtest_hybrid_single(prices, coin_hybrid_mask, start_idx)
        hret = (heq[-1] / heq[0] - 1) * 100 if heq and len(heq) > 1 else 0
        hwr = hwn / htr * 100 if htr > 0 else 0
        rows.append({
            "month": "Full Year",
            "buy_hold": round(bh_full, 1),
            "long_ret": round(lret, 1),
            "long_trades": ltr,
            "long_wr": round(lwr, 0),
            "short_ret": round(sret, 1),
            "short_trades": str_,
            "short_wr": round(swr, 0),
            "regime_ret": round(rret, 1),
            "regime_trades": rtr,
            "regime_wr": round(rwr, 0),
            "hybrid_ret": round(hret, 1),
            "hybrid_trades": htr,
            "hybrid_wr": round(hwr, 0),
        })

        # Store for combined CSV
        all_coin_data[coin] = {"conf": conf, "rows": rows, "prices": prices,
                                "slices": slices}

        # Print table
        print(f"\n  {conf['name']} — {len(prices)} hourly points "
              f"({slices[0][0]} → {slices[-1][0]})")
        print()

        # Header
        strategies = [
            ("Buy&Hold", None, None, None, None),
            (f"Long {LONG_EMA}h/{LONG_ENTRY:.0f}%", "LONG", None, None, None),
            (f"Short {SHORT_EMA}h/{SHORT_ENTRY:.0f}%", "SHORT", None, None, None),
            (f"Regime {REGIME_EMA}h", "REGIME", None, None, None),
            (f"Hybrid", "HYBRID", None, None, None),
        ]
        header = f"  {'Month':<10}"
        for s_label, *_ in strategies:
            header += f"  {s_label:>16}"
        header += f"  {'Trades':>7}  {'WR':>5}"
        print(header)
        print(f"  {'─' * 10}", end="")
        for _ in strategies:
            print(f"  {'─' * 16}", end="")
        print(f"  {'─' * 7}  {'─' * 5}")

        for label, start, end, month_prices in slices:
            line = f"  {label:<10}"

            # Buy & Hold
            bh = (month_prices[-1] / month_prices[0] - 1) * 100
            line += f"  {bh:>+15.1f}%"

            # Long
            eq, _, _ = backtest_single(month_prices, LONG_EMA, LONG_ENTRY, LONG_EXIT, True)
            ret = (eq[-1] / eq[0] - 1) * 100 if eq and len(eq) > 1 else 0
            line += f"  {ret:>+15.1f}%"

            # Short
            eq, _, _ = backtest_single(month_prices, SHORT_EMA, SHORT_ENTRY, SHORT_EXIT, False)
            ret = (eq[-1] / eq[0] - 1) * 100 if eq and len(eq) > 1 else 0
            line += f"  {ret:>+15.1f}%"

            # Regime
            eq, tr, wn = backtest_regime_single(month_prices, REGIME_EMA,
                                                LONG_EMA, LONG_ENTRY, LONG_EXIT,
                                                SHORT_EMA, SHORT_ENTRY, SHORT_EXIT)
            ret = (eq[-1] / eq[0] - 1) * 100 if eq and len(eq) > 1 else 0
            wr = wn / tr * 100 if tr > 0 else 0
            line += f"  {ret:>+15.1f}%  {tr:>5}  {wr:>4.0f}%"

            # Hybrid
            month_mask = coin_hybrid_mask[start:end] if end <= len(coin_hybrid_mask) else coin_hybrid_mask[start:]
            heq, htr, hwn = backtest_hybrid_single(month_prices, month_mask,
                                                     min(start_idx, len(month_prices)))
            hret = (heq[-1] / heq[0] - 1) * 100 if heq and len(heq) > 1 else 0
            hwr = hwn / htr * 100 if htr > 0 else 0
            line += f"  {hret:>+15.1f}%  {htr:>5}  {hwr:>4.0f}%"

            print(line)

        # Separator
        print(f"  {'─' * 10}", end="")
        for _ in strategies:
            print(f"  {'─' * 16}", end="")
        print(f"  {'─' * 7}  {'─' * 5}")

        # Full year row
        line = f"  {'Full Year':<10}"

        bh_full = (prices[-1] / prices[0] - 1) * 100
        line += f"  {bh_full:>+15.1f}%"

        leq, _, _ = backtest_single(prices, LONG_EMA, LONG_ENTRY, LONG_EXIT, True)
        lret = (leq[-1] / leq[0] - 1) * 100 if leq and len(leq) > 1 else 0
        line += f"  {lret:>+15.1f}%"

        seq, _, _ = backtest_single(prices, SHORT_EMA, SHORT_ENTRY, SHORT_EXIT, False)
        sret = (seq[-1] / seq[0] - 1) * 100 if seq and len(seq) > 1 else 0
        line += f"  {sret:>+15.1f}%"

        req, rtr, rwn = backtest_regime_single(prices, REGIME_EMA,
                                                LONG_EMA, LONG_ENTRY, LONG_EXIT,
                                                SHORT_EMA, SHORT_ENTRY, SHORT_EXIT)
        rret = (req[-1] / req[0] - 1) * 100 if req and len(req) > 1 else 0
        rwr = rwn / rtr * 100 if rtr > 0 else 0
        line += f"  {rret:>+15.1f}%  {rtr:>5}  {rwr:>4.0f}%"

        heq, htr, hwn = backtest_hybrid_single(prices, coin_hybrid_mask, start_idx)
        hret = (heq[-1] / heq[0] - 1) * 100 if heq and len(heq) > 1 else 0
        hwr = hwn / htr * 100 if htr > 0 else 0
        line += f"  {hret:>+15.1f}%  {htr:>5}  {hwr:>4.0f}%"

        print(line)
        print()

    # Write combined CSV (months = columns, two label columns: coin + strategy)
    if args.csv and all_coin_data:
        csv_path = Path(args.csv_file)

        first_coin = next(iter(all_coin_data))
        ordered_months = [r["month"] for r in all_coin_data[first_coin]["rows"]
                          if r["month"] != "Full Year"]
        ordered_months.append("Full Year")

        metrics = [
            ("buy_hold",      "Buy Hold",            "decimal"),
            ("long_ret",      "Long Returns",        "decimal"),
            ("long_trades",   "Long Trades",         "int"),
            ("long_wr",       "Long Win Rate",       "decimal"),
            ("short_ret",     "Short Returns",       "decimal"),
            ("short_trades",  "Short Trades",        "int"),
            ("short_wr",      "Short Win Rate",      "decimal"),
            ("regime_ret",    "Long/Short Returns",  "decimal"),
            ("regime_trades", "Long/Short Trades",   "int"),
            ("regime_wr",     "Long/Short Win Rate", "decimal"),
            ("hybrid_ret",    "Hybrid Returns",      "decimal"),
            ("hybrid_trades", "Hybrid Trades",       "int"),
            ("hybrid_wr",     "Hybrid Win Rate",     "decimal"),
        ]

        def format_value(val, fmt):
            if val == "" or val is None:
                return ""
            if fmt == "int":
                return str(int(val))
            return f"{float(val) / 100:.3f}"

        with open(csv_path, "w") as f:
            header = ["Coin", "Strategy"] + ordered_months
            f.write(",".join(header) + "\n")

            for coin, data in all_coin_data.items():
                coin_label = coin.upper()
                month_map = {r["month"]: r for r in data["rows"]}
                for field_key, strat_label, fmt in metrics:
                    row = [coin_label, strat_label]
                    for month in ordered_months:
                        r = month_map.get(month)
                        if r is None:
                            row.append("")
                        else:
                            row.append(format_value(r[field_key], fmt))
                    f.write(",".join(row) + "\n")

        print(f"  CSV exported: {csv_path}")


if __name__ == "__main__":
    main()
