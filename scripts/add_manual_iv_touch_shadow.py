#!/usr/bin/env python3
"""
Append a manual IV-touch Polymarket shadow trade using a fresh CLOB quote.

The heatmap is static, so its "Manual Shadow" buttons identify a contract from
scanner state. The script refreshes the executable Polymarket quote at click time
before recording the shadow, so entry price is not taken from a stale heatmap row.
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
GAMMA_EVENT_URL = "https://gamma-api.polymarket.com/events/slug"
CLOB_BOOK_URL = "https://clob.polymarket.com/book"
HTTP_HEADERS = {"Accept": "application/json", "User-Agent": "manual-shadow-quote/1.0"}


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def latest_snapshot(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing snapshot file: {path}")
    last = ""
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                last = line
    if not last:
        raise SystemExit(f"Snapshot file is empty: {path}")
    return json.loads(last)


def find_contract(snapshot: Dict[str, Any], event_slug: str, market_id: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    for event in snapshot.get("polymarket", []):
        if event.get("slug") != event_slug:
            continue
        for contract in event.get("contracts", []):
            if str(contract.get("marketId", "")) == market_id:
                return event, contract
    raise SystemExit(f"Could not find {event_slug}::{market_id} in latest instrument snapshot")


def learning_snapshot(data_dir: Path) -> Dict[str, Any]:
    params = read_json(data_dir / "learning-params.json", {})
    params.pop("updatedAt", None)
    return params


def parse_json_field(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value if value is not None else fallback


def best_level(levels: list[dict[str, Any]], side: str) -> tuple[float, float]:
    parsed: list[tuple[float, float]] = []
    for level in levels:
        try:
            price = float(level.get("price") or 0)
            size = float(level.get("size") or 0)
        except (TypeError, ValueError):
            continue
        if price > 0 and size > 0:
            parsed.append((price, size))
    if not parsed:
        return 0.0, 0.0
    return max(parsed) if side == "bid" else min(parsed)


def clob_book(token_id: str) -> Dict[str, Any]:
    url = f"{CLOB_BOOK_URL}?{urllib.parse.urlencode({'token_id': token_id})}"
    book = fetch_json(url)
    bid, bid_size = best_level(book.get("bids", []), "bid")
    ask, ask_size = best_level(book.get("asks", []), "ask")
    return {
        "tokenId": token_id,
        "bid": bid,
        "bidSize": bid_size,
        "ask": ask,
        "askSize": ask_size,
        "spread": max(0.0, ask - bid) if bid and ask else 0.0,
        "timestamp": book.get("timestamp"),
        "hash": book.get("hash"),
    }


def fresh_polymarket_quote(event_slug: str, market_id: str, snapshot_contract: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{GAMMA_EVENT_URL}/{urllib.parse.quote(event_slug)}"
    event = fetch_json(url)
    market = None
    for candidate in event.get("markets", []):
        if str(candidate.get("id")) == str(market_id):
            market = candidate
            break
    if not market:
        raise SystemExit(f"Could not find market {market_id} in live Gamma event {event_slug}")

    outcomes = parse_json_field(market.get("outcomes"), [])
    token_ids = parse_json_field(market.get("clobTokenIds"), [])
    outcome_prices = parse_json_field(market.get("outcomePrices"), [])
    if len(outcomes) != len(token_ids) or "Yes" not in outcomes or "No" not in outcomes:
        raise SystemExit(f"Live market {market_id} is missing YES/NO CLOB token ids")

    yes_idx = outcomes.index("Yes")
    no_idx = outcomes.index("No")
    yes_book = clob_book(str(token_ids[yes_idx]))
    no_book = clob_book(str(token_ids[no_idx]))

    try:
        gamma_yes = float(outcome_prices[yes_idx])
    except (TypeError, ValueError, IndexError):
        gamma_yes = float(market.get("lastTradePrice") or snapshot_contract.get("yesPrice") or 0)

    yes_bid = yes_book["bid"]
    yes_ask = yes_book["ask"]
    no_bid = no_book["bid"]
    no_ask = no_book["ask"]
    if yes_bid <= 0 or yes_ask <= 0 or no_bid <= 0 or no_ask <= 0:
        raise SystemExit(
            f"Live CLOB quote for {market_id} is incomplete: "
            f"YES {yes_bid:.4f}/{yes_ask:.4f}, NO {no_bid:.4f}/{no_ask:.4f}"
        )

    return {
        "yesPrice": gamma_yes,
        "bestBid": yes_bid,
        "bestAsk": yes_ask,
        "spread": max(0.0, yes_ask - yes_bid),
        "liquidity": float(market.get("liquidity") or snapshot_contract.get("liquidity") or 0),
        "volume": float(market.get("volume") or snapshot_contract.get("volume") or 0),
        "lastTradePrice": float(market.get("lastTradePrice") or 0),
        "updatedAt": market.get("updatedAt"),
        "quoteSource": "live_clob",
        "yesTokenId": str(token_ids[yes_idx]),
        "noTokenId": str(token_ids[no_idx]),
        "yesBidSize": yes_book["bidSize"],
        "yesAskSize": yes_book["askSize"],
        "noBestBid": no_bid,
        "noBestAsk": no_ask,
        "noSpread": max(0.0, no_ask - no_bid),
        "noBidSize": no_book["bidSize"],
        "noAskSize": no_book["askSize"],
        "clobTimestamp": yes_book.get("timestamp"),
        "clobBookHash": yes_book.get("hash"),
    }


def side_entry_price(contract: Dict[str, Any], side: str) -> float:
    yes_price = float(contract.get("yesPrice") or 0)
    best_bid = float(contract.get("bestBid") or 0)
    best_ask = float(contract.get("bestAsk") or 0)
    if side == "yes":
        return best_ask if best_ask > 0 else yes_price
    no_ask = float(contract.get("noBestAsk") or 0)
    return no_ask if no_ask > 0 else (1.0 - best_bid if best_bid > 0 else 1.0 - yes_price)


def market_quality(contract: Dict[str, Any]) -> Dict[str, Any]:
    bid = float(contract.get("bestBid") or 0)
    ask = float(contract.get("bestAsk") or 0)
    spread = float(contract.get("spread") or max(0.0, ask - bid))
    no_bid = float(contract.get("noBestBid") or 0)
    no_ask = float(contract.get("noBestAsk") or 0)
    no_spread = float(contract.get("noSpread") or max(0.0, no_ask - no_bid))
    liquidity = float(contract.get("liquidity") or 0)
    flags: List[str] = []
    if bid <= 0 or ask <= 0:
        flags.append("missing_bid_ask")
    if spread > 0.03:
        flags.append("wide_pm_spread")
    if no_bid and no_ask and no_spread > 0.03:
        flags.append("wide_pm_no_spread")
    if liquidity < 1000:
        flags.append("low_pm_liquidity")
    return {
        "quoteSource": contract.get("quoteSource", "snapshot"),
        "quotedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "gammaUpdatedAt": contract.get("updatedAt"),
        "clobTimestamp": contract.get("clobTimestamp"),
        "yesBid": round(bid, 4),
        "yesAsk": round(ask, 4),
        "yesSpread": round(spread, 4),
        "yesBidSize": round(float(contract.get("yesBidSize") or 0), 4),
        "yesAskSize": round(float(contract.get("yesAskSize") or 0), 4),
        "noBid": round(no_bid, 4),
        "noAsk": round(no_ask, 4),
        "noSpread": round(no_spread, 4),
        "noBidSize": round(float(contract.get("noBidSize") or 0), 4),
        "noAskSize": round(float(contract.get("noAskSize") or 0), 4),
        "liquidity": round(liquidity, 2),
        "flags": flags,
    }


def parse_heatmap_row_snapshot(value: str) -> Dict[str, Any] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid heatmap row JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SystemExit("Invalid heatmap row JSON: expected object")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(description="Add a manual IV-touch shadow trade.")
    parser.add_argument("--event", required=True, help="Polymarket event slug")
    parser.add_argument("--market-id", required=True, help="Polymarket market ID")
    parser.add_argument("--side", choices=["yes", "no"], required=True, help="Token side to buy")
    parser.add_argument("--signal-type", default="", help="Manual shadow signal type")
    parser.add_argument("--reason", default="", help="Human thesis/reason")
    parser.add_argument("--heatmap-row-json", default="", help="Full heatmap row snapshot JSON")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--force", action="store_true", help="Allow duplicate open shadows on the same contract/side")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and print the live quote without writing state")
    args = parser.parse_args()

    data_dir = args.data_dir
    snapshot = latest_snapshot(data_dir / "instrument-snapshots.jsonl")
    event, snapshot_contract = find_contract(snapshot, args.event, args.market_id)
    live_quote = fresh_polymarket_quote(args.event, args.market_id, snapshot_contract)
    contract = {**snapshot_contract, **live_quote}
    asset = str(event.get("asset", ""))
    side = args.side
    instrument_type = "pm_yes" if side == "yes" else "pm_no"
    direction = "long" if side == "yes" else "short"
    entry_price = side_entry_price(contract, side)
    if entry_price <= 0 or entry_price >= 1:
        raise SystemExit(f"Invalid live entry price {entry_price:.4f} for {side.upper()} side")

    signal_type = args.signal_type or ("USER_PM_IV_TOUCH_CHEAP_YES" if side == "yes" else "USER_PM_IV_TOUCH_RICH_NO")
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    trade_id = f"MANUAL-IVTOUCH-{asset}-{side.upper()}-{args.market_id}-{int(datetime.now(timezone.utc).timestamp())}"
    thesis = (
        "Manual user IV-touch shadow signal: "
        f"{args.reason.strip() or 'Polymarket tail-touch price differs from options-derived touch model.'} "
        "Exclude from official live-trader performance until validated."
    )
    instrument_id = f"{args.event}::{args.market_id}"
    instrument_label = f"{args.event} — {side.upper()} — {contract.get('question', '')}"
    spot = snapshot.get("spots", {}).get(asset)
    heatmap_row_snapshot = parse_heatmap_row_snapshot(args.heatmap_row_json)
    quality = market_quality(contract)

    blocked_path = data_dir / "blocked-signals.json"
    blocked = read_json(blocked_path, [])
    if not args.force:
        for shadow in blocked:
            position = shadow.get("position", {})
            if (
                shadow.get("status") == "open"
                and shadow.get("signalType") == signal_type
                and position.get("instrumentId") == instrument_id
                and position.get("instrumentType") == instrument_type
            ):
                raise SystemExit(f"Open duplicate already exists: {shadow.get('id')}")

    record = {
        "id": trade_id,
        "status": "open",
        "blockedAt": now,
        "blockedReason": "manual_shadow_trade",
        "signalType": signal_type,
        "asset": asset,
        "venue": "polymarket",
        "direction": direction,
        "confidence": 1,
        "thesis": thesis,
        "learningParamsSnapshot": learning_snapshot(data_dir),
        "position": {
            "id": trade_id,
            "openedAt": now,
            "asset": asset,
            "venue": "polymarket",
            "direction": direction,
            "entryPrice": round(entry_price, 6),
            "currentPrice": round(entry_price, 6),
            "size": 1,
            "leverage": 1,
            "signalType": signal_type,
            "hypothesisId": None,
            "thesis": thesis,
            "targetPct": None,
            "stopPct": 100,
            "expiryDate": contract.get("endDate") or now,
            "instrumentType": instrument_type,
            "instrumentId": instrument_id,
            "instrumentLabel": instrument_label,
            "entryUnderlyingPrice": spot,
            "currentUnderlyingPrice": spot,
        },
        "marketQuality": quality,
        "liveQuoteSnapshot": {
            "quoteSource": contract.get("quoteSource"),
            "yesBid": quality["yesBid"],
            "yesAsk": quality["yesAsk"],
            "noBid": quality["noBid"],
            "noAsk": quality["noAsk"],
            "entrySide": side,
            "entryPrice": round(entry_price, 6),
            "lastTradePrice": round(float(contract.get("lastTradePrice") or 0), 6),
            "gammaUpdatedAt": contract.get("updatedAt"),
            "clobTimestamp": contract.get("clobTimestamp"),
            "yesTokenId": contract.get("yesTokenId"),
            "noTokenId": contract.get("noTokenId"),
        },
    }
    if heatmap_row_snapshot:
        record["heatmapRowSnapshot"] = heatmap_row_snapshot

    if args.dry_run:
        print(json.dumps(record["liveQuoteSnapshot"], indent=2))
        return

    blocked.append(record)
    write_json(blocked_path, blocked)
    print(
        f"Added {trade_id}: buy {side.upper()} {instrument_label} @ {entry_price:.4f} "
        f"(live YES {quality['yesBid']:.4f}/{quality['yesAsk']:.4f}, "
        f"NO {quality['noBid']:.4f}/{quality['noAsk']:.4f})"
    )


if __name__ == "__main__":
    main()
