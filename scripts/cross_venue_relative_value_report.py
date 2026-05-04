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
import csv
import html
import json
import math
import re
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SNAPSHOT_PATH = DATA_DIR / "instrument-snapshots.jsonl"
HOSTED_DIR = ROOT / "relative-value"
CSV_PATH = HOSTED_DIR / "cross_venue_relative_value.csv"
HTML_PATH = HOSTED_DIR / "index.html"
VALUATIONS_PATH = DATA_DIR / "daily-valuations.csv"


ASSET_TO_OPTION_SYMBOLS = {
    "BTC": ["CME_BTC", "IBIT"],
    "GOLD": ["CME_GC"],
    "OIL": ["CME_CL"],
    "AMZN": ["AMZN"],
}


@dataclass
class RelativeValueRow:
    timestamp: str
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
    option_iv: Optional[float]
    pm_iv: Optional[float]
    options_terminal_prob: Optional[float]
    options_touch_adjusted_prob: Optional[float]
    pm_yes_price: Optional[float]
    pm_best_bid: Optional[float]
    pm_best_ask: Optional[float]
    pm_spread: Optional[float]
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
    last_line = ""
    with path.open("rb") as fh:
        try:
            fh.seek(0, 2)
            pos = fh.tell()
            chunk = 8192
            buffer = b""
            while pos > 0:
                read_size = min(chunk, pos)
                pos -= read_size
                fh.seek(pos)
                buffer = fh.read(read_size) + buffer
                lines = buffer.splitlines()
                if len(lines) > 1:
                    last_line = lines[-1].decode("utf-8")
                    break
            if not last_line:
                last_line = buffer.decode("utf-8").strip().splitlines()[-1]
        except OSError:
            for line in fh:
                if line.strip():
                    last_line = line.decode("utf-8")
    return json.loads(last_line)


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
    if option_symbol == "IBIT":
        return pm_strike * (option_underlying / asset_spot)
    return pm_strike


def choose_iv_for_expiry(
    option_snapshot: Dict[str, Any],
    target_expiry: Optional[datetime],
    target_strike: Optional[float],
    now: Optional[datetime] = None,
) -> Tuple[Optional[float], str]:
    chains = option_snapshot.get("chains", [])
    underlying = safe_float(option_snapshot.get("underlyingPrice"))
    if not chains or not underlying:
        return None, ""

    now = now or datetime.now(timezone.utc)
    target_days = 60.0
    if target_expiry:
        target_days = max(1.0, (target_expiry - now).total_seconds() / 86400)

    candidates: List[Tuple[float, str, float, Dict[str, Any]]] = []
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
        strike_target = target_strike or underlying
        expiry_penalty = abs(dte - target_days)
        strike_penalty = abs(math.log(max(strike, 0.01) / max(strike_target, 0.01))) * 365
        candidates.append((expiry_penalty, exp_utc.date().isoformat(), strike_penalty, item))

    if not candidates:
        return None, ""

    candidates.sort(key=lambda row: (row[0], row[1]))
    selected_expiry = candidates[0][1]
    same_expiry = [row for row in candidates if row[1] == selected_expiry]
    liquid_candidates = [
        row for row in same_expiry
        if (safe_float(row[3].get("bid")) or 0) > 0 and (safe_float(row[3].get("ask")) or 0) > 0
    ]
    ranked = liquid_candidates if len(liquid_candidates) >= 2 else same_expiry
    ranked.sort(key=lambda row: row[2])
    top = ranked[:4]
    iv = sum(float(item["impliedVolatility"]) for _, _, _, item in top) / len(top)
    expiry = str(top[0][3].get("expiration", ""))
    return iv, expiry


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


def touch_adjusted_probability(terminal_prob: Optional[float], direction: str, question: str) -> Optional[float]:
    if terminal_prob is None:
        return None
    q = question.lower()
    if "hit" not in q and "reach" not in q and "dip" not in q:
        return terminal_prob
    # A one-touch style event is worth more than terminal probability. This is a
    # deliberately simple approximation for screening, not a pricing model.
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


def build_rows(
    snapshot: Dict[str, Any],
    latest_valuations: Optional[Dict[str, str]] = None,
    hyperliquid_overrides: Optional[Dict[str, Dict[str, Optional[float]]]] = None,
    min_liquidity: float = 0.0,
) -> List[RelativeValueRow]:
    ts = str(snapshot.get("timestamp", ""))
    snap_dt = snapshot_time(snapshot)
    spots = snapshot.get("spots", {})
    hyperliquid = snapshot.get("hyperliquid", {})
    latest_valuations = latest_valuations or {}
    hyperliquid_overrides = hyperliquid_overrides or {}
    rows: List[RelativeValueRow] = []

    for event in snapshot.get("polymarket", []):
        asset = str(event.get("asset", ""))
        option_symbol, option_snapshot = option_chain_for_asset(snapshot, asset)
        spot = safe_float(spots.get(asset))
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
            option_iv, iv_expiry = choose_iv_for_expiry(option_snapshot, model_expiry_dt, option_strike, snap_dt) if option_snapshot else (None, "")
            valuation_iv_key = ""
            if option_iv is None:
                option_iv, valuation_iv_key = option_iv_from_valuations(latest_valuations, asset, model_dte_days)
                if option_iv is not None:
                    option_symbol = option_symbol or f"{asset}_VALUATION_IV"
                    option_underlying = option_underlying or spot
                    option_strike = option_strike or strike
            range_bounds = parse_settlement_range(question)
            if range_bounds and spot and option_underlying:
                scaled_low = scaled_option_strike(asset, option_symbol, range_bounds[0], spot, option_underlying)
                scaled_high = scaled_option_strike(asset, option_symbol, range_bounds[1], spot, option_underlying)
                terminal_prob = lognormal_range_probability(option_underlying, scaled_low, scaled_high, option_iv, model_dte_days)
                model_prob = terminal_prob
            else:
                terminal_prob = lognormal_terminal_probability(option_underlying, option_strike, option_iv, model_dte_days, direction)
                model_prob = touch_adjusted_probability(terminal_prob, direction, question)

            pm_yes = safe_float(contract.get("yesPrice"))
            bid = safe_float(contract.get("bestBid"))
            ask = safe_float(contract.get("bestAsk"))
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

            notes = []
            if valuation_iv_key:
                notes.append(f"Options model falls back to latest {valuation_iv_key} from daily-valuations.csv.")
            elif option_symbol and option_snapshot:
                target_note = model_expiry_dt.date().isoformat() if model_expiry_dt else "n/a"
                notes.append(f"Options model uses {option_symbol} {option_snapshot.get('source', '')}; target month-end expiry {target_note}, IV expiry {iv_expiry or 'n/a'}, closest-strike IV sample.")
            else:
                notes.append("No listed options model is used for this asset.")
            if option_symbol and ("hit" in question.lower() or "reach" in question.lower()):
                notes.append("Hit/reach market uses simple 2x terminal-prob touch adjustment.")
            if range_bounds:
                notes.append(f"Settlement bucket modeled as probability between {range_bounds[0]:.0f} and {range_bounds[1]:.0f}.")
            if option_symbol == "IBIT":
                notes.append("Strike scaled from underlying options proxy.")
            if cap_yes is not None:
                notes.append(f"Underlying upside cap YES price is {cap_yes:.1%}; PM trades at {cap_ratio:.0%} of cap." if cap_ratio is not None else f"Underlying upside cap YES price is {cap_yes:.1%}.")

            rows.append(
                RelativeValueRow(
                    timestamp=ts,
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
                    option_iv=option_iv,
                    pm_iv=pm_iv,
                    options_terminal_prob=terminal_prob,
                    options_touch_adjusted_prob=model_prob,
                    pm_yes_price=pm_yes,
                    pm_best_bid=bid,
                    pm_best_ask=ask,
                    pm_spread=spread,
                    liquidity=liquidity,
                    volume=safe_float(contract.get("volume")),
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
        if previous and row.edge_pts_per_dte is not None and previous.edge_pts_per_dte is not None:
            row.edge_pts_per_dte_7d_change = row.edge_pts_per_dte - previous.edge_pts_per_dte


def row_to_dict(row: RelativeValueRow) -> Dict[str, Any]:
    data = row.__dict__.copy()
    for key, value in list(data.items()):
        if isinstance(value, float):
            data[key] = f"{value:.8f}"
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
        f"--reason {json.dumps(reason)}"
    )


def write_html(rows: List[RelativeValueRow], path: Path, snapshot_timestamp: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    visible = rows
    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    body_rows = []
    for row in visible:
        cls = html_class(row.edge_score)
        command = manual_shadow_command(row)
        side = manual_shadow_side(row).upper()
        body_rows.append(
            "<tr>"
            f"<td>{html.escape(row.asset)}</td>"
            f"<td>{html.escape(row.direction)}</td>"
            f"<td>{html.escape(fmt_num(row.strike, 2))}</td>"
            f"<td class='question'>{html.escape(row.contract_question)}</td>"
            f"<td>{html.escape(row.contract_month)}</td>"
            f"<td>{html.escape(fmt_pct(row.pm_yes_price))}</td>"
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
            f"<td><button type='button' data-command='{html.escape(command, quote=True)}'>Copy add {html.escape(side)} shadow</button></td>"
            f"<td>{html.escape(fmt_num(row.pm_spread, 3))}</td>"
            f"<td>{html.escape(fmt_num(row.liquidity, 0))}</td>"
            f"<td>{html.escape(fmt_pct(row.option_iv))}</td>"
            f"<td>{html.escape(fmt_pct(row.pm_iv))}</td>"
            f"<td>{html.escape(row.perp_source)}</td>"
            f"<td>{html.escape(fmt_pct(row.perp_funding_ann))}</td>"
            f"<td>{html.escape(fmt_num(row.perp_basis_pct, 2))}</td>"
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
    th {{ position: sticky; top: 0; background: Canvas; text-align: left; }}
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
  </style>
</head>
<body>
  <h1>Cross-Venue Relative Value Heatmap</h1>
  <div class="meta">
    Snapshot: {html.escape(snapshot_timestamp)} | Generated: {html.escape(generated)} |
    Rows shown: {len(visible)} of {len(rows)}
  </div>
  <p>
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
    Manual shadow buttons copy an exact command for adding the selected row as a manual
    IV-touch shadow trade on the repo/VPS. The heatmap is static, so copying the command
    is the write-safe path until a private authenticated action endpoint is added.
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
  <table>
    <thead>
      <tr>
        <th>Asset</th>
        <th>Dir</th>
        <th>Strike</th>
        <th>Contract</th>
        <th>Date</th>
        <th>PM YES</th>
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
        <th>Manual Shadow</th>
        <th>PM Spread</th>
        <th>Liquidity</th>
        <th>Opt IV</th>
        <th>PM IV</th>
        <th>Perp Source</th>
        <th>Perp Funding</th>
        <th>Basis %</th>
        <th>Flags</th>
      </tr>
    </thead>
    <tbody>
      {''.join(body_rows)}
    </tbody>
  </table>
  <script>
    document.addEventListener("click", async (event) => {{
      const button = event.target.closest("button[data-command]");
      if (!button) return;
      const command = button.getAttribute("data-command") || "";
      try {{
        await navigator.clipboard.writeText(command);
        const original = button.textContent;
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
    args = parser.parse_args()

    snapshot = read_latest_snapshot(args.snapshot)
    latest_valuations = read_latest_csv_row(VALUATIONS_PATH)
    hyperliquid_overrides = {"OIL": fetch_hyperliquid_xyz_market("xyz:CL")}
    rows = build_rows(
        snapshot,
        latest_valuations=latest_valuations,
        hyperliquid_overrides=hyperliquid_overrides,
        min_liquidity=args.min_liquidity,
    )
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
    write_csv(rows, args.csv)
    write_html(rows, args.html, str(snapshot.get("timestamp", "")))
    print_summary(rows)
    print(f"\nWrote CSV:  {args.csv}")
    print(f"Wrote HTML: {args.html}")


if __name__ == "__main__":
    main()
