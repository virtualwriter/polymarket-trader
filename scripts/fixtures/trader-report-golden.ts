import {
  buildCsvReport,
  buildMarkdownReport,
  type BuildCsvReportArgs,
  type BuildMarkdownReportArgs,
  type ReportBuilderDeps,
} from "../lib/reporting/report-builders.js";
import { safeNumber } from "../lib/reporting/number.js";
import type { Stats } from "../lib/reporting/stats.js";
import { parseTimestamp } from "../lib/reporting/time.js";
import {
  currentBidAsk,
  relativeValueContextNote,
  relativeValueEntryMatch,
} from "../trader-performance-report.js";

const csvHeader = [
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

const stats = (overrides: Partial<Stats> = {}): Stats => ({
  trades: 1,
  wins: 1,
  losses: 0,
  pnl: 0.42,
  pnlPctSum: 12.5,
  ...overrides,
});

const generatedAt = "2026-06-08T18:00:00.000Z";
const instrumentId = "btc-hit-jun-2026::123";

const currentRows = new Map<string, Record<string, string>>([
  [instrumentId, {
    timestamp: "2026-06-08T17:00:00.000Z",
    options_touch_adjusted_prob: "0.55",
    pm_best_bid: "0.44",
    pm_best_ask: "0.46",
  }],
]);

const historyRows = new Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>([
  [instrumentId, [
    {
      timestamp: new Date("2026-06-01T12:30:00.000Z"),
      row: {
        timestamp: "2026-06-01T12:30:00.000Z",
        options_touch_adjusted_prob: "0.42",
      },
    },
  ]],
]);

const basePosition = {
  id: "pos-btc-1",
  openedAt: "2026-06-01T12:30:00.000Z",
  asset: "BTC",
  venue: "polymarket",
  direction: "long",
  entryPrice: 0.4,
  currentPrice: 0.5,
  size: 2,
  signalType: "LLM_HYPOTHESIS",
  hypothesisId: "hyp-1",
  thesis: "Golden fixture thesis",
  instrumentType: "pm_yes",
  instrumentId,
  instrumentLabel: "Will Bitcoin hit $100,000 in June?",
};

const hypothesis = {
  id: "hyp-1",
  setupId: "breakout",
  setupLabel: "Breakout | test",
  description: "Watch breakout continuation",
  tests: [
    { date: "2026-06-01", outcome: "pending" as const },
    { date: "2026-06-02", outcome: "win" as const },
  ],
  winRate: 1,
  status: "active" as const,
  promotedToSignal: false,
  source: "llm" as const,
};

const openShadow = {
  id: "shadow-open-1",
  status: "open" as const,
  blockedAt: "2026-06-01T12:30:00.000Z",
  blockedReason: "risk_gate",
  signalType: "NO_BIAS_ADJUSTED_GAP_SHADOW",
  asset: "BTC",
  venue: "polymarket",
  direction: "long",
  thesis: "Shadow thesis | escaped",
  position: {
    ...basePosition,
    id: "shadow-pos-btc-1",
    signalType: "NO_BIAS_ADJUSTED_GAP_SHADOW",
    hypothesisId: null,
    thesis: "Shadow position thesis",
  },
  heatmapRowSnapshot: {
    row: {
      timestamp: "2026-06-01T12:30:00.000Z",
      options_touch_adjusted_prob: "0.41",
    },
  },
};

const resolvedShadow = {
  id: "shadow-resolved-1",
  status: "resolved" as const,
  blockedAt: "2026-06-01T00:00:00.000Z",
  resolvedAt: "2026-06-02T00:00:00.000Z",
  blockedReason: "risk_gate",
  signalType: "NO_BIAS_ADJUSTED_GAP_SHADOW",
  asset: "BTC",
  venue: "polymarket",
  direction: "long",
  thesis: "Resolved shadow",
  hypotheticalResult: {
    pnl: 0.25,
    pnlPct: 25,
    outcome: "win" as const,
    closeReason: "resolved_no",
  },
};

const hybridBot = {
  available: true,
  stateLastModified: "2026-06-08T17:59:00.000Z",
  feedLastModified: "2026-06-08T17:58:00.000Z",
  positions: new Map([
    ["ETH", {
      in_position: true,
      is_long: true,
      entry_price: 2500,
      entry_time: "2026-06-08T17:00:00.000Z",
      mode: "long" as const,
    }],
  ]),
  perCoinStats: new Map([
    ["ETH", {
      trades: 2,
      wins: 1,
      losses: 1,
      realizedPnlUsd: 0.15,
      realizedPnlPctSum: 3,
      feesUsd: 0.01,
      opens: 2,
      closes: 2,
      lastEventTs: "2026-06-08T17:30:00.000Z",
    }],
  ]),
  totalsAcrossAllCoins: {
    trades: 2,
    wins: 1,
    losses: 1,
    realizedPnlUsd: 0.15,
    realizedPnlPctSum: 3,
    feesUsd: 0.01,
    opens: 2,
    closes: 2,
    lastEventTs: "2026-06-08T17:30:00.000Z",
  },
};

const deps: ReportBuilderDeps = {
  csvHeader,
  operationallyTaintedTrades: { "tainted-1": "manual data correction" },
  hybridBotTradesFile: "hyperliquid-hybrid-trades.jsonl",
  readRelativeValueRows: () => currentRows,
  readRelativeValueHistoryRows: () => historyRows,
  relativeValueKey: (position) => position?.instrumentId ?? null,
  relativeValueEntryMatch,
  currentBidAsk,
  entryOneTouchModel: (row) => safeNumber(row?.options_touch_adjusted_prob),
  rowTimestamp: (row) => parseTimestamp(row?.timestamp ?? ""),
  hoursBetween: (a, b) => (a && b ? (b.getTime() - a.getTime()) / 3_600_000 : null),
  fmtHours: (value) => value === null ? "" : value.toFixed(2),
  relativeValueContextNote,
};

const commonArgs: BuildMarkdownReportArgs = {
  generatedAt,
  portfolio: {
    cash: 10,
    positions: [basePosition],
    totalRealizedPnl: 0.1,
    totalTrades: 2,
    winCount: 1,
    lossCount: 1,
    lastUpdated: "2026-06-08T17:00:00.000Z",
  },
  allTradeStats: stats({ trades: 2, wins: 1, losses: 1, pnl: 0.1, pnlPctSum: 4 }),
  rawTradeStats: stats({ trades: 3, wins: 2, losses: 1, pnl: 0.2, pnlPctSum: 8 }),
  allShadowStats: stats({ trades: 1, wins: 1, losses: 0, pnl: 0.25, pnlPctSum: 25 }),
  duplicateTradeIds: new Set(["dup-1"]),
  operationallyTaintedTrades: [{
    id: "tainted-1",
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: "2026-06-01T01:00:00.000Z",
    asset: "BTC",
    venue: "polymarket",
    direction: "long",
    entryPrice: 0.5,
    exitPrice: 0.6,
    size: 1,
    pnl: 0.1,
    pnlPct: 20,
    marketPnl: 0.1,
    fundingPnl: 0,
    signalType: "LLM_HYPOTHESIS",
    hypothesisId: "hyp-1",
    thesis: "tainted",
    closeReason: "manual",
  }],
  tradeSetupRows: [["LLM_HYPOTHESIS", stats({ trades: 1, wins: 1, losses: 0, pnl: 0.1, pnlPctSum: 4 })]],
  assetRows: [["BTC", stats({ trades: 2, wins: 1, losses: 1, pnl: 0.1, pnlPctSum: 4 })]],
  tradeTypeAssetRows: [["LLM_HYPOTHESIS / BTC", stats({ trades: 2, wins: 1, losses: 1, pnl: 0.1, pnlPctSum: 4 })]],
  venueAssetRows: [["polymarket / BTC", stats({ trades: 2, wins: 1, losses: 1, pnl: 0.1, pnlPctSum: 4 })]],
  shadowTypeRows: [["risk_gate / NO_BIAS_ADJUSTED_GAP_SHADOW", stats({ trades: 1, wins: 1, losses: 0, pnl: 0.25, pnlPctSum: 25 })]],
  shadowTypeAssetRows: [["risk_gate / NO_BIAS_ADJUSTED_GAP_SHADOW / BTC", stats({ trades: 1, wins: 1, losses: 0, pnl: 0.25, pnlPctSum: 25 })]],
  setupRows: [["Breakout | test", stats({ trades: 1, wins: 1, losses: 0, pnl: 0, pnlPctSum: 0 })]],
  hypotheses: [hypothesis],
  shadows: [openShadow, resolvedShadow],
  hypothesesById: new Map([["hyp-1", hypothesis]]),
  hybridBot,
};

const csvArgs: BuildCsvReportArgs = {
  ...commonArgs,
  rawTrades: [
    commonArgs.operationallyTaintedTrades[0],
    {
      id: "trade-1",
      openedAt: "2026-06-01T00:00:00.000Z",
      closedAt: "2026-06-02T00:00:00.000Z",
      asset: "BTC",
      venue: "polymarket",
      direction: "long",
      entryPrice: 0.4,
      exitPrice: 0.45,
      size: 2,
      pnl: 0.1,
      pnlPct: 4,
      marketPnl: 0.1,
      fundingPnl: 0,
      signalType: "LLM_HYPOTHESIS",
      hypothesisId: "hyp-1",
      thesis: "[LLM] Golden fixture trade",
      closeReason: "resolved",
      instrumentLabel: "Will Bitcoin hit $100,000 in June?",
    },
  ],
  resolvedTrades: [{
    id: "trade-1",
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: "2026-06-02T00:00:00.000Z",
    asset: "BTC",
    venue: "polymarket",
    direction: "long",
    entryPrice: 0.4,
    exitPrice: 0.45,
    size: 2,
    pnl: 0.1,
    pnlPct: 4,
    marketPnl: 0.1,
    fundingPnl: 0,
    signalType: "LLM_HYPOTHESIS",
    hypothesisId: "hyp-1",
    thesis: "[LLM] Golden fixture trade",
    closeReason: "resolved",
    instrumentLabel: "Will Bitcoin hit $100,000 in June?",
  }],
  resolvedShadows: [resolvedShadow],
  hyperliquidMids: new Map([["ETH", 2600]]),
};

export function buildGoldenTraderReport(): { csv: string; markdown: string } {
  return {
    csv: buildCsvReport(csvArgs, deps),
    markdown: buildMarkdownReport(commonArgs, deps),
  };
}
