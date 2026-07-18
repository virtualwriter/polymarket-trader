#!/usr/bin/env python3
"""Unit-style tests for research FIND scoring (Phase B)."""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import upsert_finding, validate_registry  # noqa: E402
from score_research_findings import (  # noqa: E402
    SCORING_VERSION,
    apply_scores_to_registry,
    build_opportunities,
    compute_scores,
    score_research_findings,
)


FIXED_NOW = datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc)


def _sample_body(
    cluster_key: str,
    n: int,
    win_rate: float,
    sum_pnl: float,
    *,
    has_heatmap: bool = False,
) -> dict:
    return {
        "clusterKey": cluster_key,
        "asset": "OIL",
        "signalType": "ONE_TOUCH_HIGH_EDGE_NO",
        "side": "no",
        "bucket": "edge_15+",
        "evidence": {"n": n, "winRate": win_rate, "sumPnl": sum_pnl},
        "mineStats": {
            "n": n,
            "winRate": win_rate,
            "sumPnl": sum_pnl,
            "hasHeatmap": has_heatmap,
            "sampleIds": [],
        },
        "provenance": {
            "generatedBy": "shadow_miner_v1",
            "inputWindow": {"start": "2026-07-01T00:00:00Z", "end": "2026-07-10T00:00:00Z"},
            "featureSet": "blocked_signal_shadow_v1",
            "scoringVersion": "shadow_cluster_v1",
            "gitSha": "test",
            "inputArtifacts": ["data/blocked-signals.json"],
            "filters": {"minWr": 0.55},
            "reproducibleCommand": "python3 scripts/mine_shadow_findings.py",
        },
        "lastSeenAt": "2026-07-18T03:00:00Z",
    }


def test_higher_n_higher_confidence() -> None:
    low_n_body = _sample_body("LOW_N|OIL|edge|no", 5, 0.70, 0.10)
    high_n_body = _sample_body("HIGH_N|OIL|edge|no", 20, 0.70, 0.10)
    _, conf_low = compute_scores(low_n_body, FIXED_NOW)
    _, conf_high = compute_scores(high_n_body, FIXED_NOW)
    assert conf_high > conf_low, f"expected higher n → higher confidence: {conf_low} vs {conf_high}"


def test_higher_wr_positive_pnl_higher_opportunity() -> None:
    weak_body = _sample_body("WEAK|OIL|edge|no", 10, 0.55, -0.20)
    strong_body = _sample_body("STRONG|OIL|edge|no", 10, 0.90, 0.50, has_heatmap=True)
    opp_weak, _ = compute_scores(weak_body, FIXED_NOW)
    opp_strong, _ = compute_scores(strong_body, FIXED_NOW)
    assert opp_strong > opp_weak, f"expected strong > weak opportunity: {opp_weak} vs {opp_strong}"


def test_negative_status_excluded_from_opportunities() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        registry_path = Path(tmpdir) / "registry.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        upsert_finding(
            registry_path,
            _sample_body("GOOD|OIL|edge|no", 10, 0.80, 0.40),
            "Good finding",
        )
        bad = upsert_finding(
            registry_path,
            _sample_body("BAD|OIL|edge|no", 15, 0.95, 0.90, has_heatmap=True),
            "Bad finding",
        )
        data = json.loads(registry_path.read_text())
        for record in data["records"]:
            if record["id"] == bad["id"]:
                record["status"] = "negative"
        registry_path.write_text(json.dumps(data, indent=2) + "\n")

        scored = apply_scores_to_registry(registry_path, now=FIXED_NOW)
        opportunities = build_opportunities(scored, top_n=10)
        ids = [row["id"] for row in opportunities]
        assert bad["id"] not in ids, "negative status must be excluded from opportunities"
        assert len(opportunities) == 1


def test_deterministic_scores() -> None:
    body = _sample_body("DET|OIL|edge|no", 12, 0.75, 0.25, has_heatmap=True)
    first = compute_scores(body, FIXED_NOW)
    second = compute_scores(body, FIXED_NOW)
    assert first == second


def test_score_history_appended() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        registry_path = Path(tmpdir) / "registry.json"
        out_path = Path(tmpdir) / "research-opportunities.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        upsert_finding(
            registry_path,
            _sample_body("HIST|OIL|edge|no", 8, 0.625, 0.30),
            "History finding",
        )
        score_research_findings(
            registry_path=registry_path,
            out_path=out_path,
            top_n=5,
            now=FIXED_NOW,
        )
        data = json.loads(registry_path.read_text())
        finding = next(r for r in data["records"] if r["type"] == "finding")
        history = finding["body"]["scoreHistory"]
        assert len(history) == 1
        assert history[0]["scoringVersion"] == SCORING_VERSION
        assert "opportunityScore" in history[0]
        assert "confidenceScore" in history[0]

        payload = json.loads(out_path.read_text())
        assert payload["scoringVersion"] == SCORING_VERSION
        assert payload["opportunities"]

        errors = validate_registry(data)
        assert not errors, f"validation failed: {errors}"


def run_tests() -> None:
    test_higher_n_higher_confidence()
    test_higher_wr_positive_pnl_higher_opportunity()
    test_negative_status_excluded_from_opportunities()
    test_deterministic_scores()
    test_score_history_appended()
    print("ok: test_score_research_findings passed")


if __name__ == "__main__":
    run_tests()
