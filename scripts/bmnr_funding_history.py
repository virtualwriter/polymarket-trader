#!/usr/bin/env python3
"""Fetch full BMNR funding history from Hyperliquid (Kinetiq Markets DEX) and analyze."""
import json, time, statistics
import urllib.request
from datetime import datetime, timezone, timedelta

COIN = "km:BMNR"
API = "https://api.hyperliquid.xyz/info"


def fetch_chunk(start_ms, end_ms=None):
    body = {"type": "fundingHistory", "coin": COIN, "startTime": start_ms}
    if end_ms:
        body["endTime"] = end_ms
    req = urllib.request.Request(
        API,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def fetch_all():
    all_records = []
    seen = set()
    cursor = 1730000000000  # Nov 2024 - well before BMNR was likely listed
    while True:
        chunk = fetch_chunk(cursor)
        if not chunk:
            break
        new = [r for r in chunk if r["time"] not in seen]
        for r in new:
            seen.add(r["time"])
            all_records.append(r)
        if len(chunk) < 500:
            break
        cursor = chunk[-1]["time"] + 1
        time.sleep(0.2)
    all_records.sort(key=lambda r: r["time"])
    return all_records


def main():
    records = fetch_all()
    if not records:
        print("No records.")
        return

    print(f"Total records: {len(records)}")
    first_dt = datetime.fromtimestamp(records[0]["time"] / 1000, tz=timezone.utc)
    last_dt = datetime.fromtimestamp(records[-1]["time"] / 1000, tz=timezone.utc)
    print(f"Range: {first_dt.isoformat()} to {last_dt.isoformat()}")
    print(f"Span:  {(last_dt - first_dt).days} days, {(last_dt - first_dt).total_seconds() / 3600:.1f} hours")

    # Convert hourly rates to annualized %
    def ann(r):
        return float(r["fundingRate"]) * 24 * 365 * 100

    rates = [ann(r) for r in records]
    print(f"\n=== Annualized Funding Rate Statistics (per hour, *24*365*100) ===")
    print(f"  Mean:    {statistics.mean(rates):+.2f}%")
    print(f"  Median:  {statistics.median(rates):+.2f}%")
    print(f"  Stdev:   {statistics.stdev(rates):.2f}%")
    print(f"  Min:     {min(rates):+.2f}%")
    print(f"  Max:     {max(rates):+.2f}%")
    print(f"  P10:     {statistics.quantiles(rates, n=10)[0]:+.2f}%")
    print(f"  P25:     {statistics.quantiles(rates, n=4)[0]:+.2f}%")
    print(f"  P75:     {statistics.quantiles(rates, n=4)[2]:+.2f}%")
    print(f"  P90:     {statistics.quantiles(rates, n=10)[8]:+.2f}%")

    neg_count = sum(1 for r in rates if r < 0)
    print(f"\n  Negative funding hours: {neg_count} / {len(rates)} ({neg_count / len(rates) * 100:.1f}%)")
    extreme_neg = sum(1 for r in rates if r < -50)
    print(f"  Hours with funding < -50% ann: {extreme_neg} ({extreme_neg / len(rates) * 100:.1f}%)")
    extreme_neg2 = sum(1 for r in rates if r < -100)
    print(f"  Hours with funding < -100% ann: {extreme_neg2} ({extreme_neg2 / len(rates) * 100:.1f}%)")

    # Cumulative funding earned by long
    # fundingRate is per-hour decimal. Long earns when rate is negative.
    # Per-hour return for 1x long from funding = -fundingRate
    cum = 0.0
    for r in records:
        cum += -float(r["fundingRate"])
    print(f"\n=== Cumulative funding for 1x LONG over full history ===")
    print(f"  Total return from funding alone: {cum * 100:+.2f}%")
    print(f"  Annualized rate over period:     {cum * 100 / ((last_dt - first_dt).days / 365):+.2f}%")

    # Daily aggregates
    print(f"\n=== Daily Aggregated Funding (last 30 days) ===")
    daily = {}
    for r in records:
        dt = datetime.fromtimestamp(r["time"] / 1000, tz=timezone.utc)
        day = dt.strftime("%Y-%m-%d")
        daily.setdefault(day, []).append(ann(r))

    days_sorted = sorted(daily.keys())
    for day in days_sorted[-30:]:
        vals = daily[day]
        avg = sum(vals) / len(vals)
        mn, mx = min(vals), max(vals)
        print(f"  {day}: avg={avg:+7.2f}%  min={mn:+7.2f}%  max={mx:+7.2f}%  ({len(vals)}h)")

    print(f"\n=== Daily averages (full history, weekly buckets) ===")
    weekly = {}
    for day, vals in daily.items():
        dt = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        # Week starting Monday
        week = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
        weekly.setdefault(week, []).extend(vals)

    for week in sorted(weekly.keys()):
        vals = weekly[week]
        avg = sum(vals) / len(vals)
        mn, mx = min(vals), max(vals)
        print(f"  Week of {week}: avg={avg:+7.2f}%  min={mn:+7.2f}%  max={mx:+7.2f}%  ({len(vals)}h)")

    # Save to CSV
    import csv
    out_path = "data/bmnr_funding_history.csv"
    with open(out_path, "w") as f:
        w = csv.writer(f)
        w.writerow(["time_ms", "datetime_utc", "funding_rate_hourly", "annualized_pct", "premium"])
        for r in records:
            dt = datetime.fromtimestamp(r["time"] / 1000, tz=timezone.utc)
            w.writerow([r["time"], dt.isoformat(), r["fundingRate"], ann(r), r["premium"]])
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
