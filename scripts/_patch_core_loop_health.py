#!/usr/bin/env python3
"""One-shot: add Core Loop health to daily Telegram report + trader heartbeat."""
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


HELPER = r'''
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


'''


WRAPPER_HEARTBEAT = r'''
# Heartbeat for daily Telegram "Core Loop running" health.
python3 - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path
path = Path("data/core-loop-heartbeat.json")
path.write_text(
    json.dumps(
        {
            "completedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "service": "polymarket-trader",
            "ok": True,
        },
        indent=2,
    )
    + "\n"
)
print(f"Wrote {path}")
PY
git add -f data/core-loop-heartbeat.json || true

'''


def patch_daily_report(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "import re\n" not in text:
        text = text.replace("import argparse\n", "import argparse\nimport re\n", 1)

    anchor = "def _short_cluster_key(cluster_key: str | None, max_len: int = 36) -> str:"
    if "def core_loop_health_lines(" not in text:
        if anchor not in text:
            raise SystemExit(f"anchor missing in {path}")
        text = text.replace(anchor, HELPER + anchor, 1)

    old = (
        '    lines = [\n'
        '        f"# Polymarket Trader Daily Report — {window.report_date.strftime(\'%Y-%m-%d\')} ({window.tz.key})",\n'
        '        "",\n'
        '        "## Summary",\n'
    )
    new = (
        '    lines = [\n'
        '        f"# Polymarket Trader Daily Report — {window.report_date.strftime(\'%Y-%m-%d\')} ({window.tz.key})",\n'
        '        "",\n'
        '        *core_loop_health_lines(now_utc=datetime.now(timezone.utc)),\n'
        '        "",\n'
        '        "## Summary",\n'
    )
    if "*core_loop_health_lines(" not in text:
        if old not in text:
            raise SystemExit(f"build_report anchor missing in {path}")
        text = text.replace(old, new, 1)

    path.write_text(text, encoding="utf-8")
    print(f"patched {path}")


def patch_wrapper(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    marker = 'echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Completed polymarket trader run"'
    if "core-loop-heartbeat.json" not in text:
        if marker not in text:
            raise SystemExit(f"wrapper marker missing in {path}")
        text = text.replace(marker, WRAPPER_HEARTBEAT + marker, 1)
        path.write_text(text, encoding="utf-8")
        print(f"patched {path}")
    else:
        print(f"already patched {path}")


def main() -> int:
    daily = REPO / "scripts" / "daily_trader_email_report.py"
    wrapper = REPO / "scripts" / "run-polymarket-trader.sh"
    patch_daily_report(daily)
    patch_wrapper(wrapper)
    bin_path = Path("/usr/local/bin/run-polymarket-trader")
    if bin_path.parent.is_dir():
        bin_path.write_text(wrapper.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"synced {bin_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
