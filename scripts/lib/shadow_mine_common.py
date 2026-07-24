"""Shared blocked-signal shadow clustering for shadow miners."""
from __future__ import annotations

import math
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


def binomial_p_value(wins: int, n: int, p: float = 0.5) -> float:
    """One-sided exact binomial P(X >= wins | n, p). Small p => WR above chance."""
    if n <= 0:
        return 1.0
    total = 0.0
    for k in range(wins, n + 1):
        total += math.comb(n, k) * (p ** k) * ((1 - p) ** (n - k))
    return min(1.0, total)


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


def _edge_bucket(edge: float | None) -> str | None:
    if edge is None:
        return None
    if edge < 3:
        return "e1-3"
    if edge < 8:
        return "e3-8"
    return "e8+"


def _stance_bucket(stance: float | None) -> str:
    if stance is None:
        return "s?"
    if stance < 0:
        return "s-1"
    if stance > 0:
        return "s+1"
    return "s0"


def _dte_bucket(dte: float | None) -> str | None:
    if dte is None:
        return None
    if dte < 30:
        return "d<30"
    if dte < 90:
        return "d30-90"
    return "d90+"


def stratum_features(shadow: dict) -> dict[str, str | None]:
    """Per-trade stratum labels from the heatmap row snapshot (heatmap shadows only)."""
    row = ((shadow.get("heatmapRowSnapshot") or {}).get("row") or {})
    if not row:
        return {}
    direction = row.get("direction")
    return {
        "dir": f"dir={direction}" if direction in ("above", "below") else None,
        "edge": _edge_bucket(num(row.get("sell_yes_edge_pts") or row.get("buy_yes_edge_pts"))),
        "stance": _stance_bucket(num(row.get("smart_flow_stance"))),
        "dte": _dte_bucket(num(row.get("dte_days"))),
    }


# Each entry is a set of stratum dimensions combined into one cluster bucket.
# Kept low-dimensional on purpose: full cross-products fragment n below
# significance; single- and two-way splits pool enough trades to test.
STRATIFICATIONS: tuple[tuple[str, ...], ...] = (
    ("dir",),
    ("dir", "stance"),
    ("dir", "edge"),
    ("dir", "dte"),
    ("stance", "edge"),
)


def stratum_keys(shadow: dict) -> list[tuple]:
    """Stratified cluster keys for a heatmap shadow, per-asset and pooled (ALL)."""
    features = stratum_features(shadow)
    if not features:
        return []
    sig = str(shadow.get("signalType") or "UNKNOWN")
    asset = str(shadow.get("asset") or "UNK").upper()
    side = str(
        ((shadow.get("heatmapRowSnapshot") or {}).get("selectedSide"))
        or shadow.get("direction")
        or "na"
    )
    keys: list[tuple] = []
    for dims in STRATIFICATIONS:
        parts = [features.get(dim) for dim in dims]
        if any(part is None for part in parts):
            continue
        bucket = "strat:" + ",".join(str(part) for part in parts)
        keys.append((sig, asset, bucket, side))
        # Pooled across assets for statistical power on regime-level claims.
        keys.append((sig, "ALL", bucket, side))
    return keys


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


def build_cluster_maps(
    shadows: list[dict],
) -> tuple[dict[tuple, list[dict]], dict[tuple, list[dict]], dict[tuple, list[dict]]]:
    fine: dict[tuple, list[dict]] = defaultdict(list)
    coarse: dict[tuple, list[dict]] = defaultdict(list)
    strata: dict[tuple, list[dict]] = defaultdict(list)

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
            for key in stratum_keys(s):
                strata[key].append(row)

    return fine, coarse, strata


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
    sum_pnl = sum(r["pnl"] or 0 for r in rows)
    p_value = binomial_p_value(wins, len(rows))
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
            "sumPnl": round(sum_pnl, 4),
            "avgPnl": round(sum_pnl / len(rows), 5),
            "pValue": round(p_value, 5),
        },
        "mineStats": {
            "n": len(rows),
            "wins": wins,
            "winRate": round(wr, 4),
            "sumPnl": round(sum_pnl, 4),
            "pValue": round(p_value, 5),
            "hasHeatmap": has_hm,
            "sampleIds": [r["id"] for r in rows[:5]],
        },
    }


def iter_cluster_candidates(
    fine: dict[tuple, list[dict]],
    coarse: dict[tuple, list[dict]],
    min_wr: float,
    strata: dict[tuple, list[dict]] | None = None,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    seen_row_sets: set[frozenset] = set()

    for clusters in (fine, coarse, strata or {}):
        for key, rows in clusters.items():
            item = cluster_evidence(key, rows, min_wr)
            if item is None:
                continue
            ck = item["clusterKey"]
            if ck in seen_keys:
                continue
            # Different stratifications can select the identical trade set
            # (e.g. dir=above vs dir=above,stance=? when stance is never
            # scored) — keep only the first, so redundant FINDs don't crowd
            # the ranked opportunity slots.
            row_set = frozenset(r["id"] for r in rows if r.get("id"))
            if row_set and row_set in seen_row_sets:
                continue
            seen_keys.add(ck)
            if row_set:
                seen_row_sets.add(row_set)
            candidates.append(item)

    # Rank by statistical significance first: raw win-rate sorting favors
    # tiny-n flukes (n=8 at 62% is p~0.36); p-value balances WR against n.
    candidates.sort(
        key=lambda c: (
            -int(c["hasHeatmap"]),
            c["evidence"]["pValue"],
            -c["evidence"]["n"],
        )
    )
    return candidates


def input_window_from_rows(rows: list[dict]) -> dict[str, str]:
    stamps = sorted(str(r.get("blockedAt") or "") for r in rows if r.get("blockedAt"))
    if not stamps:
        return {"start": "unknown", "end": "unknown"}
    return {"start": stamps[0], "end": stamps[-1]}
