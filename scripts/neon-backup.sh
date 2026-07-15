#!/usr/bin/env bash
# Monthly logical backup of the Neon Postgres polymarket_trader schema.
# Deployed to: /usr/local/bin/polymarket-neon-backup on the trading VPS.
# Invoked by:  systemd unit polymarket-neon-backup.service (timer fires monthly on the 1st at 04:15 ET).
#
# Behaviour:
#   1. Skips gracefully when NEON_DATABASE_URL is unset or pg_dump is unavailable.
#   2. Dumps polymarket_trader schema to a gzipped SQL file with atomic write.
#   3. Retains the 12 most recent monthly backups.
set -euo pipefail

BACKUP_DIR="/var/lib/polymarket-trader/neon-backups"

if [[ -f /etc/polymarket-trader.env ]]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/polymarket-trader.env
  set +a
fi

if [[ -z "${NEON_DATABASE_URL:-}" ]]; then
  echo "NEON_DATABASE_URL not set; skipping Neon backup."
  exit 0
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not installed; skipping Neon backup"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

month_stamp="$(date -u +%Y-%m)"
tmp_file="$BACKUP_DIR/polymarket-trader-${month_stamp}.sql.gz.tmp"
final_file="$BACKUP_DIR/polymarket-trader-${month_stamp}.sql.gz"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting Neon schema backup"

pg_dump "$NEON_DATABASE_URL" --schema=polymarket_trader --no-owner --no-privileges | gzip > "$tmp_file"
mv "$tmp_file" "$final_file"

ls -1t "$BACKUP_DIR"/polymarket-trader-*.sql.gz 2>/dev/null | awk 'NR>12' | xargs -r rm -f --

size_bytes=$(wc -c < "$final_file" | tr -d ' ')
retained=$(ls -1 "$BACKUP_DIR"/polymarket-trader-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')

echo "Neon backup written: $final_file (${size_bytes} bytes)"
echo "Retained ${retained} backup(s) in $BACKUP_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Completed Neon schema backup"
