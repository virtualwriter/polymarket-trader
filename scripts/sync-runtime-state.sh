#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 user@host:/opt/polymarket-trader [local-dir] [--include-live-state]" >&2
  exit 2
}

REMOTE_REPO="${1:-}"
LOCAL_DIR="${2:-.}"
INCLUDE_LIVE_STATE="${3:-}"

[[ -n "$REMOTE_REPO" ]] || usage
[[ "$REMOTE_REPO" == *:* ]] || usage
if [[ -n "$INCLUDE_LIVE_STATE" && "$INCLUDE_LIVE_STATE" != "--include-live-state" ]]; then
  usage
fi

REMOTE_HOST="${REMOTE_REPO%%:*}"
LOCAL_DIR="${LOCAL_DIR%/}"

mkdir -p "$LOCAL_DIR/data" "$LOCAL_DIR/.runtime"

echo "Syncing ignored local config and generated analysis files from $REMOTE_REPO"
rsync -avz "$REMOTE_REPO/config.env" "$LOCAL_DIR/config.env"
rsync -avz --ignore-missing-args "$REMOTE_REPO/data/instrument-snapshots.jsonl" "$LOCAL_DIR/data/"
rsync -avz --ignore-missing-args "$REMOTE_REPO/data/instrument-snapshot-archives/" "$LOCAL_DIR/data/instrument-snapshot-archives/"
rsync -avz --ignore-missing-args "$REMOTE_REPO/data/daily-email-reports/" "$LOCAL_DIR/data/daily-email-reports/"

if [[ "$INCLUDE_LIVE_STATE" == "--include-live-state" ]]; then
  echo "Syncing production live state from $REMOTE_HOST:/var/lib/polymarket-trader"
  rsync -avz --ignore-missing-args "$REMOTE_HOST:/var/lib/polymarket-trader/portfolio-live.json" "$LOCAL_DIR/.runtime/portfolio-live.json"
  rsync -avz --ignore-missing-args "$REMOTE_HOST:/var/lib/polymarket-trader/pending-closed-trades.jsonl" "$LOCAL_DIR/.runtime/pending-closed-trades.jsonl"
  echo "Do not run live trader processes on two machines at the same time."
fi

echo "Done. These files are intentionally ignored by Git."
