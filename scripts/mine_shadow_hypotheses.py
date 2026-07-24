#!/usr/bin/env python3
"""Mine clean heatmap/blocked-signal shadows into hypothesis candidates.

Reads data/blocked-signals.json, clusters learnable resolved shadows (preferring
those with heatmapRowSnapshot), and writes data/shadow-mined-hypotheses.json for
engine ingest (source=shadow_mined). Does not touch hypotheses.json directly.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from lib.alpha_stats import binomial_p_value

REPO = Path(__file__).resolve().parents[1]
DEFAULT_BLOCKED = REPO / "data" / "blocked-signals.json"
DEFAULT_OUT = REPO / "data" / "shadow-mined-hypotheses.json"
DEFAULT_HYPS = REPO / "data" / "hypotheses.json"

# Prefer heatmap-backed families; allow a few high-n non-heatmap cohorts too.
HEATMAP_REASONS = {
    "one_touch_high_edge_shadow",
    "no_bias_adjusted_gap_shadow",
    "relative_value_heatmap",
}
MIN_N_HEATMAP = 8
MIN_N_OTHER = 8
MIN_WR = 0.55
MAX_CANDIDATES = 12


def slug(text: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return text[:80] or "unknown"


def num(v) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def cluster_key(shadow: dict, coarse: bool = False) -> tuple:
    row = ((shadow.get("heatmapRowSnapshot") or {}).get("row") or {})
    sig = str(shadow.get("signalType") or "UNKNOWN")
    asset = str(shadow.get("asset") or "UNK").upper()
    side = str(
        ((shadow.get("heatmapRowSnapshot") or {}).get("selectedSide"))
        or shadow.get("direction")
        or "na"
    )
    if coarse:
        # Roll up edge buckets so heatmap cohorts can clear n/WR floors.
        bucket = "heatmap" if row else (shadow.get("blockedReason") or "na")
    else:
        bucket = (
            row.get("edge_bucket")
            or row.get("best_expression")
            or row.get("source_agreement_bucket")
            or shadow.get("blockedReason")
            or "na"
        )
    return (sig, asset, str(bucket), side)


def build_conditions(sig: str, asset: str, rows: list[dict], has_heatmap: bool) -> dict[str, str]:
    a = asset.lower()
    edges = [num(r.get("edge_pts")) for r in rows]
    edges = [e for e in edges if e is not None]
    edge_floor = 15.0
    if edges:
        edges_sorted = sorted(abs(e) for e in edges)
        edge_floor = max(10.0, round(edges_sorted[len(edges_sorted) // 2], 1))

    if has_heatmap and ("ONE_TOUCH" in sig or "NO_BIAS" in sig or "RELATIVE_VALUE" in sig):
        return {f"{a}_pm_underlying_cap_edge_pts_max": f">= {edge_floor}"}
    if "FUNDING" in sig and "SHORT" in sig:
        return {f"{a}_hl_funding_ann": "> 25"}
    if "FUNDING" in sig and "LONG" in sig:
        return {f"{a}_hl_funding_ann": "< -10"}
    if "PC_RATIO_EXTREME_HIGH" in sig:
        # Prefer listed PC columns when present in valuations; oil/gold use cl/gld naming.
        if a == "oil":
            return {"oil_cl_pc_ratio": "> 1.2"}
        if a == "gold":
            return {"gold_gld_pc_ratio": "> 1.2"}
        return {f"{a}_pc_ratio": "> 1.2"}
    if "PC_RATIO_EXTREME_LOW" in sig:
        if a == "oil":
            return {"oil_cl_pc_ratio": "< 0.7"}
        if a == "gold":
            return {"gold_gld_pc_ratio": "< 0.7"}
        return {f"{a}_pc_ratio": "< 0.7"}
    # Fallback: funding z-ish proxy via extreme annualized funding magnitude.
    return {f"{a}_hl_funding_ann_zscore_7d": "> 1.5"}


def build_prediction(asset: str, direction: str, timeframe_days: int) -> str:
    if direction == "short":
        return f"{asset} spot will decline >2% within {timeframe_days} days when mined shadow conditions re-trigger"
    return f"{asset} spot will move >2% within {timeframe_days} days when mined shadow conditions re-trigger"


def existing_desc_keys(hypotheses_path: Path) -> set[str]:
    if not hypotheses_path.exists():
        return set()
    hyps = json.loads(hypotheses_path.read_text())
    return {str(h.get("description", "")).strip().lower()[:80] for h in hyps}


def _row_from_shadow(s: dict) -> dict:
    hyp = s.get("hypotheticalResult") or {}
    row = ((s.get("heatmapRowSnapshot") or {}).get("row") or {})
    return {
        "pnl": num(hyp.get("pnl")),
        "outcome": hyp.get("outcome"),
        "confidence": num(s.get("confidence")),
        "edge_pts": num(row.get("edge_score") or row.get("sell_yes_edge_pts") or row.get("buy_yes_edge_pts")),
        "has_heatmap": bool(row),
        "blockedReason": str(s.get("blockedReason") or ""),
        "direction": s.get("direction") or "long",
        "id": s.get("id"),
    }


def _candidates_from_clusters(
    clusters: dict[tuple, list[dict]],
    existing: set[str],
    min_wr: float,
) -> list[dict]:
    candidates = []
    for key, rows in clusters.items():
        sig, asset, bucket, side = key
        has_hm = any(r["has_heatmap"] for r in rows)
        min_n = MIN_N_HEATMAP if has_hm else MIN_N_OTHER
        if len(rows) < min_n:
            continue
        wins = sum(1 for r in rows if (r["outcome"] == "win") or (r["outcome"] is None and (r["pnl"] or 0) > 0))
        wr = wins / len(rows)
        if wr < min_wr:
            continue
        direction = "short" if str(side).lower() in ("short", "no") or "SHORT" in sig else "long"
        if str(side).lower() == "no":
            direction = "short"
        elif str(side).lower() == "yes":
            direction = "long"
        dirs = {r["direction"] for r in rows if r.get("direction")}
        if dirs == {"short"}:
            direction = "short"
        elif dirs == {"long"}:
            direction = "long"

        timeframe_days = 2
        setup_id = slug(f"shadow_{sig}_{asset}_{bucket}_{side}")
        setup_label = f"Shadow-mined {sig} {asset} {bucket}"
        desc = (
            f"[shadow_mined] {sig} on {asset} ({bucket}/{side}): "
            f"historical shadow WR={wr:.0%} over n={len(rows)} "
            f"(sumPnl={sum(r['pnl'] or 0 for r in rows):+.3f}). Re-test when edge/funding conditions reappear."
        )
        desc_key = desc.strip().lower()[:80]
        if desc_key in existing:
            continue
        mean_conf = sum((r["confidence"] if r["confidence"] is not None else wr) for r in rows) / len(rows)
        candidates.append(
            {
                "created": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "description": desc,
                "conditions": build_conditions(sig, asset, rows, has_hm),
                "prediction": build_prediction(asset, direction, timeframe_days),
                "timeframeDays": timeframe_days,
                "confidence": float(min(0.95, max(0.70, mean_conf if mean_conf else wr))),
                "direction": direction,
                "source": "shadow_mined",
                "setupId": setup_id,
                "setupLabel": setup_label,
                "mineStats": {
                    "n": len(rows),
                    "wins": wins,
                    "winRate": round(wr, 4),
                    "sumPnl": round(sum(r["pnl"] or 0 for r in rows), 4),
                    "pValue": round(binomial_p_value(wins, len(rows)), 5),
                    "hasHeatmap": has_hm,
                    "sampleIds": [r["id"] for r in rows[:5]],
                },
            }
        )
    return candidates


def mine(blocked_path: Path, hyps_path: Path, min_wr: float, max_candidates: int) -> dict:
    shadows = json.loads(blocked_path.read_text())
    fine: dict[tuple, list[dict]] = defaultdict(list)
    coarse: dict[tuple, list[dict]] = defaultdict(list)

    for s in shadows:
        if s.get("learningExcluded"):
            continue
        if s.get("status") != "resolved":
            continue
        row = _row_from_shadow(s)
        if row["pnl"] is None:
            continue
        fine[cluster_key(s, coarse=False)].append(row)
        # Coarse pass is for heatmap-backed rows only (roll up edge buckets).
        if row["has_heatmap"]:
            coarse[cluster_key(s, coarse=True)].append(row)

    existing = existing_desc_keys(hyps_path)
    candidates = _candidates_from_clusters(fine, existing, min_wr)
    seen_setups = {c["setupId"] for c in candidates}
    for c in _candidates_from_clusters(coarse, existing, min_wr):
        if c["setupId"] in seen_setups:
            continue
        # Prefer heatmap coarse cohorts that weren't already emitted finely.
        if c["mineStats"]["hasHeatmap"]:
            candidates.append(c)
            seen_setups.add(c["setupId"])

    # Rank by the statistic: binomial significance of the win record, then n.
    # Raw win-rate sorting favors tiny-n flukes over large significant cohorts.
    candidates.sort(
        key=lambda c: (
            c["mineStats"]["pValue"],
            -c["mineStats"]["n"],
        )
    )
    candidates = candidates[:max_candidates]
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": "shadow_miner_v1",
        "source": "mine_shadow_hypotheses.py",
        "filters": {
            "minWr": min_wr,
            "minNHeatmap": MIN_N_HEATMAP,
            "minNOther": MIN_N_OTHER,
            "excludeLearningExcluded": True,
            "resolvedOnly": True,
        },
        "newHypotheses": candidates,
    }


def apply_to_hypotheses(payload: dict, hyps_path: Path, max_new: int = 8) -> int:
    """Mirror engine ingestShadowMinedHypotheses for offline/first apply."""
    hyps = json.loads(hyps_path.read_text()) if hyps_path.exists() else []
    existing_desc = {str(h.get("description", "")).strip().lower()[:80] for h in hyps}
    existing_setups = {
        h.get("setupId")
        for h in hyps
        if h.get("setupId") and h.get("status") not in ("killed", "archived")
    }
    added = 0
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for nh in payload.get("newHypotheses") or []:
        if added >= max_new:
            break
        desc = str(nh.get("description") or "")
        desc_key = desc.strip().lower()[:80]
        if not desc_key or desc_key in existing_desc:
            continue
        setup_id = nh.get("setupId")
        if setup_id and setup_id in existing_setups:
            continue
        next_n = len(hyps) + 1
        hid = f"H-{next_n:03d}"
        hyp = {
            "id": hid,
            "created": nh.get("created") or today,
            "description": desc,
            "conditions": nh.get("conditions") or {},
            "prediction": nh.get("prediction"),
            "timeframeDays": int(nh.get("timeframeDays") or 2),
            "confidence": float(nh.get("confidence") or 0.7),
            "direction": nh.get("direction"),
            "tests": [
                {
                    "date": today,
                    "triggered": True,
                    "outcome": "pending",
                    "actualMove": "Shadow-mined test 1/20 opened from blocked-signal cohort.",
                }
            ],
            "winRate": 0,
            "status": "active",
            "promotedToSignal": False,
            "postMortem": f"Mined from clean shadows: {json.dumps(nh.get('mineStats') or {})[:400]}",
            "source": "shadow_mined",
            "setupId": setup_id,
            "setupLabel": nh.get("setupLabel"),
        }
        hyps.append(hyp)
        existing_desc.add(desc_key)
        if setup_id:
            existing_setups.add(setup_id)
        added += 1
        print(f"[apply] {hid} {setup_id}")
    hyps_path.write_text(json.dumps(hyps, indent=2) + "\n")
    marker = hyps_path.parent / "shadow-mined-hypotheses-ingested.json"
    marker.write_text(
        json.dumps(
            {
                "generatedAt": payload.get("generatedAt"),
                "ingestedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "added": added,
            },
            indent=2,
        )
        + "\n"
    )
    return added


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blocked", type=Path, default=DEFAULT_BLOCKED)
    ap.add_argument("--hypotheses", type=Path, default=DEFAULT_HYPS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--min-wr", type=float, default=MIN_WR)
    ap.add_argument("--max-candidates", type=int, default=MAX_CANDIDATES)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--apply",
        action="store_true",
        help="merge mined candidates into hypotheses.json (and write ingest marker)",
    )
    args = ap.parse_args()

    payload = mine(args.blocked, args.hypotheses, args.min_wr, args.max_candidates)
    print(f"mined {len(payload['newHypotheses'])} candidates @ {payload['generatedAt']}")
    for h in payload["newHypotheses"]:
        ms = h["mineStats"]
        print(
            f"  {h['setupId']}: n={ms['n']} wr={ms['winRate']:.2f} "
            f"sum={ms['sumPnl']:+.3f} hm={ms['hasHeatmap']} conf={h['confidence']:.2f}"
        )
    if args.dry_run:
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.out}")
    if args.apply:
        n = apply_to_hypotheses(payload, args.hypotheses)
        print(f"applied {n} into {args.hypotheses}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
