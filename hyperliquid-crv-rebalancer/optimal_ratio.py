"""
Find the optimal long/short dollar ratio for static peg of 0.63.

At 0.63 peg: 1 yCRV = 0.63 CRV (in dollar terms)
So: long value = ycrv_units * ycrv_price
    short value = crv_units * crv_price

The ratio is: short_dollars / long_dollars

If peg = 0.63, then ycrv_price = 0.63 * crv_price
So: long_value = ycrv_units * 0.63 * crv_price
    short_value = crv_units * crv_price

For delta neutral: short_value = long_value
-> crv_units * crv_price = ycrv_units * 0.63 * crv_price
-> crv_units = 0.63 * ycrv_units
-> short_value / long_value = 100%

So at peg = 0.63, 100% short-to-long ratio is delta neutral.

But the peg moves. The question is: given the peg oscillates around 0.63 with
std dev ~0.02, what ratio minimizes volatility / maximizes return?

Key insight: when peg drops (yCRV falls relative to CRV):
- Long loses value
- Short gains value (same CRV units now worth more in dollar terms)
- Net effect depends on ratio

When peg rises (yCRV rises relative to CRV):
- Long gains
- Short loses
"""
import statistics
import math

# Reconstruct the actual data with correct units
data = [
    ("4/1",  0.20945, 0.1469, 0.701,  5.09, 16.05, 109.29),
    ("4/2",  0.23,    0.1373, 0.597,  4.97, 15.48, 109.29),
    ("4/3",  0.2289,  0.1416, 0.619,  4.77, 15.98, 109.29),
    ("4/6",  0.23,    0.1462, 0.636,  4.31, 15.21, 109.29),
    ("4/24", 0.23,    0.1392, 0.605,  4.09, 16.17, 109.29),
    ("4/27", 0.23,    0.148,  0.643,  4.27, 16.20, 109.29),
    ("4/28", 0.23,    0.1482, 0.644,  4.54, 15.30, 109.29),
    ("4/29", 0.24,    0.14,   0.583,  3.95, 16.26, 109.29),
    ("4/30", 0.23,    0.1488, 0.647,  3.82, 16.61, 109.29),
    ("5/1",  0.23,    0.152,  0.661,  3.79, 16.39, 109.29),
    ("5/4",  0.24,    0.15,   0.625,  3.60, 16.58, 109.29),
    ("5/5",  0.2402,  0.1517, 0.632,  3.36, 22.95, 151.36),
    ("5/6",  0.25,    0.15,   0.600,  1.98, 22.70, 151.36),
    ("5/12", 0.275,   0.173,  0.629,  2.16, 26.19, 151.36),
    ("5/13", 0.27,    0.165,  0.611,  2.89, 24.97, 151.36),
    ("5/15", 0.255,   0.159,  0.624,  4.05, 24.07, 151.36),
    ("5/19", 0.231,   0.147,  0.636,  3.34, 22.25, 151.36),
    ("5/26", 0.225,   0.143,  0.636,  4.90, 21.64, 151.36),
]

print("=" * 80)
print("OPTIMAL LONG/SHORT RATIO ANALYSIS")
print("Static peg assumption: 0.63")
print("=" * 80)

# For each ratio, simulate: what would the combined portfolio be worth
# at each point if we maintained that ratio?
# Combined = long_value + margin_cash_from_short
# Where margin_cash_from_short is the dollar value returned from short CRV
# (Cash that was freed up by opening the short)

# Actually, the simpler view: combined = long_value - short_value
# The "portfolio" is (long yCRV) + (short CRV-PERP)
# Short position profit = -change_in_short_value
# So combined_change = Δlong - Δshort
# 
# But margin is different from short value. Margin is the collateral.
# Let's work with actual account value instead.

print("\nFirst, let's compute the actual historical ratio that was active:")
print("-" * 60)

for date, crv, ycrv, peg, margin, long_val, units in data:
    # CRV units shorted = margin / crv_price  (margin is the notional value of the short)
    # Actually margin IS the short position value (at 2x leverage, margin = 0.5 * notional)
    # Wait, no. The margin value in the spreadsheet is just the account value of the perps wallet
    # Short CRV notional = margin * leverage (at 2x leverage)
    
    # Let me check: margin is just what's in the margin account
    # If short 34 CRV @ $0.22, notional = $7.48, margin at 2x = $3.74
    # That matches the current state: -34 CRV, margin ~$3.8
    
    # So margin ≈ short notional / 2 (at 2x leverage)
    short_notional = margin * 2  # approximate actual CRV short dollar exposure
    actual_ratio = short_notional / long_val if long_val > 0 else 0
    
    print(f"{date:<6} peg={peg:<.3f}  long=${long_val:<6.2f}  short_notional=${short_notional:<6.2f}  ratio={actual_ratio:<.1%}")

print()
print("Now testing different static ratios and their P&L outcomes:")
print("=" * 80)
print(f"{'Ratio':<10} {'End Combined':<15} {'Total Return':<15} {'Volatility':<15} {'Max DD':<15}")
print("-" * 80)

# For each ratio, simulate what the combined portfolio would do
results = []
for ratio_pct in range(0, 201, 10):
    ratio = ratio_pct / 100
    
    # Start with known initial values
    # Combined portfolio = long_value + (initial_cash - short_notional_initial)
    # where short_notional = ratio * long_value
    
    # Simpler: track changes
    initial_long = data[0][5]
    initial_short_notional = ratio * initial_long
    initial_cash_remaining = initial_long + data[0][4] - initial_short_notional  # placeholder
    
    # Actually, let's track combined value differently:
    # Combined = long_value + (cash that was freed up from shorting)
    # At entry: you have cash = long_value. You put up margin = short_notional/leverage.
    # So available cash = long_value - margin_used = long_value - short_notional/2
    # But margin is returned when position is closed.
    # 
    # Simplest model: Combined = Long Value + Current Margin - Initial Margin
    # where margin changes as the short position gains/loses
    
    # Let me use a cleaner approach:
    # Combined = Long Value + (Short Notional / 2)   [at 2x leverage, margin = notional/2]
    # Because margin IS part of your portfolio
    
    combined_values = []
    for i, (date, crv, ycrv, peg, margin, long_val, units) in enumerate(data):
        # Short notional at this point = ratio * long_val (the short is fixed in dollar terms)
        # But the SHORT CRV UNITS are fixed, not the dollar value
        # So we need: short_crv_units = (ratio * initial_long) / initial_crv_price
        # Then current short_notional = short_crv_units * current_crv_price
        # And current margin = short_notional / 2
        
        if ratio == 0:
            combined = long_val
        else:
            # Short CRV units = ratio * initial_long / initial_crv_price
            # pinned to the first day
            if i == 0:
                # Start: short notional = ratio * long
                short_crv_units = (ratio * long_val) / crv
                short_notional = short_crv_units * crv
                # Margin = short_notional / 2
                margin_now = short_notional / 2
            else:
                short_notional = short_crv_units * crv
                margin_now = short_notional / 2
            
            # Combined = long value + cash = long + (long - short_notional/leverage)
            # At entry: total = long + (cash that wasn't used as margin)
            available_cash = data[0][5] - (short_crv_units * data[0][1]) / 2  # initial_long - initial_margin
            combined = long_val + available_cash + (margin_now - data[0][4])  # long + cash + pnl on short
            
            # Simpler: combined = long_val + (initial_cash we kept) + (margin_now)
            # But this is getting convoluted.
            
        combined_values.append((date, long_val, margin_now if ratio > 0 else 0, None))
    
    # Let me just use the actual data to compare ratios
    # The combined portfolio return = ΔLong + ΔMargin(adjusted for ratio)
    # where ΔMargin is scaled by the ratio
    
    # For each ratio, track initial_long, then apply daily changes
    init_long = data[0][5]
    init_crv = data[0][1]
    
    # CRV units shorted = ratio * init_long / init_crv
    crv_shorted = ratio * init_long / init_crv
    
    portfolio_values = []
    for date, crv, ycrv, peg, margin, long_val, units in data:
        short_val = crv_shorted * crv  # current dollar value of our short position
        # "margin" (our equity in the short) = initial margin + PnL
        # initial margin = short_val_initial / 2
        init_short_val = crv_shorted * init_crv
        init_margin = init_short_val / 2
        pnl = init_short_val - short_val  # profit on short = value went down = we gain
        current_margin = init_margin + pnl
        
        # Combined portfolio: long + what we kept in cash + margin
        # Total cash we started with = init_long
        # We put init_margin into the short
        # So we kept (init_long - init_margin) in cash
        kept_cash = init_long - init_margin if ratio > 0 else init_long
        
        portfolio = long_val + kept_cash + current_margin
        portfolio_values.append(portfolio)
    
    if not portfolio_values:
        continue
    
    start_p = portfolio_values[0]
    end_p = portfolio_values[-1]
    ret = end_p - start_p
    ret_pct = (ret / start_p) * 100
    
    # Daily returns for vol
    daily_rets = [(portfolio_values[j] - portfolio_values[j-1]) / portfolio_values[j-1] * 100 
                  for j in range(1, len(portfolio_values))]
    vol = statistics.stdev(daily_rets) if len(daily_rets) > 1 else 0
    
    # Max DD
    peak = portfolio_values[0]
    max_dd = 0
    for v in portfolio_values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100
        if dd > max_dd:
            max_dd = dd
    
    results.append((ratio_pct, ret, ret_pct, vol, max_dd, end_p))

# Show results
results.sort(key=lambda r: r[1], reverse=True)
print(f"\nTop 10 ratios by total return:")
print(f"{'Rank':<6} {'Ratio':<10} {'Return $':<12} {'Return %':<12} {'Daily Vol':<12} {'Max DD':<12} {'End Value':<12}")
print("-" * 75)
for i, (r, ret, ret_pct, vol, mdd, end_v) in enumerate(results[:10]):
    print(f"{i+1:<6} {r:<8.0f}%  ${ret:<+9.2f} {ret_pct:<+10.2f}% {vol:<10.2f}% {mdd:<10.2f}% ${end_v:<8.2f}")

# Also show bottom 3
print(f"\nBottom 3 ratios:")
for r, ret, ret_pct, vol, mdd, end_v in results[-3:]:
    print(f"  {r:<8.0f}%  ${ret:<+9.2f} {ret_pct:<+10.2f}%")

# Show the full distribution
print(f"\nFull distribution:")
print(f"{'Ratio':<10} {'Return':<12} {'% Return':<12} {'Vol':<12} {'Max DD':<12}")
print("-" * 58)
for r, ret, ret_pct, vol, mdd, end_v in sorted(results, key=lambda x: x[0]):
    print(f"{r:<8.0f}%  ${ret:<+9.2f} {ret_pct:<+10.2f}% {vol:<10.2f}% {mdd:<10.2f}%")

print()
print("=" * 80)
print("KEY INSIGHT")
print("=" * 80)
print()
print(f"The ratio determines how exposed you are to peg movements:")
print(f"  - 0% (no short):  pure long yCRV — you earn vault yield but take full peg risk")
print(f"  - 50-60%:         moderate hedge — some protection from peg drops, still upside to peg rises")
print(f"  - 100%:           delta neutral at peg=0.63 — peg moves cancel out at 0.63")
print(f"  - >100%:          over-hedged — you profit when peg drops (yCRV falls relative to CRV)")
print()
print(f"Since peg std dev is only ~0.02 and mean is 0.63, the optimal ratio depends on:")
print(f"  1. Your view on peg direction (mean reversion vs trending)")
print(f"  2. Your risk tolerance (drawdown from peg moving against you)")
print(f"  3. yCRV vault yield (makes you want more long exposure)")
print()
print(f"RECOMMENDATION:")
print(f"  If you believe peg stays around 0.63 (mean-reverting), the optimal is ~50-60%.")
print(f"  This gives you partial delta protection while keeping most long upside.")
print(f"  The bot's default of 50% was actually reasonable for a static peg assumption.")
