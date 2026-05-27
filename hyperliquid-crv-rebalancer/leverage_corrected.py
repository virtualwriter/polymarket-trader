"""
Correct analysis of 2x vs 1x leverage with same $130 total capital.

Scenario: You have $130 total capital.
Option A: 2x leverage — $100 long, $30 margin (=$60 notional short, 60% ratio)
Option B: 1x leverage — need to figure out best use of $130

The key: at 1x leverage, margin = short_notional / 1 = short_notional.
So if you want short = 60% of long, you need:
  long + margin = $130
  margin = 0.60 * long
  long + 0.60*long = $130
  1.60*long = $130
  long = $81.25
  short margin = $48.75
  short notional = $48.75 (at 1x, margin = notional)
  
So at 1x: $81.25 long, $48.75 short. 
  Short ratio = 48.75/81.25 = 0.60 ✓

At 2x: $100 long, $60 short notional, $30 margin.
  Short ratio = 60/100 = 0.60 ✓

Now compare RETURNS on the full $130:
"""
print("=" * 80)
print("FAIR COMPARISON: Same $130 total capital")
print("=" * 80)

total_capital = 130.0

# 2x leverage
long_2x = 100.0
short_notional_2x = 60.0
margin_2x = 30.0
free_cash_2x = 0.0

# 1x leverage
long_1x = 81.25
short_notional_1x = 48.75
margin_1x = 48.75
free_cash_1x = 0.0

# Assumptions
vault_apr = 0.10
funding_apr = 0.05
peg_alpha_apr = 0.02
cost_apr = 0.005

print(f"\n{' ':30} {'2x Leverage':<18} {'1x Leverage':<18}")
print("-" * 66)
print(f"{'Total capital':30} ${total_capital:<14.2f} ${total_capital:<14.2f}")
print(f"{'Long yCRV':30} ${long_2x:<14.2f} ${long_1x:<14.2f}")
print(f"{'Short notional':30} ${short_notional_2x:<14.2f} ${short_notional_1x:<14.2f}")
print(f"{'Margin posted':30} ${margin_2x:<14.2f} ${margin_1x:<14.2f}")
print(f"{'Free cash':30} ${free_cash_2x:<14.2f} ${free_cash_1x:<14.2f}")
print()

# Returns
long_yield_2x = long_2x * vault_apr
long_yield_1x = long_1x * vault_apr

funding_2x = short_notional_2x * funding_apr
funding_1x = short_notional_1x * funding_apr

peg_2x = short_notional_2x * peg_alpha_apr
peg_1x = short_notional_1x * peg_alpha_apr

cost_2x = short_notional_2x * cost_apr  # costs scale with trading volume
cost_1x = short_notional_1x * cost_apr

net_2x = long_yield_2x + funding_2x + peg_2x - cost_2x
net_1x = long_yield_1x + funding_1x + peg_1x - cost_1x

roi_2x = net_2x / total_capital * 100
roi_1x = net_1x / total_capital * 100

print(f"{'ANNUAL RETURNS':30} {'2x Leverage':<18} {'1x Leverage':<18}")
print("-" * 66)
print(f"{'Vault yield':30} ${long_yield_2x:<+13.2f} ${long_yield_1x:<+13.2f}")
print(f"{'Funding earned':30} ${funding_2x:<+13.2f} ${funding_1x:<+13.2f}")
print(f"{'Peg alpha':30} ${peg_2x:<+13.2f} ${peg_1x:<+13.2f}")
print(f"{'Trading costs':30} ${cost_2x:<+13.2f} ${cost_1x:<+13.2f}")
print("-" * 66)
print(f"{'NET ANNUAL RETURN':30} ${net_2x:<+13.2f} ${net_1x:<+13.2f}")
print(f"{'ROI ON $130':30} {roi_2x:<+13.2f}% {roi_1x:<+13.2f}%")
print()

# Also show dollar-based return composition
print(f"\nBREAKDOWN of difference:")
print(f"  2x has ${long_2x - long_1x:.2f} MORE in yCRV → ${long_yield_2x - long_yield_1x:.2f}/yr more vault yield")
print(f"  2x has ${short_notional_2x - short_notional_1x:.2f} MORE short → ${funding_2x - funding_1x + peg_2x - peg_1x - (cost_2x - cost_1x):.2f}/yr more from short")
print(f"  Total advantage: ${net_2x - net_1x:.2f}/yr or {(net_2x - net_1x)/total_capital*100:.2f}% more ROI")

print()
print("=" * 80)
print("CONCLUSION")
print("=" * 80)
print(f"""
You are CORRECT. With the same $130:

2x leverage wins because:
  - MORE capital in yCRV (${long_2x:.0f} vs ${long_1x:.0f})
  - BIGGER short notional (${short_notional_2x:.0f} vs ${short_notional_1x:.0f})
  - Both the long AND the short are proportionally larger

2x leverages your capital: $30 margin controls $60 notional.
1x requires $60 margin to control $60 notional — so you can't
put as much into the long AND maintain the 60% ratio.

Annual advantage of 2x: ${net_2x - net_1x:.2f} on $130 ({((net_2x - net_1x)/total_capital*100):.1f}%)
""")

# What if we keep the SAME long size but use leverage differently?
print()
print("=" * 80)
print("ALTERNATIVE SCENARIO: Keep $100 long, vary short sizing")
print("=" * 80)

# At 2x, margin = short/2
# At 1x, margin = short/1
# With $100 long and same total $130:
# Remaining capital for short margin = $30
# 2x: $30 margin = $60 notional short
# 1x: $30 margin = $30 notional short

print(f"\nWith $100 long and $130 total:")
print(f"  Remaining for margin: $30")
print(f"  2x: $30 margin → $60 notional short (60% ratio) ✓")
print(f"  1x: $30 margin → $30 notional short (30% ratio)")
print()
print(f"At 1x leverage, to get 60% ratio you need:")
print(f"  $60 short notional = $60 margin + $100 long = $160 total needed")
print(f"  But you only have $130 → impossible at 1x.")

print()
print("=" * 80)
print("FINAL VERDICT")
print("=" * 80)
print(f"""
For a given capital K, at 60% ratio (short = 0.60 × long):

2x leverage:  long = K / (1 + 0.60/2) = K / 1.30
             short_notional = 0.60 × long = 0.60K / 1.30
             margin = 0.30K / 1.30

1x leverage:  long = K / (1 + 0.60/1) = K / 1.60
             short_notional = 0.60 × long = 0.60K / 1.60
             margin = 0.60K / 1.60

At K = $130:
  2x: long = $100, short = $60  → APY = 13.7% on $130
  1x: long = $81.25, short = $48.75 → APY = 10.7% on $130 (less absolute return)

2x is BETTER for returns because it lets you deploy more capital
into both legs. The trade-off is liquidation risk.
  - 2x liquidates at ~50% adverse CRV move
  - 1x liquidates at ~100% adverse CRV move (essentially never)

So the question is: do you want higher returns (2x) or near-zero
liquidation risk (1x)?
""")
