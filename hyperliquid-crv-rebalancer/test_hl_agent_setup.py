#!/usr/bin/env python3
"""Read-only smoke test for Hyperliquid API agent + master wallet setup."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from eth_account import Account
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants

ENV_PATH = Path(os.getenv("POLYMARKET_TRADER_ENV", "/etc/polymarket-trader.env"))


def load_env(path: Path) -> dict[str, str]:
    vals: dict[str, str] = {}
    for ln in path.read_text().splitlines():
        s = ln.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def summarize(info: Info, address: str) -> tuple[str, list[tuple[str, float, str | None]]]:
    state = info.user_state(address)
    margin = state.get("marginSummary", {}) or {}
    acct_val = str(margin.get("accountValue", "?"))
    positions: list[tuple[str, float, str | None]] = []
    for row in state.get("assetPositions", []) or []:
        pos = row.get("position", {}) or {}
        szi = float(pos.get("szi", 0) or 0)
        if abs(szi) > 1e-12:
            positions.append((str(pos.get("coin")), szi, pos.get("entryPx")))
    return acct_val, positions


def main() -> int:
    if not ENV_PATH.exists():
        print(f"FAIL: env file not found: {ENV_PATH}")
        return 1

    vals = load_env(ENV_PATH)
    pk = vals.get("HYPERLIQUID_PRIVATE_KEY")
    master = vals.get("HYPERLIQUID_ACCOUNT_ADDRESS")
    mnemonic = vals.get("HYPERLIQUID_MNEMONIC")

    print("=== env check (no secrets) ===")
    print("HYPERLIQUID_PRIVATE_KEY set:", bool(pk))
    print("HYPERLIQUID_ACCOUNT_ADDRESS set:", bool(master))
    print("HYPERLIQUID_MNEMONIC active:", bool(mnemonic))
    print("HYPERLIQUID_MNEMONIC_INDEX active:", bool(vals.get("HYPERLIQUID_MNEMONIC_INDEX")))

    if mnemonic:
        print("\nFAIL: Mnemonic is still active. Comment it out before restart.")
        return 1
    if not pk or not master:
        print("\nFAIL: Need HYPERLIQUID_PRIVATE_KEY and HYPERLIQUID_ACCOUNT_ADDRESS")
        return 1

    agent = Account.from_key(pk)
    agent_addr = agent.address
    print("\n=== wallet mapping ===")
    print("agent_address:", agent_addr)
    print("master_address:", master)
    print("agent_mode:", agent_addr.lower() != master.lower())

    base_url = constants.MAINNET_API_URL
    info = Info(base_url, skip_ws=True)
    Exchange(agent, base_url, account_address=master)

    print("\n=== read-only HL queries ===")
    master_val, master_pos = summarize(info, master)
    agent_val, agent_pos = summarize(info, agent_addr)
    print(f"master account value: ${master_val}")
    print(f"master open positions: {len(master_pos)}")
    for coin, szi, px in sorted(master_pos, key=lambda x: x[0]):
        side = "LONG" if szi > 0 else "SHORT"
        print(f"  {coin}: {side} size={abs(szi)} entry={px}")

    print(f"\nagent-only account value: ${agent_val}")
    print(f"agent-only open positions: {len(agent_pos)}")

    meta = info.meta()
    print("\n=== exchange client ===")
    print("Exchange client initialized: OK")
    print("SDK meta universe size:", len(meta.get("universe", [])))

    print("\n=== verdict ===")
    if agent_addr.lower() == master.lower():
        print("WARN: agent and master are the same address")
        return 1
    if len(master_pos) == 0:
        print("WARN: master query returned no positions — wrong master address?")
        return 1

    print("OK: agent key loaded, master account readable, positions visible")
    print("OK: safe to restart — post-restart wiring should match this test")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
