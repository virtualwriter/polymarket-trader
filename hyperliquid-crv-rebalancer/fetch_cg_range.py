#!/usr/bin/env python3
"""
CoinGecko Hourly Data Fetcher — for any coin
=============================================
Fetches full hourly history from CoinGecko by paginating 30-day windows
of the /market_chart/range endpoint (free tier).

Usage:
    # Fetch all configured coins
    python fetch_cg_range.py

    # Fetch a specific coin
    python fetch_cg_range.py --coin fartcoin

    # Custom date range
    python fetch_cg_range.py --coin pump --start 2025-06-01 --end 2025-12-31
"""

import json
import time
import urllib.request
import datetime
import argparse
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
COINS = {
    "purr":     {"cg_id": "purr-2",   "name": "Purr"},
    "fartcoin": {"cg_id": "fartcoin", "name": "Fartcoin"},
}

OUT_DIR = Path(__file__).parent
COINS_CACHE_FILE = OUT_DIR / ".coins_cache.json"
# CoinGecko public (no-key) API allows ~30 calls/min. 3s = 20/min — well under
# the cap, avoids most 429s. The retry-on-429/5xx logic below backs off if hit.
REQUEST_DELAY = 3  # seconds between API calls


def load_coin_cache() -> dict:
    """Load any previously resolved tickers from cache."""
    if COINS_CACHE_FILE.exists():
        try:
            return json.loads(COINS_CACHE_FILE.read_text())
        except Exception:
            return {}
    return {}


def save_coin_cache(cache: dict):
    COINS_CACHE_FILE.write_text(json.dumps(cache, indent=2))


def resolve_ticker(ticker: str) -> dict:
    """Look up a ticker symbol on CoinGecko and return {cg_id, name, key}.

    Tries: explicit cache, COINS dict, then CG /search endpoint.
    """
    ticker_lower = ticker.lower()
    if ticker_lower in COINS:
        return {**COINS[ticker_lower], "key": ticker_lower}

    cache = load_coin_cache()
    if ticker_lower in cache:
        return cache[ticker_lower]

    # Search CoinGecko
    url = f"https://api.coingecko.com/api/v3/search?query={ticker_lower}"
    print(f"  Searching CoinGecko for '{ticker}'...")
    data = fetch_cg(url)
    if not data or "coins" not in data:
        return None

    # Find exact symbol match first, otherwise top result
    candidates = data["coins"]
    exact = [c for c in candidates if c.get("symbol", "").lower() == ticker_lower]
    if exact:
        # Prefer highest market cap (lowest market_cap_rank, but None goes last)
        exact.sort(key=lambda c: c.get("market_cap_rank") or 9_999_999)
        pick = exact[0]
    elif candidates:
        pick = candidates[0]
    else:
        return None

    result = {
        "cg_id": pick["id"],
        "name": pick["name"],
        "key": ticker_lower,
    }
    print(f"  Resolved '{ticker}' → {result['name']} (id={result['cg_id']})")

    # Cache it
    cache[ticker_lower] = result
    save_coin_cache(cache)
    return result


def fetch_cg(url: str) -> dict:
    """Fetch from CoinGecko with retry on 429 / 5xx transient errors."""
    max_attempts = 5
    for attempt in range(max_attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
                if isinstance(data, dict) and "status" in data:
                    err = str(data.get("status", {}).get("error_code", ""))
                    if "429" in err or "rate_limit" in str(data).lower():
                        wait = 20 * (attempt + 1)
                        print(f"  Rate limited, waiting {wait}s...", flush=True)
                        time.sleep(wait)
                        continue
                    print(f"  API error: {data}")
                    return None
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"  HTTP 429, waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            # 5xx are transient — retry with exponential backoff
            if 500 <= e.code < 600:
                wait = 5 * (attempt + 1)
                print(f"  HTTP {e.code} (transient), waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            print(f"  HTTP {e.code}: {e.reason}")
            return None
        except Exception as e:
            wait = 5 * (attempt + 1)
            print(f"  Error: {e}, waiting {wait}s...", flush=True)
            time.sleep(wait)
            continue
    print(f"  Giving up after {max_attempts} attempts")
    return None


def fetch_coin(cg_id: str, start_ts: int, end_ts: int, out_file: str) -> list:
    """Fetch hourly prices for a coin from CoinGecko."""
    now_ts = int(time.time())
    all_prices = []
    current = start_ts

    print(f"  Fetching {cg_id} from {datetime.datetime.fromtimestamp(start_ts).strftime('%Y-%m-%d')} "
          f"to {datetime.datetime.fromtimestamp(end_ts).strftime('%Y-%m-%d')}")

    while current < end_ts:
        chunk_end = min(current + 30 * 24 * 3600, end_ts)
        url = (f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart/range"
               f"?vs_currency=usd&from={current}&to={chunk_end}")

        d1 = datetime.datetime.fromtimestamp(current).strftime("%Y-%m-%d")
        d2 = datetime.datetime.fromtimestamp(chunk_end).strftime("%Y-%m-%d")
        print(f"  {d1} → {d2}...", end=" ", flush=True)

        data = fetch_cg(url)
        if data and "prices" in data:
            pts = data["prices"]
            print(f"{len(pts)} pts")
            for ts, p in pts:
                all_prices.append((ts, p))
        else:
            print("NO DATA")

        current = chunk_end
        if current < end_ts:
            print(f"  Waiting {REQUEST_DELAY}s...", flush=True)
            time.sleep(REQUEST_DELAY)

    if not all_prices:
        print("  No data fetched!")
        return []

    # Deduplicate by hour bucket
    all_prices.sort(key=lambda x: x[0])
    hourly = {}
    for ts, p in all_prices:
        bucket = ts // 3600000  # ms → hour
        hourly[bucket] = p

    buckets = sorted(hourly.keys())
    prices = [hourly[b] for b in buckets]

    # Show range
    if buckets:
        first = datetime.datetime.fromtimestamp(buckets[0] * 3600, tz=datetime.timezone.utc)
        last = datetime.datetime.fromtimestamp(buckets[-1] * 3600, tz=datetime.timezone.utc)
        print(f"\n  Total: {len(prices)} hourly points")
        print(f"  Range: {first.strftime('%Y-%m-%d %H:%M')} → {last.strftime('%Y-%m-%d %H:%M')}")
        print(f"  Price: ${prices[0]:.4f} → ${prices[-1]:.4f} ({((prices[-1]/prices[0]-1)*100):+.1f}%)")

    # Save
    output_path = OUT_DIR / out_file
    with open(output_path, "w") as f:
        json.dump(prices, f)
    print(f"  Saved to {output_path.name}")

    # Also save raw with timestamps
    raw_file = output_path.with_name(output_path.stem + "_raw.json")
    raw_save = [(b * 3600000, hourly[b]) for b in buckets]
    with open(raw_file, "w") as f:
        json.dump(raw_save, f)
    print(f"  Raw saved to {raw_file.name}")

    return prices


def main():
    parser = argparse.ArgumentParser(description="Fetch hourly price data from CoinGecko")
    parser.add_argument("--coin", type=str, default=None,
                        help="Coin/ticker to fetch (auto-resolves via CG search if unknown). "
                             "Default: all configured")
    parser.add_argument("--tickers", type=str, default=None,
                        help="Comma-separated list of tickers to fetch in one go "
                             "(e.g. 'hype,sol,doge')")
    parser.add_argument("--start", type=str, default=None,
                        help="Start date (YYYY-MM-DD). Default: ~1 year ago")
    parser.add_argument("--end", type=str, default=None,
                        help="End date (YYYY-MM-DD). Default: today")
    parser.add_argument("--delay", type=int, default=REQUEST_DELAY,
                        help=f"Delay between API calls (default: {REQUEST_DELAY}s)")
    args = parser.parse_args()

    # Parse dates
    if args.start:
        start_dt = datetime.datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
    else:
        start_dt = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=365)
        start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)

    if args.end:
        end_dt = datetime.datetime.strptime(args.end, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
    else:
        end_dt = datetime.datetime.now(datetime.timezone.utc)

    start_ts = int(start_dt.timestamp())
    end_ts = int(end_dt.timestamp())

    if start_ts >= end_ts:
        print("Error: start date must be before end date")
        sys.exit(1)

    # Determine which coins to fetch
    coins_to_fetch = {}
    if args.tickers:
        for t in args.tickers.split(","):
            t = t.strip()
            if not t:
                continue
            resolved = resolve_ticker(t)
            if resolved:
                coins_to_fetch[resolved["key"]] = resolved
            else:
                print(f"  Could not resolve '{t}' on CoinGecko")
    elif args.coin:
        resolved = resolve_ticker(args.coin)
        if resolved:
            coins_to_fetch[resolved["key"]] = resolved
        else:
            print(f"  Could not resolve '{args.coin}' on CoinGecko")
            sys.exit(1)
    else:
        coins_to_fetch = {k: {**v, "key": k} for k, v in COINS.items()}

    keys = list(coins_to_fetch.keys())
    for i, (coin_key, conf) in enumerate(coins_to_fetch.items()):
        print(f"\n{'=' * 60}")
        print(f"  {conf['name']} ({conf['cg_id']})")
        print(f"{'=' * 60}")
        out_file = f"{coin_key}_prices_cg_range.json"
        fetch_coin(conf["cg_id"], start_ts, end_ts, out_file)
        if i < len(keys) - 1:
            print(f"\n  Waiting {args.delay}s before next coin...", flush=True)
            time.sleep(args.delay)

    print("\nDone.")
    if coins_to_fetch:
        print(f"\nFetched: {', '.join(c['name'] for c in coins_to_fetch.values())}")
        print(f"Next: run `python3 monthly_breakdown.py --csv` to update the analysis.")


if __name__ == "__main__":
    main()
