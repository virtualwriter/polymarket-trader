#!/usr/bin/env python3
"""Collect CME futures option chains through IBKR Client Portal Gateway.

This script is intentionally fail-closed: if the Client Portal Gateway is not
running or not authenticated, it prints an empty JSON object and logs the reason
to stderr. The market scanner can then keep using existing sources.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Tuple


BASE_URL = os.getenv("IBKR_CP_BASE", "https://127.0.0.1:5000/v1/api").rstrip("/")
TIMEOUT = float(os.getenv("IBKR_CP_TIMEOUT_SECONDS", "12"))
MAX_STRIKES_PER_MONTH = int(os.getenv("IBKR_CP_MAX_STRIKES_PER_MONTH", "7"))
MAX_MONTHS = int(os.getenv("IBKR_CP_MAX_MONTHS", "6"))
MARKETDATA_FIELDS = os.getenv("IBKR_CP_MARKETDATA_FIELDS", "31,84,86,87,7633,7635,6509")

ASSETS = {
    "BTC": {"snapshot_key": "CME_BTC", "symbol": "BTC"},
    "GOLD": {"snapshot_key": "CME_GC", "symbol": "GC"},
    "OIL": {"snapshot_key": "CME_CL", "symbol": "CL"},
}


class IbkrUnavailable(Exception):
    pass


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def cp_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    query = ""
    if params:
        query = "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{BASE_URL}{path}{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "polymarket-trader/ibkr-options/1.0"})
    ctx = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as res:
            raw = res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise IbkrUnavailable(f"IBKR gateway is not authenticated ({exc.code})")
        raise IbkrUnavailable(f"IBKR {path} failed: HTTP {exc.code}")
    except Exception as exc:
        raise IbkrUnavailable(f"IBKR {path} unavailable: {exc}")

    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def parse_num(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text or text in {"-", "--", "N/A"}:
        return None
    # IBKR can prefix last price with C/H markers.
    while text and text[0] in {"C", "H"}:
        text = text[1:].strip()
    if text.endswith("%"):
        text = text[:-1].strip()
    try:
        return float(text)
    except ValueError:
        return None


def parse_iv(value: Any) -> Optional[float]:
    num = parse_num(value)
    if num is None or num <= 0:
        return None
    return num / 100.0 if num > 3 else num


def flatten_futures_response(data: Any, symbol: str) -> List[Dict[str, Any]]:
    if isinstance(data, dict):
        raw = data.get(symbol) or data.get(symbol.upper()) or data.get(symbol.lower()) or data.get("futures")
        if isinstance(raw, list):
            return [x for x in raw if isinstance(x, dict)]
        if isinstance(raw, dict):
            return [raw]
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    return []


def month_codes() -> List[str]:
    override = os.getenv("IBKR_CP_FOP_MONTHS")
    if override:
        return [m.strip().upper() for m in override.split(",") if m.strip()]

    today = date.today()
    codes: List[str] = []
    month_names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    year = today.year
    month = today.month
    for i in range(0, 15):
        m = ((month - 1 + i) % 12) + 1
        y = year + (month - 1 + i) // 12
        codes.append(f"{month_names[m - 1]}{str(y)[-2:]}")
    # The Polymarket board currently has June and Dec 2026 contracts.
    for special in ("JUN26", "DEC26"):
        if special not in codes:
            codes.append(special)
    return codes[:MAX_MONTHS] if MAX_MONTHS > 0 else codes


def expiry_from_month_code(code: str) -> str:
    month_names = {
        "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
        "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12",
    }
    mon = month_names.get(code[:3].upper(), "01")
    yy = int(code[3:])
    year = 2000 + yy
    return f"{year:04d}-{mon}-01"


def choose_strikes(strikes: Iterable[Any], underlying: Optional[float]) -> List[float]:
    nums = sorted({x for x in (parse_num(s) for s in strikes) if x and x > 0})
    if not nums:
        return []
    if not underlying:
        mid = len(nums) // 2
        half = MAX_STRIKES_PER_MONTH // 2
        return nums[max(0, mid - half): mid + half + 1]
    nearby = sorted(nums, key=lambda s: abs(s / underlying - 1.0))
    return sorted(nearby[:MAX_STRIKES_PER_MONTH])


def strikes_from_response(data: Any) -> Tuple[List[Any], List[Any]]:
    if not isinstance(data, dict):
        return [], []
    calls = data.get("call") or data.get("calls") or data.get("C") or []
    puts = data.get("put") or data.get("puts") or data.get("P") or []
    if not calls and not puts:
        # Some responses are {"strikes": [...]} without side separation.
        strikes = data.get("strikes") or data.get("strike") or []
        calls = puts = strikes
    return list(calls or []), list(puts or [])


def first_conid(items: Any) -> Optional[int]:
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        return None
    for item in items:
        if isinstance(item, dict):
            conid = item.get("conid") or item.get("conId")
            if conid:
                return int(conid)
    return None


def snapshot_prices(conids: List[int]) -> Dict[int, Dict[str, Any]]:
    if not conids:
        return {}
    params = {"conids": ",".join(str(c) for c in conids), "fields": MARKETDATA_FIELDS}
    # Pre-flight; IBKR often needs one request to subscribe and one to return fields.
    try:
        cp_get("/iserver/marketdata/snapshot", params)
        time.sleep(float(os.getenv("IBKR_CP_PREFLIGHT_SLEEP_SECONDS", "1.0")))
    except IbkrUnavailable:
        raise
    except Exception:
        pass
    data = cp_get("/iserver/marketdata/snapshot", params)
    out: Dict[int, Dict[str, Any]] = {}
    if isinstance(data, list):
        for row in data:
            if isinstance(row, dict) and row.get("conid"):
                out[int(row["conid"])] = row
    return out


def mid_from_snapshot(row: Dict[str, Any]) -> Tuple[float, float, float]:
    bid = parse_num(row.get("84")) or 0.0
    ask = parse_num(row.get("86")) or 0.0
    mark = parse_num(row.get("7635"))
    last = parse_num(row.get("31"))
    if bid > 0 and ask > 0:
        mid = (bid + ask) / 2.0
    else:
        mid = mark or last or 0.0
    return bid, ask, mid


def collect_asset(asset: str, symbol: str, snapshot_key: str) -> Optional[Dict[str, Any]]:
    # Search initializes IBKR's derivative chain cache for this symbol.
    try:
        cp_get("/iserver/secdef/search", {"symbol": symbol, "secType": "FUT"})
    except IbkrUnavailable:
        raise
    except Exception as exc:
        log(f"{asset}: secdef/search warning: {exc}")

    futures = flatten_futures_response(cp_get("/trsrv/futures", {"symbols": symbol}), symbol)
    if not futures:
        log(f"{asset}: no futures contracts returned for {symbol}")
        return None

    futures = sorted(futures, key=lambda f: int(f.get("expirationDate") or f.get("lastTradeDateOrContractMonth") or 99999999))
    front = futures[0]
    front_conid = int(front.get("conid"))
    underlier_conids = []
    for fut in futures[:4]:
        for key in ("underlyingConid", "conid"):
            if fut.get(key):
                underlier_conids.append(int(fut[key]))
    underlier_conids = list(dict.fromkeys(underlier_conids))

    under_snap = snapshot_prices([front_conid]).get(front_conid, {})
    bid, ask, mid = mid_from_snapshot(under_snap)
    underlying = mid or parse_num(front.get("price")) or 0.0
    if underlying <= 0:
        log(f"{asset}: could not determine futures underlying price")
        return None

    chains: List[Dict[str, Any]] = []
    option_conids: Dict[int, Tuple[float, str, str]] = {}

    for month in month_codes():
        calls: List[Any] = []
        puts: List[Any] = []
        used_conid: Optional[int] = None
        for base_conid in underlier_conids:
            try:
                strikes = cp_get("/iserver/secdef/strikes", {
                    "conid": base_conid,
                    "sectype": "FOP",
                    "month": month,
                })
            except Exception:
                continue
            calls, puts = strikes_from_response(strikes)
            if calls or puts:
                used_conid = base_conid
                break
        if not used_conid:
            continue

        expiry = expiry_from_month_code(month)
        for right, strike_values, typ in (("C", calls, "call"), ("P", puts, "put")):
            for strike in choose_strikes(strike_values, underlying):
                try:
                    info = cp_get("/iserver/secdef/info", {
                        "conid": used_conid,
                        "secType": "FOP",
                        "month": month,
                        "strike": strike,
                        "right": right,
                    })
                except Exception:
                    continue
                conid = first_conid(info)
                if conid:
                    option_conids[conid] = (strike, typ, expiry)

    conid_items = list(option_conids.items())
    for i in range(0, len(conid_items), 25):
        batch = conid_items[i:i + 25]
        quotes = snapshot_prices([conid for conid, _ in batch])
        for conid, (strike, typ, expiry) in batch:
            row = quotes.get(conid, {})
            iv = parse_iv(row.get("7633"))
            if not iv:
                continue
            bid, ask, mid = mid_from_snapshot(row)
            chains.append({
                "strike": strike,
                "bid": bid,
                "ask": ask,
                "mid": mid,
                "volume": parse_num(row.get("87")) or 0,
                "openInterest": 0,
                "impliedVolatility": iv,
                "expiration": expiry,
                "type": typ,
            })

    if not chains:
        log(f"{asset}: no usable option quotes with implied vol")
        return None

    return {
        "symbol": snapshot_key,
        "underlyingPrice": underlying,
        "chains": chains,
        "source": f"IBKR Client Portal Gateway futures options ({symbol})",
    }


def main() -> None:
    try:
        cp_get("/tickle")
    except IbkrUnavailable as exc:
        log(str(exc))
        print("{}")
        return

    snapshots: Dict[str, Any] = {}
    for asset, cfg in ASSETS.items():
        try:
            snapshot = collect_asset(asset, cfg["symbol"], cfg["snapshot_key"])
            if snapshot:
                snapshots[cfg["snapshot_key"]] = snapshot
                log(f"{asset}: collected {len(snapshot['chains'])} options")
        except IbkrUnavailable as exc:
            log(str(exc))
            break
        except Exception as exc:
            log(f"{asset}: {exc}")

    print(json.dumps(snapshots))


if __name__ == "__main__":
    main()
