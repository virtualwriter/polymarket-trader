#!/usr/bin/env python3
"""
Build a cross-venue relative value report from existing market snapshots.

This is intentionally read-only with respect to the trader. It reads the latest
line from data/instrument-snapshots.jsonl and writes separate report artifacts:

  - relative-value/cross_venue_relative_value.csv
  - relative-value/index.html

The report compares configured Polymarket contracts against options-implied
probabilities where options data exists, and adds perp/funding context from
Hyperliquid. It is a relative-value dashboard, not a risk-free arbitrage model.
"""

from __future__ import annotations

import argparse
import os
from bisect import bisect_left
import csv
import html
import json
import math
import re
import shlex
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SNAPSHOT_PATH = DATA_DIR / "instrument-snapshots.jsonl"
HOSTED_DIR = ROOT / "relative-value"
CSV_PATH = HOSTED_DIR / "cross_venue_relative_value.csv"
HTML_PATH = HOSTED_DIR / "index.html"
LATEST_JSON_PATH = HOSTED_DIR / "latest.json"
DEFAULT_ARCHIVE_DIR = Path(os.getenv("RELATIVE_VALUE_HISTORY_DIR", str(HOSTED_DIR / "history")))
VALUATIONS_PATH = DATA_DIR / "daily-valuations.csv"
MODEL_VERSION = "relative_value_heatmap_v2_one_touch"
EASTERN_TIME = ZoneInfo("America/New_York")
OPTION_EXPIRY_WINDOW_DAYS = 45.0
OPTION_STRIKE_LOG_WINDOW = 0.35


ASSET_TO_OPTION_SYMBOLS = {
    "BTC": ["CME_BTC", "IBIT"],
    "ETH": ["ETHA"],
    "GOLD": ["CME_GC"],
    "OIL": ["CME_CL"],
    "AMZN": ["AMZN"],
    "SPY": ["CME_ES", "SPY"],
}


@dataclass
class RelativeValueRow:
    timestamp: str
    model_version: str
    asset: str
    event_slug: str
    market_id: str
    contract_question: str
    contract_month: str
    direction: str
    strike: float
    expiry: str
    dte_days: Optional[float]
    spot: Optional[float]
    option_symbol: str
    option_underlying: Optional[float]
    option_source: str
    iv_resolution: str
    option_iv: Optional[float]
    pm_iv: Optional[float]
    options_terminal_prob: Optional[float]
    options_touch_adjusted_prob: Optional[float]
    pm_yes_price: Optional[float]
    pm_best_bid: Optional[float]
    pm_best_ask: Optional[float]
    pm_spread: Optional[float]
    pm_quote_source: str
    liquidity: Optional[float]
    volume: Optional[float]
    underlying_cap_yes_price: Optional[float]
    pm_to_underlying_cap_ratio: Optional[float]
    underlying_cap_signal: str
    settlement_yes_sum: Optional[float]
    settlement_overround: Optional[float]
    settlement_tail_yes: Optional[float]
    settlement_skew_yes: Optional[float]
    buy_yes_edge_pts: Optional[float]
    sell_yes_edge_pts: Optional[float]
    best_expression: str
    edge_score: Optional[float]
    edge_pts_per_dte: Optional[float]
    edge_pts_per_dte_7d_change: Optional[float]
    eligible_displayable: bool
    eligible_for_shadow: bool
    eligible_for_backtest: bool
    edge_bucket: str
    perp_mark: Optional[float]
    perp_source: str
    perp_funding_ann: Optional[float]
    perp_oi_usd: Optional[float]
    perp_basis_pct: Optional[float]
    flags: str
    notes: str


def safe_float(value: Any) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        value = float(value)
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    except (TypeError, ValueError):
        return None


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def parse_time(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def fmt_eastern_time(value: str) -> str:
    parsed = parse_time(value)
    if not parsed:
        return value
    return parsed.astimezone(EASTERN_TIME).strftime("%Y-%m-%d %I:%M %p %Z")


MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def contract_month_year_from_question(question: str, expiry_dt: Optional[datetime]) -> Optional[Tuple[int, int]]:
    q = question.lower()
    for key, month_num in MONTHS.items():
        if re.search(rf"\b{key}\b", q):
            year_match = re.search(rf"\b{key}\b.{{0,40}}?(20\d{{2}})", q)
            year = int(year_match.group(1)) if year_match else None
            if year is None and expiry_dt:
                expiry_utc = expiry_dt.astimezone(timezone.utc)
                year = expiry_utc.year
                if month_num == 12 and expiry_utc.month == 1:
                    year -= 1
            if year is None:
                return None
            return year, month_num
    if expiry_dt:
        expiry_utc = expiry_dt.astimezone(timezone.utc)
        return expiry_utc.year, expiry_utc.month
    return None


def last_business_day_of_month(year: int, month: int) -> datetime:
    if month == 12:
        day = datetime(year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
    else:
        day = datetime(year, month + 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


def option_model_expiry_target(question: str, expiry_dt: Optional[datetime]) -> Optional[datetime]:
    parsed = contract_month_year_from_question(question, expiry_dt)
    if not parsed:
        return expiry_dt
    year, month = parsed
    return last_business_day_of_month(year, month)


def contract_month_from_question(question: str, expiry_dt: Optional[datetime]) -> str:
    months = {key: key.title() for key in MONTHS}
    q = question.lower()
    for key, label in months.items():
        if re.search(rf"\b{key}\b", q):
            year_match = re.search(rf"\b{key}\b.{{0,40}}?(20\d{{2}})", q)
            year = year_match.group(1) if year_match else None
            if not year and expiry_dt:
                year = str(expiry_dt.astimezone(timezone.utc).year)
            return f"{label} {year}" if year else label
    if expiry_dt:
        return expiry_dt.astimezone(timezone.utc).strftime("%B %Y")
    return ""


def snapshot_time(snapshot: Dict[str, Any]) -> datetime:
    raw = str(snapshot.get("timestamp", ""))
    parsed = parse_time(raw)
    if parsed:
        return parsed.astimezone(timezone.utc)
    # Snapshot timestamps are usually YYYY-MM-DDTHH.
    try:
        return datetime.strptime(raw, "%Y-%m-%dT%H").replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def read_latest_snapshot(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Missing snapshot file: {path}")
    with path.open("rb") as fh:
        fh.seek(0, 2)
        end = fh.tell()
        if end <= 0:
            raise ValueError(f"Snapshot file is empty: {path}")

        # Skip trailing newlines, then scan backward to the previous newline.
        while end > 0:
            fh.seek(end - 1)
            if fh.read(1) not in (b"\n", b"\r"):
                break
            end -= 1

        pos = end
        chunks: List[bytes] = []
        while pos > 0:
            read_size = min(1024 * 1024, pos)
            pos -= read_size
            fh.seek(pos)
            chunk = fh.read(read_size)
            newline_idx = chunk.rfind(b"\n")
            if newline_idx >= 0:
                chunks.append(chunk[newline_idx + 1:])
                break
            chunks.append(chunk)

    latest = b"".join(reversed(chunks)).decode("utf-8")
    return json.loads(latest)


def read_latest_csv_row(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        return {}
    # Scanner rows can temporarily miss an options source. Forward-fill each
    # column so the report can still use the latest known IV for screening.
    filled: Dict[str, str] = {}
    for row in rows:
        for key, value in row.items():
            if value not in (None, ""):
                filled[key] = value
            elif key not in filled:
                filled[key] = ""
    return filled


def fetch_hyperliquid_xyz_market(coin: str) -> Dict[str, Optional[float]]:
    body = json.dumps({"type": "metaAndAssetCtxs", "dex": "xyz"}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.hyperliquid.xyz/info",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "cross-venue-relative-value-report"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            meta, contexts = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {}

    for item, context in zip(meta.get("universe", []), contexts):
        if item.get("name") != coin:
            continue
        mark = safe_float(context.get("markPx"))
        funding = safe_float(context.get("funding"))
        open_interest = safe_float(context.get("openInterest"))
        return {
            "markPx": mark,
            "fundingAnnualized": funding * 24 * 365 if funding is not None else None,
            "openInterestUsd": open_interest * mark if open_interest is not None and mark is not None else None,
        }
    return {}


def pm_iv_for_asset(latest_valuations: Dict[str, str], asset: str) -> Optional[float]:
    key_by_asset = {
        "BTC": "btc_pm_iv",
        "HYPE": "hype_pm_iv",
        "GOLD": "gold_pm_iv",
        "OIL": "oil_pm_iv",
    }
    key = key_by_asset.get(asset)
    if not key:
        return None
    value = safe_float(latest_valuations.get(key))
    if value is None:
        return None
    # daily-valuations.csv stores IV columns as percentages.
    return value / 100.0


def option_iv_from_valuations(latest_valuations: Dict[str, str], asset: str, dte_days: Optional[float]) -> Tuple[Optional[float], str]:
    keys_by_asset = {
        "BTC": ("btc_opt_iv_30d", "btc_opt_iv_90d"),
        "GOLD": ("gold_opt_iv_30d", "gold_opt_iv_90d"),
        "OIL": ("oil_opt_iv_30d", "oil_opt_iv_90d"),
        "AMZN": ("amzn_opt_iv_30d", "amzn_opt_iv_90d"),
    }
    keys = keys_by_asset.get(asset)
    if not keys:
        return None, ""
    near_key, far_key = keys
    preferred_key = near_key if dte_days is None or dte_days <= 60 else far_key
    fallback_key = far_key if preferred_key == near_key else near_key
    value = safe_float(latest_valuations.get(preferred_key))
    source_key = preferred_key
    if value is None:
        value = safe_float(latest_valuations.get(fallback_key))
        source_key = fallback_key
    if value is None:
        return None, ""
    # daily-valuations.csv stores IV columns as percentages.
    return value / 100.0, source_key


def option_chain_for_asset(snapshot: Dict[str, Any], asset: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    options = snapshot.get("options", {})
    for symbol in ASSET_TO_OPTION_SYMBOLS.get(asset, []):
        chain = options.get(symbol)
        if isinstance(chain, dict):
            return symbol, chain
    return "", None


def scaled_option_strike(
    asset: str,
    option_symbol: str,
    pm_strike: float,
    asset_spot: Optional[float],
    option_underlying: Optional[float],
) -> Optional[float]:
    if not asset_spot or not option_underlying or asset_spot <= 0:
        return None
    if option_symbol in {"IBIT", "ETHA", "CME_ES", "SPY"}:
        return pm_strike * (option_underlying / asset_spot)
    return pm_strike


def choose_iv_for_expiry(
    option_snapshot: Dict[str, Any],
    target_expiry: Optional[datetime],
    target_strike: Optional[float],
    now: Optional[datetime] = None,
    relevant_targets: Optional[List[Tuple[Optional[datetime], Optional[float]]]] = None,
) -> Tuple[Optional[float], str]:
    chains = option_snapshot.get("chains", [])
    underlying = safe_float(option_snapshot.get("underlyingPrice"))
    if not chains or not underlying:
        return None, ""

    now = now or datetime.now(timezone.utc)
    target_specs: List[Tuple[float, Optional[float]]] = []
    for expiry, strike in relevant_targets or []:
        if expiry:
            days = max(1.0, (expiry - now).total_seconds() / 86400)
        else:
            days = 60.0
        target_specs.append((days, strike))
    target_key = "|".join(f"{round(days, 1)}:{round(strike or 0.0, 2)}" for days, strike in target_specs[:80])
    cache_key = f"_iv_expiry_buckets_{now.date().isoformat()}_{target_key}"
    cached = option_snapshot.get(cache_key)
    if isinstance(cached, dict):
        expiry_buckets = cached
    else:
        buckets: Dict[str, Dict[str, Any]] = {}
        for item in chains:
            exp = parse_time(str(item.get("expiration", "")))
            if not exp:
                continue
            exp_utc = exp.astimezone(timezone.utc)
            dte = max(0.0, (exp_utc - now).total_seconds() / 86400)
            if dte < 1.0:
                continue
            iv = safe_float(item.get("impliedVolatility"))
            if not iv or iv <= 0:
                continue
            strike = safe_float(item.get("strike")) or underlying
            if target_specs and not any(
                abs(dte - target_days) <= OPTION_EXPIRY_WINDOW_DAYS
                and (
                    target_strike is None
                    or abs(math.log(max(strike, 0.01) / max(target_strike, 0.01))) <= OPTION_STRIKE_LOG_WINDOW
                )
                for target_days, target_strike in target_specs
            ):
                continue
            expiry_iso = exp_utc.date().isoformat()
            bucket = buckets.setdefault(expiry_iso, {"dte": dte, "rows": [], "liquid_rows": []})
            row = (strike, item)
            bucket["rows"].append(row)
            if (safe_float(item.get("bid")) or 0) > 0 and (safe_float(item.get("ask")) or 0) > 0:
                bucket["liquid_rows"].append(row)

        expiry_buckets = {}
        for expiry_iso, bucket in buckets.items():
            rows = sorted(bucket["rows"], key=lambda row: row[0])
            liquid_rows = sorted(bucket["liquid_rows"], key=lambda row: row[0])
            if rows:
                expiry_buckets[expiry_iso] = {
                    "dte": bucket["dte"],
                    "rows": rows,
                    "strikes": [row[0] for row in rows],
                    "liquid_rows": liquid_rows,
                    "liquid_strikes": [row[0] for row in liquid_rows],
                }
        option_snapshot[cache_key] = expiry_buckets

    target_days = 60.0
    if target_expiry:
        target_days = max(1.0, (target_expiry - now).total_seconds() / 86400)

    if not expiry_buckets:
        return None, ""

    selected_expiry, selected_bucket = min(
        expiry_buckets.items(),
        key=lambda row: (abs(float(row[1]["dte"]) - target_days), row[0]),
    )
    use_liquid = len(selected_bucket["liquid_rows"]) >= 2
    rows = selected_bucket["liquid_rows"] if use_liquid else selected_bucket["rows"]
    strikes = selected_bucket["liquid_strikes"] if use_liquid else selected_bucket["strikes"]
    strike_target = target_strike or underlying
    idx = bisect_left(strikes, strike_target)
    window = rows[max(0, idx - 6):idx + 6]
    ranked = sorted(
        window,
        key=lambda row: abs(math.log(max(row[0], 0.01) / max(strike_target, 0.01))),
    )
    top = ranked[:4]
    if not top:
        return None, ""
    iv = sum(float(item["impliedVolatility"]) for _, item in top) / len(top)
    expiry = str(top[0][1].get("expiration", selected_expiry))
    return iv, expiry


def relevant_option_targets_for_event(
    event: Dict[str, Any],
    asset: str,
    option_symbol: str,
    option_snapshot: Optional[Dict[str, Any]],
    spot: Optional[float],
) -> List[Tuple[Optional[datetime], Optional[float]]]:
    if not option_snapshot:
        return []
    option_underlying = safe_float(option_snapshot.get("underlyingPrice")) or spot
    targets: List[Tuple[Optional[datetime], Optional[float]]] = []
    seen = set()
    for contract in event.get("contracts", []):
        if contract.get("closed") or not contract.get("active", True):
            continue
        strike = safe_float(contract.get("strike"))
        question = str(contract.get("question", ""))
        expiry_dt = parse_time(str(contract.get("endDate") or ""))
        model_expiry_dt = option_model_expiry_target(question, expiry_dt)
        option_strike = scaled_option_strike(asset, option_symbol, strike or 0.0, spot, option_underlying)
        key = (
            model_expiry_dt.date().isoformat() if model_expiry_dt else "",
            round(option_strike or 0.0, 2),
        )
        if key in seen:
            continue
        seen.add(key)
        targets.append((model_expiry_dt, option_strike))
    return targets


def lognormal_terminal_probability(
    spot: Optional[float],
    strike: Optional[float],
    iv: Optional[float],
    dte_days: Optional[float],
    direction: str,
) -> Optional[float]:
    if not spot or not strike or not iv or not dte_days or spot <= 0 or strike <= 0 or iv <= 0 or dte_days <= 0:
        return None
    t = dte_days / 365.0
    sigma_t = iv * math.sqrt(t)
    if sigma_t <= 0:
        return None
    d2 = (math.log(spot / strike) - 0.5 * iv * iv * t) / sigma_t
    if direction == "above":
        return norm_cdf(d2)
    if direction == "below":
        return norm_cdf(-d2)
    return None


def parse_settlement_range(question: str) -> Optional[Tuple[float, float]]:
    import re

    match = re.search(r"settle\s+at\s+\$?([\d,]+)\s*-\s*\$?([\d,]+)", question, flags=re.IGNORECASE)
    if not match:
        return None
    lo = safe_float(match.group(1).replace(",", ""))
    hi = safe_float(match.group(2).replace(",", ""))
    if lo is None or hi is None:
        return None
    return (min(lo, hi), max(lo, hi))


def lognormal_range_probability(
    spot: Optional[float],
    low: Optional[float],
    high: Optional[float],
    iv: Optional[float],
    dte_days: Optional[float],
) -> Optional[float]:
    if not spot or not low or not high or not iv or not dte_days or spot <= 0 or low <= 0 or high <= 0 or iv <= 0 or dte_days <= 0:
        return None
    below_high = lognormal_terminal_probability(spot, high, iv, dte_days, "below")
    below_low = lognormal_terminal_probability(spot, low, iv, dte_days, "below")
    if below_high is None or below_low is None:
        return None
    return max(0.0, min(1.0, below_high - below_low))


def one_touch_probability(
    spot: Optional[float],
    strike: Optional[float],
    iv: Optional[float],
    dte_days: Optional[float],
    direction: str,
) -> Optional[float]:
    """Approximate no-drift GBM one-touch probability for hit/reach/dip markets."""
    if not spot or not strike or not iv or not dte_days or spot <= 0 or strike <= 0 or iv <= 0 or dte_days <= 0:
        return None
    if direction == "above" and spot >= strike:
        return 1.0
    if direction == "below" and spot <= strike:
        return 1.0
    t = dte_days / 365.0
    sigma_t = iv * math.sqrt(t)
    if sigma_t <= 0:
        return None
    d1 = (math.log(spot / strike) + 0.5 * iv * iv * t) / sigma_t
    if direction == "above":
        return min(0.99, max(0.0, 2.0 * norm_cdf(d1)))
    if direction == "below":
        return min(0.99, max(0.0, 2.0 * norm_cdf(-d1)))
    return None


def is_one_touch_question(question: str) -> bool:
    q = question.lower()
    return "hit" in q or "reach" in q or "dip" in q


def touch_adjusted_probability(
    terminal_prob: Optional[float],
    direction: str,
    question: str,
    spot: Optional[float] = None,
    strike: Optional[float] = None,
    iv: Optional[float] = None,
    dte_days: Optional[float] = None,
) -> Optional[float]:
    if terminal_prob is None:
        return None
    if not is_one_touch_question(question):
        return terminal_prob
    touch_prob = one_touch_probability(spot, strike, iv, dte_days, direction)
    if touch_prob is not None:
        return max(terminal_prob, touch_prob)
    # Fallback for incomplete rows: preserve the old screening approximation,
    # but keep the primary path on the named/tested one-touch helper above.
    if direction in {"above", "below"}:
        return min(0.99, max(0.0, 2.0 * terminal_prob))
    return terminal_prob


def underlying_cap_yes_price(spot: Optional[float], strike: Optional[float], direction: str, question: str) -> Optional[float]:
    q = question.lower()
    if direction != "above" or "hit" not in q and "reach" not in q:
        return None
    if not spot or not strike or spot <= 0 or strike <= 0 or strike <= spot:
        return None
    # If spot doubles to the strike, the underlying has a 100% return, so a
    # binary YES priced above spot/strike pays less than simply holding spot.
    return min(1.0, max(0.0, spot / strike))


def underlying_cap_signal(pm_yes: Optional[float], cap: Optional[float]) -> Tuple[Optional[float], str]:
    if pm_yes is None or cap is None or cap <= 0:
        return None, ""
    ratio = pm_yes / cap
    if ratio > 1.0:
        return ratio, "above_underlying_cap"
    if ratio >= 0.85:
        return ratio, "near_underlying_cap_bullish"
    if ratio <= 0.35:
        return ratio, "cheap_vs_underlying_cap_bearish"
    return ratio, "mid_underlying_cap_ratio"


def iv_resolution_for(option_snapshot: Optional[Dict[str, Any]], valuation_iv_key: str, option_iv: Optional[float]) -> str:
    if valuation_iv_key:
        return "valuations_fallback"
    if option_snapshot and option_iv is not None:
        source = str(option_snapshot.get("source", "")).lower()
        if "tradingview" in source or source == "tv":
            return "tv_chain"
        return "cme_snapshot"
    return ""


def eligibility_flags(
    best_expression: str,
    edge_score: Optional[float],
    dte_days: Optional[float],
    spread: Optional[float],
    liquidity: Optional[float],
    flags: List[str],
) -> Tuple[bool, bool, bool]:
    flag_set = set(flags)
    display_blockers = {"wide_pm_spread", "low_pm_liquidity", "missing_options_iv", "no_listed_options_mapping"}
    cap_blockers = {"above_underlying_cap", "near_underlying_cap_bullish"}
    risk_blockers = display_blockers | cap_blockers | {"extreme_perp_funding"}
    has_trade_expression = best_expression in {"buy_yes", "sell_yes_or_buy_no"}
    has_edge = edge_score is not None and abs(edge_score) >= 5
    has_dte = dte_days is not None and dte_days >= 7
    displayable = has_trade_expression and edge_score is not None and not flag_set.intersection(display_blockers)
    eligible_for_shadow = (
        displayable
        and has_edge
        and has_dte
        and not flag_set.intersection(risk_blockers)
        and spread is not None
        and spread <= 0.01
        and liquidity is not None
        and liquidity >= 5_000
    )
    eligible_for_backtest = (
        displayable
        and has_edge
        and has_dte
        and not flag_set.intersection(risk_blockers)
        and spread is not None
        and spread <= 0.02
        and liquidity is not None
        and liquidity >= 2_000
    )
    return displayable, eligible_for_shadow, eligible_for_backtest


def settlement_bucket_metrics(contracts: Iterable[Dict[str, Any]]) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    settle_contracts = [
        contract for contract in contracts
        if "settle at" in str(contract.get("question", "")).lower()
        and safe_float(contract.get("yesPrice")) is not None
    ]
    if len(settle_contracts) < 2:
        return None, None, None, None

    yes_sum = sum(safe_float(contract.get("yesPrice")) or 0.0 for contract in settle_contracts)
    top = max(
        (contract for contract in settle_contracts if contract.get("direction") == "above"),
        key=lambda contract: safe_float(contract.get("strike")) or float("-inf"),
        default=None,
    )
    bottom = min(
        (contract for contract in settle_contracts if contract.get("direction") == "below"),
        key=lambda contract: safe_float(contract.get("strike")) or float("inf"),
        default=None,
    )
    top_yes = safe_float(top.get("yesPrice")) if top else None
    bottom_yes = safe_float(bottom.get("yesPrice")) if bottom else None
    tail_yes = None if top_yes is None and bottom_yes is None else (top_yes or 0.0) + (bottom_yes or 0.0)
    skew_yes = None if top_yes is None or bottom_yes is None else top_yes - bottom_yes
    return yes_sum, yes_sum - 1.0, tail_yes, skew_yes


def edge_bucket(score: Optional[float]) -> str:
    if score is None:
        return "no-options"
    if score >= 20:
        return "strong-long-tail"
    if score >= 10:
        return "long-tail"
    if score >= 5:
        return "mild-long-tail"
    if score <= -20:
        return "strong-short-rich-tail"
    if score <= -10:
        return "short-rich-tail"
    if score <= -5:
        return "mild-short-rich-tail"
    return "near-fair"


def html_class(score: Optional[float]) -> str:
    if score is None:
        return "missing"
    if score >= 20:
        return "pos3"
    if score >= 10:
        return "pos2"
    if score >= 5:
        return "pos1"
    if score <= -20:
        return "neg3"
    if score <= -10:
        return "neg2"
    if score <= -5:
        return "neg1"
    return "neutral"


def fmt_pct(value: Optional[float], digits: int = 1) -> str:
    if value is None:
        return ""
    return f"{value * 100:.{digits}f}%"


def fmt_pts(value: Optional[float], digits: int = 1) -> str:
    if value is None:
        return ""
    return f"{value:+.{digits}f}"


def fmt_num(value: Optional[float], digits: int = 2) -> str:
    if value is None:
        return ""
    return f"{value:.{digits}f}"


GAMMA_EVENT_URL = "https://gamma-api.polymarket.com/events/slug"
CLOB_BOOK_URL = "https://clob.polymarket.com/book"
HTTP_HEADERS = {"Accept": "application/json", "User-Agent": "cross-venue-relative-value-report/1.0"}


def fetch_json_url(url: str) -> Any:
    request = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_json_field(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value if value is not None else fallback


def best_book_level(levels: List[Dict[str, Any]], side: str) -> Tuple[Optional[float], Optional[float]]:
    parsed: List[Tuple[float, float]] = []
    for level in levels:
        price = safe_float(level.get("price"))
        size = safe_float(level.get("size"))
        if price is not None and size is not None and price > 0 and size > 0:
            parsed.append((price, size))
    if not parsed:
        return None, None
    return max(parsed) if side == "bid" else min(parsed)


def live_clob_book(token_id: str) -> Dict[str, Optional[float]]:
    url = f"{CLOB_BOOK_URL}?{urllib.parse.urlencode({'token_id': token_id})}"
    book = fetch_json_url(url)
    bid, bid_size = best_book_level(book.get("bids", []), "bid")
    ask, ask_size = best_book_level(book.get("asks", []), "ask")
    return {
        "bid": bid,
        "ask": ask,
        "bidSize": bid_size,
        "askSize": ask_size,
        "spread": (ask - bid) if bid is not None and ask is not None else None,
    }


def live_gamma_markets(event_slug: str) -> Dict[str, Dict[str, Any]]:
    try:
        event = fetch_json_url(f"{GAMMA_EVENT_URL}/{urllib.parse.quote(event_slug)}")
    except Exception as exc:
        print(f"Warning: live Gamma fetch failed for {event_slug}: {exc}")
        return {}
    markets: Dict[str, Dict[str, Any]] = {}
    for market in event.get("markets", []):
        market_id = str(market.get("id", ""))
        if market_id:
            markets[market_id] = market
    return markets


def live_clob_quote_for_market(market: Dict[str, Any]) -> Dict[str, Any]:
    outcomes = parse_json_field(market.get("outcomes"), [])
    token_ids = parse_json_field(market.get("clobTokenIds"), [])
    if len(outcomes) != len(token_ids) or "Yes" not in outcomes or "No" not in outcomes:
        return {}
    try:
        yes_book = live_clob_book(str(token_ids[outcomes.index("Yes")]))
        no_book = live_clob_book(str(token_ids[outcomes.index("No")]))
    except Exception as exc:
        print(f"Warning: live CLOB fetch failed for market {market.get('id')}: {exc}")
        return {}
    yes_bid = yes_book.get("bid")
    yes_ask = yes_book.get("ask")
    if yes_bid is None or yes_ask is None or yes_bid <= 0 or yes_ask <= 0:
        return {}
    midpoint = (yes_bid + yes_ask) / 2
    return {
        "yesPrice": midpoint,
        "bestBid": yes_bid,
        "bestAsk": yes_ask,
        "spread": yes_ask - yes_bid,
        "liquidity": safe_float(market.get("liquidity")),
        "volume": safe_float(market.get("volume")),
        "quoteSource": "live_clob",
        "noBestBid": no_book.get("bid"),
        "noBestAsk": no_book.get("ask"),
    }


def build_rows(
    snapshot: Dict[str, Any],
    latest_valuations: Optional[Dict[str, str]] = None,
    hyperliquid_overrides: Optional[Dict[str, Dict[str, Optional[float]]]] = None,
    min_liquidity: float = 0.0,
    refresh_live_quotes: bool = False,
) -> List[RelativeValueRow]:
    ts = str(snapshot.get("timestamp", ""))
    snap_dt = snapshot_time(snapshot)
    spots = snapshot.get("spots", {})
    hyperliquid = snapshot.get("hyperliquid", {})
    latest_valuations = latest_valuations or {}
    hyperliquid_overrides = hyperliquid_overrides or {}
    rows: List[RelativeValueRow] = []
    events = snapshot.get("polymarket", [])
    relevant_targets_by_asset: Dict[str, List[Tuple[Optional[datetime], Optional[float]]]] = {}
    seen_targets_by_asset: Dict[str, set] = {}

    for event in events:
        asset = str(event.get("asset", ""))
        option_symbol, option_snapshot = option_chain_for_asset(snapshot, asset)
        spot = safe_float(spots.get(asset))
        targets = relevant_option_targets_for_event(event, asset, option_symbol, option_snapshot, spot)
        asset_targets = relevant_targets_by_asset.setdefault(asset, [])
        seen_targets = seen_targets_by_asset.setdefault(asset, set())
        for expiry, strike in targets:
            key = (expiry.date().isoformat() if expiry else "", round(strike or 0.0, 2))
            if key in seen_targets:
                continue
            seen_targets.add(key)
            asset_targets.append((expiry, strike))

    for event in events:
        asset = str(event.get("asset", ""))
        option_symbol, option_snapshot = option_chain_for_asset(snapshot, asset)
        spot = safe_float(spots.get(asset))
        live_markets = live_gamma_markets(str(event.get("slug", ""))) if refresh_live_quotes else {}
        relevant_option_targets = relevant_targets_by_asset.get(asset, [])
        pm_iv = pm_iv_for_asset(latest_valuations, asset)
        hl = hyperliquid_overrides.get(asset)
        perp_source = "snapshot"
        if hl is not None:
            perp_source = "live_hyperliquid_xyz_cl" if asset == "OIL" else "live_hyperliquid"
        else:
            hl = hyperliquid.get(asset, {}) if isinstance(hyperliquid.get(asset, {}), dict) else {}
        perp_mark = safe_float(hl.get("markPx"))
        perp_funding_ann = safe_float(hl.get("fundingAnnualized"))
        perp_oi_usd = safe_float(hl.get("openInterestUsd"))
        perp_basis_pct = None
        if perp_mark is not None and spot:
            perp_basis_pct = (perp_mark / spot - 1.0) * 100
        settlement_yes_sum, settlement_overround, settlement_tail_yes, settlement_skew_yes = settlement_bucket_metrics(event.get("contracts", []))

        for contract in event.get("contracts", []):
            if contract.get("closed") or not contract.get("active", True):
                continue
            liquidity = safe_float(contract.get("liquidity"))
            if liquidity is not None and liquidity < min_liquidity:
                continue

            strike = safe_float(contract.get("strike"))
            direction = str(contract.get("direction", ""))
            question = str(contract.get("question", ""))
            expiry_raw = str(contract.get("endDate") or "")
            expiry_dt = parse_time(expiry_raw)
            model_expiry_dt = option_model_expiry_target(question, expiry_dt)
            dte_days = None
            if expiry_dt:
                dte_days = max(0.0, (expiry_dt.astimezone(timezone.utc) - snap_dt).total_seconds() / 86400)
            model_dte_days = dte_days
            if model_expiry_dt:
                model_dte_days = max(0.0, (model_expiry_dt.astimezone(timezone.utc) - snap_dt).total_seconds() / 86400)

            option_underlying = safe_float(option_snapshot.get("underlyingPrice")) if option_snapshot else spot
            option_strike = scaled_option_strike(asset, option_symbol, strike or 0.0, spot, option_underlying)
            option_iv, iv_expiry = choose_iv_for_expiry(
                option_snapshot,
                model_expiry_dt,
                option_strike,
                snap_dt,
                relevant_option_targets,
            ) if option_snapshot else (None, "")
            valuation_iv_key = ""
            if option_iv is None:
                option_iv, valuation_iv_key = option_iv_from_valuations(latest_valuations, asset, model_dte_days)
                if option_iv is not None:
                    option_symbol = option_symbol or f"{asset}_VALUATION_IV"
                    option_underlying = option_underlying or spot
                    option_strike = option_strike or strike
            iv_resolution = iv_resolution_for(option_snapshot, valuation_iv_key, option_iv)
            range_bounds = parse_settlement_range(question)
            if range_bounds and spot and option_underlying:
                scaled_low = scaled_option_strike(asset, option_symbol, range_bounds[0], spot, option_underlying)
                scaled_high = scaled_option_strike(asset, option_symbol, range_bounds[1], spot, option_underlying)
                terminal_prob = lognormal_range_probability(option_underlying, scaled_low, scaled_high, option_iv, model_dte_days)
                model_prob = terminal_prob
            else:
                terminal_prob = lognormal_terminal_probability(option_underlying, option_strike, option_iv, model_dte_days, direction)
                model_prob = touch_adjusted_probability(terminal_prob, direction, question, option_underlying, option_strike, option_iv, model_dte_days)

            live_quote = live_clob_quote_for_market(live_markets.get(str(contract.get("marketId", "")), {})) if refresh_live_quotes else {}
            quote_source = live_quote.get("quoteSource", "snapshot")
            pm_yes = safe_float(live_quote.get("yesPrice")) if live_quote else None
            bid = safe_float(live_quote.get("bestBid")) if live_quote else None
            ask = safe_float(live_quote.get("bestAsk")) if live_quote else None
            spread = safe_float(live_quote.get("spread")) if live_quote else None
            liquidity = safe_float(live_quote.get("liquidity")) if live_quote else liquidity
            volume = safe_float(live_quote.get("volume")) if live_quote else safe_float(contract.get("volume"))
            if pm_yes is None:
                pm_yes = safe_float(contract.get("yesPrice"))
            if bid is None:
                bid = safe_float(contract.get("bestBid"))
            if ask is None:
                ask = safe_float(contract.get("bestAsk"))
            if spread is None:
                spread = safe_float(contract.get("spread"))
            if spread is None and bid is not None and ask is not None:
                spread = ask - bid
            cap_yes = underlying_cap_yes_price(spot, strike, direction, question)
            cap_ratio, cap_signal = underlying_cap_signal(pm_yes, cap_yes)

            buy_edge = None
            sell_edge = None
            best_expression = "no-options-model"
            score = None
            if model_prob is not None:
                buy_reference = ask if ask and ask > 0 else pm_yes
                sell_reference = bid if bid is not None and bid > 0 else pm_yes
                if buy_reference is not None:
                    buy_edge = (model_prob - buy_reference) * 100
                if sell_reference is not None:
                    sell_edge = (sell_reference - model_prob) * 100
                if buy_edge is not None and buy_edge > 0 and (sell_edge is None or buy_edge >= sell_edge):
                    score = buy_edge
                    best_expression = "buy_yes"
                elif sell_edge is not None and sell_edge > 0:
                    score = -sell_edge
                    best_expression = "sell_yes_or_buy_no"
                elif buy_edge is not None:
                    score = buy_edge
                    best_expression = "avoid_buy_yes" if buy_edge < 0 else "near_fair_or_avoid"
            edge_per_dte = None
            if score is not None and dte_days and dte_days > 0:
                edge_per_dte = score / dte_days

            flags = []
            if spread is not None and spread >= 0.05:
                flags.append("wide_pm_spread")
            if liquidity is not None and liquidity < 1_000:
                flags.append("low_pm_liquidity")
            if option_iv is None and option_symbol:
                flags.append("missing_options_iv")
            if not option_symbol:
                flags.append("no_listed_options_mapping")
            if perp_funding_ann is not None and abs(perp_funding_ann) >= 0.10:
                flags.append("extreme_perp_funding")
            if perp_basis_pct is not None and abs(perp_basis_pct) >= 1:
                flags.append("perp_spot_basis")
            if asset == "OIL" and perp_source == "snapshot":
                flags.append("oil_snapshot_uses_brent")
            if cap_signal in {"above_underlying_cap", "near_underlying_cap_bullish", "cheap_vs_underlying_cap_bearish"}:
                flags.append(cap_signal)

            displayable, eligible_for_shadow, eligible_for_backtest = eligibility_flags(
                best_expression,
                score,
                dte_days,
                spread,
                liquidity,
                flags,
            )

            notes = []
            if valuation_iv_key:
                notes.append(f"Options model falls back to latest {valuation_iv_key} from daily-valuations.csv.")
            elif option_symbol and option_snapshot:
                target_note = model_expiry_dt.date().isoformat() if model_expiry_dt else "n/a"
                notes.append(f"Options model uses {option_symbol} {option_snapshot.get('source', '')}; target month-end expiry {target_note}, IV expiry {iv_expiry or 'n/a'}, closest-strike IV sample.")
            else:
                notes.append("No listed options model is used for this asset.")
            if option_symbol and is_one_touch_question(question):
                notes.append("Hit/reach market uses tested one-touch probability model; incomplete rows fall back to 2x terminal probability.")
            if range_bounds:
                notes.append(f"Settlement bucket modeled as probability between {range_bounds[0]:.0f} and {range_bounds[1]:.0f}.")
            if option_symbol == "IBIT":
                notes.append("Strike scaled from underlying options proxy.")
            if quote_source == "live_clob":
                notes.append("Polymarket quote refreshed from live CLOB during heatmap generation.")
            else:
                flags.append("pm_quote_from_snapshot")
            if cap_yes is not None:
                notes.append(f"Underlying upside cap YES price is {cap_yes:.1%}; PM trades at {cap_ratio:.0%} of cap." if cap_ratio is not None else f"Underlying upside cap YES price is {cap_yes:.1%}.")

            rows.append(
                RelativeValueRow(
                    timestamp=ts,
                    model_version=MODEL_VERSION,
                    asset=asset,
                    event_slug=str(event.get("slug", "")),
                    market_id=str(contract.get("marketId", "")),
                    contract_question=question,
                    contract_month=contract_month_from_question(question, expiry_dt),
                    direction=direction,
                    strike=strike or 0.0,
                    expiry=expiry_raw,
                    dte_days=dte_days,
                    spot=spot,
                    option_symbol=option_symbol,
                    option_underlying=option_underlying,
                    option_source=str(option_snapshot.get("source", "")) if option_snapshot else "",
                    iv_resolution=iv_resolution,
                    option_iv=option_iv,
                    pm_iv=pm_iv,
                    options_terminal_prob=terminal_prob,
                    options_touch_adjusted_prob=model_prob,
                    pm_yes_price=pm_yes,
                    pm_best_bid=bid,
                    pm_best_ask=ask,
                    pm_spread=spread,
                    pm_quote_source=quote_source,
                    liquidity=liquidity,
                    volume=volume,
                    underlying_cap_yes_price=cap_yes,
                    pm_to_underlying_cap_ratio=cap_ratio,
                    underlying_cap_signal=cap_signal,
                    settlement_yes_sum=settlement_yes_sum,
                    settlement_overround=settlement_overround,
                    settlement_tail_yes=settlement_tail_yes,
                    settlement_skew_yes=settlement_skew_yes,
                    buy_yes_edge_pts=buy_edge,
                    sell_yes_edge_pts=sell_edge,
                    best_expression=best_expression,
                    edge_score=score,
                    edge_pts_per_dte=edge_per_dte,
                    edge_pts_per_dte_7d_change=None,
                    eligible_displayable=displayable,
                    eligible_for_shadow=eligible_for_shadow,
                    eligible_for_backtest=eligible_for_backtest,
                    edge_bucket=edge_bucket(score),
                    perp_mark=perp_mark,
                    perp_source=perp_source,
                    perp_funding_ann=perp_funding_ann,
                    perp_oi_usd=perp_oi_usd,
                    perp_basis_pct=perp_basis_pct,
                    flags=";".join(flags),
                    notes=" ".join(notes),
                )
            )

    rows.sort(
        key=lambda r: (
            expiry_sort_key(r),
            -(abs(r.edge_score) if r.edge_score is not None else -1),
            r.asset,
            r.event_slug,
            r.strike,
        )
    )
    return rows


def expiry_sort_key(row: RelativeValueRow) -> Tuple[int, str]:
    expiry_dt = parse_time(row.expiry)
    if expiry_dt:
        return (0, expiry_dt.astimezone(timezone.utc).isoformat())
    return (1, row.contract_month or row.event_slug)


def relative_value_key(row: RelativeValueRow) -> Tuple[str, str, str, str, float]:
    return (
        row.asset,
        row.event_slug,
        row.market_id,
        row.direction,
        round(row.strike, 6),
    )


def read_nearest_snapshot(path: Path, target_dt: datetime, tolerance: timedelta = timedelta(hours=36)) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    best: Optional[Dict[str, Any]] = None
    best_distance: Optional[timedelta] = None
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                snapshot = json.loads(line)
            except json.JSONDecodeError:
                continue
            distance = abs(snapshot_time(snapshot) - target_dt)
            if best_distance is None or distance < best_distance:
                best = snapshot
                best_distance = distance
    if best_distance is None or best_distance > tolerance:
        return None
    return best


def attach_edge_history(
    rows: List[RelativeValueRow],
    snapshot_path: Path,
    latest_valuations: Dict[str, str],
    min_liquidity: float,
) -> None:
    if not rows:
        return
    current_dt = snapshot_time({"timestamp": rows[0].timestamp})
    previous_snapshot = read_nearest_snapshot(snapshot_path, current_dt - timedelta(days=7))
    if not previous_snapshot:
        return
    previous_rows = build_rows(
        previous_snapshot,
        latest_valuations=latest_valuations,
        hyperliquid_overrides={},
        min_liquidity=min_liquidity,
    )
    previous_by_key = {
        relative_value_key(row): row
        for row in previous_rows
        if row.edge_pts_per_dte is not None
    }
    for row in rows:
        previous = previous_by_key.get(relative_value_key(row))
        if (
            previous
            and row.edge_pts_per_dte is not None
            and previous.edge_pts_per_dte is not None
            and row.model_version == previous.model_version
            and row.iv_resolution == previous.iv_resolution
        ):
            row.edge_pts_per_dte_7d_change = row.edge_pts_per_dte - previous.edge_pts_per_dte


def row_to_dict(row: RelativeValueRow) -> Dict[str, Any]:
    data = row.__dict__.copy()
    for key, value in list(data.items()):
        if isinstance(value, float):
            data[key] = f"{value:.8f}"
        elif isinstance(value, bool):
            data[key] = "true" if value else "false"
        elif value is None:
            data[key] = ""
    return data


def write_csv(rows: List[RelativeValueRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(RelativeValueRow.__dataclass_fields__.keys())
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row_to_dict(row))


def write_latest_json(rows: List[RelativeValueRow], path: Path, snapshot_timestamp: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    payload = {
        "schemaVersion": 1,
        "snapshotTimestamp": snapshot_timestamp,
        "generatedAt": generated_at,
        "rowCount": len(rows),
        "dataSources": {
            "polymarketQuotes": "snapshot_or_live_clob_at_generation_time",
            "options": "TradingView option chain at generation time",
            "hyperliquid": "snapshot_or_live_at_generation_time",
        },
        "rows": [row_to_dict(row) for row in rows],
    }
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def archive_csv(rows: List[RelativeValueRow], archive_dir: Path, csv_path: Path, snapshot_timestamp: str) -> Optional[Path]:
    snapshot_dt = parse_time(snapshot_timestamp)
    if not snapshot_dt:
        return None
    timestamp_slug = snapshot_dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    archive_path = archive_dir / snapshot_dt.date().isoformat() / f"{timestamp_slug}-{csv_path.name}"
    write_csv(rows, archive_path)
    return archive_path


def top_rows(rows: List[RelativeValueRow], limit: int = 80) -> List[RelativeValueRow]:
    return sorted(
        rows,
        key=lambda r: abs(r.edge_score) if r.edge_score is not None else -1,
        reverse=True,
    )[:limit]


def manual_shadow_side(row: RelativeValueRow) -> str:
    return "no" if row.best_expression == "sell_yes_or_buy_no" else "yes"


def manual_shadow_signal_type(row: RelativeValueRow) -> str:
    if manual_shadow_side(row) == "no":
        return "USER_PM_IV_TOUCH_RICH_NO"
    return "USER_PM_IV_TOUCH_CHEAP_YES"


def manual_shadow_command(row: RelativeValueRow) -> str:
    side = manual_shadow_side(row)
    snapshot = manual_shadow_row_snapshot(row)
    reason = (
        f"PM YES {fmt_pct(row.pm_yes_price)} vs IV touch model "
        f"{fmt_pct(row.options_touch_adjusted_prob)}; edge {fmt_pts(row.edge_score)} pts."
    )
    return (
        "python3 scripts/add_manual_iv_touch_shadow.py "
        f"--event {row.event_slug} "
        f"--market-id {row.market_id} "
        f"--side {side} "
        f"--signal-type {manual_shadow_signal_type(row)} "
        f"--reason {shlex.quote(reason)} "
        f"--heatmap-row-json {shlex.quote(json.dumps(snapshot, separators=(',', ':')))}"
    )


def manual_shadow_row_snapshot(row: RelativeValueRow) -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "source": "cross_venue_relative_value_heatmap",
        "row": row_to_dict(row),
        "selectedSide": manual_shadow_side(row),
        "selectedSignalType": manual_shadow_signal_type(row),
    }


def manual_shadow_payload(row: RelativeValueRow) -> Dict[str, Any]:
    reason = (
        f"PM YES {fmt_pct(row.pm_yes_price)} vs IV touch model "
        f"{fmt_pct(row.options_touch_adjusted_prob)}; edge {fmt_pts(row.edge_score)} pts."
    )
    return {
        "event": row.event_slug,
        "marketId": row.market_id,
        "side": manual_shadow_side(row),
        "signalType": manual_shadow_signal_type(row),
        "reason": reason,
        "heatmapRowSnapshot": manual_shadow_row_snapshot(row),
    }


def write_html(rows: List[RelativeValueRow], path: Path, snapshot_timestamp: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    visible = rows
    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    snapshot_display = fmt_eastern_time(snapshot_timestamp)
    generated_display = fmt_eastern_time(generated)
    body_rows = []
    for row in visible:
        cls = html_class(row.edge_score)
        command = manual_shadow_command(row)
        payload = json.dumps(manual_shadow_payload(row), separators=(",", ":"))
        side = manual_shadow_side(row).upper()
        body_rows.append(
            "<tr>"
            f"<td>{html.escape(row.asset)}</td>"
            f"<td>{html.escape(row.direction)}</td>"
            f"<td>{html.escape(fmt_num(row.strike, 2))}</td>"
            f"<td class='question'>{html.escape(row.contract_question)}</td>"
            f"<td>{html.escape(row.contract_month)}</td>"
            f"<td>{html.escape(fmt_pct(row.pm_yes_price))}</td>"
            f"<td>{html.escape(row.pm_quote_source)}</td>"
            f"<td>{html.escape(fmt_pct(row.underlying_cap_yes_price))}</td>"
            f"<td>{html.escape(fmt_num(row.pm_to_underlying_cap_ratio, 2))}</td>"
            f"<td>{html.escape(fmt_num(row.settlement_yes_sum, 2))}</td>"
            f"<td>{html.escape(fmt_num(row.settlement_tail_yes, 2))}</td>"
            f"<td>{html.escape(fmt_num(row.settlement_skew_yes, 2))}</td>"
            f"<td>{html.escape(fmt_pct(row.options_touch_adjusted_prob))}</td>"
            f"<td class='{cls}'>{html.escape(fmt_pts(row.edge_score))}</td>"
            f"<td>{html.escape(fmt_pts(row.edge_pts_per_dte, 3))}</td>"
            f"<td>{html.escape(fmt_pts(row.edge_pts_per_dte_7d_change, 3))}</td>"
            f"<td>{html.escape(row.best_expression)}</td>"
            f"<td>{'yes' if row.eligible_displayable else 'no'}</td>"
            f"<td>{'yes' if row.eligible_for_shadow else 'no'}</td>"
            f"<td>{'yes' if row.eligible_for_backtest else 'no'}</td>"
            f"<td><button type='button' data-command='{html.escape(command, quote=True)}' data-payload='{html.escape(payload, quote=True)}'>Add {html.escape(side)} shadow</button></td>"
            f"<td>{html.escape(fmt_num(row.pm_spread, 3))}</td>"
            f"<td>{html.escape(fmt_num(row.liquidity, 0))}</td>"
            f"<td>{html.escape(fmt_pct(row.option_iv))}</td>"
            f"<td>{html.escape(fmt_pct(row.pm_iv))}</td>"
            f"<td>{html.escape(row.perp_source)}</td>"
            f"<td>{html.escape(fmt_pct(row.perp_funding_ann))}</td>"
            f"<td>{html.escape(fmt_num(row.perp_basis_pct, 2))}</td>"
            f"<td>{html.escape(row.model_version)}</td>"
            f"<td>{html.escape(row.iv_resolution)}</td>"
            f"<td>{html.escape(row.flags)}</td>"
            "</tr>"
        )

    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Cross-Venue Relative Value Heatmap</title>
  <style>
    :root {{
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    body {{ margin: 24px; }}
    h1 {{ margin-bottom: 4px; }}
    .meta {{ color: #777; margin-bottom: 18px; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
    th, td {{ border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }}
    th {{ position: sticky; top: 0; background: Canvas; text-align: left; cursor: pointer; user-select: none; }}
    th::after {{ content: " \\2195"; color: #777; font-size: 11px; }}
    th[aria-sort="ascending"]::after {{ content: " \\2191"; color: inherit; }}
    th[aria-sort="descending"]::after {{ content: " \\2193"; color: inherit; }}
    .question {{ max-width: 430px; }}
    .pos3 {{ background: #006d2c; color: white; font-weight: 700; }}
    .pos2 {{ background: #31a354; color: white; font-weight: 700; }}
    .pos1 {{ background: #a1d99b; color: #111; }}
    .neutral {{ background: #f0f0f0; color: #111; }}
    .neg1 {{ background: #fcae91; color: #111; }}
    .neg2 {{ background: #fb6a4a; color: white; font-weight: 700; }}
    .neg3 {{ background: #a50f15; color: white; font-weight: 700; }}
    .missing {{ background: #d9d9d9; color: #555; }}
    .legend span {{ display: inline-block; padding: 4px 8px; margin-right: 4px; border: 1px solid #aaa; }}
    button {{ cursor: pointer; white-space: nowrap; }}
    .copied {{ background: #1f7a1f; color: white; }}
    .live-refresh {{ color: #777; margin-top: 4px; }}
    .live-refresh.stale {{ color: #a50f15; font-weight: 700; }}
  </style>
</head>
<body>
  <h1>Cross-Venue Relative Value Heatmap</h1>
  <div class="meta" id="heatmap-meta">
    Snapshot: <span id="snapshot-timestamp">{html.escape(snapshot_display)}</span> |
    Generated: <span id="generated-timestamp">{html.escape(generated_display)}</span> |
    Rows shown: <span id="row-count">{len(visible)} of {len(rows)}</span>
    <div class="live-refresh" id="live-refresh-status">
      Static render. Checking VPS latest data...
    </div>
  </div>
  <p>
    PM YES/bid/ask are refreshed from live CLOB books at generation time when available.
    Positive edge means the model thinks PM YES is cheap versus options after using the PM ask.
    Negative edge means PM YES looks rich versus options after using the PM bid. This is a
    screening report, not a risk-free arbitrage ledger. Cap YES is the maximum rational
    upside one-touch YES price implied by spot/strike before expiry risk or carry.
    Edge/day normalizes edge by remaining days to expiry; 7d Δ edge/day compares the
    current value with the nearest snapshot from seven days ago when available.
    Settle bucket markets are shown as volatility/tail-shape indicators; their YES prices
    should not be summed into a spot EV unless the buckets are cleanly exclusive.
  </p>
  <p>
    Manual shadow buttons send an authenticated request to the VPS endpoint. If the endpoint
    is unavailable, the page falls back to copying the exact command.
  </p>
  <div class="legend">
    <span class="pos3">+20 pts</span>
    <span class="pos2">+10 pts</span>
    <span class="pos1">+5 pts</span>
    <span class="neutral">near fair</span>
    <span class="neg1">-5 pts</span>
    <span class="neg2">-10 pts</span>
    <span class="neg3">-20 pts</span>
  </div>
  <table id="relative-value-table">
    <thead>
      <tr>
        <th>Asset</th>
        <th>Dir</th>
        <th>Strike</th>
        <th>Contract</th>
        <th>Date</th>
        <th>PM YES</th>
        <th>PM Quote</th>
        <th>Cap YES</th>
        <th>PM/Cap</th>
        <th>Settle Sum</th>
        <th>Tail Sum</th>
        <th>Tail Skew</th>
        <th>Options Prob</th>
        <th>Edge Pts</th>
        <th>Edge/Day</th>
        <th>7d Δ Edge/Day</th>
        <th>Best Expression</th>
        <th>Display</th>
        <th>Shadow Eligible</th>
        <th>Backtest Eligible</th>
        <th>Manual Shadow</th>
        <th>PM Spread</th>
        <th>Liquidity</th>
        <th>Opt IV</th>
        <th>PM IV</th>
        <th>Perp Source</th>
        <th>Perp Funding</th>
        <th>Basis %</th>
        <th>Model</th>
        <th>IV Resolution</th>
        <th>Flags</th>
      </tr>
    </thead>
    <tbody>
      {''.join(body_rows)}
    </tbody>
  </table>
  <script>
    const columnDefs = [
      {{ key: "asset" }},
      {{ key: "direction" }},
      {{ key: "strike", format: (row) => fmtNum(row.strike, 2) }},
      {{ key: "contract_question", className: "question" }},
      {{ key: "contract_month" }},
      {{ key: "pm_yes_price", format: (row) => fmtPct(row.pm_yes_price) }},
      {{ key: "pm_quote_source" }},
      {{ key: "underlying_cap_yes_price", format: (row) => fmtPct(row.underlying_cap_yes_price) }},
      {{ key: "pm_to_underlying_cap_ratio", format: (row) => fmtNum(row.pm_to_underlying_cap_ratio, 2) }},
      {{ key: "settlement_yes_sum", format: (row) => fmtNum(row.settlement_yes_sum, 2) }},
      {{ key: "settlement_tail_yes", format: (row) => fmtNum(row.settlement_tail_yes, 2) }},
      {{ key: "settlement_skew_yes", format: (row) => fmtNum(row.settlement_skew_yes, 2) }},
      {{ key: "options_touch_adjusted_prob", format: (row) => fmtPct(row.options_touch_adjusted_prob) }},
      {{ key: "edge_score", format: (row) => fmtPts(row.edge_score), className: (row) => htmlClassFromEdge(row.edge_score) }},
      {{ key: "edge_pts_per_dte", format: (row) => fmtPts(row.edge_pts_per_dte, 3) }},
      {{ key: "edge_pts_per_dte_7d_change", format: (row) => fmtPts(row.edge_pts_per_dte_7d_change, 3) }},
      {{ key: "best_expression" }},
      {{ key: "eligible_displayable", format: (row) => yesNo(row.eligible_displayable) }},
      {{ key: "eligible_for_shadow", format: (row) => yesNo(row.eligible_for_shadow) }},
      {{ key: "eligible_for_backtest", format: (row) => yesNo(row.eligible_for_backtest) }},
      {{ key: "manual_shadow", manualShadow: true }},
      {{ key: "pm_spread", format: (row) => fmtNum(row.pm_spread, 3) }},
      {{ key: "liquidity", format: (row) => fmtNum(row.liquidity, 0) }},
      {{ key: "option_iv", format: (row) => fmtPct(row.option_iv) }},
      {{ key: "pm_iv", format: (row) => fmtPct(row.pm_iv) }},
      {{ key: "perp_source" }},
      {{ key: "perp_funding_ann", format: (row) => fmtPct(row.perp_funding_ann) }},
      {{ key: "perp_basis_pct", format: (row) => fmtNum(row.perp_basis_pct, 2) }},
      {{ key: "model_version" }},
      {{ key: "iv_resolution" }},
      {{ key: "flags" }},
    ];

    function dateFromTimestamp(value) {{
      const raw = String(value || "");
      if (!raw) return null;
      let normalized = raw;
      if (/^\\d{{4}}-\\d{{2}}-\\d{{2}}T\\d{{2}}$/.test(raw)) normalized = `${{raw}}:00:00Z`;
      else if (/^\\d{{4}}-\\d{{2}}-\\d{{2}}T\\d{{2}}:\\d{{2}}$/.test(raw)) normalized = `${{raw}}:00Z`;
      const date = new Date(normalized);
      return Number.isFinite(date.getTime()) ? date : null;
    }}

    function fmtEasternTime(value) {{
      const date = dateFromTimestamp(value);
      if (!date) return String(value || "");
      return new Intl.DateTimeFormat("en-US", {{
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }}).format(date);
    }}

    function numeric(value) {{
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }}

    function fmtNum(value, decimals) {{
      const number = numeric(value);
      return number === null ? "" : number.toFixed(decimals);
    }}

    function fmtPct(value) {{
      const number = numeric(value);
      return number === null ? "" : `${{(number * 100).toFixed(1)}}%`;
    }}

    function fmtPts(value, decimals = 1) {{
      const number = numeric(value);
      if (number === null) return "";
      return `${{number >= 0 ? "+" : ""}}${{number.toFixed(decimals)}}`;
    }}

    function truthy(value) {{
      return value === true || value === "true" || value === "yes" || value === 1 || value === "1";
    }}

    function yesNo(value) {{
      return truthy(value) ? "yes" : "no";
    }}

    function htmlClassFromEdge(value) {{
      const edge = numeric(value);
      if (edge === null) return "missing";
      if (edge >= 20) return "pos3";
      if (edge >= 10) return "pos2";
      if (edge >= 5) return "pos1";
      if (edge <= -20) return "neg3";
      if (edge <= -10) return "neg2";
      if (edge <= -5) return "neg1";
      return "neutral";
    }}

    function manualSide(row) {{
      return row.best_expression === "sell_yes_or_buy_no" ? "no" : "yes";
    }}

    function manualSignalType(row) {{
      return manualSide(row) === "no" ? "USER_PM_IV_TOUCH_RICH_NO" : "USER_PM_IV_TOUCH_CHEAP_YES";
    }}

    function manualPayload(row) {{
      const side = manualSide(row);
      const signalType = manualSignalType(row);
      return {{
        event: String(row.event_slug || ""),
        marketId: String(row.market_id || ""),
        side,
        signalType,
        reason: `PM YES ${{fmtPct(row.pm_yes_price)}} vs IV touch model ${{fmtPct(row.options_touch_adjusted_prob)}}; edge ${{fmtPts(row.edge_score)}} pts.`,
        heatmapRowSnapshot: {{
          schemaVersion: 1,
          source: "cross_venue_relative_value_heatmap",
          row,
          selectedSide: side,
          selectedSignalType: signalType,
        }},
      }};
    }}

    function renderManualShadowCell(row) {{
      const cell = document.createElement("td");
      const side = manualSide(row).toUpperCase();
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `Add ${{side}} shadow`;
      button.dataset.payload = JSON.stringify(manualPayload(row));
      button.dataset.command = `python3 scripts/add_manual_iv_touch_shadow.py --event ${{row.event_slug || ""}} --market-id ${{row.market_id || ""}} --side ${{manualSide(row)}} --signal-type ${{manualSignalType(row)}} --heatmap-row-json '${{JSON.stringify({{ schemaVersion: 1, source: "cross_venue_relative_value_heatmap", row }})}}'`;
      cell.appendChild(button);
      return cell;
    }}

    function renderRows(rows) {{
      const tbody = document.querySelector("#relative-value-table tbody");
      const rendered = rows.map((row) => {{
        const tr = document.createElement("tr");
        columnDefs.forEach((column) => {{
          if (column.manualShadow) {{
            tr.appendChild(renderManualShadowCell(row));
            return;
          }}
          const td = document.createElement("td");
          const className = typeof column.className === "function" ? column.className(row) : column.className;
          if (className) td.className = className;
          td.textContent = column.format ? column.format(row) : String(row[column.key] || "");
          tr.appendChild(td);
        }});
        return tr;
      }});
      tbody.replaceChildren(...rendered);
    }}

    function updateFreshnessStatus(generatedAt) {{
      const status = document.getElementById("live-refresh-status");
      const generatedMs = Date.parse(generatedAt || "");
      if (!Number.isFinite(generatedMs)) {{
        status.textContent = "Live data loaded, but freshness timestamp was missing.";
        status.classList.add("stale");
        return;
      }}
      const ageMinutes = Math.round((Date.now() - generatedMs) / 60000);
      status.textContent = `Live VPS data loaded ${{ageMinutes}} minutes ago. Auto-refreshing every 5 minutes.`;
      status.classList.toggle("stale", ageMinutes > 90);
    }}

    async function refreshLatestHeatmap() {{
      const status = document.getElementById("live-refresh-status");
      try {{
        const response = await fetch(`/api/heatmap-latest?ts=${{Date.now()}}`, {{ cache: "no-store" }});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `HTTP ${{response.status}}`);
        if (!Array.isArray(payload.rows)) throw new Error("Latest payload has no rows");
        renderRows(payload.rows);
        document.getElementById("snapshot-timestamp").textContent = fmtEasternTime(payload.snapshotTimestamp);
        document.getElementById("generated-timestamp").textContent = fmtEasternTime(payload.generatedAt);
        document.getElementById("row-count").textContent = `${{payload.rows.length}} of ${{payload.rowCount || payload.rows.length}}`;
        updateFreshnessStatus(payload.generatedAt);
      }} catch (err) {{
        status.textContent = `Could not load VPS latest data: ${{err.message || err}}. Showing static Vercel render.`;
        status.classList.add("stale");
      }}
    }}

    function pollLatestForLiveRefresh(attempt = 1) {{
      if (attempt > 18) return;
      setTimeout(async () => {{
        await refreshLatestHeatmap();
        pollLatestForLiveRefresh(attempt + 1);
      }}, 10 * 1000);
    }}

    async function requestLiveHeatmapRefresh() {{
      const status = document.getElementById("live-refresh-status");
      try {{
        const response = await fetch("/api/heatmap-refresh", {{
          method: "POST",
          cache: "no-store",
        }});
        const result = await response.json().catch(() => ({{}}));
        if (!response.ok) throw new Error(result.error || `HTTP ${{response.status}}`);
        status.classList.remove("stale");
        status.textContent = result.status === "already_running"
          ? "Live CLOB refresh is already running on the VPS. Polling for updated rows..."
          : "Started live CLOB refresh on the VPS. Polling for updated rows...";
        pollLatestForLiveRefresh();
      }} catch (err) {{
        status.textContent = `Could not start live CLOB refresh: ${{err.message || err}}. Showing latest hourly snapshot.`;
        status.classList.add("stale");
      }}
    }}

    refreshLatestHeatmap();
    requestLiveHeatmapRefresh();
    setInterval(refreshLatestHeatmap, 5 * 60 * 1000);

    function sortableValue(text) {{
      const raw = (text || "").trim();
      if (!raw || raw === "-") return {{ type: "missing", value: null }};
      const lower = raw.toLowerCase();
      const cleaned = lower
        .replace(/[$,%]/g, "")
        .replace(/ pts?$/g, "")
        .replace(/x$/g, "")
        .replace(/,/g, "")
        .trim();
      const number = Number(cleaned);
      if (Number.isFinite(number)) return {{ type: "number", value: number }};
      const timestamp = Date.parse(raw);
      if (Number.isFinite(timestamp)) return {{ type: "number", value: timestamp }};
      return {{ type: "text", value: lower }};
    }}

    function compareCells(aCell, bCell, direction) {{
      const a = sortableValue(aCell ? aCell.textContent : "");
      const b = sortableValue(bCell ? bCell.textContent : "");
      if (a.type === "missing" && b.type !== "missing") return 1;
      if (b.type === "missing" && a.type !== "missing") return -1;
      if (a.type === "number" && b.type === "number") return direction * (a.value - b.value);
      return direction * String(a.value ?? "").localeCompare(String(b.value ?? ""), undefined, {{ numeric: true, sensitivity: "base" }});
    }}

    document.querySelectorAll("#relative-value-table thead th").forEach((th, index) => {{
      th.setAttribute("title", "Click to sort this column");
      th.addEventListener("click", () => {{
        const table = th.closest("table");
        const tbody = table.querySelector("tbody");
        const current = th.getAttribute("aria-sort");
        const next = current === "descending" ? "ascending" : "descending";
        const direction = next === "ascending" ? 1 : -1;
        table.querySelectorAll("thead th").forEach((header) => header.removeAttribute("aria-sort"));
        th.setAttribute("aria-sort", next);
        const rows = Array.from(tbody.querySelectorAll("tr"));
        rows.sort((a, b) => compareCells(a.children[index], b.children[index], direction));
        tbody.replaceChildren(...rows);
      }});
    }});

    document.addEventListener("click", async (event) => {{
      const button = event.target.closest("button[data-command]");
      if (!button) return;
      const command = button.getAttribute("data-command") || "";
      const payload = JSON.parse(button.getAttribute("data-payload") || "{{}}");
      let token = window.localStorage.getItem("manualShadowToken") || "";
      if (!token) {{
        token = window.prompt("Manual shadow auth token:") || "";
        if (token) window.localStorage.setItem("manualShadowToken", token);
      }}
      const original = button.textContent;
      if (token) {{
        button.disabled = true;
        button.textContent = "Adding...";
        try {{
          const response = await fetch("/api/manual-shadow", {{
            method: "POST",
            headers: {{
              "Content-Type": "application/json",
              "X-Manual-Shadow-Token": token,
            }},
            body: JSON.stringify(payload),
          }});
          const result = await response.json().catch(() => ({{}}));
          if (!response.ok) throw new Error(result.error || `HTTP ${{response.status}}`);
          button.textContent = "Logged";
          button.classList.add("copied");
          setTimeout(() => {{
            button.textContent = original;
            button.classList.remove("copied");
            button.disabled = false;
          }}, 1800);
          return;
        }} catch (err) {{
          button.disabled = false;
          button.textContent = original;
          window.alert(`VPS add failed: ${{err.message || err}}. Falling back to copied command.`);
        }}
      }}
      try {{
        await navigator.clipboard.writeText(command);
        button.textContent = "Copied";
        button.classList.add("copied");
        setTimeout(() => {{
          button.textContent = original;
          button.classList.remove("copied");
        }}, 1500);
      }} catch (err) {{
        window.prompt("Copy this command to add the manual shadow trade:", command);
      }}
    }});
  </script>
</body>
</html>
"""
    path.write_text(document, encoding="utf-8")


def print_summary(rows: List[RelativeValueRow]) -> None:
    print(f"Rows: {len(rows)}")
    print("Top relative-value flags:")
    for row in top_rows(rows, limit=12):
        edge = fmt_pts(row.edge_score)
        pm = fmt_pct(row.pm_yes_price)
        model = fmt_pct(row.options_touch_adjusted_prob)
        cap = fmt_pct(row.underlying_cap_yes_price)
        cap_ratio = fmt_num(row.pm_to_underlying_cap_ratio, 2)
        print(f"  {edge:>7} pts | {row.asset:<5} | PM {pm:<6} cap {cap:<6} ratio {cap_ratio:<4} vs model {model:<6} | {row.best_expression:<18} | {row.contract_question[:76]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build cross-venue relative value CSV + heatmap from existing snapshots.")
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT_PATH, help="Path to instrument-snapshots.jsonl")
    parser.add_argument("--csv", type=Path, default=CSV_PATH, help="Output CSV path")
    parser.add_argument("--html", type=Path, default=HTML_PATH, help="Output HTML heatmap path")
    parser.add_argument("--min-liquidity", type=float, default=0.0, help="Minimum Polymarket liquidity to include")
    parser.add_argument("--live-quotes", action="store_true", help="Refresh Polymarket CLOB quotes live. Default uses snapshot quotes for fast hourly runs.")
    parser.add_argument("--live-hyperliquid", action="store_true", help="Refresh Hyperliquid xyz OIL mark live. Default uses snapshot data for fast hourly runs.")
    parser.add_argument("--edge-history", action="store_true", help="Compute 7d edge-per-DTE changes by reading historical snapshots. Disabled by default for fast hourly runs.")
    parser.add_argument("--archive-dir", type=Path, default=DEFAULT_ARCHIVE_DIR, help="Directory for dated heatmap CSV archives")
    parser.add_argument("--latest-json", type=Path, default=LATEST_JSON_PATH, help="Output compact JSON for live heatmap refresh")
    parser.add_argument("--skip-csv", action="store_true", help="Skip writing the CSV artifact")
    parser.add_argument("--skip-html", action="store_true", help="Skip writing the HTML artifact")
    parser.add_argument("--no-archive", action="store_true", help="Skip dated heatmap CSV archive")
    args = parser.parse_args()

    snapshot = read_latest_snapshot(args.snapshot)
    latest_valuations = read_latest_csv_row(VALUATIONS_PATH)
    hyperliquid_overrides = {"OIL": fetch_hyperliquid_xyz_market("xyz:CL")} if args.live_hyperliquid else {}
    rows = build_rows(
        snapshot,
        latest_valuations=latest_valuations,
        hyperliquid_overrides=hyperliquid_overrides,
        min_liquidity=args.min_liquidity,
        refresh_live_quotes=args.live_quotes,
    )
    if args.edge_history:
        attach_edge_history(rows, args.snapshot, latest_valuations, args.min_liquidity)
    rows.sort(
        key=lambda r: (
            expiry_sort_key(r),
            -(abs(r.edge_score) if r.edge_score is not None else -1),
            r.asset,
            r.event_slug,
            r.strike,
        )
    )
    snapshot_timestamp = str(snapshot.get("timestamp", ""))
    if not args.skip_csv:
        write_csv(rows, args.csv)
    write_latest_json(rows, args.latest_json, snapshot_timestamp)
    archived_path = None
    if not args.skip_csv and not args.no_archive:
        archived_path = archive_csv(rows, args.archive_dir, args.csv, snapshot_timestamp)
    if not args.skip_html:
        write_html(rows, args.html, snapshot_timestamp)
    print_summary(rows)
    if not args.skip_csv:
        print(f"\nWrote CSV:  {args.csv}")
    else:
        print("\nSkipped CSV write")
    print(f"Wrote JSON: {args.latest_json}")
    if archived_path:
        print(f"Wrote archive CSV: {archived_path}")
    if not args.skip_html:
        print(f"Wrote HTML: {args.html}")
    else:
        print("Skipped HTML write")


if __name__ == "__main__":
    main()
