#!/usr/bin/env bash
# Production wrapper for nightly Polymarket research (Phase 4 split).
# Deployed to: /usr/local/bin/run-polymarket-nightly-research on the trading VPS.
# Invoked by:  systemd unit polymarket-nightly-research.service (timer fires daily at 03:05 ET).
#
# Behaviour:
#   1. Acquires a blocking flock (up to 15 min) so nightly research does not overlap the hourly trader.
#   2. Pulls the latest code with robust_git_pull_rebase.
#   3. Runs calibration backfill, event report, compaction, and nightly research artifacts.
#   4. Commits and pushes resulting research artifacts.
set -euo pipefail

LOCK_FILE="/var/lock/polymarket-trader.lock"
REPO_DIR="/opt/polymarket-trader"
STATE_DIR="/var/lib/polymarket-trader"
export POLYMARKET_TRADER_STATE_DIR="$STATE_DIR"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

if [[ -f /etc/polymarket-trader.env ]]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/polymarket-trader.env
  set +a
fi

NIGHTLY_FILES=(
  data/calibration-buckets-summary.json
  data/lessons.json
  data/nightly-llm-advice.json
  data/research-findings.json
  data/research-opportunities.json
  data/neon-parity.json
  data/learning-journal.md
  relative-value/calibration/resolutions_cache.json
  relative-value/calibration/event_report.md
)

# Final safety net: if `git pull --rebase --autostash` still aborts because an
# UNTRACKED file in some path we didn't pre-empt would be overwritten by the
# incoming commit, parse the file list out of the error message, move those
# specific files into a backup dir, and retry the pull. This makes the hourly
# trader resilient to anyone (operator or agent) scp-ing a new file into the
# repo that is later introduced as a tracked file via git push. Without this,
# the historical failure mode is: every subsequent hourly run aborts with
# `error: The following untracked working tree files would be overwritten by
# merge: <path>` and `set -e` exits the wrapper with status 1.
robust_git_pull_rebase() {
  local pull_log
  pull_log=$(mktemp)
  if git pull --rebase --autostash origin main >"$pull_log" 2>&1; then
    cat "$pull_log"
    rm -f "$pull_log"
    return 0
  fi

  cat "$pull_log"
  if ! grep -q "would be overwritten by merge" "$pull_log"; then
    rm -f "$pull_log"
    return 1
  fi

  echo "WARNING: git pull aborted due to untracked files; auto-recovering."

  local backup_dir="$STATE_DIR/generated-artifact-backups/$(date -u +%Y%m%dT%H%M%SZ)-recovery"
  mkdir -p "$backup_dir"

  # Lines between the "untracked working tree files would be overwritten by
  # merge:" header and "Please move or remove them" footer are file paths
  # (tab-indented). Move each one out of the way and retry.
  local recovered=0
  local path
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if [[ -e "$path" ]]; then
      local target="$backup_dir/$path"
      mkdir -p "$(dirname "$target")"
      mv "$path" "$target"
      echo "Moved blocking untracked file: $path -> $target"
      recovered=$((recovered + 1))
    fi
  done < <(
    awk '/would be overwritten by merge:/{flag=1; next} /^Please move or remove/{flag=0} flag && /^\t/{sub(/^\t/, ""); print}' "$pull_log"
  )

  rm -f "$pull_log"

  if [[ "$recovered" -eq 0 ]]; then
    echo "ERROR: pull aborted on untracked-file conflict but no paths could be parsed/moved."
    return 1
  fi

  echo "Retrying git pull --rebase --autostash after moving $recovered untracked file(s)."
  git pull --rebase --autostash origin main
}

exec 9>"$LOCK_FILE"
if ! flock -w 900 9; then
  echo "Could not acquire trader lock within 15 minutes; exiting."
  exit 0
fi

cd "$REPO_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting polymarket nightly research run"

git fetch origin main
robust_git_pull_rebase

if [[ ! -d node_modules ]]; then
  npm ci
fi

if ! timeout "${CALIBRATION_BACKFILL_TIMEOUT:-10m}" python3 scripts/backfill_calibration_outcomes.py \
    --archive-dir "$STATE_DIR/relative-value-history" \
    --archive-dir relative-value/history; then
  echo "WARNING: calibration outcome backfill failed; labels will catch up next run."
fi
if ! timeout "${CALIBRATION_REPORT_TIMEOUT:-5m}" python3 scripts/calibration_event_report.py; then
  echo "WARNING: calibration event report failed; continuing."
fi
if ! timeout "${CALIBRATION_COMPACT_TIMEOUT:-10m}" python3 scripts/compact_no_bias_calibration.py --apply; then
  echo "WARNING: calibration compaction failed; continuing."
fi

nightly_research_exit=0
if ! timeout "${NIGHTLY_RESEARCH_TIMEOUT:-15m}" npx tsx scripts/nightly-research.ts; then
  echo "WARNING: nightly research failed; continuing to commit earlier artifacts."
  nightly_research_exit=1
fi

# Mine clean heatmap/blocked-signal shadows → permanent FIND records in registry.
# Auto H-* promotion from shadow mine is deferred to Phase D.
if ! timeout "${SHADOW_MINE_TIMEOUT:-3m}" python3 scripts/mine_shadow_findings.py; then
  echo "WARNING: mine_shadow_findings.py failed; continuing."
fi

# Verify the Neon mirror matches the CSV ledger (Phase 6 parity gate).
if [[ -n "${NEON_DATABASE_URL:-}" ]]; then
  if ! timeout "${NEON_PARITY_TIMEOUT:-3m}" npx tsx scripts/neon-parity-check.ts; then
    echo "WARNING: Neon parity check reported a problem; see data/neon-parity.json."
  fi
fi

for nightly_file in "${NIGHTLY_FILES[@]}"; do
  if [[ -e "$nightly_file" ]]; then
    git add -f "$nightly_file"
  fi
done
if [[ -d data/journal-archive ]]; then
  git add -f data/journal-archive
fi

if git diff --cached --quiet; then
  echo "No nightly research changes to commit"
else
  git -c user.name="virtualwriter" \
      -c user.email="37585392+virtualwriter@users.noreply.github.com" \
      commit -m "nightly research $(date -u +%Y-%m-%d)"
  robust_git_pull_rebase
  git push origin HEAD:main
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Completed polymarket nightly research run (exit=$nightly_research_exit)"
exit "$nightly_research_exit"
