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
import re
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
    PANEL_TRIPLE_STRATIFICATIONS,
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
# Stratification combos proposed by the nightly explorer (free-roaming LLM
# data analysis). Validated below against the miner's own feature registry;
# accepted combos run through the identical stats pipeline as built-ins.
DEFAULT_PROPOSED_STRATS = REPO / "data" / "miner-proposed-strats.json"
MAX_PROPOSED_STRATS = 10
# Derived features proposed by the nightly explorer: new panel columns as
# transforms of raw numeric columns ("new representations"). Materialized at
# load, bucketed, and mined under the identical holdout/BH pipeline. They
# carry no catalog key, so anything they find routes to coverage gaps — the
# evidence trail for adding a real key — never straight to a FIND.
DEFAULT_PROPOSED_FEATURES = REPO / "data" / "miner-proposed-features.json"
MAX_PROPOSED_FEATURES = 4
DERIVED_TRANSFORM_ARITY = {"ratio": 2, "diff": 2, "product": 2, "abs": 1, "log10": 1}
# Raw numeric panel columns a derived feature may read. Mirrors the numeric
# subset of PANEL_FEATURE_COLUMNS; the explorer-side sanitizer keeps a copy.
DERIVABLE_NUMERIC_COLUMNS = frozenset({
    "strike", "spot", "dte_days", "yes_ask", "yes_bid", "pm_spread",
    "liquidity", "volume", "sell_yes_edge_pts", "buy_yes_edge_pts",
    "adjusted_no_gap_pts", "pm_iv", "option_iv", "pm_iv_minus_opt_iv_pts",
    "edge_pts_per_dte", "pm_to_underlying_cap_ratio", "settlement_overround",
    "settlement_skew_yes", "smart_flow_net_yes", "perp_funding_ann",
    "perp_basis_pct", "moneyness_pct", "btc_funding_ann", "spot_ret_24h_pct",
    "macro_composite", "macro_coverage", "fed_score", "iran_score",
    "oil_macro_score",
})
DERIVED_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,24}$")
# A derived feature must produce this many non-null values on the current
# panel to be minable at all (mirrors MIN_N_DISCOVERY).
MIN_DERIVED_COVERAGE = 30
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


def _derived_value(transform: str, columns: list[str], row: dict[str, Any]) -> float | None:
    a = fnum(row.get(columns[0]))
    if a is None:
        return None
    if transform == "abs":
        return abs(a)
    if transform == "log10":
        return math.log10(a) if a > 0 else None
    b = fnum(row.get(columns[1]))
    if b is None:
        return None
    if transform == "ratio":
        return a / b if abs(b) > 1e-12 else None
    if transform == "diff":
        return a - b
    if transform == "product":
        return a * b
    return None


class DerivedPanelFeature:
    """Duck-types PanelFeature (name / bucket(row) / condition_for_bucket /
    catalog_key) but computes its value from raw columns instead of reading
    one. catalog_key is always None: findings through derived features are
    coverage-gap evidence for a new representation, never directly authorable.
    """

    catalog_key = None

    def __init__(self, name: str, transform: str, columns: list[str], edges: list[float]) -> None:
        self.name = name
        self.transform = transform
        self.columns = list(columns)
        self.edges = list(edges)
        self.labels = self._labels_for_edges(edges)

    @staticmethod
    def _labels_for_edges(edges: list[float]) -> list[str]:
        def fmt(x: float) -> str:
            return f"{x:.4g}"
        labels = [f"<{fmt(edges[0])}"]
        labels.extend(f"{fmt(lo)}-{fmt(hi)}" for lo, hi in zip(edges, edges[1:]))
        labels.append(f">={fmt(edges[-1])}")
        return labels

    def value(self, row: dict[str, Any]) -> float | None:
        return _derived_value(self.transform, self.columns, row)

    def bucket(self, row: dict[str, Any]) -> str | None:
        value = self.value(row)
        if value is None:
            return None
        for edge, label in zip(self.edges, self.labels):
            if value < edge:
                return label
        return self.labels[-1]

    def condition_for_bucket(self, bucket: str) -> None:
        return None


def _tercile_edges(values: list[float]) -> list[float] | None:
    """Data-driven default bucketing when the explorer supplies no edges."""
    if len(values) < MIN_DERIVED_COVERAGE:
        return None
    ordered = sorted(values)
    lo = ordered[len(ordered) // 3]
    hi = ordered[(len(ordered) * 2) // 3]
    if not (lo < hi):  # degenerate distribution — nothing to stratify
        return None
    return [lo, hi]


def load_proposed_features(
    path: Path, panel_rows: list[dict[str, Any]]
) -> list[DerivedPanelFeature]:
    """Explorer-proposed derived features, validated hard: known transform,
    correct arity, whitelisted raw columns, sane name, workable bucket edges,
    and enough non-null coverage on the actual panel to be minable. Bad
    entries drop silently — the explorer is advisory, never load-bearing.
    """
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    proposals = raw.get("proposals") if isinstance(raw, dict) else None
    if not isinstance(proposals, list):
        return []
    built_in_names = {f.name for f in panel_features()}
    out: list[DerivedPanelFeature] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()
    for item in proposals:
        if len(out) >= MAX_PROPOSED_FEATURES:
            break
        if not isinstance(item, dict):
            continue
        transform = str(item.get("transform") or "")
        arity = DERIVED_TRANSFORM_ARITY.get(transform)
        columns = item.get("columns")
        if arity is None or not isinstance(columns, list) or len(columns) != arity:
            continue
        if not all(isinstance(c, str) and c in DERIVABLE_NUMERIC_COLUMNS for c in columns):
            continue
        name = str(item.get("name") or "").strip().lower()
        if not DERIVED_NAME_RE.match(name):
            continue
        # Prefix keeps explorer-named features from colliding with built-ins
        # (and makes their origin obvious in cluster keys and reports).
        full_name = f"x_{name}" if not name.startswith("x_") else name
        if full_name in built_in_names:
            continue
        key = (transform, tuple(columns))
        if key in seen or any(f.name == full_name for f in out):
            continue
        edges_raw = item.get("edges")
        edges: list[float] | None = None
        if isinstance(edges_raw, list) and 1 <= len(edges_raw) <= 4:
            try:
                candidate = [float(e) for e in edges_raw]
            except (TypeError, ValueError):
                candidate = []
            if candidate and all(x < y for x, y in zip(candidate, candidate[1:])) \
                    and all(math.isfinite(e) for e in candidate):
                edges = candidate
        if edges is None:
            values = [
                v for r in panel_rows
                if (v := _derived_value(transform, [str(c) for c in columns], r)) is not None
            ]
            edges = _tercile_edges(values)
            if edges is None:
                continue
        feature = DerivedPanelFeature(full_name, transform, [str(c) for c in columns], edges)
        coverage = sum(1 for r in panel_rows if feature.value(r) is not None)
        if coverage < MIN_DERIVED_COVERAGE:
            continue
        seen.add(key)
        out.append(feature)
    return out


def proposed_feature_names(path: Path) -> list[str]:
    """Normalized x_ names of every entry in the proposals file, valid or not,
    so the representation ledger can mark validation rejections explicitly."""
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    proposals = raw.get("proposals") if isinstance(raw, dict) else None
    if not isinstance(proposals, list):
        return []
    names: list[str] = []
    for item in proposals:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip().lower()
        if not name:
            continue
        full = name if name.startswith("x_") else f"x_{name}"
        if full not in names:
            names.append(full)
    return names


def load_proposed_stratifications(
    path: Path, feature_names: set[str]
) -> list[tuple[str, ...]]:
    """Explorer-proposed feature combos, validated against the miner's own
    feature registry. Only known feature names, 2-3 per combo, deduped against
    built-in pairs/triples (order-insensitive), capped at MAX_PROPOSED_STRATS.
    Bad entries are dropped silently: the explorer is advisory, never load-bearing.
    """
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    proposals = raw.get("proposals") if isinstance(raw, dict) else None
    if not isinstance(proposals, list):
        return []
    built_in = {tuple(sorted(c)) for c in (*PANEL_PAIR_STRATIFICATIONS, *PANEL_TRIPLE_STRATIFICATIONS)}
    out: list[tuple[str, ...]] = []
    seen: set[tuple[str, ...]] = set()
    for item in proposals:
        if len(out) >= MAX_PROPOSED_STRATS:
            break
        features = item.get("features") if isinstance(item, dict) else None
        if not isinstance(features, list):
            continue
        combo = tuple(f for f in features if isinstance(f, str) and f in feature_names)
        if len(combo) not in (2, 3) or len(set(combo)) != len(combo):
            continue
        key = tuple(sorted(combo))
        if key in built_in or key in seen:
            continue
        seen.add(key)
        out.append(combo)
    return out


def mine_panel(
    panel_rows: list[dict[str, Any]],
    max_findings: int,
    proposed_strats: list[tuple[str, ...]] | None = None,
    extra_features: list[DerivedPanelFeature] | None = None,
) -> dict[str, Any]:
    # Explorer-proposed derived features join the registry as first-class
    # features: mined as single strata automatically, referencable in proposed
    # combos, and corrected by the same BH family as every built-in test.
    features = panel_features() + list(extra_features or [])
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
            for triple in PANEL_TRIPLE_STRATIFICATIONS:
                strat_specs.append((triple, "+".join(triple)))
            # Explorer-proposed combos: same bucketing, same stats, same BH
            # correction — the search space grows, the rigor does not.
            for combo in proposed_strats or []:
                strat_specs.append((combo, "+".join(combo)))

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

    # Per-derived-feature lifecycle stats: how much statistical budget each
    # invented representation consumed and what it earned. Feeds the
    # representation ledger ("tests spent per confirmed representation").
    derived_stats = []
    for f in extra_features or []:
        involving = [t for t in tested if f.name in t["dims"]]
        surviving = [c for c in candidates if f.name in c["dims"]]
        qs = [t["qValue"] for t in involving if t.get("qValue") is not None]
        derived_stats.append({
            "name": f.name,
            "strataTested": len(involving),
            "survivors": len(surviving),
            "bestQ": round(min(qs), 6) if qs else None,
        })

    return {
        "tested": len(tested),
        "candidates": candidates,
        "covered": covered,
        "gaps": gaps,
        "derivedFeatureStats": derived_stats,
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
    derived = load_proposed_features(DEFAULT_PROPOSED_FEATURES, panel_rows)
    if derived:
        described = [f.name + "=" + f.transform + "(" + ",".join(f.columns) + ")" for f in derived]
        print(f"explorer-proposed derived features accepted: {described}")
    # Proposed combos may reference derived features, so validate against the
    # extended registry.
    feature_names = {f.name for f in panel_features()} | {f.name for f in derived}
    proposed = load_proposed_stratifications(DEFAULT_PROPOSED_STRATS, feature_names)
    if proposed:
        print(f"explorer-proposed stratifications accepted: {['+'.join(c) for c in proposed]}")
    result = mine_panel(panel_rows, args.max_findings, proposed, derived)
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
        "proposedDerivedFeatures": [
            {"name": f.name, "transform": f.transform, "columns": f.columns, "edges": f.edges}
            for f in derived
        ],
        "rejectedDerivedFeatures": sorted(
            set(proposed_feature_names(DEFAULT_PROPOSED_FEATURES)) - {f.name for f in derived}
        ),
        "derivedFeatureStats": result.get("derivedFeatureStats", []),
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
