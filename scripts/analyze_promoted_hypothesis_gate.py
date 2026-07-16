#!/usr/bin/env python3
"""Compare research promotion vs tighter LIVE_PROMOTED gate (DEC-0012)."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROMOTE_MIN = 20
PROMOTE_WR = 0.65
LIVE_MIN = 30
LIVE_WR = 0.70
LIVE_PRIMARY_MIN = 5

RETIRED = {
    "oil_iv_statistical_breakdown_arbitrage",
    "cross_asset_funding_positioning_exhaustion",
    "cross_asset_iv_compression_vol_expansion",
    "other_mixed",
    "oil_funding_volatility_mean_reversion",
    "retired_btc_pm_iv_hardcoded_variants",
    "retired_btc_listed_iv_hardcoded_variants",
}
CONTAMINATED = {
    "oil_iv_statistical_breakdown_arbitrage",
    "oil_funding_volatility_mean_reversion",
    "oil_pm_spot_divergence_mean_reversion",
    "gold_pm_premium_futures_spread_mean_reversion",
    "cross_asset_funding_positioning_exhaustion",
}


def main() -> int:
    hyps = json.loads((REPO / "data" / "hypotheses.json").read_text())
    by = defaultdict(list)
    for h in hyps:
        if h.get("source") != "llm":
            continue
        by[h.get("setupId") or "other_mixed"].append(h)

    rows = []
    for setup_id, fam in sorted(by.items()):
        completed = []
        for h in fam:
            for t in h.get("tests") or []:
                if t.get("outcome") in ("win", "loss"):
                    completed.append(t)
        wins = sum(1 for t in completed if t["outcome"] == "win")
        wr = wins / len(completed) if completed else 0.0
        promoted = [h for h in fam if h.get("status") == "promoted" or h.get("promotedToSignal")]
        # primary-like: prefer promoted, else best winRate
        primary = None
        if promoted:
            primary = promoted[0]
        else:
            primary = max(
                fam,
                key=lambda h: (
                    sum(1 for t in (h.get("tests") or []) if t.get("outcome") == "win")
                    / max(1, sum(1 for t in (h.get("tests") or []) if t.get("outcome") in ("win", "loss"))),
                    h.get("confidence") or 0,
                ),
                default=None,
            )
        primary_done = (
            sum(1 for t in (primary.get("tests") or []) if t.get("outcome") in ("win", "loss"))
            if primary
            else 0
        )
        research_ok = (
            len(completed) >= PROMOTE_MIN
            and wr >= PROMOTE_WR
            and setup_id not in RETIRED
            and setup_id not in CONTAMINATED
        )
        live_ok = (
            len(completed) >= LIVE_MIN
            and wr >= LIVE_WR
            and primary_done >= LIVE_PRIMARY_MIN
            and setup_id not in RETIRED
            and setup_id not in CONTAMINATED
        )
        if research_ok or live_ok or promoted:
            rows.append(
                {
                    "setupId": setup_id,
                    "completed": len(completed),
                    "winRate": round(wr, 4),
                    "primaryId": primary.get("id") if primary else None,
                    "primaryCompleted": primary_done,
                    "promotedIds": [h["id"] for h in promoted],
                    "researchGate": research_ok,
                    "liveTighterGate": live_ok,
                }
            )

    summary = {
        "researchGate": {"minTests": PROMOTE_MIN, "minWinRate": PROMOTE_WR},
        "liveTighterGate": {
            "minFamilyTests": LIVE_MIN,
            "minWinRate": LIVE_WR,
            "minPrimaryTests": LIVE_PRIMARY_MIN,
        },
        "familiesResearchOk": sum(1 for r in rows if r["researchGate"]),
        "familiesLiveOk": sum(1 for r in rows if r["liveTighterGate"]),
        "currentlyPromoted": sum(len(r["promotedIds"]) for r in rows),
        "rows": rows,
    }
    out = REPO / "data" / "experiments" / "promoted-hypothesis-gate-analysis.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({k: summary[k] for k in summary if k != "rows"}, indent=2))
    print(f"wrote {out}")
    for r in rows:
        if r["researchGate"] or r["liveTighterGate"] or r["promotedIds"]:
            print(
                f"{r['setupId']}: n={r['completed']} wr={r['winRate']} "
                f"research={r['researchGate']} live={r['liveTighterGate']} "
                f"promoted={r['promotedIds']} primary={r['primaryId']}({r['primaryCompleted']})"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
