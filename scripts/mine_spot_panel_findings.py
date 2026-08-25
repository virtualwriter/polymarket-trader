#!/usr/bin/env python3
"""Mine the spot/perp outcome panel (data/research-spot-panel.csv) into FIND
records — the non-Polymarket counterpart of mine_panel_findings.py.

Statistics discipline (identical to the contract panel miner):
  1. one-sided Student-t on per-row signed move (the alpha claim) — discovery
  2. exact binomial on the EXAM win rate vs the pool's own empirical base
     rate at the same exam. The exam is the engine's own scorer: a win is a
     move of >= SPOT_EXAM_THRESHOLD_PCT[horizon] percent in the thesis
     direction, because that is exactly how a live spot test will be graded.
     Mining "any positive move" would grade candidates on an exam no live
     test ever sits (the contract panel's first-night lesson, inverted).
  3. Benjamini-Hochberg q-values across ALL strata tested in the run
  4. temporal holdout: the last ~30% of panel days are never mined; a
     candidate must independently show positive mean move there.

Only per-asset candidates whose conditions translate fully into engine
catalog keys (derived valuation patterns, funding keys, day_of_week) are
registered as FINDs. Pooled/unmappable patterns are reported as coverage
gaps. Every FIND records its exam threshold and a suggested prediction
string containing "> X%" so the authored hypothesis sits the same exam the
panel measured.
"""
from __future__ import annotations

import argparse
import csv
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

from lib.alpha_stats import binomial_p_value, bh_qvalues, one_sided_t_pvalue  # noqa: E402
from lib.panel_common import fnum  # noqa: E402
from lib.spot_panel_common import (  # noqa: E402
    SPOT_EXAM_THRESHOLD_PCT,
    SPOT_HORIZONS_DAYS,
    SPOT_MINEABLE_QUALITIES,
    SPOT_PAIR_STRATIFICATIONS,
    SPOT_PANEL_VERSION,
    dedupe_non_overlapping_spot,
    spot_panel_features,
)
from registry import default_registry_path, load_registry, upsert_finding  # noqa: E402
from score_research_findings import score_research_findings  # noqa: E402
from assign_research_themes import assign_research_themes  # noqa: E402

DEFAULT_PANEL = REPO / "data" / "research-spot-panel.csv"
DEFAULT_REGISTRY = default_registry_path()
DEFAULT_REPORT = REPO / "data" / "spot-panel-mine-report.json"
MODEL = "spot_panel_miner_v1"
FEATURE_SET = SPOT_PANEL_VERSION
SCORING_VERSION = "spot_panel_mine_v1"

SIDES = ("long", "short")
HOLDOUT_FRACTION = 0.30
MIN_N_DISCOVERY = 30
MIN_N_HOLDOUT = 10
MAX_Q_VALUE = 0.10
# Pools smaller than this fall back to the ALL-assets base rate.
MIN_POOL_FOR_BASE_RATE = 30


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


def exam_win(signed_move_pct: float, threshold_pct: float) -> bool:
    return signed_move_pct >= threshold_pct


def stats_for(
    pnls: list[float], threshold_pct: float, base_rate: float
) -> dict[str, Any]:
    n = len(pnls)
    if n == 0:
        return {"n": 0}
    wins = sum(1 for p in pnls if exam_win(p, threshold_pct))
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
        "examThresholdPct": threshold_pct,
    }


def conditions_for_bucket_parts(
    feature_by_name: dict[str, Any],
    asset: str,
    parts: list[tuple[str, str]],
) -> tuple[dict[str, Any] | None, bool]:
    """Merge per-feature condition fragments for one asset. covered=False if
    any feature lacks a catalog mapping (always true for the pooled ALL
    asset: derived keys are per-asset column names)."""
    if asset == "ALL":
        return None, False
    merged: dict[str, Any] = {"asset": asset}
    covered = True
    for feature_name, bucket in parts:
        feature = feature_by_name[feature_name]
        fragment = feature.condition_for(asset, bucket)
        if fragment is None:
            covered = False
            continue
        merged.update(fragment)
    return merged, covered


def render_condition(conditions: dict[str, Any] | None) -> str:
    if not conditions:
        return "(panel-only features; no catalog mapping)"
    return " AND ".join(f"{key} {expr}" for key, expr in conditions.items())


def suggested_prediction(candidate: dict[str, Any]) -> str:
    """A prediction string that sits the exam the panel measured: it names
    the direction and carries the "> X%" threshold the scorer parses."""
    threshold = candidate["thresholdPct"]
    asset = candidate["asset"]
    horizon = candidate["horizon"]
    move = "%s%%" % (str(int(threshold)) if float(threshold).is_integer() else str(threshold))
    if candidate["side"] == "long":
        return f"{asset} spot rises > {move} within {horizon} day(s)"
    return f"{asset} spot declines > {move} within {horizon} day(s)"


def signed_move(row: dict[str, Any], side: str, horizon: int) -> float | None:
    v = fnum(row.get(f"move_pct_{horizon}d"))
    if v is None:
        return None
    return v if side == "long" else -v


def mine_spot_panel(
    panel_rows: list[dict[str, Any]],
    max_findings: int,
) -> dict[str, Any]:
    features = spot_panel_features()
    feature_by_name = {f.name: f for f in features}

    tested: list[dict[str, Any]] = []
    seen_row_sets: set = set()

    for horizon in SPOT_HORIZONS_DAYS:
        threshold = SPOT_EXAM_THRESHOLD_PCT[horizon]
        quality_col = f"outcome_quality_{horizon}d"

        usable = [
            r for r in panel_rows
            if str(r.get(quality_col)) in SPOT_MINEABLE_QUALITIES
        ]
        usable = dedupe_non_overlapping_spot(usable, horizon)
        if not usable:
            continue

        discovery_days, holdout_days = split_days(
            [str(r.get("entry_date")) for r in usable], HOLDOUT_FRACTION
        )

        for side in SIDES:
            rows = [
                (r, signed_move(r, side, horizon))
                for r in usable
            ]
            rows = [(r, p) for r, p in rows if p is not None]
            if not rows:
                continue

            disc_all = [(r, p) for r, p in rows if str(r.get("entry_date")) in discovery_days]
            hold_all = [(r, p) for r, p in rows if str(r.get("entry_date")) in holdout_days]

            # Empirical exam base rates from the discovery pool only.
            base_by_asset: dict[str, float] = {}
            pool_by_asset: dict[str, list[float]] = defaultdict(list)
            for r, p in disc_all:
                pool_by_asset[str(r.get("asset"))].append(p)
                pool_by_asset["ALL"].append(p)
            for asset, pnls in pool_by_asset.items():
                if len(pnls) >= MIN_POOL_FOR_BASE_RATE or asset == "ALL":
                    base_by_asset[asset] = (
                        sum(1 for p in pnls if exam_win(p, threshold)) / len(pnls)
                    )
            all_base = base_by_asset.get("ALL", 0.5)

            strat_specs: list[tuple[tuple[str, ...], str]] = []
            for f in features:
                strat_specs.append(((f.name,), f.name))
            for pair in SPOT_PAIR_STRATIFICATIONS:
                strat_specs.append((pair, "+".join(pair)))

            for dims, _label in strat_specs:
                disc_cells: dict = defaultdict(list)
                hold_cells: dict = defaultdict(list)
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
                        "%s@%s" % (r.get("asset"), r.get("entry_date"))
                        for r, _ in cell_rows
                    )
                    dedupe_key = (side, horizon, row_ids)
                    if dedupe_key in seen_row_sets:
                        continue
                    seen_row_sets.add(dedupe_key)

                    base = base_by_asset.get(asset, all_base)
                    disc_pnls = [p for _, p in cell_rows]
                    disc = stats_for(disc_pnls, threshold, base)

                    hold_rows = hold_cells.get((asset, bucket_label), [])
                    hold_pnls = [p for _, p in hold_rows]
                    hold = stats_for(hold_pnls, threshold, base)

                    parts = list(zip(dims, bucket_label.split(",")))
                    conditions, covered = conditions_for_bucket_parts(
                        feature_by_name, asset, parts
                    )

                    tested.append({
                        "side": side,
                        "horizon": horizon,
                        "thresholdPct": threshold,
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
        # The exam must also beat its base rate in discovery — a cell can
        # have positive mean move yet win the exam no more often than the
        # unconditioned pool, and such a thesis will not clear promotion.
        and (item["discovery"].get("winRate") or 0) > (item["discovery"].get("baseRate") or 0)
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
    sig = "SPOTPANEL_%s_%sD" % (candidate["side"].upper(), candidate["horizon"])
    return "%s|%s|strat:%s|%s" % (
        sig, candidate["asset"], candidate["bucket"], candidate["side"]
    )


def finding_title(candidate: dict[str, Any]) -> str:
    disc = candidate["discovery"]
    hold = candidate["holdout"]
    return (
        "Spot panel FIND: %s %s %sd (exam > %s%%) | conditions: %s | "
        "WR=%.0f%% (base %.0f%%) n=%s avg=%+.2f%%/trade q=%.4f | "
        "holdout n=%s avg=%+.2f%%"
        % (
            candidate["side"], candidate["asset"], candidate["horizon"],
            candidate["thresholdPct"],
            render_condition(candidate["conditions"]),
            disc["winRate"] * 100, disc["baseRate"] * 100, disc["n"],
            disc["meanPnlPct"], candidate["qValue"],
            hold.get("n", 0), hold.get("meanPnlPct", 0) or 0,
        )
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
            "panelVersion": SPOT_PANEL_VERSION,
            "examThresholdPct": candidate["thresholdPct"],
            "nonOverlappingEntries": True,
        },
        "reproducibleCommand": (
            f"python3 scripts/mine_spot_panel_findings.py --panel {panel_path}"
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--panel", type=Path, default=DEFAULT_PANEL)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("--max-findings", type=int, default=10)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-score", action="store_true")
    args = ap.parse_args()

    if not args.panel.is_file():
        print(f"spot panel file missing: {args.panel} (run build_spot_panel.py first)")
        return 0

    panel_rows = load_panel(args.panel)
    result = mine_spot_panel(panel_rows, args.max_findings)
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
            "signalType": "SPOTPANEL_%s_%sD" % (candidate["side"].upper(), candidate["horizon"]),
            "side": candidate["side"],
            "bucket": "strat:%s" % candidate["bucket"],
            "evidence": combined_evidence(candidate),
            "mineStats": {
                "discovery": candidate["discovery"],
                "holdout": candidate["holdout"],
                "qValue": candidate["qValue"],
                "testsInFamily": result["tested"],
                "sampleIds": candidate["sampleIds"],
                "examThresholdPct": candidate["thresholdPct"],
            },
            "suggestedConditions": candidate["conditions"],
            "suggestedPrediction": suggested_prediction(candidate),
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
        "spot panel mine: tested=%s candidates=%s registered=%s "
        "(created=%s updated=%s) coverage_gaps=%s"
        % (
            result["tested"], len(result["candidates"]), len(registered),
            created, updated, len(result["gaps"]),
        )
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
