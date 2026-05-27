#!/usr/bin/env python3
"""
Hyperliquid Protocol Hedge Manager

Opens/manages SOL-PERP positions for delta-neutral hedging on Hyperliquid.

Usage:
    python hyperliquid_hedge.py status                    - Check current position
    python hyperliquid_hedge.py short <sol_amount>        - Open short position
    python hyperliquid_hedge.py long <sol_amount>         - Open long position
    python hyperliquid_hedge.py close                     - Close position
    python hyperliquid_hedge.py deposit <amount>          - Deposit USDC collateral
    python hyperliquid_hedge.py withdraw <amount>         - Withdraw USDC collateral

Environment Variables (in .env):
    HYPERLIQUID_PRIVATE_KEY  - Your Hyperliquid wallet private key (ETH format)
    HYPERLIQUID_ADDRESS      - Your Hyperliquid account address (optional, derived from key)
"""

import os
import sys
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

import eth_account
from eth_account.signers.local import LocalAccount
from dotenv import load_dotenv

# Add hyperliquid SDK to path if installed locally
sys.path.insert(0, str(Path(__file__).parent))

try:
    from hyperliquid.exchange import Exchange
    from hyperliquid.info import Info
    from hyperliquid.utils import constants
except ImportError:
    print("❌ Hyperliquid SDK not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "hyperliquid-python-sdk"])
    from hyperliquid.exchange import Exchange
    from hyperliquid.info import Info
    from hyperliquid.utils import constants

# Load environment variables
load_dotenv()

# Configuration
PRIVATE_KEY = os.getenv("HYPERLIQUID_PRIVATE_KEY") or os.getenv("PRIVATE_KEY_2")
ACCOUNT_ADDRESS = os.getenv("HYPERLIQUID_ADDRESS", "")
USE_MAINNET = os.getenv("HYPERLIQUID_MAINNET", "true").lower() == "true"

# Hyperliquid trading fee: ~0.035% taker, ~0.01% maker
TAKER_FEE_PCT = 0.00035
MAKER_FEE_PCT = 0.0001

# Analytics file
ANALYTICS_FILE = Path(__file__).parent / "hyperliquid_analytics.jsonl"
STATUS_FILE = Path(__file__).parent / "hyperliquid_status.json"

# SOL coin name on Hyperliquid
SOL_COIN = "SOL"


def log_event(event_data: Dict[str, Any]) -> None:
    """Log Hyperliquid events to analytics file."""
    try:
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            **event_data
        }
        with open(ANALYTICS_FILE, "a") as f:
            f.write(json.dumps(event) + "\n")
        print("📝 Logged to hyperliquid_analytics.jsonl")
    except Exception as e:
        print(f"⚠️  Could not log event: {e}")


def estimate_fee(notional_usd: float, is_taker: bool = True) -> float:
    """Estimate trading fee."""
    fee_pct = TAKER_FEE_PCT if is_taker else MAKER_FEE_PCT
    return notional_usd * fee_pct


def setup() -> tuple:
    """Setup Hyperliquid connection."""
    if not PRIVATE_KEY:
        print("❌ HYPERLIQUID_PRIVATE_KEY not set in .env")
        print("   Add: HYPERLIQUID_PRIVATE_KEY=0x...")
        sys.exit(1)
    
    # Create account from private key
    account: LocalAccount = eth_account.Account.from_key(PRIVATE_KEY)
    address = ACCOUNT_ADDRESS if ACCOUNT_ADDRESS else account.address
    
    print(f"🔗 Connecting to Hyperliquid {'Mainnet' if USE_MAINNET else 'Testnet'}...")
    print(f"   Wallet: {address}")
    
    # Use mainnet or testnet
    base_url = constants.MAINNET_API_URL if USE_MAINNET else constants.TESTNET_API_URL
    
    # Initialize Info and Exchange
    info = Info(base_url, skip_ws=True)
    exchange = Exchange(account, base_url, account_address=address if address != account.address else None)
    
    print("✅ Connected to Hyperliquid")
    
    return address, info, exchange


def get_sol_price(info: Info) -> float:
    """Get current SOL price from Hyperliquid."""
    try:
        mids = info.all_mids()
        return float(mids.get(SOL_COIN, 90))
    except Exception as e:
        print(f"⚠️  Error getting price: {e}")
        return 90.0  # Fallback


def get_position(info: Info, address: str) -> Dict[str, Any]:
    """Get current SOL-PERP position."""
    try:
        user_state = info.user_state(address)
        
        # Find SOL position
        for pos_data in user_state.get("assetPositions", []):
            pos = pos_data.get("position", {})
            if pos.get("coin") == SOL_COIN:
                szi = float(pos.get("szi", 0))
                return {
                    "size": abs(szi),
                    "direction": "LONG" if szi > 0 else "SHORT" if szi < 0 else "NONE",
                    "entry_price": float(pos.get("entryPx", 0) or 0),
                    "liquidation_price": float(pos.get("liquidationPx", 0) or 0),
                    "unrealized_pnl": float(pos.get("unrealizedPnl", 0)),
                    "margin_used": float(pos.get("marginUsed", 0)),
                    "leverage": pos.get("leverage", {})
                }
        
        return {"size": 0, "direction": "NONE", "unrealized_pnl": 0}
    except Exception as e:
        print(f"⚠️  Error getting position: {e}")
        return {"size": 0, "direction": "NONE", "unrealized_pnl": 0}


def get_account_info(info: Info, address: str) -> Dict[str, Any]:
    """Get account summary."""
    try:
        user_state = info.user_state(address)
        margin = user_state.get("marginSummary", {})
        
        account_value = float(margin.get("accountValue", 0))
        total_margin_used = float(margin.get("totalMarginUsed", 0))
        total_ntl_pos = float(margin.get("totalNtlPos", 0))
        
        # Calculate leverage
        leverage = total_ntl_pos / account_value if account_value > 0 else 0
        free_collateral = account_value - total_margin_used
        
        return {
            "account_value": account_value,
            "total_collateral": account_value,
            "free_collateral": free_collateral,
            "margin_used": total_margin_used,
            "leverage": leverage,
            "withdrawable": float(user_state.get("withdrawable", 0))
        }
    except Exception as e:
        print(f"⚠️  Error getting account info: {e}")
        return None


def show_status(info: Info, address: str) -> Dict[str, Any]:
    """Display current status and save to file."""
    print("\n" + "=" * 60)
    print("📊 HYPERLIQUID HEDGE STATUS")
    print("=" * 60)
    
    sol_price = get_sol_price(info)
    print(f"\n💰 SOL Price: ${sol_price:.2f}")
    
    position = get_position(info, address)
    notional = position["size"] * sol_price
    
    print(f"\n🎯 SOL-PERP Position:")
    print(f"   Direction: {position['direction']}")
    print(f"   Size: {position['size']:.4f} SOL")
    print(f"   Notional: ${notional:.2f}")
    print(f"   Unrealized PnL: ${position['unrealized_pnl']:.2f}")
    
    if position.get("entry_price", 0) > 0:
        print(f"   Entry Price: ${position['entry_price']:.2f}")
    if position.get("liquidation_price", 0) > 0:
        print(f"   Liquidation Price: ${position['liquidation_price']:.2f}")
    
    account = get_account_info(info, address)
    
    # Get spot balance (for unified accounts)
    spot_usdc = 0.0
    try:
        spot_state = info.spot_user_state(address)
        for bal in spot_state.get('balances', []):
            if bal.get('coin') == 'USDC':
                spot_usdc = float(bal.get('total', 0))
                break
    except Exception as e:
        print(f"⚠️  Could not get spot balance: {e}")
    
    # Total account value = perps margin + spot USDC
    perps_value = account['account_value'] if account else 0
    total_value = perps_value + spot_usdc
    
    if account:
        print(f"\n💼 Account:")
        print(f"   Spot USDC: ${spot_usdc:.2f}")
        print(f"   Perps Margin: ${perps_value:.2f}")
        print(f"   Total Value: ${total_value:.2f}")
        print(f"   Free Collateral: ${account['free_collateral']:.2f}")
        print(f"   Leverage: {account['leverage']:.2f}x")
    
    print("\n" + "=" * 60)
    
    # Save status to JSON
    status_data = {
        "timestamp": datetime.utcnow().isoformat(),
        "sol_price": sol_price,
        "position": {
            "direction": position["direction"],
            "size": position["size"],
            "notional": notional,
            "unrealized_pnl": position["unrealized_pnl"],
        },
        "account": {
            "spot_usdc": spot_usdc,
            "perps_margin": perps_value,
            "total_collateral": total_value,
            "free_collateral": account["free_collateral"] if account else spot_usdc,
            "leverage": account["leverage"] if account else 0,
            "account_value": total_value,
        } if account else None
    }
    
    with open(STATUS_FILE, "w") as f:
        json.dump(status_data, f, indent=2)
    print(f"\n📁 Status saved to hyperliquid_status.json")
    
    return status_data


def round_size(sz: float, decimals: int = 1) -> float:
    """Round size to valid Hyperliquid increment (SOL uses 1 decimal)."""
    return round(sz, decimals)


def open_short(exchange: Exchange, info: Info, sol_amount: float) -> Optional[str]:
    """Open a short SOL position."""
    # Round to 1 decimal (Hyperliquid SOL increment is 0.1)
    sol_amount = round_size(sol_amount, 1)
    if sol_amount < 0.1:
        print(f"❌ Order too small: {sol_amount} SOL (min 0.1)")
        return None
    
    sol_price = get_sol_price(info)
    notional = sol_amount * sol_price
    estimated_fee = estimate_fee(notional)
    
    print(f"\n📉 Opening SHORT position: {sol_amount} SOL")
    print(f"   Notional value: ${notional:.2f}")
    print(f"   Estimated fee: ${estimated_fee:.4f} ({TAKER_FEE_PCT * 100:.3f}%)")
    
    try:
        result = exchange.market_open(SOL_COIN, is_buy=False, sz=sol_amount, slippage=0.01)
        
        if result.get("status") == "ok":
            statuses = result.get("response", {}).get("data", {}).get("statuses", [])
            for status in statuses:
                if "filled" in status:
                    filled = status["filled"]
                    print(f"✅ Short position opened!")
                    print(f"   Order #{filled['oid']} filled {filled['totalSz']} @ ${filled['avgPx']}")
                    
                    log_event({
                        "event_type": "position_open",
                        "direction": "SHORT",
                        "sol_amount": sol_amount,
                        "sol_price": sol_price,
                        "notional_usd": notional,
                        "estimated_fee_usd": estimated_fee,
                        "fill_price": float(filled['avgPx']),
                        "oid": filled['oid']
                    })
                    return filled['oid']
                elif "error" in status:
                    print(f"❌ Error: {status['error']}")
        else:
            print(f"❌ Failed: {result}")
        
        return None
    except Exception as e:
        print(f"❌ Failed to open position: {e}")
        log_event({
            "event_type": "position_open_failed",
            "direction": "SHORT",
            "sol_amount": sol_amount,
            "error": str(e)
        })
        return None


def open_long(exchange: Exchange, info: Info, sol_amount: float) -> Optional[str]:
    """Open a long SOL position."""
    # Round to 1 decimal (Hyperliquid SOL increment is 0.1)
    sol_amount = round_size(sol_amount, 1)
    if sol_amount < 0.1:
        print(f"❌ Order too small: {sol_amount} SOL (min 0.1)")
        return None
    
    sol_price = get_sol_price(info)
    notional = sol_amount * sol_price
    estimated_fee = estimate_fee(notional)
    
    print(f"\n📈 Opening LONG position: {sol_amount} SOL")
    print(f"   Notional value: ${notional:.2f}")
    print(f"   Estimated fee: ${estimated_fee:.4f} ({TAKER_FEE_PCT * 100:.3f}%)")
    
    try:
        result = exchange.market_open(SOL_COIN, is_buy=True, sz=sol_amount, slippage=0.01)
        
        if result.get("status") == "ok":
            statuses = result.get("response", {}).get("data", {}).get("statuses", [])
            for status in statuses:
                if "filled" in status:
                    filled = status["filled"]
                    print(f"✅ Long position opened!")
                    print(f"   Order #{filled['oid']} filled {filled['totalSz']} @ ${filled['avgPx']}")
                    
                    log_event({
                        "event_type": "position_open",
                        "direction": "LONG",
                        "sol_amount": sol_amount,
                        "sol_price": sol_price,
                        "notional_usd": notional,
                        "estimated_fee_usd": estimated_fee,
                        "fill_price": float(filled['avgPx']),
                        "oid": filled['oid']
                    })
                    return filled['oid']
                elif "error" in status:
                    print(f"❌ Error: {status['error']}")
        else:
            print(f"❌ Failed: {result}")
        
        return None
    except Exception as e:
        print(f"❌ Failed to open position: {e}")
        log_event({
            "event_type": "position_open_failed",
            "direction": "LONG",
            "sol_amount": sol_amount,
            "error": str(e)
        })
        return None


def close_position(exchange: Exchange, info: Info, address: str) -> Optional[str]:
    """Close the current SOL position."""
    position = get_position(info, address)
    
    if position["direction"] == "NONE":
        print("ℹ️  No position to close")
        return None
    
    sol_price = get_sol_price(info)
    notional = position["size"] * sol_price
    estimated_fee = estimate_fee(notional)
    
    print(f"\n🔄 Closing {position['direction']} position: {position['size']:.4f} SOL")
    print(f"   Notional: ${notional:.2f}")
    print(f"   Unrealized PnL: ${position['unrealized_pnl']:.2f}")
    print(f"   Estimated close fee: ${estimated_fee:.4f}")
    
    try:
        result = exchange.market_close(SOL_COIN, slippage=0.01)
        
        if result.get("status") == "ok":
            statuses = result.get("response", {}).get("data", {}).get("statuses", [])
            for status in statuses:
                if "filled" in status:
                    filled = status["filled"]
                    print(f"✅ Position closed!")
                    print(f"   Order #{filled['oid']} filled {filled['totalSz']} @ ${filled['avgPx']}")
                    
                    log_event({
                        "event_type": "position_close",
                        "direction": position["direction"],
                        "sol_amount": position["size"],
                        "sol_price": sol_price,
                        "notional_usd": notional,
                        "unrealized_pnl": position["unrealized_pnl"],
                        "estimated_fee_usd": estimated_fee,
                        "fill_price": float(filled['avgPx']),
                        "oid": filled['oid']
                    })
                    return filled['oid']
                elif "error" in status:
                    print(f"❌ Error: {status['error']}")
        else:
            print(f"❌ Failed: {result}")
        
        return None
    except Exception as e:
        print(f"❌ Failed to close position: {e}")
        log_event({
            "event_type": "position_close_failed",
            "direction": position["direction"],
            "sol_amount": position["size"],
            "error": str(e)
        })
        return None


def withdraw_collateral(exchange: Exchange, amount: float) -> Optional[str]:
    """Withdraw USDC from Hyperliquid."""
    print(f"\n💸 Withdrawing ${amount} USDC from Hyperliquid...")
    
    try:
        # Note: Hyperliquid uses USDC as collateral
        # The withdraw function might need specific implementation based on SDK version
        result = exchange.withdraw_from_bridge(amount, address=None)
        
        if result.get("status") == "ok":
            print(f"✅ Withdrew ${amount} USDC")
            log_event({
                "event_type": "collateral_withdraw",
                "amount": amount,
                "amount_usd": amount
            })
            return "success"
        else:
            print(f"❌ Failed: {result}")
            return None
    except Exception as e:
        print(f"❌ Failed to withdraw: {e}")
        return None


def main():
    args = sys.argv[1:]
    
    if len(args) < 1:
        print("""
Usage:
    python hyperliquid_hedge.py status                    - Check current position & account
    python hyperliquid_hedge.py short <sol_amount>        - Open short SOL-PERP position
    python hyperliquid_hedge.py long <sol_amount>         - Open long SOL-PERP position  
    python hyperliquid_hedge.py close                     - Close entire position

Examples:
    python hyperliquid_hedge.py status                    # Check status
    python hyperliquid_hedge.py short 6.3                 # Short 6.3 SOL
    python hyperliquid_hedge.py long 10                   # Long 10 SOL
    python hyperliquid_hedge.py close                     # Close position

Environment:
    HYPERLIQUID_PRIVATE_KEY  - Your wallet private key (0x... format)
    HYPERLIQUID_ADDRESS      - Account address (optional)
    HYPERLIQUID_MAINNET      - Use mainnet (default: true)
        """)
        return
    
    command = args[0].lower()
    
    # Setup connection
    address, info, exchange = setup()
    
    if command == "status":
        show_status(info, address)
    
    elif command == "short":
        if len(args) < 2:
            print("Usage: python hyperliquid_hedge.py short <sol_amount>")
            return
        sol_amount = float(args[1])
        open_short(exchange, info, sol_amount)
        print("\n⏳ Waiting for position to settle (3s)...")
        time.sleep(3)
        show_status(info, address)
    
    elif command == "long":
        if len(args) < 2:
            print("Usage: python hyperliquid_hedge.py long <sol_amount>")
            return
        sol_amount = float(args[1])
        open_long(exchange, info, sol_amount)
        print("\n⏳ Waiting for position to settle (3s)...")
        time.sleep(3)
        show_status(info, address)
    
    elif command == "close":
        close_position(exchange, info, address)
        print("\n⏳ Waiting for position to settle (3s)...")
        time.sleep(3)
        show_status(info, address)
    
    elif command == "withdraw":
        if len(args) < 2:
            print("Usage: python hyperliquid_hedge.py withdraw <amount>")
            return
        amount = float(args[1])
        withdraw_collateral(exchange, amount)
        show_status(info, address)
    
    else:
        print(f"❌ Unknown command: {command}")


if __name__ == "__main__":
    main()

