"""
Optimize EMA trend-follow for each coin.
Find the best parameters: EMA period + entry threshold + exit threshold
that maximizes Sharpe ratio over the 90-day hourly data.
Grid search over:
  - EMA period: 3 to 100 hours
  - Entry threshold: price must be above EMA by X%
  - Exit threshold: price crossing below EMA (standard) or below EMA by Y%
"""
import json, math, statistics

coins = {
    "PENGUIN": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt",
        "long": False,  # in downtrend, test short side
    },
    "USELESS": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/eff90cfc-2b71-4fb9-8814-b92e1b0e9e90.txt",
        "long": True,
    },
    "PUDGY": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt",
        "long": True,
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
    """
    Long strategy: enter when price > EMA * (1 + entry_pct/100)
                    exit when price < EMA * (1 - exit_pct/100) [exit_pct positive]
    Short strategy: enter when price < EMA * (1 - entry_pct/100)
                    exit when price > EMA * (1 + exit_pct/100)
    
    exit_pct controls how far below EMA before exiting (wider = hold longer).
    """
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
    
    if not trades:
        return None
    
    total_return = math.prod([1 + t[0] for t in trades]) - 1
    
    # Strategy return series for Sharpe
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
    
    # Max drawdown
    cum = 0
    peak = -1e9
    dd = 0
    for r in strat_returns:
        cum += r
        peak = max(peak, cum)
        dd = min(dd, cum - peak)
    max_dd_pct = (math.exp(dd) - 1) * 100
    
    # Trade stats
    wins = [t for t in trades if t[0] > 0]
    losses = [t for t in trades if t[0] <= 0]
    win_rate = len(wins) / len(trades) * 100 if trades else 0
    pf = (sum(t[0] for t in wins) / abs(sum(t[0] for t in losses))) if losses else 99
    
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
        "avg_hold": statistics.mean([t[1] for t in trades]),
    }

def grid_search(prices, go_long=True):
    results = []
    
    # Grid ranges
    periods = list(range(3, 101, 2))  # 3 to 99 hours, step 2
    entry_pcts = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 7.5, 10.0]
    exit_pcts = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0]
    
    total_combos = len(periods) * len(entry_pcts) * len(exit_pcts)
    
    for p in periods:
        for ep in entry_pcts:
            for xp in exit_pcts:
                r = backtest(prices, p, ep, xp, go_long)
                if r and r["n_trades"] >= 5:
                    results.append(r)
    
    return results

def display_top(results, prices, name, go_long):
    bh_ret = (prices[-1] / prices[0] - 1) * 100
    
    # Sort by Sharpe
    sorted_by_sharpe = sorted(results, key=lambda r: r["sharpe"], reverse=True)[:10]
    # Sort by total return
    sorted_by_return = sorted(results, key=lambda r: r["total_return"], reverse=True)[:5]
    # Best risk-adjusted (Sharpe * WinRate)
    sorted_by_risk = sorted(results, key=lambda r: r["sharpe"] * r["win_rate"] / 100, reverse=True)[:5]
    
    direction = "LONG" if go_long else "SHORT"
    
    print(f"\n{'='*80}")
    print(f"{name} — {direction} Strategy Grid Search")
    print(f"  Buy & Hold return: {bh_ret:+.1f}%")
    print(f"  Grid: {len(results)} combos tested (periods 3-99h × entry 0-10% × exit 0-5%)")
    print(f"{'='*80}")
    
    print(f"\n  ┌── TOP 10 BY SHARPE RATIO ──┐")
    print(f"  {'Rank':<6} {'Period':<8} {'Entry%':<8} {'Exit%':<8} {'Sharpe':<10} {'Return':<12} {'MaxDD':<10} {'WinRate':<10} {'PF':<8} {'Trades':<8}")
    print(f"  {'-'*78}")
    for i, r in enumerate(sorted_by_sharpe[:10]):
        print(f"  {i+1:<6} {r['period']:<8} {r['entry_pct']:<8.1f} {r['exit_pct']:<8.1f} {r['sharpe']:<10.2f} {r['total_return']:<+10.2f}% {r['max_dd']:<10.2f}% {r['win_rate']:<10.1f}% {r['pf']:<8.2f} {r['n_trades']:<8}")
    
    print(f"\n  ┌── TOP 5 BY TOTAL RETURN ──┐")
    print(f"  {'Rank':<6} {'Period':<8} {'Entry%':<8} {'Exit%':<8} {'Sharpe':<10} {'Return':<12} {'MaxDD':<10} {'WinRate':<10} {'PF':<8} {'Trades':<8}")
    print(f"  {'-'*78}")
    for i, r in enumerate(sorted_by_return[:5]):
        print(f"  {i+1:<6} {r['period']:<8} {r['entry_pct']:<8.1f} {r['exit_pct']:<8.1f} {r['sharpe']:<10.2f} {r['total_return']:<+10.2f}% {r['max_dd']:<10.2f}% {r['win_rate']:<10.1f}% {r['pf']:<8.2f} {r['n_trades']:<8}")
    
    print(f"\n  ┌── TOP 5 BY RISK-ADJUSTED (Sharpe × WinRate) ──┐")
    print(f"  {'Rank':<6} {'Period':<8} {'Entry%':<8} {'Exit%':<8} {'Sharpe':<10} {'Return':<12} {'MaxDD':<10} {'WinRate':<10} {'PF':<8} {'Trades':<8}")
    print(f"  {'-'*78}")
    for i, r in enumerate(sorted_by_risk[:5]):
        print(f"  {i+1:<6} {r['period']:<8} {r['entry_pct']:<8.1f} {r['exit_pct']:<8.1f} {r['sharpe']:<10.2f} {r['total_return']:<+10.2f}% {r['max_dd']:<10.2f}% {r['win_rate']:<10.1f}% {r['pf']:<8.2f} {r['n_trades']:<8}")
    
    # Best overall pick
    print(f"\n  >>> BEST SHARPE: Period={sorted_by_sharpe[0]['period']}h, Entry={sorted_by_sharpe[0]['entry_pct']}%, Exit={sorted_by_sharpe[0]['exit_pct']}%")
    print(f"      Sharpe={sorted_by_sharpe[0]['sharpe']:.2f}, Return={sorted_by_sharpe[0]['total_return']:+.2f}%, WinRate={sorted_by_sharpe[0]['win_rate']:.1f}%, MaxDD={sorted_by_sharpe[0]['max_dd']:.2f}%")
    
    return sorted_by_sharpe[0]

for name, coin in coins.items():
    prices = load_prices(coin["file"])
    go_long = coin["long"]
    results = grid_search(prices, go_long)
    best = display_top(results, prices, name, go_long)
