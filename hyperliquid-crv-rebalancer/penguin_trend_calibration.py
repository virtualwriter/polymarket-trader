"""
Find the optimal trend-following EMA period for PENGUIN by analyzing
the autocorrelation decay of returns and the signal-to-noise ratio.
"""
import json
import math
import statistics

# Load 90-day data (more data = better for this)
with open("/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt") as f:
    raw = f.read()

data = json.loads(raw)
prices_raw = data["prices"]
prices = [p[1] for p in prices_raw]
log_prices = [math.log(p) for p in prices]

# Compute hourly log returns
log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
print(f"Data: {len(prices)} hourly prices, {len(log_returns)} hourly returns\n")

# =============================================================================
# 1. AUTOCORRELATION FUNCTION (ACF) — how long does momentum persist?
# =============================================================================
print("=" * 80)
print("1. AUTOCORRELATION OF RETURNS — How long does momentum last?")
print("=" * 80)

r_mean = statistics.mean(log_returns)
r_var = statistics.variance(log_returns)
r_stdev = statistics.stdev(log_returns)

def autocorr(series, lag, mean, var):
    n = len(series)
    cov = sum((series[i] - mean) * (series[i - lag] - mean) for i in range(lag, n))
    return cov / ((n - lag) * var)

print(f"\n  Lag (hours)  Autocorrelation  Interpretation")
print(f"  " + "-" * 55)
for lag in [1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 30, 36, 48, 60, 72, 96, 120, 168]:
    if lag >= len(log_returns):
        break
    ac = autocorr(log_returns, lag, r_mean, r_var)
    note = ""
    if abs(ac) < 0.03:
        note = "← noise level"
    elif ac > 0.05:
        note = "← momentum signal"
    elif ac < -0.05:
        note = "← mean reversion signal"
    print(f"  {lag:<12} {ac:+.4f}           {note}")

# =============================================================================
# 2. DETRENDED PRICE ANALYSIS — Variance Ratio Test
# =============================================================================
print("\n" + "=" * 80)
print("2. VARIANCE RATIO — Is momentum predictable at various scales?")
print("=" * 80)

def variance_ratio(prices, k):
    """VR(k) = Var(p_t - p_{t-k}) / (k * Var(p_t - p_{t-1}))"""
    n = len(prices)
    # Multi-period returns
    multi = [math.log(prices[i] / prices[i - k]) for i in range(k, n)]
    # Single-period returns
    single = [math.log(prices[i] / prices[i - 1]) for i in range(1, n)]
    
    var_multi = statistics.variance(multi)
    var_single = statistics.variance(single)
    
    vr = var_multi / (k * var_single)
    return vr

print(f"\n  {'Window (hours)':<20} {'Variance Ratio':<20} {'Interpretation'}")
print(f"  " + "-" * 70)
for k in [6, 12, 24, 48, 72, 120, 168]:
    vr = variance_ratio(prices, k)
    note = "Random walk" if 0.85 <= vr <= 1.15 else "Mean-reverting (anti-persistent)" if vr < 0.85 else "Trending (persistent)"
    print(f"  {k:<20} {vr:<20.4f} {note}")

# =============================================================================
# 3. OPTIMAL EMA LOOKBACK — Minimize noise-to-signal
# =============================================================================
print("\n" + "=" * 80)
print("3. OPTIMAL EMA LOOKBACK — Maximize Sharpe of crossover signals")
print("=" * 80)

def ema(series, period):
    """Exponential moving average"""
    result = []
    multiplier = 2 / (period + 1)
    ema_val = series[0]
    for s in series:
        ema_val = (s - ema_val) * multiplier + ema_val
        result.append(ema_val)
    return result

# Test various EMA periods and score them by how well price/EMA crossover
# predicts future direction
periods = list(range(5, 201, 5))

print(f"\n  Testing EMA periods 5–200 hours...")
print(f"\n  {'Period (hrs)':<15} {'Day equiv':<12} {'Signal Sharpe':<16} {'Trades':<10} {'Win Rate':<10}")
print(f"  " + "-" * 65)

best_period = None
best_sharpe = -999

for p in periods:
    ema_vals = ema(log_prices, p)
    
    # Simulate a simple strategy: go long when price > EMA, flat when below
    # Calculate returns of this strategy
    signals = []
    for i in range(1, len(log_returns)):
        price_above_ema = log_prices[i] > ema_vals[i]
        signals.append(price_above_ema)
    
    # Strategy returns: if signal is True (long), earn the return; if False, earn 0
    strat_returns = []
    trade_count = 0
    wins = 0
    for i in range(len(signals)):
        if signals[i]:
            strat_returns.append(log_returns[i])
            trade_count += 1
            if log_returns[i] > 0:
                wins += 1
        else:
            strat_returns.append(0.0)
    
    if len(strat_returns) < 10:
        continue
    
    strat_mean = statistics.mean(strat_returns)
    strat_std = statistics.stdev(strat_returns)
    
    # Sharpe-like ratio for this strategy (signal-based)
    # Use annualized divisor
    if strat_std > 0:
        signal_sharpe = (strat_mean / strat_std) * math.sqrt(24 * 365)
    else:
        signal_sharpe = 0
    
    win_rate = wins / trade_count * 100 if trade_count > 0 else 0
    
    print(f"  {p:<15} {f'{p/24:.1f}d':<12} {signal_sharpe:<16.2f} {trade_count:<10} {win_rate:<10.1f}%")
    
    if signal_sharpe > best_sharpe:
        best_sharpe = signal_sharpe
        best_period = p

print(f"\n  >> OPTIMAL EMA PERIOD: {best_period} hours ({best_period/24:.1f} days)")
print(f"  >> Signal Sharpe at optimum: {best_sharpe:.2f}")

# =============================================================================
# 4. PRACTICAL CONFIRMATION ZONES
# =============================================================================
print("\n" + "=" * 80)
print("4. PRACTICAL TREND CONFIRMATION LEVELS (using optimal EMA)")
print("=" * 80)

current_price = prices[-1]
ema_vals = ema(prices, best_period)
current_ema = ema_vals[-1]
recent_lows = min(prices[-best_period:])
recent_highs = max(prices[-best_period:])

print(f"\n  Current price:              ${current_price:.6f}")
print(f"  Optimal EMA ({best_period}h / {best_period/24:.1f}d):    ${current_ema:.6f}")
print(f"  Distance to EMA:            {(current_price/current_ema - 1)*100:+.2f}%")
print(f"  Recent {best_period}h low:         ${recent_lows:.6f}")
print(f"  Recent {best_period}h high:        ${recent_highs:.6f}")
print(f"\n  Trend confirmation for LONG:")
if current_price > current_ema:
    print(f"    ✅ Already above EMA — long bias active")
else:
    print(f"    ❌ Below EMA — bearish, wait for break above ${current_ema:.6f}")
print(f"    Break above ${recent_highs:.6f} = trend structure confirmed")
print(f"    Need price > EMA + volume expansion for confirmation")
print(f"\n  Trend confirmation for SHORT:")
if current_price < current_ema:
    print(f"    ✅ Already below EMA — short bias active")
else:
    print(f"    ❌ Above EMA — bullish, wait for break below ${current_ema:.6f}")
print(f"    Break below ${recent_lows:.6f} = downtrend continuation")
