"""
Fetch more granular price data for coins using multiple strategies.
Tries market_chart (which may return hourly for popular coins) and
overlapping OHLC windows.
"""
import json, os, time, urllib.request, urllib.error

COINS = {
    "fartcoin": {"cg_id": "fartcoin", "name": "Fartcoin"},
    "purr":     {"cg_id": "purr-2", "name": "Purr"},
    "pump":     {"cg_id": "pump", "name": "Pump"},
}

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

def fetch_with_retries(url, max_retries=5):
    """Fetch URL with retry on 429."""
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode()
                data = json.loads(raw)
                if isinstance(data, dict) and "status" in data:
                    msg = str(data)
                    if "429" in msg:
                        wait = 20 * (attempt + 1)
                        print(f"    429, wait {wait}s...")
                        time.sleep(wait)
                        continue
                    print(f"    API error: {msg}")
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

def main():
    print("Fetching price data for fartcoin, purr, pump\n")
    
    for coin_id, info in COINS.items():
        cg_id = info["cg_id"]
        name = info["name"]
        print(f"--- {name} ({cg_id}) ---")

        all_data = []
        
        # Strategy 1: market_chart with days=90 (free tier: daily for 90d)
        print(f"  Fetching market_chart days=90...")
        data = fetch_with_retries(f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?days=90&vs_currency=usd")
        if data and "prices" in data:
            pts = data["prices"]
            print(f"  Got {len(pts)} points")
            for ts, p in pts:
                all_data.append((int(ts//3600000), p))  # round to hour
        time.sleep(12)

        # Strategy 2: market_chart days=30 (free tier: hourly for 30d)
        print(f"  Fetching market_chart days=30...")
        data = fetch_with_retries(f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?days=30&vs_currency=usd")
        if data and "prices" in data:
            pts = data["prices"]
            print(f"  Got {len(pts)} points")
            for ts, p in pts:
                all_data.append((int(ts//3600000), p))
        time.sleep(12)

        # Strategy 3: ohlc days=14 (4h candles)
        print(f"  Fetching ohlc days=14...")
        data = fetch_with_retries(f"https://api.coingecko.com/api/v3/coins/{cg_id}/ohlc?days=14&vs_currency=usd")
        if data and isinstance(data, list):
            print(f"  Got {len(data)} candles")
            for ts, o, h, l, c in data:
                all_data.append((int(ts//3600000), c))

        if all_data:
            # Sort, dedup by hour bucket
            all_data.sort(key=lambda x: x[0])
            deduped = []
            seen = set()
            for bucket, p in all_data:
                if bucket not in seen:
                    seen.add(bucket)
                    deduped.append(p)
            print(f"  Total unique: {len(deduped)} points")
            
            # Save
            out_path = os.path.join(OUT_DIR, f"{coin_id}_prices.json")
            with open(out_path, "w") as f:
                json.dump(deduped, f)
            print(f"  Saved to {out_path}")
        else:
            print(f"  NO DATA")
        
        time.sleep(15)

    print("\nDone")

if __name__ == "__main__":
    main()
