"""
PUDGY Penguins — refined margin analysis for Hyperliquid.
Optimize leverage levels (1x to 5x) for the best PUDGY strategies.
"""
import json, math, statistics

filepath = "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt"

def load_prices(filepath):
    with open(filepath) as f:
        raw = f.read()
    data = json.loads(raw)
    return [p[1] for p in data["prices"]]

prices = load_prices(filepath)
bh = (prices[-1] / prices[0] - 1) * 100

def ema(series, period):
    result = []
    mult = 2 / (period + 1)
    ema_val = series[0]
    for s in series:
        ema_val = (s - ema_val) * mult + ema_val
        result.append(ema_val)
    return result

def backtest(prices, period, entry_pct, exit_pct, go_long, leverage):
    log_prices = [math.log(p) for p in prices]
    log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
    ema_vals = ema(prices, period)
    
    capital = 10000
    peak_capital = 10000
    max_dd = 0
    liq_count = 0
    liq_threshold = 1 / leverage  # e.g. 2x → 50% drop
    
    equity_curve = [10000]
    
    in_pos = False
    trades = []
    entry_capital = 10000
    entry_price = 0
    liq_price = 0
    
    for i in range(1, len(prices)):
        entry_signal = prices[i] > ema_vals[i] * (1 + entry_pct / 100) if go_long else prices[i] < ema_vals[i] * (1 - entry_pct / 100)
        exit_signal = prices[i] < ema_vals[i] * (1 - exit_pct / 100) if go_long else prices[i] > ema_vals[i] * (1 + exit_pct / 100)
        
        if entry_signal and not in_pos:
            in_pos = True
            entry_capital = capital
            entry_price = prices[i]
            liq_price = entry_price * (1 - liq_threshold) if go_long else entry_price * (1 + liq_threshold)
        
        elif in_pos:
            # Check liquidation
            if (go_long and prices[i] <= liq_price) or (not go_long and prices[i] >= liq_price):
                capital = entry_capital * (1 - liq_threshold + 0.05)  # 5% penalty
                trades.append((-1, i, "LIQUIDATED"))
                in_pos = False
                liq_count += 1
            elif exit_signal:
                raw_return = (prices[i] / entry_price - 1) if go_long else (entry_price / prices[i] - 1)
                leveraged_return = raw_return * leverage
                capital = entry_capital * (1 + leveraged_return)
                trades.append((leveraged_return, i, "EXIT"))
                in_pos = False
        
        current_equity = capital
        if in_pos:
            current_return = (prices[i] / entry_price - 1) if go_long else (entry_price / prices[i] - 1)
            current_equity = entry_capital * (1 + current_return * leverage)
        
        equity_curve.append(current_equity)
        peak_capital = max(peak_capital, current_equity)
        dd = (current_equity - peak_capital) / peak_capital * 100
        max_dd = min(max_dd, dd)
    
    total_return = (capital / 10000 - 1) * 100
    
    # Equity curve Sharpe
    eq_returns = [math.log(equity_curve[j] / equity_curve[j-1]) for j in range(1, len(equity_curve))]
    sr_mean = statistics.mean(eq_returns)
    sr_std = statistics.stdev(eq_returns)
    sharpe = (sr_mean / sr_std) * math.sqrt(24 * 365) if sr_std > 0 else 0
    
    return {
        "return": total_return,
        "sharpe": sharpe,
        "max_dd": max_dd,
        "final": capital,
        "liquidations": liq_count,
        "trades": len(trades),
    }

strategies = [
    ("Frequent 3h/0%/0%", 3, 0.0, 0.0),
    ("Sweet spot 3h/1%/1.5%", 3, 1.0, 1.5),
    ("Moderate 5h/1%/2%", 5, 1.0, 2.0),
    ("Rare 51h/5%/5%", 51, 5.0, 5.0),
    ("7h/2%/2%", 7, 2.0, 2.0),
]

leverages = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]

print("=" * 100)
print("PUDGY PENGUINS — MARGIN ANALYSIS FOR HYPERLIQUID")
print(f"Buy & Hold (1x): {bh:+.1f}%  |  Daily Vol: ~4.9%")
print("=" * 100)

for strat_name, period, ep, xp in strategies:
    print(f"\n{'─'*100}")
    print(f"  STRATEGY: {strat_name}")
    print(f"{'─'*100}")
    print(f"  {'Leverage':<12} {'Return':<12} {'Sharpe':<10} {'MaxDD':<12} {'$10k→':<14} {'Liq?':<8} {'Risk':<20}")
    print(f"  {'-'*80}")
    
    for lev in leverages:
        r = backtest(prices, period, ep, xp, True, lev)
        
        if r["liquidations"] > 0:
            liq_str = f"💀 x{r['liquidations']}"
            risk = "LIQUIDATED"
        elif r["max_dd"] < -50:
            liq_str = "⚠️ "
            risk = "Margin call zone"
        elif r["max_dd"] < -33:
            liq_str = "⚠️ "
            risk = "High risk"
        elif r["max_dd"] < -20:
            liq_str = "  "
            risk = "Moderate risk"
        elif r["max_dd"] < -10:
            liq_str = "✅"
            risk = "Low risk"
        else:
            liq_str = "✅"
            risk = "Very safe"
        
        final_str = f"${r['final']:,.0f}" if r['final'] > 0 else "$0"
        print(f"  {lev:<12}x {r['return']:<+10.2f}% {r['sharpe']:<10.2f} {r['max_dd']:<10.2f}% {final_str:<14} {liq_str:<8} {risk:<20}")

# ==== PICK THE BEST ====
print(f"\n\n{'='*100}")
print("BEST RECOMMENDATION FOR EACH LEVERAGE LEVEL")
print("=" * 100)

print(f"\n  {'Leverage':<12} {'Best Strategy':<30} {'Return':<12} {'MaxDD':<12} {'$10k→':<14}")
print(f"  {'-'*80}")

for lev in [1.0, 1.5, 2.0, 2.5, 3.0]:
    best = None
    best_r = None
    for strat_name, period, ep, xp in strategies:
        r = backtest(prices, period, ep, xp, True, lev)
        if r["liquidations"] == 0 and r["max_dd"] > -50:
            if best_r is None or r["sharpe"] > best_r["sharpe"]:
                best = {"name": strat_name, "period": period, "entry": ep, "exit": xp}
                best_r = r
    
    if best and best_r:
        print(f"  {lev:<12}x {best['name']:<30} {best_r['return']:<+10.2f}% {best_r['max_dd']:<10.2f}% ${best_r['final']:,.0f}")

# ==== DRAWDOWN DETAIL FOR THE SWEET SPOT ====
print(f"\n\n{'='*100}")
print("DRAWDOWN ANALYSIS — Sweet Spot 3h/1%/1.5% at Various Leverages")
print("=" * 100)

for lev in [1.0, 1.5, 2.0, 2.5, 3.0]:
    r = backtest(prices, 3, 1.0, 1.5, True, lev)
    max_loss_pct = abs(r["max_dd"])
    cushion_pct = (1 / lev * 100) - max_loss_pct  # How far from liquidation
    cushion_str = f"{cushion_pct:.1f}%" if cushion_pct > 0 else "NONE — OVER LIMIT"
    
    print(f"\n  {lev:.1f}x Leverage:")
    print(f"    Return:         {r['return']:+.2f}%")
    print(f"    Max Drawdown:   {r['max_dd']:.2f}%")
    print(f"    Liq threshold:  {1/lev*100:.1f}% adverse move")
    print(f"    Room to liq:    {cushion_str}")
    print(f"    Verdict:        ", end="")
    if r["liquidations"] > 0:
        print("💀 LIQUIDATED")
    elif cushion_pct < 5:
        print("⚠️  Too close to liquidation — 1 bad candle wipes you")
    elif cushion_pct < 15:
        print("⚡ Manageable but watch your position")
    else:
        print("✅ Comfortable buffer")

# ==== WHAT-IF: PUDGY DAILY SIMULATION ====
print(f"\n\n{'='*100}")
print("WHAT IF... PUDGY has a bad day? (stress test)")
print("=" * 100)

daily_vol = 0.049

print(f"\n  {'Leverage':<12} {'Max adverse move before liq':<35} {'Like...':<40}")
print(f"  {'-'*80}")
for lev in [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]:
    liq_move = 1 / lev * 100
    sigma = liq_move / daily_vol / 100
    approx_freq = math.exp(-sigma**2 / 2) / (sigma * math.sqrt(2 * math.pi)) * 2 * 100
    freq_days = 1 / (approx_freq / 100) if approx_freq > 0 and sigma < 8 else float('inf')
    
    if freq_days == float('inf'):
        freq_str = "Never — >10σ event"
    elif freq_days > 365 * 1000:
        freq_str = "1 in >1000 years"
    elif freq_days > 365:
        freq_str = f"1 in {freq_days/365:.0f} years"
    elif freq_days > 30:
        freq_str = f"1 in {freq_days/365:.1f} years"
    else:
        freq_str = f"1 in {freq_days:.0f} days"
    
    print(f"  {lev:<12}x {liq_move:<10.1f}% ({liq_move/daily_vol/100:.1f}σ){'':15} {freq_str:<40}")
