#!/usr/bin/env python3
"""Ex-ante confidence calibration audit (Research Registry Phase 3).

Determines which trades/shadows on this production VPS have a recoverable
*ex-ante* (recorded before the outcome was known) confidence or model
probability, joins them to realized outcomes, and reports calibration
(predicted probability vs realized win rate) in fixed-width buckets.

Verified data-availability findings (see EXP record registered by this
script's caller for the full narrative):

  JOINABLE:
    - data/blocked-signals.json shadow trades: each shadow carries a
      `confidence` field recorded at `blockedAt` (ex-ante) and, once
      `status == "resolved"`, a `hypotheticalResult.outcome` of "win"/"loss".
      This is the richest source: ~850 resolved shadows across 9
      `blockedReason` categories.
    - data/hypotheses.json: each hypothesis carries a static `confidence`
      and a `tests[]` array of triggered/outcome events. Confidence here is
      per-hypothesis (not per-trade-instance), but is a legitimate ex-ante
      probability that can be bucketed against realized test win/loss.
    - Live trades in data/trades-detailed.csv (+archive) that carry a
      non-empty `hypothesis_id`: these can be joined to that hypothesis's
      static `confidence` as a proxy ex-ante probability. Coverage is
      partial (~11% of closed trades as of this audit).

  NOT JOINABLE (verified by reading scripts/trading-engine.ts and every
  candidate data file named in the Phase 3 brief):
    - The remaining ~89% of live trades (no hypothesis_id): the engine's
      `Position` and `ClosedTrade` TypeScript interfaces have no
      confidence/probability field, and trades-detailed.csv has no
      confidence column. Nothing persists an ex-ante confidence at entry
      for the majority of live trades.
    - data/engine-state.json `openPositions`: a derived point-in-time
      summary (positionId, pnlPct, price, target/stop) with no confidence.
    - data/candidate-actions.json `entryCandidates[].confidence`: real
      ex-ante confidence values, but the file is a rolling *current
      snapshot* that gets overwritten every engine run — no history is
      retained, so past candidates cannot be joined to trades that were
      opened from them.
    - data/position-snapshots.csv: same columns as the live position
      summary, no confidence.
    - data/calibration-buckets-summary.json: an existing report over
      NO_BIAS_ADJUSTED_GAP_SHADOW shadows, but it stores only winRate
      (no confidence) — it is outcome-only, not a calibration input.
    - data/llm-close-rejections.json, data/llm-state.json,
      data/llm-advice.json: operational logs of LLM close decisions/skips;
      none store an entry-time win probability.

Excluded evidence (per registry convention): any trade with
close_reason == "data_quality_artifact" or whose id appears in
data/operationally-tainted-trades.json; any shadow whose
hypotheticalResult.closeReason == "data_quality_artifact" or whose outcome
is not "win"/"loss" (e.g. still-open or cancelled-without-resolution).

Usage:
    python3 scripts/confidence_calibration.py [--data-dir DIR] [--quiet]

Writes data/confidence-calibration.json and prints a human-readable report.
Stdlib-only; makes no network calls and mutates no production state files.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = ROOT / "data"

BUCKET_EDGES = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
MIN_N_FOR_KEY_FINDINGS = 10


def bucket_label(i: int) -> str:
    return f"{BUCKET_EDGES[i]:.1f}-{BUCKET_EDGES[i + 1]:.1f}"


def bucket_index(confidence: float) -> int:
    c = max(0.0, min(1.0, confidence))
    for i in range(len(BUCKET_EDGES) - 1):
        lo, hi = BUCKET_EDGES[i], BUCKET_EDGES[i + 1]
        if lo <= c < hi:
            return i
    return len(BUCKET_EDGES) - 2  # c == 1.0 falls in the last bucket


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def to_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


class BucketAccumulator:
    """Accumulates (confidence, outcome) observations per source into
    fixed-width reliability-diagram buckets."""

    def __init__(self) -> None:
        self.cells: dict[tuple[str, int], dict[str, float]] = defaultdict(
            lambda: {"n": 0, "confSum": 0.0, "wins": 0}
        )

    def add(self, source: str, confidence: float, win: bool) -> None:
        idx = bucket_index(confidence)
        cell = self.cells[(source, idx)]
        cell["n"] += 1
        cell["confSum"] += confidence
        cell["wins"] += 1 if win else 0

    def to_records(self) -> list[dict[str, Any]]:
        out = []
        for (source, idx), cell in sorted(self.cells.items(), key=lambda kv: (kv[0][0], kv[0][1])):
            n = int(cell["n"])
            mean_conf = cell["confSum"] / n if n else None
            win_rate = cell["wins"] / n if n else None
            midpoint = (BUCKET_EDGES[idx] + BUCKET_EDGES[idx + 1]) / 2
            gap = (win_rate - mean_conf) if (win_rate is not None and mean_conf is not None) else None
            out.append(
                {
                    "source": source,
                    "bucketLabel": bucket_label(idx),
                    "bucketLow": BUCKET_EDGES[idx],
                    "bucketHigh": BUCKET_EDGES[idx + 1],
                    "n": n,
                    "meanConfidence": round(mean_conf, 4) if mean_conf is not None else None,
                    "bucketMidpoint": midpoint,
                    "realizedWinRate": round(win_rate, 4) if win_rate is not None else None,
                    "gap": round(gap, 4) if gap is not None else None,
                }
            )
        return out


def collect_shadow_observations(data_dir: Path, acc: BucketAccumulator) -> dict[str, int]:
    shadows = load_json(data_dir / "blocked-signals.json", [])
    excluded_data_quality = 0
    included = 0
    for s in shadows:
        if not isinstance(s, dict) or s.get("status") != "resolved":
            continue
        result = s.get("hypotheticalResult")
        if not isinstance(result, dict):
            continue
        outcome = result.get("outcome")
        close_reason = result.get("closeReason")
        if close_reason == "data_quality_artifact" or outcome not in ("win", "loss"):
            excluded_data_quality += 1
            continue
        confidence = to_float(s.get("confidence"))
        if confidence is None:
            continue
        blocked_reason = s.get("blockedReason") or "unknown"
        win = outcome == "win"
        acc.add(f"shadow:{blocked_reason}", confidence, win)
        acc.add("shadow:all_combined", confidence, win)
        included += 1
    return {"included": included, "excludedDataQuality": excluded_data_quality}


def collect_hypothesis_observations(data_dir: Path, acc: BucketAccumulator) -> tuple[dict[str, Any], int]:
    hypotheses = load_json(data_dir / "hypotheses.json", [])
    hyp_by_id: dict[str, dict[str, Any]] = {}
    included = 0
    for h in hypotheses:
        if not isinstance(h, dict):
            continue
        hid = h.get("id")
        if isinstance(hid, str):
            hyp_by_id[hid] = h
        confidence = to_float(h.get("confidence"))
        if confidence is None:
            continue
        for t in h.get("tests", []) or []:
            if not isinstance(t, dict) or not t.get("triggered"):
                continue
            outcome = t.get("outcome")
            if outcome not in ("win", "loss"):
                continue
            acc.add("hypotheses_test_level", confidence, outcome == "win")
            included += 1
    return hyp_by_id, included


def collect_live_trade_observations(
    data_dir: Path, acc: BucketAccumulator, hyp_by_id: dict[str, dict[str, Any]]
) -> dict[str, int]:
    tainted = load_json(data_dir / "operationally-tainted-trades.json", {})
    tainted_ids = set(tainted.keys()) if isinstance(tainted, dict) else set(tainted or [])

    trades = load_csv_rows(data_dir / "trades-detailed.csv") + load_csv_rows(
        data_dir / "trades-detailed-archive.csv"
    )

    total_closed = 0
    excluded_tainted = 0
    no_hypothesis_id = 0
    hypothesis_not_found_or_no_confidence = 0
    joined = 0

    for row in trades:
        if not row.get("closed_at"):
            continue
        total_closed += 1
        trade_id = row.get("id", "")
        close_reason = row.get("close_reason")
        if close_reason == "data_quality_artifact" or trade_id in tainted_ids:
            excluded_tainted += 1
            continue
        hyp_id = row.get("hypothesis_id")
        if not hyp_id:
            no_hypothesis_id += 1
            continue
        hyp = hyp_by_id.get(hyp_id)
        confidence = to_float(hyp.get("confidence")) if hyp else None
        if confidence is None:
            hypothesis_not_found_or_no_confidence += 1
            continue
        pnl = to_float(row.get("pnl"))
        if pnl is None:
            hypothesis_not_found_or_no_confidence += 1
            continue
        acc.add("live_trades_via_hypothesis", confidence, pnl > 0)
        joined += 1

    return {
        "totalClosed": total_closed,
        "excludedTainted": excluded_tainted,
        "noHypothesisId": no_hypothesis_id,
        "hypothesisNotFoundOrNoConfidence": hypothesis_not_found_or_no_confidence,
        "joined": joined,
    }


def build_source_descriptors(buckets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, int] = defaultdict(int)
    for b in buckets:
        totals[b["source"]] += b["n"]

    descriptions = {
        "hypotheses_test_level": (
            "hypotheses.json: static per-hypothesis confidence bucketed against "
            "triggered test outcomes (win/loss); confidence is per-hypothesis, not "
            "per-trade-instance."
        ),
        "live_trades_via_hypothesis": (
            "trades-detailed.csv(+archive) closed trades whose hypothesis_id joins to "
            "hypotheses.json; confidence is the hypothesis's static value, used as a "
            "proxy ex-ante probability for the trade. Excludes tainted/data-quality "
            "trades. Covers only the minority of live trades that carry a "
            "hypothesis_id."
        ),
        "shadow:all_combined": (
            "blocked-signals.json: all resolved shadow trades across every "
            "blockedReason, combined. confidence is recorded ex-ante at blockedAt; "
            "outcome is hypotheticalResult.outcome (win/loss). Excludes "
            "data_quality_artifact and unresolved-outcome shadows."
        ),
    }

    out = []
    for source in sorted(totals):
        if source.startswith("shadow:") and source != "shadow:all_combined":
            blocked_reason = source.split(":", 1)[1]
            desc = (
                f"blocked-signals.json shadows with blockedReason='{blocked_reason}'; "
                "confidence recorded ex-ante at blockedAt, outcome from "
                "hypotheticalResult.outcome."
            )
        else:
            desc = descriptions.get(source, "")
        out.append({"name": source, "n": totals[source], "description": desc})
    return out


def compute_key_findings(buckets: list[dict[str, Any]]) -> list[str]:
    eligible = [b for b in buckets if b["n"] >= MIN_N_FOR_KEY_FINDINGS and b["gap"] is not None]
    eligible.sort(key=lambda b: abs(b["gap"]), reverse=True)
    findings = []
    for b in eligible[:3]:
        direction = "overconfident" if b["gap"] < 0 else "underconfident"
        findings.append(
            f"{b['source']} bucket {b['bucketLabel']}: predicted {b['meanConfidence']:.3f}, "
            f"realized win rate {b['realizedWinRate']:.3f} (n={b['n']}), "
            f"gap={b['gap']:+.3f} ({direction})"
        )
    if not findings:
        findings.append(
            f"No bucket reached the n>={MIN_N_FOR_KEY_FINDINGS} threshold for a "
            "miscalibration finding; sample sizes are too thin to draw a conclusion."
        )
    return findings


def compute_verdict(buckets: list[dict[str, Any]]) -> str:
    eligible = [b for b in buckets if b["n"] >= MIN_N_FOR_KEY_FINDINGS and b["gap"] is not None]
    if not eligible:
        return "insufficient_data"
    max_gap = max(abs(b["gap"]) for b in eligible)
    if max_gap < 0.08:
        return "well_calibrated"
    if max_gap < 0.20:
        return "mild_miscalibration"
    return "significant_miscalibration"


def print_report(
    generated_at: str,
    shadow_stats: dict[str, int],
    hyp_test_count: int,
    trade_stats: dict[str, int],
    sources: list[dict[str, Any]],
    buckets: list[dict[str, Any]],
    key_findings: list[str],
    verdict: str,
) -> None:
    print("=== Confidence Calibration Report ===")
    print(f"Generated: {generated_at}")
    print()
    print("Data availability:")
    print(
        f"  shadow trades (blocked-signals.json): {shadow_stats['included']} resolved "
        f"w/ ex-ante confidence + outcome joined; {shadow_stats['excludedDataQuality']} "
        "excluded (data_quality_artifact / unresolved outcome)"
    )
    print(f"  hypotheses.json triggered test events joined: {hyp_test_count}")
    print(
        f"  live trades: {trade_stats['totalClosed']} closed total; "
        f"{trade_stats['excludedTainted']} excluded (tainted/data_quality_artifact); "
        f"{trade_stats['joined']} joined via hypothesis_id -> hypotheses.json confidence; "
        f"{trade_stats['noHypothesisId']} have no hypothesis_id (NOT joinable — no "
        "ex-ante confidence persisted anywhere for these); "
        f"{trade_stats['hypothesisNotFoundOrNoConfidence']} had a hypothesis_id that "
        "did not resolve to a numeric confidence"
    )
    print()
    print("Sources:")
    for s in sources:
        print(f"  - {s['name']} (n={s['n']})")
    print()
    print("Calibration buckets (bucketLabel | n | meanConfidence | realizedWinRate | gap):")
    current_source = None
    for b in buckets:
        if b["source"] != current_source:
            current_source = b["source"]
            print(f"  {current_source}:")
        conf_s = f"{b['meanConfidence']:.3f}" if b["meanConfidence"] is not None else "n/a"
        wr_s = f"{b['realizedWinRate']:.3f}" if b["realizedWinRate"] is not None else "n/a"
        gap_s = f"{b['gap']:+.3f}" if b["gap"] is not None else "n/a"
        print(f"    {b['bucketLabel']:>9} | n={b['n']:<4} | pred={conf_s} | realized={wr_s} | gap={gap_s}")
    print()
    print("Key findings:")
    for i, f in enumerate(key_findings, 1):
        print(f"  {i}. {f}")
    print()
    print(f"Verdict: {verdict}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--quiet", action="store_true", help="suppress the human-readable report")
    args = parser.parse_args(argv)

    data_dir: Path = args.data_dir
    acc = BucketAccumulator()

    shadow_stats = collect_shadow_observations(data_dir, acc)
    hyp_by_id, hyp_test_count = collect_hypothesis_observations(data_dir, acc)
    trade_stats = collect_live_trade_observations(data_dir, acc, hyp_by_id)

    buckets = acc.to_records()
    sources = build_source_descriptors(buckets)
    key_findings = compute_key_findings(buckets)
    verdict = compute_verdict(buckets)

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    not_joinable = [
        (
            f"{trade_stats['noHypothesisId']} of {trade_stats['totalClosed']} closed live trades "
            "carry no hypothesis_id and have NO recoverable ex-ante confidence: the engine's "
            "Position/ClosedTrade schema (scripts/trading-engine.ts) never persists a "
            "confidence/probability field per trade, and trades-detailed.csv has no confidence "
            "column."
        ),
        (
            "data/candidate-actions.json entryCandidates[].confidence is real ex-ante confidence "
            "but the file is overwritten every engine run (current snapshot only, no history) — "
            "past candidates cannot be joined back to the trades opened from them."
        ),
        (
            "data/engine-state.json openPositions and data/position-snapshots.csv are derived "
            "point-in-time summaries with no confidence field."
        ),
        (
            "data/calibration-buckets-summary.json stores only realized winRate for "
            "NO_BIAS_ADJUSTED_GAP_SHADOW shadows, with no confidence field — it is outcome-only "
            "and cannot itself be used for a calibration gap."
        ),
        (
            "data/llm-close-rejections.json, data/llm-state.json, data/llm-advice.json are "
            "operational logs of close decisions/skips; none store an entry-time win probability."
        ),
    ]

    joinable = [
        (
            f"data/blocked-signals.json shadow trades: {shadow_stats['included']} resolved shadows "
            "carry an ex-ante `confidence` (recorded at blockedAt) joined to "
            "hypotheticalResult.outcome (win/loss)."
        ),
        (
            f"data/hypotheses.json: {hyp_test_count} triggered test events joined to each "
            "hypothesis's static ex-ante `confidence`."
        ),
        (
            f"{trade_stats['joined']} of {trade_stats['totalClosed']} closed live trades "
            "({:.0%}) join via hypothesis_id to hypotheses.json confidence.".format(
                trade_stats["joined"] / trade_stats["totalClosed"] if trade_stats["totalClosed"] else 0
            )
        ),
    ]

    artifact = {
        "generatedAt": generated_at,
        "sources": sources,
        "buckets": buckets,
        "excludedTaintedCount": trade_stats["excludedTainted"],
        "excludedDataQualityShadowCount": shadow_stats["excludedDataQuality"],
        "dataAvailability": {
            "joinable": joinable,
            "notJoinable": not_joinable,
        },
        "keyFindings": key_findings,
        "verdict": verdict,
        "notes": [
            f"Bucket width is fixed at {BUCKET_EDGES[1] - BUCKET_EDGES[0]:.1f} confidence points "
            f"({BUCKET_EDGES}).",
            "meanConfidence is the mean of actual confidence values observed in the bucket "
            "(reliability-diagram convention), not the bucket midpoint; bucketMidpoint is also "
            "reported for reference.",
            f"Key findings require n>={MIN_N_FOR_KEY_FINDINGS} in a bucket to avoid noise from "
            "small samples.",
            "Live trades and shadow trades are NOT the same population: shadows are signals the "
            "engine chose NOT to take live, so 'shadow:*' calibration describes the model's "
            "probability estimates for blocked/paper signals, not necessarily the same "
            "distribution as live entries.",
        ],
    }

    out_path = data_dir / "confidence-calibration.json"
    out_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if not args.quiet:
        print_report(generated_at, shadow_stats, hyp_test_count, trade_stats, sources, buckets, key_findings, verdict)
        print()
        print(f"Artifact written: {out_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
