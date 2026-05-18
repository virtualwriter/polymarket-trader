#!/usr/bin/env python3
"""One-shot recovery for hypothesis state corrupted by an unintended live engine
run (DRY_RUN was set as env var rather than the --dry-run CLI flag, so the engine
mutated and saved hypothesis state).

Three corrections:
  1. H-276 was resurrected from killed to promoted by the family-promotion path
     because selectSetupPrimary picked it before fix-2 landed. Restore:
       status: "killed", promotedToSignal: false, winRate: 1.0 (its pre-mutation value).
  2. H-531's setupId/setupLabel were reclassified to hype_funding_oi_normalization
     because "Hyperliquid" substring-matched "hype". Restore canonical values.
  3. H-531's description is rewritten to use "HL perp" instead of "Hyperliquid perp"
     so future ensureHypothesisSetupMetadata() runs don't reclassify it.

Idempotent.
"""
from __future__ import annotations

import json
import os
import sys


HYPOTHESES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "hypotheses.json",
)

H531_DESCRIPTION = (
    "BTC dealer hedge stress pullback - when front-month options IV is bid materially "
    "above back-month IV (term-spread inversion) while spot sits near its 7d high and "
    "HL perp positioning is crowded long (top-quartile funding + fresh OI), "
    "dealer short-gamma hedging flows accelerate the pullback off the high."
)
H531_PREDICTION = (
    "BTC declines 2-3% over 3-5 days as dealer hedging flows accelerate the pullback "
    "off recent highs and the IV term-structure inversion normalizes."
)
H531_POSTMORTEM = (
    "Staged 2026-05-18 by operator to replace the retired bearish wing of "
    "btc_put_call_exhaustion_reversal. This hypothesis uses btc_opt_iv_term_spread "
    "(derived as btc_opt_iv_30d - btc_opt_iv_90d, backfilled 45d of history) as the "
    "primary positioning-stress trigger, rather than the retail equity-ETF volume "
    "P/C proxy that anchored the retired family. Required shadow tests must "
    "complete before any promotion."
)


def main() -> int:
    if not os.path.exists(HYPOTHESES_PATH):
        print(f"error: {HYPOTHESES_PATH} not found", file=sys.stderr)
        return 1

    with open(HYPOTHESES_PATH) as fh:
        hypotheses = json.load(fh)

    by_id = {h["id"]: h for h in hypotheses}
    actions = []

    h276 = by_id.get("H-276")
    if h276 is None:
        print("warning: H-276 missing", file=sys.stderr)
    else:
        changed = False
        if h276.get("status") != "killed":
            h276["status"] = "killed"
            changed = True
        if h276.get("promotedToSignal"):
            h276["promotedToSignal"] = False
            changed = True
        # Restore the pre-mutation winRate. 1.0 matches the value committed in
        # HEAD (verified via git show before recovery).
        if h276.get("winRate") != 1.0:
            h276["winRate"] = 1.0
            changed = True
        actions.append(f"H-276 restored (changed={changed})")

    h531 = by_id.get("H-531")
    if h531 is None:
        print("error: H-531 missing — re-run the retirement script first", file=sys.stderr)
        return 1
    h531_changed = False
    if h531.get("setupId") != "btc_dealer_hedge_stress_pullback":
        h531["setupId"] = "btc_dealer_hedge_stress_pullback"
        h531_changed = True
    if h531.get("setupLabel") != "BTC dealer hedge stress / pullback":
        h531["setupLabel"] = "BTC dealer hedge stress / pullback"
        h531_changed = True
    if h531.get("description") != H531_DESCRIPTION:
        h531["description"] = H531_DESCRIPTION
        h531_changed = True
    if h531.get("prediction") != H531_PREDICTION:
        h531["prediction"] = H531_PREDICTION
        h531_changed = True
    if h531.get("postMortem") != H531_POSTMORTEM:
        h531["postMortem"] = H531_POSTMORTEM
        h531_changed = True
    actions.append(f"H-531 setup/description restored (changed={h531_changed})")

    with open(HYPOTHESES_PATH, "w") as fh:
        json.dump(hypotheses, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    for action in actions:
        print(action)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
