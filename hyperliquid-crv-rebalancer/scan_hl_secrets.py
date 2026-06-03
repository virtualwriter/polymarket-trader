#!/usr/bin/env python3
"""Scan VPS for Hyperliquid mnemonic/private-key leakage (reports locations only)."""

from __future__ import annotations

import glob
import re
from pathlib import Path

ENV_KEYS = (
    "HYPERLIQUID_MNEMONIC",
    "HYPERLIQUID_MNEMONIC_INDEX",
    "HYPERLIQUID_PRIVATE_KEY",
)

ENV_FILES = [
    Path("/etc/polymarket-trader.env"),
    Path("/opt/polymarket-trader/hyperliquid-crv-rebalancer/.env"),
    Path("/opt/polymarket-trader/.env"),
    Path("/opt/polymarket-trader/config.env"),
]


def value_after_equals(line: str) -> str:
    body = line.split("#", 1)[1] if line.strip().startswith("#") else line
    if "=" not in body:
        return ""
    return body.split("=", 1)[1].strip().strip('"').strip("'")


def audit_env_file(path: Path) -> None:
    if not path.exists():
        print(f"MISSING: {path}")
        return
    print(f"FILE: {path} (mode {oct(path.stat().st_mode)[-3:]})")
    for i, line in enumerate(path.read_text().splitlines(), 1):
        for key in ENV_KEYS:
            if key not in line:
                continue
            commented = line.strip().startswith("#")
            val = value_after_equals(line) if key != "HYPERLIQUID_MNEMONIC_INDEX" else line.split("=", 1)[-1].strip()
            has_val = bool(val) and val not in {"3", "0"} if key == "HYPERLIQUID_MNEMONIC_INDEX" else bool(val)
            print(f"  L{i}: {key} commented={commented} has_value={has_val}")


def looks_like_mnemonic_line(line: str) -> bool:
    s = line.strip()
    if not s or s.startswith("#"):
        return False
    if "HYPERLIQUID" in s or "PRIVATE_KEY" in s or "POLYMARKET" in s:
        return False
    words = re.findall(r"[a-zA-Z]+", s)
    return len(words) >= 12


def scan_histories() -> None:
    print("\n=== possible seed-phrase lines (location only) ===")
    found = []
    patterns = [
        "/etc/polymarket-trader.env*",
        "/root/.bash_history",
        "/root/.zsh_history",
        "/opt/polymarket-trader/**/.env*",
    ]
    for pattern in patterns:
        for fp in glob.glob(pattern, recursive=True):
            try:
                p = Path(fp)
                if p.is_dir():
                    continue
                for i, line in enumerate(p.read_text(errors="ignore").splitlines(), 1):
                    if looks_like_mnemonic_line(line):
                        found.append((fp, i))
            except OSError:
                pass
    if not found:
        print("  none found")
    else:
        for fp, i in found:
            print(f"  {fp}:{i}")


def main() -> None:
    print("=== env files ===")
    for path in ENV_FILES:
        audit_env_file(path)
        print()
    scan_histories()


if __name__ == "__main__":
    main()
