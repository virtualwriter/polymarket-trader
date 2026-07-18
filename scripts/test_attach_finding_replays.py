#!/usr/bin/env python3
"""Unit-style tests for Phase G FIND replay attachment."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from attach_finding_replays import (  # noqa: E402
    ReplayCandidate,
    attach_from_sandbox,
    build_plan,
    select_candidates,
    signal_family,
)
from registry import validate_registry  # noqa: E402


def _provenance() -> dict:
    return {
        "generatedBy": "shadow_miner_v1",
        "inputWindow": {"start": "2026-07-01T00:00:00Z", "end": "2026-07-10T00:00:00Z"},
        "featureSet": "blocked_signal_shadow_v1",
        "scoringVersion": "shadow_cluster_v1",
        "gitSha": "test",
        "inputArtifacts": ["data/blocked-signals.json"],
        "filters": {"minWr": 0.55},
        "reproducibleCommand": "python3 scripts/mine_shadow_findings.py",
    }


def _finding(fid: str, cluster_key: str, status: str = "open") -> dict:
    return {
        "id": fid,
        "type": "finding",
        "evidenceClass": "DERIVED",
        "status": status,
        "title": f"Finding {fid}",
        "body": {
            "clusterKey": cluster_key,
            "evidence": {"n": 10, "winRate": 0.7, "sumPnl": 0.4},
            "provenance": _provenance(),
            "opportunityScore": 0.7,
            "confidenceScore": 0.3,
        },
        "links": {},
        "created": "2026-07-18T00:00:00Z",
        "source": "test",
    }


def test_selection_skips_negative_and_maps_signal_family() -> None:
    registry = {
        "version": 1,
        "records": [
            _finding("FIND-0001", "LOW|GOLD|heatmap|no"),
            _finding("FIND-0002", "NEG|GOLD|heatmap|no", status="negative"),
            _finding("FIND-0003", "TOP_SIGNAL|MU|funding|long"),
        ],
    }
    opportunities = {
        "opportunities": [
            {"rank": 1, "id": "FIND-0002", "clusterKey": "NEG|GOLD|heatmap|no", "opportunityScore": 0.99, "confidenceScore": 0.5, "status": "open"},
            {"rank": 2, "id": "FIND-0003", "clusterKey": "TOP_SIGNAL|MU|funding|long", "opportunityScore": 0.80, "confidenceScore": 0.4, "status": "open"},
            {"rank": 3, "id": "FIND-0001", "clusterKey": "LOW|GOLD|heatmap|no", "opportunityScore": 0.70, "confidenceScore": 0.3, "status": "open"},
        ]
    }
    selected = select_candidates(opportunities, registry, top_k=2)
    assert [c.finding_id for c in selected] == ["FIND-0003", "FIND-0001"]
    assert selected[0].signals == "TOP_SIGNAL"
    assert signal_family("ABC|DEF|G") == "ABC"


def test_plan_contains_reproducible_command() -> None:
    candidate = ReplayCandidate("FIND-0003", 1, "Title", "SIG|ASSET|bucket|long", "SIG", 0.8, 0.4, "open")
    plan = build_plan(
        [candidate],
        start="2026-07-11",
        end="2026-07-12",
        window_source="test",
        limit_hours=2,
        generated_at="2026-07-18T12:00:00Z",
    )
    row = plan["candidates"][0]
    assert row["sandbox"] == "/tmp/finding-replay-FIND-0003"
    assert "scripts/replay-harness.ts" in row["reproducibleCommand"]
    assert "--signals SIG" in row["reproducibleCommand"]
    assert "--keep-going" in row["reproducibleCommand"]


def test_attach_from_mock_summary_updates_registry() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        registry_path = root / "registry.json"
        sandbox = root / "sandbox"
        sandbox.mkdir()
        registry = {"version": 1, "records": [_finding("FIND-0003", "SIG|ASSET|bucket|long")]}
        registry_path.write_text(json.dumps(registry, indent=2) + "\n")
        summary = {
            "window": {"start": "2026-07-11", "end": "2026-07-12"},
            "hoursReplayed": 2,
            "hoursFailed": 0,
            "tradesClosedBySignal": {"SIG": {"count": 3, "pnl": 0.123456}},
            "totals": {"closedTrades": 4, "totalPnl": 0.2},
        }
        (sandbox / "replay-report.json").write_text(json.dumps(summary))
        candidate = ReplayCandidate("FIND-0003", 1, "Title", "SIG|ASSET|bucket|long", "SIG", 0.8, 0.4, "open")

        evidence = attach_from_sandbox(
            registry_path,
            candidate,
            sandbox=sandbox,
            start="2026-07-11",
            end="2026-07-12",
            limit_hours=2,
            attached_at="2026-07-18T12:00:00Z",
        )

        assert evidence["status"] == "attached"
        assert evidence["tradeCount"] == 3
        assert evidence["totalPnl"] == 0.123456
        data = json.loads(registry_path.read_text())
        assert not validate_registry(data)
        finding = data["records"][0]
        assert finding["body"]["replayEvidence"]["opportunityScoreAtAttach"] == 0.8
        link = finding["links"]["replays"][0]
        assert link["summaryPath"].endswith("replay-report.json")
        assert "reproducibleCommand" in link


def run_tests() -> None:
    test_selection_skips_negative_and_maps_signal_family()
    test_plan_contains_reproducible_command()
    test_attach_from_mock_summary_updates_registry()
    print("ok: test_attach_finding_replays passed")


if __name__ == "__main__":
    run_tests()
