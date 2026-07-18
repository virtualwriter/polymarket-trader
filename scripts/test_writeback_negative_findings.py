#!/usr/bin/env python3
"""Unit-style tests for Phase F negative FIND writeback."""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import load_registry, upsert_finding, validate_registry  # noqa: E402
from writeback_negative_findings import (  # noqa: E402
    apply_writeback,
    hypothesis_failed,
)


FIXED_NOW = datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc)


def _sample_body(cluster_key: str) -> dict:
    return {
        "clusterKey": cluster_key,
        "asset": "OIL",
        "signalType": "ONE_TOUCH_HIGH_EDGE_NO",
        "side": "no",
        "bucket": "edge_15+",
        "evidence": {"n": 8, "winRate": 0.625, "sumPnl": 0.42},
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
    }


def test_hypothesis_failed_rules() -> None:
    assert hypothesis_failed({"status": "killed", "winRate": 0.8}) == (True, "killed")
    assert hypothesis_failed({"status": "archived", "winRate": 0.5}) == (True, "archived")
    low_wr = {
        "status": "active",
        "winRate": 0.30,
        "tests": [{"outcome": "loss"}] * 5,
    }
    failed, code = hypothesis_failed(low_wr)
    assert failed and code.startswith("low_win_rate")
    ok = {
        "status": "active",
        "winRate": 0.30,
        "tests": [{"outcome": "loss"}] * 3,
    }
    assert hypothesis_failed(ok) == (False, "")
    promoted = {"status": "promoted", "winRate": 0.80, "tests": [{"outcome": "win"}] * 6}
    assert hypothesis_failed(promoted) == (False, "")


def test_marks_negative_and_preserves_provenance() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        registry_path = root / "registry.json"
        hypotheses_path = root / "hypotheses.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        record = upsert_finding(
            registry_path,
            _sample_body("FAIL|OIL|edge|no"),
            "Open finding",
        )
        finding_id = record["id"]
        before = load_registry(registry_path)
        before_prov = before["records"][0]["body"]["provenance"]

        hypotheses_path.write_text(
            json.dumps(
                [
                    {
                        "id": "H-900",
                        "status": "killed",
                        "winRate": 0.20,
                        "originFindingId": finding_id,
                        "tests": [{"outcome": "loss"}] * 5,
                    }
                ]
            )
            + "\n"
        )

        result = apply_writeback(
            hypotheses_path,
            registry_path,
            dry_run=False,
            now=FIXED_NOW,
        )
        assert result["marked"] == 1

        after = load_registry(registry_path)
        finding = after["records"][0]
        assert finding["status"] == "negative"
        assert finding["body"]["negativeReason"]
        assert finding["body"]["resolvedAt"] == "2026-07-18T12:00:00Z"
        assert finding["body"]["provenance"] == before_prov
        assert finding["links"]["failedHypotheses"] == ["H-900"]
        assert finding["links"]["hypotheses"] == ["H-900"]
        assert not validate_registry(after)


def test_skips_already_negative() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        registry_path = root / "registry.json"
        hypotheses_path = root / "hypotheses.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        record = upsert_finding(
            registry_path,
            _sample_body("NEG|OIL|edge|no"),
            "Finding",
        )
        data = load_registry(registry_path)
        data["records"][0]["status"] = "negative"
        data["records"][0]["links"] = {"failedHypotheses": ["H-800"]}
        registry_path.write_text(json.dumps(data, indent=2) + "\n")

        hypotheses_path.write_text(
            json.dumps(
                [
                    {
                        "id": "H-800",
                        "status": "killed",
                        "winRate": 0.0,
                        "originFindingId": record["id"],
                        "tests": [],
                    },
                    {
                        "id": "H-901",
                        "status": "killed",
                        "winRate": 0.0,
                        "originFindingId": record["id"],
                        "tests": [],
                    },
                ]
            )
            + "\n"
        )

        result = apply_writeback(
            hypotheses_path,
            registry_path,
            dry_run=False,
            now=FIXED_NOW,
        )
        assert result["marked"] == 0
        assert result["linkedOnly"] == 1

        after = load_registry(registry_path)
        finding = after["records"][0]
        assert finding["status"] == "negative"
        assert finding["links"]["failedHypotheses"] == ["H-800", "H-901"]


def test_dry_run_no_write() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        registry_path = root / "registry.json"
        hypotheses_path = root / "hypotheses.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))
        record = upsert_finding(
            registry_path,
            _sample_body("DRY|OIL|edge|no"),
            "Finding",
        )
        hypotheses_path.write_text(
            json.dumps(
                [
                    {
                        "id": "H-902",
                        "status": "killed",
                        "winRate": 0.0,
                        "originFindingId": record["id"],
                        "tests": [],
                    }
                ]
            )
            + "\n"
        )
        result = apply_writeback(
            hypotheses_path,
            registry_path,
            dry_run=True,
            now=FIXED_NOW,
        )
        assert result["marked"] == 1
        after = load_registry(registry_path)
        assert after["records"][0]["status"] == "open"


def run_tests() -> None:
    test_hypothesis_failed_rules()
    test_marks_negative_and_preserves_provenance()
    test_skips_already_negative()
    test_dry_run_no_write()
    print("ok: test_writeback_negative_findings passed")


if __name__ == "__main__":
    run_tests()
