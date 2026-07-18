#!/usr/bin/env python3
"""Backfill Hyperliquid fundingHistory rows into a joinable CSV."""

from __future__ import annotations

import argparse
import csv
import json
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

API = "https://api.hyperliquid.xyz/info"
MAX_CHUNK_DAYS = 14
REQUEST_LIMIT_SLEEP_SEC = 0.15

NATIVE_COINS = ["BTC", "ETH", "HYPE", "SOL"]
BUILDER_COINS = [
    ("xyz:AMZN", "AMZN"),
    ("xyz:AAPL", "AAPL"),
    ("xyz:AMD", "AMD"),
    ("xyz:ARM", "ARM"),
    ("xyz:BABA", "BABA"),
    ("xyz:BIRD", "BIRD"),
    ("xyz:BX", "BX"),
    ("xyz:CBRS", "CBRS"),
    ("xyz:COIN", "COIN"),
    ("xyz:COST", "COST"),
    ("xyz:CRCL", "CRCL"),
    ("xyz:DKNG", "DKNG"),
    ("xyz:EBAY", "EBAY"),
    ("xyz:GME", "GME"),
    ("xyz:GOOGL", "GOOGL"),
    ("xyz:HIMS", "HIMS"),
    ("xyz:HOOD", "HOOD"),
    ("xyz:INTC", "INTC"),
    ("xyz:LITE", "LITE"),
    ("xyz:LLY", "LLY"),
    ("xyz:META", "META"),
    ("xyz:MRVL", "MRVL"),
    ("xyz:MSFT", "MSFT"),
    ("xyz:MSTR", "MSTR"),
    ("xyz:MU", "MU"),
    ("xyz:NFLX", "NFLX"),
    ("xyz:NVDA", "NVDA"),
    ("xyz:ORCL", "ORCL"),
    ("xyz:PLTR", "PLTR"),
    ("xyz:RIVN", "RIVN"),
    ("xyz:RKLB", "RKLB"),
    ("xyz:SKHX", "SKHX"),
    ("xyz:SNDK", "SNDK"),
    ("xyz:TSLA", "TSLA"),
    ("xyz:TSM", "TSM"),
    ("xyz:ZM", "ZM"),
    ("xyz:GOLD", "GOLD"),
    ("xyz:CL", "OIL"),
    ("xyz:BRENTOIL", "BRENT_OIL"),
    ("xyz:SILVER", "SILVER"),
]


@dataclass(frozen=True)
class FundingCoin:
    coin: str
    label: str


def default_coins() -> list[FundingCoin]:
    native = [FundingCoin(coin, coin) for coin in NATIVE_COINS]
    builder = [FundingCoin(coin, label) for coin, label in BUILDER_COINS]
    return native + builder


def coin_aliases(coins: Iterable[FundingCoin]) -> dict[str, FundingCoin]:
    aliases: dict[str, FundingCoin] = {}
    for item in coins:
        aliases[item.coin.upper()] = item
        aliases[item.label.upper()] = item
        if item.coin.upper().startswith("XYZ:"):
            aliases[item.coin.split(":", 1)[1].upper()] = item
    aliases["GC"] = FundingCoin("xyz:GOLD", "GOLD")
    aliases["GOLD (GC)"] = FundingCoin("xyz:GOLD", "GOLD")
    aliases["CL"] = FundingCoin("xyz:CL", "OIL")
    aliases["OIL (CL)"] = FundingCoin("xyz:CL", "OIL")
    aliases["BRENTOIL"] = FundingCoin("xyz:BRENTOIL", "BRENT_OIL")
    return aliases


def parse_coin_arg(raw: str) -> list[FundingCoin]:
    all_coins = default_coins()
    aliases = coin_aliases(all_coins)
    selected: list[FundingCoin] = []
    seen: set[str] = set()
    for token in raw.replace(" ", ",").split(","):
        token = token.strip()
        if not token:
            continue
        item = aliases.get(token.upper())
        if item is None:
            item = FundingCoin(token, token.split(":", 1)[-1].upper())
        if item.coin not in seen:
            selected.append(item)
            seen.add(item.coin)
    return selected


def fetch_chunk(coin: str, start_ms: int, end_ms: int) -> list[dict]:
    body = {"type": "fundingHistory", "coin": coin, "startTime": start_ms, "endTime": end_ms}
    req = urllib.request.Request(
        API,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode())
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected response for {coin}: {payload!r}")
    return payload


def funding_ann_pct(record: dict) -> float:
    return float(record["fundingRate"]) * 24 * 365 * 100


def fetch_coin_history(item: FundingCoin, start_ms: int, end_ms: int) -> list[dict]:
    rows: list[dict] = []
    seen: set[int] = set()
    cursor = start_ms
    chunk_ms = MAX_CHUNK_DAYS * 24 * 60 * 60 * 1000

    while cursor < end_ms:
        chunk_end = min(cursor + chunk_ms, end_ms)
        while cursor < chunk_end:
            records = fetch_chunk(item.coin, cursor, chunk_end)
            if not records:
                break
            for record in records:
                ts = int(record["time"])
                if ts in seen or ts < start_ms or ts > end_ms:
                    continue
                seen.add(ts)
                dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
                rows.append({
                    "timestamp": dt.isoformat().replace("+00:00", "Z"),
                    "coin": item.coin,
                    "label": item.label,
                    "funding_8h": record.get("fundingRate", ""),
                    "funding_ann_pct": f"{funding_ann_pct(record):.8f}",
                })
            if len(records) < 500:
                break
            cursor = int(records[-1]["time"]) + 1
            time.sleep(REQUEST_LIMIT_SLEEP_SEC)
        cursor = max(cursor, chunk_end + 1)
        time.sleep(REQUEST_LIMIT_SLEEP_SEC)

    rows.sort(key=lambda row: row["timestamp"])
    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=90, help="Lookback days to fetch (default: 90).")
    parser.add_argument("--coins", help="Comma-separated labels or coins, e.g. MU,HOOD,xyz:AAPL,BTC,GOLD.")
    parser.add_argument("--out", default="data/hl-funding-history.csv", help="Output CSV path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.days <= 0:
        raise SystemExit("--days must be positive")
    coins = parse_coin_arg(args.coins) if args.coins else default_coins()
    end = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=args.days)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for item in coins:
        try:
            coin_rows = fetch_coin_history(item, start_ms, end_ms)
        except Exception as exc:
            print(f"WARN {item.coin}: {exc}")
            continue
        rows.extend(coin_rows)
        print(f"{item.label} ({item.coin}): {len(coin_rows)} rows")

    rows.sort(key=lambda row: (row["timestamp"], row["label"], row["coin"]))
    with out_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["timestamp", "coin", "label", "funding_8h", "funding_ann_pct"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} rows to {out_path}")


if __name__ == "__main__":
    main()
