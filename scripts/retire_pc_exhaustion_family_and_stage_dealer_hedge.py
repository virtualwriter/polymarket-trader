#!/usr/bin/env python3
"""Retire the bearish wing of the btc_put_call_exhaustion_reversal setup family
and stage a replacement hypothesis that probes the same phenomenon
(dealer hedge stress at recent highs) via IV term spread + perp positioning.

Idempotent:
  - Each retire target is set to status=killed only if it isn't already, with
    the retirement postMortem appended (one occurrence only).
  - The replacement hypothesis is added at most once (matched by setupId +
    description prefix).

Run as: python3 scripts/retire_pc_exhaustion_family_and_stage_dealer_hedge.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List


HYPOTHESES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "hypotheses.json",
)

RETIRE_IDS = [
    "H-145",
    "H-148",
    "H-264",
    "H-276",
    "H-313",
    "H-316",
    "H-320",
    "H-362",
    "H-368",
]

RETIRE_POSTMORTEM = (
    "Retired 2026-05-18 with the bearish wing of btc_put_call_exhaustion_reversal: "
    "setup family reached for dealer-gamma exhaustion but was built on retail "
    "equity-ETF volume P/C (btc_ibit_pc_ratio); insufficient signal-to-noise to "
    "implement the thesis with current data inputs. Live record was 0/4 LONG via "
    "the family route (compound issue: keyword direction-inference inverted "
    "H-145's bearish thesis and the engine traded the opposite of what the "
    "family rep H-148 predicts). Replaced by setup family "
    "btc_dealer_hedge_stress_pullback which probes the same phenomenon via "
    "btc_opt_iv_term_spread (front-month IV bid relative to back-month -> "
    "dealer hedging stress) + perp positioning + spot proximity to 7d high."
)

NEW_HYPOTHESIS_ID_PREFIX = "H-"
NEW_HYPOTHESIS_DESCRIPTION = (
    "BTC dealer hedge stress pullback - when front-month options IV is bid materially "
    "above back-month IV (term-spread inversion) while spot sits near its 7d high and "
    "HL perp positioning is crowded long (top-quartile funding + fresh OI), "
    "dealer short-gamma hedging flows accelerate the pullback off the high."
)
NEW_HYPOTHESIS_PREDICTION = (
    "BTC declines 2-3% over 3-5 days as dealer hedging flows accelerate the pullback "
    "off recent highs and the IV term-structure inversion normalizes."
)


def _next_hypothesis_id(hypotheses: List[Dict]) -> str:
    max_id = 0
    for h in hypotheses:
        raw = h.get("id", "")
        if isinstance(raw, str) and raw.startswith(NEW_HYPOTHESIS_ID_PREFIX):
            try:
                max_id = max(max_id, int(raw[len(NEW_HYPOTHESIS_ID_PREFIX):]))
            except ValueError:
                continue
    return f"{NEW_HYPOTHESIS_ID_PREFIX}{max_id + 1}"


def main() -> int:
    if not os.path.exists(HYPOTHESES_PATH):
        print(f"error: {HYPOTHESES_PATH} not found", file=sys.stderr)
        return 1

    with open(HYPOTHESES_PATH) as fh:
        hypotheses: List[Dict] = json.load(fh)

    by_id = {h["id"]: h for h in hypotheses}

    retired_now: List[str] = []
    already_retired: List[str] = []
    missing: List[str] = []

    for target in RETIRE_IDS:
        h = by_id.get(target)
        if h is None:
            missing.append(target)
            continue
        if h.get("status") == "killed":
            already_retired.append(target)
            continue
        h["status"] = "killed"
        h["promotedToSignal"] = False
        prior = h.get("postMortem") or ""
        h["postMortem"] = (prior + " | " + RETIRE_POSTMORTEM) if prior else RETIRE_POSTMORTEM
        retired_now.append(target)

    new_marker = (
        "BTC dealer hedge stress pullback - when front-month options IV is bid materially"
    )
    already_staged = any(
        (h.get("setupId") == "btc_dealer_hedge_stress_pullback")
        and isinstance(h.get("description"), str)
        and h["description"].startswith(new_marker)
        for h in hypotheses
    )

    staged_id = None
    if not already_staged:
        staged_id = _next_hypothesis_id(hypotheses)
        new_hypothesis = {
            "id": staged_id,
            "created": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "description": NEW_HYPOTHESIS_DESCRIPTION,
            "conditions": {
                "btc_opt_iv_term_spread_percentile_30d": "> 85",
                "btc_spot_pct_from_7d_high": "> -2",
                "btc_hl_funding_ann_percentile_7d": "> 75",
                "btc_hl_oi_change_pct_24h": "> 5",
            },
            "prediction": NEW_HYPOTHESIS_PREDICTION,
            "timeframeDays": 5,
            "confidence": 0.65,
            "tests": [],
            "winRate": 0,
            "status": "active",
            "promotedToSignal": False,
            "postMortem": (
                "Staged 2026-05-18 by operator to replace the retired bearish wing of "
                "btc_put_call_exhaustion_reversal. This hypothesis uses btc_opt_iv_term_spread "
                "(derived as btc_opt_iv_30d - btc_opt_iv_90d, backfilled 45d of history) as the "
                "primary positioning-stress trigger, rather than the retail equity-ETF volume "
                "P/C proxy that anchored the retired family. Required shadow tests must "
                "complete before any promotion."
            ),
            "source": "operator",
            "setupId": "btc_dealer_hedge_stress_pullback",
            "setupLabel": "BTC dealer hedge stress / pullback",
        }
        hypotheses.append(new_hypothesis)

    with open(HYPOTHESES_PATH, "w") as fh:
        json.dump(hypotheses, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(f"retired now: {retired_now}")
    print(f"already retired (no change): {already_retired}")
    if missing:
        print(f"missing (skipped): {missing}")
    if staged_id:
        print(f"staged new hypothesis: {staged_id} (setupId=btc_dealer_hedge_stress_pullback)")
    else:
        print("replacement hypothesis already staged; no-op")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
