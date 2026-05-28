#!/usr/bin/env bash
# Pull the Hyperliquid hybrid bot state files from the VPS into data/.
# Skips the network round-trip when local files are fresh (< STALE_SECS old)
# and fetches both files over a single SSH connection.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/data"
mkdir -p "$DATA_DIR"

HOST="${HYBRID_SYNC_HOST:-root@96.30.198.111}"
REMOTE_DIR="${HYBRID_SYNC_REMOTE_DIR:-/var/lib/polymarket-trader}"
STALE_SECS="${HYBRID_SYNC_STALE_SECS:-120}"

STATE_FILE="$DATA_DIR/hyperliquid-hybrid-state.json"
TRADES_FILE="$DATA_DIR/hyperliquid-hybrid-trades.jsonl"

is_fresh() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  local mtime now age
  mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
  now=$(date +%s)
  age=$(( now - mtime ))
  (( age < STALE_SECS ))
}

if is_fresh "$STATE_FILE" && is_fresh "$TRADES_FILE"; then
  exit 0
fi

# One SSH round-trip: tar both files and stream to a local extract.
ssh -o ControlMaster=auto -o ControlPath=/tmp/hybrid-sync-%r@%h:%p -o ControlPersist=60 \
    -o ConnectTimeout=5 -o BatchMode=yes "$HOST" \
    "tar -C '$REMOTE_DIR' -cf - hyperliquid-hybrid-state.json hyperliquid-hybrid-trades.jsonl" \
  | tar -C "$DATA_DIR" -xf -
