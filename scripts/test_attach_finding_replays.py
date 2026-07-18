#!/usr/bin/env python3
"""Unit-style tests for Phase G replay evidence attachment."""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from attach_finding_replays import (  # noqa: E402
    attach_to_registry,
    build_plan,
    parse_replay_report,
    select_candidates,
    signal_from_cluster_key,
)
from registry import validate_registry  # noqa: E402

FIXED_NOW = datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc)


def _finding(fid: str, cluster_key: str, *, status: str = "open") -> dict:
    return {
        "id": fid,
        "type": "finding",
        "evidenceClass": "DERIVED",
        "status": status,
        "title": f"Finding {fid}",
        "body": {
            "clusterKey": cluster_key,
            "evidence": {"n": 10, "winRate": 0.7, "sumPnl": 0.4},
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
        },
        "links": {},
        "created": "2026-07-18T03:00:00Z",
        "source": "test",
    }


def test_signal_mapping() -> None:
    assert signal_from_cluster_key("ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no") == "ONE_TOUCH_HIGH_EDGE_NO"


def test_selection_skips_negative_and_sorts_by_opportunity() -> None:
    registry = {
        "version": 1,
        "records": [
            _finding("FIND-0001", "LOW|GOLD|x|no"),
            _finding("FIND-0002", "NEG|GOLD|x|no", status="negative"),
            _finding("FIND-0003", "TOP|GOLD|x|no"),
        ],
    }
    opportunities = {
        "opportunities": [
            {"id": "FIND-0002", "clusterKey": "NEG|GOLD|x|no", "opportunityScore": 0.99, "status": "negative"},
            {"id": "FIND-0001", "clusterKey": "LOW|GOLD|x|no", "opportunityScore": 0.30, "status": "open"},
            {"id": "FIND-0003", "clusterKey": "TOP|GOLD|x|no", "opportunityScore": 0.80, "status": "open"},
        ]
    }
    selected = select_candidates(opportunities, registry, top_k=2)
    assert [row["id"] for row in selected] == ["FIND-0003", "FIND-0001"]
    assert selected[0]["signals"] == "TOP"


def test_build_plan_contains_reproducible_command() -> None:
    candidate = {"id": "FIND-0003", "clusterKey": "TOP|GOLD|x|no", "signals": "TOP", "opportunityScore": 0.8}
    plan = build_plan(
        [candidate],
        window={"start": "2026-07-11", "end": "2026-07-12", "source": "test"},
        limit_hours=2,
        now=FIXED_NOW,
    )
    row = plan["candidates"][0]
    assert row["sandbox"] == "/tmp/finding-replay-FIND-0003"
    assert "--signals TOP" in row["reproducibleCommand"]
    assert "--limit-hours 2" in row["reproducibleCommand"]


def test_attach_link_update_from_mock_summary() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        registry_path = root / "registry.json"
        registry = {"version": 1, "records": [_finding("FIND-0003", "TOP|GOLD|x|no")]}
        registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")

        sandbox = root / "sandbox"
        sandbox.mkdir()
        report_path = sandbox / "replay-report.json"
        report_path.write_text(
            json.dumps(
                {
                    "window": {"start": "2026-07-11", "end": "2026-07-12"},
                    "hoursReplayed": 2,
                    "hoursFailed": 0,
                    "config": {"signalsFilter": ["TOP"], "sandbox": str(sandbox)},
                    "totals": {"closedTrades": 3, "totalPnl": 0.123456},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        candidate = {"id": "FIND-0003", "signals": "TOP", "opportunityScore": 0.8}
        evidence = parse_replay_report(report_path, candidate=candidate, attached_at="2026-07-18T12:00:00Z")
        attach_to_registry(
            registry_path,
            candidate,
            sandbox=str(sandbox),
            summary_path=report_path,
            evidence=evidence,
            started="2026-07-18T11:59:00Z",
            ended="2026-07-18T12:00:00Z",
            reproducible_cmd="cd /opt/polymarket-trader && npx tsx scripts/replay-harness.ts --signals TOP",
        )
        saved = json.loads(registry_path.read_text(encoding="utf-8"))
        assert validate_registry(saved) == []
        finding = saved["records"][0]
        assert finding["links"]["replays"][0]["summaryPath"] == str(report_path)
        assert finding["links"]["replays"][0]["reproducibleCommand"].startswith("cd /opt/polymarket-trader")
        assert finding["body"]["replayEvidence"]["tradeCount"] == 3
        assert finding["body"]["replayEvidence"]["totalPnl"] == 0.123456


def run_tests() -> None:
    test_signal_mapping()
    test_selection_skips_negative_and_sorts_by_opportunity()
    test_build_plan_contains_reproducible_command()
    test_attach_link_update_from_mock_summary()
    print("ok: test_attach_finding_replays passed")


if __name__ == "__main__":
    run_tests()
