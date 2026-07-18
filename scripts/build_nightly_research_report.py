#!/usr/bin/env python3
"""Build evidence-first nightly research report (Phase E).

Aggregates registry FIND records, ranked opportunities, themes, and optional
nightly LLM advice into data/nightly-research-report.md + .json.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import default_registry_path, load_registry  # noqa: E402

DEFAULT_REGISTRY = default_registry_path()
DEFAULT_OPPORTUNITIES = REPO / "data" / "research-opportunities.json"
DEFAULT_THEMES = REPO / "data" / "research-themes.json"
DEFAULT_FINDINGS = REPO / "data" / "research-findings.json"
DEFAULT_ADVICE = REPO / "data" / "nightly-llm-advice.json"
DEFAULT_OUT_MD = REPO / "data" / "nightly-research-report.md"
DEFAULT_OUT_JSON = REPO / "data" / "nightly-research-report.json"


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open() as fh:
        return json.load(fh)


def _short_cluster(cluster_key: str | None, max_len: int = 48) -> str:
    if not cluster_key:
        return "—"
    if len(cluster_key) <= max_len:
        return cluster_key
    return cluster_key[: max_len - 1] + "…"


def _truncate(text: str, max_len: int) -> str:
    text = " ".join(text.split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def _finding_status_counts(registry: dict[str, Any]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for record in registry.get("records", []):
        if record.get("type") != "finding":
            continue
        counts[record.get("status") or "unknown"] += 1
    return counts


def _theme_by_finding(themes_payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    mapping: dict[str, dict[str, Any]] = {}
    for theme in themes_payload.get("themes") or []:
        if not isinstance(theme, dict):
            continue
        for fid in theme.get("findingIds") or []:
            mapping[str(fid)] = theme
    return mapping


def _authored_hypotheses(advice: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not advice:
        return []
    rows: list[dict[str, Any]] = []
    for hyp in advice.get("newHypotheses") or []:
        if not isinstance(hyp, dict):
            continue
        rows.append(
            {
                "originFindingId": hyp.get("originFindingId"),
                "themeId": hyp.get("themeId"),
                "description": hyp.get("description") or "",
            }
        )
    return rows


def _negative_findings(registry: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in registry.get("records", []):
        if record.get("type") != "finding":
            continue
        status = record.get("status")
        if status not in ("negative", "suppressed"):
            continue
        body = record.get("body") or {}
        rows.append(
            {
                "id": record.get("id"),
                "status": status,
                "clusterKey": body.get("clusterKey"),
                "title": record.get("title"),
            }
        )
    rows.sort(key=lambda r: str(r.get("id") or ""))
    return rows


def _miner_model(findings_export: dict[str, Any]) -> str | None:
    model = findings_export.get("model")
    if isinstance(model, str) and model:
        return model
    for row in findings_export.get("findings") or []:
        prov = (row.get("provenance") or {}) if isinstance(row, dict) else {}
        generated_by = prov.get("generatedBy")
        if isinstance(generated_by, str) and generated_by:
            return generated_by
    return None


def build_report(
    *,
    registry_path: Path = DEFAULT_REGISTRY,
    opportunities_path: Path = DEFAULT_OPPORTUNITIES,
    themes_path: Path = DEFAULT_THEMES,
    findings_path: Path = DEFAULT_FINDINGS,
    advice_path: Path = DEFAULT_ADVICE,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    generated_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    registry = load_registry(registry_path)
    opportunities_payload = _read_json(opportunities_path, {})
    themes_payload = _read_json(themes_path, {})
    findings_export = _read_json(findings_path, {})
    advice = _read_json(advice_path, None)

    status_counts = _finding_status_counts(registry)
    theme_by_finding = _theme_by_finding(themes_payload if isinstance(themes_payload, dict) else {})
    opportunities = list((opportunities_payload or {}).get("opportunities") or [])

    top_opportunities: list[dict[str, Any]] = []
    for row in opportunities:
        if not isinstance(row, dict):
            continue
        fid = row.get("id")
        theme = theme_by_finding.get(str(fid)) if fid else None
        top_opportunities.append(
            {
                "rank": row.get("rank"),
                "id": fid,
                "opportunityScore": row.get("opportunityScore"),
                "confidenceScore": row.get("confidenceScore"),
                "clusterKey": row.get("clusterKey"),
                "themeId": theme.get("id") if theme else None,
                "themeSlug": theme.get("slug") if theme else None,
                "status": row.get("status"),
            }
        )

    themes_overview = []
    for theme in (themes_payload or {}).get("themes") or []:
        if not isinstance(theme, dict):
            continue
        themes_overview.append(
            {
                "id": theme.get("id"),
                "slug": theme.get("slug"),
                "title": theme.get("title"),
                "findingCount": theme.get("findingCount"),
                "avgOpportunityScore": theme.get("avgOpportunityScore"),
            }
        )

    authored = _authored_hypotheses(advice if isinstance(advice, dict) else None)
    negative = _negative_findings(registry)

    top_opp = top_opportunities[0] if top_opportunities else None
    summary = {
        "generatedAt": generated_at,
        "findingCounts": {
            "open": status_counts.get("open", 0),
            "strengthened": status_counts.get("strengthened", 0),
            "weakened": status_counts.get("weakened", 0),
            "negative": status_counts.get("negative", 0),
            "suppressed": status_counts.get("suppressed", 0),
            "total": sum(status_counts.values()),
        },
        "themeCount": len(themes_overview),
        "topOpportunity": top_opp,
        "authoredHypothesisCount": len(authored),
        "advicePresent": isinstance(advice, dict),
    }

    provenance = {
        "scoringVersion": (opportunities_payload or {}).get("scoringVersion"),
        "minerModel": _miner_model(findings_export if isinstance(findings_export, dict) else {}),
        "findingsExportGeneratedAt": (findings_export or {}).get("generatedAt")
        if isinstance(findings_export, dict)
        else None,
        "opportunitiesGeneratedAt": (opportunities_payload or {}).get("generatedAt")
        if isinstance(opportunities_payload, dict)
        else None,
        "themesGeneratedAt": (themes_payload or {}).get("generatedAt")
        if isinstance(themes_payload, dict)
        else None,
        "adviceGeneratedAt": (advice or {}).get("generatedAt") if isinstance(advice, dict) else None,
    }

    payload = {
        "generatedAt": generated_at,
        "summary": summary,
        "topOpportunities": top_opportunities,
        "themesOverview": themes_overview,
        "authoredHypotheses": authored,
        "negativeFindings": negative,
        "provenance": provenance,
    }
    payload["markdown"] = render_markdown(payload)
    return payload


def render_markdown(payload: dict[str, Any]) -> str:
    summary = payload.get("summary") or {}
    counts = summary.get("findingCounts") or {}
    lines: list[str] = [
        "# Nightly Research Report",
        "",
        f"_Generated {payload.get('generatedAt', '—')}_",
        "",
        "## 1. Summary",
        f"- FIND records: {counts.get('total', 0)} total "
        f"(open {counts.get('open', 0)}, strengthened {counts.get('strengthened', 0)}, "
        f"weakened {counts.get('weakened', 0)}, negative {counts.get('negative', 0)})",
        f"- Research themes: {summary.get('themeCount', 0)}",
    ]

    top = summary.get("topOpportunity")
    if top:
        lines.append(
            f"- Top opportunity: #{top.get('rank')} {top.get('id')} "
            f"opp={top.get('opportunityScore')} conf={top.get('confidenceScore')} "
            f"({_short_cluster(top.get('clusterKey'))})"
        )
    else:
        lines.append("- Top opportunity: none ranked")

    lines.extend(["", "## 2. Top opportunities"])
    top_opps = payload.get("topOpportunities") or []
    if top_opps:
        for row in top_opps:
            theme_note = row.get("themeSlug") or row.get("themeId") or "—"
            lines.append(
                f"- #{row.get('rank')} **{row.get('id')}** "
                f"opp={row.get('opportunityScore')} conf={row.get('confidenceScore')} "
                f"| `{_short_cluster(row.get('clusterKey'), 64)}` | theme {theme_note}"
            )
    else:
        lines.append("- No ranked opportunities.")

    lines.extend(["", "## 3. Themes overview"])
    themes = payload.get("themesOverview") or []
    if themes:
        for theme in themes:
            lines.append(
                f"- **{theme.get('id')}** ({theme.get('slug')}): "
                f"{theme.get('findingCount', 0)} findings, "
                f"avg opp {theme.get('avgOpportunityScore')}"
            )
    else:
        lines.append("- No themes assigned.")

    lines.extend(["", "## 4. Newly authored hypotheses"])
    if not summary.get("advicePresent"):
        lines.append("- Nightly LLM advice not yet available (`data/nightly-llm-advice.json` missing).")
    else:
        authored = payload.get("authoredHypotheses") or []
        if not authored:
            lines.append("- Advice present but no `newHypotheses` entries.")
        else:
            for hyp in authored:
                origin = hyp.get("originFindingId") or "—"
                theme_id = hyp.get("themeId") or "—"
                desc = _truncate(str(hyp.get("description") or ""), 240)
                lines.append(f"- `{origin}` / {theme_id}: {desc}")

    lines.extend(["", "## 5. Negative / suppressed findings"])
    negative = payload.get("negativeFindings") or []
    if negative:
        for row in negative:
            lines.append(
                f"- **{row.get('id')}** ({row.get('status')}): "
                f"`{_short_cluster(row.get('clusterKey'), 64)}`"
            )
    else:
        lines.append("- None.")

    prov = payload.get("provenance") or {}
    lines.extend(
        [
            "",
            "## 6. Provenance",
            f"- Scoring version: {prov.get('scoringVersion') or '—'}",
            f"- Miner model: {prov.get('minerModel') or '—'}",
            f"- Opportunities export: {prov.get('opportunitiesGeneratedAt') or '—'}",
            f"- Findings export: {prov.get('findingsExportGeneratedAt') or '—'}",
            f"- Themes export: {prov.get('themesGeneratedAt') or '—'}",
            f"- LLM advice: {prov.get('adviceGeneratedAt') or '—'}",
        ]
    )
    return "\n".join(lines) + "\n"


def write_report(payload: dict[str, Any], out_md: Path, out_json: Path) -> None:
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(payload["markdown"])
    json_payload = {k: v for k, v in payload.items() if k != "markdown"}
    out_json.write_text(json.dumps(json_payload, indent=2) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--opportunities", type=Path, default=DEFAULT_OPPORTUNITIES)
    ap.add_argument("--themes", type=Path, default=DEFAULT_THEMES)
    ap.add_argument("--findings", type=Path, default=DEFAULT_FINDINGS)
    ap.add_argument("--advice", type=Path, default=DEFAULT_ADVICE)
    ap.add_argument("--out-md", type=Path, default=DEFAULT_OUT_MD)
    ap.add_argument("--out-json", type=Path, default=DEFAULT_OUT_JSON)
    args = ap.parse_args()

    payload = build_report(
        registry_path=args.registry,
        opportunities_path=args.opportunities,
        themes_path=args.themes,
        findings_path=args.findings,
        advice_path=args.advice,
    )
    write_report(payload, args.out_md, args.out_json)

    summary = payload["summary"]
    counts = summary["findingCounts"]
    print(
        f"wrote {args.out_md} and {args.out_json}: "
        f"{counts['total']} findings, {summary['themeCount']} themes, "
        f"{len(payload['topOpportunities'])} opportunities, "
        f"{summary['authoredHypothesisCount']} authored hyps"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
