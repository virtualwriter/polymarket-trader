"""
Nietzschean Penguin (PENGUIN) — Monte Carlo Simulations at 30-day & 90-day Horizons
Uses both 30-day and 90-day historical volatility from CoinGecko
"""
import json
import math
import statistics
import random

# =============================================================================
# LOAD DATA
# =============================================================================

# 90-day data (more comprehensive, goes back ~Feb 26)
with open("/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt") as f:
    raw90 = f.read()

data90 = json.loads(raw90)
prices90_raw = data90["prices"]
prices90 = [p[1] for p in prices90_raw]
print(f"90-day data: {len(prices90)} hourly data points")

# 30-day data (recent window)
with open("/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/938f2f4c-337e-4236-aa72-408620b86f79.txt") as f:
    raw30 = f.read()

data30 = json.loads(raw30)
prices30_raw = data30["prices"]
prices30 = [p[1] for p in prices30_raw]
print(f"30-day data: {len(prices30)} hourly data points")

S0 = prices30[-1]  # current price = most recent ~$0.002982
print(f"Current price: ${S0:.6f}")

# =============================================================================
# COMPUTE STATS FOR EACH WINDOW
# =============================================================================

def compute_stats(prices, label):
    log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
    mu = statistics.mean(log_returns)
    sigma = statistics.stdev(log_returns)
    daily_vol = sigma * math.sqrt(24)
    annual_vol = sigma * math.sqrt(24 * 365)
    annual_return = (math.exp(mu * 24 * 365) - 1) * 100
    print(f"\n  [{label}]")
    print(f"    Points:       {len(prices)}")
    print(f"    Mean hrly ret: {mu*100:.4f}%")
    print(f"    Std hrly ret:  {sigma*100:.4f}%")
    print(f"    Daily vol:     {daily_vol*100:.1f}%")
    print(f"    Annual vol:    {annual_vol*100:.1f}%")
    print(f"    Annual ret:    {annual_return:.1f}%")
    return mu, sigma, log_returns

print("\n" + "=" * 80)
print("VOLATILITY ESTIMATES FROM 30-DAY vs 90-DAY WINDOWS")
print("=" * 80)

mu30, sigma30, log30 = compute_stats(prices30, "30-DAY WINDOW")
mu90, sigma90, log90 = compute_stats(prices90, "90-DAY WINDOW")

# =============================================================================
# MONTE CARLO SIMULATION FUNCTION
# =============================================================================

def run_monte_carlo(mu, sigma, S0, T_days, label, num_sims=20000):
    """Run GBM Monte Carlo for T_days at 1-hour steps."""
    dt = 1 / 24  # 1 hour
    N = int(T_days / dt)  # total steps

    final_prices = []
    for _ in range(num_sims):
        S = S0
        for _ in range(N):
            epsilon = random.gauss(0, 1)
            S = S * math.exp((mu - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * epsilon)
        final_prices.append(S)

    final_prices.sort()
    p1  = final_prices[int(num_sims * 0.01)]
    p5  = final_prices[int(num_sims * 0.05)]
    p10 = final_prices[int(num_sims * 0.10)]
    p25 = final_prices[int(num_sims * 0.25)]
    p50 = final_prices[int(num_sims * 0.50)]
    p75 = final_prices[int(num_sims * 0.75)]
    p90 = final_prices[int(num_sims * 0.90)]
    p95 = final_prices[int(num_sims * 0.95)]
    p99 = final_prices[int(num_sims * 0.99)]

    prob_up_50 = sum(1 for p in final_prices if p > S0 * 1.5) / num_sims * 100
    prob_dn_50 = sum(1 for p in final_prices if p < S0 * 0.5) / num_sims * 100
    prob_up_100 = sum(1 for p in final_prices if p > S0 * 2) / num_sims * 100
    prob_dn_80 = sum(1 for p in final_prices if p < S0 * 0.2) / num_sims * 100
    prob_dn_90 = sum(1 for p in final_prices if p < S0 * 0.1) / num_sims * 100
    prob_up_200 = sum(1 for p in final_prices if p > S0 * 3) / num_sims * 100

    print(f"\n  {label}")
    print(f"  {num_sims:,} simulations, {T_days}-day horizon ({N:,} hourly steps)")
    print(f"  " + "-" * 50)
    print(f"    Current price:            ${S0:.6f}")
    print(f"    Expected (median):        ${p50:.6f}  ({(p50/S0-1)*100:+.1f}%)")
    print(f"    Expected (mean):          ${statistics.mean(final_prices):.6f}")
    print(f"  ")
    print(f"    1st percentile (worst):   ${p1:.6f}  ({(p1/S0-1)*100:+.1f}%)")
    print(f"    5th percentile (95% VaR): ${p5:.6f}  ({(p5/S0-1)*100:+.1f}%)")
    print(f"    10th percentile:          ${p10:.6f}  ({(p10/S0-1)*100:+.1f}%)")
    print(f"    25th percentile:          ${p25:.6f}  ({(p25/S0-1)*100:+.1f}%)")
    print(f"    75th percentile:          ${p75:.6f}  ({(p75/S0-1)*100:+.1f}%)")
    print(f"    90th percentile:          ${p90:.6f}  ({(p90/S0-1)*100:+.1f}%)")
    print(f"    95th percentile:          ${p95:.6f}  ({(p95/S0-1)*100:+.1f}%)")
    print(f"    99th percentile (best):   ${p99:.6f}  ({(p99/S0-1)*100:+.1f}%)")
    print(f"  ")
    print(f"    Prob of >+50%:  {prob_up_50:.2f}%")
    print(f"    Prob of >-50%:  {prob_dn_50:.2f}%")
    print(f"    Prob of >+100%: {prob_up_100:.2f}%")
    print(f"    Prob of >-80%:  {prob_dn_80:.2f}%")
    print(f"    Prob of >-90%:  {prob_dn_90:.2f}%")
    print(f"    Prob of >+200%: {prob_up_200:.2f}%")

# =============================================================================
# RUN 4 SCENARIOS
# =============================================================================

print("\n" + "=" * 80)
print("MONTE CARLO SIMULATIONS")
print("=" * 80)

# Scenario 1: 30d vol, 30d horizon
run_monte_carlo(mu30, sigma30, S0, 30, "SCENARIO 1: 30-day vol → 30-day horizon")

# Scenario 2: 30d vol, 90d horizon
run_monte_carlo(mu30, sigma30, S0, 90, "SCENARIO 2: 30-day vol → 90-day horizon")

# Scenario 3: 90d vol, 30d horizon
run_monte_carlo(mu90, sigma90, S0, 30, "SCENARIO 3: 90-day vol → 30-day horizon")

# Scenario 4: 90d vol, 90d horizon
run_monte_carlo(mu90, sigma90, S0, 90, "SCENARIO 4: 90-day vol → 90-day horizon")

# =============================================================================
# COMPARISON SUMMARY TABLE
# =============================================================================
print("\n" + "=" * 80)
print("SIDE-BY-SIDE COMPARISON")
print("=" * 80)

print(f"""
  {'Metric':<35} {'30d Vol→30d':>12} {'30d Vol→90d':>12} {'90d Vol→30d':>12} {'90d Vol→90d':>12}
  """ + "-" * 85)

# Recompute a few key numbers for the summary
from functools import partial

def compute_key(prices, S0, T_days, num_sims=20000):
    log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
    mu = statistics.mean(log_returns)
    sigma = statistics.stdev(log_returns)
    
    dt = 1/24
    N = int(T_days / dt)
    finals = []
    for _ in range(num_sims):
        S = S0
        for _ in range(N):
            S *= math.exp((mu - 0.5*sigma**2)*dt + sigma*math.sqrt(dt)*random.gauss(0,1))
        finals.append(S)
    finals.sort()
    return {
        "p5": finals[int(0.05*num_sims)],
        "p50": finals[int(0.50*num_sims)],
        "p95": finals[int(0.95*num_sims)],
        "p99": finals[int(0.99*num_sims)],
    }

k1 = compute_key(prices30, S0, 30)
k2 = compute_key(prices30, S0, 90)
k3 = compute_key(prices90, S0, 30)
k4 = compute_key(prices90, S0, 90)

rows = [
    ("Current price", S0, S0, S0, S0),
    ("Median (50%)", k1["p50"], k2["p50"], k3["p50"], k4["p50"]),
    ("95% VaR (5%)", k1["p5"], k2["p5"], k3["p5"], k4["p5"]),
    ("95th percentile", k1["p95"], k2["p95"], k3["p95"], k4["p95"]),
    ("99th percentile", k1["p99"], k2["p99"], k3["p99"], k4["p99"]),
]

for label, v1, v2, v3, v4 in rows:
    p1_str = f"${v1:.6f}" if v1 < 1 else f"${v1:.4f}"
    p2_str = f"${v2:.6f}" if v2 < 1 else f"${v2:.4f}"
    p3_str = f"${v3:.6f}" if v3 < 1 else f"${v3:.4f}"
    p4_str = f"${v4:.6f}" if v4 < 1 else f"${v4:.4f}"
    
    r1 = f"({(v1/S0-1)*100:+.1f}%)" if v1 != S0 else ""
    r2 = f"({(v2/S0-1)*100:+.1f}%)"
    r3 = f"({(v3/S0-1)*100:+.1f}%)"
    r4 = f"({(v4/S0-1)*100:+.1f}%)"
    
    print(f"  {label:<35} {p1_str+ ' ' + r1:<22} {p2_str + ' ' + r2:<22} {p3_str + ' ' + r3:<22} {p4_str + ' ' + r4:<22}")

print()
print(f"  {'Vol used:':<35} {'σ₃₀ = {:.2f}%/hr'.format(sigma30*100):<22} {'σ₃₀ = {:.2f}%/hr'.format(sigma30*100):<22} {'σ₉₀ = {:.2f}%/hr'.format(sigma90*100):<22} {'σ₉₀ = {:.2f}%/hr'.format(sigma90*100):<22}")
print(f"  {'Horizon:':<35} {'30 days':<22} {'90 days':<22} {'30 days':<22} {'90 days':<22}")
