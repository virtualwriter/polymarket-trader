"""
Analyze liquidation risk at 3x leverage on the CRV short.
At 3x: margin = short_notional / 3
If margin drops near 0, liquidation happens.
Liquidation price = entry_price * (1 + 1/leverage) for shorts
= entry_price * (1 + 1/3) = entry_price * 1.333
So a 33% adverse move liquidates at 3x.

Let's check: at what prices would the short have been liquidated,
and did CRV ever reach those prices in our data period?
"""
import math

# Data
data = [
    ("4/1",  0.20945),
    ("4/2",  0.23),
    ("4/3",  0.2289),
    ("4/6",  0.23),
    ("4/24", 0.23),
    ("4/27", 0.23),
    ("4/28", 0.23),
    ("4/29", 0.24),
    ("4/30", 0.23),
    ("5/1",  0.23),
    ("5/4",  0.24),
    ("5/5",  0.2402),
    ("5/6",  0.25),
    ("5/12", 0.275),
    ("5/13", 0.27),
    ("5/15", 0.255),
    ("5/19", 0.231),
    ("5/26", 0.225),
]

# Track when shorts were opened/closed from the bot logs
# From crv_hedge_log.jsonl:
# 4/1: opened short at 0.21467 (73 CRV, closed same day)
# 4/1: opened short at 0.21438 (73 CRV, closed next day)
# 4/2: opened short at 0.20945 (48 CRV)
# 5/19: opened short at 0.23149 (44 CRV)
# 5/22: closed part of short at 0.23483 (bought back 58 CRV)
# Current: still short 34 CRV at 0.21999

# But let's just check the worst-case scenario:
# If someone opened a short at the LOWEST price and held through the HIGHEST price,
# would 3x have liquidated them?

print("=" * 80)
print("LIQUIDATION RISK ANALYSIS: 3x Leverage on CRV Short")
print("=" * 80)

# The shorts were opened at various prices
entries = [
    (0.20945, "48 CRV", "4/2"),
    (0.23149, "44 CRV", "5/19"),
    (0.21999, "34 CRV", "current"),
]

print(f"\nAt 3x leverage, liquidation price = entry × (1 + 1/3) = entry × 1.333")
print(f"Adverse move needed for liquidation: 33.3%\n")

print(f"{'Entry Date':<15} {'Entry Price':<15} {'Liq Price (3x)':<18} {'Max CRV Hit':<15} {'Liquidated?':<15}")
print("-" * 78)

for entry_price, desc, date in entries:
    liq_3x = entry_price * (1 + 1/3)
    max_crv = max([d[1] for d in data])
    liq_risk = "YES ⚠️" if max_crv >= liq_3x else "NO ✅"
    print(f"{date:<15} ${entry_price:<11.5f} ${liq_3x:<14.5f} ${max_crv:<11.5f} {liq_risk:<15}")

print()
print("=" * 80)
print("WORST-CASE ANALYSIS: Short opened at lowest price, held to peak")
print("=" * 80)

min_crv = min([d[1] for d in data])
max_crv = max([d[1] for d in data])
print(f"\nLowest CRV in period: ${min_crv:.5f} ({data[0][0]})")
print(f"Highest CRV in period: ${max_crv:.5f} ({data[12][0]})")

# If you shorted at the lowest (0.20945 on 4/1) and held to the peak
print(f"\nScenario: Short at ${min_crv:.5f}, hold through peak ${max_crv:.5f}")
move_pct = (max_crv - min_crv) / min_crv * 100
print(f"  CRV rose: {move_pct:.2f}%")

for lev in [1, 2, 3, 4, 5]:
    liq_price = min_crv * (1 + 1/lev)
    liq_move = 100/lev
    would_liq = max_crv >= liq_price
    print(f"  {lev}x leverage: liq at ${liq_price:.5f} ({liq_move:.0f}% adverse) → {'LIQUIDATED ⚠️' if would_liq else 'SURVIVED ✅'}")

print()
print("=" * 80)
print("HISTORICAL PEAK-TO-TROUGH ANALYSIS BY ENTRY DATE")
print("=" * 80)

# For each possible entry date, what was the worst CRV move afterwards?
for i, (entry_date, entry_price) in enumerate(data):
    future_prices = [d[1] for d in data[i+1:]]
    if not future_prices:
        continue
    
    max_future = max(future_prices)
    worst_move = (max_future - entry_price) / entry_price * 100
    
    liq_2x = entry_price * (1 + 1/2)
    liq_3x = entry_price * (1 + 1/3)
    
    would_liq_2x = "LIQ" if max_future >= liq_2x else "OK"
    would_liq_3x = "LIQ" if max_future >= liq_3x else "OK"
    
    print(f"{entry_date:<6} entry=${entry_price:<.5f}  peak=${max_future:<.5f}  worst_move={worst_move:<+.2f}%  2x:{would_liq_2x:<5}  3x:{would_liq_3x}")

print()
print("=" * 80)
print("HYPOTHETICAL: What if we'd used 3x from the very start?")
print("=" * 80)

# Start date: April 1, price $0.20945
# Using 3x leverage: liq at $0.20945 * 1.333 = $0.2793
# Peak: $0.275 on 5/12 — close! $0.275 vs $0.2793
print(f"\nStarting short on 4/1 at $0.20945:")
print(f"  3x liquidation price: ${0.20945 * (1 + 1/3):.5f}")
print(f"  Actual peak:          ${max_crv:.5f}")
margin = max_crv / (0.20945 * (1 + 1/3)) - 1
print(f"  Distance from liquidation: {margin*100:.2f}%")
if max_crv >= 0.20945 * (1 + 1/3):
    print(f"  ❌ WOULD HAVE BEEN LIQUIDATED")
else:
    print(f"  ✅ SURVIVED — but only by {(0.20945*(1+1/3) - max_crv)/0.20945*100:.1f}%")

print()
print("=" * 80)
print("SECOND ENTRY: 5/19 at $0.23149")
print("=" * 80)
entry = 0.23149
liq = entry * (1 + 1/3)
post_519 = [d[1] for d in data if d[0] in ("5/21", "5/26")]
max_post = max([d[1] for d in post_519])
print(f"  3x liquidation price: ${liq:.5f}")
print(f"  Max CRV after 5/19:  ${max_post:.5f}")
if max_post >= liq:
    print(f"  ❌ WOULD HAVE BEEN LIQUIDATED")
else:
    print(f"  ✅ SURVIVED — {(liq - max_post)/entry*100:.1f}% buffer")
    print(f"  (CRV went to ${max_post:.5f}, need ${liq:.5f} for liq)")

print()
print("=" * 80)
print("VERDICT")
print("=" * 80)
print("""
3x leverage would have been DANGEROUSLY close to liquidation.
Starting from the 4/1 entry at $0.20945, CRV peaked at $0.275 on 5/12.
The 3x liquidation price was $0.2793 — only 1.5% away.

If you'd entered at a slightly worse price (say $0.21+), or if CRV
had continued its rally just one more day, you'd have been stopped out.

REALITY CHECK:
  At 60% ratio with 3x leverage:
  - You need margin = $60 / 3 = $20 per $100 long
  - This frees up even MORE capital for the long
  - But liquidation at just 33% adverse move
  
  On this historical data: SURVIVED but WITHIN 1.5% of liquidation.
  That's not a margin of safety you want.

RECOMMENDATION: Stick with 2x unless you're actively monitoring.
  3x offers marginally better capital efficiency but the liquidation
  risk is uncomfortably close to real market moves.
""")
