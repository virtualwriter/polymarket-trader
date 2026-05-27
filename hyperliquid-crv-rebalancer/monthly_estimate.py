"""
Project expected monthly earnings for new position based on historical data.
New position: 1,674 yCRV units, 640.5 CRV short at 2x
"""
import statistics

# From historical data, extract:
# 1. yCRV vault yield accrual (daily $ amount)
# 2. Funding earned (daily $ amount)

# Historical data (May only, where we have both vault yield and funding):
# vault_yield_$ and funding_$ are the per-period accruals
historical = [
    # (date range, days, vault_yield, funding, long_val_ycrv)
    # From the spreadsheet rows:
    # "0.34" vault yield appears to be cumulative
    # "0.07" funding appears to be cumulative
    # We need per-period changes
    
    # Let me use the vault yield and funding rows more carefully
    # The cumulative vault yield row: 0.34, 0.34, 0.34, 0.41, 0.41, 0.47, 0.47, 0.56
    # The cumulative funding row:   0.07, 0.07, 0.07, 0.10, 0.11, 0.11, 0.11, 0.13
]

# Better approach: extract per-period changes from the cumulative rows
vault_cum = [0.34, 0.34, 0.34, 0.41, 0.41, 0.47, 0.47, 0.56]  # May 4 to May 26
fund_cum =  [0.07, 0.07, 0.07, 0.10, 0.11, 0.11, 0.11, 0.13]

# Dates and days between
dates = ["5/4", "5/5", "5/6", "5/12", "5/13", "5/15", "5/19", "5/21", "5/26"]
# Days between consecutive dates
day_gaps = [1, 1, 6, 1, 2, 4, 2, 5]

# Per-period vault yield and funding ($)
vault_period = []
fund_period = []
for i in range(1, len(vault_cum)):
    vault_period.append(vault_cum[i] - vault_cum[i-1])
    fund_period.append(fund_cum[i] - fund_cum[i-1])

# yCRV long values over this period
# The 151.36 units started around 5/5-5/6
# Earlier was 109.29 units
# yCRV price varied
ycrv_prices = [0.15, 0.1517, 0.15, 0.173, 0.165, 0.159, 0.147, 0.149, 0.143]

# Long value = units * price
# Before 5/6: 109.29 units
# After 5/6: 151.36 units (old amount before today's add)
units_before = 109.29
units_after = 151.36  # this was the old amount
new_units = 1674.96  # current amount

print("=" * 60)
print("HISTORICAL DAILY EARNINGS (May 4-26)")
print("=" * 60)

# Only look at the period with 151.36 units (index 2+)
daily_yield_rates = []
daily_fund_rates = []

for i in range(len(vault_period)):
    gap = day_gaps[i]
    daily_yield = vault_period[i] / gap
    daily_fund = fund_period[i] / gap
    
    # What was the long value during this period?
    # Index in the period corresponds to dates i+1 in the full array
    period_idx = i + 1
    ycrv_price = ycrv_prices[period_idx]
    
    if period_idx >= 2:  # 151.36 units period
        long_val = units_after * ycrv_price
        daily_yield_rate = daily_yield / long_val * 100  # % per day
        daily_fund_rate = daily_fund / (long_val * 0.60) * 100  # % of short notional per day  
        # Actually funding is per unit of short notional
        short_notional_old = long_val * 0.60
        daily_fund_rate_per_short = daily_fund / short_notional_old * 100 if short_notional_old > 0 else 0
        
        daily_yield_rates.append(daily_yield_rate)
        daily_fund_rates.append(daily_fund_rate_per_short)
        
        print(f"  Period {dates[period_idx-1]}-{dates[period_idx]} ({gap}d): "
              f"yield=${daily_yield:.4f}/d, fund=${daily_fund:.4f}/d, "
              f"long=${long_val:.2f}, short=${short_notional_old:.2f}")

print(f"\n  Average daily vault yield rate: {statistics.mean(daily_yield_rates)*100:.4f}% of long")
print(f"  Average daily funding rate:     {statistics.mean(daily_fund_rates)*100:.4f}% of short notional")

# Now project to new position
print()
print("=" * 60)
print("PROJECTED MONTHLY EARNINGS (30 days)")
print("=" * 60)

new_long = 239.52  # current long value
new_short = 143.76  # current short notional

avg_yield_rate = statistics.mean(daily_yield_rates)  # daily % of long
avg_fund_rate = statistics.mean(daily_fund_rates)    # daily % of short

monthly_yield = new_long * avg_yield_rate * 30
monthly_fund = new_short * avg_fund_rate * 30
monthly_total = monthly_yield + monthly_fund

print(f"  Current long value:  ${new_long:.2f}")
print(f"  Current short notional: ${new_short:.2f}")
print()
print(f"  Daily vault yield rate: {avg_yield_rate*100:.4f}%")
print(f"  Daily funding rate:      {avg_fund_rate*100:.4f}%")
print()
print(f"  Monthly vault yield: ${monthly_yield:.2f}")
print(f"  Monthly funding:     ${monthly_fund:.2f}")
print(f"  ─────────────────────────────")
print(f"  Monthly total:       ${monthly_total:.2f}")
print(f"  Monthly ROI on capital: {monthly_total/311.42*100:.2f}%")
print()

# Alternative: use the actual observed rates from the most recent data
print("=" * 60)
print("RECENT RUN-RATE (last 5 days, May 21-26)")
print("=" * 60)
# May 21-26 = 5 days
# vault yield increased from 0.47 to 0.56 = +$0.09
# funding increased from 0.11 to 0.13 = +$0.02
recent_yield = vault_cum[-1] - vault_cum[-2]  # last change
recent_fund = fund_cum[-1] - fund_cum[-2]
recent_days = 5  # May 21 to May 26

recent_daily_yield = recent_yield / recent_days
recent_daily_fund = recent_fund / recent_days

print(f"  Recent vault yield (5d): ${recent_yield:.2f} (${recent_daily_yield:.4f}/d)")
print(f"  Recent funding (5d):     ${recent_fund:.2f} (${recent_daily_fund:.4f}/d)")

# Scale to current position
# The old long was ~$22, new long is $239.52 (10.9x larger)
# The old short was ~$13, new short is $143.76 (11.0x larger)
scale_long = new_long / 22.50
scale_short = new_short / 13.50

monthly_yield_recent = recent_daily_yield * scale_long * 30
monthly_fund_recent = recent_daily_fund * scale_short * 30

print(f"\n  Scaled to new position ({scale_long:.1f}x long, {scale_short:.1f}x short):")
print(f"  Monthly vault yield: ${monthly_yield_recent:.2f}")
print(f"  Monthly funding:     ${monthly_fund_recent:.2f}")
print(f"  ─────────────────────────────")
print(f"  Monthly total:       ${monthly_yield_recent + monthly_fund_recent:.2f}")

# Simple APR approach
print()
print("=" * 60)
print("SIMPLE APR ESTIMATE")
print("=" * 60)
vault_apr = 0.10  # 10% APR on yCRV
funding_apr = 0.05  # 5% APR on short notional
peg_alpha = 0.02  # 2% edge from mean reversion

monthly_vault = new_long * vault_apr / 12
monthly_funding = new_short * funding_apr / 12
monthly_alpha = new_short * peg_alpha / 12
monthly = monthly_vault + monthly_funding + monthly_alpha

print(f"  yCRV vault (10% APR):   ${monthly_vault:.2f}/mo")
print(f"  Funding (5% APR):       ${monthly_funding:.2f}/mo")
print(f"  Peg edge (2% APR):      ${monthly_alpha:.2f}/mo")
print(f"  ─────────────────────────────")
print(f"  Estimated monthly:      ${monthly:.2f}/mo")
print(f"  (Assumes flat CRV price — no directional P&L)")
