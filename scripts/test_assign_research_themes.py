#!/usr/bin/env python3
"""Unit-style tests for research theme assignment (Phase C)."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from assign_research_themes import theme_slug_for_signal  # noqa: E402
from registry import upsert_finding, upsert_theme, validate_registry  # noqa: E402
from assign_research_themes import assign_research_themes  # noqa: E402


def _sample_body(cluster_key: str, signal_type: str) -> dict:
    return {
        "clusterKey": cluster_key,
        "asset": "GOLD",
        "signalType": signal_type,
        "side": "no",
        "bucket": "heatmap",
        "evidence": {"n": 8, "winRate": 0.625, "sumPnl": 0.42},
        "mineStats": {"n": 8, "hasHeatmap": True, "sampleIds": []},
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
        "opportunityScore": 0.75,
    }


def test_same_signal_family_same_theme_slug() -> None:
    one_touch = theme_slug_for_signal("ONE_TOUCH_HIGH_EDGE_NO")
    no_bias = theme_slug_for_signal("NO_BIAS_ADJUSTED_GAP_SHADOW")
    relative = theme_slug_for_signal("RELATIVE_VALUE_HEATMAP")
    weekend = theme_slug_for_signal("WEEKEND_HL_FUNDING_REVERSION_LONG")

    assert one_touch[0] == no_bias[0] == relative[0] == "heatmap_one_touch"
    assert weekend[0] == "weekend_hl_funding"
    assert theme_slug_for_signal("FUNDING_EXTREME_SHORT")[0] == "funding_extreme"
    assert theme_slug_for_signal("PC_RATIO_EXTREME_HIGH")[0].startswith("other_")


def test_upsert_stable_theme_ids() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        registry_path = Path(tmpdir) / "registry.json"
        out_path = Path(tmpdir) / "research-themes.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        upsert_finding(
            registry_path,
            _sample_body("ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no", "ONE_TOUCH_HIGH_EDGE_NO"),
            "One touch finding",
        )
        upsert_finding(
            registry_path,
            _sample_body("NO_BIAS_ADJUSTED_GAP_SHADOW|GOLD|heatmap|no", "NO_BIAS_ADJUSTED_GAP_SHADOW"),
            "No bias finding",
        )
        upsert_finding(
            registry_path,
            _sample_body(
                "WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|long",
                "WEEKEND_HL_FUNDING_REVERSION_LONG",
            ),
            "Weekend funding finding",
        )

        first = assign_research_themes(registry_path=registry_path, out_path=out_path)
        assert first["themeCount"] == 2

        data = json.loads(registry_path.read_text())
        theme_ids = sorted(r["id"] for r in data["records"] if r["type"] == "theme")
        assert theme_ids == ["THEME-0001", "THEME-0002"]

        second = assign_research_themes(registry_path=registry_path, out_path=out_path)
        assert second["themeCount"] == 2

        data2 = json.loads(registry_path.read_text())
        theme_ids2 = sorted(r["id"] for r in data2["records"] if r["type"] == "theme")
        assert theme_ids2 == theme_ids, "theme ids must be stable across reruns"

        heatmap = next(
            r for r in data2["records"] if r.get("type") == "theme" and r["body"]["slug"] == "heatmap_one_touch"
        )
        assert len(heatmap["links"]["findings"]) == 2

        errors = validate_registry(data2)
        assert not errors, f"validation failed: {errors}"


def test_upsert_theme_by_slug() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        registry_path = Path(tmpdir) / "registry.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        first = upsert_theme(registry_path, "heatmap_one_touch", "Heatmap theme", {"family": "heatmap_one_touch"})
        second = upsert_theme(registry_path, "heatmap_one_touch", "Heatmap theme updated", {"family": "heatmap_one_touch"})
        assert first["id"] == second["id"] == "THEME-0001"


def run_tests() -> None:
    test_same_signal_family_same_theme_slug()
    test_upsert_stable_theme_ids()
    test_upsert_theme_by_slug()
    print("ok: test_assign_research_themes passed")


if __name__ == "__main__":
    run_tests()
