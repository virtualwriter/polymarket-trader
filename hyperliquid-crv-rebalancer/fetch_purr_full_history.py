"""
Fetch ALL available PURR 1h data from CoinGecko (max days).
Then run the 5h EMA 1%/1% strategy on whatever data we get.
"""
import json, os, time, math, statistics, urllib.request, urllib.error
from datetime import datetime, timezone

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
COIN_ID = "purr-2"

def fetch_with_retries(url, max_retries=5):
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode()
                data = json.loads(raw)
                if isinstance(data, dict) and "status" in data:
                    if "429" in str(data):
                        wait = 20 * (attempt + 1)
                        print(f"  429, wait {wait}s...")
                        time.sleep(wait)
                        continue
                    print(f"  API error: {data['status']}")
                    return None
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 20 * (attempt + 1)
                print(f"  429, wait {wait}s...")
                time.sleep(wait)
                continue
            print(f"  HTTP error: {e}")
            return None
        except Exception as e:
            print(f"  Error: {e}")
            time.sleep(10)
            return None
    return None

# ---------- Fetch data ----------
print("Fetching PURR data from CoinGecko...")
print()

# Try days=max (should return all available hourly data)
# Free tier typically returns ~365 days of daily or ~90 days of hourly
# But sometimes returns a lot more for popular coins
all_prices = []

for days_param in ["max", "365", "180", "90"]:
    print(f"  Fetching market_chart days={days_param}...")
    data = fetch_with_retries(
        f"https://api.coingecko.com/api/v3/coins/{COIN_ID}/market_chart?days={days_param}&vs_currency=usd"
    )
    if data and "prices" in data:
        pts = data["prices"]
        print(f"  Got {len(pts)} points")
        for ts, p in pts:
            all_prices.append((ts, p))
    else:
        print(f"  No data")
    time.sleep(12)

# Also try OHLC for longer windows (gives 4h candles for >7 days)
for days_param in ["90", "30"]:
    print(f"  Fetching ohlc days={days_param}...")
    data = fetch_with_retries(
        f"https://api.coingecko.com/api/v3/coins/{COIN_ID}/ohlc?days={days_param}&vs_currency=usd"
    )
    if data and isinstance(data, list) and len(data) > 10:
        print(f"  Got {len(data)} candles")
        for ts, o, h, l, c in data:
            all_prices.append((ts, c))
    else:
        print(f"  No data")
    time.sleep(12)

# Merge and deduplicate
if not all_prices:
    print("NO DATA from CoinGecko")
    exit(1)

all_prices.sort(key=lambda x: x[0])
hourly = {}
for ts, p in all_prices:
    bucket = ts // 3600000
    if bucket not in hourly:
        hourly[bucket] = p

buckets = sorted(hourly.keys())
prices = [hourly[b] for b in buckets]
start_dt = datetime.fromtimestamp(buckets[0]*3600, tz=timezone.utc)
end_dt = datetime.fromtimestamp(buckets[-1]*3600, tz=timezone.utc)

print(f"\nTotal unique hourly points: {len(prices)}")
print(f"Range: {start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')}")

# Save for later use
out_path = os.path.join(OUT_DIR, "purr_prices_cg_max.json")
with open(out_path, "w") as f:
    json.dump(prices, f)
print(f"Saved to {out_path}")

# ---------- Run 5h EMA 1%/1% backtest ----------
if len(prices) < 10:
    print("Too few data points")
    exit(1)

def compute_ema(prices, period):
    if len(prices) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    ema[period-1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        ema[i] = prices[i] * k + ema[i-1] * (1 - k)
    return ema

def backtest_5h(prices, ep=5, ent=1, ext=1, lev=1):
    ema = compute_ema(prices, ep)
    cap = 10000.0
    eq = [cap]
    inp = False
    epr = ecap = None
    tr = wi = li = 0
    mm = 0.05
    
    for i in range(ep, len(prices)):
        p, e = prices[i], ema[i]
        if e is None:
            eq.append(cap); continue
        if not inp:
            if p > e * (1 + ent/100):
                inp, epr, ecap = True, p, cap
                tr += 1
        else:
            if lev > 1 and p <= epr * (1 - 1/lev + mm):
                cap *= (1 - 1/lev + mm - 0.02)
                if cap < 0: cap = 0
                li += 1; inp = False; eq.append(cap); continue
            if p < e * (1 - ext/100):
                raw = p / epr - 1
                cap = ecap * (1 + raw * lev)
                if raw * lev > 0: wi += 1
                inp = False
        eq.append(cap)
    
    if inp:
        p = prices[-1]
        raw = p / epr - 1
        cap = ecap * (1 + raw * lev)
        if raw * lev > 0: wi += 1
    
    ret = (cap / 10000.0 - 1) * 100
    rets = [eq[i]/eq[i-1]-1 for i in range(1, len(eq)) if eq[i-1] > 0]
    sh = (statistics.mean(rets)/statistics.stdev(rets)*math.sqrt(8760)) if len(rets)>1 and statistics.stdev(rets)!=0 else 0
    pk = eq[0]; mdd = 0
    for v in eq:
        if v > pk: pk = v
        dd = (pk - v)/pk * 100
        if dd > mdd: mdd = dd
    wr = (wi/tr * 100) if tr else 0
    return {'ret': ret, 'sharpe': sh, 'mdd': mdd, 'trades': tr, 'wr': wr, 'liqs': li, 'final': cap, 'equity': eq}

print(f"\n{'='*65}")
print(f"  5h EMA 1%/1% Strategy Backtest (1x)")
print(f"  Data: {len(prices)} hourly candles, {start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')}")
print(f"{'='*65}")

r = backtest_5h(prices, 5, 1, 1, 1)
print(f"  Starting capital: \$10,000")
print(f"  Final capital:    \${r['final']:>9,.2f}")
print(f"  Total return:     {r['ret']:>+9.1f}%")
print(f"  Sharpe:           {r['sharpe']:>9.2f}")
print(f"  Max drawdown:     {r['mdd']:>9.1f}%")
print(f"  Trades:           {r['trades']:>9}")
print(f"  Win rate:         {r['wr']:>8.1f}%")

# Monthly breakdown
print(f"\n  Monthly breakdown:")
eq = r['equity']
hours_per_month = 30 * 24
for month in range(0, len(eq), hours_per_month):
    m_start = month
    m_end = min(month + hours_per_month, len(eq))
    if m_start >= len(eq):
        break
    if m_start >= len(prices):
        break
    # Get the date for this month
    ts_ms = buckets[m_start] * 3600000 if m_start < len(buckets) else buckets[-1] * 3600000
    month_date = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime('%Y-%m')
    seg_ret = (eq[m_end-1] / eq[m_start] - 1) * 100
    print(f"    {month_date}: {seg_ret:+.1f}%")

# Split into halves for consistency check
print(f"\n  Consistency check (split):")
split = len(prices) // 2
p1 = prices[:split]
p2 = prices[split:]
r1 = backtest_5h(p1, 5, 1, 1, 1)
r2 = backtest_5h(p2, 5, 1, 1, 1)
print(f"    First half:  {r1['ret']:+.1f}% ({r1['trades']} trades, Sharpe {r1['sharpe']:.2f})")
print(f"    Second half: {r2['ret']:+.1f}% ({r2['trades']} trades, Sharpe {r2['sharpe']:.2f})")

# Buy & Hold comparison
bnh = (prices[-1] / prices[0] - 1) * 100
print(f"\n  Buy & Hold: {bnh:+.1f}%")
print(f"  Strategy alpha: {r['ret'] - bnh:+.1f}%")

print(f"\n{'='*65}")
print(f"  DONE")
print(f"{'='*65}")
