#!/usr/bin/env tsx
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readHybridBotReport as readHybridBotReportFromFiles, resolveHybridBotFile } from "./lib/reporting/hybrid-bot-report.js";
import {
  dedupeClosedTrades,
  extractHyperliquidMids,
  markHlPerpPositionsFromLatestSnapshot,
  markOpenShadowPositionsFromLatestSnapshot,
  readClosedTrades,
  readJson,
  readLatestInstrumentSnapshot,
} from "./lib/reporting/report-data.js";
import type { InstrumentSnapshotFile } from "./lib/reporting/report-data.js";
import { buildReportForFormat, parseReportCliArgs, writeReportOutput } from "./lib/reporting/report-cli.js";
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
import type { BuildCsvReportArgs, BuildMarkdownReportArgs, ReportBuilderDeps, ReportBlockedSignalShadow, ReportClosedTrade, ReportHypothesis, ReportPortfolio, ReportPosition } from "./lib/reporting/report-builders.js";
import { loadOperationallyTaintedTrades } from "./portfolio-ledger.js";

export { currentBidAsk, detailCsvRow, markdownOpenShadows, markdownPendingHypotheses, relativeValueContextNote, relativeValueEntryMatch, statsCsvRow, table };
export type { RelativeValueRowMatch };

export type Position = ReportPosition;

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

function isCountedRealTrade(trade: ReportClosedTrade): boolean {
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

async function main() {
  const { outPath, format } = parseReportCliArgs(process.argv.slice(2));

  const portfolio = readJson<ReportPortfolio>(join(DATA_DIR, "portfolio.json"), {
    cash: 0,
    positions: [],
    totalRealizedPnl: 0,
    totalTrades: 0,
    winCount: 0,
    lossCount: 0,
    lastUpdated: "unknown",
  });
  const trades = readClosedTrades(join(DATA_DIR, "trades-detailed.csv"));
  const hypotheses = readJson<ReportHypothesis[]>(join(DATA_DIR, "hypotheses.json"), []);
  const shadows = readJson<ReportBlockedSignalShadow[]>(join(DATA_DIR, "blocked-signals.json"), []);
  const latestSnapshot = readLatestInstrumentSnapshot(join(DATA_DIR, "instrument-snapshots.jsonl"));
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

  const report = buildReportForFormat(format, reportArgs, { buildCsvReport, buildMarkdownReport });
  if (outPath) writeReportOutput(outPath, report);
  console.log(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
