#!/usr/bin/env python3
"""Collect futures option chains from TradingView's options scanner.

This source is gated by TRADINGVIEW_COOKIE. Without an authenticated TradingView
session, TradingView returns an empty chain for subscribed products. The script
prints `{}` on any auth/source failure so the scanner can fail closed.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional


SCAN_URL = "https://scanner.tradingview.com/options/scan2"
TIMEOUT = float(os.getenv("TRADINGVIEW_TIMEOUT_SECONDS", "20"))
COOKIE = os.getenv("TRADINGVIEW_COOKIE", "").strip()
MAX_ROWS = int(os.getenv("TRADINGVIEW_OPTIONS_MAX_ROWS", "10000"))

DEFAULT_ASSETS = {
    "CME_CL": {"tv_symbol": "NYMEX:CL1!", "label": "TradingView NYMEX CL1! options"},
    "CME_GC": {"tv_symbol": "COMEX:GC1!", "label": "TradingView COMEX GC1! options"},
    "CME_BTC": {"tv_symbol": "CME:BTC1!", "label": "TradingView CME BTC1! options"},
    "CME_ES": {"tv_symbol": "CME_MINI:ES1!", "label": "TradingView CME E-mini S&P 500 options"},
}

FUTURES_MONTH_CODES = {
    "F": 1,
    "G": 2,
    "H": 3,
    "J": 4,
    "K": 5,
    "M": 6,
    "N": 7,
    "Q": 8,
    "U": 9,
    "V": 10,
    "X": 11,
    "Z": 12,
}


def log(message: str) -> None:
    print(message, file=sys.stderr)


def load_assets() -> Dict[str, Dict[str, str]]:
    override = os.getenv("TRADINGVIEW_OPTIONS_ASSETS", "").strip()
    if not override:
        return DEFAULT_ASSETS
    try:
        data = json.loads(override)
        out: Dict[str, Dict[str, str]] = {}
        for key, cfg in data.items():
            if cfg.get("tv_symbol"):
                out[key] = {
                    "tv_symbol": cfg["tv_symbol"],
                    "label": cfg.get("label", f"TradingView {cfg['tv_symbol']} options"),
                }
        return out or DEFAULT_ASSETS
    except Exception as exc:
        log(f"Invalid TRADINGVIEW_OPTIONS_ASSETS JSON: {exc}")
        return DEFAULT_ASSETS


def request_json(url: str, *, body: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Any:
    hdrs = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/",
    }
    if headers:
        hdrs.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        raw = res.read().decode("utf-8", errors="replace")
        return json.loads(raw)


def parse_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text or text in {"-", "—", "N/A"}:
        return None
    if text.endswith("%"):
        text = text[:-1].strip()
    try:
        return float(text)
    except ValueError:
        return None


def parse_expiration(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.isdigit() and len(text) == 8:
        return f"{text[:4]}-{text[4:6]}-{text[6:]}"
    if isinstance(value, (int, float)):
        # TradingView scanner dates are usually Unix seconds, but guard for ms.
        ts = float(value)
        if ts > 10_000_000_000:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
    if not text:
        return ""
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return text


def normalize_iv(value: Any) -> Optional[float]:
    iv = parse_float(value)
    if iv is None or iv <= 0:
        return None
    return iv / 100.0 if iv > 3 else iv


def row_implied_volatility(row: Dict[str, Any]) -> Optional[float]:
    bid_iv = normalize_iv(row.get("bid_iv"))
    ask_iv = normalize_iv(row.get("ask_iv"))
    quote_ivs = [iv for iv in (bid_iv, ask_iv) if iv is not None and iv > 0]
    if quote_ivs:
        return sum(quote_ivs) / len(quote_ivs)
    return normalize_iv(row.get("iv"))


def tradingview_close(symbol: str) -> Optional[float]:
    payload = {
        "columns": ["close"],
        "symbols": {"tickers": [symbol]},
    }
    try:
        data = request_json("https://scanner.tradingview.com/futures/scan2", body=payload, headers={"Cookie": COOKIE})
        rows = data.get("symbols") or []
        if not rows:
            return None
        values = rows[0].get("d") or rows[0].get("f") or []
        return parse_float(values[0] if values else None)
    except Exception as exc:
        log(f"TradingView futures close failed for {symbol}: {exc}")
        return None


def expand_underlyings(tv_symbol: str) -> List[str]:
    """TradingView option rows are keyed by expiring futures, not 1! symbols."""
    if not tv_symbol.endswith("1!"):
        return [tv_symbol]
    page_symbol = urllib.parse.quote(tv_symbol.replace(":", "-"), safe="-!")
    url = f"https://www.tradingview.com/symbols/{page_symbol}/options-chain/"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Cookie": COOKIE,
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            html = res.read().decode("utf-8", errors="replace")
        underlyings = list(dict.fromkeys(re.findall(r'"underlying":"([^"]+)"', html)))
        underlyings.sort(key=underlying_sort_key)
        return underlyings[: int(os.getenv("TRADINGVIEW_OPTIONS_MAX_UNDERLYINGS", "12"))] or [tv_symbol]
    except Exception as exc:
        log(f"{tv_symbol}: could not expand option underlyings: {exc}")
        return [tv_symbol]


def underlying_sort_key(symbol: str) -> tuple[int, int, str]:
    match = re.search(r"([FGHJKMNQUVXZ])(\d{4})$", symbol)
    if not match:
        return (9999, 99, symbol)
    month_code, year = match.groups()
    return (int(year), FUTURES_MONTH_CODES.get(month_code, 99), symbol)


def scanner_rows(tv_symbol: str) -> List[Dict[str, Any]]:
    columns = [
        "name",
        "ask",
        "bid",
        "currency",
        "delta",
        "expiration",
        "gamma",
        "iv",
        "option-type",
        "pricescale",
        "rho",
        "root",
        "strike",
        "theoPrice",
        "theta",
        "vega",
        "bid_iv",
        "ask_iv",
        "volume",
    ]
    underlyings = expand_underlyings(tv_symbol)
    payload = {
        "columns": columns,
        "filter2": {
            "operator": "and",
            "operands": [
                {"expression": {"left": "type", "operation": "equal", "right": "option"}},
            ],
        },
        "index_filters": [{"name": "underlying_symbol", "values": underlyings}],
        "range": [0, MAX_ROWS],
    }
    data = request_json(SCAN_URL, body=payload, headers={"Cookie": COOKIE})
    fields = data.get("fields", columns)
    rows = []
    for item in data.get("symbols", []) or []:
        values = (item.get("d") or item.get("f")) if isinstance(item, dict) else None
        if not isinstance(values, list):
            continue
        row = {field: values[i] if i < len(values) else None for i, field in enumerate(fields)}
        if isinstance(item, dict) and item.get("s"):
            row["name"] = row.get("name") or item["s"]
        rows.append(row)
    return rows


def row_to_quote(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    strike = parse_float(row.get("strike"))
    expiration = parse_expiration(row.get("expiration"))
    opt_type = str(row.get("option-type") or row.get("option_type") or "").lower()
    if opt_type in {"c", "call", "calls"}:
        typ = "call"
    elif opt_type in {"p", "put", "puts"}:
        typ = "put"
    else:
        name = str(row.get("name") or "").lower()
        if " call" in name or name.endswith("c"):
            typ = "call"
        elif " put" in name or name.endswith("p"):
            typ = "put"
        else:
            return None

    iv = row_implied_volatility(row)
    if strike is None or strike <= 0 or not expiration or iv is None:
        return None

    bid = parse_float(row.get("bid")) or 0.0
    ask = parse_float(row.get("ask")) or 0.0
    mid = (bid + ask) / 2.0 if bid > 0 and ask > 0 else (parse_float(row.get("theoPrice")) or 0.0)

    return {
        "contractSymbol": row.get("name") or "",
        "root": row.get("root") or "",
        "strike": strike,
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "volume": parse_float(row.get("volume")) or 0,
        "openInterest": parse_float(row.get("open_interest")) or 0,
        "impliedVolatility": iv,
        "expiration": expiration,
        "type": typ,
    }


def collect_snapshot(key: str, cfg: Dict[str, str]) -> Optional[Dict[str, Any]]:
    rows = scanner_rows(cfg["tv_symbol"])
    quotes = [quote for row in rows if (quote := row_to_quote(row))]
    if not quotes:
        log(f"{key}: no usable TradingView option rows for {cfg['tv_symbol']} (rows={len(rows)})")
        return None
    underlying = tradingview_close(cfg["tv_symbol"]) or 0.0
    if underlying <= 0:
        strikes = sorted(q["strike"] for q in quotes)
        underlying = strikes[len(strikes) // 2]
    return {
        "symbol": key,
        "underlyingPrice": underlying,
        "chains": quotes,
        "source": cfg["label"],
    }


def main() -> None:
    if not COOKIE:
        log("TRADINGVIEW_COOKIE not set")
        print("{}")
        return

    snapshots: Dict[str, Any] = {}
    for key, cfg in load_assets().items():
        try:
            snap = collect_snapshot(key, cfg)
            if snap:
                snapshots[key] = snap
                log(f"{key}: collected {len(snap['chains'])} TradingView option rows")
            time.sleep(0.25)
        except urllib.error.HTTPError as exc:
            log(f"{key}: TradingView HTTP {exc.code}")
        except Exception as exc:
            log(f"{key}: TradingView collector error: {exc}")
    print(json.dumps(snapshots))


if __name__ == "__main__":
    main()
