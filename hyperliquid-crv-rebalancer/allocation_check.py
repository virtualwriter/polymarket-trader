existing_long = 21.64
new_capital = 272.00
total = existing_long + new_capital

ratio = 0.60
leverage = 2.0

# Long = total / (1 + ratio/leverage)
target_long = total / (1 + ratio/leverage)
short_notional = target_long * ratio
short_margin = short_notional / leverage

print(f"Total capital: ${total:.2f}")
print(f"Target long:   ${target_long:.2f}")
print(f"  Existing:    ${existing_long:.2f}")
print(f"  Add to long: ${target_long - existing_long:.2f}")
print(f"Short notional: ${short_notional:.2f}")
print(f"Short margin:   ${short_margin:.2f}")
print(f"Total deployed: ${(target_long - existing_long) + short_margin:.2f}")
print(f"Remaining:      ${new_capital - ((target_long - existing_long) + short_margin):.2f}")

# In CRV units at current price $0.225
crv_price = 0.225
short_crv_units = short_notional / crv_price
print(f"\nCurrent CRV price: ${crv_price}")
print(f"Short CRV units needed: {short_crv_units:.1f} CRV")
print(f"You currently have:     -34.0 CRV short")
print(f"Net additional to short: {short_crv_units - 34.0:.1f} CRV")
