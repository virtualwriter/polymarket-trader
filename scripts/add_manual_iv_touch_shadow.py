#!/usr/bin/env python3
"""
Append a manual IV-touch Polymarket shadow trade from the latest scanner snapshot.

The heatmap is static, so its "Manual Shadow" buttons copy a command for this
script. Run it from the repo root locally or on the VPS, then commit/deploy state
if you want the manual shadow persisted in Git.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


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


def side_entry_price(contract: Dict[str, Any], side: str) -> float:
    yes_price = float(contract.get("yesPrice") or 0)
    best_bid = float(contract.get("bestBid") or 0)
    best_ask = float(contract.get("bestAsk") or 0)
    if side == "yes":
        return best_ask if best_ask > 0 else yes_price
    return 1.0 - best_bid if best_bid > 0 else 1.0 - yes_price


def market_quality(contract: Dict[str, Any]) -> Dict[str, Any]:
    bid = float(contract.get("bestBid") or 0)
    ask = float(contract.get("bestAsk") or 0)
    spread = float(contract.get("spread") or max(0.0, ask - bid))
    liquidity = float(contract.get("liquidity") or 0)
    flags: List[str] = []
    if bid <= 0 or ask <= 0:
        flags.append("missing_bid_ask")
    if spread > 0.03:
        flags.append("wide_pm_spread")
    if liquidity < 1000:
        flags.append("low_pm_liquidity")
    return {
        "yesBid": round(bid, 4),
        "yesAsk": round(ask, 4),
        "yesSpread": round(spread, 4),
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
    args = parser.parse_args()

    data_dir = args.data_dir
    snapshot = latest_snapshot(data_dir / "instrument-snapshots.jsonl")
    event, contract = find_contract(snapshot, args.event, args.market_id)
    asset = str(event.get("asset", ""))
    side = args.side
    instrument_type = "pm_yes" if side == "yes" else "pm_no"
    direction = "long" if side == "yes" else "short"
    entry_price = side_entry_price(contract, side)
    if entry_price <= 0 or entry_price >= 1:
        raise SystemExit(f"Invalid entry price {entry_price:.4f} for {side.upper()} side")

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
            "stopPct": 5,
            "expiryDate": contract.get("endDate") or now,
            "instrumentType": instrument_type,
            "instrumentId": instrument_id,
            "instrumentLabel": instrument_label,
            "entryUnderlyingPrice": spot,
            "currentUnderlyingPrice": spot,
        },
        "marketQuality": market_quality(contract),
    }
    if heatmap_row_snapshot:
        record["heatmapRowSnapshot"] = heatmap_row_snapshot
    blocked.append(record)
    write_json(blocked_path, blocked)
    print(f"Added {trade_id}: buy {side.upper()} {instrument_label} @ {entry_price:.4f}")


if __name__ == "__main__":
    main()
