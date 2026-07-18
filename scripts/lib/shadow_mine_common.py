"""Shared blocked-signal shadow clustering for shadow miners."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

MIN_N_HEATMAP = 8
MIN_N_OTHER = 8
MIN_WR = 0.55

HEATMAP_REASONS = {
    "one_touch_high_edge_shadow",
    "no_bias_adjusted_gap_shadow",
    "relative_value_heatmap",
}


def num(v: Any) -> float | None:
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


def cluster_key_str(key: tuple) -> str:
    return "|".join(str(part) for part in key)


def row_from_shadow(s: dict) -> dict:
    hyp = s.get("hypotheticalResult") or {}
    row = ((s.get("heatmapRowSnapshot") or {}).get("row") or {})
    return {
        "pnl": num(hyp.get("pnl")),
        "outcome": hyp.get("outcome"),
        "confidence": num(s.get("confidence")),
        "edge_pts": num(
            row.get("edge_score")
            or row.get("sell_yes_edge_pts")
            or row.get("buy_yes_edge_pts")
        ),
        "has_heatmap": bool(row),
        "blockedReason": str(s.get("blockedReason") or ""),
        "direction": s.get("direction") or "long",
        "id": s.get("id"),
        "blockedAt": s.get("blockedAt") or s.get("resolvedAt"),
    }


def build_cluster_maps(shadows: list[dict]) -> tuple[dict[tuple, list[dict]], dict[tuple, list[dict]]]:
    fine: dict[tuple, list[dict]] = defaultdict(list)
    coarse: dict[tuple, list[dict]] = defaultdict(list)

    for s in shadows:
        if s.get("learningExcluded"):
            continue
        if s.get("status") != "resolved":
            continue
        row = row_from_shadow(s)
        if row["pnl"] is None:
            continue
        fine[cluster_key(s, coarse=False)].append(row)
        if row["has_heatmap"]:
            coarse[cluster_key(s, coarse=True)].append(row)

    return fine, coarse


def cluster_evidence(key: tuple, rows: list[dict], min_wr: float) -> dict[str, Any] | None:
    sig, asset, bucket, side = key
    has_hm = any(r["has_heatmap"] for r in rows)
    min_n = MIN_N_HEATMAP if has_hm else MIN_N_OTHER
    if len(rows) < min_n:
        return None
    wins = sum(
        1
        for r in rows
        if (r["outcome"] == "win")
        or (r["outcome"] is None and (r["pnl"] or 0) > 0)
    )
    wr = wins / len(rows)
    if wr < min_wr:
        return None
    return {
        "key": key,
        "clusterKey": cluster_key_str(key),
        "sig": sig,
        "asset": asset,
        "bucket": bucket,
        "side": side,
        "hasHeatmap": has_hm,
        "rows": rows,
        "evidence": {
            "n": len(rows),
            "winRate": round(wr, 4),
            "sumPnl": round(sum(r["pnl"] or 0 for r in rows), 4),
        },
        "mineStats": {
            "n": len(rows),
            "wins": wins,
            "winRate": round(wr, 4),
            "sumPnl": round(sum(r["pnl"] or 0 for r in rows), 4),
            "hasHeatmap": has_hm,
            "sampleIds": [r["id"] for r in rows[:5]],
        },
    }


def iter_cluster_candidates(
    fine: dict[tuple, list[dict]],
    coarse: dict[tuple, list[dict]],
    min_wr: float,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for clusters in (fine, coarse):
        for key, rows in clusters.items():
            item = cluster_evidence(key, rows, min_wr)
            if item is None:
                continue
            ck = item["clusterKey"]
            if ck in seen_keys:
                continue
            seen_keys.add(ck)
            candidates.append(item)

    candidates.sort(
        key=lambda c: (
            -int(c["hasHeatmap"]),
            -c["evidence"]["winRate"],
            -c["evidence"]["n"],
        )
    )
    return candidates


def input_window_from_rows(rows: list[dict]) -> dict[str, str]:
    stamps = sorted(str(r.get("blockedAt") or "") for r in rows if r.get("blockedAt"))
    if not stamps:
        return {"start": "unknown", "end": "unknown"}
    return {"start": stamps[0], "end": stamps[-1]}
