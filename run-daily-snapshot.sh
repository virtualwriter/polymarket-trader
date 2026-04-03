#!/bin/bash
# Daily market scanner snapshot — appends one row per day to CSV files.
# Can be run manually or via launchd/cron.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="/usr/local/bin:$PATH"

LOG_FILE="$SCRIPT_DIR/data/snapshot.log"
echo "--- $(date) ---" >> "$LOG_FILE"
npx tsx scripts/market-scanner.ts --snapshot >> "$LOG_FILE" 2>&1
echo "exit: $?" >> "$LOG_FILE"
