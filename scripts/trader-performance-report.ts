#!/usr/bin/env tsx
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsvRecords } from "./lib/reporting/csv.js";
import { readHybridBotReport as readHybridBotReportFromFiles, resolveHybridBotFile } from "./lib/reporting/hybrid-bot-report.js";
import {
  currentBidAsk,
  entryOneTouchModel,
  fmtHours,
  hoursBetween,
  readRelativeValueHistoryRowsFromDirs,
  readRelativeValueRowsFromFile,
  relativeValueContextNote,
  relativeValueEntryMatch,
  relativeValueKey,
  rowTimestamp,
} from "./lib/reporting/relative-value-context.js";
import type { RelativeValueRowMatch } from "./lib/reporting/relative-value-context.js";
import { buildReportInputs } from "./lib/reporting/report-inputs.js";
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
import type { Outcome } from "./lib/reporting/stats.js";
import { loadOperationallyTaintedTrades } from "./portfolio-ledger.js";

export { currentBidAsk, detailCsvRow, markdownOpenShadows, markdownPendingHypotheses, relativeValueContextNote, relativeValueEntryMatch, statsCsvRow, table };
export type { RelativeValueRowMatch };

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
const OPERATIONALLY_TAINTED_TRADES: Record<string, string> = loadOperationallyTaintedTrades();

const LIVE_STATE_DIR = process.env.POLYMARKET_TRADER_STATE_DIR ?? "/var/lib/polymarket-trader";
const HYBRID_BOT_TRADES_FILE = resolveHybridBotFile(
  {
    envValue: process.env.HYPERLIQUID_HYBRID_TRADES_FILE,
    basename: "hyperliquid-hybrid-trades.jsonl",
    liveStateDir: LIVE_STATE_DIR,
    dataDir: DATA_DIR,
  },
);
const HYBRID_BOT_STATE_FILE = resolveHybridBotFile(
  {
    envValue: process.env.HYPERLIQUID_HYBRID_STATE_FILE,
    basename: "hyperliquid-hybrid-state.json",
    liveStateDir: LIVE_STATE_DIR,
    dataDir: DATA_DIR,
  },
);

function readHybridBotReport() {
  return readHybridBotReportFromFiles({
    stateFile: HYBRID_BOT_STATE_FILE,
    tradesFile: HYBRID_BOT_TRADES_FILE,
  });
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

function readRelativeValueRows(): Map<string, Record<string, string>> {
  return readRelativeValueRowsFromFile(join(ROOT, "relative-value", "cross_venue_relative_value.csv"));
}

function readRelativeValueHistoryRows(): Map<string, Array<{ timestamp: Date; row: Record<string, string> }>> {
  return readRelativeValueHistoryRowsFromDirs(
    RELATIVE_VALUE_HISTORY_DIRS,
    join(ROOT, "relative-value", "cross_venue_relative_value.csv"),
  );
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
  const dedupedTrades = dedupeClosedTrades(trades);

  const generatedAt = new Date().toISOString();
  const reportArgs = buildReportInputs({
    generatedAt,
    portfolio,
    trades,
    dedupedTrades,
    hypotheses,
    shadows,
    hybridBot: readHybridBotReport(),
    hyperliquidMids: extractHyperliquidMids(latestSnapshot),
    operationallyTaintedTrades: OPERATIONALLY_TAINTED_TRADES,
    isCountedRealTrade,
  });

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
