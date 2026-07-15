#!/usr/bin/env python3
"""Read-only production invariant checks for the paper-trading engine
(Research Registry Phase 1). Intended to run hourly at :40 via
polymarket-registry-guards.timer, right after the :27 engine run.

Checks (all read-only against data files — never mutates production state):
  1. Stop-policy invariant     — open WEEKEND_HL_FUNDING_REVERSION_LONG
                                  positions must have stopPct=100, targetPct=3
                                  (see INC-0002).
  2. Duplicate-position invariant — no two open positions share
                                  (signalType, instrument key) (see INC-0001).
  3. Taint-coverage invariant  — every id in operationally-tainted-trades.json
                                  exists in the ledger (main or archive CSV),
                                  catching typos.

On violation: send a Telegram alert (unless --no-telegram) and exit 1.
On pass: print "guards ok" and exit 0.

All input paths are overridable via flags so this script — and its
violation-detection path — can be exercised against throwaway copies without
touching production data (see the paired /tmp fixture flow in the Phase 1
test plan).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

WEEKEND_SIGNAL_TYPE = "WEEKEND_HL_FUNDING_REVERSION_LONG"
WEEKEND_REQUIRED_STOP_PCT = 100
WEEKEND_REQUIRED_TARGET_PCT = 3


def load_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open(encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"failed to parse {path}: {exc}") from exc


def read_csv_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8") as fh:
        return {row["id"] for row in csv.DictReader(fh) if row.get("id")}


def numish(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def positions_from_portfolio(portfolio: Any) -> list[dict[str, Any]]:
    if not isinstance(portfolio, dict):
        return []
    positions = portfolio.get("positions")
    return [p for p in positions if isinstance(p, dict)] if isinstance(positions, list) else []


def positions_from_engine_state(engine_state: Any) -> list[dict[str, Any]]:
    if not isinstance(engine_state, dict):
        return []
    positions = engine_state.get("openPositions")
    return [p for p in positions if isinstance(p, dict)] if isinstance(positions, list) else []


def position_id(pos: dict[str, Any]) -> str:
    return str(pos.get("id") or pos.get("positionId") or "<unknown>")


def instrument_key(pos: dict[str, Any]) -> str:
    """Groups by explicit instrumentId when present — this already equals the
    monotonic-arb pm_package packageId (trading-engine.ts sets
    `instrumentId: pkg.packageId` for those positions), so a single
    (signalType, instrumentId) dedup covers the "no duplicated package ids"
    requirement too. Positions without an instrumentId (spot/perp) fall back
    to asset, since those have no other natural instrument identity."""
    iid = pos.get("instrumentId")
    if iid:
        return str(iid)
    return f"asset:{pos.get('asset')}"


def check_stop_policy(positions: list[dict[str, Any]], source_label: str) -> list[str]:
    violations = []
    for pos in positions:
        if pos.get("signalType") != WEEKEND_SIGNAL_TYPE:
            continue
        stop_pct = numish(pos.get("stopPct"))
        target_pct = numish(pos.get("targetPct"))
        if stop_pct != WEEKEND_REQUIRED_STOP_PCT or target_pct != WEEKEND_REQUIRED_TARGET_PCT:
            violations.append(
                f"[stop-policy:{source_label}] {position_id(pos)} ({pos.get('asset')}) is {WEEKEND_SIGNAL_TYPE} "
                f"with stopPct={pos.get('stopPct')!r} targetPct={pos.get('targetPct')!r}; required "
                f"stopPct={WEEKEND_REQUIRED_STOP_PCT} targetPct={WEEKEND_REQUIRED_TARGET_PCT} (see INC-0002)."
            )
    return violations


def check_duplicate_positions(positions: list[dict[str, Any]], source_label: str) -> list[str]:
    violations = []
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for pos in positions:
        key = (str(pos.get("signalType")), instrument_key(pos))
        groups.setdefault(key, []).append(pos)
    for (signal_type, ikey), group in groups.items():
        if len(group) > 1:
            ids = ", ".join(position_id(p) for p in group)
            violations.append(
                f"[duplicate-position:{source_label}] {len(group)} open positions share signalType={signal_type} "
                f"instrument={ikey}: {ids} (see INC-0001)."
            )
    return violations


def check_taint_coverage(tainted: Any, known_ids: set[str]) -> list[str]:
    if not isinstance(tainted, dict):
        return ["[taint-coverage] operationally-tainted-trades.json is not a JSON object."]
    violations = []
    for trade_id in tainted:
        if trade_id not in known_ids:
            violations.append(
                f"[taint-coverage] tainted id '{trade_id}' not found in trades-detailed.csv or "
                "trades-detailed-archive.csv (possible typo)."
            )
    return violations


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def send_telegram_alert(env_file: Path, message: str) -> bool:
    env = parse_env_file(env_file)
    token = env.get("TELEGRAM_BOT_TOKEN")
    chat_id = env.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("warning: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set; cannot send alert", file=sys.stderr)
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": message}).encode("utf-8")
    try:
        with urllib.request.urlopen(url, data=data, timeout=15) as resp:
            resp.read()
        return True
    except (urllib.error.URLError, OSError) as exc:
        print(f"warning: failed to send Telegram alert: {exc.__class__.__name__}", file=sys.stderr)
        return False


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--portfolio-path", default=str(DATA_DIR / "portfolio.json"))
    parser.add_argument("--engine-state-path", default=str(DATA_DIR / "engine-state.json"))
    parser.add_argument("--tainted-path", default=str(DATA_DIR / "operationally-tainted-trades.json"))
    parser.add_argument("--trades-csv", default=str(DATA_DIR / "trades-detailed.csv"))
    parser.add_argument("--archive-csv", default=str(DATA_DIR / "trades-detailed-archive.csv"))
    parser.add_argument("--env-file", default="/etc/polymarket-trader.env")
    parser.add_argument(
        "--no-telegram", action="store_true",
        help="skip sending a Telegram alert on violation (for tests)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)

    portfolio = load_json_file(Path(args.portfolio_path), {})
    engine_state = load_json_file(Path(args.engine_state_path), {})
    tainted = load_json_file(Path(args.tainted_path), {})
    known_ids = read_csv_ids(Path(args.trades_csv)) | read_csv_ids(Path(args.archive_csv))

    portfolio_positions = positions_from_portfolio(portfolio)
    engine_state_positions = positions_from_engine_state(engine_state)

    violations: list[str] = []
    violations += check_stop_policy(portfolio_positions, "portfolio.json")
    violations += check_stop_policy(engine_state_positions, "engine-state.json")
    violations += check_duplicate_positions(portfolio_positions, "portfolio.json")
    violations += check_duplicate_positions(engine_state_positions, "engine-state.json")
    violations += check_taint_coverage(tainted, known_ids)

    if violations:
        print("GUARD VIOLATIONS:")
        for v in violations:
            print(f"  - {v}")
        message = "\n".join([
            "\U0001F6A8 polymarket-registry-guards violation(s):",
            *[f"- {v}" for v in violations],
        ])
        if args.no_telegram:
            print("(--no-telegram set; alert not sent)")
        else:
            sent = send_telegram_alert(Path(args.env_file), message)
            print("alert sent" if sent else "alert NOT sent (see warning above)")
        return 1

    print("guards ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
