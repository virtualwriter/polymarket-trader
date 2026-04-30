#!/usr/bin/env python3
"""Build and optionally send a daily paper-trader report.

The report window is the previous calendar day in DAILY_REPORT_TZ
(default: America/New_York). It summarizes real trades, shadow trades,
current open positions, and LLM learning notes from the journal.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
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


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
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


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open() as handle:
        return json.load(handle)


def in_window(ts: str | None, start_utc: datetime, end_utc: datetime) -> bool:
    parsed = parse_ts(ts)
    return bool(parsed and start_utc <= parsed < end_utc)


def local_hour(ts: str | None, tz: ZoneInfo) -> str:
    parsed = parse_ts(ts)
    if not parsed:
        return "unknown"
    return parsed.astimezone(tz).strftime("%Y-%m-%d %H:00 %Z")


def short_label(label: str | None, max_len: int = 120) -> str:
    if not label:
        return "n/a"
    question = label.split(" — ")[-1] if " — " in label else label
    return question[:max_len]


def trade_line(row: dict[str, Any], tz: ZoneInfo, closed: bool) -> str:
    if closed:
        return (
            f"- {local_hour(row.get('closed_at'), tz)} | CLOSED | {row.get('asset')} "
            f"{row.get('direction')} via {row.get('venue')}/{row.get('instrument_type') or 'legacy'} "
            f"({row.get('signal_type')}) {row.get('close_reason')}: "
            f"{money(num(row.get('pnl')))} / {pct(num(row.get('pnl_pct')))} "
            f"[{short_label(row.get('instrument_label'))}]"
        )
    return (
        f"- {local_hour(row.get('opened_at'), tz)} | OPENED | {row.get('asset')} "
        f"{row.get('direction')} via {row.get('venue')}/{row.get('instrument_type') or 'legacy'} "
        f"({row.get('signal_type')}) @ {row.get('entry_price')} "
        f"[{short_label(row.get('instrument_label'))}]"
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


def open_position_line(position: dict[str, Any], tz: ZoneInfo) -> str:
    pnl, pnl_pct = open_position_pnl(position)
    return (
        f"- {local_hour(position.get('openedAt'), tz)} | OPEN | {position.get('asset')} "
        f"{position.get('direction')} via {position.get('venue')}/{position.get('instrumentType') or 'legacy'} "
        f"({position.get('signalType')}) @ {position.get('entryPrice')} "
        f"mark {position.get('currentPrice')} | {money(pnl)} / {pct(pnl_pct)} "
        f"[{short_label(position.get('instrumentLabel'))}]"
    )


def shadow_line(shadow: dict[str, Any], tz: ZoneInfo, resolved: bool) -> str:
    position = shadow.get("position", {})
    if resolved:
        result = shadow.get("hypotheticalResult", {})
        learnable = "excluded" if shadow.get("learningExcluded") else "learnable"
        return (
            f"- {local_hour(shadow.get('resolvedAt'), tz)} | RESOLVED | {shadow.get('asset')} "
            f"{shadow.get('direction')} via {shadow.get('venue')}/{position.get('instrumentType') or 'legacy'} "
            f"{shadow.get('blockedReason')} ({shadow.get('signalType')}) "
            f"{result.get('closeReason')}: {money(num(result.get('pnl')))} / {pct(num(result.get('pnlPct')))} "
            f"[{short_label(position.get('instrumentLabel'))}] ({learnable})"
        )
    return (
        f"- {local_hour(shadow.get('blockedAt'), tz)} | OPENED | {shadow.get('asset')} "
        f"{shadow.get('direction')} via {shadow.get('venue')}/{position.get('instrumentType') or 'legacy'} "
        f"{shadow.get('blockedReason')} ({shadow.get('signalType')}) @ {position.get('entryPrice')} "
        f"[{short_label(position.get('instrumentLabel'))}]"
    )


def journal_sections_for_window(path: Path, start_utc: datetime, end_utc: datetime, tz: ZoneInfo) -> list[str]:
    if not path.exists():
        return []
    text = path.read_text()
    sections = []
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
        if parsed and start_utc <= parsed < end_utc:
            body = "\n".join(candidate.splitlines()[1:]).strip()
            summary_lines = []
            capture = False
            for line in body.splitlines():
                if line.startswith("**LLM analysis:**") or line.startswith("**Blocked signal learning:**"):
                    capture = True
                    summary_lines.append(line)
                    continue
                if capture and line.startswith("**") and line.endswith(":**"):
                    capture = False
                if capture and line.strip():
                    summary_lines.append(line)
            if summary_lines:
                sections.append(f"### {first_line}\n" + "\n".join(summary_lines[:24]))
    return sections


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
    closed_rows = read_csv(DATA_DIR / "trades-detailed.csv")
    portfolio = read_json(DATA_DIR / "portfolio.json", {"positions": []})
    shadows = read_json(DATA_DIR / "blocked-signals.json", [])
    hypotheses = read_json(DATA_DIR / "hypotheses.json", [])

    closed_trades = [row for row in closed_rows if in_window(row.get("closed_at"), window.start_utc, window.end_utc)]
    opened_real_from_closed = [row for row in closed_rows if in_window(row.get("opened_at"), window.start_utc, window.end_utc)]
    open_positions = portfolio.get("positions", [])
    opened_real_current = [
        {
            "opened_at": p.get("openedAt"),
            "asset": p.get("asset"),
            "venue": p.get("venue"),
            "direction": p.get("direction"),
            "instrument_type": p.get("instrumentType"),
            "signal_type": p.get("signalType"),
            "entry_price": p.get("entryPrice"),
            "instrument_label": p.get("instrumentLabel"),
        }
        for p in open_positions
        if in_window(p.get("openedAt"), window.start_utc, window.end_utc)
    ]
    opened_real = opened_real_from_closed + opened_real_current

    opened_shadows = [s for s in shadows if in_window(s.get("blockedAt"), window.start_utc, window.end_utc)]
    resolved_shadows = [s for s in shadows if in_window(s.get("resolvedAt"), window.start_utc, window.end_utc)]

    realized = sum(num(row.get("pnl")) for row in closed_trades)
    shadow_realized = sum(num((shadow.get("hypotheticalResult") or {}).get("pnl")) for shadow in resolved_shadows)
    open_unrealized = sum(open_position_pnl(position)[0] for position in open_positions)

    by_hour: dict[str, dict[str, float]] = defaultdict(lambda: {"closed": 0, "closed_pnl": 0, "shadow": 0, "shadow_pnl": 0})
    for row in closed_trades:
        key = local_hour(row.get("closed_at"), window.tz)
        by_hour[key]["closed"] += 1
        by_hour[key]["closed_pnl"] += num(row.get("pnl"))
    for shadow in resolved_shadows:
        key = local_hour(shadow.get("resolvedAt"), window.tz)
        by_hour[key]["shadow"] += 1
        by_hour[key]["shadow_pnl"] += num((shadow.get("hypotheticalResult") or {}).get("pnl"))

    llm_sections = journal_sections_for_window(DATA_DIR / "learning-journal.md", window.start_utc, window.end_utc, window.tz)
    hypothesis_status = defaultdict(int)
    pending_tests = 0
    for hypothesis in hypotheses:
        hypothesis_status[hypothesis.get("status", "unknown")] += 1
        pending_tests += sum(1 for test in hypothesis.get("tests", []) if test.get("outcome") == "pending")

    lines = [
        f"# Polymarket Trader Daily Report — {window.report_date.strftime('%Y-%m-%d')} ({window.tz.key})",
        "",
        "## Summary",
        f"- Real trades opened: {len(opened_real)}",
        f"- Real trades closed: {len(closed_trades)} | realized P&L {money(realized)}",
        f"- Current open real positions: {len(open_positions)} | unrealized P&L {money(open_unrealized)}",
        f"- Shadow trades opened: {len(opened_shadows)}",
        f"- Shadow trades resolved: {len(resolved_shadows)} | shadow P&L {money(shadow_realized)}",
        f"- Portfolio realized P&L total: {money(num(portfolio.get('totalRealizedPnl')))}",
        f"- Portfolio win rate: {portfolio.get('winCount', 0)}/{portfolio.get('totalTrades', 0)}",
        f"- Hypotheses: {dict(hypothesis_status)} | pending tests {pending_tests}",
        "",
        "## Hourly Closed P&L",
    ]
    if by_hour:
        for hour_key in sorted(by_hour):
            row = by_hour[hour_key]
            lines.append(
                f"- {hour_key}: real closes {int(row['closed'])} ({money(row['closed_pnl'])}), "
                f"shadow resolves {int(row['shadow'])} ({money(row['shadow_pnl'])})"
            )
    else:
        lines.append("- No real or shadow closes.")

    lines.extend(["", "## Real Trades Opened"])
    lines.extend(trade_line(row, window.tz, closed=False) for row in opened_real) if opened_real else lines.append("- None")

    lines.extend(["", "## Real Trades Closed"])
    lines.extend(trade_line(row, window.tz, closed=True) for row in closed_trades) if closed_trades else lines.append("- None")

    lines.extend(["", "## Current Open Real Positions"])
    lines.extend(open_position_line(position, window.tz) for position in open_positions) if open_positions else lines.append("- None")

    lines.extend(["", "## Shadow Trades Opened"])
    lines.extend(shadow_line(shadow, window.tz, resolved=False) for shadow in opened_shadows) if opened_shadows else lines.append("- None")

    lines.extend(["", "## Shadow Trades Resolved"])
    lines.extend(shadow_line(shadow, window.tz, resolved=True) for shadow in resolved_shadows) if resolved_shadows else lines.append("- None")

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
