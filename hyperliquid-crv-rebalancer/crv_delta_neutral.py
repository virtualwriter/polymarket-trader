#!/usr/bin/env python3
"""
CRV Delta-Neutral Hedge Manager

Maintains a short CRV-PERP position on Hyperliquid sized to match your yCRV holdings,
adjusted for the yCRV/CRV peg ratio. Fetches prices from CoinGecko free API.

Usage:
    python crv_delta_neutral.py status                     - Show peg, position, hedge info
    python crv_delta_neutral.py set-holdings <ycrv_amount> - Set your yCRV holdings
    python crv_delta_neutral.py rebalance                  - Adjust hedge to match current peg
    python crv_delta_neutral.py rebalance --execute        - Actually execute the rebalance
    python crv_delta_neutral.py loop                       - Run daily rebalance loop
    python crv_delta_neutral.py loop --execute             - Run daily loop with execution

Environment Variables (in .env):
    HYPERLIQUID_PRIVATE_KEY  - Your Hyperliquid wallet private key
    HYPERLIQUID_ADDRESS      - Your Hyperliquid account address (optional)
"""

import os
import sys
import json
import time
import math
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

import eth_account
from eth_account.signers.local import LocalAccount
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))

try:
    from hyperliquid.exchange import Exchange
    from hyperliquid.info import Info
    from hyperliquid.utils import constants
except ImportError:
    print("Hyperliquid SDK not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "hyperliquid-python-sdk"])
    from hyperliquid.exchange import Exchange
    from hyperliquid.info import Info
    from hyperliquid.utils import constants

load_dotenv()

# --- Configuration ---
PRIVATE_KEY = os.getenv("HYPERLIQUID_PRIVATE_KEY") or os.getenv("PRIVATE_KEY_2")
ACCOUNT_ADDRESS = os.getenv("HYPERLIQUID_ADDRESS", "")
USE_MAINNET = os.getenv("HYPERLIQUID_MAINNET", "true").lower() == "true"

CRV_COIN = "CRV"
COINGECKO_CRV_ID = "curve-dao-token"
COINGECKO_YCRV_ID = "yearn-crv"
COINGECKO_API = "https://api.coingecko.com/api/v3"

TAKER_FEE_PCT = 0.00035
MAKER_FEE_PCT = 0.0001
MIN_ORDER_VALUE_USD = 10.0

TARGET_LEVERAGE = 2
LEVERAGE_IS_CROSS = True

# Hedge ratio: 1.0 = full hedge, 0.5 = hedge 50% of exposure
HEDGE_RATIO = 0.0  # DISABLED — set to 0 to prevent any active trading

# Don't rebalance unless hedge is off by more than this percentage
REBALANCE_THRESHOLD_PCT = 5.0

# Daily loop interval in seconds (24 hours)
LOOP_INTERVAL_SECONDS = 86400

STATE_FILE = Path(__file__).parent / "crv_hedge_state.json"
LOG_FILE = Path(__file__).parent / "crv_hedge_log.jsonl"


# --- State Management ---

def load_state() -> Dict[str, Any]:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"ycrv_holdings": 0, "last_peg": None, "last_rebalance": None}


def save_state(state: Dict[str, Any]) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def log_event(data: Dict[str, Any]) -> None:
    entry = {"timestamp": datetime.now(timezone.utc).isoformat(), **data}
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")


def log_order_response(
    action: str,
    peg: float,
    target_short: float,
    current_short: float,
    adjust_size: float,
    result: Dict[str, Any],
) -> None:
    """Persist the raw exchange response for every order attempt."""
    log_event({
        "event": "order_response",
        "action": action,
        "peg": peg,
        "target": target_short,
        "previous": current_short,
        "adjustment": adjust_size,
        "result": result,
    })


def log_min_notional_skip(
    action: str,
    peg: float,
    target_short: float,
    current_short: float,
    adjust_size: float,
    notional: float,
) -> None:
    log_event({
        "event": "skipped_below_min_notional",
        "action": action,
        "peg": peg,
        "target": target_short,
        "previous": current_short,
        "adjustment": adjust_size,
        "notional": notional,
        "minimum_notional": MIN_ORDER_VALUE_USD,
    })


def minimum_order_size(crv_price: float) -> float:
    """Minimum whole-CRV size needed to meet the exchange notional floor."""
    if crv_price <= 0:
        return 0.0
    return float(math.ceil(MIN_ORDER_VALUE_USD / crv_price))


# --- Price Fetching ---

def fetch_prices() -> Tuple[float, float, float]:
    """Fetch CRV and yCRV prices from CoinGecko. Returns (crv_usd, ycrv_usd, peg_ratio)."""
    url = f"{COINGECKO_API}/simple/price"
    params = {"ids": f"{COINGECKO_CRV_ID},{COINGECKO_YCRV_ID}", "vs_currencies": "usd"}

    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    crv_usd = data[COINGECKO_CRV_ID]["usd"]
    ycrv_usd = data[COINGECKO_YCRV_ID]["usd"]
    peg = ycrv_usd / crv_usd

    return crv_usd, ycrv_usd, peg


def fetch_funding_rate(info: Info) -> Optional[float]:
    """Fetch current CRV funding rate from Hyperliquid."""
    try:
        meta = info.meta_and_asset_ctxs()
        universe = meta[0]["universe"]
        contexts = meta[1]
        for i, asset in enumerate(universe):
            if asset["name"] == CRV_COIN:
                return float(contexts[i].get("funding", 0))
    except Exception as e:
        print(f"  Could not fetch funding rate: {e}")
    return None


# --- Hyperliquid Connection ---

def setup_hyperliquid() -> Tuple[str, Info, Exchange]:
    if not PRIVATE_KEY:
        print("HYPERLIQUID_PRIVATE_KEY not set in .env")
        sys.exit(1)

    account: LocalAccount = eth_account.Account.from_key(PRIVATE_KEY)
    address = ACCOUNT_ADDRESS if ACCOUNT_ADDRESS else account.address
    base_url = constants.MAINNET_API_URL if USE_MAINNET else constants.TESTNET_API_URL

    info = Info(base_url, skip_ws=True)
    exchange = Exchange(account, base_url, account_address=address if address != account.address else None)

    try:
        exchange.update_leverage(TARGET_LEVERAGE, CRV_COIN, is_cross=LEVERAGE_IS_CROSS)
        print(f"  Leverage set to {TARGET_LEVERAGE}x cross on {CRV_COIN}-PERP")
    except Exception as e:
        print(f"  Could not set leverage: {e}")

    return address, info, exchange


def get_crv_position(info: Info, address: str) -> Dict[str, Any]:
    """Get current CRV-PERP position on Hyperliquid."""
    try:
        user_state = info.user_state(address)
        for pos_data in user_state.get("assetPositions", []):
            pos = pos_data.get("position", {})
            if pos.get("coin") == CRV_COIN:
                szi = float(pos.get("szi", 0))
                return {
                    "size": abs(szi),
                    "direction": "LONG" if szi > 0 else "SHORT" if szi < 0 else "NONE",
                    "entry_price": float(pos.get("entryPx", 0) or 0),
                    "unrealized_pnl": float(pos.get("unrealizedPnl", 0)),
                    "liquidation_price": float(pos.get("liquidationPx", 0) or 0),
                }
        return {"size": 0, "direction": "NONE", "unrealized_pnl": 0}
    except Exception as e:
        print(f"  Error getting position: {e}")
        return {"size": 0, "direction": "NONE", "unrealized_pnl": 0}


def get_crv_price_hl(info: Info) -> float:
    """Get CRV mark price from Hyperliquid."""
    try:
        mids = info.all_mids()
        return float(mids.get(CRV_COIN, 0))
    except Exception:
        return 0.0


# --- Core Logic ---

def calculate_target_short(ycrv_holdings: float, peg_ratio: float) -> float:
    """How many CRV to short = yCRV holdings * peg ratio * hedge ratio."""
    return ycrv_holdings * peg_ratio * HEDGE_RATIO


def show_status(info: Info, address: str) -> None:
    state = load_state()
    ycrv_holdings = state.get("ycrv_holdings", 0)

    print("\n" + "=" * 60)
    print("  CRV DELTA-NEUTRAL HEDGE STATUS")
    print("=" * 60)

    # Prices
    try:
        crv_usd, ycrv_usd, peg = fetch_prices()
        print(f"\n  Prices (CoinGecko):")
        print(f"    CRV:  ${crv_usd:.6f}")
        print(f"    yCRV: ${ycrv_usd:.6f}")
        print(f"    Peg:  {peg:.4f} yCRV/CRV ({peg * 100:.1f}%)")
    except Exception as e:
        print(f"\n  Could not fetch CoinGecko prices: {e}")
        peg = state.get("last_peg", 0.674)
        crv_usd = 0
        ycrv_usd = 0

    # Holdings
    print(f"\n  Holdings:")
    print(f"    yCRV: {ycrv_holdings:,.2f}")
    target_short = calculate_target_short(ycrv_holdings, peg)
    print(f"    Target CRV short: {target_short:,.2f} (= {ycrv_holdings:,.2f} x {peg:.4f} x {HEDGE_RATIO:.2f})")
    if crv_usd > 0:
        print(f"    yCRV value:  ${ycrv_holdings * ycrv_usd:,.2f}")
        print(f"    Hedge value: ${target_short * crv_usd:,.2f}")

    # Hyperliquid position
    position = get_crv_position(info, address)
    crv_hl_price = get_crv_price_hl(info)
    print(f"\n  Hyperliquid CRV-PERP:")
    print(f"    Mark price: ${crv_hl_price:.6f}")
    print(f"    Direction:  {position['direction']}")
    print(f"    Size:       {position['size']:,.2f} CRV")
    print(f"    Notional:   ${position['size'] * crv_hl_price:,.2f}")
    print(f"    uPnL:       ${position['unrealized_pnl']:.2f}")
    if position.get("entry_price", 0) > 0:
        print(f"    Entry:      ${position['entry_price']:.6f}")
    if position.get("liquidation_price", 0) > 0:
        print(f"    Liq price:  ${position['liquidation_price']:.6f}")

    # Funding
    funding = fetch_funding_rate(info)
    if funding is not None:
        ann_funding = funding * 24 * 365 * 100
        direction = "shorts earn" if ann_funding > 0 else "shorts pay"
        print(f"    Funding:    {funding * 100:.4f}%/hr ({ann_funding:.2f}% ann. — {direction})")

    # Hedge gap
    current_short = position["size"] if position["direction"] == "SHORT" else 0
    if target_short > 0:
        gap = current_short - target_short
        gap_pct = (gap / target_short) * 100
        print(f"\n  Hedge Analysis:")
        print(f"    Current short: {current_short:,.2f} CRV")
        print(f"    Target short:  {target_short:,.2f} CRV")
        print(f"    Gap:           {gap:+,.2f} CRV ({gap_pct:+.1f}%)")
        if abs(gap_pct) > REBALANCE_THRESHOLD_PCT:
            print(f"    STATUS: REBALANCE NEEDED (>{REBALANCE_THRESHOLD_PCT}% off)")
        else:
            print(f"    STATUS: IN RANGE (within {REBALANCE_THRESHOLD_PCT}%)")
    elif ycrv_holdings == 0:
        print(f"\n  No yCRV holdings set. Run: python crv_delta_neutral.py set-holdings <amount>")

    print("\n" + "=" * 60)


def rebalance(info: Info, exchange: Exchange, address: str, execute: bool = False) -> None:
    state = load_state()
    ycrv_holdings = state.get("ycrv_holdings", 0)

    if ycrv_holdings == 0:
        print("No yCRV holdings set. Run: python crv_delta_neutral.py set-holdings <amount>")
        return

    crv_usd, ycrv_usd, peg = fetch_prices()
    target_short = calculate_target_short(ycrv_holdings, peg)

    position = get_crv_position(info, address)
    current_short = position["size"] if position["direction"] == "SHORT" else 0

    gap = target_short - current_short
    gap_pct = (gap / target_short) * 100 if target_short > 0 else 0

    print(f"\n  Peg: {peg:.4f} | Target: {target_short:,.2f} CRV | Current: {current_short:,.2f} CRV | Gap: {gap:+,.2f} ({gap_pct:+.1f}%)")

    if abs(gap_pct) <= REBALANCE_THRESHOLD_PCT:
        print(f"  Within {REBALANCE_THRESHOLD_PCT}% threshold — no rebalance needed.")
        state["last_peg"] = peg
        save_state(state)
        return

    # Determine action: need to short more or reduce short
    crv_hl_price = get_crv_price_hl(info)

    if gap > 0:
        # Need to increase short
        adjust_size = round(gap, 0)
        if current_short == 0:
            adjust_size = max(adjust_size, minimum_order_size(crv_hl_price))
        notional = adjust_size * crv_hl_price
        fee = notional * TAKER_FEE_PCT
        target_note = " using minimum order floor" if current_short == 0 and adjust_size > round(gap, 0) else ""
        print(f"  Action: SHORT {adjust_size:,.0f} more CRV (${notional:,.2f} notional, ~${fee:.2f} fee){target_note}")

        if execute:
            if notional < MIN_ORDER_VALUE_USD:
                print(f"  Skipping: order value ${notional:,.2f} is below ${MIN_ORDER_VALUE_USD:,.2f} minimum.")
                log_min_notional_skip("increase_short", peg, target_short, current_short, adjust_size, notional)
            else:
                try:
                    result = exchange.market_open(CRV_COIN, is_buy=False, sz=adjust_size, slippage=0.01)
                    log_order_response("increase_short", peg, target_short, current_short, adjust_size, result)
                    if result.get("status") == "ok":
                        statuses = result.get("response", {}).get("data", {}).get("statuses", [])
                        for s in statuses:
                            if "filled" in s:
                                filled = s["filled"]
                                print(f"  FILLED: {filled['totalSz']} CRV @ ${filled['avgPx']}")
                                log_event({
                                    "event": "rebalance_increase_short",
                                    "peg": peg, "target": target_short,
                                    "previous": current_short, "adjustment": adjust_size,
                                    "fill_price": float(filled["avgPx"]),
                                })
                            elif "error" in s:
                                print(f"  Error: {s['error']}")
                    else:
                        print(f"  Failed: {result}")
                except Exception as e:
                    print(f"  Execution failed: {e}")
                    log_event({
                        "event": "rebalance_failed",
                        "action": "increase_short",
                        "peg": peg,
                        "target": target_short,
                        "previous": current_short,
                        "adjustment": adjust_size,
                        "error": str(e),
                    })
        else:
            print("  DRY RUN — add --execute to trade")

    else:
        # Need to reduce short (buy back some)
        adjust_size = round(abs(gap), 0)
        notional = adjust_size * crv_hl_price
        fee = notional * TAKER_FEE_PCT
        print(f"  Action: REDUCE short by {adjust_size:,.0f} CRV (${notional:,.2f} notional, ~${fee:.2f} fee)")

        if execute:
            if adjust_size >= current_short:
                # Close entire position
                try:
                    result = exchange.market_close(CRV_COIN, slippage=0.01)
                    log_order_response("close_short", peg, target_short, current_short, -current_short, result)
                    if result.get("status") == "ok":
                        print("  Position closed entirely.")
                        log_event({"event": "rebalance_close", "peg": peg})
                    else:
                        print(f"  Failed: {result}")
                except Exception as e:
                    print(f"  Execution failed: {e}")
                    log_event({
                        "event": "rebalance_failed",
                        "action": "close_short",
                        "peg": peg,
                        "target": target_short,
                        "previous": current_short,
                        "adjustment": -current_short,
                        "error": str(e),
                    })
            else:
                if notional < MIN_ORDER_VALUE_USD:
                    print(f"  Skipping: order value ${notional:,.2f} is below ${MIN_ORDER_VALUE_USD:,.2f} minimum.")
                    log_min_notional_skip("reduce_short", peg, target_short, current_short, -adjust_size, notional)
                else:
                    try:
                        result = exchange.market_open(CRV_COIN, is_buy=True, sz=adjust_size, slippage=0.01)
                        log_order_response("reduce_short", peg, target_short, current_short, -adjust_size, result)
                        if result.get("status") == "ok":
                            statuses = result.get("response", {}).get("data", {}).get("statuses", [])
                            for s in statuses:
                                if "filled" in s:
                                    filled = s["filled"]
                                    print(f"  FILLED: bought back {filled['totalSz']} CRV @ ${filled['avgPx']}")
                                    log_event({
                                        "event": "rebalance_reduce_short",
                                        "peg": peg, "target": target_short,
                                        "previous": current_short, "adjustment": -adjust_size,
                                        "fill_price": float(filled["avgPx"]),
                                    })
                                elif "error" in s:
                                    print(f"  Error: {s['error']}")
                        else:
                            print(f"  Failed: {result}")
                    except Exception as e:
                        print(f"  Execution failed: {e}")
                        log_event({
                            "event": "rebalance_failed",
                            "action": "reduce_short",
                            "peg": peg,
                            "target": target_short,
                            "previous": current_short,
                            "adjustment": -adjust_size,
                            "error": str(e),
                        })
        else:
            print("  DRY RUN — add --execute to trade")

    state["last_peg"] = peg
    state["last_rebalance"] = datetime.now(timezone.utc).isoformat()
    save_state(state)


def run_loop(info: Info, exchange: Exchange, address: str, execute: bool = False) -> None:
    print(f"\n  ⛔ Loop is DISABLED (HEDGE_RATIO=0). No trades will be made.")
    return

    while True:
        try:
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            print(f"\n--- {now} ---")
            rebalance(info, exchange, address, execute=execute)
        except Exception as e:
            print(f"  Loop error: {e}")
            log_event({"event": "loop_error", "error": str(e)})

        print(f"  Next check in {LOOP_INTERVAL_SECONDS / 3600:.0f} hours...")
        time.sleep(LOOP_INTERVAL_SECONDS)


def main():
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        return

    command = args[0].lower()

    if command == "set-holdings":
        if len(args) < 2:
            print("Usage: python crv_delta_neutral.py set-holdings <ycrv_amount>")
            return
        amount = float(args[1])
        state = load_state()
        state["ycrv_holdings"] = amount
        save_state(state)
        print(f"  yCRV holdings set to {amount:,.2f}")
        print(f"  Now run: python crv_delta_neutral.py status")
        return

    # All other commands need Hyperliquid
    address, info, exchange = setup_hyperliquid()

    if command == "status":
        show_status(info, address)
    elif command == "rebalance":
        execute = "--execute" in args
        rebalance(info, exchange, address, execute=execute)
    elif command == "loop":
        execute = "--execute" in args
        run_loop(info, exchange, address, execute=execute)
    else:
        print(f"Unknown command: {command}")
        print(__doc__)


if __name__ == "__main__":
    main()
