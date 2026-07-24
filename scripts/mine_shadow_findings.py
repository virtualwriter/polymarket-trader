#!/usr/bin/env python3
"""Mine blocked-signal shadow clusters into permanent FIND registry records.

Reads blocked-signals.json, clusters learnable resolved shadows, upserts FIND
records in data/registry.json (keyed by clusterKey), and exports
data/research-findings.json. Does not write hypotheses.json or shadow-mined
hypotheses artifacts.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lib.shadow_mine_common import (  # noqa: E402
    MIN_N_HEATMAP,
    MIN_N_OTHER,
    MIN_WR,
    build_cluster_maps,
    input_window_from_rows,
    iter_cluster_candidates,
)
from registry import default_registry_path, load_registry, upsert_finding  # noqa: E402
from score_research_findings import score_research_findings  # noqa: E402
from assign_research_themes import assign_research_themes  # noqa: E402

DEFAULT_BLOCKED = REPO / "data" / "blocked-signals.json"
DEFAULT_REGISTRY = default_registry_path()
DEFAULT_OUT = REPO / "data" / "research-findings.json"
MODEL = "shadow_miner_v1"
FEATURE_SET = "blocked_signal_shadow_v1"


def git_sha_short() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO,
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return out.strip() or "unknown"
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return "unknown"


def build_provenance(
    blocked_path: Path,
    rows: list[dict],
    min_wr: float,
    git_sha: str,
) -> dict:
    cmd = (
        "python3 scripts/mine_shadow_findings.py "
        f"--blocked {blocked_path} --registry data/registry.json "
        f"--out data/research-findings.json --min-wr {min_wr}"
    )
    return {
        "generatedBy": MODEL,
        "inputWindow": input_window_from_rows(rows),
        "featureSet": FEATURE_SET,
        "scoringVersion": "shadow_cluster_v1",
        "gitSha": git_sha,
        "inputArtifacts": [str(blocked_path)],
        "filters": {
            "minWr": min_wr,
            "minNHeatmap": MIN_N_HEATMAP,
            "minNOther": MIN_N_OTHER,
            "excludeLearningExcluded": True,
            "resolvedOnly": True,
        },
        "reproducibleCommand": cmd,
    }


def finding_title(candidate: dict) -> str:
    ev = candidate["evidence"]
    return (
        f"Shadow FIND: {candidate['sig']} on {candidate['asset']} "
        f"({candidate['bucket']}/{candidate['side']}): "
        f"WR={ev['winRate']:.0%} n={ev['n']} sumPnl={ev['sumPnl']:+.3f}"
    )


def mine_findings(
    blocked_path: Path,
    registry_path: Path,
    out_path: Path,
    min_wr: float,
    max_findings: int,
    dry_run: bool,
) -> dict:
    shadows = json.loads(blocked_path.read_text())
    fine, coarse, strata = build_cluster_maps(shadows)
    candidates = iter_cluster_candidates(fine, coarse, min_wr, strata)[:max_findings]
    git_sha = git_sha_short()
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    created = 0
    updated = 0
    export_rows: list[dict] = []

    for candidate in candidates:
        cluster_key = candidate["clusterKey"]
        body = {
            "clusterKey": cluster_key,
            "asset": candidate["asset"],
            "signalType": candidate["sig"],
            "side": candidate["side"],
            "bucket": candidate["bucket"],
            "evidence": candidate["evidence"],
            "mineStats": candidate["mineStats"],
            "sampleShadowIds": candidate["mineStats"]["sampleIds"],
            "provenance": build_provenance(
                blocked_path, candidate["rows"], min_wr, git_sha
            ),
        }
        title = finding_title(candidate)

        if dry_run:
            print(f"[dry-run] {cluster_key}: {title}")
            export_rows.append(
                {
                    "id": f"FIND-dry-{len(export_rows) + 1:04d}",
                    "clusterKey": cluster_key,
                    "status": "open",
                    "evidence": body["evidence"],
                    "provenance": body["provenance"],
                }
            )
            continue

        before = load_registry(registry_path)
        before_ids = {
            r.get("body", {}).get("clusterKey"): r.get("id")
            for r in before.get("records", [])
            if r.get("type") == "finding"
        }
        record = upsert_finding(
            registry_path,
            body,
            title,
            source=MODEL,
        )
        if before_ids.get(cluster_key):
            updated += 1
        else:
            created += 1
        export_rows.append(
            {
                "id": record["id"],
                "clusterKey": cluster_key,
                "status": record["status"],
                "evidence": record["body"]["evidence"],
                "provenance": record["body"]["provenance"],
            }
        )

    payload = {
        "generatedAt": generated_at,
        "model": MODEL,
        "findings": export_rows,
    }

    if not dry_run:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2) + "\n")

    return {
        "payload": payload,
        "created": created,
        "updated": updated,
        "total": len(candidates),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--blocked", type=Path, default=DEFAULT_BLOCKED)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--min-wr", type=float, default=MIN_WR)
    ap.add_argument("--max-findings", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-score", action="store_true", help="Skip Phase B scoring")
    ap.add_argument("--no-themes", action="store_true", help="Skip Phase C theme assignment")
    args = ap.parse_args()

    result = mine_findings(
        args.blocked,
        args.registry,
        args.out,
        args.min_wr,
        args.max_findings,
        args.dry_run,
    )
    print(
        f"mined {result['total']} finding(s): "
        f"created={result['created']} updated={result['updated']} "
        f"@ {result['payload']['generatedAt']}"
    )
    for row in result["payload"]["findings"]:
        ev = row["evidence"]
        p = ev.get("pValue")
        print(
            f"  {row['id']} {row['clusterKey']}: "
            f"status={row['status']} n={ev['n']} wr={ev['winRate']:.2f} "
            f"sum={ev['sumPnl']:+.3f}"
            + (f" p={p:.4f}" if p is not None else "")
        )
    if not args.dry_run:
        print(f"wrote {args.out}")

    if not args.dry_run and not args.no_score:
        score_result = score_research_findings(
            registry_path=args.registry,
            top_n=10,
        )
        print(
            f"scored {score_result['scoredCount']} finding(s), "
            f"top {score_result['opportunityCount']} opportunit(ies)"
        )

    if not args.dry_run and not args.no_themes and not args.no_score:
        theme_result = assign_research_themes(registry_path=args.registry)
        print(
            f"themed {theme_result['assigned']} finding(s) into "
            f"{theme_result['themeCount']} theme(s)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
