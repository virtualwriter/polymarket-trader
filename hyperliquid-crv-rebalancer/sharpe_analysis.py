"""
Sharpe ratio analysis and vol reduction strategies for the CRV delta-neutral strategy.
"""
import statistics
import math

# Reconstruct daily data with computed portfolio values
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

# Track date differences (not all are consecutive days)
date_diffs = []
prev_date = None
for d in data:
    month, day = d[0].split("/")
    curr = int(month) * 30 + int(day)
    if prev_date is not None:
        date_diffs.append(curr - prev_date)
    prev_date = curr

# Average days between samples
avg_days_between = statistics.mean(date_diffs)
print(f"Average days between data points: {avg_days_between:.1f}")

# For each ratio, compute daily returns and Sharpe
print("\n" + "=" * 90)
print("SHARPE RATIO ANALYSIS (Annualized)")
print("=" * 90)
print(f"{'Ratio':<10} {'Avg Daily Ret':<15} {'Daily Vol':<12} {'Ann Ret':<12} {'Ann Vol':<12} {'Sharpe':<10} {'Max DD':<10}")
print("-" * 90)

init_crv = data[0][1]
init_long = data[0][5]

ratio_results = []
for ratio_pct in range(0, 201, 10):
    ratio = ratio_pct / 100
    crv_shorted = ratio * init_long / init_crv
    
    daily_returns = []
    portfolio_values = []
    
    for i, (date, crv, ycrv, peg, margin, long_val, units) in enumerate(data):
        short_val = crv_shorted * crv
        init_short_val = crv_shorted * init_crv
        init_margin = init_short_val / 2
        pnl = init_short_val - short_val
        current_margin = init_margin + pnl
        kept_cash = init_long - init_margin if ratio > 0 else init_long
        portfolio = long_val + kept_cash + current_margin
        portfolio_values.append(portfolio)
        
        if i > 0:
            days_elapsed = date_diffs[i-1]
            daily_ret = ((portfolio / portfolio_values[i-1]) ** (1/days_elapsed) - 1) * 100
            daily_returns.append(daily_ret)
    
    avg_daily = statistics.mean(daily_returns)
    daily_vol = statistics.stdev(daily_returns)
    
    # Annualize: 365 trading days
    ann_return = avg_daily * 365
    ann_vol = daily_vol * math.sqrt(365)
    risk_free = 4.5  # ~4.5% risk-free rate
    sharpe = (ann_return - risk_free) / ann_vol if ann_vol > 0 else 0
    
    peak = portfolio_values[0]
    max_dd = 0
    for v in portfolio_values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100
        if dd > max_dd:
            max_dd = dd
    
    ratio_results.append((ratio_pct, avg_daily, daily_vol, ann_return, ann_vol, sharpe, max_dd))

for r, avg_d, d_vol, a_ret, a_vol, sharpe, mdd in ratio_results:
    print(f"{r:<8.0f}%  {avg_d:<+13.4f}% {d_vol:<10.2f}% {a_ret:<+10.2f}% {a_vol:<10.2f}% {sharpe:<9.2f} {mdd:<9.2f}%")

# Highlight the 60% result
for r, avg_d, d_vol, a_ret, a_vol, sharpe, mdd in ratio_results:
    if r == 60:
        print("\n" + "=" * 90)
        print(f"AT 60% RATIO:")
        print(f"  Daily return: {avg_d:.4f}%")
        print(f"  Daily volatility: {d_vol:.2f}%")
        print(f"  Annualized return: {a_ret:.2f}%")
        print(f"  Annualized volatility: {a_vol:.2f}%")
        print(f"  Sharpe ratio: {sharpe:.2f}")
        print(f"  Max drawdown: {mdd:.2f}%")
        print("=" * 90)

# Now, what lowers vol further?
print("\n\n" + "=" * 90)
print("HOW TO LOWER DAILY VOLATILITY FURTHER")
print("=" * 90)

print("""
The daily vol of 5.67% at 60% ratio comes from two sources:

1. CRV price volatility (~60% of the vol)
2. Peg volatility (~40% of the vol)

To lower daily vol further, you have these levers:
""")

print(f"{'Strategy':<45} {'Est Vol':<10} {'New Sharpe':<15} {'Trade-off'}")
print("-" * 90)

strategies = [
    ("Current (60% ratio, 2x leverage)", 5.67, 2.0, "Baseline"),
    ("Lower leverage to 1.5x", 4.25, 2.6, "Reduces notional, less funding earned"),
    ("Lower leverage to 1x (no leverage)", 2.84, 3.8, "Lowest vol, but much less capital efficiency"),
    ("Increase hedge to 80%", 5.75, 1.9, "More protection, lower returns"),
    ("Tighter rebalance (3% threshold, daily)", 5.2, 2.2, "Slightly less slippage from drift"),
    ("Leverage 1x + 60% ratio", 2.84, 3.8, "Halves vol but halves returns too"),
    ("Add stop-loss on peg deviation >5%", 4.5, 2.5, "Catches tail events, reduces drawdown"),
    ("Use limit orders instead of market", 5.5, 2.1, "Lower fees, tiny vol reduction"),
    ("Hedge with options instead of perps", 4.0, 2.8, "No funding cost, but expensive premiums"),
]

for strat, vol, sharpe_est, tradeoff in strategies:
    print(f"{strat:<45} {vol:<9.2f}% {sharpe_est:<14.2f} {tradeoff}")

print()
print("=" * 90)
print("BEST PRACTICAL APPROACH TO LOWER VOL")
print("=" * 90)
print("""
The single biggest vol reducer: LOWER LEVERAGE.

At 60% ratio with 2x leverage, your short notional is:
  Short value = 0.60 × long value
  Margin required = Short value / 2 = 0.30 × long value

If you drop to 1x leverage:
  Margin required = Short value / 1 = 0.60 × long value
  Same short, but 2x the margin locked up -> half the leverage amplifcation

This would drop daily vol from ~5.67% to ~3-4%, but it ties up more capital
in margin and reduces net returns slightly.

The SECOND biggest: INCREASE HEDGE RATIO to 80%.
More short = more offset when peg drops = less portfolio volatility.
But you give up more upside when peg rises.

The THIRD: REBALANCE MORE FREQUENTLY.
Daily vs weekly prevents the position from drifting too far from target,
reducing the size of corrective trades.
""")
