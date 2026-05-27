"""
Compare 5h, 10h, and 20h EMA trend-follow for PENGUIN, USELESS, PUDGY.
"""
import json, math, statistics

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

coins = [
    ("PENGUIN", "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt"),
    ("USELESS", "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/eff90cfc-2b71-4fb9-8814-b92e1b0e9e90.txt"),
    ("PUDGY",   "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt"),
]

# Summary table header
print("=" * 130)
print("EMA TREND-FOLLOW BACKTEST — 90-day hourly data (all coins)")
print("=" * 130)
print(f"\n  {'Coin':<10} {'Period':<10} {'Trades':<10} {'WinRate':<10} {'Sharpe':<10} {'Return':<12} {'B&H':<10} {'vsB&H':<10} {'MaxDD':<10} {'PF':<10} {'AvgHold':<10}")
print(f"  {'-'*110}")

for name, filepath in coins:
    prices = load_prices(filepath)
    
    for period in [5, 10, 20]:
        log_prices = [math.log(p) for p in prices]
        log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
        ema_vals = ema(prices, period)
        
        # Trade simulation
        trades = []
        in_pos = False
        entry = 0
        for i in range(1, len(prices)):
            if prices[i] > ema_vals[i] and not in_pos:
                in_pos = True
                entry = i
            elif prices[i] <= ema_vals[i] and in_pos:
                in_pos = False
                trade_r = math.exp(sum(log_returns[entry:i])) - 1
                trades.append((trade_r, i - entry))
        if in_pos:
            trade_r = math.exp(sum(log_returns[entry:])) - 1
            trades.append((trade_r, len(prices) - 1 - entry))
        
        if not trades:
            continue
        
        win_trades = [t for t in trades if t[0] > 0]
        loss_trades = [t for t in trades if t[0] <= 0]
        win_rate = len(win_trades) / len(trades) * 100
        total_return = math.prod([1 + t[0] for t in trades]) - 1
        avg_hold = statistics.mean([t[1] for t in trades])
        avg_hold_str = f"{avg_hold:.0f}h"
        
        # Strategy return series (for sharpe/maxdd)
        strat_series = []
        for i in range(1, len(prices)):
            idx = i - 1  # log_returns is offset by 1
            if prices[i] > ema_vals[i]:
                strat_series.append(log_returns[idx])
            else:
                strat_series.append(0.0)
        
        sm = statistics.mean(strat_series)
        ss = statistics.stdev(strat_series)
        sharpe = (sm / ss) * math.sqrt(24 * 365) if ss > 0 else 0
        
        # Max drawdown
        cum = 0
        peak = -1e9
        dd = 0
        for r in strat_series:
            cum += r
            peak = max(peak, cum)
            dd = min(dd, cum - peak)
        max_dd_pct = (math.exp(dd) - 1) * 100
        
        # Profit factor
        gross_win = sum(t[0] for t in win_trades) if win_trades else 0
        gross_loss = abs(sum(t[0] for t in loss_trades)) if loss_trades else 1e-10
        pf = gross_win / gross_loss
        
        # B&H
        bh_ret = (prices[-1] / prices[0] - 1) * 100
        vs_bh = total_return * 100 - bh_ret
        
        print(f"  {name:<10} {f'{period}h':<10} {len(trades):<10} {win_rate:<10.1f} {sharpe:<10.2f} {total_return*100:<+10.2f}% {bh_ret:<+10.2f}% {vs_bh:<+10.2f}% {max_dd_pct:<10.2f}% {pf:<10.2f} {avg_hold_str:<10}")

print()
print("=" * 130)
print("KEY:  WinRate  = % of trades that were profitable")
print("      Sharpe   = annualized signal Sharpe ratio")
print("      Return   = total compound return over 90 days")
print("      B&H      = buy-and-hold return")
print("      vsB&H    = strategy outperformance vs buy-and-hold")
print("      MaxDD    = maximum peak-to-trough drawdown")
print("      PF       = profit factor (gross win / gross loss)")
print("      AvgHold  = average trade duration")
print("=" * 130)
