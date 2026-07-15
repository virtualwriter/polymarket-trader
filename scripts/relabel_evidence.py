#!/usr/bin/env python3
"""The single sanctioned path for reclassifying trade evidence as
operationally tainted (Research Registry Phase 1).

Usage:
  python3 scripts/relabel_evidence.py --trade-ids ID1,ID2 --reason "why" \
      [--incident-title "..."] [--apply] [--write-weights]

Default is dry-run: prints a full report of what WOULD change. Pass --apply
to execute. --write-weights additionally writes corrected signal-weights.json
values (only takes effect together with --apply; backs up signal-weights.json
to /opt/polymarket-trader-backups/ first).

What this does NOT do: it never edits close_reason in trades-detailed.csv.
The operationally-tainted-trades.json id -> reason map is the sole exclusion
mechanism (see scripts/portfolio-ledger.ts isContaminatedTrade); close_reason
stays put as the historical record of how the trade actually closed.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SCRIPTS_DIR = ROOT / "scripts"

DEFAULT_TRADES_CSV = DATA_DIR / "trades-detailed.csv"
DEFAULT_ARCHIVE_CSV = DATA_DIR / "trades-detailed-archive.csv"
DEFAULT_TAINTED_FILE = DATA_DIR / "operationally-tainted-trades.json"
DEFAULT_SIGNAL_WEIGHTS_FILE = DATA_DIR / "signal-weights.json"
DEFAULT_BACKUP_DIR = Path("/opt/polymarket-trader-backups")

SOURCE = "relabel_evidence.py"

# Mirrors scripts/trading-engine.ts exactly: DEMOTE_THRESHOLD, KILL_THRESHOLD,
# WEIGHT_DECAY constants and the updateWeights() arithmetic. If those ever
# change in the engine, update here too — this is a deliberate, documented
# duplication (a pure-python replay can't import TypeScript) rather than an
# accidental one.
WEIGHT_DECAY = 0.85
DEMOTE_THRESHOLD = 0.45
KILL_THRESHOLD = 0.40


def load_registry_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("registry_lib", SCRIPTS_DIR / "registry.py")
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load scripts/registry.py from {SCRIPTS_DIR}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def load_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-relabel-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def find_trade(
    trade_id: str,
    main_by_id: dict[str, dict[str, str]],
    archive_by_id: dict[str, dict[str, str]],
) -> tuple[dict[str, str] | None, str | None]:
    if trade_id in main_by_id:
        return main_by_id[trade_id], "trades-detailed.csv"
    if trade_id in archive_by_id:
        return archive_by_id[trade_id], "trades-detailed-archive.csv"
    return None, None


def is_engine_learnable_closed_trade(row: dict[str, str]) -> bool:
    """Mirrors scripts/trading-engine.ts isEngineLearnableClosedTrade() exactly."""
    return (
        row.get("close_reason") != "data_quality_artifact"
        and row.get("signal_type") != "MONOTONIC_ARB"
        and row.get("instrument_type") != "pm_package"
    )


def _weight_tuple(w: dict[str, Any] | None) -> tuple[int, int, float, float]:
    if not w:
        return (0, 0, 0.0, 0.0)
    return (
        int(w.get("trades", 0) or 0),
        int(w.get("wins", 0) or 0),
        float(w.get("avgPnlPct", 0.0) or 0.0),
        float(w.get("weight", 0.0) or 0.0),
    )


def replay_update_weights(
    base_weights: list[dict[str, Any]],
    closed_trades: list[dict[str, str]],
) -> tuple[dict[str, dict[str, Any]], set[str]]:
    """Replays scripts/trading-engine.ts updateWeights() arithmetic exactly,
    trade-by-trade in the order given, starting from a deep copy of
    base_weights. Returns (weights_by_type, skipped_signal_types) where
    skipped_signal_types are signal types seen in closed_trades that have no
    matching entry in base_weights — the engine's
    `weights.find(w => w.type === trade.signalType)` silently `continue`s for
    these, so they never touch weight learning at all. We replicate that
    exactly rather than creating new entries.
    """
    weights: dict[str, dict[str, Any]] = {}
    for w in base_weights:
        if not isinstance(w, dict) or "type" not in w:
            continue
        wc = json.loads(json.dumps(w))  # deep copy, JSON-safe
        wc["perAsset"] = dict(wc.get("perAsset") or {})
        weights[wc["type"]] = wc

    skipped_signal_types: set[str] = set()

    for trade in closed_trades:
        signal_type = trade.get("signal_type", "")
        w = weights.get(signal_type)
        if w is None:
            skipped_signal_types.add(signal_type)
            continue

        pnl = to_float(trade.get("pnl"))
        pnl_pct = to_float(trade.get("pnl_pct"))
        asset = trade.get("asset", "")
        is_win = pnl >= 0

        w["trades"] = int(w.get("trades", 0) or 0) + 1
        if is_win:
            w["wins"] = int(w.get("wins", 0) or 0) + 1
        w["avgPnlPct"] = ((float(w.get("avgPnlPct", 0.0) or 0.0) * (w["trades"] - 1)) + pnl_pct) / w["trades"]
        if trade.get("closed_at"):
            w["lastTriggered"] = trade["closed_at"]

        per_asset = w.setdefault("perAsset", {})
        pa = per_asset.setdefault(asset, {"trades": 0, "wins": 0, "avgPnlPct": 0.0})
        pa["trades"] = int(pa.get("trades", 0) or 0) + 1
        if is_win:
            pa["wins"] = int(pa.get("wins", 0) or 0) + 1
        pa["avgPnlPct"] = ((float(pa.get("avgPnlPct", 0.0) or 0.0) * (pa["trades"] - 1)) + pnl_pct) / pa["trades"]

        recent_accuracy = (w["wins"] / w["trades"]) if w["trades"] > 0 else 0.5
        weight = float(w.get("weight", 0.5) or 0.5) * WEIGHT_DECAY + recent_accuracy * (1 - WEIGHT_DECAY)
        w["weight"] = max(0.05, min(0.95, weight))

        # Demotion is log-only in the engine (no field mutation). Kill sets enabled=False.
        if w["trades"] >= 10 and recent_accuracy < KILL_THRESHOLD:
            w["enabled"] = False

        per_asset_accuracy = (pa["wins"] / pa["trades"]) if pa["trades"] > 0 else 0.5
        if pa["trades"] >= 5 and per_asset_accuracy < KILL_THRESHOLD and not pa.get("disabled"):
            pa["disabled"] = True
            pa["disabledAt"] = trade.get("closed_at")
            pa["disabledReason"] = (
                f"{signal_type} on {asset} disabled after {pa['wins']}/{pa['trades']} wins "
                f"({per_asset_accuracy * 100:.0f}% accuracy)."
            )

    return weights, skipped_signal_types


def reconciliation_report(
    trades_csv: Path,
    signal_weights_file: Path,
    newly_tainted_ids: set[str],
    existing_tainted_ids: set[str],
) -> None:
    base_weights = load_json_file(signal_weights_file, [])
    if not isinstance(base_weights, list):
        print(f"  warning: {signal_weights_file} is not a JSON array; skipping reconciliation")
        return

    all_rows = read_csv_rows(trades_csv)
    learnable_rows = [r for r in all_rows if is_engine_learnable_closed_trade(r)]
    learnable_rows.sort(key=lambda r: (r.get("closed_at") or "", r.get("id") or ""))

    all_taint_after = existing_tainted_ids | newly_tainted_ids

    # (a) including the newly-tainted trades: matches live engine behavior —
    # isEngineLearnableClosedTrade never consults the taint list, so this is
    # "business as usual" and should approximate the current signal-weights.json.
    rows_with = learnable_rows
    # (b) excluding them: the corrected counterfactual.
    rows_without = [r for r in learnable_rows if r.get("id") not in all_taint_after]

    weights_with, skipped_with = replay_update_weights(base_weights, rows_with)
    weights_without, skipped_without = replay_update_weights(base_weights, rows_without)

    current_by_type = {w.get("type"): w for w in base_weights if isinstance(w, dict) and w.get("type")}
    all_types = sorted(set(current_by_type) | set(weights_with) | set(weights_without))

    any_relabel_impact = False
    for t in all_types:
        cur_tuple = _weight_tuple(current_by_type.get(t))
        with_tuple = _weight_tuple(weights_with.get(t))
        without_tuple = _weight_tuple(weights_without.get(t))

        if with_tuple == without_tuple:
            continue  # this relabel batch has zero effect on this signal type
        any_relabel_impact = True
        print(f"  {t}:")
        print(f"    current data/signal-weights.json: trades={cur_tuple[0]:>4d} wins={cur_tuple[1]:>4d} avgPnlPct={cur_tuple[2]:>9.4f} weight={cur_tuple[3]:.4f}")
        print(f"    replay WITH tainted trade(s)    : trades={with_tuple[0]:>4d} wins={with_tuple[1]:>4d} avgPnlPct={with_tuple[2]:>9.4f} weight={with_tuple[3]:.4f}")
        print(f"    replay WITHOUT tainted trade(s) : trades={without_tuple[0]:>4d} wins={without_tuple[1]:>4d} avgPnlPct={without_tuple[2]:>9.4f} weight={without_tuple[3]:.4f}")
        if with_tuple != cur_tuple:
            print(
                "    note: replay-WITH != live signal-weights.json for this signal — likely drift from manual "
                "resets/edits recorded in artifactNote/resetReason, or historical trades no longer present in "
                "trades-detailed.csv. Treat replay-WITHOUT as relative to replay-WITH, not to the live file."
            )

    if not any_relabel_impact:
        print(
            "  no signal-weights.json impact: none of the relabeled trade id(s) are in a signal type that is "
            "still learnable, or they are not present in the current active ledger (data/trades-detailed.csv) at "
            "all right now (e.g. already moved to data/trades-detailed-archive.csv) — such trades cannot affect "
            "this replay either way, since the replay's input set is trades-detailed.csv."
        )

    skipped_all = (skipped_with | skipped_without) - set(current_by_type)
    if skipped_all:
        print()
        print(
            f"  Signal type(s) present in the ledger but absent from {signal_weights_file.name}: "
            f"{', '.join(sorted(t for t in skipped_all if t))}. Per the engine's "
            "`weights.find(w => w.type === trade.signalType)`, trades with these signal types are silently "
            "skipped and never touch weight learning — this replay does the same, matching production exactly."
        )

    print()
    print(
        "  Portfolio totals: no separate recompute step needed here. "
        "recomputePortfolioTotalsFromLedger() (scripts/portfolio-ledger.ts) is called on every "
        "load inside scripts/trading-engine.ts (~line 1466, hourly at :27) and "
        "scripts/position-exit-scanner.ts (~line 131, every minute) — both re-derive "
        "totalRealizedPnl/totalTrades/winCount/lossCount from the cleaned ledger (which already "
        "excludes tainted ids via isContaminatedTrade) and persist the result to portfolio.json. "
        "There is no standalone CLI wrapper; the next scheduled run of either picks up this change "
        "automatically, so within at most ~1 minute of --apply."
    )


def compute_corrected_weights(
    trades_csv: Path,
    signal_weights_file: Path,
    all_tainted_ids: set[str],
) -> list[dict[str, Any]]:
    base_weights = load_json_file(signal_weights_file, [])
    if not isinstance(base_weights, list):
        raise ValueError(f"{signal_weights_file} is not a JSON array")

    all_rows = read_csv_rows(trades_csv)
    learnable_rows = [r for r in all_rows if is_engine_learnable_closed_trade(r)]
    learnable_rows.sort(key=lambda r: (r.get("closed_at") or "", r.get("id") or ""))
    rows_without = [r for r in learnable_rows if r.get("id") not in all_tainted_ids]

    weights_without, _ = replay_update_weights(base_weights, rows_without)

    corrected: list[dict[str, Any]] = []
    for w in base_weights:
        if not isinstance(w, dict):
            corrected.append(w)
            continue
        t = w.get("type")
        rwo = weights_without.get(t)
        if rwo is None:
            corrected.append(w)
            continue
        changed = (
            (int(w.get("trades", 0) or 0), int(w.get("wins", 0) or 0)) != (rwo.get("trades", 0), rwo.get("wins", 0))
            or abs(float(w.get("avgPnlPct", 0.0) or 0.0) - float(rwo.get("avgPnlPct", 0.0) or 0.0)) > 1e-9
            or abs(float(w.get("weight", 0.0) or 0.0) - float(rwo.get("weight", 0.0) or 0.0)) > 1e-9
        )
        if not changed:
            corrected.append(w)
            continue
        new_w = dict(w)
        new_w["trades"] = rwo.get("trades", 0)
        new_w["wins"] = rwo.get("wins", 0)
        new_w["avgPnlPct"] = rwo.get("avgPnlPct", 0.0)
        new_w["weight"] = rwo.get("weight", 0.0)
        new_w["perAsset"] = rwo.get("perAsset", w.get("perAsset", {}))
        if rwo.get("lastTriggered"):
            new_w["lastTriggered"] = rwo["lastTriggered"]
        if "enabled" in rwo:
            new_w["enabled"] = rwo["enabled"]
        corrected.append(new_w)
    return corrected


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--trade-ids", required=True, help="comma-separated trade ids, e.g. T-123,T-456")
    parser.add_argument("--reason", required=True, help="why these trades are operationally tainted")
    parser.add_argument("--incident-title", default=None)
    parser.add_argument("--apply", action="store_true", help="execute writes; default is dry-run")
    parser.add_argument(
        "--write-weights", action="store_true",
        help="also write corrected signal-weights.json values (requires --apply; backs up first)",
    )
    parser.add_argument("--trades-csv", default=str(DEFAULT_TRADES_CSV))
    parser.add_argument("--archive-csv", default=str(DEFAULT_ARCHIVE_CSV))
    parser.add_argument("--tainted-file", default=str(DEFAULT_TAINTED_FILE))
    parser.add_argument("--signal-weights-file", default=str(DEFAULT_SIGNAL_WEIGHTS_FILE))
    parser.add_argument("--backup-dir", default=str(DEFAULT_BACKUP_DIR))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)

    trade_ids = [t.strip() for t in args.trade_ids.split(",") if t.strip()]
    if not trade_ids:
        print("error: --trade-ids must contain at least one non-empty id", file=sys.stderr)
        return 1
    if args.write_weights and not args.apply:
        print("error: --write-weights requires --apply", file=sys.stderr)
        return 1

    trades_csv = Path(args.trades_csv)
    archive_csv = Path(args.archive_csv)
    tainted_file = Path(args.tainted_file)
    signal_weights_file = Path(args.signal_weights_file)
    backup_dir = Path(args.backup_dir)

    main_rows = read_csv_rows(trades_csv)
    archive_rows = read_csv_rows(archive_csv)
    main_by_id = {r["id"]: r for r in main_rows if r.get("id")}
    archive_by_id = {r["id"]: r for r in archive_rows if r.get("id")}

    resolved: dict[str, tuple[dict[str, str], str]] = {}
    missing: list[str] = []
    for tid in trade_ids:
        row, source = find_trade(tid, main_by_id, archive_by_id)
        if row is None or source is None:
            missing.append(tid)
        else:
            resolved[tid] = (row, source)

    if missing:
        print(
            f"error: trade id(s) not found in {trades_csv.name} or {archive_csv.name}: {', '.join(missing)}",
            file=sys.stderr,
        )
        return 1

    tainted = load_json_file(tainted_file, {})
    if not isinstance(tainted, dict):
        print(f"error: {tainted_file} does not contain a JSON object", file=sys.stderr)
        return 1

    mode = "APPLY" if args.apply else "DRY RUN"
    print("=" * 78)
    print(f"relabel_evidence.py — {mode}")
    print("=" * 78)
    print(f"reason: {args.reason}")
    print()
    print(f"--- Trade lookup ({len(trade_ids)} id(s)) ---")
    cost_usd = 0.0
    for tid in trade_ids:
        row, source = resolved[tid]
        pnl = to_float(row.get("pnl"))
        cost_usd += pnl
        prior = tainted.get(tid)
        status = "already tainted" if prior is not None else "newly tainted"
        print(f"  {tid}")
        print(f"    found in:      {source}")
        print(f"    status:        {status}")
        print(f"    asset:         {row.get('asset')}")
        print(f"    signal_type:   {row.get('signal_type')}")
        print(f"    close_reason:  {row.get('close_reason')}")
        print(f"    closed_at:     {row.get('closed_at')}")
        print(f"    pnl:           {pnl:.4f}")
        if prior is not None and prior != args.reason:
            print(f"    prior reason:  {prior!r}")
            print(f"    new reason:    {args.reason!r}")
    cost_usd = round(cost_usd, 4)
    print()
    print(f"Total pnl of affected trade(s) (costUsd): {cost_usd:.4f}")

    updated_tainted = dict(tainted)
    for tid in trade_ids:
        updated_tainted[tid] = args.reason

    print()
    print(f"--- {tainted_file} ({'WILL BE WRITTEN' if args.apply else 'would be written'}) ---")
    for tid in trade_ids:
        marker = "~ (updating reason)" if tid in tainted and tainted[tid] != args.reason else (
            "= (no change)" if tid in tainted else "+ (new entry)"
        )
        print(f"  {marker} {tid}: {args.reason!r}")

    incident_title = args.incident_title or f"Relabel {len(trade_ids)} trade(s) as operationally tainted: {args.reason[:60]}"
    incident_body = {
        "rootCause": args.reason,
        "fix": (
            f"{len(trade_ids)} trade id(s) added/updated in data/operationally-tainted-trades.json via "
            f"{SOURCE}; close_reason left unchanged in the CSV ledger — the taint list is the exclusion "
            "mechanism, not close_reason."
        ),
        "costUsd": cost_usd,
        "guard": "taint-coverage invariant (scripts/registry_guards.py, hourly at :40)",
    }
    incident_links = {"relatedTradeIds": trade_ids}

    print()
    print(f"--- Registry incident record ({'WILL BE CREATED' if args.apply else 'would be created'}) ---")
    preview_record = {
        "type": "incident",
        "evidenceClass": "INVALID",
        "status": "final",
        "title": incident_title,
        "body": incident_body,
        "links": incident_links,
        "source": SOURCE,
    }
    print(json.dumps(preview_record, indent=2, ensure_ascii=False))

    print()
    print("--- Reconciliation: signal-weights.json impact ---")
    reconciliation_report(
        trades_csv=trades_csv,
        signal_weights_file=signal_weights_file,
        newly_tainted_ids=set(trade_ids),
        existing_tainted_ids=set(tainted.keys()),
    )

    if not args.apply:
        print()
        print("DRY RUN complete — nothing written. Re-run with --apply to execute.")
        return 0

    write_json_atomic(tainted_file, updated_tainted)
    print()
    print(f"applied: wrote {tainted_file}")

    registry_lib = load_registry_module()
    registry_path = registry_lib.default_registry_path()
    data = registry_lib.load_registry(registry_path)
    records = data.setdefault("records", [])
    record = {
        "id": registry_lib.next_id(records, "incident"),
        "type": "incident",
        "evidenceClass": "INVALID",
        "status": "final",
        "title": incident_title,
        "body": incident_body,
        "links": incident_links,
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE,
    }
    rec_errors = registry_lib.validate_record(record)
    if rec_errors:
        for err in rec_errors:
            print(f"error: {err}", file=sys.stderr)
        return 1
    records.append(record)
    data["version"] = registry_lib.REGISTRY_VERSION
    errors = registry_lib.validate_registry(data)
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1
    registry_lib.write_registry(registry_path, data)
    print(f"applied: created registry record {record['id']} in {registry_path}")

    if args.write_weights:
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
        backup_path = backup_dir / f"signal-weights.json.bak-{stamp}"
        if signal_weights_file.exists():
            shutil.copy2(signal_weights_file, backup_path)
            print(f"applied: backed up {signal_weights_file} -> {backup_path}")
        corrected = compute_corrected_weights(trades_csv, signal_weights_file, set(updated_tainted.keys()))
        write_json_atomic(signal_weights_file, corrected)
        print(f"applied: wrote corrected {signal_weights_file}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
