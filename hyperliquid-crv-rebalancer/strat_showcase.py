"""
Show ALL optimized strategies for PUDGY and PENGUIN in a compact table.
"""
import json, math, statistics

coins = {
    "USELESS (LONG)": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/eff90cfc-2b71-4fb9-8814-b92e1b0e9e90.txt",
        "go_long": True,
    },
    "PENGUIN (SHORT)": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt",
        "go_long": False,
    },
    "PUDGY (LONG)": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt",
        "go_long": True,
    },
}

def load_prices(filepath):
    with open(filepath) as f:
        raw = f.read()
    data = json.loads(raw)
    return [p[1] for p in data["prices"]]

def ema(series, period):
    result = []
    mult = 2 / (period + 1)
    ema_val = series[0]
    for s in series:
        ema_val = (s - ema_val) * mult + ema_val
        result.append(ema_val)
    return result

def backtest(prices, period, entry_pct, exit_pct, go_long=True):
    log_prices = [math.log(p) for p in prices]
    log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
    ema_vals = ema(prices, period)
    
    in_pos = False
    trades = []
    entry_idx = 0
    
    for i in range(1, len(prices)):
        if go_long:
            entry_signal = prices[i] > ema_vals[i] * (1 + entry_pct / 100)
            exit_signal = prices[i] < ema_vals[i] * (1 - exit_pct / 100)
        else:
            entry_signal = prices[i] < ema_vals[i] * (1 - entry_pct / 100)
            exit_signal = prices[i] > ema_vals[i] * (1 + exit_pct / 100)
        
        if entry_signal and not in_pos:
            in_pos = True
            entry_idx = i
        elif exit_signal and in_pos:
            in_pos = False
            trade_r = math.exp(sum(log_returns[entry_idx:i])) - 1
            trades.append((trade_r, i - entry_idx))
    
    if in_pos:
        trade_r = math.exp(sum(log_returns[entry_idx:])) - 1
        trades.append((trade_r, len(prices) - 1 - entry_idx))
    
    if not trades or len(trades) < 3:
        return None
    
    total_return = math.prod([1 + t[0] for t in trades]) - 1
    
    strat_returns = []
    for i in range(1, len(prices)):
        idx = i - 1
        if go_long:
            in_trade = prices[i] > ema_vals[i] * (1 + entry_pct / 100)
        else:
            in_trade = prices[i] < ema_vals[i] * (1 - entry_pct / 100)
        if in_trade:
            strat_returns.append(log_returns[idx])
        else:
            strat_returns.append(0.0)
    
    sm = statistics.mean(strat_returns)
    ss = statistics.stdev(strat_returns)
    sharpe = (sm / ss) * math.sqrt(24 * 365) if ss > 0 else 0
    
    cum = 0
    peak = -1e9
    dd = 0
    for r in strat_returns:
        cum += r
        peak = max(peak, cum)
        dd = min(dd, cum - peak)
    max_dd_pct = (math.exp(dd) - 1) * 100
    
    wins = [t for t in trades if t[0] > 0]
    losses = [t for t in trades if t[0] <= 0]
    win_rate = len(wins) / len(trades) * 100 if trades else 0
    pf = (sum(t[0] for t in wins) / abs(sum(t[0] for t in losses))) if losses else 99
    avg_hold = statistics.mean([t[1] for t in trades])
    
    return {
        "period": period,
        "entry_pct": entry_pct,
        "exit_pct": exit_pct,
        "total_return": total_return * 100,
        "sharpe": sharpe,
        "max_dd": max_dd_pct,
        "win_rate": win_rate,
        "pf": pf,
        "n_trades": len(trades),
        "avg_hold": avg_hold,
    }

# Categories of strategies to show
strategy_types = [
    ("Low Vol / Frequent", lambda r: r["n_trades"] >= 50 and r["max_dd"] > -10),
    ("Med Vol / Moderate", lambda r: 10 <= r["n_trades"] < 50 and r["max_dd"] > -10),
    ("High Conviction / Rare", lambda r: 3 <= r["n_trades"] < 10 and r["max_dd"] > -25),
]

for name, coin in coins.items():
    prices = load_prices(coin["file"])
    go_long = coin["go_long"]
    bh = (prices[-1] / prices[0] - 1) * 100
    
    # Run grid
    results = []
    for p in range(3, 101, 2):
        for ep in [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 7.5, 10.0]:
            for xp in [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0]:
                r = backtest(prices, p, ep, xp, go_long)
                if r and r["n_trades"] >= 3:
                    results.append(r)
    
    print(f"\n{'='*90}")
    print(f"{name}")
    print(f"Buy & Hold: {bh:+.1f}%   |   {len(results)} valid strategy combos")
    print(f"{'='*90}")
    
    for cat_name, filter_fn in strategy_types:
        filtered = [r for r in results if filter_fn(r)]
        sorted_by_sharpe = sorted(filtered, key=lambda r: r["sharpe"], reverse=True)[:5]
        sorted_by_return = sorted(filtered, key=lambda r: r["total_return"], reverse=True)[:3]
        
        # Top 5 by Sharpe
        print(f"\n  ┌── {cat_name} Strategies (Top 5 by Sharpe) ──┐")
        print(f"  {'Rank':<5} {'Period':<8} {'Entry%':<8} {'Exit%':<8} {'Sharpe':<8} {'Return':<12} {'MaxDD':<8} {'WinRate':<8} {'PF':<8} {'Trades':<8} {'AvgHold':<8}")
        print(f"  {'-'*85}")
        for i, r in enumerate(sorted_by_sharpe):
            hold_str = f"{r['avg_hold']:.0f}h" if r['avg_hold'] < 48 else f"{r['avg_hold']/24:.1f}d"
            print(f"  {i+1:<5} {r['period']:<8} {r['entry_pct']:<8.1f} {r['exit_pct']:<8.1f} {r['sharpe']:<8.2f} {r['total_return']:<+10.2f}% {r['max_dd']:<8.2f}% {r['win_rate']:<8.1f}% {r['pf']:<8.2f} {r['n_trades']:<8} {hold_str:<8}")
        
        # Best return in this category
        if sorted_by_return:
            best_r = sorted_by_return[0]
            hold_str = f"{best_r['avg_hold']:.0f}h" if best_r['avg_hold'] < 48 else f"{best_r['avg_hold']/24:.1f}d"
            print(f"\n    → Best return: Period={best_r['period']}h, Entry={best_r['entry_pct']}%, Exit={best_r['exit_pct']}%")
            print(f"      Return={best_r['total_return']:+.2f}%, Sharpe={best_r['sharpe']:.2f}, WinRate={best_r['win_rate']:.1f}%, MaxDD={best_r['max_dd']:.2f}%")
    
    # Single overall best Sharpe
    best_sharpe = max(results, key=lambda r: r["sharpe"])
    best_return = max(results, key=lambda r: r["total_return"])
    
    print(f"\n  ═══ OVERALL BEST ═══")
    print(f"  Best Sharpe: Period={best_sharpe['period']}h, Entry={best_sharpe['entry_pct']}%, Exit={best_sharpe['exit_pct']}%")
    print(f"    Sharpe={best_sharpe['sharpe']:.2f}, Return={best_sharpe['total_return']:+.2f}%, WinRate={best_sharpe['win_rate']:.1f}%, MaxDD={best_sharpe['max_dd']:.2f}%")
    
    hold_str = f"{best_return['avg_hold']:.0f}h" if best_return['avg_hold'] < 48 else f"{best_return['avg_hold']/24:.1f}d"
    print(f"  Best Return: Period={best_return['period']}h, Entry={best_return['entry_pct']}%, Exit={best_return['exit_pct']}%")
    print(f"    Return={best_return['total_return']:+.2f}%, Sharpe={best_return['sharpe']:.2f}, WinRate={best_return['win_rate']:.1f}%, Trades={best_return['n_trades']}, AvgHold={hold_str}")
