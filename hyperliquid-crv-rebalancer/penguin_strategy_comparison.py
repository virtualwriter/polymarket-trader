"""
Compare 5h, 10h, and 20h EMA trend-follow strategies for all three coins.
Shows key stats: win rate, sharpe, avg hold time, max drawdown, etc.
"""
import json, math, statistics, random

def load_prices(filepath):
    with open(filepath) as f:
        raw = f.read()
    data = json.loads(raw)
    return [p[1] for p in data["prices"]]

def ema(series, period):
    result = []
    multiplier = 2 / (period + 1)
    ema_val = series[0]
    for s in series:
        ema_val = (s - ema_val) * multiplier + ema_val
        result.append(ema_val)
    return result

def analyze_strategy(prices, period_hours, label):
    """Simulate: go long when price > EMA, flat when below.
    Returns detailed stats."""
    log_prices = [math.log(p) for p in prices]
    log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
    ema_vals = ema(prices, period_hours)
    
    # Track in/out trades
    in_position = False
    trades = []  # list of (entry_idx, exit_idx, return, bars_held)
    entry_idx = 0
    
    daily_returns_by_day = {}  # day index -> total strat return
    
    for i in range(1, len(prices)):
        signal = prices[i] > ema_vals[i]
        
        if signal and not in_position:
            # Enter long
            in_position = True
            entry_idx = i
        elif not signal and in_position:
            # Exit long
            in_position = False
            trade_return = math.exp(sum(log_returns[entry_idx:i])) - 1
            trades.append((entry_idx, i, trade_return, i - entry_idx))
    
    # Close last trade if still open
    if in_position:
        trade_return = math.exp(sum(log_returns[entry_idx:])) - 1
        trades.append((entry_idx, len(prices)-1, trade_return, len(prices)-1 - entry_idx))
    
    # Compute trade stats
    win_trades = [t for t in trades if t[2] > 0]
    loss_trades = [t for t in trades if t[2] <= 0]
    win_rate = len(win_trades) / len(trades) * 100 if trades else 0
    
    avg_win = statistics.mean([t[2] for t in win_trades]) * 100 if win_trades else 0
    avg_loss = statistics.mean([t[2] for t in loss_trades]) * 100 if loss_trades else 0
    avg_hold = statistics.mean([t[3] for t in trades]) if trades else 0
    avg_hold_str = f"{avg_hold:.1f}h ({avg_hold/24:.1f}d)"
    
    best_trade = max(trades, key=lambda t: t[2])[2] * 100 if trades else 0
    worst_trade = min(trades, key=lambda t: t[2])[2] * 100 if trades else 0
    
    # Total return
    total_return = math.prod([1 + t[2] for t in trades]) - 1
    
    # Strategy daily returns (for Sharpe)
    strat_returns = []
    in_trade_idx = -1
    for i in range(1, len(prices)):
        if prices[i] > ema_vals[i]:
            if in_trade_idx < 0:
                in_trade_idx = i
            strat_returns.append(log_returns[i])
        else:
            if in_trade_idx >= 0:
                in_trade_idx = -1
            strat_returns.append(0.0)
    
    strat_mean = statistics.mean(strat_returns)
    strat_std = statistics.stdev(strat_returns)
    hourly_sharpe = strat_mean / strat_std if strat_std > 0 else 0
    annual_sharpe = hourly_sharpe * math.sqrt(24 * 365)
    
    # Max drawdown of the strategy
    cumulative = []
    running = 0
    for r in strat_returns:
        running += r
        cumulative.append(running)
    
    running_max = -1e9
    max_dd = 0
    for v in cumulative:
        running_max = max(running_max, v)
        dd = (v - running_max)
        max_dd = min(max_dd, dd)
    
    max_dd_pct = (math.exp(max_dd) - 1) * 100

    # Buy-and-hold for comparison
    bh_return = (prices[-1] / prices[0] - 1) * 100
    
    # Number of signals / total possible
    signal_pct = sum(1 for i in range(1, len(prices)) if prices[i] > ema_vals[i]) / (len(prices) - 1) * 100
    
    # Average return per trade (simple avg)
    avg_trade_return = statistics.mean([t[2] for t in trades]) * 100 if trades else 0
    
    # Profit factor
    gross_profit = sum(t[2] for t in win_trades) if win_trades else 0
    gross_loss = abs(sum(t[2] for t in loss_trades)) if loss_trades else 1e-10
    profit_factor = gross_profit / gross_loss

    print(f"\n  {'='*60}")
    print(f"  {label}")
    print(f"  {'='*60}")
    print(f"  {'Statistic':<30} {'Value':<15}")
    print(f"  {'-'*45}")
    print(f"  {'Total trades':<30} {len(trades):<15}")
    print(f"  {'Win rate':<30} {win_rate:<15.1f}%")
    print(f"  {'Win trades':<30} {len(win_trades)}")
    print(f"  {'Loss trades':<30} {len(loss_trades)}")
    print(f"  {'Avg win':<30} {avg_win:<15.2f}%")
    print(f"  {'Avg loss':<30} {avg_loss:<15.2f}%")
    print(f"  {'Avg trade return':<30} {avg_trade_return:<15.2f}%")
    print(f"  {'Best trade':<30} {best_trade:<15.2f}%")
    print(f"  {'Worst trade':<30} {worst_trade:<15.2f}%")
    print(f"  {'Avg hold time':<30} {avg_hold_str:<15}")
    print(f"  {'Total strategy return':<30} {total_return*100:<15.2f}%")
    print(f"  {'Buy & hold return':<30} {bh_return:<15.2f}%")
    print(f"  {'Strategy vs B&H':<30} {(total_return*100 - bh_return):<+15.2f}%")
    print(f"  {'Annual signal Sharpe':<30} {annual_sharpe:<15.2f}")
    print(f"  {'Profit factor':<30} {profit_factor:<15.2f}")
    print(f"  {'Strategy max drawdown':<30} {max_dd_pct:<15.2f}%")
    print(f"  {'% of time in market':<30} {signal_pct:<15.1f}%")

coins = [
    ("PENGUIN", "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt"),
    ("USELESS", "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/eff90cfc-2b71-4fb9-8814-b92e1b0e9e90.txt"),
    ("PUDGY",   "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt"),
]

for name, filepath in coins:
    prices = load_prices(filepath)
    print(f"\n\n{'='*80}")
    print(f"{'='*80}")
    print(f"  {name}")
    print(f"{'='*80}")
    analyze_strategy(prices, 5,  "5-HOUR EMA TREND FOLLOW")
    analyze_strategy(prices, 10, "10-HOUR EMA TREND FOLLOW")
    analyze_strategy(prices, 20, "20-HOUR EMA TREND FOLLOW")

# Summary table
print(f"\n\n{'='*80}")
print(f"S U M M A R Y   T A B L E")
print(f"{'='*80}")
print(f"\n  {'Coin':<12} {'Period':<12} {'Win Rate':<12} {'Sharpe':<12} {'Return':<14} {'B&H':<12} {'vs B&H':<12} {'MaxDD':<12} {'ProfitF':<12} {'AvgHold':<12}")
print(f"  {'-'*120}")

results = []
for name, filepath in coins:
    prices = load_prices(filepath)
    bh = (prices[-1] / prices[0] - 1) * 100
    for period, label in [(5, "5h"), (10, "10h"), (20, "20h")]:
        log_prices = [math.log(p) for p in prices]
        log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
        ema_vals = ema(prices, period)
        
        trades = []
        in_pos = False
        entry = 0
        for i in range(1, len(prices)):
            if prices[i] > ema_vals[i] and not in_pos:
                in_pos = True
                entry = i
            elif prices[i] <= ema_vals[i] and in_pos:
                in_pos = False
                r = math.exp(sum(log_returns[entry:i])) - 1
                trades.append((r, i-entry))
        if in_pos:
            r = math.exp(sum(log_returns[entry:])) - 1
            trades.append((r, len(prices)-1-entry))
        
        if not trades:
            continue
        
        win = len([t for t in trades if t[0] > 0]) / len(trades) * 100
        avg_hold = statistics.mean([t[1] for t in trades])
        avg_hold_str = f"{avg_hold:.0f}h"
        total_r = math.prod([1+t[0] for t in trades]) - 1
        
        strat_ret = []
        for i in range(1, len(prices)):
            if prices[i] > ema_vals[i]:
                strat_ret.append(log_returns[i])
            else:
                strat_ret.append(0.0)
        sm = statistics.mean(strat_ret)
        ss = statistics.stdev(strat_ret)
        sharpe = (sm/ss)*math.sqrt(24*365) if ss > 0 else 0
        
        # MaxDD
        cum = 0
        peaks = -1e9
        dd = 0
        for r in strat_ret:
            cum += r
            peaks = max(peaks, cum)
            dd = min(dd, cum - peaks)
        maxdd = (math.exp(dd)-1)*100
        
        # Profit factor
        wins = [t[0] for t in trades if t[0] > 0]
        losses = [t[0] for t in trades if t[0] <= 0]
        pf = sum(wins) / abs(sum(losses)) if losses else 99
        
        vs_bh = total_r*100 - bh
        
        print(f"  {name:<12} {label:<12} {win:<12.1f} {sharpe:<12.2f} {total_r*100:<+12.2f}% {bh:<+12.2f}% {vs_bh:<+12.2f}% {maxdd:<12.2f}% {pf:<12.2f} {avg_hold_str:<12}")
