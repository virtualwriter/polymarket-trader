#!/usr/bin/env python3
"""Mine the outcome panel (data/research-panel.csv) into FIND records.

Statistics discipline, extending the shadow miner's:
  1. one-sided Student-t on per-row P&L (the alpha claim) — discovery split
  2. exact binomial on win rate vs the pool's own empirical base rate
     (never a 50% coin flip: a NO at 80c wins 80% of the time with no edge)
  3. Benjamini-Hochberg q-values across ALL strata tested in the run
  4. temporal holdout: the last ~30% of panel days are never mined; a
     candidate must independently show positive mean P&L there.

Only candidates whose conditions translate fully into engine-evaluable
catalog keys are registered as FINDs (so the nightly LLM can author testable
hypotheses from them verbatim). Significant-but-unexpressible patterns are
written to the mine report as coverage gaps instead.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import csv  # noqa: E402

from lib.alpha_stats import binomial_p_value, bh_qvalues, one_sided_t_pvalue  # noqa: E402
from lib.panel_common import (  # noqa: E402
    MINEABLE_QUALITIES,
    PANEL_PAIR_STRATIFICATIONS,
    PANEL_VERSION,
    dedupe_non_overlapping,
    fnum,
    panel_features,
)
from registry import default_registry_path, load_registry, upsert_finding  # noqa: E402
from score_research_findings import score_research_findings  # noqa: E402
from assign_research_themes import assign_research_themes  # noqa: E402

DEFAULT_PANEL = REPO / "data" / "research-panel.csv"
DEFAULT_REGISTRY = default_registry_path()
DEFAULT_REPORT = REPO / "data" / "panel-mine-report.json"
MODEL = "panel_miner_v1"
FEATURE_SET = "outcome_panel_v1"
SCORING_VERSION = "panel_mine_v1"

SIDES = ("no", "yes")
HORIZONS = (3, 7)
HOLDOUT_FRACTION = 0.30
MIN_N_DISCOVERY = 30
MIN_N_HOLDOUT = 10
MAX_Q_VALUE = 0.10
# Pools smaller than this fall back to the ALL-assets base rate.
MIN_POOL_FOR_BASE_RATE = 60


def load_panel(path: Path) -> list[dict[str, Any]]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def git_sha_short() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO, text=True, stderr=subprocess.DEVNULL,
        )
        return out.strip() or "unknown"
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return "unknown"


def split_days(days: list[str], holdout_fraction: float) -> tuple[set[str], set[str]]:
    """Temporal split: earliest days are discovery, the most recent holdout."""
    unique = sorted(set(days))
    if len(unique) < 4:
        return set(unique), set()
    cut = max(1, int(round(len(unique) * (1.0 - holdout_fraction))))
    cut = min(cut, len(unique) - 1)
    return set(unique[:cut]), set(unique[cut:])


def stats_for(pnls: list[float], wins: int, base_rate: float) -> dict[str, Any]:
    n = len(pnls)
    if n == 0:
        return {"n": 0}
    mean = sum(pnls) / n
    var = sum((x - mean) ** 2 for x in pnls) / (n - 1) if n > 1 else 0.0
    std = math.sqrt(var)
    return {
        "n": n,
        "wins": wins,
        "winRate": round(wins / n, 4),
        "meanPnlPct": round(mean, 4),
        "stdPnlPct": round(std, 4),
        "sumPnlPct": round(sum(pnls), 4),
        "tPValue": round(one_sided_t_pvalue(mean, std, n), 6) if n >= 2 else None,
        "binomPValue": round(binomial_p_value(wins, n, base_rate), 6),
        "baseRate": round(base_rate, 4),
    }


def conditions_for_bucket_parts(
    feature_by_name: dict[str, Any], parts: list[tuple[str, str]]
) -> tuple[dict[str, Any] | None, bool]:
    """Merge per-feature condition fragments. covered=False if any feature
    lacks a catalog mapping for its bucket."""
    merged: dict[str, Any] = {}
    covered = True
    for feature_name, bucket in parts:
        feature = feature_by_name[feature_name]
        fragment = feature.condition_for_bucket(bucket)
        if fragment is None:
            covered = False
            continue
        merged.update(fragment)
    return (merged or None), covered


def render_condition(conditions: dict[str, Any] | None) -> str:
    """Conditions are stored in the engine's own expression grammar, so the
    rendered title doubles as copy-paste-ready hypothesis conditions."""
    if not conditions:
        return "(panel-only features; no catalog mapping)"
    return " AND ".join(f"{key} {expr}" for key, expr in conditions.items())


def mine_panel(
    panel_rows: list[dict[str, Any]],
    max_findings: int,
) -> dict[str, Any]:
    features = panel_features()
    feature_by_name = {f.name: f for f in features}

    tested: list[dict[str, Any]] = []
    seen_row_sets: set[frozenset] = set()

    for horizon in HORIZONS:
        pnl_col = {"no": f"no_pnl_pct_{horizon}d", "yes": f"yes_pnl_pct_{horizon}d"}
        quality_col = f"outcome_quality_{horizon}d"

        usable = [
            r for r in panel_rows
            if str(r.get(quality_col)) in MINEABLE_QUALITIES
        ]
        usable = dedupe_non_overlapping(usable, horizon)
        if not usable:
            continue

        discovery_days, holdout_days = split_days(
            [str(r.get("entry_date")) for r in usable], HOLDOUT_FRACTION
        )

        for side in SIDES:
            col = pnl_col[side]
            rows = [
                (r, fnum(r.get(col)))
                for r in usable
                if fnum(r.get(col)) is not None
            ]
            if not rows:
                continue

            disc_all = [(r, p) for r, p in rows if str(r.get("entry_date")) in discovery_days]
            hold_all = [(r, p) for r, p in rows if str(r.get("entry_date")) in holdout_days]

            # Empirical base rates from the discovery pool only.
            base_by_asset: dict[str, float] = {}
            pool_by_asset: dict[str, list[float]] = defaultdict(list)
            for r, p in disc_all:
                pool_by_asset[str(r.get("asset"))].append(p)
                pool_by_asset["ALL"].append(p)
            for asset, pnls in pool_by_asset.items():
                if len(pnls) >= MIN_POOL_FOR_BASE_RATE or asset == "ALL":
                    base_by_asset[asset] = sum(1 for p in pnls if p > 0) / len(pnls)
            all_base = base_by_asset.get("ALL", 0.5)

            # Build strata: single features + curated pairs, per-asset + ALL.
            strat_specs: list[tuple[tuple[str, ...], str]] = []
            for f in features:
                strat_specs.append(((f.name,), f.name))
            for pair in PANEL_PAIR_STRATIFICATIONS:
                strat_specs.append((pair, "+".join(pair)))

            for dims, _label in strat_specs:
                disc_cells: dict[tuple[str, str], list[tuple[dict, float]]] = defaultdict(list)
                hold_cells: dict[tuple[str, str], list[tuple[dict, float]]] = defaultdict(list)
                for target, cells in ((disc_all, disc_cells), (hold_all, hold_cells)):
                    for r, p in target:
                        parts = []
                        ok = True
                        for dim in dims:
                            bucket = feature_by_name[dim].bucket(r)
                            if bucket is None:
                                ok = False
                                break
                            parts.append(bucket)
                        if not ok:
                            continue
                        bucket_label = ",".join(parts)
                        asset = str(r.get("asset"))
                        cells[(asset, bucket_label)].append((r, p))
                        cells[("ALL", bucket_label)].append((r, p))

                for (asset, bucket_label), cell_rows in disc_cells.items():
                    if len(cell_rows) < MIN_N_DISCOVERY:
                        continue
                    row_ids = frozenset(
                        f"{r.get('market_id')}@{r.get('entry_date')}" for r, _ in cell_rows
                    )
                    dedupe_key = (side, horizon, row_ids)
                    if dedupe_key in seen_row_sets:
                        continue
                    seen_row_sets.add(dedupe_key)

                    base = base_by_asset.get(asset, all_base)
                    disc_pnls = [p for _, p in cell_rows]
                    disc_wins = sum(1 for p in disc_pnls if p > 0)
                    disc = stats_for(disc_pnls, disc_wins, base)

                    hold_rows = hold_cells.get((asset, bucket_label), [])
                    hold_pnls = [p for _, p in hold_rows]
                    hold_wins = sum(1 for p in hold_pnls if p > 0)
                    hold = stats_for(hold_pnls, hold_wins, base)

                    parts = list(zip(dims, bucket_label.split(",")))
                    conditions, covered = conditions_for_bucket_parts(feature_by_name, parts)

                    tested.append({
                        "side": side,
                        "horizon": horizon,
                        "asset": asset,
                        "bucket": bucket_label,
                        "dims": list(dims),
                        "discovery": disc,
                        "holdout": hold,
                        "conditions": conditions,
                        "catalogCovered": covered,
                        "sampleIds": sorted(row_ids)[:5],
                        "inputWindow": {
                            "start": min(str(r.get("entry_date")) for r, _ in cell_rows),
                            "end": max(str(r.get("entry_date")) for r, _ in cell_rows),
                        },
                    })

    # BH across the FULL family of tests this run.
    p_values = [
        item["discovery"].get("tPValue")
        if item["discovery"].get("tPValue") is not None
        else item["discovery"].get("binomPValue", 1.0)
        for item in tested
    ]
    for item, q in zip(tested, bh_qvalues([p if p is not None else 1.0 for p in p_values])):
        item["qValue"] = round(q, 6)

    candidates = [
        item for item in tested
        if item["qValue"] <= MAX_Q_VALUE
        and item["discovery"]["n"] >= MIN_N_DISCOVERY
        and item["holdout"].get("n", 0) >= MIN_N_HOLDOUT
        and (item["holdout"].get("meanPnlPct") or 0) > 0
        and (item["discovery"].get("meanPnlPct") or 0) > 0
    ]
    candidates.sort(key=lambda c: (c["qValue"], c["holdout"].get("tPValue") or 1.0))

    covered = [c for c in candidates if c["catalogCovered"]][:max_findings]
    gaps = [c for c in candidates if not c["catalogCovered"]]
    return {
        "tested": len(tested),
        "candidates": candidates,
        "covered": covered,
        "gaps": gaps,
    }


def cluster_key_for(candidate: dict[str, Any]) -> str:
    sig = f"PANEL_{candidate['side'].upper()}_{candidate['horizon']}D"
    return f"{sig}|{candidate['asset']}|strat:{candidate['bucket']}|{candidate['side']}"


def finding_title(candidate: dict[str, Any]) -> str:
    disc = candidate["discovery"]
    hold = candidate["holdout"]
    side_label = "buy NO (sell YES)" if candidate["side"] == "no" else "buy YES"
    return (
        f"Panel FIND: {side_label} {candidate['horizon']}d {candidate['asset']} | "
        f"conditions: {render_condition(candidate['conditions'])} | "
        f"WR={disc['winRate']:.0%} (base {disc['baseRate']:.0%}) n={disc['n']} "
        f"avg={disc['meanPnlPct']:+.2f}%/trade q={candidate['qValue']:.4f} | "
        f"holdout n={hold.get('n', 0)} avg={hold.get('meanPnlPct', 0):+.2f}%"
    )


def combined_evidence(candidate: dict[str, Any]) -> dict[str, Any]:
    """Full-window evidence for the FIND record (discovery + holdout)."""
    disc, hold = candidate["discovery"], candidate["holdout"]
    n = disc["n"] + hold.get("n", 0)
    wins = disc["wins"] + hold.get("wins", 0)
    sum_pnl_pct = disc["sumPnlPct"] + hold.get("sumPnlPct", 0.0)
    return {
        "n": n,
        "winRate": round(wins / n, 4) if n else 0.0,
        # Registry convention: sumPnl in per-$1 fractional return.
        "sumPnl": round(sum_pnl_pct / 100.0, 4),
        "avgPnl": round(sum_pnl_pct / 100.0 / n, 5) if n else 0.0,
        "pValue": disc["binomPValue"],
        "pnlPValue": disc["tPValue"],
        "qValue": candidate["qValue"],
        "baseRate": disc["baseRate"],
        "holdoutN": hold.get("n", 0),
        "holdoutMeanPnlPct": hold.get("meanPnlPct"),
        "holdoutTPValue": hold.get("tPValue"),
    }


def build_provenance(panel_path: Path, candidate: dict[str, Any], git_sha: str) -> dict:
    return {
        "generatedBy": MODEL,
        "inputWindow": candidate["inputWindow"],
        "featureSet": FEATURE_SET,
        "scoringVersion": SCORING_VERSION,
        "gitSha": git_sha,
        "inputArtifacts": [str(panel_path)],
        "filters": {
            "minNDiscovery": MIN_N_DISCOVERY,
            "minNHoldout": MIN_N_HOLDOUT,
            "maxQValue": MAX_Q_VALUE,
            "holdoutFraction": HOLDOUT_FRACTION,
            "panelVersion": PANEL_VERSION,
            "nonOverlappingEntries": True,
        },
        "reproducibleCommand": (
            f"python3 scripts/mine_panel_findings.py --panel {panel_path}"
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--panel", type=Path, default=DEFAULT_PANEL)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("--max-findings", type=int, default=15)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-score", action="store_true")
    args = ap.parse_args()

    if not args.panel.is_file():
        print(f"panel file missing: {args.panel} (run build_outcome_panel.py first)")
        return 0

    panel_rows = load_panel(args.panel)
    result = mine_panel(panel_rows, args.max_findings)
    git_sha = git_sha_short()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    created = updated = 0
    registered: list[dict[str, Any]] = []
    for candidate in result["covered"]:
        cluster_key = cluster_key_for(candidate)
        title = finding_title(candidate)
        body = {
            "clusterKey": cluster_key,
            "asset": candidate["asset"],
            "signalType": f"PANEL_{candidate['side'].upper()}_{candidate['horizon']}D",
            "side": candidate["side"],
            "bucket": f"strat:{candidate['bucket']}",
            "evidence": combined_evidence(candidate),
            "mineStats": {
                "discovery": candidate["discovery"],
                "holdout": candidate["holdout"],
                "qValue": candidate["qValue"],
                "testsInFamily": result["tested"],
                "sampleIds": candidate["sampleIds"],
            },
            "suggestedConditions": candidate["conditions"],
            "horizonDays": candidate["horizon"],
            "catalogCovered": True,
            "provenance": build_provenance(args.panel, candidate, git_sha),
        }
        if args.dry_run:
            print(f"[dry-run] {cluster_key}\n  {title}")
            continue
        before = load_registry(args.registry)
        existed = any(
            (r.get("body") or {}).get("clusterKey") == cluster_key
            for r in before.get("records", [])
            if r.get("type") == "finding"
        )
        record = upsert_finding(args.registry, body, title, source=MODEL)
        if existed:
            updated += 1
        else:
            created += 1
        registered.append({"id": record["id"], "clusterKey": cluster_key, "title": title})

    report = {
        "generatedAt": now,
        "model": MODEL,
        "panel": str(args.panel),
        "testsRun": result["tested"],
        "candidates": len(result["candidates"]),
        "registered": registered,
        "created": created,
        "updated": updated,
        "coverageGaps": [
            {
                "clusterKey": cluster_key_for(c),
                "title": finding_title(c),
                "dims": c["dims"],
                "qValue": c["qValue"],
                "discovery": c["discovery"],
                "holdout": c["holdout"],
                "note": "significant but not expressible in catalog condition keys",
            }
            for c in result["gaps"][:20]
        ],
    }
    if not args.dry_run:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")

    print(
        f"panel mine: tested={result['tested']} candidates={len(result['candidates'])} "
        f"registered={len(registered)} (created={created} updated={updated}) "
        f"coverage_gaps={len(result['gaps'])}"
    )
    for row in registered:
        print(f"  {row['id']} {row['clusterKey']}")
    for gap in report["coverageGaps"][:5]:
        print(f"  [gap] {gap['clusterKey']} q={gap['qValue']}")

    if not args.dry_run and not args.no_score and registered:
        score_result = score_research_findings(registry_path=args.registry, top_n=10)
        print(f"scored {score_result['scoredCount']} finding(s)")
        theme_result = assign_research_themes(registry_path=args.registry)
        print(f"themed {theme_result['assigned']} finding(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
