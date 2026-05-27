"""
Multi-coin quantitative stochastic analysis + trend calibration
Runs the full analysis on multiple coins extracted from CoinGecko data files.
"""
import json, math, statistics, random, sys

# =============================================================================
# COIN DEFINITIONS
# =============================================================================
coins = [
    {
        "name": "Nietzschean Penguin",
        "symbol": "PENGUIN",
        "meta_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt",
        "data_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt",
        "current_price": 0.002987,
        "market_cap": 2979901,
        "mcap_rank": 2047,
        "ath": 0.1605,
        "atl": 0.00229522,
        "ath_date": "2026-01-24",
        "atl_date": "2026-05-01",
    },
    {
        "name": "Useless",
        "symbol": "USELESS",
        "meta_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/3edb9641-1e8b-44aa-a268-cb3246499f98.txt",
        "data_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/eff90cfc-2b71-4fb9-8814-b92e1b0e9e90.txt",
    },
    {
        "name": "Pudgy Penguins",
        "symbol": "PUDGY",
        "meta_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/ec78d886-48e2-4184-ac24-72a3cf470428.txt",
        "data_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt",
    },
]

# Load metadata for coins that need it
for coin in coins:
    if "current_price" not in coin:
        try:
            with open(coin["meta_file"]) as f:
                meta = json.loads(f.read())
            md = meta.get("market_data", {})
            coin["current_price"] = md.get("current_price", {}).get("usd", 0)
            coin["market_cap"] = md.get("market_cap", {}).get("usd", 0)
            coin["mcap_rank"] = meta.get("market_cap_rank", 0)
            coin["ath"] = md.get("ath", {}).get("usd", 0)
            coin["atl"] = md.get("atl", {}).get("usd", 0)
            coin["ath_date"] = md.get("ath_date", {}).get("usd", "")[:10] if md.get("ath_date", {}).get("usd") else ""
            coin["atl_date"] = md.get("atl_date", {}).get("usd", "")[:10] if md.get("atl_date", {}).get("usd") else ""
            coin["categories"] = meta.get("categories", [])
        except:
            pass

# =============================================================================
# ANALYSIS FUNCTIONS
# =============================================================================

def load_prices(filepath):
    with open(filepath) as f:
        raw = f.read()
    data = json.loads(raw)
    return [p[1] for p in data["prices"]]

def compute_hurst(log_prices):
    n = len(log_prices)
    mean = statistics.mean(log_prices)
    deviations = [x - mean for x in log_prices]
    cumulative = []
    s = 0
    for d in deviations:
        s += d
        cumulative.append(s)
    R = max(cumulative) - min(cumulative)
    S = statistics.stdev(log_prices)
    if S == 0:
        return 0.5
    return math.log(R/S) / math.log(n)

def autocorr(series, lag, mean, var):
    n = len(series)
    cov = sum((series[i] - mean) * (series[i - lag] - mean) for i in range(lag, n))
    return cov / ((n - lag) * var)

def ema(series, period):
    result = []
    multiplier = 2 / (period + 1)
    ema_val = series[0]
    for s in series:
        ema_val = (s - ema_val) * multiplier + ema_val
        result.append(ema_val)
    return result

def find_optimal_ema(log_prices, log_returns):
    """Find EMA period that maximizes signal Sharpe."""
    periods = list(range(5, 201, 5))
    best_period = 20
    best_sharpe = -999
    best_wr = 0
    for p in periods:
        ema_vals = ema(log_prices, p)
        strat_returns = []
        wins = 0
        trade_count = 0
        for i in range(1, len(log_returns)):
            if log_prices[i] > ema_vals[i]:
                strat_returns.append(log_returns[i])
                trade_count += 1
                if log_returns[i] > 0:
                    wins += 1
            else:
                strat_returns.append(0.0)
        if len(strat_returns) < 10:
            continue
        sm = statistics.mean(strat_returns)
        ss = statistics.stdev(strat_returns)
        if ss > 0:
            sharpe = (sm / ss) * math.sqrt(24 * 365)
        else:
            sharpe = 0
        wr = wins / trade_count * 100 if trade_count > 0 else 0
        if sharpe > best_sharpe:
            best_sharpe = sharpe
            best_period = p
            best_wr = wr
    return best_period, best_sharpe, best_wr

def analyze_coin(coin):
    print("\n" + "=" * 80)
    print(f"{coin['name']} ({coin['symbol']})")
    print("=" * 80)
    
    prices = load_prices(coin["data_file"])
    log_prices = [math.log(p) for p in prices]
    log_returns = [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]
    
    S0 = prices[-1]
    n = len(prices)
    cp = coin.get("current_price", S0)
    
    ath = coin.get("ath", 0)
    atl = coin.get("atl", 0)
    ath_drop = (cp / ath - 1) * 100 if ath else 0
    
    # Basic stats
    r_mean = statistics.mean(log_returns)
    r_std = statistics.stdev(log_returns)
    r_min = min(log_returns)
    r_max = max(log_returns)
    daily_vol = r_std * math.sqrt(24)
    annual_vol = r_std * math.sqrt(24 * 365)
    annual_ret = (math.exp(r_mean * 24 * 365) - 1) * 100
    p_min = min(prices)
    p_max = max(prices)
    p_mean = statistics.mean(prices)
    range_pct = (p_max / p_min - 1) * 100
    
    # Kurtosis / Skew
    skew = statistics.mean([(r - r_mean)**3 for r in log_returns]) / r_std**3
    kurt = statistics.mean([(r - r_mean)**4 for r in log_returns]) / r_std**4
    
    # VaR
    ls = sorted(log_returns)
    var_95 = ls[int(len(ls) * 0.05)]
    var_99 = ls[int(len(ls) * 0.01)]
    
    # Hurst
    hurst = compute_hurst(log_prices)
    
    # Print
    mcap = coin.get("market_cap", 0) or 0
    rank = coin.get("mcap_rank", 0) or 0
    cats = ", ".join(coin.get("categories", [])[:3])
    
    print(f"  Current:     ${cp:.6f}")
    print(f"  Market Cap:  ${mcap:,.0f} (Rank #{rank})")
    print(f"  ATH:         ${ath:.4f} → Down {ath_drop:.1f}%")
    print(f"  ATL:         ${atl:.6f}")
    print(f"  Category:    {cats}")
    print(f"  Data:        {len(prices)} hourly points")
    
    print(f"\n  📊 VOLATILITY & RETURNS:")
    print(f"    30d range:         ${p_min:.6f} – ${p_max:.6f} ({range_pct:.0f}%)")
    print(f"    Mean hrly return:  {r_mean*100:.4f}%")
    print(f"    Std hrly return:   {r_std*100:.4f}%")
    print(f"    Daily volatility:  {daily_vol*100:.1f}%")
    print(f"    Annual volatility: {annual_vol*100:.1f}%")
    print(f"    Annual ret (geo):  {annual_ret:.1f}%")
    vol_label = "Extreme" if annual_vol > 2 else "Very high" if annual_vol > 1.5 else "High" if annual_vol > 1 else "Moderate"
    print(f"    Vol classification: {vol_label}")
    print(f"    Skewness:          {skew:.2f}")
    print(f"    Kurtosis:          {kurt:.2f}")
    
    print(f"\n  🎲 TAIL RISK:")
    print(f"    Min hrly return:   {r_min*100:.2f}%")
    print(f"    Max hrly return:   {r_max*100:.2f}%")
    print(f"    1h VaR (95%):      {var_95*100:.2f}%  (${cp * (math.exp(var_95)-1):.6f})")
    print(f"    1h VaR (99%):      {var_99*100:.2f}%  (${cp * (math.exp(var_99)-1):.6f})")
    print(f"    1d -1σ move:       ${cp * (1 - daily_vol):.6f} ({-daily_vol*100:.1f}%)")
    print(f"    1d -2σ move:       ${cp * (1 - 2*daily_vol):.6f} ({-2*daily_vol*100:.1f}%)")
    
    print(f"\n  🔄 BEHAVIOR:")
    print(f"    Hurst exponent:    {hurst:.4f}")
    if hurst > 0.55:
        print(f"    → Trending / momentum")
    elif hurst < 0.45:
        print(f"    → Mean-reverting")
    else:
        print(f"    → Random walk")
    
    # Autocorrelation at key lags
    r_var = statistics.variance(log_returns)
    print(f"    Lag-1 autocorr:    {autocorr(log_returns, 1, r_mean, r_var):+.4f}")
    print(f"    Lag-24 autocorr:   {autocorr(log_returns, 24, r_mean, r_var):+.4f}")
    
    # Optimal EMA
    best_p, best_sh, best_wr = find_optimal_ema(log_prices, log_returns)
    ema_vals = ema(prices, best_p)
    current_ema = ema_vals[-1]
    distance = (cp / current_ema - 1) * 100
    
    print(f"\n  📈 OPTIMAL TREND EMA:")
    print(f"    Optimal period:    {best_p}h ({best_p/24:.1f}d)")
    print(f"    Signal Sharpe:     {best_sh:.1f}")
    print(f"    Win rate:          {best_wr:.1f}%")
    print(f"    Current EMA:       ${current_ema:.6f}")
    print(f"    Price vs EMA:      {distance:+.2f}%")
    print(f"    Trend signal:      {'LONG ✅' if distance > 0 else 'SHORT ❌ (or flat)'}")

    # Monte Carlo 30-day
    random.seed(42)
    num_sims = 10000
    N = 720
    finals = []
    for _ in range(num_sims):
        S = S0
        for _ in range(N):
            S *= math.exp((r_mean - 0.5*r_std**2)*(1/24) + r_std*math.sqrt(1/24)*random.gauss(0,1))
        finals.append(S)
    finals.sort()
    p5 = finals[int(0.05*num_sims)]
    p50 = finals[int(0.50*num_sims)]
    p95 = finals[int(0.95*num_sims)]
    
    print(f"\n  🔮 MONTE CARLO 30-DAY (10,000 sims):")
    print(f"    Median:           ${p50:.6f} ({(p50/S0-1)*100:+.1f}%)")
    print(f"    5% VaR (worst):   ${p5:.6f} ({(p5/S0-1)*100:+.1f}%)")
    print(f"    95th (best):      ${p95:.6f} ({(p95/S0-1)*100:+.1f}%)")
    print(f"    Prob >+50%:       {sum(1 for p in finals if p > S0*1.5)/num_sims*100:.1f}%")
    print(f"    Prob >-50%:       {sum(1 for p in finals if p < S0*0.5)/num_sims*100:.1f}%")

for coin in coins:
    analyze_coin(coin)

print("\n\n" + "=" * 80)
print("COMPARISON TABLE")
print("=" * 80)
print(f"\n  {'Metric':<35} {'PENGUIN':>15} {'USELESS':>15} {'PUDGY':>15}")
print(f"  " + "-" * 80)
