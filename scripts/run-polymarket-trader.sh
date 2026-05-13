#!/usr/bin/env bash
# Production wrapper for the hourly Polymarket trader.
# Deployed to: /usr/local/bin/run-polymarket-trader on the trading VPS.
# Invoked by:  systemd unit polymarket-trader.service (timer fires hourly at minute :27).
#
# Behaviour:
#   1. Acquires a non-blocking flock so two timer invocations cannot overlap.
#   2. Auto-commits trader STATE files (data/*, relative-value/*) left behind by an
#      interrupted previous run, so they survive the upcoming git pull.
#   3. Pulls the latest code with --autostash so any unexpected tracked-file edits on
#      the VPS are stashed transparently and reapplied after, instead of aborting the
#      rebase with "cannot pull with rebase: You have unstaged changes" (which has
#      historically silently killed the hourly run for hours at a time).
#   4. Installs deps, snapshots markets, runs the engine, regenerates the heatmap.
#   5. Commits and pushes the resulting state changes.
set -euo pipefail

LOCK_FILE="/var/lock/polymarket-trader.lock"
REPO_DIR="/opt/polymarket-trader"
STATE_DIR="/var/lib/polymarket-trader"
export POLYMARKET_TRADER_STATE_DIR="$STATE_DIR"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
DATA_FILES=(
  data/daily-valuations.csv
  data/daily-macro.csv
  data/trades-detailed.csv
  data/position-snapshots.csv
  data/portfolio.json
  data/signal-weights.json
  data/hypotheses.json
  data/learning-params.json
  data/blocked-signals.json
  data/processed-closed-trades.json
  data/learning-journal.md
  relative-value/index.html
  relative-value/cross_venue_relative_value.csv
)

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another trader run is already active; exiting."
  exit 0
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ANTHROPIC_API_KEY is missing. Set it in /etc/polymarket-trader.env."
  exit 1
fi

cd "$REPO_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting polymarket trader run"

git fetch origin main

# Preserve any state files left behind by an interrupted previous run before updating code.
for data_file in "${DATA_FILES[@]}"; do
  if [[ -e "$data_file" ]]; then
    git add -f "$data_file"
  fi
done
if ! git diff --cached --quiet; then
  git -c user.name="virtualwriter" \
      -c user.email="37585392+virtualwriter@users.noreply.github.com" \
      commit -m "recover trader state $(date -u +%Y-%m-%d-%H%M)"
fi

# Diagnostic: surface any unexpected tracked-file modifications so we can see when the
# autostash kicks in. These are files the wrapper does NOT explicitly manage; if they
# ever appear here it means someone (likely an agent or a manual edit on the VPS) left
# a tracked file dirty. --autostash will absorb them so the rebase still succeeds.
dirty_tracked=$(git diff --name-only)
if [[ -n "$dirty_tracked" ]]; then
  echo "WARNING: tracked files have unstaged modifications; --autostash will stash them around the pull:"
  echo "$dirty_tracked" | sed 's/^/  - /'
fi

git pull --rebase --autostash origin main
npm ci

npx tsx scripts/market-scanner.ts --snapshot
python3 scripts/compact_instrument_snapshots.py
npx tsx scripts/trading-engine.ts

# Generate static Vercel report from the same snapshot data.
python3 scripts/cross_venue_relative_value_report.py

for data_file in "${DATA_FILES[@]}"; do
  if [[ -e "$data_file" ]]; then
    git add -f "$data_file"
  fi
done
if git diff --cached --quiet; then
  echo "No trader state changes to commit"
else
  git -c user.name="virtualwriter" \
      -c user.email="37585392+virtualwriter@users.noreply.github.com" \
      commit -m "scan+trade $(date -u +%Y-%m-%d-%H%M)"
  git pull --rebase --autostash origin main
  git push origin HEAD:main
fi


# Keep transient package/tsx caches from eating disk on the small VPS.
npm cache clean --force >/dev/null 2>&1 || true
rm -rf /tmp/tsx-* /tmp/node-compile-cache

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Completed polymarket trader run"
