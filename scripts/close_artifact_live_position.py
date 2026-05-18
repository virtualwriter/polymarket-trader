#!/usr/bin/env python3
"""Close a specific LIVE position as a strike-IV-skew data-quality artifact.

Designed for `T-1779049817841-htfg` (OIL CL settle over $56 NO) but generalised
behind a function so additional artifacts can be added if found.

What this script does (idempotently):
  1. Loads `data/portfolio.json` and the last record in `data/instrument-snapshots.jsonl`.
  2. Marks the target position at a CONSERVATIVE polymarket exit price
     (sell pm_no into the NO bid = 1 - bestAsk_yes), matching what the
     engine's `resolveBlockedSignalShadows` / signal-killed path use.
  3. Realises the position: removes from portfolio.positions, updates cash,
     totalRealizedPnl, totalTrades, winCount/lossCount.
  4. Appends a row to `data/trades-detailed.csv` with closeReason
     `data_quality_artifact` and a thesis suffix explaining the close.
  5. Re-writes `data/portfolio.json` with `lastUpdated` set to now.

Idempotency: if the target position is no longer in `portfolio.positions`,
the script reports it and exits cleanly without re-writing anything.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
PORTFOLIO_FILE = REPO / "data" / "portfolio.json"
SNAPSHOTS_FILE = REPO / "data" / "instrument-snapshots.jsonl"
TRADES_CSV = REPO / "data" / "trades-detailed.csv"


ARTIFACTS: list[dict[str, str]] = [
    {
        "id": "T-1779049817841-htfg",
        "note": (
            "Strike-IV-skew artifact (NO side, symmetric to BTC May $90k/$95k "
            "and OIL CL $175 YES shadows): spot ~$101.93, strike $56 (45% OTM "
            "downside), 44d DTE, option_iv 1.385 vs pm_iv 0.594 (2.33x). The "
            "$56-strike CME CL put IV reflects deep-OTM crash hedging demand, "
            "not real terminal-distribution expectations; with realistic pm_iv "
            "the model NO fair value collapses from ~16% to ~0.2%. The 19.1pt "
            "entry-time edge was the model paying for skew the market is not "
            "pricing. Closing per operator review."
        ),
    },
]


def now_iso() -> str:
    return (
        datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    )


def read_last_snapshot() -> dict[str, Any]:
    # Records can be large (multi-MB); stream line-by-line, keep the last
    # successfully-parsed JSON record.
    last: dict[str, Any] | None = None
    with SNAPSHOTS_FILE.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                last = json.loads(line)
            except json.JSONDecodeError:
                continue
    if last is None:
        raise SystemExit("instrument-snapshots.jsonl has no usable records")
    return last


def conservative_pm_exit_price(snapshot: dict[str, Any], position: dict[str, Any]) -> float | None:
    instrument_id = position.get("instrumentId") or ""
    if "::" not in instrument_id:
        return None
    event_slug, market_id = instrument_id.split("::", 1)
    event = next((e for e in snapshot.get("polymarket", []) if e.get("slug") == event_slug), None)
    if not event:
        return None
    contract = next((c for c in event.get("contracts", []) if c.get("marketId") == market_id), None)
    if not contract:
        return None
    yes_price = float(contract.get("yesPrice") or 0)
    best_bid = float(contract.get("bestBid") or 0)
    best_ask = float(contract.get("bestAsk") or 0)
    itype = position.get("instrumentType")
    if itype == "pm_yes":
        return best_bid if best_bid > 0 else yes_price
    if itype == "pm_no":
        return (1.0 - best_ask) if best_ask > 0 else (1.0 - yes_price)
    return None


def csv_escape(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def append_trade_row(trade: dict[str, Any]) -> None:
    cols = [
        trade["id"],
        trade["openedAt"],
        trade["closedAt"],
        trade["asset"],
        trade["venue"],
        trade["direction"],
        trade.get("instrumentType") or "",
        trade.get("instrumentId") or "",
        csv_escape(trade.get("instrumentLabel") or ""),
        str(trade["entryPrice"]),
        str(trade["exitPrice"]),
        str(trade["size"]),
        str(trade.get("leverage") or 1),
        f"{trade['pnl']:.4f}",
        f"{trade['pnlPct']:.2f}",
        f"{trade.get('marketPnl', trade['pnl']):.4f}",
        f"{trade.get('fundingPnl', 0.0):.4f}",
        trade["signalType"],
        trade.get("hypothesisId") or "",
        csv_escape(trade["thesis"]),
        trade["closeReason"],
    ]
    with TRADES_CSV.open("a", encoding="utf-8") as f:
        f.write(",".join(cols) + "\n")


def main() -> None:
    portfolio = json.loads(PORTFOLIO_FILE.read_text())
    snapshot = read_last_snapshot()
    positions_by_id = {p["id"]: p for p in portfolio["positions"]}

    closed: list[str] = []
    not_found: list[str] = []
    skipped: list[str] = []

    for artifact in ARTIFACTS:
        position = positions_by_id.get(artifact["id"])
        if not position:
            not_found.append(artifact["id"])
            continue

        exit_price = conservative_pm_exit_price(snapshot, position)
        if exit_price is None or exit_price <= 0 or exit_price >= 1:
            skipped.append(f"{artifact['id']} (could not compute exit price)")
            continue

        entry_price = float(position["entryPrice"])
        size = float(position["size"])
        leverage = float(position.get("leverage") or 1)
        funding_pnl = float(position.get("fundingPnlAccrued") or 0.0)
        underlying_now = snapshot.get("spots", {}).get(position["asset"])

        if position.get("instrumentType") in ("pm_yes", "pm_no"):
            shares = size / entry_price if entry_price > 0 else 0
            market_pnl = shares * (exit_price - entry_price)
        else:
            raw_return = (
                (exit_price - entry_price) / entry_price
                if position.get("direction") == "long"
                else (entry_price - exit_price) / entry_price
            )
            market_pnl = size * leverage * raw_return

        pnl = market_pnl + funding_pnl
        pnl_pct = (pnl / size) * 100.0 if size else 0.0
        closed_at = now_iso()

        position["currentPrice"] = exit_price
        if underlying_now is not None:
            position["currentUnderlyingPrice"] = underlying_now
        position["fundingPnlAccrued"] = funding_pnl

        portfolio["cash"] = float(portfolio["cash"]) + size + pnl
        portfolio["totalRealizedPnl"] = float(portfolio["totalRealizedPnl"]) + pnl
        portfolio["totalTrades"] = int(portfolio["totalTrades"]) + 1
        if pnl >= 0:
            portfolio["winCount"] = int(portfolio["winCount"]) + 1
        else:
            portfolio["lossCount"] = int(portfolio["lossCount"]) + 1

        portfolio["positions"] = [p for p in portfolio["positions"] if p["id"] != artifact["id"]]

        thesis = f"{position.get('thesis', '').rstrip()} | [CLOSED {closed_at[:10]} data_quality_artifact]: {artifact['note']}"

        trade = {
            "id": position["id"],
            "openedAt": position["openedAt"],
            "closedAt": closed_at,
            "asset": position["asset"],
            "venue": position["venue"],
            "direction": position["direction"],
            "entryPrice": entry_price,
            "exitPrice": exit_price,
            "size": size,
            "leverage": leverage,
            "pnl": pnl,
            "pnlPct": pnl_pct,
            "marketPnl": market_pnl,
            "fundingPnl": funding_pnl,
            "signalType": position["signalType"],
            "hypothesisId": position.get("hypothesisId"),
            "thesis": thesis,
            "closeReason": "data_quality_artifact",
            "instrumentType": position.get("instrumentType"),
            "instrumentId": position.get("instrumentId"),
            "instrumentLabel": position.get("instrumentLabel"),
        }
        append_trade_row(trade)
        closed.append(
            f"{artifact['id']} entry={entry_price:.4f} exit={exit_price:.4f} pnl={pnl:.4f} ({pnl_pct:.2f}%)"
        )

    if closed:
        portfolio["lastUpdated"] = now_iso()
        PORTFOLIO_FILE.write_text(json.dumps(portfolio, indent=2) + "\n")

    print("Closed as data_quality_artifact:")
    for line in closed:
        print(f"  ✓ {line}")
    if not closed:
        print("  (none)")
    if not_found:
        print("\nAlready closed / not in portfolio.positions:")
        for sid in not_found:
            print(f"  - {sid}")
    if skipped:
        print("\nSkipped:")
        for line in skipped:
            print(f"  ! {line}")


if __name__ == "__main__":
    main()
