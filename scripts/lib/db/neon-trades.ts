import { Client } from "pg";
import type { ReportClosedTrade } from "../reporting/report-builders.js";

/**
 * Neon Postgres mirror of the closed-trades ledger (July 2026 infrastructure
 * plan, Phase 6).
 *
 * Safety contract, agreed with the operator on 2026-07-14:
 * - data/trades-detailed.csv remains the SOURCE OF TRUTH. Neon is a
 *   write-through mirror; no reader is cut over until parity has been
 *   verified over time.
 * - Sync is idempotent (full-file upsert keyed by trade id) and additive.
 *   Neon failures must only ever produce warnings — never block trading.
 * - The connection string lives ONLY in the VPS env file
 *   (NEON_DATABASE_URL); it is never committed to git.
 * - Tables are namespaced under the polymarket_trader schema; the database
 *   is dedicated to this trader.
 */

export const NEON_URL_ENV = "NEON_DATABASE_URL";
export const TRADES_TABLE = "polymarket_trader.trades";

const CREATE_SCHEMA_SQL = "CREATE SCHEMA IF NOT EXISTS polymarket_trader";

const CREATE_TRADES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${TRADES_TABLE} (
  id TEXT PRIMARY KEY,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  asset TEXT NOT NULL,
  venue TEXT NOT NULL,
  direction TEXT NOT NULL,
  instrument_type TEXT,
  instrument_id TEXT,
  instrument_label TEXT,
  entry_price DOUBLE PRECISION,
  exit_price DOUBLE PRECISION,
  size DOUBLE PRECISION,
  pnl DOUBLE PRECISION NOT NULL,
  pnl_pct DOUBLE PRECISION,
  market_pnl DOUBLE PRECISION,
  funding_pnl DOUBLE PRECISION,
  signal_type TEXT NOT NULL,
  hypothesis_id TEXT,
  entry_confidence DOUBLE PRECISION,
  thesis TEXT,
  close_reason TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const ADD_ENTRY_CONFIDENCE_SQL = `ALTER TABLE ${TRADES_TABLE} ADD COLUMN IF NOT EXISTS entry_confidence DOUBLE PRECISION`;

const CREATE_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS trades_signal_type_idx ON ${TRADES_TABLE} (signal_type)`,
  `CREATE INDEX IF NOT EXISTS trades_closed_at_idx ON ${TRADES_TABLE} (closed_at)`,
];

const UPSERT_SQL = `
INSERT INTO ${TRADES_TABLE} (
  id, opened_at, closed_at, asset, venue, direction,
  instrument_type, instrument_id, instrument_label,
  entry_price, exit_price, size,
  pnl, pnl_pct, market_pnl, funding_pnl,
  signal_type, hypothesis_id, entry_confidence, thesis, close_reason, synced_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
  $13, $14, $15, $16, $17, $18, $19, $20, $21, now()
)
ON CONFLICT (id) DO UPDATE SET
  opened_at = EXCLUDED.opened_at,
  closed_at = EXCLUDED.closed_at,
  asset = EXCLUDED.asset,
  venue = EXCLUDED.venue,
  direction = EXCLUDED.direction,
  instrument_type = EXCLUDED.instrument_type,
  instrument_id = EXCLUDED.instrument_id,
  instrument_label = EXCLUDED.instrument_label,
  entry_price = EXCLUDED.entry_price,
  exit_price = EXCLUDED.exit_price,
  size = EXCLUDED.size,
  pnl = EXCLUDED.pnl,
  pnl_pct = EXCLUDED.pnl_pct,
  market_pnl = EXCLUDED.market_pnl,
  funding_pnl = EXCLUDED.funding_pnl,
  signal_type = EXCLUDED.signal_type,
  hypothesis_id = EXCLUDED.hypothesis_id,
  entry_confidence = EXCLUDED.entry_confidence,
  thesis = EXCLUDED.thesis,
  close_reason = EXCLUDED.close_reason,
  synced_at = now()
WHERE (
  ${TRADES_TABLE}.opened_at IS DISTINCT FROM EXCLUDED.opened_at OR
  ${TRADES_TABLE}.closed_at IS DISTINCT FROM EXCLUDED.closed_at OR
  ${TRADES_TABLE}.pnl IS DISTINCT FROM EXCLUDED.pnl OR
  ${TRADES_TABLE}.pnl_pct IS DISTINCT FROM EXCLUDED.pnl_pct OR
  ${TRADES_TABLE}.close_reason IS DISTINCT FROM EXCLUDED.close_reason OR
  ${TRADES_TABLE}.thesis IS DISTINCT FROM EXCLUDED.thesis
)`;

/** ISO timestamp → value for a TIMESTAMPTZ param; unparseable → null. */
export function toTimestamptz(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Map one deduped CSV ledger row to the upsert parameter tuple. */
export function tradeToUpsertParams(trade: ReportClosedTrade): unknown[] {
  return [
    trade.id,
    toTimestamptz(trade.openedAt),
    toTimestamptz(trade.closedAt),
    trade.asset,
    trade.venue,
    trade.direction,
    trade.instrumentType ?? null,
    trade.instrumentId ?? null,
    trade.instrumentLabel ?? null,
    finiteOrNull(trade.entryPrice),
    finiteOrNull(trade.exitPrice),
    finiteOrNull(trade.size),
    finiteOrNull(trade.pnl) ?? 0,
    finiteOrNull(trade.pnlPct),
    finiteOrNull(trade.marketPnl),
    finiteOrNull(trade.fundingPnl),
    trade.signalType,
    trade.hypothesisId ?? null,
    finiteOrNull(trade.entryConfidence),
    trade.thesis ?? null,
    trade.closeReason ?? null,
  ];
}

export interface NeonSyncResult {
  totalTrades: number;
  upsertedOrUpdated: number;
  unchanged: number;
}

export interface NeonParitySummary {
  neonCount: number;
  neonPnlSum: number;
  neonDistinctIds: number;
  maxClosedAt: string | null;
}

export function neonConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env[NEON_URL_ENV];
}

export async function connectNeon(env: Record<string, string | undefined> = process.env): Promise<Client> {
  const url = env[NEON_URL_ENV];
  if (!url) throw new Error(`${NEON_URL_ENV} is not set`);
  const client = new Client({
    connectionString: url,
    statement_timeout: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  return client;
}

export async function ensureTradesSchema(client: Client): Promise<void> {
  await client.query(CREATE_SCHEMA_SQL);
  await client.query(CREATE_TRADES_TABLE_SQL)
  await client.query(ADD_ENTRY_CONFIDENCE_SQL);
  for (const sql of CREATE_INDEXES_SQL) await client.query(sql);
}

/** Idempotent full-ledger upsert. Caller passes DEDUPED trades (one per id). */
export async function upsertClosedTrades(client: Client, trades: ReportClosedTrade[]): Promise<NeonSyncResult> {
  let changed = 0;
  await client.query("BEGIN");
  try {
    for (const trade of trades) {
      const result = await client.query(UPSERT_SQL, tradeToUpsertParams(trade));
      changed += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
  return {
    totalTrades: trades.length,
    upsertedOrUpdated: changed,
    unchanged: trades.length - changed,
  };
}

export async function fetchTradeParitySummary(client: Client): Promise<NeonParitySummary> {
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS neon_count,
      COUNT(DISTINCT id)::int AS neon_distinct_ids,
      COALESCE(SUM(pnl), 0)::double precision AS neon_pnl_sum,
      MAX(closed_at) AS max_closed_at
    FROM ${TRADES_TABLE}
  `);
  const row = result.rows[0] ?? {};
  return {
    neonCount: Number(row.neon_count ?? 0),
    neonDistinctIds: Number(row.neon_distinct_ids ?? 0),
    neonPnlSum: Number(row.neon_pnl_sum ?? 0),
    maxClosedAt: row.max_closed_at ? new Date(row.max_closed_at).toISOString() : null,
  };
}

export async function fetchNeonTradeIds(client: Client): Promise<Set<string>> {
  const result = await client.query(`SELECT id FROM ${TRADES_TABLE}`);
  return new Set(result.rows.map((row: { id: string }) => row.id));
}
