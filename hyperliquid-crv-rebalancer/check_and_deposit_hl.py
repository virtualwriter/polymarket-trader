import os
import json
from dotenv import load_dotenv
import eth_account
from eth_account.signers.local import LocalAccount

load_dotenv()

PRIVATE_KEY = os.getenv("HYPERLIQUID_PRIVATE_KEY")
account: LocalAccount = eth_account.Account.from_key(PRIVATE_KEY)
address = account.address

print(f"Wallet: {address}")

# Check Arbitrum USDC balance using public RPC
import requests

ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc"
USDC_CONTRACT = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"  # USDC on Arbitrum

# ERC20 balanceOf call
data = {
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
        "to": USDC_CONTRACT,
        "data": f"0x70a08231000000000000000000000000{address[2:]}"  # balanceOf(address)
    }, "latest"],
    "id": 1
}

response = requests.post(ARBITRUM_RPC, json=data)
result = response.json()

if "result" in result:
    balance_hex = result["result"]
    balance = int(balance_hex, 16) / 1e6  # USDC has 6 decimals
    print(f"USDC Balance on Arbitrum: ${balance:.2f}")
else:
    print(f"Error: {result}")
