#!/usr/bin/env python3
"""Unit-style tests for nightly research report builder (Phase E)."""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from build_nightly_research_report import (  # noqa: E402
    build_report,
    render_markdown,
    write_report,
)
from registry import upsert_finding, validate_registry  # noqa: E402

FIXED_NOW = datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc)


def _sample_registry() -> dict:
    return {
        "version": 1,
        "records": [
            {
                "id": "FIND-0001",
                "type": "finding",
                "evidenceClass": "DERIVED",
                "status": "open",
                "title": "Open finding",
                "body": {
                    "clusterKey": "SIG|GOLD|heatmap|no",
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
                    "themeId": "THEME-0001",
                },
            },
            {
                "id": "FIND-0002",
                "type": "finding",
                "evidenceClass": "DERIVED",
                "status": "negative",
                "title": "Negative finding",
                "body": {
                    "clusterKey": "BAD|OIL|edge|long",
                    "evidence": {"n": 5, "winRate": 0.2, "sumPnl": -0.5},
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
            },
        ],
    }


def test_build_report_with_fixtures() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        registry_path = root / "registry.json"
        registry_path.write_text(json.dumps(_sample_registry()))

        opportunities = {
            "generatedAt": "2026-07-18T03:00:00Z",
            "scoringVersion": "research_score_v1",
            "topN": 5,
            "opportunities": [
                {
                    "rank": 1,
                    "id": "FIND-0001",
                    "clusterKey": "SIG|GOLD|heatmap|no",
                    "opportunityScore": 0.81,
                    "confidenceScore": 0.42,
                    "status": "open",
                }
            ],
        }
        themes = {
            "generatedAt": "2026-07-18T03:00:00Z",
            "assignmentVersion": "research_theme_v1",
            "themeCount": 1,
            "themes": [
                {
                    "id": "THEME-0001",
                    "slug": "heatmap_one_touch",
                    "title": "Heatmap shadows",
                    "findingIds": ["FIND-0001"],
                    "findingCount": 1,
                    "avgOpportunityScore": 0.81,
                }
            ],
        }
        findings = {
            "generatedAt": "2026-07-18T03:00:00Z",
            "model": "shadow_miner_v1",
            "findings": [],
        }
        advice = {
            "generatedAt": "2026-07-18T03:05:00Z",
            "newHypotheses": [
                {
                    "originFindingId": "FIND-0001",
                    "themeId": "THEME-0001",
                    "description": "Test authored hypothesis from ranked FIND.",
                }
            ],
        }

        opp_path = root / "opportunities.json"
        themes_path = root / "themes.json"
        findings_path = root / "findings.json"
        advice_path = root / "advice.json"
        opp_path.write_text(json.dumps(opportunities))
        themes_path.write_text(json.dumps(themes))
        findings_path.write_text(json.dumps(findings))
        advice_path.write_text(json.dumps(advice))

        payload = build_report(
            registry_path=registry_path,
            opportunities_path=opp_path,
            themes_path=themes_path,
            findings_path=findings_path,
            advice_path=advice_path,
            now=FIXED_NOW,
        )

        assert payload["summary"]["findingCounts"]["open"] == 1
        assert payload["summary"]["findingCounts"]["negative"] == 1
        assert payload["summary"]["themeCount"] == 1
        assert payload["topOpportunities"][0]["themeSlug"] == "heatmap_one_touch"
        assert len(payload["authoredHypotheses"]) == 1
        assert payload["negativeFindings"][0]["id"] == "FIND-0002"
        assert payload["provenance"]["scoringVersion"] == "research_score_v1"
        assert payload["provenance"]["minerModel"] == "shadow_miner_v1"

        md = render_markdown(payload)
        assert "## 1. Summary" in md
        assert "FIND-0001" in md
        assert "FIND-0002" in md
        assert "Test authored hypothesis" in md

        out_md = root / "report.md"
        out_json = root / "report.json"
        write_report(payload, out_md, out_json)
        assert out_md.exists()
        assert out_json.exists()
        saved = json.loads(out_json.read_text())
        assert "markdown" not in saved


def test_missing_advice_still_succeeds() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        registry_path = root / "registry.json"
        registry_path.write_text(json.dumps({"version": 1, "records": []}))

        payload = build_report(
            registry_path=registry_path,
            opportunities_path=root / "missing-opportunities.json",
            themes_path=root / "missing-themes.json",
            findings_path=root / "missing-findings.json",
            advice_path=root / "missing-advice.json",
            now=FIXED_NOW,
        )

        assert payload["summary"]["advicePresent"] is False
        md = render_markdown(payload)
        assert "Nightly LLM advice not yet available" in md


def test_telegram_snippet_under_limit() -> None:
    from daily_trader_email_report import nightly_research_loop_lines  # noqa: E402

    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        report_json = {
            "generatedAt": "2026-07-18T12:00:00Z",
            "summary": {
                "themeCount": 2,
                "authoredHypothesisCount": 1,
                "advicePresent": True,
            },
            "topOpportunities": [
                {
                    "rank": i + 1,
                    "id": f"FIND-{i + 1:04d}",
                    "opportunityScore": 0.9 - i * 0.05,
                    "clusterKey": f"VERY_LONG_SIGNAL_NAME|ASSET{i}|bucket|side",
                }
                for i in range(10)
            ],
            "themesOverview": [
                {"slug": "heatmap_one_touch", "findingCount": 3},
                {"slug": "weekend_hl_funding", "findingCount": 14},
            ],
        }
        report_path = root / "nightly-research-report.json"
        report_path.write_text(json.dumps(report_json))

        lines = nightly_research_loop_lines(report_path)
        section = "\n".join(lines)
        assert len(section) <= 1200, f"telegram section too long: {len(section)} chars"
        assert "FIND-0001" in section


def main() -> int:
    test_build_report_with_fixtures()
    test_missing_advice_still_succeeds()
    test_telegram_snippet_under_limit()
    print("all build_nightly_research_report tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
