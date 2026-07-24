#!/usr/bin/env python3
"""Build and optionally send a daily paper-trader report.

The report window is the previous calendar day in DAILY_REPORT_TZ
(default: America/New_York). It summarizes real trades, shadow trades,
current open positions, and LLM learning notes from the journal.
"""

from __future__ import annotations

import argparse
import re
import csv
import json
import os
import shutil
import smtplib
import ssl
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORT_DIR = DATA_DIR / "daily-email-reports"
EASTERN_TZ = ZoneInfo("America/New_York")

# Warn well before writes start failing; the VPS hit 99% full on 2026-07-14.
DISK_WARN_PCT = 80.0


def disk_usage_line(path: str = "/") -> str:
    """Host disk usage summary so a filling disk is visible in every report."""
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return "- Disk: usage unavailable"
    used_pct = usage.used / usage.total * 100 if usage.total else 0.0
    free_gb = usage.free / (1024 ** 3)
    total_gb = usage.total / (1024 ** 3)
    flag = " ⚠️ LOW DISK" if used_pct >= DISK_WARN_PCT else ""
    return f"- Disk: {used_pct:.0f}% used ({free_gb:.1f} GB free of {total_gb:.0f} GB){flag}"


def neon_parity_line(path: Path, now_utc: datetime) -> str | None:
    """Neon mirror parity status from data/neon-parity.json."""
    if not path.exists():
        return None
    try:
        with path.open() as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError, TypeError):
        return "- Neon mirror: parity file unreadable"
    if not isinstance(data, dict):
        return "- Neon mirror: parity file unreadable"

    status = data.get("status")
    try:
        neon_count = int(data.get("neonCount", 0))
        csv_deduped_count = int(data.get("csvDedupedCount", 0))
        pnl_delta_abs = float(data.get("pnlDeltaAbs", 0))
        missing_in_neon = data.get("missingInNeon") or []
        extra_in_neon = data.get("extraInNeon") or []
        if not isinstance(missing_in_neon, list):
            missing_in_neon = []
        if not isinstance(extra_in_neon, list):
            extra_in_neon = []
    except (TypeError, ValueError):
        return "- Neon mirror: parity file unreadable"

    checked_at_raw = data.get("checkedAt")
    checked_at = parse_ts(checked_at_raw if isinstance(checked_at_raw, str) else None)

    if status == "ok":
        line = f"- Neon mirror: OK — {neon_count} trades, P&L match (Δ ${pnl_delta_abs:.4f})"
    elif status == "mismatch":
        line = (
            f"- Neon mirror: MISMATCH — csv {csv_deduped_count} vs neon {neon_count} trades, "
            f"P&L Δ ${pnl_delta_abs:.4f}, {len(missing_in_neon)} missing / {len(extra_in_neon)} extra "
            f"(see data/neon-parity.json)"
        )
    else:
        return "- Neon mirror: parity file unreadable"

    if checked_at is not None:
        now = now_utc if now_utc.tzinfo else now_utc.replace(tzinfo=timezone.utc)
        if now - checked_at > timedelta(hours=48):
            line += f" [stale check: {checked_at_raw}]"

    return line



def parse_iso_ts(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def latest_journal_section_ts(path: Path) -> datetime | None:
    """Best-effort timestamp of the newest ### YYYY-MM-DD HH:MM UTC journal header."""
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    latest: datetime | None = None
    for match in re.finditer(
        r"^### (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC",
        text,
        flags=re.MULTILINE,
    ):
        ts = parse_iso_ts(f"{match.group(1)}T{match.group(2)}:00Z")
        if ts is not None and (latest is None or ts > latest):
            latest = ts
    return latest


def core_loop_health_lines(
    *,
    now_utc: datetime | None = None,
    heartbeat_path: Path | None = None,
    engine_state_path: Path | None = None,
    journal_path: Path | None = None,
    stale_after: timedelta = timedelta(hours=2, minutes=30),
) -> list[str]:
    """Operator-facing health for the hourly scan+trade core loop."""
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    heartbeat_path = heartbeat_path or (DATA_DIR / "core-loop-heartbeat.json")
    engine_state_path = engine_state_path or (DATA_DIR / "engine-state.json")
    journal_path = journal_path or (DATA_DIR / "learning-journal.md")

    last_success: datetime | None = None
    source = "none"

    if heartbeat_path.exists():
        try:
            payload = json.loads(heartbeat_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError):
            payload = None
        if isinstance(payload, dict):
            raw = payload.get("completedAt")
            ts = parse_iso_ts(raw if isinstance(raw, str) else None)
            if ts is not None:
                last_success = ts
                source = "heartbeat"

    if last_success is None and engine_state_path.exists():
        try:
            state = json.loads(engine_state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError):
            state = None
        if isinstance(state, dict):
            raw = state.get("generatedAt")
            ts = parse_iso_ts(raw if isinstance(raw, str) else None)
            if ts is not None:
                last_success = ts
                source = "engine-state"

    if last_success is None:
        ts = latest_journal_section_ts(journal_path)
        if ts is not None:
            last_success = ts
            source = "learning-journal"

    lines = ["## Core Loop"]
    if last_success is None:
        lines.append("- Core loop running: false")
        lines.append("- Last success: unknown (no heartbeat / engine-state / journal signal)")
        return lines

    age = now - last_success
    running = age <= stale_after
    age_hours = age.total_seconds() / 3600.0
    if age_hours < 1:
        age_label = f"{int(age.total_seconds() // 60)}m ago"
    else:
        age_label = f"{age_hours:.1f}h ago"

    lines.append(f"- Core loop running: {str(running).lower()}")
    lines.append(
        f"- Last success: {last_success.strftime('%Y-%m-%dT%H:%M:%SZ')} ({age_label}, source={source})"
    )
    if not running:
        lines.append(
            f"- ⚠️ Hourly trader appears stalled (threshold {stale_after.total_seconds()/3600:.1f}h). "
            "Check `systemctl status polymarket-trader.service` / npm ci."
        )
    return lines


def _short_cluster_key(cluster_key: str | None, max_len: int = 36) -> str:
    if not cluster_key:
        return "—"
    if len(cluster_key) <= max_len:
        return cluster_key
    return cluster_key[: max_len - 1] + "…"


def nightly_research_loop_lines(
    report_json_path: Path | None = None,
    *,
    max_chars: int = 1200,
) -> list[str]:
    """Compact nightly research summary for the daily report / Telegram."""
    path = report_json_path or (DATA_DIR / "nightly-research-report.json")
    header = "## Nightly Research Loop"
    if not path.exists():
        return [header, "- Nightly research report not yet available."]

    try:
        with path.open() as fh:
            report = json.load(fh)
    except (OSError, json.JSONDecodeError, TypeError):
        return [header, "- Nightly research report not yet available."]

    if not isinstance(report, dict):
        return [header, "- Nightly research report not yet available."]

    lines = [header]
    summary = report.get("summary") or {}
    themes = report.get("themesOverview") or []
    theme_bits = [
        f"{theme.get('slug', '?')}:{theme.get('findingCount', 0)}"
        for theme in themes[:6]
        if isinstance(theme, dict)
    ]
    theme_line = ", ".join(theme_bits) if theme_bits else "none"
    lines.append(f"- Themes ({summary.get('themeCount', len(themes))}): {theme_line}")

    if summary.get("advicePresent"):
        lines.append(f"- New hyps from nightly advice: {summary.get('authoredHypothesisCount', 0)}")
    else:
        lines.append("- New hyps from nightly advice: advice not yet available")

    lines.append("- Top opportunities:")
    for row in (report.get("topOpportunities") or [])[:3]:
        if not isinstance(row, dict):
            continue
        opp = row.get("opportunityScore")
        opp_text = f"{opp:.3f}" if isinstance(opp, (int, float)) else "—"
        lines.append(
            f"  {row.get('rank', '?')}. {row.get('id', '?')} "
            f"opp={opp_text} {_short_cluster_key(row.get('clusterKey'))}"
        )

    lines.append("- Full report: data/nightly-research-report.md")

    section = "\n".join(lines)
    if len(section) <= max_chars:
        return lines

    # Aggressive trim: drop theme detail first, then shorten clusters further.
    compact = [header]
    compact.append(f"- Themes: {summary.get('themeCount', len(themes))}")
    if summary.get("advicePresent"):
        compact.append(f"- New hyps: {summary.get('authoredHypothesisCount', 0)}")
    compact.append("- Top opportunities:")
    for row in (report.get("topOpportunities") or [])[:3]:
        if not isinstance(row, dict):
            continue
        opp = row.get("opportunityScore")
        opp_text = f"{opp:.3f}" if isinstance(opp, (int, float)) else "—"
        compact.append(
            f"  {row.get('id', '?')} opp={opp_text} "
            f"{_short_cluster_key(row.get('clusterKey'), 24)}"
        )
    compact.append("- data/nightly-research-report.md")
    return compact


def _load_operationally_tainted_trades() -> dict[str, str]:
    """Load the canonical tainted-trade list from data/operationally-tainted-trades.json.

    Shared with scripts/portfolio-ledger.ts and scripts/trader-performance-report.ts
    so the engine, scanner, performance report, and this email report all agree on
    which trade IDs to exclude from totals.
    """
    path = DATA_DIR / "operationally-tainted-trades.json"
    if not path.exists():
        return {}
    try:
        with path.open() as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


OPERATIONALLY_TAINTED_TRADES = _load_operationally_tainted_trades()


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def money(value: float) -> str:
    return f"${value:+.4f}"


def pct(value: float) -> str:
    return f"{value:+.2f}%"


def num(value: Any, default: float = 0.0) -> float:
    try:
        if value in ("", None):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def dedupe_closed_trade_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Keep each trade ID once, using its earliest recorded close."""
    by_id: dict[str, dict[str, str]] = {}
    anonymous_rows: list[dict[str, str]] = []
    for row in rows:
        trade_id = row.get("id")
        if not trade_id:
            anonymous_rows.append(row)
            continue
        existing = by_id.get(trade_id)
        if existing is None:
            by_id[trade_id] = row
            continue
        existing_closed = parse_ts(existing.get("closed_at"))
        candidate_closed = parse_ts(row.get("closed_at"))
        if existing_closed is None or (candidate_closed is not None and candidate_closed < existing_closed):
            by_id[trade_id] = row
    return sorted(
        [*by_id.values(), *anonymous_rows],
        key=lambda row: parse_ts(row.get("closed_at")) or datetime.max.replace(tzinfo=timezone.utc),
    )


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open() as handle:
        return json.load(handle)


def in_window(ts: str | None, start_utc: datetime, end_utc: datetime) -> bool:
    parsed = parse_ts(ts)
    return bool(parsed and start_utc <= parsed < end_utc)


def before_end(ts: str | None, end_utc: datetime) -> bool:
    parsed = parse_ts(ts)
    return bool(parsed and parsed < end_utc)


def is_counted_real_trade(row: dict[str, Any]) -> bool:
    close_reason = row.get("close_reason") or ""
    thesis = row.get("thesis") or ""
    return (
        row.get("id") not in OPERATIONALLY_TAINTED_TRADES
        and close_reason != "data_quality_artifact"
        and "DATA_CORRECTION_ARTIFACT" not in close_reason
        and "NON_LEARNING_CLOSE" not in thesis
        and is_macro_report_trade(row)
    )


def is_monotonic_arb_record(row: dict[str, Any], *, signal_key: str, instrument_key: str) -> bool:
    return row.get(signal_key) == "MONOTONIC_ARB" or row.get(instrument_key) == "pm_package"


def monotonic_arb_accounting(rows: list[dict[str, Any]]) -> dict[str, tuple[float, int]]:
    """Honest all-time split of the monotonic-arb ledger.

    Monotonic packages are risk-free at resolution, so realized losses are by
    definition operational errors (tainted IDs or rows that lost their
    pm_package structure — same contamination rule as portfolio-ledger.ts).
    Returns {"legitimate": (pnl, n), "operational_error": (pnl, n)}.
    """
    legitimate_pnl, legitimate_n = 0.0, 0
    error_pnl, error_n = 0.0, 0
    for row in rows:
        if not is_monotonic_arb_record(row, signal_key="signal_type", instrument_key="instrument_type"):
            continue
        pnl = num(row.get("pnl"))
        if row.get("id") in OPERATIONALLY_TAINTED_TRADES or row.get("instrument_type") != "pm_package":
            error_pnl += pnl
            error_n += 1
        else:
            legitimate_pnl += pnl
            legitimate_n += 1
    return {"legitimate": (legitimate_pnl, legitimate_n), "operational_error": (error_pnl, error_n)}


def is_macro_report_trade(row: dict[str, Any]) -> bool:
    return not is_monotonic_arb_record(row, signal_key="signal_type", instrument_key="instrument_type")


def is_macro_report_position(position: dict[str, Any]) -> bool:
    return not is_monotonic_arb_record(position, signal_key="signalType", instrument_key="instrumentType")


def win_loss(rows: list[dict[str, Any]]) -> tuple[int, int]:
    wins = sum(1 for row in rows if num(row.get("pnl")) >= 0)
    losses = sum(1 for row in rows if num(row.get("pnl")) < 0)
    return wins, losses


def local_hour(ts: str | None, tz: ZoneInfo) -> str:
    parsed = parse_ts(ts)
    if not parsed:
        return "unknown"
    return parsed.astimezone(tz).strftime("%Y-%m-%d %H:00 %Z")


def eastern_hour(ts: str | None) -> str:
    return local_hour(ts, EASTERN_TZ)


def short_label(label: str | None, max_len: int = 120) -> str:
    if not label:
        return "n/a"
    question = label.split(" — ")[-1] if " — " in label else label
    return question[:max_len]


def instrument_label_note(label: str | None, *, asset: str | None = None, max_len: int = 72) -> str:
    """Omit HL/spot labels that only restate asset+venue; keep Polymarket questions."""
    if not label:
        return ""
    text = short_label(label, max_len=max_len)
    lower = text.lower()
    asset_l = (asset or "").lower()
    if "builder dex" in lower or lower.endswith(" perp") or lower.endswith(" spot"):
        return ""
    if asset_l and lower in {asset_l, f"hl {asset_l}", f"{asset_l} spot", f"hl {asset_l} perp"}:
        return ""
    return f" [{text}]"


def hypothesis_lookup(hypotheses: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(hypothesis.get("id")): hypothesis for hypothesis in hypotheses if hypothesis.get("id")}


def setup_signal_label(signal_type: str | None, hypothesis_id: str | None, hypotheses_by_id: dict[str, dict[str, Any]]) -> str:
    signal = signal_type or "unknown"
    if signal not in {"PROMOTED_HYPOTHESIS", "LLM_HYPOTHESIS"}:
        return signal
    hypothesis = hypotheses_by_id.get(hypothesis_id or "")
    setup = hypothesis.get("setupLabel") or hypothesis.get("setupId") if hypothesis else None
    return f"{signal} / {setup}" if setup else signal


def trade_line(row: dict[str, Any], closed: bool, hypotheses_by_id: dict[str, dict[str, Any]]) -> str:
    signal = setup_signal_label(row.get("signal_type"), row.get("hypothesis_id"), hypotheses_by_id)
    label = instrument_label_note(row.get("instrument_label"), asset=row.get("asset"))
    venue = row.get("venue") or "?"
    itype = row.get("instrument_type") or "legacy"
    if closed:
        taint_note = (
            f" | operationally tainted: {OPERATIONALLY_TAINTED_TRADES[row.get('id')]}"
            if row.get("id") in OPERATIONALLY_TAINTED_TRADES else ""
        )
        return (
            f"- {eastern_hour(row.get('closed_at'))} | {row.get('asset')} {row.get('direction')} "
            f"{venue}/{itype} ({signal}) {row.get('close_reason')}: "
            f"{money(num(row.get('pnl')))} / {pct(num(row.get('pnl_pct')))}{label}{taint_note}"
        )
    return (
        f"- {eastern_hour(row.get('opened_at'))} | {row.get('asset')} {row.get('direction')} "
        f"{venue}/{itype} ({signal}) @ {row.get('entry_price')}{label}"
    )


def open_position_pnl(position: dict[str, Any]) -> tuple[float, float]:
    entry = num(position.get("entryPrice"))
    current = num(position.get("currentPrice"), entry)
    size = num(position.get("size"), 1.0)
    leverage = num(position.get("leverage"), 1.0)
    if not entry:
        return 0.0, 0.0
    if position.get("instrumentType") in ("pm_yes", "pm_no"):
        pnl = (size / entry) * (current - entry)
        return pnl, ((current - entry) / entry) * 100
    raw = (current - entry) / entry if position.get("direction") == "long" else (entry - current) / entry
    pnl = size * leverage * raw + num(position.get("fundingPnlAccrued"))
    return pnl, (pnl / size) * 100 if size else 0.0


def open_position_line(position: dict[str, Any], hypotheses_by_id: dict[str, dict[str, Any]]) -> str:
    pnl, pnl_pct = open_position_pnl(position)
    signal = setup_signal_label(position.get("signalType"), position.get("hypothesisId"), hypotheses_by_id)
    label = instrument_label_note(position.get("instrumentLabel"), asset=position.get("asset"))
    venue = position.get("venue") or "?"
    itype = position.get("instrumentType") or "legacy"
    return (
        f"- {eastern_hour(position.get('openedAt'))} | {position.get('asset')} "
        f"{position.get('direction')} {venue}/{itype} ({signal}) "
        f"@ {position.get('entryPrice')} → {position.get('currentPrice')} | "
        f"{money(pnl)} / {pct(pnl_pct)}{label}"
    )


def shadow_line(shadow: dict[str, Any], tz: ZoneInfo, resolved: bool) -> str:
    del tz  # kept for call-site compatibility
    position = shadow.get("position", {})
    label = instrument_label_note(position.get("instrumentLabel"), asset=shadow.get("asset"))
    venue = shadow.get("venue") or "?"
    itype = position.get("instrumentType") or "legacy"
    signal = shadow.get("signalType") or "?"
    if resolved:
        result = shadow.get("hypotheticalResult", {})
        close_trigger = result.get("closeTrigger")
        close_reason = result.get("closeReason")
        close_label = f"{close_reason}/{close_trigger}" if close_trigger else close_reason
        return (
            f"- {eastern_hour(shadow.get('resolvedAt'))} | {shadow.get('asset')} "
            f"{shadow.get('direction')} {venue}/{itype} ({signal}) "
            f"{close_label}: {money(num(result.get('pnl')))} / {pct(num(result.get('pnlPct')))}{label}"
        )
    return (
        f"- {eastern_hour(shadow.get('blockedAt'))} | {shadow.get('asset')} "
        f"{shadow.get('direction')} {venue}/{itype} ({signal}) @ {position.get('entryPrice')}{label}"
    )


def is_macro_report_shadow(shadow: dict[str, Any]) -> bool:
    position = shadow.get("position", {})
    return is_macro_report_position({"signalType": shadow.get("signalType"), "instrumentType": position.get("instrumentType")})


def is_force_closed_one_touch_shadow(shadow: dict[str, Any]) -> bool:
    """Historical one-touch NO shadows force-closed via legacy gate are
    measurement artifacts (family convention is hold-to-expiry; resolver bug
    fixed 2026-07-10 in trading-engine.ts). Prefers hypotheticalResult.closeTrigger
    when present; falls back to thesis edge_disappeared substring for older
    records. Mirror of isForceClosedOneTouchShadow in
    scripts/lib/reporting/report-inputs.ts."""
    if (
        shadow.get("signalType") != "ONE_TOUCH_HIGH_EDGE_NO"
        or shadow.get("blockedReason") != "one_touch_high_edge_shadow"
    ):
        return False
    trigger = (shadow.get("hypotheticalResult") or {}).get("closeTrigger")
    if trigger is not None:
        return trigger == "legacy_gate_force_close"
    return "edge_disappeared" in (shadow.get("thesis") or "")


def _is_llm_skip_note(text: str) -> bool:
    stripped = text.strip().strip("_")
    return stripped.startswith("LLM call skipped")


def journal_sections_for_window(path: Path, start_utc: datetime, end_utc: datetime, tz: ZoneInfo) -> list[str]:
    """Compact journal notes for Telegram: substantive LLM analyses only.

    Lifetime blocked-shadow counters / trend-filter notes and rolling ✅/❌
    shadow-event bullets are omitted — they are not day P&L and drown the report.
    """
    del tz  # window bounds are already UTC
    if not path.exists():
        return []
    text = path.read_text()

    analyses: list[tuple[str, str]] = []  # (header, body)

    chunks = text.split("\n### ")
    for chunk in chunks:
        candidate = chunk.strip()
        if not candidate:
            continue
        first_line = candidate.splitlines()[0]
        parsed = None
        for fmt in ("%Y-%m-%d %H:%M UTC", "%Y-%m-%d"):
            try:
                parsed_naive = datetime.strptime(first_line[:16 if "UTC" in fmt else 10], fmt.replace(" UTC", ""))
                parsed = parsed_naive.replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue
        if not parsed or not (start_utc <= parsed < end_utc):
            continue

        body = "\n".join(candidate.splitlines()[1:]).strip()
        llm_lines: list[str] = []
        mode: str | None = None
        for line in body.splitlines():
            if line.startswith("**LLM analysis:**"):
                mode = "llm"
                continue
            if mode and line.startswith("**") and line.endswith(":**"):
                mode = None
                continue
            if not line.strip() or mode is None:
                continue
            if "MONOTONIC_ARB" in line or "monotonic arb" in line.lower():
                continue
            llm_lines.append(line)

        llm_text = "\n".join(llm_lines).strip()
        if llm_text and not _is_llm_skip_note(llm_text):
            analyses.append((first_line, llm_text))

    if not analyses:
        return []

    out = ["### LLM analyses"]
    for header, llm_text in analyses:
        out.append(f"**{header}**")
        out.append(llm_text)
        out.append("---")
    if out[-1] == "---":
        out.pop()
    return out


def valuation_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    if len(value) == 13 and value[4] == "-" and value[10] == "T":
        return parse_ts(f"{value}:00:00Z")
    return parse_ts(value)


def trade_pnl_pct(entry: float, current: float, direction: str) -> float | None:
    if not entry or not current:
        return None
    raw = ((current - entry) / entry) * 100
    return raw if direction == "long" else -raw


def risk_shape_report_lines(closed_rows: list[dict[str, str]]) -> list[str]:
    learning_params = read_json(DATA_DIR / "learning-params.json", {})
    signal_risk = learning_params.get("signalRisk", {})
    valuation_rows = read_csv(DATA_DIR / "daily-valuations.csv")
    valuations: list[tuple[datetime, dict[str, str]]] = []
    for row in valuation_rows:
        parsed = valuation_ts(row.get("date"))
        if parsed:
            valuations.append((parsed, row))

    price_cols = {
        "BTC": "btc_spot",
        "HYPE": "hype_spot",
        "GOLD": "gold_gc_spot",
        "OIL": "oil_wti_spot",
        "AMZN": "amzn_hl_perp",
    }
    signals = ["FUNDING_EXTREME_LONG", "FUNDING_EXTREME_SHORT", "PC_RATIO_EXTREME_HIGH", "PC_RATIO_EXTREME_LOW"]
    targets = [2, 3, 4, 5, 6]

    def replay(row: dict[str, str], target_pct: float, stop_pct: float) -> float | None:
        asset = row.get("asset", "")
        col = price_cols.get(asset)
        opened = parse_ts(row.get("opened_at"))
        closed = parse_ts(row.get("closed_at"))
        entry = num(row.get("entry_price"))
        if not col or not opened or not closed or not entry:
            return None
        path = [(dt, val_row) for dt, val_row in valuations if opened <= dt <= closed]
        exit_price = num(row.get("exit_price"))
        for dt, val_row in sorted(path, key=lambda item: item[0]):
            current = num(val_row.get(col), 0.0)
            pnl = trade_pnl_pct(entry, current, row.get("direction", ""))
            if pnl is None:
                continue
            if pnl >= target_pct:
                return target_pct
            if pnl <= -stop_pct:
                return -stop_pct
        final_pnl = trade_pnl_pct(entry, exit_price, row.get("direction", ""))
        return final_pnl if final_pnl is not None else num(row.get("pnl_pct"))

    lines = [
        "## Risk Shape Replay",
        "Target replay uses previous-day closed trades only, hourly valuation marks, excludes data-correction artifacts, and keeps current stops unchanged.",
    ]
    for signal in signals:
        rows = [
            row for row in closed_rows
            if row.get("signal_type") == signal and is_macro_report_trade(row) and "DATA_CORRECTION_ARTIFACT" not in (row.get("close_reason") or "")
            and row.get("id") not in OPERATIONALLY_TAINTED_TRADES
        ]
        if not rows:
            continue
        stop_pct = num((signal_risk.get(signal) or {}).get("stopPct"))
        actual_pnl = sum(num(row.get("pnl")) for row in rows)
        actual_wins = sum(1 for row in rows if num(row.get("pnl")) >= 0)
        replay_parts = []
        best_target = None
        best_pnl = float("-inf")
        for target in targets:
            replayed = [replay(row, target, stop_pct) for row in rows]
            replayed = [value for value in replayed if value is not None]
            pnl = sum(value / 100 for value in replayed)
            wins = sum(1 for value in replayed if value >= 0)
            replay_parts.append(f"+{target}%: {money(pnl)} ({wins}/{len(replayed)}W)")
            if pnl > best_pnl:
                best_pnl = pnl
                best_target = target
        lines.append(
            f"- {signal}: actual {money(actual_pnl)} ({actual_wins}/{len(rows)}W), "
            f"best replay +{best_target}% {money(best_pnl)} | " + "; ".join(replay_parts)
        )
    return lines


@dataclass
class ReportWindow:
    report_date: datetime
    start_utc: datetime
    end_utc: datetime
    tz: ZoneInfo


def get_report_window(date_arg: str | None, tz_name: str) -> ReportWindow:
    tz = ZoneInfo(tz_name)
    if date_arg:
        local_date = datetime.strptime(date_arg, "%Y-%m-%d").date()
    else:
        local_date = (datetime.now(tz).date() - timedelta(days=1))
    start_local = datetime.combine(local_date, time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return ReportWindow(
        report_date=start_local,
        start_utc=start_local.astimezone(timezone.utc),
        end_utc=end_local.astimezone(timezone.utc),
        tz=tz,
    )


def build_report(window: ReportWindow) -> str:
    raw_closed_rows = read_csv(DATA_DIR / "trades-detailed.csv")
    closed_rows = dedupe_closed_trade_rows(raw_closed_rows)
    portfolio = read_json(DATA_DIR / "portfolio.json", {"positions": []})
    shadows = read_json(DATA_DIR / "blocked-signals.json", [])
    hypotheses = read_json(DATA_DIR / "hypotheses.json", [])
    duplicate_closed_trade_rows = len(raw_closed_rows) - len(closed_rows)

    closed_trade_ids = {row.get("id") for row in closed_rows if row.get("id")}
    macro_closed_rows = [row for row in closed_rows if is_macro_report_trade(row)]
    closed_trades = [row for row in macro_closed_rows if in_window(row.get("closed_at"), window.start_utc, window.end_utc)]
    counted_closed_trades = [row for row in closed_trades if is_counted_real_trade(row)]
    tainted_closed_trades = [row for row in closed_trades if row.get("id") in OPERATIONALLY_TAINTED_TRADES]
    cumulative_counted_trades = [
        row for row in macro_closed_rows
        if is_counted_real_trade(row) and before_end(row.get("closed_at"), window.end_utc)
    ]
    opened_real_from_closed = [row for row in macro_closed_rows if in_window(row.get("opened_at"), window.start_utc, window.end_utc)]
    open_positions = [
        position for position in portfolio.get("positions", [])
        if position.get("id") not in closed_trade_ids and is_macro_report_position(position)
    ]
    opened_real_current = [
        {
            "opened_at": p.get("openedAt"),
            "asset": p.get("asset"),
            "venue": p.get("venue"),
            "direction": p.get("direction"),
            "instrument_type": p.get("instrumentType"),
            "signal_type": p.get("signalType"),
            "hypothesis_id": p.get("hypothesisId"),
            "entry_price": p.get("entryPrice"),
            "instrument_label": p.get("instrumentLabel"),
        }
        for p in open_positions
        if in_window(p.get("openedAt"), window.start_utc, window.end_utc)
    ]
    opened_real = opened_real_from_closed + opened_real_current

    monotonic_rows_to_date = [
        row for row in closed_rows
        if not is_macro_report_trade(row) and before_end(row.get("closed_at"), window.end_utc)
    ]
    monotonic_accounting = monotonic_arb_accounting(monotonic_rows_to_date)

    reportable_shadows = [
        s for s in shadows
        if is_macro_report_shadow(s) and not is_force_closed_one_touch_shadow(s) and not s.get("learningExcluded")
    ]
    opened_shadows = [s for s in reportable_shadows if in_window(s.get("blockedAt"), window.start_utc, window.end_utc)]
    resolved_shadows = [s for s in reportable_shadows if in_window(s.get("resolvedAt"), window.start_utc, window.end_utc)]

    realized = sum(num(row.get("pnl")) for row in closed_trades)
    counted_realized = sum(num(row.get("pnl")) for row in counted_closed_trades)
    cumulative_counted_realized = sum(num(row.get("pnl")) for row in cumulative_counted_trades)
    daily_wins, daily_losses = win_loss(counted_closed_trades)
    cumulative_wins, cumulative_losses = win_loss(cumulative_counted_trades)
    portfolio_realized = num(portfolio.get("totalRealizedPnl"))
    portfolio_wins = int(num(portfolio.get("winCount")))
    portfolio_losses = int(num(portfolio.get("lossCount")))
    portfolio_trades = int(num(portfolio.get("totalTrades")))
    shadow_realized = sum(num((shadow.get("hypotheticalResult") or {}).get("pnl")) for shadow in resolved_shadows)
    open_unrealized = sum(open_position_pnl(position)[0] for position in open_positions)

    llm_sections = journal_sections_for_window(DATA_DIR / "learning-journal.md", window.start_utc, window.end_utc, window.tz)
    hypotheses_by_id = hypothesis_lookup(hypotheses)
    hypothesis_status = defaultdict(int)
    pending_tests = 0
    for hypothesis in hypotheses:
        hypothesis_status[hypothesis.get("status", "unknown")] += 1
        pending_tests += sum(1 for test in hypothesis.get("tests", []) if test.get("outcome") == "pending")

    lines = [
        f"# Polymarket Trader Daily Report — {window.report_date.strftime('%Y-%m-%d')} ({window.tz.key})",
        "",
        *core_loop_health_lines(now_utc=datetime.now(timezone.utc)),
        "",
        "## Summary",
        f"- Real trades opened: {len(opened_real)}",
        f"- Real trades closed: {len(closed_trades)} ({len(counted_closed_trades)} counted) | "
        f"realized P&L {money(realized)} (counted {money(counted_realized)})",
        f"- Real trade W/L counted today: {daily_wins}W/{daily_losses}L",
        f"- Open now: {len(open_positions)} | unrealized {money(open_unrealized)}",
        f"- Shadow: opened {len(opened_shadows)}, resolved {len(resolved_shadows)} | {money(shadow_realized)}",
        f"- Lifetime counted: {money(cumulative_counted_realized)} "
        f"({len(cumulative_counted_trades)} trades, {cumulative_wins}W/{cumulative_losses}L)",
        f"- Portfolio audit: {money(portfolio_realized)} "
        f"({portfolio_trades} trades, {portfolio_wins}W/{portfolio_losses}L)",
        f"- Monotonic arb (excl.): legit {money(monotonic_accounting['legitimate'][0])} "
        f"on {monotonic_accounting['legitimate'][1]} | "
        f"ops-error {money(monotonic_accounting['operational_error'][0])} "
        f"on {monotonic_accounting['operational_error'][1]}",
        f"- Hypotheses: {dict(hypothesis_status)} | pending tests {pending_tests}",
        disk_usage_line(),
    ]
    if duplicate_closed_trade_rows:
        lines.append(f"- Duplicate closed-trade rows removed: {duplicate_closed_trade_rows}")
    if tainted_closed_trades:
        lines.append(f"- Operationally tainted closes today: {len(tainted_closed_trades)}")
    neon_line = neon_parity_line(DATA_DIR / "neon-parity.json", datetime.now(timezone.utc))
    if neon_line:
        lines.append(neon_line)
    lines.extend(["", *nightly_research_loop_lines()])

    lines.extend(["", "## Real Trades Opened"])
    lines.extend(trade_line(row, closed=False, hypotheses_by_id=hypotheses_by_id) for row in opened_real) if opened_real else lines.append("- None")

    lines.extend(["", "## Real Trades Closed"])
    lines.extend(trade_line(row, closed=True, hypotheses_by_id=hypotheses_by_id) for row in closed_trades) if closed_trades else lines.append("- None")

    lines.extend(["", "## Current Open Real Positions"])
    lines.extend(open_position_line(position, hypotheses_by_id) for position in open_positions) if open_positions else lines.append("- None")

    lines.extend(["", "## Shadow Trades Opened"])
    lines.extend(shadow_line(shadow, window.tz, resolved=False) for shadow in opened_shadows) if opened_shadows else lines.append("- None")

    lines.extend(["", "## Shadow Trades Resolved"])
    lines.extend(shadow_line(shadow, window.tz, resolved=True) for shadow in resolved_shadows) if resolved_shadows else lines.append("- None")

    risk_lines = risk_shape_report_lines(closed_trades)
    # Header + explanatory line only — skip empty replay days.
    if len(risk_lines) > 2:
        lines.extend(["", *risk_lines])

    lines.extend(["", "## LLM Findings / Learning Notes"])
    if llm_sections:
        lines.extend(llm_sections)
    else:
        lines.append("- No LLM journal sections found for this date.")

    return "\n".join(lines) + "\n"


def send_email(subject: str, body: str) -> bool:
    to_addr = os.getenv("DAILY_REPORT_EMAIL_TO")
    if not to_addr:
        return False

    from_addr = os.getenv("DAILY_REPORT_EMAIL_FROM") or os.getenv("SMTP_USER") or to_addr
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")

    if not host or not user or not password:
        raise RuntimeError("DAILY_REPORT_EMAIL_TO is set, but SMTP_HOST/SMTP_USER/SMTP_PASSWORD are missing.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_addr
    message.set_content(body)

    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls(context=context)
            smtp.login(user, password)
            smtp.send_message(message)
    return True


def telegram_chunks(text: str, max_len: int = 3900) -> list[str]:
    chunks = []
    remaining = text
    while len(remaining) > max_len:
        split_at = remaining.rfind("\n", 0, max_len)
        if split_at < max_len // 2:
            split_at = max_len
        chunks.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


def send_telegram(subject: str, body: str) -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    chunks = telegram_chunks(f"{subject}\n\n{body}")
    for idx, chunk in enumerate(chunks, start=1):
        prefix = f"Part {idx}/{len(chunks)}\n\n" if len(chunks) > 1 else ""
        payload = urllib.parse.urlencode(
            {
                "chat_id": chat_id,
                "text": prefix + chunk,
                "disable_web_page_preview": "true",
            }
        ).encode()
        request = urllib.request.Request(url, data=payload, method="POST")
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status >= 400:
                raise RuntimeError(f"Telegram send failed with HTTP {response.status}.")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Local report date, YYYY-MM-DD. Defaults to previous local day.")
    parser.add_argument("--dry-run", action="store_true", help="Print report and do not send.")
    parser.add_argument("--no-email", action="store_true", help="Write report file but skip all outbound delivery.")
    args = parser.parse_args()

    tz_name = os.getenv("DAILY_REPORT_TZ", "America/New_York")
    window = get_report_window(args.date, tz_name)
    report = build_report(window)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / f"trader-report-{window.report_date.strftime('%Y-%m-%d')}.md"
    report_path.write_text(report)

    subject = f"Polymarket Trader Daily Report — {window.report_date.strftime('%Y-%m-%d')}"
    if args.dry_run:
        print(report)
        print(f"\n[report written to {report_path}]")
        return
    if args.no_email:
        print(f"Report written to {report_path}; outbound delivery skipped.")
        return

    sent_telegram = send_telegram(subject, report)
    sent_email = send_email(subject, report)
    if sent_telegram and sent_email:
        print(f"Report sent to Telegram/email and written to {report_path}.")
    elif sent_telegram:
        print(f"Report sent to Telegram and written to {report_path}.")
    elif sent_email:
        print(f"Report emailed and written to {report_path}.")
    else:
        print(f"Report written to {report_path}; Telegram/email credentials not set, delivery skipped.")


if __name__ == "__main__":
    main()
