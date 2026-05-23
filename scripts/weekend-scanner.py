#!/usr/bin/env python3
"""
Weekend Funding Scanner for ALL US Equity Perps on Hyperliquid Builder DEX.

Collects funding rate and mark price for every US stock perp every N seconds.
Appends to a CSV so we can analyze the weekend pattern with REAL data.

Usage:
  python3 scripts/weekend-scanner.py                    # runs once, prints to stdout
  python3 scripts/weekend-scanner.py --daemon            # runs every 300s, appends to CSV
  python3 scripts/weekend-scanner.py --daemon --interval 60  # every 60s
"""

import requests, time, csv, os, sys, argparse
from datetime import datetime, timezone

HL_API = "https://api.hyperliquid.xyz/info"

EXCLUDE = {
    "EUR","JPY","GBP","KRW","GOLD","SILVER","PLATINUM","PALLADIUM",
    "CL","COPPER","NATGAS","CORN","WHEAT","BRENTOIL","URANIUM",
    "ALUMINIUM","XYZ100","SP500","SPCX","JP225","NIFTY","DXY",
    "VIX","TTF","VOL","H100","DRAM","PURRDAT","CRWV","USAR",
    "EWY","EWJ","EWT","EWZ","XLE","URNM","KR200","IBOV",
    "HYUNDAI","SOFTBANK","KIOXIA","SMSN","ASML"
}

OUTFILE = "data/weekend-funding-snapshot.csv"

def fetch_all():
    """Fetch all Builder DEX perps and return list of US stock dicts."""
    resp = requests.post(HL_API, json={"type": "metaAndAssetCtxs", "dex": "xyz"}, timeout=15)
    meta = resp.json()[0]
    ctxs = resp.json()[1]
    
    stocks = []
    for i, u in enumerate(meta["universe"]):
        name = u["name"].replace("xyz:", "")
        if name in EXCLUDE:
            continue
        ctx = ctxs[i]
        stocks.append({
            "name": name,
            "funding_8h": float(ctx["funding"]),
            "funding_ann": float(ctx["funding"]) * 24 * 365 * 100,
            "mark_px": float(ctx["markPx"]),
            "oracle_px": float(ctx.get("oraclePx", 0)),
            "premium": float(ctx.get("premium", 0)),
            "oi": float(ctx["openInterest"]) * float(ctx["markPx"]),
            "vol": float(ctx.get("dayNtlVlm", 0)),
        })
    return stocks

def snapshot_once():
    """Fetch once, print to stdout as CSV row."""
    stocks = fetch_all()
    stocks.sort(key=lambda s: s["name"])
    
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    header = "timestamp_utc," + ",".join(f"{s['name']}_funding_ann,{s['name']}_mark_px" for s in stocks)
    values = ts + "," + ",".join(f"{s['funding_ann']:.4f},{s['mark_px']:.4f}" for s in stocks)
    
    # Check if header exists
    needs_header = not os.path.exists(OUTFILE) or os.path.getsize(OUTFILE) == 0
    
    with open(OUTFILE, "a") as f:
        if needs_header:
            f.write(header + "\n")
        f.write(values + "\n")
    
    return stocks

def daemon(interval=300):
    """Run indefinitely, snapshotting every `interval` seconds."""
    print(f"[{datetime.now(timezone.utc).isoformat()}] Weekend scanner starting...")
    print(f"  Interval: {interval}s")
    print(f"  Output:   {OUTFILE}")
    print(f"  Ctrl+C to stop\n")
    
    counter = 0
    while True:
        try:
            stocks = snapshot_once()
            counter += 1
            row_count = sum(1 for _ in open(OUTFILE)) if os.path.exists(OUTFILE) else 0
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            avg_fund = sum(s["funding_ann"] for s in stocks) / len(stocks)
            print(f"[{ts}] #{counter:3d} | {len(stocks)} stocks | avg funding: {avg_fund:+.2f}% | total rows: {row_count-1}")
        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as e:
            print(f"[ERROR] {e}")
        
        time.sleep(interval)

def analyze():
    """Analyze already-collected data."""
    if not os.path.exists(OUTFILE):
        print("No data yet. Run --daemon first.")
        return
    
    with open(OUTFILE) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    if len(rows) < 2:
        print(f"Only {len(rows)} rows. Need more data for analysis.")
        return
    
    print(f"\n{'='*80}")
    print(f"WEEKEND FUNDING ANALYSIS — REAL DATA")
    print(f"{'='*80}")
    print(f"Snapshots: {len(rows)}")
    print(f"Date range: {rows[0]['timestamp_utc']} to {rows[-1]['timestamp_utc']}")
    print()
    
    # Identify stock columns (pairs of _funding_ann and _mark_px)
    cols = list(rows[0].keys())
    stock_names = sorted(set(c.replace("_funding_ann","").replace("_mark_px","") 
                              for c in cols if c != "timestamp_utc"))
    stock_names = [s for s in stock_names if s + "_funding_ann" in cols]
    
    print(f"Stocks tracked: {len(stock_names)}")
    
    for name in stock_names:
        fund_col = f"{name}_funding_ann"
        vals = []
        for r in rows:
            try:
                vals.append(float(r[fund_col]))
            except:
                continue
        
        if not vals:
            continue
        
        avg = sum(vals) / len(vals)
        neg_pct = sum(1 for v in vals if v < 0) / len(vals) * 100
        min_v = min(vals)
        max_v = max(vals)
        
        # By hour
        hour_vals = {}
        for r in rows:
            try:
                hr = int(r["timestamp_utc"].split("T")[1].split(":")[0])
                fv = float(r[fund_col])
                hour_vals.setdefault(hr, []).append(fv)
            except:
                continue
        
        print(f"\n  {name:>8s}: {len(vals):3d} samples | avg={avg:+.2f}% | neg={neg_pct:.0f}% | min={min_v:+.2f}% | max={max_v:+.2f}%")
        # Show hourly breakdown
        hrs = sorted(hour_vals.keys())
        if hrs:
            print(f"           Hourly: ", end="")
            for h in range(24):
                vals_h = hour_vals.get(h, [])
                if vals_h:
                    havg = sum(vals_h)/len(vals_h)
                    print(f"{h:02d}:{havg:+.1f}% ", end="")
                else:
                    print(f"{h:02d}:-- ", end="")
            print()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--daemon", action="store_true", help="Run continuously")
    parser.add_argument("--interval", type=int, default=300, help="Seconds between snapshots (default: 300)")
    parser.add_argument("--analyze", action="store_true", help="Analyze collected data")
    args = parser.parse_args()
    
    if args.analyze:
        analyze()
    elif args.daemon:
        daemon(interval=args.interval)
    else:
        # Run once and print
        stocks = fetch_all()
        stocks.sort(key=lambda s: -s["oi"])
        print(f"{'Stock':>8s} {'Mark':>10s} {'OI':>10s} {'Funding(ann)':>12s} {'Premium':>10s}")
        print("-" * 55)
        for s in stocks:
            oi_s = f"${s['oi']/1e6:.1f}M" if s['oi'] >= 1e6 else f"${s['oi']/1e3:.0f}K"
            print(f"{s['name']:>8s} ${s['mark_px']:<8.2f} {oi_s:>10s} {s['funding_ann']:>+10.2f}% {s['premium']*100:>+10.4f}%")
