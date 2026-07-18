#!/usr/bin/env python3
"""Unit-style tests for FIND registry upsert and validation."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import (  # noqa: E402
    load_registry,
    upsert_finding,
    validate_registry,
)


def _sample_body(cluster_key: str, n: int, win_rate: float, sum_pnl: float) -> dict:
    return {
        "clusterKey": cluster_key,
        "asset": "OIL",
        "signalType": "ONE_TOUCH_HIGH_EDGE_NO",
        "side": "no",
        "bucket": "edge_15+",
        "evidence": {"n": n, "winRate": win_rate, "sumPnl": sum_pnl},
        "provenance": {
            "generatedBy": "shadow_miner_v1",
            "inputWindow": {"start": "2026-07-01T00:00:00Z", "end": "2026-07-10T00:00:00Z"},
            "featureSet": "blocked_signal_shadow_v1",
            "scoringVersion": "shadow_cluster_v1",
            "gitSha": "unknown",
            "inputArtifacts": ["data/fixtures/blocked-signals-sample.json"],
            "filters": {"minWr": 0.55},
            "reproducibleCommand": "python3 scripts/mine_shadow_findings.py",
        },
    }


def run_tests() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        registry_path = Path(tmpdir) / "registry.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        first = upsert_finding(
            registry_path,
            _sample_body("ONE_TOUCH_HIGH_EDGE_NO|OIL|edge_15+|no", 8, 0.625, 0.42),
            "Shadow FIND test",
        )
        assert first["id"] == "FIND-0001"
        assert first["status"] == "open"
        assert first["body"]["detectedAt"]
        assert first["body"]["lastSeenAt"]

        second = upsert_finding(
            registry_path,
            _sample_body("ONE_TOUCH_HIGH_EDGE_NO|OIL|edge_15+|no", 10, 0.70, 0.55),
            "Shadow FIND test updated",
        )
        assert second["id"] == "FIND-0001", "clusterKey upsert must preserve id"
        assert second["status"] == "strengthened"
        assert len(second["body"].get("provenanceHistory") or []) == 1

        negative = upsert_finding(
            registry_path,
            {
                **_sample_body("NEGATIVE|OIL|edge_15+|no", 8, 0.60, 0.10),
                "status": "negative",
            },
            "Negative finding",
        )
        # upsert_finding always creates with open; manually mark negative for test
        data = load_registry(registry_path)
        for record in data["records"]:
            if record["id"] == negative["id"]:
                record["status"] = "negative"
        registry_path.write_text(json.dumps(data, indent=2) + "\n")

        weakened = upsert_finding(
            registry_path,
            _sample_body("NEGATIVE|OIL|edge_15+|no", 6, 0.50, -0.05),
            "Should stay negative",
        )
        assert weakened["status"] == "negative", "negative status must not be overwritten"

        errors = validate_registry(load_registry(registry_path))
        assert not errors, f"validation failed: {errors}"

    print("ok: test_findings_registry passed")


if __name__ == "__main__":
    run_tests()
