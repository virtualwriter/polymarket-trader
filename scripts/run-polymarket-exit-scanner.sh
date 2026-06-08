#!/usr/bin/env bash
set -euo pipefail

LOCK_FILE="/var/lock/polymarket-trader.lock"
REPO_DIR="/opt/polymarket-trader"
STATE_DIR="/var/lib/polymarket-trader"
export POLYMARKET_TRADER_STATE_DIR="$STATE_DIR"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Hourly trader is active; skipping exit scanner."
  exit 0
fi

cd "$REPO_DIR"
if [[ ! -x ./node_modules/.bin/tsx ]]; then
  echo "node_modules missing; run npm ci before exit scanner."
  exit 1
fi

./node_modules/.bin/tsx scripts/position-exit-scanner.ts
