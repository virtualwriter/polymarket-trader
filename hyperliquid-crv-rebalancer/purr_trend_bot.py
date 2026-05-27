#!/usr/bin/env python3
"""
PURR Trend Bot — Hyperliquid Spot & Perp
=========================================
Strategy: 5h EMA crossover with 1% entry/exit thresholds.

Supports two modes:
  --mode spot       Long-only on PURR/USDC spot (no leverage, no liquidations)
  --mode perp       Long or short on PURR-PERP at specified leverage

Usage:
    python purr_trend_bot.py --mode spot --capital 1000
    python purr_trend_bot.py --mode perp --capital 2000 --direction long
    python purr_trend_bot.py --mode perp --capital 2000 --direction short
    python purr_trend_bot.py --dry-run                   # Dry run any mode
"""

import os
import sys
import json
import time
import math
import signal
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import eth_account
from dotenv import load_dotenv
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

PRIVATE_KEY = os.getenv("HYPERLIQUID_PRIVATE_KEY")
MNEMONIC = os.getenv("HYPERLIQUID_MNEMONIC")
USE_MAINNET = os.getenv("HYPERLIQUID_MAINNET", "true").lower() == "true"


def derive_private_key(mnemonic: str) -> str:
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_mnemonic(mnemonic)
    return acct.key.hex()

# Strategy params
LONG_EMA = 5               # 5-hour EMA for long
LONG_ENTRY = 0.01          # 1% above EMA to enter long
LONG_EXIT = 0.01           # 1% below EMA to exit long

SHORT_EMA = 3              # 3-hour EMA for short
SHORT_ENTRY = 0.0          # plain crossover for short
SHORT_EXIT = 0.0

# Trading constants
COIN = "PURR"
CHECK_INTERVAL_SECONDS = 60 * 15  # Every 15 minutes
HISTORY_HOURS = 200
TAKER_FEE = 0.00035
DEFAULT_LEVERAGE = 1

# State persistence
STATE_FILE = Path(__file__).parent / "purr_bot_state.json"

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
running = True

def signal_handler(sig, frame):
    global running
    print("\n\nShutting down gracefully...")
    running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def compute_ema(prices: list, period: int) -> list:
    if len(prices) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    ema[period - 1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        ema[i] = prices[i] * k + ema[i - 1] * (1 - k)
    return ema


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {"in_position": False, "is_short": False, "entry_price": None,
            "entry_time": None, "trades": 0, "wins": 0, "total_fees_paid": 0.0,
            "funding_earned": 0.0, "mode": "spot", "direction": "long"}


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")
    sys.stdout.flush()


def get_sz_decimals(info, coin: str) -> int:
    """Get size decimals for a coin from perp metadata."""
    try:
        meta = info.meta()
        for asset in meta.get("universe", []):
            if asset["name"] == coin:
                return asset["szDecimals"]
    except Exception:
        pass
    return 0  # default for PURR


# ---------------------------------------------------------------------------
# Bot
# ---------------------------------------------------------------------------
class PurrTrendBot:
    def __init__(self, capital: float, mode: str, direction: str,
                 leverage: int, dry_run: bool = False):
        self.capital = capital
        self.mode = mode
        self.direction = direction
        self.leverage = leverage
        self.dry_run = dry_run
        self.state = load_state()

        # Track funding between cycles (perp only)
        self.last_check_time = time.time()

        if not dry_run:
            pk = PRIVATE_KEY
            if MNEMONIC:
                log("Deriving private key from mnemonic...")
                pk = derive_private_key(MNEMONIC)
            if not pk:
                log("FATAL: Neither HYPERLIQUID_PRIVATE_KEY nor HYPERLIQUID_MNEMONIC set")
                sys.exit(1)

            self.account = eth_account.Account.from_key(pk)
            self.address = self.account.address
            base_url = constants.MAINNET_API_URL if USE_MAINNET else constants.TESTNET_API_URL
            self.info = Info(base_url, skip_ws=True)
            self.exchange = Exchange(self.account, base_url)

            if mode == "perp":
                # Set leverage on perp
                try:
                    self.exchange.update_leverage(leverage, COIN)
                except Exception:
                    pass  # may already be set

            self.sz_decimals = get_sz_decimals(self.info, COIN)
        else:
            self.account = None
            self.address = "dry-run"
            self.info = None
            self.exchange = None
            self.sz_decimals = 0

        # Strategy params based on direction
        if direction == "long":
            self.ema_period = LONG_EMA
            self.entry_threshold = LONG_ENTRY
            self.exit_threshold = LONG_EXIT
        else:
            self.ema_period = SHORT_EMA
            self.entry_threshold = SHORT_ENTRY
            self.exit_threshold = SHORT_EXIT

        mode_desc = f"{mode.upper()} ({direction})"
        log(f"Bot initialized | Capital: ${capital:,.0f} | Mode: {mode_desc} | "
            f"{'1x' if leverage == 1 else str(leverage)+'x'} | "
            f"{'DRY RUN' if dry_run else 'LIVE'}")
        if self.state.get("in_position"):
            pos_desc = "SHORT" if self.state.get("is_short") else "LONG"
            log(f"State: {pos_desc} @ ${self.state.get('entry_price', '?')}")
        else:
            log("State: CASH")

    # ---- Price & Data ----
    def get_perp_price(self) -> Optional[float]:
        """Get current PURR perp mid price."""
        try:
            if self.dry_run:
                return None
            mids = self.info.all_mids()
            if COIN in mids:
                return float(mids[COIN])
            return None
        except Exception as e:
            log(f"Error getting perp price: {e}")
            return None

    def get_spot_price(self) -> Optional[float]:
        """Get PURR spot mid price."""
        try:
            if self.dry_run:
                return None
            # Try l2 snapshot for mid
            l2 = self.info.l2_snapshot(f"{COIN}/USDC")
            if l2 and "midPx" in l2:
                return float(l2["midPx"])
            mids = self.info.all_mids()
            if COIN in mids:
                return float(mids[COIN])
            return None
        except Exception:
            return self.get_perp_price()

    def get_price(self) -> Optional[float]:
        if self.mode == "perp":
            return self.get_perp_price()
        return self.get_spot_price()

    def get_historical_prices(self) -> list:
        try:
            if not self.dry_run:
                now = int(time.time() * 1000)
                start = now - HISTORY_HOURS * 3600 * 1000
                candles = self.info.candles_snapshot(COIN, "1h", start, now)
                if candles and len(candles) > self.ema_period:
                    return [float(c["c"]) for c in candles]
        except Exception as e:
            log(f"HL candle fetch failed: {e}")

        try:
            data_file = Path(__file__).parent / "purr_prices_180d.json"
            if data_file.exists():
                with open(data_file) as f:
                    prices = json.load(f)
                result = prices[-HISTORY_HOURS:]
                if not self.dry_run:
                    log(f"Loaded {len(result)} candles from local data file")
                return result
        except Exception:
            pass
        return []

    # ---- Account & Position ----
    def get_perp_position(self) -> Optional[dict]:
        """Get current PURR perp position."""
        try:
            if self.dry_run:
                return None
            user_state = self.info.user_state(self.address)
            for pos_data in user_state.get("assetPositions", []):
                pos = pos_data.get("position", {})
                if pos.get("coin") == COIN:
                    szi = float(pos.get("szi", 0))
                    if szi != 0:
                        return {
                            "size": abs(szi),
                            "direction": "SHORT" if szi < 0 else "LONG",
                            "entry_price": float(pos.get("entryPx", 0) or 0),
                            "liquidation_price": float(pos.get("liquidationPx", 0) or 0),
                            "unrealized_pnl": float(pos.get("unrealizedPnl", 0)),
                            "margin_used": float(pos.get("marginUsed", 0)),
                        }
            return None
        except Exception as e:
            log(f"Error getting perp position: {e}")
            return None

    def get_account_value(self) -> float:
        """Get total account value from perp wallet."""
        try:
            if self.dry_run:
                return self.capital
            user_state = self.info.user_state(self.address)
            margin = user_state.get("marginSummary", {})
            return float(margin.get("accountValue", 0))
        except Exception:
            return self.capital

    def get_spot_balance(self) -> tuple:
        try:
            if self.dry_run:
                return self.capital, 0
            spot_state = self.info.spot_user_state(self.address)
            balances = spot_state.get("balances", [])
            usdc = purr = 0.0
            for b in balances:
                if b.get("coin") == "USDC":
                    usdc = float(b.get("total", 0))
                elif b.get("coin") == "PURR":
                    purr = float(b.get("total", 0))
            return usdc, purr
        except Exception:
            return 0, 0

    # ---- Position Sizing ----
    def calculate_perp_size(self, price: float) -> float:
        """Calculate how many PURR to buy/sell on perp at 1x leverage."""
        available = self.get_account_value() if not self.dry_run else self.capital
        # At 1x leverage, notional = capital for full allocation
        # Leave a small buffer for fees
        max_notional = available * 0.98
        size = max_notional / price
        # Round down based on szDecimals
        return math.floor(size * (10 ** self.sz_decimals)) / (10 ** self.sz_decimals)

    def calculate_spot_size(self, price: float) -> float:
        available = self.capital
        max_spend = available - 5
        size = max_spend / price
        return math.floor(size)

    # ---- Order Execution ----
    def perp_market_open(self, is_buy: bool, size: float, price: float) -> bool:
        """Open a perp market position."""
        if self.dry_run:
            side = "BUY (long)" if is_buy else "SELL (short)"
            log(f"[DRY] Would perp {side} {size:.{self.sz_decimals}f} PURR")
            return True

        try:
            result = self.exchange.market_open(COIN, is_buy, size, slippage=0.01)
            if result.get("status") == "ok":
                statuses = result.get("response", {}).get("data", {}).get("statuses", [])
                for s in statuses:
                    if "filled" in s:
                        filled = s["filled"]
                        log(f"Order filled: {filled['totalSz']} @ ${filled['avgPx']}")
                        return True
                log("Order placed but not filled")
                return False
            else:
                log(f"Order failed: {result}")
                return False
        except Exception as e:
            log(f"Error opening perp position: {e}")
            return False

    def perp_market_close(self) -> bool:
        """Close the current perp position."""
        if self.dry_run:
            log(f"[DRY] Would close perp position")
            return True

        try:
            # market_close closes entire position for the coin
            result = self.exchange.market_close(COIN)
            if result.get("status") == "ok":
                log("Perp position closed")
                return True
            else:
                log(f"Close failed: {result}")
                return False
        except Exception as e:
            log(f"Error closing perp: {e}")
            return False

    def spot_market_buy(self, size: int, price: float) -> bool:
        if self.dry_run:
            log(f"[DRY] Would BUY {size} PURR spot @ ~${price:.4f}")
            return True

        try:
            order = self.exchange.order(
                name="PURR/USDC", is_buy=True, sz=size,
                limit_px=price * 1.03,
                order_type={"limit": {"tif": "Ioc"}},
            )
            if order.get("status") == "ok":
                return True
            log(f"Spot buy failed: {order}")
            return False
        except Exception as e:
            log(f"Error in spot buy: {e}")
            return False

    def spot_market_sell(self, size: int, price: float) -> bool:
        if self.dry_run:
            log(f"[DRY] Would SELL {size} PURR spot @ ~${price:.4f}")
            return True

        try:
            order = self.exchange.order(
                name="PURR/USDC", is_buy=False, sz=size,
                limit_px=price * 0.97,
                order_type={"limit": {"tif": "Ioc"}},
            )
            if order.get("status") == "ok":
                return True
            log(f"Spot sell failed: {order}")
            return False
        except Exception as e:
            log(f"Error in spot sell: {e}")
            return False

    # ---- Funding Tracker (perp only) ----
    def track_funding(self):
        """Estimate funding earned since last check (perp short earns funding)."""
        if self.mode != "perp" or self.dry_run:
            return
        if not self.state.get("in_position"):
            return

        elapsed_hours = (time.time() - self.last_check_time) / 3600
        if elapsed_hours < 0.5:
            return  # don't update too frequently

        # Get current position to check unrealized PnL changes
        pos = self.get_perp_position()
        if pos and self.state.get("is_short"):
            # Shorts earn ~0.0048% per hour on notional
            notional = pos["size"] * self.get_perp_price()
            funding_this_period = notional * 0.000048 * elapsed_hours
            self.state["funding_earned"] = self.state.get("funding_earned", 0) + funding_this_period
            self.capital += funding_this_period

        self.last_check_time = time.time()

    # ---- Main Trading Logic ----
    def check_and_trade(self):
        prices = self.get_historical_prices()
        if len(prices) < self.ema_period + 10:
            log(f"Insufficient price history ({len(prices)} candles), skipping")
            return

        ema = compute_ema(prices, self.ema_period)
        if ema[-1] is None:
            log("EMA not ready, skipping")
            return

        current_price = prices[-1]
        current_ema = ema[-1]
        ema_diff_pct = (current_price / current_ema - 1) * 100

        in_position = self.state.get("in_position", False)
        is_short = self.state.get("is_short", False)
        entry_price = self.state.get("entry_price")

        # Track funding if in perp position
        self.track_funding()

        position_label = "SHORT" if is_short else "LONG" if in_position else "CASH"
        log(f"Price: ${current_price:.4f} | EMA({self.ema_period}h): ${current_ema:.4f} | "
            f"Diff: {ema_diff_pct:+.2f}% | {position_label}")

        # Signals depend on direction
        if self.direction == "long":
            should_enter = not in_position and ema_diff_pct > self.entry_threshold * 100
            should_exit = in_position and ema_diff_pct < -self.exit_threshold * 100
        else:
            # Short: enter when price is BELOW EMA, exit when ABOVE
            should_enter = not in_position and ema_diff_pct < -self.entry_threshold * 100
            should_exit = in_position and ema_diff_pct > self.exit_threshold * 100

        # ---- ENTER ----
        if should_enter:
            if self.mode == "perp":
                is_buy = (self.direction == "long")
                size = self.calculate_perp_size(current_price)
                if size <= 0:
                    log(f"Position size too small ({size}), skipping")
                    return

                side = "LONG" if is_buy else "SHORT"
                log(f"SIGNAL: ENTER {side} — Price {ema_diff_pct:+.2f}% vs EMA")
                log(f"Opening perp {side}: {size:.{self.sz_decimals}f} PURR @ ~${current_price:.4f}")

                if not self.dry_run:
                    success = self.perp_market_open(is_buy, size, current_price)
                    if not success:
                        return

                self.state["in_position"] = True
                self.state["is_short"] = not is_buy
                self.state["entry_price"] = current_price
                self.state["entry_time"] = datetime.now(timezone.utc).isoformat()
                self.state["trades"] = self.state.get("trades", 0) + 1
                self.last_check_time = time.time()
                save_state(self.state)
                log(f"ENTERED {side}: {size:.{self.sz_decimals}f} PURR @ ${current_price:.4f}")

            else:
                # Spot mode — long only
                size = self.calculate_spot_size(current_price)
                if size < 1:
                    log(f"Position size too small ({size} PURR), skipping")
                    return

                log(f"SIGNAL: ENTRY LONG — Price {ema_diff_pct:+.2f}% above EMA")
                log(f"Buying {size} PURR spot @ ~${current_price:.4f}")

                if not self.dry_run:
                    success = self.spot_market_buy(size, current_price)
                    if not success:
                        return

                self.state["in_position"] = True
                self.state["is_short"] = False
                self.state["entry_price"] = current_price
                self.state["entry_time"] = datetime.now(timezone.utc).isoformat()
                self.state["trades"] = self.state.get("trades", 0) + 1
                self.capital -= size * current_price * (1 + TAKER_FEE)
                save_state(self.state)
                log(f"ENTERED LONG: {size} PURR @ ${current_price:.4f}")

        # ---- EXIT ----
        elif should_exit:
            if self.mode == "perp":
                log(f"SIGNAL: EXIT — Price {ema_diff_pct:+.2f}% vs EMA")

                # Get current PnL before closing
                pos = self.get_perp_position()
                if pos:
                    log(f"Position P&L: ${pos['unrealized_pnl']:+.2f}")

                if not self.dry_run:
                    success = self.perp_market_close()
                    if not success:
                        return

                if entry_price and is_short:
                    gross_return = (entry_price / current_price - 1) * 100
                elif entry_price:
                    gross_return = (current_price / entry_price - 1) * 100
                else:
                    gross_return = 0

                if gross_return > 0:
                    self.state["wins"] = self.state.get("wins", 0) + 1

                funding = self.state.get("funding_earned", 0)
                self.state["in_position"] = False
                self.state["entry_price"] = None
                self.state["entry_time"] = None
                save_state(self.state)
                log(f"EXITED | Return: {gross_return:+.2f}% | Funding earned: ${funding:.2f}")

            else:
                # Spot mode
                if self.dry_run:
                    size = int(self.capital)
                else:
                    _, purr_bal = self.get_spot_balance()
                    size = int(purr_bal)

                if size < 1:
                    log("No PURR to sell")
                    self.state["in_position"] = False
                    save_state(self.state)
                    return

                gross_return = (current_price / entry_price - 1) if entry_price else 0
                log(f"SIGNAL: EXIT — Price {ema_diff_pct:+.2f}% below EMA")
                log(f"Return: {gross_return*100:+.2f}% | Selling {size} PURR")

                if not self.dry_run:
                    success = self.spot_market_sell(size, current_price)
                    if not success:
                        return

                if gross_return > 0:
                    self.state["wins"] = self.state.get("wins", 0) + 1

                proceeds = size * current_price * (1 - TAKER_FEE)
                self.capital += proceeds
                self.state["in_position"] = False
                self.state["entry_price"] = None
                self.state["entry_time"] = None
                save_state(self.state)
                log(f"EXITED | Return: {gross_return*100:+.2f}% | Cash: ${self.capital:,.2f}")

        # ---- HOLDING REPORT ----
        elif in_position:
            if entry_price:
                if is_short:
                    pnl_pct = (entry_price / current_price - 1) * 100
                else:
                    pnl_pct = (current_price / entry_price - 1) * 100
                funding = self.state.get("funding_earned", 0)
                funding_str = f" | Funding: ${funding:+.2f}" if self.mode == "perp" and is_short else ""
                log(f"Holding... P&L: {pnl_pct:+.2f}%{funding_str}")

        # Summary
        trades = self.state.get("trades", 0)
        wins = self.state.get("wins", 0)
        wr = (wins / trades * 100) if trades > 0 else 0
        fees = self.state.get("total_fees_paid", 0)
        funding = self.state.get("funding_earned", 0)
        log(f"Summary: {trades} trades | {wr:.0f}% WR | Fees: ${fees:.2f} | Funding: ${funding:.2f}")

    # ---- Main Loop ----
    def run(self):
        log("Starting trading loop...")
        if self.dry_run:
            log("DRY RUN — no real trades")

        while running:
            try:
                self.check_and_trade()
            except Exception as e:
                log(f"Error in cycle: {e}")
                import traceback
                traceback.print_exc()

            if not running:
                break

            for _ in range(CHECK_INTERVAL_SECONDS):
                if not running:
                    break
                time.sleep(1)

        log("Bot stopped")
        save_state(self.state)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="PURR Trend Bot")
    parser.add_argument("--mode", choices=["spot", "perp"], default="spot",
                        help="Trading mode: spot (long only) or perp (long/short)")
    parser.add_argument("--direction", choices=["long", "short"], default="long",
                        help="Trading direction (perp mode only)")
    parser.add_argument("--leverage", type=int, default=1,
                        help="Leverage for perp mode (default: 1)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simulate only, no trades")
    parser.add_argument("--capital", type=float, default=1000.0,
                        help="Trading capital in USD")
    args = parser.parse_args()

    bot = PurrTrendBot(
        capital=args.capital,
        mode=args.mode,
        direction=args.direction,
        leverage=args.leverage,
        dry_run=args.dry_run,
    )
    bot.run()


if __name__ == "__main__":
    main()
