#!/usr/bin/env python3
import os
import requests
from dotenv import load_dotenv
import eth_account
from hyperliquid.info import Info
from hyperliquid.utils import constants

load_dotenv()

PRIVATE_KEY = os.getenv("HYPERLIQUID_PRIVATE_KEY")
account = eth_account.Account.from_key(PRIVATE_KEY)
address = account.address

print(f"🔍 Checking all Hyperliquid balances for {address}\n")

info = Info(constants.MAINNET_API_URL, skip_ws=True)

# Check perps account
print("=== PERPS ACCOUNT ===")
user_state = info.user_state(address)
margin = user_state.get("marginSummary", {})
print(f"Account Value: ${float(margin.get('accountValue', 0)):.2f}")
print(f"Withdrawable: ${float(user_state.get('withdrawable', 0)):.2f}")

# Check spot account
print("\n=== SPOT ACCOUNT ===")
spot_state = info.spot_user_state(address)
balances = spot_state.get("balances", [])
if balances:
    for bal in balances:
        print(f"{bal.get('coin', 'Unknown')}: {bal.get('total', 0)}")
else:
    print("No spot balances")

# Direct API
print("\n=== DIRECT API CHECK ===")
response = requests.post(
    "https://api.hyperliquid.xyz/info",
    json={"type": "clearinghouseState", "user": address}
)
data = response.json()
print(f"Account Value: ${float(data.get('marginSummary', {}).get('accountValue', 0)):.2f}")
