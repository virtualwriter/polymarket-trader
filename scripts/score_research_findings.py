#!/usr/bin/env python3
"""Score FIND records with dual opportunity/confidence metrics (Phase B).

Scoring version: ``research_score_v1``

Formulas (deterministic, no ML):

confidenceScore in [0, 1]::

    sampleWeight = n / (n + 10)
    confidenceScore = sampleWeight * winRate

Higher ``n`` and ``winRate`` both monotonically increase confidence.

opportunityScore in [0, 1]::

    wrPart = winRate
    pnlPart = (clip(sumPnl, -1, 1) + 1) / 2          # -1→0, 0→0.5, +1→1
    heatmapPart = 1.0 if mineStats.hasHeatmap else 0.0
    freshnessPart = max(0, 1 - daysSince(lastSeenAt) / 30)   # 0.5 when missing
    opportunityScore = clip(
        0.40 * wrPart + 0.30 * pnlPart + 0.15 * heatmapPart + 0.15 * freshnessPart,
        0, 1,
    )

Each scoring run appends one ``scoreHistory`` entry per FIND (includes
``scoringVersion``). Writes ``data/research-opportunities.json`` ranked by
``opportunityScore`` desc, then ``confidenceScore`` desc. Excludes
``status=negative`` from the opportunities list (they are still scored).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import (  # noqa: E402
    REGISTRY_VERSION,
    default_registry_path,
    load_registry,
    validate_record,
    validate_registry,
    write_registry,
)

SCORING_VERSION = "research_score_v1"
DEFAULT_REGISTRY = default_registry_path()
DEFAULT_FINDINGS = REPO / "data" / "research-findings.json"
DEFAULT_OUT = REPO / "data" / "research-opportunities.json"
SCORE_DECIMALS = 4


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _round_score(value: float) -> float:
    return round(_clip(value, 0.0, 1.0), SCORE_DECIMALS)


def freshness_score(last_seen_at: str | None, now: datetime) -> float:
    if not last_seen_at:
        return 0.5
    try:
        seen = datetime.fromisoformat(last_seen_at.replace("Z", "+00:00"))
    except ValueError:
        return 0.5
    days = (now - seen).total_seconds() / 86400.0
    return _round_score(1.0 - days / 30.0)


def compute_scores(body: dict[str, Any], now: datetime | None = None) -> tuple[float, float]:
    """Return (opportunityScore, confidenceScore) for a FIND body."""
    now = now or datetime.now(timezone.utc)
    evidence = body.get("evidence") or {}
    n = float(evidence.get("n") or 0)
    win_rate = float(evidence.get("winRate") or 0)
    sum_pnl = float(evidence.get("sumPnl") or 0)

    sample_weight = n / (n + 10.0) if n >= 0 else 0.0
    confidence = _round_score(sample_weight * win_rate)

    pnl_part = ( _clip(sum_pnl, -1.0, 1.0) + 1.0) / 2.0
    mine_stats = body.get("mineStats") or {}
    heatmap_part = 1.0 if mine_stats.get("hasHeatmap") else 0.0
    fresh_part = freshness_score(body.get("lastSeenAt"), now)

    opportunity = _round_score(
        0.40 * win_rate
        + 0.30 * pnl_part
        + 0.15 * heatmap_part
        + 0.15 * fresh_part
    )
    return opportunity, confidence


def iter_findings_from_registry(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [r for r in data.get("records", []) if r.get("type") == "finding"]


def apply_scores_to_registry(
    registry_path: Path,
    *,
    dry_run: bool = False,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Update opportunity/confidence on every FIND; return scored record copies."""
    now = now or datetime.now(timezone.utc)
    now_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    data = load_registry(registry_path)
    scored: list[dict[str, Any]] = []

    for record in iter_findings_from_registry(data):
        body = dict(record.get("body") or {})
        opportunity, confidence = compute_scores(body, now)
        body["opportunityScore"] = opportunity
        body["confidenceScore"] = confidence
        score_history = list(body.get("scoreHistory") or [])
        score_history.append(
            {
                "at": now_iso,
                "opportunityScore": opportunity,
                "confidenceScore": confidence,
                "scoringVersion": SCORING_VERSION,
            }
        )
        body["scoreHistory"] = score_history
        record = dict(record)
        record["body"] = body
        errors = validate_record(record)
        if errors:
            raise ValueError(f"{record.get('id')}: {'; '.join(errors)}")
        scored.append(record)

    if not dry_run:
        by_id = {r["id"]: r for r in scored}
        records = data.setdefault("records", [])
        for i, record in enumerate(records):
            if record.get("type") == "finding" and record.get("id") in by_id:
                records[i] = by_id[record["id"]]
        data["version"] = REGISTRY_VERSION
        registry_errors = validate_registry(data)
        if registry_errors:
            raise ValueError("; ".join(registry_errors))
        write_registry(registry_path, data)

    return scored


def build_opportunities(
    findings: list[dict[str, Any]],
    top_n: int,
) -> list[dict[str, Any]]:
    eligible = [f for f in findings if f.get("status") != "negative"]
    eligible.sort(
        key=lambda f: (
            f.get("body", {}).get("opportunityScore") or 0.0,
            f.get("body", {}).get("confidenceScore") or 0.0,
        ),
        reverse=True,
    )
    opportunities: list[dict[str, Any]] = []
    for rank, record in enumerate(eligible[:top_n], start=1):
        body = record.get("body") or {}
        opportunities.append(
            {
                "rank": rank,
                "id": record.get("id"),
                "clusterKey": body.get("clusterKey"),
                "opportunityScore": body.get("opportunityScore"),
                "confidenceScore": body.get("confidenceScore"),
                "status": record.get("status"),
                "evidence": body.get("evidence"),
                "title": record.get("title"),
            }
        )
    return opportunities


def score_research_findings(
    registry_path: Path = DEFAULT_REGISTRY,
    out_path: Path = DEFAULT_OUT,
    top_n: int = 10,
    dry_run: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Score all FIND records and write research-opportunities.json."""
    now = now or datetime.now(timezone.utc)
    scored = apply_scores_to_registry(registry_path, dry_run=dry_run, now=now)
    opportunities = build_opportunities(scored, top_n)
    payload = {
        "generatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scoringVersion": SCORING_VERSION,
        "topN": top_n,
        "opportunities": opportunities,
    }

    if not dry_run:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2) + "\n")

    return {
        "payload": payload,
        "scoredCount": len(scored),
        "opportunityCount": len(opportunities),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--top-n", type=int, default=10)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    result = score_research_findings(
        registry_path=args.registry,
        out_path=args.out,
        top_n=args.top_n,
        dry_run=args.dry_run,
    )
    print(
        f"scored {result['scoredCount']} finding(s), "
        f"top {result['opportunityCount']} opportunit(ies) "
        f"@ {result['payload']['generatedAt']}"
    )
    for row in result["payload"]["opportunities"]:
        print(
            f"  #{row['rank']} {row['id']} opp={row['opportunityScore']:.4f} "
            f"conf={row['confidenceScore']:.4f} status={row['status']}"
        )
    if not args.dry_run:
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
