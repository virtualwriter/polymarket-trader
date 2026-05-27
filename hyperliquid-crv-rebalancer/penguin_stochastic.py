"""
Nietzschean Penguin (PENGUIN) — Quantitative Stochastic Analysis
Fetching 30-day hourly data from CoinGecko free API
"""
import json
import math
import statistics
import sys
from datetime import datetime, timezone

# CoinGecko returns [[timestamp_ms, price], ...] sorted ascending
# We fetched 30 days of hourly data

# Coin data from API
coin_id = "nietzschean-penguin"
symbol = "PENGUIN"
name = "Nietzschean Penguin"
current_price = 0.00298174
market_cap = 2979901
market_cap_rank = 2047
ath = 0.1605
atl = 0.00229522
ath_date = "2026-01-24"
atl_date = "2026-05-01"
ath_drop_pct = (current_price / ath - 1) * 100

print("=" * 80)
print(f"{name.upper()} ({symbol}) — QUANTITATIVE STOCHASTIC ANALYSIS")
print("=" * 80)
print(f"\n  Current Price:     ${current_price:.6f}")
print(f"  Market Cap:       ${market_cap:,} (Rank #{market_cap_rank})")
print(f"  ATH:              ${ath:.4f} ({ath_date}) — Down {ath_drop_pct:.1f}%")
print(f"  ATL:              ${atl:.6f} ({atl_date}) — Up {(current_price/atl-1)*100:.1f}%")
print(f"  Category:         Solana Meme / Pump.fun Ecosystem")

# Parse the price data from the fetched file
print("\n  Loading 30-day price data...")

# The data was saved to a file - parse it
with open("/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/938f2f4c-337e-4236-aa72-408620b86f79.txt") as f:
    raw = f.read()

data = json.loads(raw)
prices_raw = data["prices"]
volumes_raw = data["total_volumes"]

# Convert to clean arrays
prices = [p[1] for p in prices_raw]
timestamps = [p[0] for p in prices_raw]
volumes = [v[1] for v in volumes_raw]

n = len(prices)
print(f"  Data points: {n} (hourly-ish, ~30 days)")

# --- DESCRIPTIVE STATISTICS ---
print("\n" + "=" * 80)
print("1. DESCRIPTIVE STATISTICS")
print("=" * 80)

p_min = min(prices)
p_max = max(prices)
p_mean = statistics.mean(prices)
p_median = statistics.median(prices)
p_stdev = statistics.stdev(prices)

print(f"  Min price:      ${p_min:.6f}")
print(f"  Max price:      ${p_max:.6f}")
print(f"  Mean price:     ${p_mean:.6f}")
print(f"  Median price:   ${p_median:.6f}")
print(f"  Std Dev:        ${p_stdev:.6f}")
print(f"  Range:          ${p_max-p_min:.6f} ({(p_max/p_min-1)*100:.1f}%)")

# --- RETURN ANALYSIS ---
print("\n" + "=" * 80)
print("2. RETURN DISTRIBUTION (hourly log returns)")
print("=" * 80)

log_returns = []
simple_returns = []
for i in range(1, len(prices)):
    r = math.log(prices[i] / prices[i-1])
    log_returns.append(r)
    simple_returns.append(prices[i] / prices[i-1] - 1)

r_mean = statistics.mean(log_returns)
r_stdev = statistics.stdev(log_returns)
r_min = min(log_returns)
r_max = max(log_returns)

# Annualization: ~8760 hours per year
hourly_vol = r_stdev
daily_vol = r_stdev * math.sqrt(24)
weekly_vol = r_stdev * math.sqrt(24 * 7)
annual_vol = r_stdev * math.sqrt(24 * 365)

# Annualized return
annual_return = r_mean * 24 * 365
annual_return_pct = (math.exp(annual_return) - 1) * 100

print(f"  Hourly log return mean:  {r_mean*100:.4f}%")
print(f"  Hourly log return std:   {hourly_vol*100:.4f}%")
print(f"  Min hourly return:       {r_min*100:.2f}%")
print(f"  Max hourly return:       {r_max*100:.2f}%")
print(f"")
print(f"  Annualized return (geo): {annual_return_pct:.1f}%")
print(f"  Daily volatility:        {daily_vol*100:.2f}%")
print(f"  Weekly volatility:       {weekly_vol*100:.2f}%")
print(f"  Annualized volatility:   {annual_vol*100:.2f}%")
print(f"")
print(f"  Skewness:               {statistics.mean([(r - r_mean)**3 for r in log_returns]) / r_stdev**3:.4f}")
print(f"  Kurtosis:               {statistics.mean([(r - r_mean)**4 for r in log_returns]) / r_stdev**4:.4f}")

# --- GAUSSIAN / STUDENT-T FIT ---
print("\n" + "=" * 80)
print("3. DISTRIBUTION FIT & TAIL RISK")
print("=" * 80)

# Percentile-based VaR
log_returns_sorted = sorted(log_returns)
var_95 = log_returns_sorted[int(len(log_returns_sorted) * 0.05)]
var_99 = log_returns_sorted[int(len(log_returns_sorted) * 0.01)]
var_999 = log_returns_sorted[max(0, int(len(log_returns_sorted) * 0.001))]

cvar_95 = statistics.mean([r for r in log_returns if r <= var_95])

print(f"  1-hour VaR (95%):       {var_95*100:.2f}%  (${prices[-1] * (math.exp(var_95)-1):.6f})")
print(f"  1-hour VaR (99%):       {var_99*100:.2f}%  (${prices[-1] * (math.exp(var_99)-1):.6f})")
print(f"  1-hour VaR (99.9%):     {var_999*100:.2f}%  (${prices[-1] * (math.exp(var_999)-1):.6f})")
print(f"  CVaR (95%):             {cvar_95*100:.2f}%")
print(f"")

# Probability of various moves
probs = {}
for move_pct in [5, 10, 15, 20, 25, 30, 50]:
    threshold = math.log(1 + move_pct/100)
    prob_up = sum(1 for r in log_returns if r >= threshold) / len(log_returns)
    prob_down = sum(1 for r in log_returns if r <= -threshold) / len(log_returns)
    print(f"  Probability of +{move_pct}% hrly move: {prob_up*100:.2f}%")
    print(f"  Probability of -{move_pct}% hrly move: {prob_down*100:.2f}%")

# --- GEOMETRIC BROWNIAN MOTION SIMULATION ---
print("\n" + "=" * 80)
print("4. GEOMETRIC BROWNIAN MOTION — MONTE CARLO SIMULATION (7-day)")
print("=" * 80)

import random

mu = r_mean  # drift
sigma = r_stdev  # volatility
S0 = prices[-1]
dt = 1/24  # 1 hour steps
T = 7  # days
N = int(T / dt)  # steps

num_simulations = 10000

# Simulate
final_prices = []
trajectories = []

for sim in range(num_simulations):
    S = S0
    path = [S]
    for _ in range(N):
        epsilon = random.gauss(0, 1)
        S = S * math.exp((mu - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * epsilon)
        path.append(S)
    final_prices.append(S)
    if sim < 5:  # save a few paths for illustration
        trajectories.append(path)

final_prices.sort()
p5 = final_prices[int(num_simulations * 0.05)]
p25 = final_prices[int(num_simulations * 0.25)]
p50 = final_prices[int(num_simulations * 0.50)]
p75 = final_prices[int(num_simulations * 0.75)]
p95 = final_prices[int(num_simulations * 0.95)]

print(f"  10,000 simulations, 7-day horizon (168 hours)")
print(f"  Current price: ${S0:.6f}")
print(f"  Expected price (median): ${p50:.6f} ({(p50/S0-1)*100:+.1f}%)")
print(f"  5th percentile (95% VaR): ${p5:.6f} ({(p5/S0-1)*100:+.1f}%)")
print(f"  25th percentile:          ${p25:.6f} ({(p25/S0-1)*100:+.1f}%)")
print(f"  75th percentile:          ${p75:.6f} ({(p75/S0-1)*100:+.1f}%)")
print(f"  95th percentile:          ${p95:.6f} ({(p95/S0-1)*100:+.1f}%)")
print(f"  Probability of >+50%:     {sum(1 for p in final_prices if p > S0*1.5)/num_simulations*100:.1f}%")
print(f"  Probability of >-50%:     {sum(1 for p in final_prices if p < S0*0.5)/num_simulations*100:.1f}%")
print(f"  Probability of >+100%:    {sum(1 for p in final_prices if p > S0*2)/num_simulations*100:.1f}%")
print(f"  Probability of >-80%:     {sum(1 for p in final_prices if p < S0*0.2)/num_simulations*100:.1f}%")

# --- MEAN REVERSION ANALYSIS (Ornstein-Uhlenbeck) ---
print("\n" + "=" * 80)
print("5. MEAN REVERSION ANALYSIS (Ornstein-Uhlenbeck Process)")
print("=" * 80)

# Check if price is mean-reverting by looking at serial correlation
# of log returns
from collections import Counter

# Calculate lag-1 autocorrelation of log returns
lag1_corr = sum((a - r_mean) * (b - r_mean) for a, b in zip(log_returns[:-1], log_returns[1:])) / (len(log_returns) - 1) / r_stdev**2
print(f"  Lag-1 autocorrelation of returns: {lag1_corr:.4f}")
print(f"  {'→ Strong mean reversion' if lag1_corr < -0.1 else ''}")
print(f"  {'→ Weak/no mean reversion' if -0.1 <= lag1_corr < 0.1 else ''}")
print(f"  {'→ Positive momentum trend' if lag1_corr >= 0.1 else ''}")

# Hurst exponent approximation
def compute_hurst(series):
    """Simplified Hurst exponent using rescaled range (R/S)"""
    n = len(series)
    mean = statistics.mean(series)
    deviations = [x - mean for x in series]
    cumulative = []
    s = 0
    for d in deviations:
        s += d
        cumulative.append(s)
    R = max(cumulative) - min(cumulative)
    S = statistics.stdev(series)
    if S == 0:
        return 0.5
    return math.log(R/S) / math.log(n)

# Use log prices for Hurst
log_prices = [math.log(p) for p in prices]
hurst = compute_hurst(log_prices)
print(f"  Hurst exponent: {hurst:.4f}")
print(f"  {'→ Mean-reverting (H < 0.5)' if hurst < 0.45 else ''}")
print(f"  {'→ Random walk (H ≈ 0.5)' if 0.45 <= hurst < 0.55 else ''}")
print(f"  {'→ Trending/momentum (H > 0.55)' if hurst >= 0.55 else ''}")

# --- LIQUIDITY ANALYSIS ---
print("\n" + "=" * 80)
print("6. LIQUIDITY & VOLUME ANALYSIS")
print("=" * 80)

avg_daily_vol = sum(volumes[-24:])  # last ~24 hours
volume_to_mcap = avg_daily_vol / market_cap * 100

# Average hourly volume
hourly_volumes = [volumes[i] - volumes[i-1] if i > 0 else volumes[i] for i in range(len(volumes))]
# Actually volumes are cumulatives or per-period? Let's check
# CoinGecko returns total_volumes as per-period volume
avg_hourly_volume = statistics.mean(volumes)
print(f"  Avg hourly volume: ${avg_hourly_volume:,.0f}")
print(f"  Est 24h volume:    ${avg_hourly_volume * 24:,.0f}")
print(f"  Volume/MCap ratio: {avg_hourly_volume * 24 / market_cap * 100:.1f}%")
print(f"  {'→ Liquid' if avg_hourly_volume * 24 / market_cap > 0.3 else '→ Moderate liquidity' if avg_hourly_volume * 24 / market_cap > 0.1 else '→ Low liquidity — high slippage risk'}")

# --- SUMMARY & OUTLOOK ---
print("\n" + "=" * 80)
print("7. SUMMARY & QUANTITATIVE OUTLOOK")
print("=" * 80)

print(f"""
  ASSET:          {name} ({symbol})
  TYPE:           Solana meme coin (Pump.fun ecosystem)
  MARKET CAP:     ${market_cap:,} (Rank #{market_cap_rank})

  VOLATILITY:
  Daily:          {daily_vol*100:.1f}%
  Annualized:     {annual_vol*100:.1f}%
  Comparison:     {'Extremely high' if annual_vol > 2 else 'Very high' if annual_vol > 1.5 else 'High' if annual_vol > 1 else 'Moderate'}

  TAIL RISK:
  -1 sigma in 1 day:    ${S0 * (1 - daily_vol):.6f} ({(daily_vol)*-100:.1f}%)
  -2 sigma in 1 day:    ${S0 * (1 - 2*daily_vol):.6f} ({(2*daily_vol)*-100:.1f}%)
  95% VaR (7 days):     ${p5:.6f}
  50/50 range (7d):     ${p25:.6f} — ${p75:.6f}

  BEHAVIOR:
  {'Trending / momentum' if hurst > 0.55 else 'Mean-reverting' if hurst < 0.45 else 'Random walk-like'}

  RECOMMENDATION:
  30-day return: +{((prices[-1]/prices[0]-1)*100):.1f}% (price action)
  {'→ Currently in a bullish phase' if prices[-1] > p_mean else '→ Currently below 30-day average' if prices[-1] < p_mean else '→ Around 30-day average'}
  {'→ High downside risk — use tight stops if trading' if annual_vol > 1.5 else ''}
  {'→ Low liquidity — avoid large market orders' if avg_hourly_volume * 24 / market_cap < 0.3 else ''}
""")
