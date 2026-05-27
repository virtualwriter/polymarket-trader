print("YOUR NUMBERS:")
print("=" * 50)
total_cash = 512
total_long = 320
total_short = 192
additional_long_needed = 298.36
total_ycrv_needed = 2086.40
total_short_margin = 96
total_initial_capital = 416
remaining_capital = 96

print(f"Total Cash:         ${total_cash}")
print(f"Total Long:         ${total_long}")
print(f"Total Short:        ${total_short}")
print(f"Additional Long:    ${additional_long_needed}")
print(f"Total yCRV needed:  ${total_ycrv_needed}")
print(f"Total Short Margin: ${total_short_margin}")
print(f"Total Init Capital: ${total_initial_capital}")
print(f"Remaining Capital:  ${remaining_capital}")
print()

# Cross-checks
print("CROSS-CHECKS:")
print("=" * 50)

# Long + Margin should = total initial capital
print(f"Long + Margin = ${total_long} + ${total_short_margin} = ${total_long + total_short_margin}")
print(f"Init Capital = ${total_initial_capital}")
print(f"Match: {'✅' if total_long + total_short_margin == total_initial_capital else '❌'}")

# Ratio = short / long
ratio = total_short / total_long
print(f"\nShort/Long Ratio: {total_short} / {total_long} = {ratio:.0%}")
print(f"Target 60%:       {'✅' if abs(ratio - 0.60) < 0.01 else '❌'}")

# Leverage = short / margin
lev = total_short / total_short_margin
print(f"\nLeverage: {total_short} / {total_short_margin} = {lev:.1f}x")

# Additional long check
print(f"\nAdditional long needed: {additional_long_needed}")
existing_long = total_long - additional_long_needed
print(f"Existing long (from prev): {total_long} - {additional_long_needed} = ${existing_long:.2f}")

# yCRV check - if yCRV price ~$0.143
ycrv_price = 0.143
ycrv_units = total_ycrv_needed / ycrv_price
print(f"\nyCRV units at ${ycrv_price}: {ycrv_units:.0f} (value: ${ycrv_units * ycrv_price:.2f})")
print(f"Total long value: ${total_long}")
print(f"Match: {'✅' if abs(ycrv_units * ycrv_price - total_long) < 5 else '❌'}")

# Remaining capital
rem = total_cash - total_initial_capital
print(f"\nRemaining: ${total_cash} - ${total_initial_capital} = ${rem}")
print(f"You stated: ${remaining_capital}")
print(f"Match: {'✅' if rem == remaining_capital else '❌'}")

# Everything must sum
print(f"\nTotal deployed: ${total_long + total_short_margin}")
print(f"Minus initial cash: ${total_long + total_short_margin - 512}")
