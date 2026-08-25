#!/usr/bin/env python3
"""Assign FIND records to coarse Research Themes (Phase C).

Deterministic v1: theme slug from signal family (not per-FIND). Parses
clusterKey ``sig|asset|bucket|side``, upserts THEME records in registry,
sets finding.body.themeId, and writes data/research-themes.json summary.
"""
from __future__ import annotations

import argparse
import json
import re
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
    assign_finding_theme,
    default_registry_path,
    load_registry,
    upsert_theme,
    validate_registry,
    write_registry,
)

DEFAULT_REGISTRY = default_registry_path()
DEFAULT_OUT = REPO / "data" / "research-themes.json"
ASSIGNMENT_VERSION = "research_theme_v1"
SOURCE = "assign_research_themes_v1"

THEME_TITLES: dict[str, str] = {
    "heatmap_one_touch": "Heatmap one-touch / no-bias / relative-value shadows",
    "weekend_hl_funding": "Weekend Hyperliquid funding reversion shadows",
    "funding_extreme": "Extreme funding signal shadows",
    "outcome_panel": "Outcome-panel mined (unconditioned contract history)",
    "spot_panel": "Spot-panel mined (asset-day forward spot returns)",
}


def slugify_signal(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return slug[:80] or "unknown"


def parse_cluster_key(cluster_key: str) -> tuple[str, str, str, str]:
    parts = cluster_key.split("|")
    if len(parts) != 4:
        raise ValueError(f"invalid clusterKey (expected sig|asset|bucket|side): {cluster_key}")
    return parts[0], parts[1], parts[2], parts[3]


def theme_slug_for_signal(signal_type: str) -> tuple[str, str]:
    """Return (theme_slug, family) for a signal type."""
    sig = signal_type.upper()
    if sig.startswith("SPOTPANEL_"):
        return "spot_panel", "spot_panel"
    if sig.startswith("PANEL_"):
        return "outcome_panel", "outcome_panel"
    if any(token in sig for token in ("ONE_TOUCH", "NO_BIAS", "RELATIVE_VALUE")):
        return "heatmap_one_touch", "heatmap_one_touch"
    if "WEEKEND_HL_FUNDING" in sig:
        return "weekend_hl_funding", "weekend_hl_funding"
    if "FUNDING_EXTREME" in sig:
        return "funding_extreme", "funding_extreme"
    signal_slug = slugify_signal(signal_type)
    return f"other_{signal_slug}", signal_slug


def theme_title(slug: str, family: str) -> str:
    if slug in THEME_TITLES:
        return THEME_TITLES[slug]
    return f"Other signal family: {family}"


def iter_findings(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [r for r in data.get("records", []) if r.get("type") == "finding"]


def rebuild_theme_finding_links(data: dict[str, Any]) -> None:
    """Sync each theme.links.findings from finding.body.themeId."""
    theme_findings: dict[str, list[str]] = {}
    for record in iter_findings(data):
        theme_id = (record.get("body") or {}).get("themeId")
        if isinstance(theme_id, str):
            theme_findings.setdefault(theme_id, []).append(record["id"])

    for record in data.get("records", []):
        if record.get("type") != "theme":
            continue
        finding_ids = sorted(theme_findings.get(record["id"], []))
        links = record.setdefault("links", {})
        links["findings"] = finding_ids


def build_themes_summary(
    data: dict[str, Any],
    generated_at: str,
) -> dict[str, Any]:
    themes_out: list[dict[str, Any]] = []
    findings_by_theme: dict[str, list[dict[str, Any]]] = {}

    for finding in iter_findings(data):
        theme_id = (finding.get("body") or {}).get("themeId")
        if isinstance(theme_id, str):
            findings_by_theme.setdefault(theme_id, []).append(finding)

    for record in data.get("records", []):
        if record.get("type") != "theme":
            continue
        body = record.get("body") or {}
        linked = findings_by_theme.get(record["id"], [])
        opp_scores = [
            float((f.get("body") or {}).get("opportunityScore") or 0.0)
            for f in linked
        ]
        avg_opp = round(sum(opp_scores) / len(opp_scores), 4) if opp_scores else None
        themes_out.append(
            {
                "id": record["id"],
                "slug": body.get("slug"),
                "family": body.get("family"),
                "title": record.get("title"),
                "status": record.get("status"),
                "findingIds": [f["id"] for f in linked],
                "findingCount": len(linked),
                "avgOpportunityScore": avg_opp,
            }
        )

    themes_out.sort(key=lambda row: (-(row["findingCount"] or 0), row["slug"] or ""))
    return {
        "generatedAt": generated_at,
        "assignmentVersion": ASSIGNMENT_VERSION,
        "themeCount": len(themes_out),
        "themes": themes_out,
    }


def assign_research_themes(
    registry_path: Path = DEFAULT_REGISTRY,
    out_path: Path = DEFAULT_OUT,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = load_registry(registry_path)
    assigned = 0
    slug_to_theme_id: dict[str, str] = {}

    for finding in iter_findings(data):
        body = finding.get("body") or {}
        cluster_key = body.get("clusterKey")
        if not isinstance(cluster_key, str):
            continue
        signal_type = body.get("signalType")
        if not isinstance(signal_type, str):
            try:
                signal_type, _, _, _ = parse_cluster_key(cluster_key)
            except ValueError:
                continue

        slug, family = theme_slug_for_signal(signal_type)
        title = theme_title(slug, family)

        if dry_run:
            print(f"[dry-run] {finding['id']} -> {slug} ({signal_type})")
            assigned += 1
            continue

        if slug not in slug_to_theme_id:
            theme = upsert_theme(
                registry_path,
                slug,
                title,
                body_extra={"family": family},
                source=SOURCE,
            )
            slug_to_theme_id[slug] = theme["id"]

        assign_finding_theme(registry_path, finding["id"], slug_to_theme_id[slug])
        assigned += 1

    if dry_run:
        return {"assigned": assigned, "themeCount": len(slug_to_theme_id), "payload": {}}

    data = load_registry(registry_path)
    rebuild_theme_finding_links(data)
    errors = validate_registry(data)
    if errors:
        raise ValueError("; ".join(errors))
    data["version"] = REGISTRY_VERSION
    write_registry(registry_path, data)

    payload = build_themes_summary(data, generated_at)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n")

    return {
        "assigned": assigned,
        "themeCount": payload["themeCount"],
        "payload": payload,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    result = assign_research_themes(
        registry_path=args.registry,
        out_path=args.out,
        dry_run=args.dry_run,
    )
    print(
        f"assigned {result['assigned']} finding(s) to "
        f"{result['themeCount']} theme(s)"
    )
    payload = result.get("payload") or {}
    for theme in payload.get("themes", []):
        avg = theme.get("avgOpportunityScore")
        avg_s = f"{avg:.4f}" if avg is not None else "n/a"
        print(
            f"  {theme['id']} {theme['slug']}: "
            f"findings={theme['findingCount']} avgOpp={avg_s}"
        )
    if not args.dry_run and payload:
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
