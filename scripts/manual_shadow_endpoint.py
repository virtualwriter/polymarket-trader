#!/usr/bin/env python3
"""
Small authenticated HTTP endpoint for adding manual IV-touch shadow trades.

The public heatmap calls a Vercel API proxy, and the proxy forwards the request
here with a bearer token. The endpoint appends the shadow using the existing
script, then commits and pushes the state file so the shadow survives deploys.
"""
import json
import os
import subprocess
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parents[1]
HEATMAP_LATEST_PATH = ROOT / "relative-value" / "latest.json"
HEATMAP_LIVE_PATH = ROOT / "relative-value" / "latest-live.json"
ALLOWED_SIDES = {"yes", "no"}
ALLOWED_SIGNALS = {"USER_PM_IV_TOUCH_RICH_NO", "USER_PM_IV_TOUCH_CHEAP_YES"}
REQUEST_LOCK = threading.Lock()
HEATMAP_REFRESH_LOCK = threading.Lock()
HEATMAP_REFRESH_STATUS: Dict[str, Any] = {
    "status": "idle",
    "startedAt": None,
    "finishedAt": None,
    "output": "",
    "error": "",
}


def run(command: list[str]) -> str:
    proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    output = (proc.stdout + proc.stderr).strip()
    if proc.returncode != 0:
        raise RuntimeError(output or f"{command[0]} failed with exit code {proc.returncode}")
    return output


def clean_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    event = str(payload.get("event", ""))
    market_id = str(payload.get("marketId", ""))
    side = str(payload.get("side", "")).lower()
    signal_type = str(payload.get("signalType", ""))
    reason = str(payload.get("reason", ""))[:500]

    if not event.replace("-", "").isalnum():
        raise ValueError("Invalid event slug")
    if not market_id.isdigit():
        raise ValueError("Invalid market ID")
    if side not in ALLOWED_SIDES:
        raise ValueError("Invalid side")
    if signal_type not in ALLOWED_SIGNALS:
        raise ValueError("Invalid signal type")
    heatmap_row_snapshot = payload.get("heatmapRowSnapshot")
    if heatmap_row_snapshot is not None and not isinstance(heatmap_row_snapshot, dict):
        raise ValueError("Invalid heatmap row snapshot")
    return {
        "event": event,
        "marketId": market_id,
        "side": side,
        "signalType": signal_type,
        "reason": reason,
        "heatmapRowSnapshot": heatmap_row_snapshot,
    }


def add_shadow(payload: Dict[str, Any]) -> Dict[str, Any]:
    command = [
        "python3",
        "scripts/add_manual_iv_touch_shadow.py",
        "--event",
        payload["event"],
        "--market-id",
        payload["marketId"],
        "--side",
        payload["side"],
        "--signal-type",
        payload["signalType"],
        "--reason",
        payload["reason"],
    ]
    if payload.get("heatmapRowSnapshot"):
        command.extend(
            [
                "--heatmap-row-json",
                json.dumps(payload["heatmapRowSnapshot"], separators=(",", ":")),
            ]
        )
    output = run(command)

    run(["git", "add", "data/blocked-signals.json"])
    status = run(["git", "status", "--porcelain", "data/blocked-signals.json"])
    if status:
        message = f"Add manual IV-touch shadow {payload['marketId']}"
        env = os.environ.copy()
        env.update(
            {
                "GIT_AUTHOR_NAME": env.get("GIT_AUTHOR_NAME", "virtualwriter"),
                "GIT_AUTHOR_EMAIL": env.get("GIT_AUTHOR_EMAIL", "37585392+virtualwriter@users.noreply.github.com"),
                "GIT_COMMITTER_NAME": env.get("GIT_COMMITTER_NAME", "virtualwriter"),
                "GIT_COMMITTER_EMAIL": env.get("GIT_COMMITTER_EMAIL", "37585392+virtualwriter@users.noreply.github.com"),
            }
        )
        proc = subprocess.run(
            ["git", "commit", "-m", message],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stdout + proc.stderr).strip() or "git commit failed")
        run(["git", "pull", "--rebase", "--autostash", "origin", "main"])
        run(["git", "push", "origin", "HEAD:main"])

    return {"ok": True, "output": output}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def heatmap_path_to_serve() -> Path:
    if HEATMAP_LIVE_PATH.exists() and (
        not HEATMAP_LATEST_PATH.exists()
        or HEATMAP_LIVE_PATH.stat().st_mtime >= HEATMAP_LATEST_PATH.stat().st_mtime
    ):
        return HEATMAP_LIVE_PATH
    return HEATMAP_LATEST_PATH


def refresh_heatmap_live() -> None:
    with HEATMAP_REFRESH_LOCK:
        HEATMAP_REFRESH_STATUS.update(
            {
                "status": "running",
                "startedAt": now_iso(),
                "finishedAt": None,
                "output": "",
                "error": "",
            }
        )
        command = [
            "python3",
            "scripts/cross_venue_relative_value_report.py",
            "--live-quotes",
            "--live-hyperliquid",
            "--latest-json",
            str(HEATMAP_LIVE_PATH),
            "--skip-csv",
            "--skip-html",
            "--no-archive",
        ]
        timeout_seconds = int(os.environ.get("HEATMAP_LIVE_REFRESH_TIMEOUT_SECONDS", "180"))
        try:
            proc = subprocess.run(
                command,
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=timeout_seconds,
                check=False,
            )
            output = (proc.stdout + proc.stderr).strip()[-4000:]
            if proc.returncode != 0:
                raise RuntimeError(output or f"heatmap refresh failed with exit code {proc.returncode}")
            HEATMAP_REFRESH_STATUS.update(
                {
                    "status": "ok",
                    "finishedAt": now_iso(),
                    "output": output,
                    "error": "",
                }
            )
        except Exception as exc:
            HEATMAP_REFRESH_STATUS.update(
                {
                    "status": "error",
                    "finishedAt": now_iso(),
                    "output": "",
                    "error": str(exc),
                }
            )


def start_heatmap_refresh() -> Dict[str, Any]:
    if HEATMAP_REFRESH_LOCK.locked():
        return {"ok": True, "status": "already_running", "refresh": HEATMAP_REFRESH_STATUS}
    thread = threading.Thread(target=refresh_heatmap_live, daemon=True)
    thread.start()
    return {"ok": True, "status": "started", "refresh": HEATMAP_REFRESH_STATUS}


class Handler(BaseHTTPRequestHandler):
    server_version = "ManualShadowEndpoint/1.0"

    def send_json(self, status: int, data: Dict[str, Any]) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self) -> bool:
        expected = os.environ.get("MANUAL_SHADOW_API_TOKEN", "")
        auth = self.headers.get("Authorization", "")
        return bool(expected and auth == f"Bearer {expected}")

    def send_file_json(self, path: Path) -> None:
        if not path.exists():
            self.send_json(404, {"error": "Heatmap latest JSON not found"})
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"status": "ok"})
            return
        if self.path == "/heatmap/latest":
            if not self.authorized():
                self.send_json(401, {"error": "Unauthorized"})
                return
            self.send_file_json(heatmap_path_to_serve())
            return
        if self.path == "/heatmap/refresh-status":
            if not self.authorized():
                self.send_json(401, {"error": "Unauthorized"})
                return
            self.send_json(200, {"ok": True, "refresh": HEATMAP_REFRESH_STATUS})
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path == "/heatmap/refresh":
            if not self.authorized():
                self.send_json(401, {"error": "Unauthorized"})
                return
            self.send_json(202, start_heatmap_refresh())
            return
        if self.path != "/manual-shadow":
            self.send_json(404, {"error": "Not found"})
            return
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 100_000:
                raise ValueError("Invalid request length")
            payload = clean_payload(json.loads(self.rfile.read(length)))
            with REQUEST_LOCK:
                self.send_json(200, add_shadow(payload))
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


def main() -> None:
    host = os.environ.get("MANUAL_SHADOW_HOST", "0.0.0.0")
    port = int(os.environ.get("MANUAL_SHADOW_PORT", "8787"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Manual shadow endpoint listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
