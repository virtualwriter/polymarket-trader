#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="/opt/polymarket-trader"
ENV_FILE="/etc/polymarket-trader.env"
cd "$REPO_DIR"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi
python3 scripts/daily_trader_email_report.py
