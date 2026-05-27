"""
Fetch PURR + FARTCOIN data from CoinGecko (earlier 90 days) + Hyperliquid API.
Hyperliquid candleSnapshot gives up to 5000 candles per coin.
For 1h candles, that's ~208 days. For 4h, that's ~833 days.
We'll use 1h for recent/relevant data.
"""
import json, os, time, urllib.request, urllib.error
from datetime import datetime, timezone

COINS = {
    "purr":     {"cg_id": "purr-2", "hl_name": "PURR"},
    "fartcoin": {"cg_id": "fartcoin", "hl_name": "FARTCOIN"},
    "pump":     {"cg_id": "pump", "hl_name": "PUMP"},
}

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

def cg_fetch(url, max_retries=5):
    """Fetch CoinGecko URL with retry."""
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode()
                data = json.loads(raw)
                if isinstance(data, dict) and "status" in data:
                    if "429" in str(data):
                        wait = 20 * (attempt + 1)
                        print(f"    429, wait {wait}s...")
                        time.sleep(wait)
                        continue
                    print(f"    API error: {data['status']}")
                    return None
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 20 * (attempt + 1)
                print(f"    429, wait {wait}s...")
                time.sleep(wait)
                continue
            print(f"    HTTP error: {e}")
            return None
        except Exception as e:
            print(f"    Error: {e}")
            time.sleep(10)
            return None
    return None

def fetch_hyperliquid_candles(coin, interval="1h", start_time=0, end_time=0):
    """Fetch candles from Hyperliquid API."""
    if end_time == 0:
        end_time = int(datetime.now(timezone.utc).timestamp() * 1000)
    payload = json.dumps({
        "type": "candleSnapshot",
        "req": {
            "coin": coin,
            "interval": interval,
            "startTime": start_time,
            "endTime": end_time
        }
    }).encode()
    req = urllib.request.Request(
        "https://api.hyperliquid.xyz/info",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            return data  # array of candle objects
    except Exception as e:
        print(f"    HL API error: {e}")
        return None

def main():
    print("Fetching data from CoinGecko (earlier 90 days) + Hyperliquid API\n")

    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    # 90 days ago = ~May 26 - 90d = Feb 25
    # 180 days ago = ~Nov 27
    ninety_days_ms = 90 * 24 * 3600 * 1000  
    
    for coin_id, info in COINS.items():
        cg_id = info["cg_id"]
        hl_name = info["hl_name"]
        print(f"--- {coin_id} ({cg_id} / {hl_name}) ---")

        all_prices = []

        # === CoinGecko: fetch earlier 90 days (days 90-180 ago) ===
        # Current window was days=90 which returns hourly data
        # For earlier window, use market_chart with to/from params if available, 
        # or use the 90-day data which we already have, and we'll supplement with HL
        print(f"  [CG] Fetching 180-day market_chart...")
        data = cg_fetch(f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?days=max&vs_currency=usd")
        if data and "prices" in data:
            pts = data["prices"]
            print(f"  [CG] Got {len(pts)} points total")
            for ts, p in pts:
                all_prices.append((ts, p))
        else:
            print(f"  [CG] Failed, trying days=180...")
            time.sleep(12)
            data = cg_fetch(f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?days=180&vs_currency=usd")
            if data and "prices" in data:
                for ts, p in data["prices"]:
                    all_prices.append((ts, p))
                print(f"  [CG] Got {len(data['prices'])} points")

        time.sleep(12)

        # === Hyperliquid: fetch all available 1h candles ===
        # 5000 1h candles = ~208 days (more than enough for 180 days)
        print(f"  [HL] Fetching 1h candles for {hl_name}...")
        
        # Fetch in 2 chunks to be safe (2000 candles each = ~83 days)
        chunk_size = 2000 * 3600 * 1000  # 2000 hours in ms
        hl_end = now
        hl_start = now - 180 * 24 * 3600 * 1000  # 180 days back
        
        # But limit to recent 5000 candles from HL API
        hl_start = max(hl_start, now - 208 * 24 * 3600 * 1000)
        
        hl_candles = fetch_hyperliquid_candles(hl_name, "1h", hl_start, hl_end)
        if hl_candles and len(hl_candles) > 0:
            print(f"  [HL] Got {len(hl_candles)} 1h candles")
            for c in hl_candles:
                ts = c["t"]
                close = float(c["c"])
                all_prices.append((ts, close))
        else:
            # Try 4h candles as fallback
            print(f"  [HL] 1h empty, trying 4h...")
            hl_candles = fetch_hyperliquid_candles(hl_name, "4h", hl_start, hl_end)
            if hl_candles and len(hl_candles) > 0:
                print(f"  [HL] Got {len(hl_candles)} 4h candles")
                for c in hl_candles:
                    ts = c["t"]
                    close = float(c["c"])
                    all_prices.append((ts, close))

        # Merge: sort and dedup by hour bucket
        if all_prices:
            all_prices.sort(key=lambda x: x[0])
            
            # Round to hour
            hourly = {}
            for ts, p in all_prices:
                bucket = ts // 3600000
                if bucket not in hourly:
                    hourly[bucket] = p
            
            buckets = sorted(hourly.keys())
            merged = [hourly[b] for b in buckets]
            print(f"  Total: {len(merged)} unique hourly points")
            print(f"  Range: {datetime.fromtimestamp(buckets[0]*3600, tz=timezone.utc).strftime('%Y-%m-%d')} to {datetime.fromtimestamp(buckets[-1]*3600, tz=timezone.utc).strftime('%Y-%m-%d')}")
            
            out_path = os.path.join(OUT_DIR, f"{coin_id}_prices_180d.json")
            with open(out_path, "w") as f:
                json.dump(merged, f)
            print(f"  Saved to {out_path}")
        else:
            print(f"  NO DATA")

        time.sleep(5)

    print("\nDone")

if __name__ == "__main__":
    main()
