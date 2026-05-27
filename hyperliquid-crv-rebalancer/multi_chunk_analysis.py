"""
Multi-chunk analysis: process 90-day hourly data for recent window,
plus daily data for each available 90-day chunk going back.
Uses CoinGecko free API data we already fetched.
"""
import json, math, statistics, random

chunks = {
    "PENGUIN": {
        "name": "Nietzschean Penguin",
        "symbol": "PENGUIN",
        "current": 0.002987,
        "mcap": 2979901,
        "90d_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/29f98de5-e4f6-412b-822d-6a1c149abb19.txt",
        "daily_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/e0d4b7ea-57c7-48ae-993a-d648be11b4c4.txt",
        "launch": "2026-01-22",
    },
    "USELESS": {
        "name": "Useless",
        "symbol": "USELESS",
        "mcap": 76713965,
        "90d_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/eff90cfc-2b71-4fb9-8814-b92e1b0e9e90.txt",
        "daily_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/ad552862-84c0-483b-8850-3c5a7c680d19.txt",
    },
    "PUDGY": {
        "name": "Pudgy Penguins",
        "symbol": "PUDGY",
        "mcap": 537715663,
        "90d_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/c78b8d5d-8e03-4804-8ec7-812ea39d1098.txt",
        "daily_file": "/Users/johnskapwingpc/.cursor/projects/Users-johnskapwingpc-Downloads-polymarket-trader/agent-tools/d1a762c9-12c1-4577-bb5b-11fc4cb2b052.txt",
    },
}

def load_prices(filepath):
    with open(filepath) as f:
        raw = f.read()
    data = json.loads(raw)
    return [p[1] for p in data["prices"]]

def compute(prices, label):
    if len(prices) < 5:
        return None
    log_returns = [math.log(prices[i]/prices[i-1]) for i in range(1, len(prices))]
    mu = statistics.mean(log_returns)
    sigma = statistics.stdev(log_returns)
    daily_vol = sigma * math.sqrt(24) if len(prices) > 100 else sigma * math.sqrt(1)
    annual_vol = sigma * math.sqrt(24*365) if len(prices) > 100 else sigma * math.sqrt(365)
    annual_ret = (math.exp(mu * (24*365 if len(prices) > 100 else 365)) - 1) * 100
    hurst_val = compute_hurst([math.log(p) for p in prices])
    return {
        "label": label,
        "n": len(prices),
        "freq": "hourly" if len(prices) > 100 else "daily",
        "mu": mu*100,
        "sigma": sigma*100,
        "daily_vol": daily_vol*100,
        "annual_vol": annual_vol*100,
        "annual_ret": annual_ret,
        "hurst": hurst_val,
        "p_start": prices[0],
        "p_end": prices[-1],
        "total_ret": (prices[-1]/prices[0]-1)*100,
    }

def compute_hurst(log_prices):
    n = len(log_prices)
    if n < 10:
        return 0.5
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

def chunk_daily(prices, chunk_size=90):
    """Split daily price array into chunks of chunk_size days, from newest to oldest."""
    chunks_list = []
    i = len(prices)
    chunk_num = 0
    while i > 0:
        start = max(0, i - chunk_size)
        chunk = prices[start:i]
        chunk_label = f"Days {start}-{i-1}" if len(chunk) > 1 else f"Day {start}"
        chunks_list.append((chunk, chunk_label, chunk_num))
        i = start
        chunk_num += 1
    return chunks_list

for coin_key, coin in chunks.items():
    print(f"\n{'='*80}")
    print(f"{coin['name']} ({coin['symbol']})")
    print(f"{'='*80}")

    all_results = []

    # 1) Latest 90 days — hourly data (best resolution)
    if coin.get("90d_file"):
        try:
            prices = load_prices(coin["90d_file"])
            r = compute(prices, f"Latest 90d (hourly)")
            if r:
                all_results.append(r)
        except:
            pass

    # 2) 365-day daily data — split into 90-day chunks
    if coin.get("daily_file"):
        try:
            daily_prices = load_prices(coin["daily_file"])
            # Filter out duplicates / same-day repeats that might be in the data
            # CoinGecko daily data has timestamps ascending
            chunks = chunk_daily(daily_prices, 90)
            for chunk_prices, chunk_label, chunk_num in chunks:
                # Assign meaningful date range labels
                start_dt = "?"  
                end_dt = "?"
                freq = "daily"
                r = compute(chunk_prices, f"Chunk {chunk_num}: {chunk_label}")
                if r:
                    all_results.append(r)
        except Exception as e:
            pass

    # Print results chronologically (oldest first = reversed)
    all_results.reverse()

    # Header
    print(f"\n  {'Window':<30} {'Pts':<6} {'Freq':<8} {'Return':<10} {'DailyVol':<10} {'AnnVol':<10} {'AnnRet':<12} {'Hurst':<8}")
    print(f"  {'-'*95}")
    for r in all_results:
        print(f"  {r['label']:<30} {r['n']:<6} {r['freq']:<8} {r['total_ret']:<+9.1f}% {r['daily_vol']:<9.1f}% {r['annual_vol']:<9.1f}% {r['annual_ret']:<+10.1f}% {r['hurst']:<8.3f}")

    # Summary
    print(f"\n  ► Latest hourly volatility:  {all_results[-1]['daily_vol']:.1f}% daily, {all_results[-1]['annual_vol']:.0f}% annualized" if all_results else "")
    print(f"  ► 90-day return:             {all_results[-1]['total_ret']:+.1f}%" if all_results else "")
    
    # If we have daily chunks, compare vols
    daily_chunks = [r for r in all_results if r['freq'] == 'daily']
    if len(daily_chunks) > 1:
        print(f"\n  ► Historical daily volatility by chunk:")
        for r in daily_chunks:
            print(f"    {r['label']:<30} {r['daily_vol']:>5.1f}% daily vol, {r['total_ret']:>+7.1f}% return")
        vol_range = max(r['daily_vol'] for r in daily_chunks) - min(r['daily_vol'] for r in daily_chunks)
        print(f"    Vol range: {vol_range:.1f}%")

print(f"\n{'='*80}")
print("KEY INSIGHTS")
print(f"{'='*80}")
print("""
  • 'Latest 90d (hourly)' is the highest-resolution estimate — use this for short-term analysis.
  • Daily chunks cover the full 365-day history but at 1 bar/day resolution.
  • Hourly vol is typically higher than daily vol because it captures intraday swings.
  • Compare daily vol across chunks to see if volatility is rising or falling.
""")
