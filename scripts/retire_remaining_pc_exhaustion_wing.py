#!/usr/bin/env python3
"""Retire the remaining active wing of btc_put_call_exhaustion_reversal.

The bearish wing was already retired because the family relies on
`btc_ibit_pc_ratio`, a retail IBIT options volume P/C proxy that does not
directly measure BTC options OI, dealer gamma, or crowded call positioning.

This script retires the still-active bullish/neutral siblings so the setup
family cannot rotate its promoted primary to H-085 (or another sibling) on the
next real engine cycle.

Idempotent: each target is set to status=killed and promotedToSignal=false, and
the postmortem is appended only once.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Dict, List


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HYPOTHESES_PATH = os.path.join(ROOT, "data", "hypotheses.json")

RETIRE_IDS = [
    "H-069",
    "H-085",
    "H-130",
    "H-136",
    "H-159",
    "H-167",
    "H-329",
    "H-420",
]

POSTMORTEM = (
    "Retired 2026-05-18 with the remaining wing of "
    "btc_put_call_exhaustion_reversal: although these variants were "
    "bullish/neutral rather than bearish, they use the same weak foundation "
    "as the retired bearish wing — retail IBIT options volume P/C "
    "(btc_ibit_pc_ratio), not BTC options OI, dealer gamma, IV skew, or a "
    "direct crowded-call-positioning measure. Keeping this wing active would "
    "allow the family to re-promote via H-085 or another sibling despite the "
    "operator decision to stop production trading of this data-input "
    "mismatch. Replacement path is btc_dealer_hedge_stress_pullback (H-531), "
    "which uses options IV term spread + perp positioning + spot proximity "
    "and must complete shadow tests before promotion."
)


def main() -> int:
    if not os.path.exists(HYPOTHESES_PATH):
        print(f"error: {HYPOTHESES_PATH} not found", file=sys.stderr)
        return 1

    with open(HYPOTHESES_PATH) as fh:
        hypotheses: List[Dict] = json.load(fh)

    by_id = {h["id"]: h for h in hypotheses}
    killed_now: List[str] = []
    already_killed: List[str] = []
    missing: List[str] = []

    for target in RETIRE_IDS:
        h = by_id.get(target)
        if h is None:
            missing.append(target)
            continue

        was_killed = h.get("status") == "killed" and not h.get("promotedToSignal")
        h["status"] = "killed"
        h["promotedToSignal"] = False

        prior = h.get("postMortem") or ""
        if POSTMORTEM not in prior:
            h["postMortem"] = (prior + " | " + POSTMORTEM) if prior else POSTMORTEM

        if was_killed:
            already_killed.append(target)
        else:
            killed_now.append(target)

    with open(HYPOTHESES_PATH, "w") as fh:
        json.dump(hypotheses, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(f"killed now: {killed_now}")
    print(f"already killed: {already_killed}")
    if missing:
        print(f"missing: {missing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
