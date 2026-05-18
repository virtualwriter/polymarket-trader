#!/usr/bin/env python3
"""Idempotently close out specific shadow trades in data/blocked-signals.json.

Two cohorts are addressed:

1. Strike-IV-skew artifact shadows (one_touch_high_edge_shadow / buy_yes far-OTM
   short-DTE). These are closed with closeReason="data_quality_artifact" and
   marked learningExcluded so they don't pollute one-touch hit-rate stats.
   The trading-engine guard in strictOneTouchHighEdgeEligible /
   isStrikeIvSkewArtifact prevents promoting equivalents going forward.

2. Near-money fully repriced winners (manual IV-touch + one-touch shadows).
   These are closed with closeReason="thesis_validated_profitable" when P&L
   is positive. If a compressed edge loses money, use "thesis_compressed_loss"
   so compression is not mistaken for a profitable thesis validation.

The script is idempotent: shadows that are already resolved or already carry
the target closeReason are left alone.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BLOCKED_SIGNALS = REPO_ROOT / "data" / "blocked-signals.json"


ARTIFACT_CLOSES: list[dict[str, str]] = [
    {
        "id": "OT-1779049754796-e2vg",
        "label": "BTC May $90k YES (Polymarket touch)",
        "note": "Strike-IV-skew artifact: spot ~$78.3k, strike $90k (+15% OTM), 14d DTE, option_iv 1.05 vs pm_iv 0.37 (2.8x). The 51pt model edge was driven by short-DTE tail skew in CME BTC options, not real touch probability.",
    },
    {
        "id": "OT-1779049754797-l8xi",
        "label": "BTC May $95k YES (Polymarket touch)",
        "note": "Strike-IV-skew artifact: spot ~$78.3k, strike $95k (+21% OTM), 14d DTE, option_iv 1.23 vs pm_iv 0.37 (3.3x). 45pt edge was the model paying for skew that PM is not pricing.",
    },
    {
        "id": "OT-1779049754797-nzhs",
        "label": "OIL CL $175 YES (June touch)",
        "note": "Strike-IV-skew artifact: spot ~$101.9, strike $175 (+72% OTM), 44d DTE, option_iv 1.21 vs pm_iv 0.59 (2.05x). Far-OTM CL tail skew inflated touch prob; the implied scenario requires WTI to nearly double in six weeks.",
    },
    {
        "id": "OT-1778736486249-i4ef",
        "label": "OIL CL $140 YES (June touch)",
        "note": "Strike-IV-skew artifact: spot ~$101.9, strike $140 (+37% OTM), 44d DTE, option_iv 0.83 vs pm_iv 0.59 (1.40x). Same family as $175 — buy_yes edge driven by strike-specific skew rather than market consensus on touch likelihood.",
    },
]


VALIDATED_CLOSES: list[dict[str, str]] = [
    {
        "id": "MANUAL-IVTOUCH-OIL-NO-2132637-1778084458",
        "label": "WTI LOW $85 NO (May touch)",
        "note": "Near-money fully repriced: NO went 0.35 → 0.80 as WTI held above $85. Edge thesis (PM was overstating downside touch prob) has played out; remaining 0.20 to settlement is mostly time decay and tail-risk premium.",
    },
    {
        "id": "MANUAL-IVTOUCH-OIL-NO-2230536-1778604114",
        "label": "WTI LOW $90 NO (May touch)",
        "note": "Near-money fully repriced: NO went 0.40 → 0.61. Same family as the $85 NO; original edge captured.",
    },
    {
        "id": "OT-1778722092794-wm5s",
        "label": "WTI HIGH $105 YES (May touch shadow)",
        "note": "Near-money fully repriced: YES went 0.68 → 0.82 as WTI approached strike. Touch is now mostly in the price; further edge is small relative to tail risk into expiry.",
    },
    {
        "id": "OT-1778790497075-rxq1",
        "label": "WTI HIGH $110 YES (May touch shadow)",
        "note": "Near-money fully repriced: YES went 0.48 → 0.58. Same family as the $105 YES; the touch-probability edge that the model identified has converged.",
    },
    {
        "id": "MANUAL-IVTOUCH-GOLD-YES-2074210-1778604174",
        "label": "XAUUSD LOW $4,200 YES (May touch)",
        "note": "Near-money fully repriced: YES went 0.039 → 0.112 (~2.9x) as gold drifted toward strike. Manual IV-touch thesis (PM underpricing downside touch) validated.",
    },
    {
        "id": "OT-1778808496999-theh",
        "label": "XAUUSD LOW $4,500 YES (May touch shadow)",
        "note": "Near-money fully repriced: YES went 0.37 → 0.74 as XAUUSD pulled back toward strike. Touch probability is now embedded in price.",
    },
]


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n")


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def mark_exit(shadow: dict[str, Any]) -> tuple[float, float, float]:
    """Compute exit price/pnl/pnlPct from already-marked currentPrice."""
    pos = shadow["position"]
    entry = float(pos["entryPrice"])
    current = float(pos.get("currentPrice", entry))
    size = float(pos["size"])
    if entry <= 0:
        return current, 0.0, 0.0
    shares = size / entry
    market_pnl = shares * (current - entry)
    pnl = market_pnl + float(pos.get("fundingPnlAccrued") or 0.0)
    pnl_pct = (pnl / size) * 100.0 if size else 0.0
    return current, pnl, pnl_pct


def close_shadow(shadow: dict[str, Any], close_reason: str, note: str, learning_excluded: bool) -> bool:
    if shadow.get("status") == "resolved":
        return False
    exit_price, pnl, pnl_pct = mark_exit(shadow)
    if close_reason == "thesis_validated":
        close_reason = "thesis_validated_profitable" if pnl >= 0 else "thesis_compressed_loss"
    timestamp = now_iso()
    shadow["status"] = "resolved"
    shadow["resolvedAt"] = timestamp
    shadow["hypotheticalResult"] = {
        "closeReason": close_reason,
        "exitPrice": exit_price,
        "pnl": round(pnl, 4),
        "pnlPct": round(pnl_pct, 2),
        "marketPnl": round(pnl, 4),
        "fundingPnl": round(float(shadow["position"].get("fundingPnlAccrued") or 0.0), 4),
        "outcome": "win" if pnl >= 0 else "loss",
    }
    shadow["thesis"] = f"{shadow.get('thesis', '').rstrip()} [CLOSED {timestamp[:10]}: {close_reason} — {note}]"
    if learning_excluded:
        shadow["learningExcluded"] = {
            "reason": close_reason,
            "note": note,
        }
    return True


def main() -> None:
    signals = read_json(BLOCKED_SIGNALS, [])
    if not isinstance(signals, list):
        raise SystemExit("blocked-signals.json is not a list")
    by_id = {s.get("id"): s for s in signals}

    closed_artifacts: list[str] = []
    closed_winners: list[str] = []
    missing: list[str] = []

    for entry in ARTIFACT_CLOSES:
        shadow = by_id.get(entry["id"])
        if not shadow:
            missing.append(entry["id"])
            continue
        if close_shadow(shadow, "data_quality_artifact", entry["note"], learning_excluded=True):
            closed_artifacts.append(entry["id"])

    for entry in VALIDATED_CLOSES:
        shadow = by_id.get(entry["id"])
        if not shadow:
            missing.append(entry["id"])
            continue
        if close_shadow(shadow, "thesis_validated", entry["note"], learning_excluded=False):
            closed_winners.append(entry["id"])

    if closed_artifacts or closed_winners:
        write_json(BLOCKED_SIGNALS, signals)

    print("Strike-IV-skew artifact closes (excluded from learning):")
    for sid in closed_artifacts:
        print(f"  ✓ {sid}")
    if not closed_artifacts:
        print("  (none — already resolved)")

    print("\nThesis compression closes:")
    for sid in closed_winners:
        print(f"  ✓ {sid}")
    if not closed_winners:
        print("  (none — already resolved)")

    if missing:
        print("\nMissing IDs (not found in blocked-signals.json):")
        for sid in missing:
            print(f"  ! {sid}")


if __name__ == "__main__":
    main()
