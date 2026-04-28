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
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SNAPSHOT_PATH = DATA_DIR / "instrument-snapshots.jsonl"
HOSTED_DIR = ROOT / "relative-value"
CSV_PATH = HOSTED_DIR / "cross_venue_relative_value.csv"
HTML_PATH = HOSTED_DIR / "index.html"


ASSET_TO_OPTION_SYMBOL = {
    "BTC": "IBIT",
    "GOLD": "GLD",
    "AMZN": "AMZN",
    "OIL": "CL",
}


@dataclass
class RelativeValueRow:
    timestamp: str
    asset: str
    event_slug: str
    contract_question: str
    direction: str
    strike: float
    expiry: str
    dte_days: Optional[float]
    spot: Optional[float]
    option_symbol: str
    option_underlying: Optional[float]
    option_source: str
    option_iv: Optional[float]
    options_terminal_prob: Optional[float]
    options_touch_adjusted_prob: Optional[float]
    pm_yes_price: Optional[float]
    pm_best_bid: Optional[float]
    pm_best_ask: Optional[float]
    pm_spread: Optional[float]
    liquidity: Optional[float]
    volume: Optional[float]
    buy_yes_edge_pts: Optional[float]
    sell_yes_edge_pts: Optional[float]
    best_expression: str
    edge_score: Optional[float]
    edge_bucket: str
    perp_mark: Optional[float]
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
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


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
    return json.loads(last_line)


def option_chain_for_asset(snapshot: Dict[str, Any], asset: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    symbol = ASSET_TO_OPTION_SYMBOL.get(asset, "")
    if not symbol:
        return "", None
    options = snapshot.get("options", {})
    chain = options.get(symbol)
    return symbol, chain if isinstance(chain, dict) else None


def scaled_option_strike(
    asset: str,
    pm_strike: float,
    asset_spot: Optional[float],
    option_underlying: Optional[float],
) -> Optional[float]:
    if not asset_spot or not option_underlying or asset_spot <= 0:
        return None
    # BTC Polymarket is BTC spot, but options are IBIT. GOLD PM is GC, options are GLD.
    # CL and AMZN are already in the same approximate units.
    return pm_strike * (option_underlying / asset_spot)


def choose_iv_for_expiry(
    option_snapshot: Dict[str, Any],
    target_expiry: Optional[datetime],
    target_strike: Optional[float],
) -> Tuple[Optional[float], str]:
    chains = option_snapshot.get("chains", [])
    underlying = safe_float(option_snapshot.get("underlyingPrice"))
    if not chains or not underlying:
        return None, ""

    now = datetime.now(timezone.utc)
    target_days = 60.0
    if target_expiry:
        target_days = max(1.0, (target_expiry - now).total_seconds() / 86400)

    candidates: List[Tuple[float, float, Dict[str, Any]]] = []
    for item in chains:
        exp = parse_time(str(item.get("expiration", "")))
        if not exp:
            continue
        dte = max(0.0, (exp.astimezone(timezone.utc) - now).total_seconds() / 86400)
        if dte < 1.0:
            continue
        iv = safe_float(item.get("impliedVolatility"))
        if not iv or iv <= 0:
            continue
        strike = safe_float(item.get("strike")) or underlying
        strike_target = target_strike or underlying
        expiry_penalty = abs(dte - target_days)
        strike_penalty = abs(math.log(max(strike, 0.01) / max(strike_target, 0.01))) * 365
        candidates.append((expiry_penalty, strike_penalty, item))

    if not candidates:
        return None, ""

    candidates.sort(key=lambda row: (row[0], row[1]))
    top = candidates[:8]
    iv = sum(float(item["impliedVolatility"]) for _, _, item in top) / len(top)
    expiry = str(top[0][2].get("expiration", ""))
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
    if "hit" not in q and "reach" not in q:
        return terminal_prob
    # A one-touch style event is worth more than terminal probability. This is a
    # deliberately simple approximation for screening, not a pricing model.
    if direction in {"above", "below"}:
        return min(0.99, max(0.0, 2.0 * terminal_prob))
    return terminal_prob


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


def build_rows(snapshot: Dict[str, Any], min_liquidity: float = 0.0) -> List[RelativeValueRow]:
    ts = str(snapshot.get("timestamp", ""))
    snap_dt = snapshot_time(snapshot)
    spots = snapshot.get("spots", {})
    hyperliquid = snapshot.get("hyperliquid", {})
    rows: List[RelativeValueRow] = []

    for event in snapshot.get("polymarket", []):
        asset = str(event.get("asset", ""))
        option_symbol, option_snapshot = option_chain_for_asset(snapshot, asset)
        spot = safe_float(spots.get(asset))
        hl = hyperliquid.get(asset, {}) if isinstance(hyperliquid.get(asset, {}), dict) else {}
        perp_mark = safe_float(hl.get("markPx"))
        perp_funding_ann = safe_float(hl.get("fundingAnnualized"))
        perp_oi_usd = safe_float(hl.get("openInterestUsd"))
        perp_basis_pct = None
        if perp_mark is not None and spot:
            perp_basis_pct = (perp_mark / spot - 1.0) * 100

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
            dte_days = None
            if expiry_dt:
                dte_days = max(0.0, (expiry_dt.astimezone(timezone.utc) - snap_dt).total_seconds() / 86400)

            option_underlying = safe_float(option_snapshot.get("underlyingPrice")) if option_snapshot else None
            option_strike = scaled_option_strike(asset, strike or 0.0, spot, option_underlying)
            option_iv, iv_expiry = choose_iv_for_expiry(option_snapshot, expiry_dt, option_strike) if option_snapshot else (None, "")
            range_bounds = parse_settlement_range(question)
            if range_bounds and spot and option_underlying:
                scaled_low = scaled_option_strike(asset, range_bounds[0], spot, option_underlying)
                scaled_high = scaled_option_strike(asset, range_bounds[1], spot, option_underlying)
                terminal_prob = lognormal_range_probability(option_underlying, scaled_low, scaled_high, option_iv, dte_days)
                model_prob = terminal_prob
            else:
                terminal_prob = lognormal_terminal_probability(option_underlying, option_strike, option_iv, dte_days, direction)
                model_prob = touch_adjusted_probability(terminal_prob, direction, question)

            pm_yes = safe_float(contract.get("yesPrice"))
            bid = safe_float(contract.get("bestBid"))
            ask = safe_float(contract.get("bestAsk"))
            spread = safe_float(contract.get("spread"))
            if spread is None and bid is not None and ask is not None:
                spread = ask - bid

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

            notes = []
            if option_symbol and option_snapshot:
                notes.append(f"Options model uses {option_symbol} {option_snapshot.get('source', '')}; IV expiry {iv_expiry or 'n/a'}.")
            if "hit" in question.lower() or "reach" in question.lower():
                notes.append("Hit/reach market uses simple 2x terminal-prob touch adjustment.")
            if range_bounds:
                notes.append(f"Settlement bucket modeled as probability between {range_bounds[0]:.0f} and {range_bounds[1]:.0f}.")
            if asset in {"BTC", "GOLD"}:
                notes.append("Strike scaled from underlying options proxy.")

            rows.append(
                RelativeValueRow(
                    timestamp=ts,
                    asset=asset,
                    event_slug=str(event.get("slug", "")),
                    contract_question=question,
                    direction=direction,
                    strike=strike or 0.0,
                    expiry=expiry_raw,
                    dte_days=dte_days,
                    spot=spot,
                    option_symbol=option_symbol,
                    option_underlying=option_underlying,
                    option_source=str(option_snapshot.get("source", "")) if option_snapshot else "",
                    option_iv=option_iv,
                    options_terminal_prob=terminal_prob,
                    options_touch_adjusted_prob=model_prob,
                    pm_yes_price=pm_yes,
                    pm_best_bid=bid,
                    pm_best_ask=ask,
                    pm_spread=spread,
                    liquidity=liquidity,
                    volume=safe_float(contract.get("volume")),
                    buy_yes_edge_pts=buy_edge,
                    sell_yes_edge_pts=sell_edge,
                    best_expression=best_expression,
                    edge_score=score,
                    edge_bucket=edge_bucket(score),
                    perp_mark=perp_mark,
                    perp_funding_ann=perp_funding_ann,
                    perp_oi_usd=perp_oi_usd,
                    perp_basis_pct=perp_basis_pct,
                    flags=";".join(flags),
                    notes=" ".join(notes),
                )
            )

    rows.sort(
        key=lambda r: (
            r.asset,
            -(abs(r.edge_score) if r.edge_score is not None else -1),
            r.event_slug,
            r.strike,
        )
    )
    return rows


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


def write_html(rows: List[RelativeValueRow], path: Path, snapshot_timestamp: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    visible = top_rows(rows)
    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    body_rows = []
    for row in visible:
        cls = html_class(row.edge_score)
        body_rows.append(
            "<tr>"
            f"<td>{html.escape(row.asset)}</td>"
            f"<td>{html.escape(row.direction)}</td>"
            f"<td>{html.escape(fmt_num(row.strike, 2))}</td>"
            f"<td class='question'>{html.escape(row.contract_question)}</td>"
            f"<td>{html.escape(fmt_pct(row.pm_yes_price))}</td>"
            f"<td>{html.escape(fmt_pct(row.options_touch_adjusted_prob))}</td>"
            f"<td class='{cls}'>{html.escape(fmt_pts(row.edge_score))}</td>"
            f"<td>{html.escape(row.best_expression)}</td>"
            f"<td>{html.escape(fmt_num(row.pm_spread, 3))}</td>"
            f"<td>{html.escape(fmt_num(row.liquidity, 0))}</td>"
            f"<td>{html.escape(fmt_pct(row.option_iv))}</td>"
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
    screening report, not a risk-free arbitrage ledger.
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
        <th>PM YES</th>
        <th>Options Prob</th>
        <th>Edge Pts</th>
        <th>Best Expression</th>
        <th>PM Spread</th>
        <th>Liquidity</th>
        <th>Opt IV</th>
        <th>Perp Funding</th>
        <th>Basis %</th>
        <th>Flags</th>
      </tr>
    </thead>
    <tbody>
      {''.join(body_rows)}
    </tbody>
  </table>
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
        print(f"  {edge:>7} pts | {row.asset:<5} | PM {pm:<6} vs model {model:<6} | {row.best_expression:<18} | {row.contract_question[:92]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build cross-venue relative value CSV + heatmap from existing snapshots.")
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT_PATH, help="Path to instrument-snapshots.jsonl")
    parser.add_argument("--csv", type=Path, default=CSV_PATH, help="Output CSV path")
    parser.add_argument("--html", type=Path, default=HTML_PATH, help="Output HTML heatmap path")
    parser.add_argument("--min-liquidity", type=float, default=0.0, help="Minimum Polymarket liquidity to include")
    args = parser.parse_args()

    snapshot = read_latest_snapshot(args.snapshot)
    rows = build_rows(snapshot, min_liquidity=args.min_liquidity)
    write_csv(rows, args.csv)
    write_html(rows, args.html, str(snapshot.get("timestamp", "")))
    print_summary(rows)
    print(f"\nWrote CSV:  {args.csv}")
    print(f"Wrote HTML: {args.html}")


if __name__ == "__main__":
    main()
