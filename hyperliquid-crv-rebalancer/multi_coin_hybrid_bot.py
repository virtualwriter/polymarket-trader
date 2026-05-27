#!/usr/bin/env python3
"""
Multi-Coin Hybrid Trend Bot — Hyperliquid Perp
===============================================
Runs the hybrid strategy (Short 3h 0.5% normally → Long 5h 1% on bull signal)
across multiple coins simultaneously on Hyperliquid perp.

Strategy (from backtest):
  - Base: short each coin using 3h EMA with 0.5% entry/exit thresholds
  - When >10 out of 12 coins have price above 50h EMA for 24 consecutive hours:
    → switch all open positions to long (5h EMA, 1%/1% thresholds)
  - When signal clears: switch back to short
  - $1 per trade per coin (fixed size)

Usage:
    # Dry run (no real trades)
    python multi_coin_hybrid_bot.py --dry-run

    # Live trading
    python multi_coin_hybrid_bot.py

    # Single coin only
    python multi_coin_hybrid_bot.py --coins PURR,FARTCOIN

    # Custom trade size
    python multi_coin_hybrid_bot.py --trade-size 10
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
# HD wallet account index. A single mnemonic deterministically derives many
# wallets via BIP-44 paths m/44'/60'/0'/0/N; this picks which N. Defaults to
# 0 (matches MetaMask's first account); set to whatever index holds the funds
# if the same seed phrase owns multiple wallets and the funded one isn't at 0.
MNEMONIC_INDEX = int(os.getenv("HYPERLIQUID_MNEMONIC_INDEX", "0"))
# When using an API agent wallet, the signing key (derived from PRIVATE_KEY or
# MNEMONIC) belongs to the agent, but margin/positions live on the master
# account. Set HYPERLIQUID_ACCOUNT_ADDRESS to the master wallet so the SDK
# routes orders + queries against the funded account.
ACCOUNT_ADDRESS = os.getenv("HYPERLIQUID_ACCOUNT_ADDRESS")
USE_MAINNET = os.getenv("HYPERLIQUID_MAINNET", "true").lower() == "true"
# Backtest assumed 1x unlevered exposure. We force every coin to this
# leverage at startup so live behavior matches backtested Sharpe and
# drawdown expectations. Increase only with a re-run of the backtest at
# the new leverage to confirm the strategy still has edge after liquidation
# risk and funding drag.
TARGET_LEVERAGE = int(os.getenv("HYPERLIQUID_LEVERAGE", "1"))


def derive_private_key(mnemonic: str, index: int = 0) -> str:
    """Derive an Ethereum private key from a BIP-39 mnemonic phrase at the given
    BIP-44 account index (m/44'/60'/0'/0/<index>)."""
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    path = f"m/44'/60'/0'/0/{index}"
    acct = Account.from_mnemonic(mnemonic, account_path=path)
    return acct.key.hex()

# Strategy params (from backtest optimization)
SHORT_EMA = 3
SHORT_ENTRY = 0.5      # %
SHORT_EXIT = 0.5       # %

LONG_EMA = 5
LONG_ENTRY = 1.0       # %
LONG_EXIT = 1.0        # %

REGIME_EMA = 50         # hours, for bull signal detection
SIGNAL_LOOKBACK = 24    # hours
SIGNAL_THRESHOLD = 10   # N coins above EMA to trigger bull signal

# All tradeable coins (must exist on Hyperliquid perp)
ALL_COINS = [
    "ADA", "APT", "ARB", "ATOM", "AVAX", "BCH",
    "CRV", "DOT", "FARTCOIN", "INJ", "OP", "TRUMP",
]

# Trading constants
CHECK_INTERVAL_SECONDS = 60 * 15  # Every 15 minutes
HISTORY_HOURS = 200
TAKER_FEE = 0.00035

# State persistence.
# In production (VPS) we use POLYMARKET_TRADER_STATE_DIR so state lives outside the repo,
# matching the rest of the trader's runtime state. Locally we fall back to the repo dir.
_STATE_DIR_ENV = os.getenv("POLYMARKET_TRADER_STATE_DIR")
if _STATE_DIR_ENV:
    STATE_DIR = Path(_STATE_DIR_ENV)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
else:
    STATE_DIR = Path(__file__).parent

STATE_FILE = STATE_DIR / "hyperliquid-hybrid-state.json"
# Append-only feed of every real (non-dry-run) trade event. Consumed by the
# polymarket-trader LLM as background context (it does NOT trade these markets).
SHADOW_TRADES_FILE = STATE_DIR / "hyperliquid-hybrid-trades.jsonl"

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
    return {
        "positions": {},     # coin -> {"in_position": bool, "is_long": bool, "entry_price": float, ...}
        "total_trades": 0,
        "total_wins": 0,
        "total_fees": 0.0,
    }


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def append_shadow_trade(event: dict):
    """Append a single trade event (open or close) to the shadow-trade JSONL
    feed read by the polymarket-trader LLM. Best-effort; never raises."""
    try:
        with open(SHADOW_TRADES_FILE, "a") as f:
            f.write(json.dumps(event, separators=(",", ":")) + "\n")
    except Exception as e:
        # We never want a logging failure to interfere with live trading.
        print(f"[shadow-trade] write failed: {e}", flush=True)


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
    return 0


def get_coin_price(info, coin: str) -> Optional[float]:
    """Get current perp mid price for a coin."""
    try:
        mids = info.all_mids()
        if coin in mids:
            return float(mids[coin])
        return None
    except Exception as e:
        log(f"Error getting {coin} price: {e}")
        return None


def get_coin_sz_decimals(info, coin: str) -> int:
    """Get size decimals for a specific coin."""
    try:
        meta = info.meta()
        for asset in meta.get("universe", []):
            if asset["name"] == coin:
                return asset["szDecimals"]
    except Exception:
        pass
    return 0


# ---------------------------------------------------------------------------
# Multi-Coin Hybrid Bot
# ---------------------------------------------------------------------------
class MultiCoinHybridBot:
    def __init__(
        self,
        coins: list,
        trade_size_usd: float,
        dry_run: bool = False,
        shadow_size_usd: Optional[float] = None,
    ):
        self.coins = coins
        # Notional sent to Hyperliquid for real fills. Must be >= the venue
        # minimum (~$10 on Hyperliquid perps) or orders will not fill.
        self.trade_size_usd = trade_size_usd
        # Notional written to the shadow-trade JSONL feed read by the
        # polymarket-trader LLM. Defaults to the real size; set lower (e.g. $1)
        # to keep the LLM's mental model in "probe trade" mode while the
        # bot actually trades a larger size on Hyperliquid.
        self.shadow_size_usd = shadow_size_usd if shadow_size_usd is not None else trade_size_usd
        self.dry_run = dry_run
        self.state = load_state()

        # Initialize position state for any new coins
        for coin in coins:
            if coin not in self.state["positions"]:
                self.state["positions"][coin] = {
                    "in_position": False,
                    "is_long": False,
                    "entry_price": None,
                    "entry_time": None,
                    "mode": "short",  # current mode this coin is in
                }

        if not dry_run:
            pk = PRIVATE_KEY
            if MNEMONIC:
                log(f"Deriving private key from mnemonic (index={MNEMONIC_INDEX})...")
                pk = derive_private_key(MNEMONIC, MNEMONIC_INDEX)
            if not pk:
                log("FATAL: Neither HYPERLIQUID_PRIVATE_KEY nor HYPERLIQUID_MNEMONIC set")
                sys.exit(1)

            self.account = eth_account.Account.from_key(pk)
            agent_address = self.account.address
            # If HYPERLIQUID_ACCOUNT_ADDRESS is set we treat the signing key as
            # an API agent wallet and route orders to the master account. If
            # not set we fall back to the agent address (single-wallet setup).
            self.address = ACCOUNT_ADDRESS if ACCOUNT_ADDRESS else agent_address
            if ACCOUNT_ADDRESS and ACCOUNT_ADDRESS.lower() != agent_address.lower():
                log(f"Using API agent {agent_address} signing for master {ACCOUNT_ADDRESS}")
            base_url = constants.MAINNET_API_URL if USE_MAINNET else constants.TESTNET_API_URL
            self.info = Info(base_url, skip_ws=True)
            self.exchange = Exchange(
                self.account,
                base_url,
                account_address=ACCOUNT_ADDRESS if ACCOUNT_ADDRESS else None,
            )

            # Cache size decimals per coin
            self.sz_decimals = {}
            for coin in coins:
                self.sz_decimals[coin] = get_coin_sz_decimals(self.info, coin)

            # Force 1x cross-margin leverage on every coin in the universe to
            # match the backtest's unlevered assumption. Without this the bot
            # inherits whatever leverage was last set per asset (often
            # Hyperliquid's per-coin max default, e.g. 5-20x), which silently
            # breaks the backtest's Sharpe / drawdown / liquidation math.
            # update_leverage is idempotent and only affects FUTURE orders,
            # so existing open positions keep their original margin mode.
            for coin in coins:
                try:
                    r = self.exchange.update_leverage(TARGET_LEVERAGE, coin, True)
                    if r.get("status") != "ok":
                        log(f"{coin}: leverage init non-ok: {r}")
                except Exception as e:
                    log(f"{coin}: leverage init failed: {e}")
            log(f"Leverage set to {TARGET_LEVERAGE}x cross for {len(coins)} coins")
        else:
            self.account = None
            self.address = "dry-run"
            self.info = None
            self.exchange = None
            self.sz_decimals = {c: 0 for c in coins}

        log(f"Bot initialized | {len(coins)} coins | "
            f"${trade_size_usd}/trade (shadow=${self.shadow_size_usd}) | "
            f"{'DRY RUN' if dry_run else 'LIVE'}")
        active = [c for c, p in self.state["positions"].items() if p.get("in_position")]
        if active:
            log(f"Active positions: {', '.join(active)}")

        # Cache for historical prices across all coins
        self.price_cache = {}   # coin -> [prices]
        self.ema50_cache = {}   # coin -> [ema50]

    # ---- Price & Data ----
    def fetch_all_prices(self) -> bool:
        """Fetch current prices and historical candles for all coins."""
        if self.dry_run:
            return self._load_price_cache_from_files()

        try:
            now = int(time.time() * 1000)
            start = now - HISTORY_HOURS * 3600 * 1000

            for coin in self.coins:
                try:
                    # Get current price
                    price = get_coin_price(self.info, coin)
                    if price is None:
                        log(f"Warning: No price for {coin}")
                        continue

                    # Get historical candles
                    candles = self.info.candles_snapshot(coin, "1h", start, now)
                    if candles and len(candles) > max(SHORT_EMA, LONG_EMA, REGIME_EMA):
                        prices = [float(c["c"]) for c in candles]
                        self.price_cache[coin] = prices
                        self.ema50_cache[coin] = compute_ema(prices, REGIME_EMA)
                except Exception as e:
                    log(f"Error fetching {coin}: {e}")

            return len(self.price_cache) >= 2  # need at least 2 coins for signal
        except Exception as e:
            log(f"Error in fetch_all_prices: {e}")
            return False

    def _load_price_cache_from_files(self) -> bool:
        """For dry-run: load prices from local CG data files."""
        base_dir = Path(__file__).parent
        loaded = 0
        for coin in self.coins:
            cg_file = base_dir / f"{coin.lower()}_prices_cg_range.json"
            raw_file = base_dir / f"{coin.lower()}_prices_cg_range_raw.json"
            if cg_file.exists() and raw_file.exists():
                prices = json.loads(cg_file.read_text())
                raw = json.loads(raw_file.read_text())
                n = min(len(prices), len(raw))
                timestamps = [datetime.fromtimestamp(raw[i][0] / 1000, tz=timezone.utc)
                              for i in range(n)]
                prices = prices[:n]
                # Trim to start from June 2025
                start_idx = next((i for i, dt in enumerate(timestamps)
                                  if dt >= datetime(2025, 6, 1, tzinfo=timezone.utc)), 0)
                prices = prices[start_idx:]

                self.price_cache[coin] = prices
                self.ema50_cache[coin] = compute_ema(prices, REGIME_EMA)
                loaded += 1

        log(f"Dry-run: loaded {loaded}/{len(self.coins)} coins from local files")
        return loaded >= 2

    # ---- Bull Signal Detection ----
    def check_bull_signal(self) -> bool:
        """
        Check if > SIGNAL_THRESHOLD coins have price above 50h EMA
        for the entire preceding SIGNAL_LOOKBACK window.
        Returns True = bull mode (use long strategy), False = bear mode (use short).
        """
        n_total = max(len(p) for p in self.price_cache.values()) if self.price_cache else 0
        if n_total < SIGNAL_LOOKBACK + 10:
            return False

        # Build coins_above array for recent hours
        coins_above = []
        for i in range(max(0, n_total - SIGNAL_LOOKBACK - 5), n_total):
            ca = 0
            for coin in self.coins:
                p = self.price_cache.get(coin, [])
                e = self.ema50_cache.get(coin, [])
                if i < len(e) and e[i] is not None and i < len(p):
                    if p[i] > e[i]:
                        ca += 1
            coins_above.append(ca)

        # Check: are SIGNAL_THRESHOLD coins above for the full lookback?
        recent_count = len(coins_above)
        if recent_count < SIGNAL_LOOKBACK:
            return False

        for li in range(recent_count - SIGNAL_LOOKBACK, recent_count):
            if coins_above[li] < SIGNAL_THRESHOLD:
                return False

        return True

    # ---- Per-Coin Position Sizing ----
    def calc_position_size(self, coin: str, price: float) -> float:
        """Calculate perp position size for a ~$trade_size_usd trade.

        Uses ceil() so the post-rounding notional is always >= the requested
        trade size (and therefore >= Hyperliquid's $10 minimum order value).
        Flooring caused every order to land at e.g. $9.51-9.99 and be rejected
        as "Order must have minimum value of $10". The overshoot from ceiling
        is bounded by one size-decimal tick, well under 2% on every supported
        coin at $10 notional.
        """
        sz_dec = self.sz_decimals.get(coin, 0)
        notional = self.trade_size_usd
        size = notional / price
        return math.ceil(size * (10 ** sz_dec)) / (10 ** sz_dec)

    # ---- Order Execution ----
    def _extract_fill(self, result: dict) -> dict | None:
        """Pull fill details out of a market_open/market_close SDK response.

        Returns a dict with fill_price, fill_size, fee (USDC), oid — or None
        if the order didn't fill. The Hyperliquid SDK's filled status dict
        contains totalSz, avgPx, oid, and (when available) fee. fee may be
        absent on some response shapes; in that case we fall back to the
        userFillsByTime endpoint when needed.
        """
        if not result or result.get("status") != "ok":
            return None
        statuses = result.get("response", {}).get("data", {}).get("statuses", [])
        for s in statuses:
            if isinstance(s, dict) and "filled" in s:
                f = s["filled"]
                try:
                    fill_price = float(f.get("avgPx", 0) or 0)
                    fill_size = float(f.get("totalSz", 0) or 0)
                except (TypeError, ValueError):
                    fill_price, fill_size = 0.0, 0.0
                fee_raw = f.get("fee")
                fee = 0.0
                if fee_raw is not None:
                    try:
                        fee = float(fee_raw)
                    except (TypeError, ValueError):
                        fee = 0.0
                return {
                    "fill_price": fill_price,
                    "fill_size": fill_size,
                    "fee": fee,
                    "oid": f.get("oid"),
                }
        return None

    def _lookup_fee_for_oid(self, oid, coin: str) -> float:
        """Query userFillsByTime for the actual fee on a given oid. Used when
        market_open returns a fill status that doesn't include the fee field.

        Hyperliquid's fill-indexer has 100-1000ms of lag after order
        acknowledgment so we retry a few times with backoff before giving
        up. Returns 0.0 if the lookup fails after all retries.
        """
        if oid is None or self.info is None:
            return 0.0
        for attempt in range(4):
            try:
                end = int(time.time() * 1000)
                start = end - 5 * 60 * 1000
                fills = self.info.user_fills_by_time(self.address, start, end)
                total = 0.0
                found = False
                for f in fills or []:
                    if f.get("oid") == oid:
                        found = True
                        try:
                            total += float(f.get("fee", 0) or 0)
                        except (TypeError, ValueError):
                            pass
                if found:
                    return total
            except Exception as e:
                log(f"{coin}: fee lookup failed for oid={oid}: {e}")
                return 0.0
            time.sleep(0.5 + 0.5 * attempt)
        log(f"{coin}: fee lookup for oid={oid} not yet indexed after retries; recording 0")
        return 0.0

    def open_perp_position(self, coin: str, is_buy: bool, size: float, price: float) -> dict | None:
        """Open a perp market position.

        Returns a fill dict {fill_price, fill_size, fee, oid} on success,
        None on failure. The fill dict is the source of truth for shadow-
        trade logging downstream so the LLM context sees real execution
        data (not the signal price).
        """
        if self.dry_run:
            side = "LONG" if is_buy else "SHORT"
            log(f"[DRY] {coin}: OPEN {side} {size:.{self.sz_decimals.get(coin, 0)}f} @ ~${price:.4f}")
            return {"fill_price": price, "fill_size": size, "fee": 0.0, "oid": None}

        try:
            result = self.exchange.market_open(coin, is_buy, size, slippage=0.01)
            if result.get("status") == "ok":
                statuses = result.get("response", {}).get("data", {}).get("statuses", [])
                fill = self._extract_fill(result)
                if fill is not None:
                    if fill["fee"] == 0.0 and fill["oid"] is not None:
                        # Some SDK paths omit fee in the immediate response.
                        # Look it up so shadow trades reflect real cost.
                        fill["fee"] = self._lookup_fee_for_oid(fill["oid"], coin)
                    log(
                        f"{coin}: Filled {fill['fill_size']} @ ${fill['fill_price']} "
                        f"| fee ${fill['fee']:.6f}"
                    )
                    return fill
                errors = [s.get("error") for s in statuses if isinstance(s, dict) and s.get("error")]
                if errors:
                    log(f"{coin}: Order rejected: {'; '.join(errors)}")
                else:
                    log(f"{coin}: Order placed but not filled (response={statuses})")
                return None
            else:
                log(f"{coin}: Order failed: {result}")
                return None
        except Exception as e:
            log(f"{coin}: Error opening position: {e}")
            return None

    def close_perp_position(self, coin: str) -> dict | None:
        """Close the current perp position for a coin.

        Returns a fill dict {fill_price, fill_size, fee, oid} on success,
        None on failure. Same contract as open_perp_position so shadow-
        trade emit code can use the actual exit price + fee.
        """
        if self.dry_run:
            log(f"[DRY] {coin}: CLOSE position")
            return {"fill_price": 0.0, "fill_size": 0.0, "fee": 0.0, "oid": None}

        try:
            result = self.exchange.market_close(coin)
            if result.get("status") == "ok":
                fill = self._extract_fill(result)
                if fill is not None:
                    if fill["fee"] == 0.0 and fill["oid"] is not None:
                        fill["fee"] = self._lookup_fee_for_oid(fill["oid"], coin)
                    log(
                        f"{coin}: Closed {fill['fill_size']} @ ${fill['fill_price']} "
                        f"| fee ${fill['fee']:.6f}"
                    )
                    return fill
                log(f"{coin}: Position closed (no fill detail returned)")
                return {"fill_price": 0.0, "fill_size": 0.0, "fee": 0.0, "oid": None}
            else:
                log(f"{coin}: Close failed: {result}")
                return None
        except Exception as e:
            log(f"{coin}: Error closing: {e}")
            return None

    # ---- Main Trading Logic ----
    def run_cycle(self):
        """One trading cycle for all coins."""
        # 1. Fetch prices for all coins
        log("Fetching prices...")
        if not self.fetch_all_prices():
            log("Failed to fetch prices, skipping cycle")
            return
        log(f"Got prices for {len(self.price_cache)} coins")

        # 2. Check bull signal
        is_bull = self.check_bull_signal()
        current_mode = "LONG" if is_bull else "SHORT"
        log(f"Bull signal: {'YES' if is_bull else 'NO'} → Using {current_mode} strategy")

        # 3. For each coin: check signal and trade
        for coin in self.coins:
            prices = self.price_cache.get(coin)
            if not prices or len(prices) < max(SHORT_EMA, LONG_EMA) + 10:
                log(f"{coin}: Insufficient price data, skipping")
                continue

            current_price = prices[-1]
            pos_state = self.state["positions"].get(coin, {})
            in_position = pos_state.get("in_position", False)
            entry_price = pos_state.get("entry_price")

            # Compute EMAs
            ema_short = compute_ema(prices, SHORT_EMA)[-1]
            ema_long = compute_ema(prices, LONG_EMA)[-1]

            if ema_short is None or ema_long is None:
                log(f"{coin}: EMA not ready, skipping")
                continue

            price_str = f"${current_price:.4f}" if current_price < 100 else f"${current_price:.2f}"

            if is_bull:
                # Long mode: use LONG_EMA, 1% entry/exit
                ema_diff = (current_price / ema_long - 1) * 100
                should_enter = not in_position and ema_diff > LONG_ENTRY
                should_exit = in_position and ema_diff < -LONG_EXIT
                action_label = "LONG"
            else:
                # Short mode: use SHORT_EMA, 0.5% entry/exit
                ema_diff = (current_price / ema_short - 1) * 100
                should_enter = not in_position and ema_diff < -SHORT_ENTRY
                should_exit = in_position and ema_diff > SHORT_EXIT
                action_label = "SHORT"

            pos_label = "LONG" if (in_position and pos_state.get("is_long")) else \
                        "SHORT" if in_position else "CASH"

            # ---- ENTER ----
            if should_enter:
                size = self.calc_position_size(coin, current_price)
                if size <= 0:
                    log(f"{coin}: Position size too small ({size}), skipping")
                    continue

                is_buy = is_bull  # buy in bull mode, sell in bear mode
                log(f"{coin}: SIGNAL ENTER {action_label} | "
                    f"{price_str} vs EMA({SHORT_EMA if not is_bull else LONG_EMA}h)={ema_diff:+.2f}% | "
                    f"Size={size}")

                fill = self.open_perp_position(coin, is_buy, size, current_price)
                if fill is None and not self.dry_run:
                    continue

                # Use the actual fill price (and size in coin units) for state
                # tracking so future exits compare against where the trade
                # really executed, not the signal price.
                fill = fill or {"fill_price": current_price, "fill_size": size, "fee": 0.0}
                fill_price = fill.get("fill_price") or current_price
                fill_size = fill.get("fill_size") or size
                fee_usd = float(fill.get("fee") or 0.0)
                # Notional in USD that the bot actually opened on Hyperliquid
                # (real_size_usd), independent of the smaller shadow_size_usd
                # the LLM is told about. Both are emitted so the LLM has the
                # signal context but the operator can audit real fees.
                real_size_usd = fill_price * fill_size

                entry_time = datetime.now(timezone.utc).isoformat()
                self.state["positions"][coin] = {
                    "in_position": True,
                    "is_long": is_bull,
                    "entry_price": fill_price,
                    "entry_time": entry_time,
                    "mode": action_label.lower(),
                }
                self.state["total_trades"] = self.state.get("total_trades", 0) + 1
                self.state["total_fees"] = self.state.get("total_fees", 0) + fee_usd
                save_state(self.state)
                log(f"{coin}: ENTERED {action_label} @ ${fill_price} | fee ${fee_usd:.6f}")

                if not self.dry_run:
                    append_shadow_trade({
                        "ts": entry_time,
                        "coin": coin,
                        "action": "open",
                        "side": "long" if is_bull else "short",
                        "signal_price": current_price,
                        "fill_price": fill_price,
                        "fill_size": fill_size,
                        "real_size_usd": real_size_usd,
                        "size_usd": self.shadow_size_usd,
                        "fee_usd": fee_usd,
                        "regime": "bull" if is_bull else "bear",
                        "reason": f"ema{LONG_EMA if is_bull else SHORT_EMA}h_breakout",
                        "ema_diff_pct": ema_diff,
                    })

            # ---- EXIT ----
            elif should_exit:
                log(f"{coin}: SIGNAL EXIT | {price_str} vs EMA diff={ema_diff:+.2f}%")

                if entry_price:
                    if pos_state.get("is_long"):
                        gross_ret = (current_price / entry_price - 1) * 100
                    else:
                        gross_ret = (entry_price / current_price - 1) * 100
                else:
                    gross_ret = 0

                if gross_ret > 0:
                    self.state["total_wins"] = self.state.get("total_wins", 0) + 1

                fill = self.close_perp_position(coin)
                if fill is None and not self.dry_run:
                    continue

                fill = fill or {"fill_price": current_price, "fill_size": 0.0, "fee": 0.0}
                exit_price = fill.get("fill_price") or current_price
                exit_size = fill.get("fill_size") or 0.0
                close_fee_usd = float(fill.get("fee") or 0.0)
                # Recompute gross return against the actual exit fill price
                # rather than the cycle's signal price so logs/shadow events
                # reflect realized P&L.
                if entry_price:
                    if pos_state.get("is_long"):
                        gross_ret = (exit_price / entry_price - 1) * 100
                    else:
                        gross_ret = (entry_price / exit_price - 1) * 100

                was_long = bool(pos_state.get("is_long"))
                self.state["positions"][coin] = {
                    "in_position": False,
                    "is_long": False,
                    "entry_price": None,
                    "entry_time": None,
                    "mode": action_label.lower(),
                }
                self.state["total_fees"] = self.state.get("total_fees", 0) + close_fee_usd
                save_state(self.state)
                log(f"{coin}: EXITED @ ${exit_price} | Return: {gross_ret:+.2f}% | fee ${close_fee_usd:.6f}")

                if not self.dry_run:
                    append_shadow_trade({
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "coin": coin,
                        "action": "close",
                        "side": "long" if was_long else "short",
                        "entry_price": entry_price,
                        "exit_price": exit_price,
                        "signal_price": current_price,
                        "fill_size": exit_size,
                        "real_size_usd": exit_price * exit_size,
                        "size_usd": self.shadow_size_usd,
                        "fee_usd": close_fee_usd,
                        "pnl_pct": gross_ret,
                        "regime": "bull" if is_bull else "bear",
                        "reason": "ema_reversion",
                        "ema_diff_pct": ema_diff,
                    })

            # ---- HOLDING ----
            elif in_position and entry_price:
                if pos_state.get("is_long"):
                    pnl = (current_price / entry_price - 1) * 100
                else:
                    pnl = (entry_price / current_price - 1) * 100
                log(f"{coin}: Holding {action_label} | "
                    f"{price_str} | entry=${entry_price:.4f} | P&L: {pnl:+.2f}%")

    def print_summary(self):
        """Print a summary of all positions and stats."""
        trades = self.state.get("total_trades", 0)
        wins = self.state.get("total_wins", 0)
        wr = wins / trades * 100 if trades > 0 else 0
        fees = self.state.get("total_fees", 0)

        active = sum(1 for c, p in self.state["positions"].items() if p.get("in_position"))

        log(f"─── SUMMARY ───")
        log(f"Trades: {trades} | Wins: {wins} | WR: {wr:.0f}% | Fees: ${fees:.2f} | Active: {active}/{len(self.coins)}")

        for coin in self.coins:
            p = self.state["positions"].get(coin, {})
            if p.get("in_position"):
                side = "LONG" if p.get("is_long") else "SHORT"
                log(f"  {coin}: {side} @ ${p['entry_price']:.4f} ({p.get('entry_time', '?')})")
            else:
                log(f"  {coin}: CASH")

    # ---- Main Loop ----
    def run(self):
        log(f"Starting multi-coin hybrid bot — {len(self.coins)} coins")
        if self.dry_run:
            log("DRY RUN — no real trades")

        # Initial fetch + signal check
        log("Initial fetch...")
        self.fetch_all_prices()
        is_bull = self.check_bull_signal()
        log(f"Initial bull signal: {'YES' if is_bull else 'NO'}")
        self.print_summary()

        cycle_count = 0
        while running:
            try:
                cycle_count += 1
                log(f"\n─── Cycle {cycle_count} ───")
                self.run_cycle()
                self.print_summary()
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
    parser = argparse.ArgumentParser(description="Multi-Coin Hybrid Trend Bot")
    parser.add_argument("--coins", type=str, default=None,
                        help="Comma-separated coins (default: all 12)")
    parser.add_argument("--trade-size", type=float, default=1.0,
                        help="USD per trade actually sent to Hyperliquid "
                             "(default: $1; must be >=$10 to fill on HL perps)")
    parser.add_argument("--shadow-size", type=float, default=None,
                        help="USD logged to the polymarket-trader shadow feed "
                             "(default: same as --trade-size)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simulate only, no trades")
    args = parser.parse_args()

    coins = [c.strip().upper() for c in args.coins.split(",")] if args.coins else ALL_COINS
    # Validate coins
    for c in coins:
        if c not in ALL_COINS:
            print(f"Unknown coin: {c}. Valid: {', '.join(ALL_COINS)}")
            sys.exit(1)

    bot = MultiCoinHybridBot(
        coins=coins,
        trade_size_usd=args.trade_size,
        shadow_size_usd=args.shadow_size,
        dry_run=args.dry_run,
    )
    bot.run()


if __name__ == "__main__":
    main()
