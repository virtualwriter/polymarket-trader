#!/usr/bin/env python3
"""
Deposit USDC from Arbitrum to Hyperliquid Perps
"""
import os
import sys
import json
from dotenv import load_dotenv
from web3 import Web3
import eth_account
from eth_account.signers.local import LocalAccount

load_dotenv()

# Config
ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc"
USDC_CONTRACT = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"  # USDC on Arbitrum
HYPERLIQUID_BRIDGE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7"  # Hyperliquid deposit bridge

PRIVATE_KEY = os.getenv("HYPERLIQUID_PRIVATE_KEY")
account: LocalAccount = eth_account.Account.from_key(PRIVATE_KEY)
address = account.address

# Connect to Arbitrum
w3 = Web3(Web3.HTTPProvider(ARBITRUM_RPC))
print(f"🔗 Connected to Arbitrum: {w3.is_connected()}")
print(f"📍 Wallet: {address}")

# ERC20 ABI (just what we need)
ERC20_ABI = [
    {"constant": True, "inputs": [{"name": "_owner", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "balance", "type": "uint256"}], "type": "function"},
    {"constant": False, "inputs": [{"name": "_spender", "type": "address"}, {"name": "_value", "type": "uint256"}], "name": "approve", "outputs": [{"name": "", "type": "bool"}], "type": "function"},
    {"constant": True, "inputs": [{"name": "_owner", "type": "address"}, {"name": "_spender", "type": "address"}], "name": "allowance", "outputs": [{"name": "", "type": "uint256"}], "type": "function"},
]

# Hyperliquid Bridge ABI (deposit function)
BRIDGE_ABI = [
    {"inputs": [{"name": "amount", "type": "uint64"}], "name": "deposit", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
]

usdc = w3.eth.contract(address=USDC_CONTRACT, abi=ERC20_ABI)
bridge = w3.eth.contract(address=HYPERLIQUID_BRIDGE, abi=BRIDGE_ABI)

# Check balance
balance = usdc.functions.balanceOf(address).call()
balance_human = balance / 1e6
print(f"💰 USDC Balance: ${balance_human:.2f}")

if balance == 0:
    print("❌ No USDC to deposit")
    sys.exit(1)

# Get deposit amount from args or use full balance
if len(sys.argv) > 1:
    deposit_amount = float(sys.argv[1])
    deposit_raw = int(deposit_amount * 1e6)
else:
    deposit_amount = balance_human
    deposit_raw = balance

print(f"\n📤 Depositing ${deposit_amount:.2f} USDC to Hyperliquid...")

# Check allowance
allowance = usdc.functions.allowance(address, HYPERLIQUID_BRIDGE).call()
print(f"   Current allowance: ${allowance / 1e6:.2f}")

# Approve if needed
if allowance < deposit_raw:
    print(f"   Approving USDC spend...")
    
    nonce = w3.eth.get_transaction_count(address)
    approve_tx = usdc.functions.approve(HYPERLIQUID_BRIDGE, deposit_raw).build_transaction({
        'from': address,
        'nonce': nonce,
        'gas': 100000,
        'gasPrice': w3.eth.gas_price,
        'chainId': 42161  # Arbitrum
    })
    
    signed_approve = w3.eth.account.sign_transaction(approve_tx, PRIVATE_KEY)
    approve_hash = w3.eth.send_raw_transaction(signed_approve.raw_transaction)
    print(f"   Approve TX: {approve_hash.hex()}")
    
    # Wait for approval
    w3.eth.wait_for_transaction_receipt(approve_hash)
    print(f"   ✅ Approved!")

# Execute deposit
print(f"   Depositing to Hyperliquid bridge...")

nonce = w3.eth.get_transaction_count(address)
deposit_tx = bridge.functions.deposit(deposit_raw).build_transaction({
    'from': address,
    'nonce': nonce,
    'gas': 200000,
    'gasPrice': w3.eth.gas_price,
    'chainId': 42161  # Arbitrum
})

signed_deposit = w3.eth.account.sign_transaction(deposit_tx, PRIVATE_KEY)
deposit_hash = w3.eth.send_raw_transaction(signed_deposit.raw_transaction)
print(f"   Deposit TX: https://arbiscan.io/tx/{deposit_hash.hex()}")

# Wait for confirmation
receipt = w3.eth.wait_for_transaction_receipt(deposit_hash)
if receipt['status'] == 1:
    print(f"\n✅ Successfully deposited ${deposit_amount:.2f} USDC to Hyperliquid!")
    print(f"   Funds should appear in your Hyperliquid account within 1-2 minutes.")
else:
    print(f"\n❌ Deposit failed!")
    
