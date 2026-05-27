"""
Simulate 2x margin on the best USELESS and PENGUIN strategies.
Shows how leverage changes: return, drawdown, liquidation risk, margin call scenarios.
"""
import json, math, statistics

coins = {
    "USELESS (LONG)": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/eff90cfc-2b71-4fb9-8814-b92e1b0e9e90.txt",
        "go_long": True,
        "strategies": [
            ("Frequent 3h/0%/0%", 3, 0.0, 0.0),
            ("Moderate 3h/2%/1.5%", 3, 2.0, 1.5),
            ("Rare 3h/2%/2%", 3, 2.0, 2.0),
            ("7h/0%/1%", 7, 0.0, 1.0),
        ],
    },
    "PENGUIN (SHORT)": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt",
        "go_long": False,
        "strategies": [
            ("Short 11h/10%/5%", 11, 10.0, 5.0),
            ("Short 3h/5%/0%", 3, 5.0, 0.0),
        ],
    },
    "PUDGY (LONG)": {
        "file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt",
        "go_long": True,
        "strategies": [
            ("Frequent 3h/0%/0%", 3, 0.0, 0.0),
            ("Sweet spot 3h/1%/1.5%", 3, 1.0, 1.5),
            ("Rare 51h/5%/5%", 51, 5.0, 5.0),
        ],
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

def backtest_with_margin(prices, period, entry_pct, exit_pct, go_long, leverage, initial_capital=10000):
    """Simulate the strategy on margin. Track equity curve, liquidations, margin calls."""
    log_prices = [math.log(p) for p in prices]
    log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
    simple_returns = [prices[i] / prices[i-1] - 1 for i in range(1, len(prices))]
    ema_vals = ema(prices, period)
    
    # Margin parameters
    liq_threshold = 1 / leverage  # e.g. 2x → 50% drop = liquidation
    margin_used = initial_capital * leverage
    maintenance = margin_used * 0.05  # 5% maintenance margin on Hyperliquid
    
    capital = initial_capital
    peak_capital = initial_capital
    min_capital = initial_capital
    max_dd = 0
    equity_curve = [initial_capital]
    
    in_pos = False
    trades = []
    entry_capital = initial_capital
    entry_price = 0
    liq_price = 0
    liquidated = False
    
    for i in range(1, len(prices)):
        idx = i - 1
        
        if go_long:
            entry_signal = prices[i] > ema_vals[i] * (1 + entry_pct / 100)
            exit_signal = prices[i] < ema_vals[i] * (1 - exit_pct / 100)
        else:
            entry_signal = prices[i] < ema_vals[i] * (1 - entry_pct / 100)
            exit_signal = prices[i] > ema_vals[i] * (1 + exit_pct / 100)
        
        if entry_signal and not in_pos and not liquidated:
            # Enter position
            in_pos = True
            entry_capital = capital
            entry_price = prices[i]
            
            # Position size = capital * leverage
            position_notional = capital * leverage
            
            if go_long:
                # Long liq price: if price drops below entry * (1 - 1/leverage)
                liq_price = entry_price * (1 - liq_threshold)
            else:
                # Short liq price: if price rises above entry * (1 + 1/leverage)
                liq_price = entry_price * (1 + liq_threshold)
        
        elif in_pos and not liquidated:
            # Check for liquidation
            if (go_long and prices[i] <= liq_price) or (not go_long and prices[i] >= liq_price):
                # LIQUIDATED
                capital = entry_capital * (1 - liq_threshold + 0.05)  # 5% penalty
                trade_r = -1 * (1 - liq_threshold)
                trades.append((trade_r, i - entry_idx if 'entry_idx' in dir() else 0, "LIQUIDATED"))
                in_pos = False
                liquidated = True
            
            elif exit_signal:
                # Normal exit
                in_pos = False
                raw_return = (prices[i] / entry_price - 1) if go_long else (entry_price / prices[i] - 1)
                leveraged_return = raw_return * leverage
                trade_r = leveraged_return
                capital = entry_capital * (1 + leveraged_return)
                trades.append((trade_r, i - entry_idx if 'entry_idx' in dir() else 0, "EXIT"))
        
        # Track equity
        if in_pos and not liquidated:
            current_return = (prices[i] / entry_price - 1) if go_long else (entry_price / prices[i] - 1)
            unrealized_pnl = entry_capital * current_return * leverage
            current_equity = entry_capital + unrealized_pnl
        else:
            current_equity = capital
        
        equity_curve.append(current_equity)
        peak_capital = max(peak_capital, current_equity)
        dd = (current_equity - peak_capital) / peak_capital * 100
        max_dd = min(max_dd, dd)
        min_capital = min(min_capital, current_equity)
    
    total_return_pct = (capital / initial_capital - 1) * 100
    
    # Compute Sharpe on equity curve returns
    equity_returns = [math.log(equity_curve[j] / equity_curve[j-1]) for j in range(1, len(equity_curve))]
    sr_mean = statistics.mean(equity_returns)
    sr_std = statistics.stdev(equity_returns)
    sharpe = (sr_mean / sr_std) * math.sqrt(24 * 365) if sr_std > 0 else 0
    
    num_liqs = sum(1 for t in trades if t[2] == "LIQUIDATED")
    
    return {
        "total_return": total_return_pct,
        "sharpe": sharpe,
        "max_dd": max_dd,
        "min_capital": min_capital,
        "final_capital": capital,
        "trades": len(trades),
        "liquidations": num_liqs,
        "survived": not liquidated,
    }

for name, coin in coins.items():
    prices = load_prices(coin["file"])
    go_long = coin["go_long"]
    bh = (prices[-1] / prices[0] - 1) * 100
    
    sep = "=" * 90
    print(f"\n{sep}")
    print(f"{name}")
    print(f"Buy & Hold (1x): {bh:+.1f}%")
    print(f"{sep}")
    
    for strat_name, period, ep, xp in coin["strategies"]:
        print(f"\n  ┌── {strat_name} ──┐")
        print(f"  {'':5} {'1x (Cash)':>15} {'2x (Margin)':>15} {'Difference':>15}")
        print(f"  {'-'*50}")
        
        r1x = backtest_with_margin(prices, period, ep, xp, go_long, 1.0)
        r2x = backtest_with_margin(prices, period, ep, xp, go_long, 2.0)
        
        lines = [
            ("Total Return", f"{r1x['total_return']:+.2f}%", f"{r2x['total_return']:+.2f}%", f"{r2x['total_return']-r1x['total_return']:+.2f}%"),
            ("Sharpe", f"{r1x['sharpe']:.2f}", f"{r2x['sharpe']:.2f}", f"{r2x['sharpe']-r1x['sharpe']:+.2f}"),
            ("Max Drawdown", f"{r1x['max_dd']:.2f}%", f"{r2x['max_dd']:.2f}%", f"{r2x['max_dd']-r1x['max_dd']:+.2f}%"),
            ("Final Capital ($10k)", f"${r1x['final_capital']:,.0f}", f"${r2x['final_capital']:,.0f}", f"${r2x['final_capital']-r1x['final_capital']:+,.0f}"),
            ("Trades", f"{r1x['trades']}", f"{r2x['trades']}", f"{r2x['trades']-r1x['trades']:+d}"),
            ("Liquidations", f"{r1x['liquidations']}", f"{r2x['liquidations']}", ""),
        ]
        
        for label, v1, v2, v3 in lines:
            print(f"  {label:<20} {v1:>15} {v2:>15} {v3:>15}")
        
        # Risk assessment
        liq_note = ""
        if r2x['liquidations'] > 0:
            liq_note = f"⚠️  {r2x['liquidations']} liquidation(s) occurred — capital destroyed"
        elif r2x['max_dd'] < -50:
            liq_note = "⚠️  Drawdown exceeded 50% — liquidation would have occurred with tighter margin"
        elif r2x['max_dd'] < -20:
            liq_note = "⚠️  Drawdown >20% — high margin call risk"
        elif r2x['max_dd'] < -10:
            liq_note = "⚠️  Drawdown 10-20% — moderate margin call risk"
        else:
            liq_note = "✅  Drawdown manageable for 2x margin"
        
        print(f"  {'Risk':<20} {'':>15} {liq_note:>15}")

# ==== DETAILED LIQUIDATION ANALYSIS ====
print(f"\n\n{sep}")
print("DETAILED LIQUIDATION ANALYSIS — What price move wipes you out?")
print("=" * 90)

for leverage in [1.5, 2.0, 2.5, 3.0]:
    liq_move = (1 / leverage) * 100
    print(f"\n  {leverage}x leverage: {liq_move:.1f}% adverse move = liquidation")
    
    for coin_name, label, vol_type, daily_vol in [
        ("USELESS", "7.4% daily vol", "daily", 7.4),
        ("PUDGY", "4.9% daily vol", "daily", 4.9),
        ("PENGUIN", "14.4% daily vol", "daily", 14.4),
    ]:
        # Probability of a move big enough to liquidate in any given day
        # Using normal approximation: P(|move| > liq_move)
        z = liq_move / daily_vol
        # Approx: P(|Z| > z) for normal
        approx_prob = math.exp(-z**2 / 2) / (z * math.sqrt(2 * math.pi)) * 2 * 100
        days_to_expected = 1 / (approx_prob / 100) if approx_prob > 0 else 999
        
        print(f"    {coin_name} ({vol_type}):")
        print(f"      Daily move needed: {liq_move:.1f}%")
        print(f"      That's a {z:.2f}-sigma event (daily vol={daily_vol}%)")
        print(f"      ≈ {approx_prob:.1f}% chance per day")
        print(f"      Expected 1 liquidation every {days_to_expected:.0f} days")

# ==== BEST STRATEGY WITH 2x ====
print(f"\n\n{sep}")
print("RECOMMENDATION — Best margin strategies")
print("=" * 90)

for name, coin in coins.items():
    prices = load_prices(coin["file"])
    go_long = coin["go_long"]
    
    print(f"\n  {name} with 2x Margin:")
    best_final = 0
    best_strat = None
    
    for strat_name, period, ep, xp in coin["strategies"]:
        r = backtest_with_margin(prices, period, ep, xp, go_long, 2.0)
        if r["liquidations"] == 0 and r["max_dd"] > -50:
            print(f"    ✅ {strat_name}: {r['total_return']:+.2f}% return, {r['max_dd']:.1f}% maxDD, no liq")
            if r['total_return'] > best_final:
                best_final = r['total_return']
                best_strat = strat_name
        elif r["liquidations"] > 0:
            print(f"    ❌ {strat_name}: LIQUIDATED ({r['liquidations']}x)")
        else:
            print(f"    ⚠️  {strat_name}: {r['total_return']:+.2f}% return, {r['max_dd']:.1f}% maxDD (risky)")
    
    if best_strat:
        r = backtest_with_margin(prices, period, ep, xp, go_long, 2.0)
        end = r['final_capital']
        print(f"\n    >> Best: {best_strat} → ${end:,.0f} from $10,000")
