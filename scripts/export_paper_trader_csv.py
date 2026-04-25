#!/usr/bin/env python3
"""
Export the live virtualwriter/polymarket-trader paper-trading data to CSV.

Outputs:
  - data/exports/paper_trader_trade_export.csv
  - data/exports/paper_trader_signal_summary.csv
"""

import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List

import requests


REPO_OWNER = "virtualwriter"
REPO_NAME = "polymarket-trader"
BRANCH = "main"
RAW_BASE_URL = f"https://raw.githubusercontent.com/{REPO_OWNER}/{REPO_NAME}/{BRANCH}/data"
API_BASE_URL = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"

EXPORT_DIR = Path(__file__).resolve().parents[1] / "data" / "exports"
TRADE_EXPORT_PATH = EXPORT_DIR / "paper_trader_trade_export.csv"
SIGNAL_EXPORT_PATH = EXPORT_DIR / "paper_trader_signal_summary.csv"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def fetch_json(url: str) -> object:
    response = requests.get(url, timeout=30, headers={"User-Agent": "paper-trader-exporter"})
    response.raise_for_status()
    return response.json()


def fetch_text(url: str) -> str:
    response = requests.get(url, timeout=30, headers={"User-Agent": "paper-trader-exporter"})
    response.raise_for_status()
    return response.text


def load_remote_csv(filename: str) -> List[Dict[str, str]]:
    content = fetch_text(f"{RAW_BASE_URL}/{filename}")
    return list(csv.DictReader(io.StringIO(content)))


def load_remote_json(filename: str) -> object:
    return fetch_json(f"{RAW_BASE_URL}/{filename}")


def get_head_commit() -> Dict[str, object]:
    commit = fetch_json(f"{API_BASE_URL}/commits/{BRANCH}")
    if not isinstance(commit, dict):
        raise ValueError("Unexpected commit payload from GitHub API")
    return commit


def deduplicate_closed_trades(rows: Iterable[Dict[str, str]]) -> List[Dict[str, str]]:
    by_id: Dict[str, Dict[str, str]] = {}
    for row in rows:
        trade_id = row.get("id", "")
        if not trade_id:
            continue
        current = by_id.get(trade_id)
        if current is None or row.get("closed_at", "") > current.get("closed_at", ""):
            by_id[trade_id] = row
    return sorted(by_id.values(), key=lambda row: (row.get("opened_at", ""), row.get("closed_at", "")))


def safe_float(value: object, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def calculate_open_position_pnl(position: Dict[str, object]) -> float:
    entry = safe_float(position.get("entryPrice"))
    current = safe_float(position.get("currentPrice"))
    leverage = safe_float(position.get("leverage"), 1.0)
    direction = str(position.get("direction", "")).lower()
    if entry == 0:
        return 0.0

    price_return = (current - entry) / entry
    if direction in {"short", "close"}:
        price_return = -price_return
    return price_return * leverage


def build_signal_maps(signal_weights: List[Dict[str, object]]) -> Dict[str, Dict[str, object]]:
    return {str(item.get("type", "")): item for item in signal_weights}


def build_trade_rows(
    closed_trades: List[Dict[str, str]],
    open_positions: List[Dict[str, object]],
    signal_map: Dict[str, Dict[str, object]],
    learning_params: Dict[str, object],
    source_commit_sha: str,
    source_commit_time: str,
    exported_at: str,
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []

    for trade in closed_trades:
        signal_type = trade.get("signal_type", "")
        signal = signal_map.get(signal_type, {})
        per_asset = signal.get("perAsset", {}).get(trade.get("asset", ""), {}) if isinstance(signal.get("perAsset"), dict) else {}
        rows.append(
            {
                "record_status": "closed",
                "trade_id": trade.get("id", ""),
                "opened_at": trade.get("opened_at", ""),
                "closed_at": trade.get("closed_at", ""),
                "asset": trade.get("asset", ""),
                "venue": trade.get("venue", ""),
                "direction": trade.get("direction", ""),
                "instrument_type": trade.get("instrument_type", ""),
                "instrument_id": trade.get("instrument_id", ""),
                "instrument_label": trade.get("instrument_label", ""),
                "entry_price": trade.get("entry_price", ""),
                "exit_or_current_price": trade.get("exit_price", ""),
                "size": trade.get("size", ""),
                "leverage": trade.get("leverage", ""),
                "pnl_fraction": trade.get("pnl", ""),
                "pnl_pct": trade.get("pnl_pct", ""),
                "market_pnl_fraction": trade.get("market_pnl", ""),
                "funding_pnl_fraction": trade.get("funding_pnl", ""),
                "signal_type": signal_type,
                "signal_weight_current": signal.get("weight", ""),
                "signal_trades_current": signal.get("trades", ""),
                "signal_wins_current": signal.get("wins", ""),
                "signal_avg_pnl_pct_current": signal.get("avgPnlPct", ""),
                "signal_last_triggered_current": signal.get("lastTriggered", ""),
                "signal_enabled_current": signal.get("enabled", ""),
                "signal_asset_trades_current": per_asset.get("trades", ""),
                "signal_asset_wins_current": per_asset.get("wins", ""),
                "signal_asset_avg_pnl_pct_current": per_asset.get("avgPnlPct", ""),
                "hypothesis_id": trade.get("hypothesis_id", ""),
                "thesis": trade.get("thesis", ""),
                "close_reason": trade.get("close_reason", ""),
                "macroMomentum24hThresholdPts": learning_params.get("macroMomentum24hThresholdPts", ""),
                "contrarianTrendMarginPct": learning_params.get("contrarianTrendMarginPct", ""),
                "positiveMomentum24hPct": learning_params.get("positiveMomentum24hPct", ""),
                "llmTradeExpiryDays": learning_params.get("llmTradeExpiryDays", ""),
                "momentumLongExpiryDays": learning_params.get("momentumLongExpiryDays", ""),
                "source_commit_sha": source_commit_sha,
                "source_commit_time": source_commit_time,
                "exported_at_utc": exported_at,
            }
        )

    for position in open_positions:
        signal_type = str(position.get("signalType", ""))
        signal = signal_map.get(signal_type, {})
        per_asset = signal.get("perAsset", {}).get(position.get("asset", ""), {}) if isinstance(signal.get("perAsset"), dict) else {}
        pnl_fraction = calculate_open_position_pnl(position)
        rows.append(
            {
                "record_status": "open",
                "trade_id": position.get("id", ""),
                "opened_at": position.get("openedAt", ""),
                "closed_at": "",
                "asset": position.get("asset", ""),
                "venue": position.get("venue", ""),
                "direction": position.get("direction", ""),
                "instrument_type": position.get("instrumentType", ""),
                "instrument_id": position.get("instrumentId", ""),
                "instrument_label": position.get("instrumentLabel", ""),
                "entry_price": position.get("entryPrice", ""),
                "exit_or_current_price": position.get("currentPrice", ""),
                "size": position.get("size", ""),
                "leverage": position.get("leverage", ""),
                "pnl_fraction": f"{pnl_fraction:.8f}",
                "pnl_pct": f"{pnl_fraction * 100:.4f}",
                "market_pnl_fraction": f"{pnl_fraction - safe_float(position.get('fundingPnlAccrued')):.8f}",
                "funding_pnl_fraction": position.get("fundingPnlAccrued", ""),
                "signal_type": signal_type,
                "signal_weight_current": signal.get("weight", ""),
                "signal_trades_current": signal.get("trades", ""),
                "signal_wins_current": signal.get("wins", ""),
                "signal_avg_pnl_pct_current": signal.get("avgPnlPct", ""),
                "signal_last_triggered_current": signal.get("lastTriggered", ""),
                "signal_enabled_current": signal.get("enabled", ""),
                "signal_asset_trades_current": per_asset.get("trades", ""),
                "signal_asset_wins_current": per_asset.get("wins", ""),
                "signal_asset_avg_pnl_pct_current": per_asset.get("avgPnlPct", ""),
                "hypothesis_id": position.get("hypothesisId", ""),
                "thesis": position.get("thesis", ""),
                "close_reason": "",
                "macroMomentum24hThresholdPts": learning_params.get("macroMomentum24hThresholdPts", ""),
                "contrarianTrendMarginPct": learning_params.get("contrarianTrendMarginPct", ""),
                "positiveMomentum24hPct": learning_params.get("positiveMomentum24hPct", ""),
                "llmTradeExpiryDays": learning_params.get("llmTradeExpiryDays", ""),
                "momentumLongExpiryDays": learning_params.get("momentumLongExpiryDays", ""),
                "source_commit_sha": source_commit_sha,
                "source_commit_time": source_commit_time,
                "exported_at_utc": exported_at,
            }
        )

    rows.sort(key=lambda row: (str(row["opened_at"]), str(row["record_status"]), str(row["trade_id"])))
    return rows


def build_signal_summary_rows(
    signal_weights: List[Dict[str, object]],
    learning_params: Dict[str, object],
    source_commit_sha: str,
    source_commit_time: str,
    exported_at: str,
) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for signal in sorted(signal_weights, key=lambda item: str(item.get("type", ""))):
        trades = safe_float(signal.get("trades"))
        wins = safe_float(signal.get("wins"))
        rows.append(
            {
                "signal_type": signal.get("type", ""),
                "weight": signal.get("weight", ""),
                "trades": signal.get("trades", ""),
                "wins": signal.get("wins", ""),
                "losses": int(trades - wins) if trades else 0,
                "win_rate_pct": f"{(wins / trades * 100):.2f}" if trades else "",
                "avg_pnl_pct": signal.get("avgPnlPct", ""),
                "last_triggered": signal.get("lastTriggered", ""),
                "enabled": signal.get("enabled", ""),
                "per_asset_json": json.dumps(signal.get("perAsset", {}), sort_keys=True),
                "macroMomentum24hThresholdPts": learning_params.get("macroMomentum24hThresholdPts", ""),
                "contrarianTrendMarginPct": learning_params.get("contrarianTrendMarginPct", ""),
                "positiveMomentum24hPct": learning_params.get("positiveMomentum24hPct", ""),
                "llmTradeExpiryDays": learning_params.get("llmTradeExpiryDays", ""),
                "momentumLongExpiryDays": learning_params.get("momentumLongExpiryDays", ""),
                "source_commit_sha": source_commit_sha,
                "source_commit_time": source_commit_time,
                "exported_at_utc": exported_at,
            }
        )
    return rows


def write_csv(path: Path, rows: List[Dict[str, object]]) -> None:
    if not rows:
        raise ValueError(f"No rows available for export to {path}")

    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    exported_at = utc_now_iso()
    head_commit = get_head_commit()
    source_commit_sha = str(head_commit.get("sha", ""))
    source_commit_time = str(
        head_commit.get("commit", {}).get("committer", {}).get("date", "")
    )

    closed_trades = deduplicate_closed_trades(load_remote_csv("trades-detailed.csv"))
    portfolio = load_remote_json("portfolio.json")
    if not isinstance(portfolio, dict):
        raise ValueError("Unexpected portfolio payload")
    open_positions = portfolio.get("positions", [])
    if not isinstance(open_positions, list):
        raise ValueError("Unexpected portfolio positions payload")

    signal_weights = load_remote_json("signal-weights.json")
    if not isinstance(signal_weights, list):
        raise ValueError("Unexpected signal weights payload")
    learning_params = load_remote_json("learning-params.json")
    if not isinstance(learning_params, dict):
        raise ValueError("Unexpected learning params payload")

    signal_map = build_signal_maps(signal_weights)
    trade_rows = build_trade_rows(
        closed_trades=closed_trades,
        open_positions=open_positions,
        signal_map=signal_map,
        learning_params=learning_params,
        source_commit_sha=source_commit_sha,
        source_commit_time=source_commit_time,
        exported_at=exported_at,
    )
    signal_rows = build_signal_summary_rows(
        signal_weights=signal_weights,
        learning_params=learning_params,
        source_commit_sha=source_commit_sha,
        source_commit_time=source_commit_time,
        exported_at=exported_at,
    )

    write_csv(TRADE_EXPORT_PATH, trade_rows)
    write_csv(SIGNAL_EXPORT_PATH, signal_rows)

    print(f"Wrote {len(trade_rows)} rows to {TRADE_EXPORT_PATH}")
    print(f"Wrote {len(signal_rows)} rows to {SIGNAL_EXPORT_PATH}")
    print(f"Source commit: {source_commit_sha} ({source_commit_time})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
