#!/usr/bin/env tsx
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsvRecords } from "./lib/reporting/csv.js";
import { fmtModelValue, fmtPriceValue } from "./lib/reporting/format.js";
import { normalCdf } from "./lib/reporting/math.js";
import { safeNumber } from "./lib/reporting/number.js";
import {
  buildCsvReport as buildCsvReportWithDeps,
  buildMarkdownReport as buildMarkdownReportWithDeps,
  detailCsvRow,
  markdownOpenShadows,
  markdownPendingHypotheses,
  statsCsvRow,
  table,
} from "./lib/reporting/report-builders.js";
import type { BuildCsvReportArgs, BuildMarkdownReportArgs, ReportBuilderDeps } from "./lib/reporting/report-builders.js";
import { addStats, emptyStats, grouped, sortStatsRows } from "./lib/reporting/stats.js";
import type { Outcome, Stats } from "./lib/reporting/stats.js";
import { parseHeatmapTimestamp, parseTimestamp } from "./lib/reporting/time.js";
import { loadOperationallyTaintedTrades } from "./portfolio-ledger.js";

export { detailCsvRow, markdownOpenShadows, markdownPendingHypotheses, statsCsvRow, table };

interface ClosedTrade {
  id: string;
  openedAt: string;
  closedAt: string;
  asset: string;
  venue: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  marketPnl: number;
  fundingPnl: number;
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  closeReason: string;
  instrumentType?: string;
  instrumentId?: string;
  instrumentLabel?: string;
}

export interface Position {
  id: string;
  openedAt: string;
  asset: string;
  venue: string;
  direction: string;
  entryPrice: number;
  currentPrice?: number;
  entryUnderlyingPrice?: number;
  currentUnderlyingPrice?: number;
  size: number;
  leverage?: number;
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  instrumentType?: string;
  instrumentId?: string;
  instrumentLabel?: string;
  packageLegs?: Array<{
    role?: string;
    strike?: number;
  }>;
  fundingPnlAccrued?: number;
}

interface Portfolio {
  cash: number;
  positions: Position[];
  totalRealizedPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  lastUpdated: string;
}

interface HypothesisTest {
  date: string;
  outcome: "win" | "loss" | "pending";
  excludedFromSetupStats?: boolean;
  exclusionReason?: string;
}

interface Hypothesis {
  id: string;
  setupId?: string;
  setupLabel?: string;
  description: string;
  tests: HypothesisTest[];
  winRate: number;
  status: "active" | "promoted" | "archived" | "killed";
  promotedToSignal: boolean;
  source: "llm" | "statistical";
}

interface BlockedSignalShadow {
  id: string;
  status: "open" | "resolved" | "cancelled";
  blockedAt: string;
  resolvedAt?: string;
  blockedReason: string;
  signalType: string;
  asset: string;
  venue: string;
  direction: string;
  thesis: string;
  position?: Position;
  hypotheticalResult?: {
    pnl: number;
    pnlPct: number;
    outcome: Outcome;
    closeReason: string;
  };
  learningExcluded?: {
    reason: string;
    note: string;
  };
  heatmapRowSnapshot?: {
    row?: Record<string, string>;
  };
}

interface InstrumentSnapshotFile {
  timestamp: string;
  hyperliquid?: Record<string, {
    markPx?: number | null;
    fundingAnnualized?: number | null;
  }>;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const RELATIVE_VALUE_HISTORY_DIRS = [
  process.env.RELATIVE_VALUE_HISTORY_DIR,
  "/var/lib/polymarket-trader/relative-value-history",
  join(ROOT, "relative-value", "history"),
  join(ROOT, "relative-value", "backtest-history"),
].filter((path): path is string => Boolean(path));
const ONE_TOUCH_TERMINAL_ONLY_SIGMA = 1.5;
const OPERATIONALLY_TAINTED_TRADES: Record<string, string> = loadOperationallyTaintedTrades();

const LIVE_STATE_DIR = process.env.POLYMARKET_TRADER_STATE_DIR ?? "/var/lib/polymarket-trader";
function resolveHybridBotFile(envValue: string | undefined, basename: string): string {
  if (envValue) return envValue;
  const primary = join(LIVE_STATE_DIR, basename);
  if (existsSync(primary)) return primary;
  const localFallback = join(DATA_DIR, basename);
  return existsSync(localFallback) ? localFallback : primary;
}
const HYBRID_BOT_TRADES_FILE = resolveHybridBotFile(
  process.env.HYPERLIQUID_HYBRID_TRADES_FILE,
  "hyperliquid-hybrid-trades.jsonl",
);
const HYBRID_BOT_STATE_FILE = resolveHybridBotFile(
  process.env.HYPERLIQUID_HYBRID_STATE_FILE,
  "hyperliquid-hybrid-state.json",
);

interface HybridBotShadowEvent {
  ts?: string;
  coin?: string;
  action?: "open" | "close";
  side?: "long" | "short";
  entry_price?: number;
  exit_price?: number;
  signal_price?: number;
  fill_price?: number;
  fill_size?: number;
  real_size_usd?: number;
  size_usd?: number;
  fee_usd?: number;
  real_fee_usd?: number;
  pnl_pct?: number;
  regime?: "bull" | "bear";
  reason?: string;
  ema_diff_pct?: number;
}

interface HybridBotPosition {
  in_position?: boolean;
  is_long?: boolean;
  entry_price?: number;
  entry_time?: string | null;
  mode?: "long" | "short";
}

interface HybridBotState {
  positions?: Record<string, HybridBotPosition>;
  total_trades?: number;
  total_wins?: number;
  total_fees?: number;
}

interface HybridBotCoinStats {
  trades: number;
  wins: number;
  losses: number;
  realizedPnlUsd: number;     // sum of (pnl_pct/100 * size_usd - fee_usd) on closes
  realizedPnlPctSum: number;  // sum of close pnl_pct
  feesUsd: number;            // open + close fees
  opens: number;
  closes: number;
  lastEventTs: string | null;
}

interface HybridBotReport {
  available: boolean;
  stateLastModified: string | null;
  feedLastModified: string | null;
  positions: Map<string, HybridBotPosition>;
  perCoinStats: Map<string, HybridBotCoinStats>;
  totalsAcrossAllCoins: HybridBotCoinStats;
}

function readHybridBotReport(): HybridBotReport {
  const empty: HybridBotCoinStats = {
    trades: 0, wins: 0, losses: 0,
    realizedPnlUsd: 0, realizedPnlPctSum: 0, feesUsd: 0,
    opens: 0, closes: 0, lastEventTs: null,
  };
  const report: HybridBotReport = {
    available: false,
    stateLastModified: null,
    feedLastModified: null,
    positions: new Map(),
    perCoinStats: new Map(),
    totalsAcrossAllCoins: { ...empty },
  };

  if (existsSync(HYBRID_BOT_STATE_FILE)) {
    try {
      const state = JSON.parse(readFileSync(HYBRID_BOT_STATE_FILE, "utf-8")) as HybridBotState;
      report.stateLastModified = statSync(HYBRID_BOT_STATE_FILE).mtime.toISOString();
      report.available = true;
      for (const [coin, pos] of Object.entries(state.positions ?? {})) {
        if (pos && pos.in_position) report.positions.set(coin, pos);
      }
    } catch (err) {
      // Surface to stderr so the operator notices, but don't crash the report.
      console.error(`[hybrid-bot] failed to read state: ${(err as Error).message}`);
    }
  }

  if (existsSync(HYBRID_BOT_TRADES_FILE)) {
    try {
      report.feedLastModified = statSync(HYBRID_BOT_TRADES_FILE).mtime.toISOString();
      report.available = true;
      const raw = readFileSync(HYBRID_BOT_TRADES_FILE, "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        let event: HybridBotShadowEvent;
        try { event = JSON.parse(line); } catch { continue; }
        const coin = event.coin ?? "UNKNOWN";
        const stats = report.perCoinStats.get(coin) ?? { ...empty };
        const totals = report.totalsAcrossAllCoins;
        const rawFee = Number(event.fee_usd ?? 0);
        const realSize = Number(event.real_size_usd ?? 0);
        const shadowSizeForFee = Number(event.size_usd ?? 1);
        // New hybrid bot events write fee_usd at shadow scale and preserve the
        // actual exchange fee in real_fee_usd. Older events wrote real fees into
        // fee_usd while size_usd was shadow-scaled, so back-scale them here.
        const fee = event.real_fee_usd == null && realSize > 0 && shadowSizeForFee > 0
          ? rawFee * (shadowSizeForFee / realSize)
          : rawFee;
        stats.feesUsd += fee;
        totals.feesUsd += fee;
        if (event.action === "open") {
          stats.opens += 1;
          totals.opens += 1;
        } else if (event.action === "close") {
          stats.closes += 1;
          totals.closes += 1;
          stats.trades += 1;
          totals.trades += 1;
          // Shadow $-P&L = (pnl_pct/100) * shadow size_usd - fee for this close.
          // The open-side fee for this round-trip is already booked into feesUsd
          // via the prior open event. realizedPnlUsd subtracts only the close
          // fee so that opens-still-running don't contaminate the realized line.
          const pct = Number(event.pnl_pct ?? 0);
          const shadowSize = Number(event.size_usd ?? 1);
          const pnlUsd = (pct / 100) * shadowSize - fee;
          stats.realizedPnlUsd += pnlUsd;
          stats.realizedPnlPctSum += pct;
          totals.realizedPnlUsd += pnlUsd;
          totals.realizedPnlPctSum += pct;
          // Classify wins/losses by net (after-fee) P&L so the win rate is
          // consistent with the realized P&L column. Using gross pct caused
          // small positive moves eaten by taker fees to count as wins
          // while contributing a negative realized line.
          if (pnlUsd > 0) {
            stats.wins += 1;
            totals.wins += 1;
          } else {
            stats.losses += 1;
            totals.losses += 1;
          }
        }
        if (event.ts) {
          stats.lastEventTs = event.ts;
          totals.lastEventTs = event.ts;
        }
        report.perCoinStats.set(coin, stats);
      }
    } catch (err) {
      console.error(`[hybrid-bot] failed to read shadow trades: ${(err as Error).message}`);
    }
  }

  return report;
}

const CSV_HEADER = [
  "section",
  "group",
  "trades",
  "wins",
  "losses",
  "win_rate_pct",
  "pnl",
  "avg_pnl",
  "avg_pnl_pct",
  "id",
  "status",
  "asset",
  "notes",
  "unrealized_pnl_pct",
  "realized_pnl",
  "unrealized_pnl",
  "entry_price",
  "current_price",
  "instrument_type",
  "instrument_id",
  "instrument_label",
  "opened_at",
  "entry_one_touch_model_recomputed",
  "current_one_touch_model",
  "current_bid",
  "current_ask",
  "strike_price",
  "expiry_month",
  "entry_model_source",
  "entry_row_timestamp",
  "entry_row_distance_hours",
  "current_model_source",
  "current_row_timestamp",
  "current_row_age_hours",
] as const;

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function extractHyperliquidMids(snapshot: InstrumentSnapshotFile | null): Map<string, number> {
  const mids = new Map<string, number>();
  if (!snapshot?.hyperliquid) return mids;
  for (const [key, quote] of Object.entries(snapshot.hyperliquid)) {
    const mark = quote?.markPx;
    if (typeof mark === "number" && mark > 0) {
      mids.set(key, mark);
      mids.set(key.toUpperCase(), mark);
    }
  }
  return mids;
}

/**
 * Best-effort fetch of live Hyperliquid mids for any coins not in the saved
 * instrument snapshot. The report runs offline-first; if the fetch fails or
 * times out, we silently fall back to the snapshot-only map. Used to populate
 * current_price for the hybrid bot's altcoin perps (ADA/APT/etc) which the
 * LLM trader doesn't include in its own instrument snapshots.
 */
async function augmentMidsFromHyperliquid(
  mids: Map<string, number>, missingCoins: string[],
): Promise<void> {
  if (missingCoins.length === 0) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return;
    const allMids = await response.json() as Record<string, string>;
    for (const coin of missingCoins) {
      const val = Number(allMids[coin] ?? allMids[coin.toUpperCase()]);
      if (Number.isFinite(val) && val > 0) {
        mids.set(coin, val);
        mids.set(coin.toUpperCase(), val);
      }
    }
  } catch {
    // Silent fallback: the report still works without live mids.
  }
}

function readLatestInstrumentSnapshot(): InstrumentSnapshotFile | null {
  const file = join(DATA_DIR, "instrument-snapshots.jsonl");
  if (!existsSync(file)) return null;

  const size = statSync(file).size;
  if (size === 0) return null;

  const fd = openSync(file, "r");
  try {
    const chunkSize = 1024 * 1024;
    let offset = size;
    let suffix = "";

    while (offset > 0) {
      const bytesToRead = Math.min(chunkSize, offset);
      offset -= bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      readSync(fd, buffer, 0, bytesToRead, offset);
      suffix = buffer.toString("utf-8") + suffix;

      const lines = suffix.split("\n").filter((line) => line.trim());
      if (lines.length >= 2 || offset === 0) {
        const latestLine = lines[lines.length - 1];
        return latestLine ? JSON.parse(latestLine) as InstrumentSnapshotFile : null;
      }
    }
  } finally {
    closeSync(fd);
  }

  return null;
}

function readClosedTrades(): ClosedTrade[] {
  const file = join(DATA_DIR, "trades-detailed.csv");
  return readCsvRecords(file).map((row) => {
    return {
      id: row.id,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      asset: row.asset,
      venue: row.venue,
      direction: row.direction,
      entryPrice: Number(row.entry_price),
      exitPrice: Number(row.exit_price),
      size: Number(row.size),
      pnl: Number(row.pnl),
      pnlPct: Number(row.pnl_pct),
      marketPnl: Number(row.market_pnl),
      fundingPnl: Number(row.funding_pnl),
      signalType: row.signal_type,
      hypothesisId: row.hypothesis_id || null,
      thesis: row.thesis,
      closeReason: row.close_reason,
      instrumentType: row.instrument_type || undefined,
      instrumentId: row.instrument_id || undefined,
      instrumentLabel: row.instrument_label || undefined,
    };
  }).filter((trade) => trade.id && trade.closedAt);
}

function tradeClosedAtMs(trade: ClosedTrade): number {
  const parsed = new Date(trade.closedAt).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function dedupeClosedTrades(trades: ClosedTrade[]): ClosedTrade[] {
  const byId = new Map<string, ClosedTrade>();
  for (const trade of trades) {
    const existing = byId.get(trade.id);
    if (!existing || tradeClosedAtMs(trade) < tradeClosedAtMs(existing)) {
      byId.set(trade.id, trade);
    }
  }
  return [...byId.values()].sort((a, b) =>
    new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime() ||
    tradeClosedAtMs(a) - tradeClosedAtMs(b) ||
    a.id.localeCompare(b.id)
  );
}

function isCountedRealTrade(trade: ClosedTrade): boolean {
  return !OPERATIONALLY_TAINTED_TRADES[trade.id] &&
    trade.closeReason !== "data_quality_artifact" &&
    !(trade.closeReason ?? "").includes("DATA_CORRECTION_ARTIFACT") &&
    !(trade.thesis ?? "").includes("NON_LEARNING_CLOSE");
}

function modelDteDays(row: Record<string, string>): number | null {
  const timestamp = parseHeatmapTimestamp(row.timestamp);
  const target = row.notes?.match(/target month-end expiry (\d{4}-\d{2}-\d{2})/i)?.[1];
  if (timestamp && target) {
    const expiry = new Date(`${target}T04:00:00Z`);
    if (Number.isFinite(expiry.getTime()) && expiry > timestamp) {
      return (expiry.getTime() - timestamp.getTime()) / 86_400_000;
    }
  }
  return safeNumber(row.dte_days);
}

// Mirror of Python `scaled_option_strike` in scripts/cross_venue_relative_value_report.py.
// Python scales the asset-basis strike to the option-proxy basis for CBOE_PROXY_OPTION_SYMBOLS
// ({IBIT, ETHA, GLD, USO, SPY}) and CME_ES. Without scaling, recomputing the model from a CSV
// row mixes bases (asset-spot strike vs proxy-basis option_underlying) and can short-circuit
// to "already touched" for proxies whose underlying nominal sits above the asset strike
// (notably USO ~$80-150 vs CL strike $80-130).
const PROXY_OPTION_SYMBOLS_REQUIRING_STRIKE_SCALING = new Set([
  "IBIT",
  "ETHA",
  "GLD",
  "USO",
  "SPY",
  "CME_ES",
]);

function optionModelStrike(row: Record<string, string>): number | null {
  const strike = safeNumber(row.strike);
  if (strike === null) return null;
  const optionSymbol = row.option_symbol;
  const spot = safeNumber(row.spot);
  const optionUnderlying = safeNumber(row.option_underlying);
  if (
    optionSymbol &&
    PROXY_OPTION_SYMBOLS_REQUIRING_STRIKE_SCALING.has(optionSymbol) &&
    spot !== null &&
    optionUnderlying !== null &&
    spot > 0
  ) {
    return strike * (optionUnderlying / spot);
  }
  return strike;
}

function barrierSigmaDistance(spot: number, strike: number, iv: number, dteDays: number): number | null {
  const sigmaT = iv * Math.sqrt(dteDays / 365);
  return sigmaT > 0 ? Math.abs(Math.log(strike / spot)) / sigmaT : null;
}

function recomputedOneTouchProbability(row: Record<string, string> | undefined): number | null {
  if (!row) return null;
  const question = row.contract_question?.toLowerCase() ?? "";
  if (!question.includes("hit") && !question.includes("reach") && !question.includes("dip")) return null;
  const spot = safeNumber(row.option_underlying) ?? safeNumber(row.spot);
  const strike = optionModelStrike(row);
  const iv = safeNumber(row.option_iv);
  const dteDays = modelDteDays(row);
  const direction = row.direction;
  if (!spot || !strike || !iv || !dteDays || spot <= 0 || strike <= 0 || iv <= 0 || dteDays <= 0) return null;
  if (direction === "above" && spot >= strike) return 1;
  if (direction === "below" && spot <= strike) return 1;

  const t = dteDays / 365;
  const sigmaT = iv * Math.sqrt(t);
  if (sigmaT <= 0) return null;
  const d2 = (Math.log(spot / strike) - 0.5 * iv * iv * t) / sigmaT;
  const terminalProb = direction === "above"
    ? normalCdf(d2)
    : direction === "below"
      ? normalCdf(-d2)
      : null;
  const sigmaDistance = barrierSigmaDistance(spot, strike, iv, dteDays);
  if (terminalProb !== null && sigmaDistance !== null && sigmaDistance > ONE_TOUCH_TERMINAL_ONLY_SIGMA) {
    return terminalProb;
  }
  const d1 = (Math.log(spot / strike) + 0.5 * iv * iv * t) / sigmaT;
  if (direction === "above") return Math.min(0.99, Math.max(0, 2 * normalCdf(d1)));
  if (direction === "below") return Math.min(0.99, Math.max(0, 2 * normalCdf(-d1)));
  return null;
}

function readRelativeValueRows(): Map<string, Record<string, string>> {
  const file = join(ROOT, "relative-value", "cross_venue_relative_value.csv");
  if (!existsSync(file)) return new Map();
  return readRelativeValueCsv(file);
}

function readRelativeValueCsv(file: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const row of readCsvRecords(file)) {
    if (row.event_slug && row.market_id) map.set(`${row.event_slug}::${row.market_id}`, row);
  }
  return map;
}

function relativeValueKey(position?: Position): string | null {
  if (!position?.instrumentId) return null;
  const [eventSlug, marketId] = position.instrumentId.split("::");
  return eventSlug && marketId ? `${eventSlug}::${marketId}` : null;
}

function relativeValueHistoryFiles(): string[] {
  const files = new Set<string>();
  const visit = (dir: string) => {
    if (!existsSync(dir)) return;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith("cross_venue_relative_value.csv")) files.add(path);
    }
  };
  for (const dir of RELATIVE_VALUE_HISTORY_DIRS) visit(dir);
  const current = join(ROOT, "relative-value", "cross_venue_relative_value.csv");
  if (existsSync(current)) files.add(current);
  return [...files].sort();
}

function readRelativeValueHistoryRows(): Map<string, Array<{ timestamp: Date; row: Record<string, string> }>> {
  const byKey = new Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>();
  for (const file of relativeValueHistoryFiles()) {
    for (const [key, row] of readRelativeValueCsv(file)) {
      const timestamp = parseHeatmapTimestamp(row.timestamp);
      if (!timestamp) continue;
      const rows = byKey.get(key) ?? [];
      rows.push({ timestamp, row });
      byKey.set(key, rows);
    }
  }
  for (const rows of byKey.values()) {
    rows.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  return byKey;
}

export interface RelativeValueRowMatch {
  row?: Record<string, string>;
  source: "snapshot" | "history_exact" | "history_nearest" | "missing";
  timestamp: Date | null;
  distanceHours: number | null;
}

function rowTimestamp(row: Record<string, string> | undefined): Date | null {
  return row ? parseHeatmapTimestamp(row.timestamp) : null;
}

function hoursBetween(a: Date | null, b: Date | null): number | null {
  return a && b ? Math.abs(a.getTime() - b.getTime()) / 3_600_000 : null;
}

function fmtHours(value: number | null): string {
  return value === null ? "" : value.toFixed(2);
}

export function relativeValueEntryMatch(
  historyRows: Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>,
  position: Position | undefined,
  openedAt: string | undefined,
  snapshotRow?: Record<string, string>,
): RelativeValueRowMatch {
  const opened = parseTimestamp(openedAt);
  if (snapshotRow) {
    const timestamp = rowTimestamp(snapshotRow);
    return {
      row: snapshotRow,
      source: "snapshot",
      timestamp,
      distanceHours: hoursBetween(timestamp, opened),
    };
  }

  const key = relativeValueKey(position);
  if (!key || !opened) return { source: "missing", timestamp: null, distanceHours: null };
  const rows = historyRows.get(key);
  if (!rows?.length) return { source: "missing", timestamp: null, distanceHours: null };
  let best: { timestamp: Date; row: Record<string, string> } | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of rows) {
    const distance = Math.abs(candidate.timestamp.getTime() - opened.getTime());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  const maxDistanceMs = 36 * 60 * 60 * 1000;
  if (!best || bestDistance > maxDistanceMs) return { source: "missing", timestamp: null, distanceHours: null };
  return {
    row: best.row,
    source: bestDistance === 0 ? "history_exact" : "history_nearest",
    timestamp: best.timestamp,
    distanceHours: bestDistance / 3_600_000,
  };
}

// Prefer the canonical model probability stored in the row by the Python heatmap pipeline
// (`options_touch_adjusted_prob`). That column is the value the user actually saw at entry,
// computed against the scaled option proxy strike that we do not write back to the CSV.
// Fall back to a local recompute only when the column is missing (legacy rows).
function entryOneTouchModel(row: Record<string, string> | undefined): number | null {
  return safeNumber(row?.options_touch_adjusted_prob) ?? recomputedOneTouchProbability(row);
}

export function currentBidAsk(row: Record<string, string> | undefined, instrumentType: string | undefined): { bid: number | null; ask: number | null } {
  const yesBid = safeNumber(row?.pm_best_bid);
  const yesAsk = safeNumber(row?.pm_best_ask);
  if (yesBid === null || yesAsk === null) return { bid: null, ask: null };
  if (instrumentType === "pm_no") return { bid: 1 - yesAsk, ask: 1 - yesBid };
  return { bid: yesBid, ask: yesAsk };
}

export function relativeValueContextNote(args: {
  entryMatch: RelativeValueRowMatch;
  currentRow: Record<string, string> | undefined;
  generatedAt: string;
  entryModel: number | null;
  currentModel: number | null;
  bidAsk: { bid: number | null; ask: number | null };
  strike: string;
  expiry: string;
}): string {
  const generated = parseTimestamp(args.generatedAt);
  const currentTs = rowTimestamp(args.currentRow);
  const currentAgeHours = currentTs && generated
    ? Math.max(0, (generated.getTime() - currentTs.getTime()) / 3_600_000)
    : null;
  return [
    `entry_model=${fmtModelValue(args.entryModel) || "n/a"}`,
    `current_model=${fmtModelValue(args.currentModel) || "n/a"}`,
    `current_bid=${fmtPriceValue(args.bidAsk.bid) || "n/a"}`,
    `current_ask=${fmtPriceValue(args.bidAsk.ask) || "n/a"}`,
    `strike=${args.strike || "n/a"}`,
    `expiry=${args.expiry || "n/a"}`,
    `entry_row_source=${args.entryMatch.source}`,
    `entry_row_ts=${args.entryMatch.timestamp?.toISOString() ?? "n/a"}`,
    `entry_row_distance_hours=${fmtHours(args.entryMatch.distanceHours) || "n/a"}`,
    `current_row_source=${args.currentRow ? "current" : "missing"}`,
    `current_row_ts=${currentTs?.toISOString() ?? "n/a"}`,
    `current_row_age_hours=${fmtHours(currentAgeHours) || "n/a"}`,
  ].join("; ");
}

function hypothesisMap(hypotheses: Hypothesis[]): Map<string, Hypothesis> {
  return new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
}

function setupLabel(hypothesis: Hypothesis | undefined): string {
  if (!hypothesis) return "unassigned";
  return hypothesis.setupLabel || hypothesis.setupId || "unclassified";
}

function reportSignalType(trade: ClosedTrade): string {
  if (OPERATIONALLY_TAINTED_TRADES[trade.id]) {
    return `${trade.signalType}_OPERATIONALLY_TAINTED`;
  }
  const closeReason = trade.closeReason ?? "";
  if (trade.signalType === "PC_RATIO_EXTREME_LOW" && closeReason.includes("DATA_CORRECTION_ARTIFACT")) {
    return "PC_RATIO_EXTREME_LOW_DATA_CORRECTION_ARTIFACT";
  }
  if (closeReason === "data_quality_artifact") {
    return `${trade.signalType}_DATA_QUALITY_ARTIFACT`;
  }
  return trade.signalType;
}

function tradeSetupKey(trade: ClosedTrade, hypothesesById: Map<string, Hypothesis>): string {
  if (trade.signalType === "LLM_HYPOTHESIS" || trade.signalType === "PROMOTED_HYPOTHESIS") {
    const hypothesis = trade.hypothesisId ? hypothesesById.get(trade.hypothesisId) : undefined;
    return `${trade.signalType} / ${setupLabel(hypothesis)}`;
  }
  return reportSignalType(trade);
}

function shadowKey(shadow: BlockedSignalShadow): string {
  return `${shadow.blockedReason} / ${shadow.signalType}`;
}

function hypothesisStats(hypothesis: Hypothesis): Stats {
  const stats = emptyStats();
  for (const test of hypothesis.tests ?? []) {
    if (test.excludedFromSetupStats || test.outcome === "pending") continue;
    addStats(stats, test.outcome === "win" ? 1 : -1, test.outcome === "win" ? 100 : -100, test.outcome);
  }
  stats.pnl = 0;
  stats.pnlPctSum = 0;
  return stats;
}

function setupFamilyRows(hypotheses: Hypothesis[]): Array<[string, Stats]> {
  const map = new Map<string, Stats>();
  for (const hypothesis of hypotheses.filter((item) => item.source === "llm")) {
    const key = `${setupLabel(hypothesis)} (${hypothesis.setupId ?? "unclassified"})`;
    const stats = map.get(key) ?? emptyStats();
    const hStats = hypothesisStats(hypothesis);
    stats.trades += hStats.trades;
    stats.wins += hStats.wins;
    stats.losses += hStats.losses;
    map.set(key, stats);
  }
  return sortStatsRows([...map.entries()]);
}

function markHlPerpPositionsFromLatestSnapshot(
  positions: Position[],
  latestSnapshot: InstrumentSnapshotFile | null,
): void {
  if (!latestSnapshot?.hyperliquid) return;
  for (const position of positions) {
    if (position.instrumentType !== "hl_perp") continue;
    const quote = latestSnapshot.hyperliquid[position.instrumentId ?? position.asset]
      ?? latestSnapshot.hyperliquid[position.asset];
    const markPx = quote?.markPx;
    if (!(typeof markPx === "number" && markPx > 0)) continue;
    position.currentPrice = markPx;
    position.currentUnderlyingPrice = markPx;
  }
}

function markOpenShadowPositionsFromLatestSnapshot(
  shadows: BlockedSignalShadow[],
  latestSnapshot: InstrumentSnapshotFile | null,
): void {
  const openShadowPositions = shadows
    .filter((shadow) => shadow.status === "open" && shadow.position)
    .map((shadow) => shadow.position as Position);
  markHlPerpPositionsFromLatestSnapshot(openShadowPositions, latestSnapshot);
}

function reportBuilderDeps(): ReportBuilderDeps {
  return {
    csvHeader: CSV_HEADER,
    operationallyTaintedTrades: OPERATIONALLY_TAINTED_TRADES,
    hybridBotTradesFile: HYBRID_BOT_TRADES_FILE,
    readRelativeValueRows,
    readRelativeValueHistoryRows,
    relativeValueKey,
    relativeValueEntryMatch,
    currentBidAsk,
    entryOneTouchModel,
    rowTimestamp,
    hoursBetween,
    fmtHours,
    relativeValueContextNote,
  };
}

export function buildCsvReport(args: BuildCsvReportArgs): string {
  return buildCsvReportWithDeps(args, reportBuilderDeps());
}

export function buildMarkdownReport(args: BuildMarkdownReportArgs): string {
  return buildMarkdownReportWithDeps(args, reportBuilderDeps());
}

function writeOutput(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const outArg = args.find((arg) => arg.startsWith("--out="));
  const outPath = outArg ? outArg.slice("--out=".length) : null;
  const formatArg = args.find((arg) => arg.startsWith("--format="));
  const format = formatArg?.slice("--format=".length) ?? (outPath?.endsWith(".csv") ? "csv" : "markdown");

  const portfolio = readJson<Portfolio>(join(DATA_DIR, "portfolio.json"), {
    cash: 0,
    positions: [],
    totalRealizedPnl: 0,
    totalTrades: 0,
    winCount: 0,
    lossCount: 0,
    lastUpdated: "unknown",
  });
  const trades = readClosedTrades();
  const hypotheses = readJson<Hypothesis[]>(join(DATA_DIR, "hypotheses.json"), []);
  const shadows = readJson<BlockedSignalShadow[]>(join(DATA_DIR, "blocked-signals.json"), []);
  const latestSnapshot = readLatestInstrumentSnapshot();
  markHlPerpPositionsFromLatestSnapshot(portfolio.positions, latestSnapshot);
  markOpenShadowPositionsFromLatestSnapshot(shadows, latestSnapshot);
  const hypothesesById = hypothesisMap(hypotheses);
  const dedupedTrades = dedupeClosedTrades(trades);
  const countedTrades = dedupedTrades.filter(isCountedRealTrade);

  const duplicateTradeIds = new Set<string>();
  const seenTradeIds = new Set<string>();
  for (const trade of trades) {
    if (seenTradeIds.has(trade.id)) duplicateTradeIds.add(trade.id);
    seenTradeIds.add(trade.id);
  }

  const allTradeStats = emptyStats();
  for (const trade of countedTrades) addStats(allTradeStats, trade.pnl, trade.pnlPct);
  const rawTradeStats = emptyStats();
  for (const trade of trades) addStats(rawTradeStats, trade.pnl, trade.pnlPct);
  const operationallyTaintedTrades = trades.filter((trade) => OPERATIONALLY_TAINTED_TRADES[trade.id]);

  const resolvedShadows = shadows.filter((shadow) =>
    shadow.status === "resolved" && shadow.hypotheticalResult && !shadow.learningExcluded
  );
  const allShadowStats = emptyStats();
  for (const shadow of resolvedShadows) {
    const result = shadow.hypotheticalResult!;
    addStats(allShadowStats, result.pnl, result.pnlPct, result.outcome);
  }

  const generatedAt = new Date().toISOString();
  const reportArgs = {
    generatedAt,
    portfolio,
    allTradeStats,
    rawTradeStats,
    allShadowStats,
    duplicateTradeIds,
    operationallyTaintedTrades,
    rawTrades: trades,
    resolvedTrades: countedTrades,
    resolvedShadows,
    tradeSetupRows: grouped(countedTrades, (trade) => tradeSetupKey(trade, hypothesesById), (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    assetRows: grouped(countedTrades, (trade) => trade.asset, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    tradeTypeAssetRows: grouped(countedTrades, (trade) => `${reportSignalType(trade)} / ${trade.asset}`, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    venueAssetRows: grouped(countedTrades, (trade) => `${trade.venue} / ${trade.asset}`, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    shadowTypeRows: grouped(resolvedShadows, shadowKey, (stats, shadow) => {
      const result = shadow.hypotheticalResult!;
      addStats(stats, result.pnl, result.pnlPct, result.outcome);
    }),
    shadowTypeAssetRows: grouped(resolvedShadows, (shadow) => `${shadowKey(shadow)} / ${shadow.asset}`, (stats, shadow) => {
      const result = shadow.hypotheticalResult!;
      addStats(stats, result.pnl, result.pnlPct, result.outcome);
    }),
    setupRows: setupFamilyRows(hypotheses),
    hypotheses,
    shadows,
    hypothesesById,
    hybridBot: readHybridBotReport(),
    hyperliquidMids: extractHyperliquidMids(latestSnapshot),
  };

  const missingHybridCoins = [...reportArgs.hybridBot.positions.keys()]
    .filter((coin) => !reportArgs.hyperliquidMids.has(coin) && !reportArgs.hyperliquidMids.has(coin.toUpperCase()));
  await augmentMidsFromHyperliquid(reportArgs.hyperliquidMids, missingHybridCoins);

  const report = format === "csv" ? buildCsvReport(reportArgs) : buildMarkdownReport(reportArgs);
  if (outPath) writeOutput(outPath, report);
  console.log(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
