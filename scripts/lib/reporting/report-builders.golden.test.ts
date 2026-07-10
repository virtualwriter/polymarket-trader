import { describe, expect, it } from "vitest";
import { buildCsvReport, buildMarkdownReport } from "./report-builders.js";
import type { BuildCsvReportArgs, BuildMarkdownReportArgs, ReportBuilderDeps, ReportPosition, ReportRelativeValueRowMatch } from "./report-builders.js";
import type { Stats } from "./stats.js";

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

const emptyStats = (): Stats => ({ trades: 0, wins: 0, losses: 0, pnl: 0, pnlPctSum: 0 });
const stats = (overrides: Partial<Stats> = {}): Stats => ({
  trades: 2,
  wins: 1,
  losses: 1,
  pnl: 1.25,
  pnlPctSum: 12.5,
  ...overrides,
});

const position: ReportPosition = {
  id: "pos-1",
  openedAt: "2026-06-01T12:00:00.000Z",
  asset: "BTC",
  venue: "polymarket",
  direction: "long",
  entryPrice: 0.4,
  currentPrice: 0.55,
  size: 2,
  signalType: "LLM_HYPOTHESIS",
  hypothesisId: "hyp-1",
  thesis: "Fixture thesis | with pipe",
  instrumentType: "pm_yes",
  instrumentId: "btc-hit-june-2026::123",
  instrumentLabel: "Will BTC hit $100,000 in June?",
};

const currentRow = {
  timestamp: "2026-06-08T17:00:00.000Z",
  options_touch_adjusted_prob: "0.62",
  pm_best_bid: "0.54",
  pm_best_ask: "0.56",
};
const entryRow = {
  timestamp: "2026-06-01T12:00:00.000Z",
  options_touch_adjusted_prob: "0.47",
};

const relativeValueRows = new Map<string, Record<string, string>>([
  ["btc-hit-june-2026::123", currentRow],
]);
const relativeValueHistoryRows = new Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>([
  ["btc-hit-june-2026::123", [{ timestamp: new Date(entryRow.timestamp), row: entryRow }]],
]);

const relativeValueKey = (candidate?: ReportPosition): string | null => candidate?.instrumentId ?? null;
const rowTimestamp = (row: Record<string, string> | undefined): Date | null => row?.timestamp ? new Date(row.timestamp) : null;
const hoursBetween = (a: Date | null, b: Date | null): number | null => a && b ? Math.abs(a.getTime() - b.getTime()) / 3_600_000 : null;
const fmtHours = (value: number | null): string => value === null ? "" : value.toFixed(2);
const entryOneTouchModel = (row: Record<string, string> | undefined): number | null => row?.options_touch_adjusted_prob ? Number(row.options_touch_adjusted_prob) : null;
const currentBidAsk = (row: Record<string, string> | undefined) => ({
  bid: row?.pm_best_bid ? Number(row.pm_best_bid) : null,
  ask: row?.pm_best_ask ? Number(row.pm_best_ask) : null,
});
const relativeValueEntryMatch = (
  historyRows: Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>,
  candidate: ReportPosition | undefined,
): ReportRelativeValueRowMatch => {
  const key = relativeValueKey(candidate);
  const match = key ? historyRows.get(key)?.[0] : undefined;
  return match
    ? { row: match.row, source: "history_exact", timestamp: match.timestamp, distanceHours: 0 }
    : { source: "missing", timestamp: null, distanceHours: null };
};

const deps: ReportBuilderDeps = {
  csvHeader: CSV_HEADER,
  operationallyTaintedTrades: { "trade-tainted": "manual correction" },
  hybridBotTradesFile: "/tmp/hybrid-trades.jsonl",
  readRelativeValueRows: () => relativeValueRows,
  readRelativeValueHistoryRows: () => relativeValueHistoryRows,
  relativeValueKey,
  relativeValueEntryMatch,
  currentBidAsk,
  entryOneTouchModel,
  rowTimestamp,
  hoursBetween,
  fmtHours,
  relativeValueContextNote: (args) => [
    `entry_model=${args.entryModel?.toFixed(6) ?? "n/a"}`,
    `current_model=${args.currentModel?.toFixed(6) ?? "n/a"}`,
    `current_bid=${args.bidAsk.bid?.toFixed(4) ?? "n/a"}`,
    `current_ask=${args.bidAsk.ask?.toFixed(4) ?? "n/a"}`,
    `strike=${args.strike || "n/a"}`,
    `expiry=${args.expiry || "n/a"}`,
    `entry_row_source=${args.entryMatch.source}`,
    `entry_row_ts=${args.entryMatch.timestamp?.toISOString() ?? "n/a"}`,
    `entry_row_distance_hours=${fmtHours(args.entryMatch.distanceHours) || "n/a"}`,
    `current_row_source=${args.currentRow ? "current" : "missing"}`,
    `current_row_ts=${rowTimestamp(args.currentRow)?.toISOString() ?? "n/a"}`,
    `current_row_age_hours=${fmtHours(hoursBetween(rowTimestamp(args.currentRow), new Date(args.generatedAt))) || "n/a"}`,
  ].join("; "),
};

const emptyHybridBot = {
  available: false,
  stateLastModified: null,
  feedLastModified: null,
  positions: new Map(),
  perCoinStats: new Map(),
  totalsAcrossAllCoins: {
    trades: 0,
    wins: 0,
    losses: 0,
    realizedPnlUsd: 0,
    realizedPnlPctSum: 0,
    feesUsd: 0,
    opens: 0,
    closes: 0,
    lastEventTs: null,
  },
};

const baseArgs: BuildMarkdownReportArgs = {
  generatedAt: "2026-06-08T18:00:00.000Z",
  portfolio: {
    cash: 10,
    positions: [position],
    totalRealizedPnl: 1.25,
    totalTrades: 2,
    winCount: 1,
    lossCount: 1,
    lastUpdated: "2026-06-08T17:30:00.000Z",
  },
  allTradeStats: stats(),
  rawTradeStats: stats({ trades: 3, wins: 2, losses: 1, pnl: 1.5, pnlPctSum: 14 }),
  allShadowStats: stats({ trades: 1, wins: 1, losses: 0, pnl: 0.3, pnlPctSum: 3 }),
  duplicateTradeIds: new Set(["trade-dup"]),
  operationallyTaintedTrades: [{
    id: "trade-tainted",
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: "2026-06-02T00:00:00.000Z",
    asset: "ETH",
    venue: "polymarket",
    direction: "short",
    entryPrice: 0.6,
    exitPrice: 0.5,
    size: 1,
    pnl: 0.1,
    pnlPct: 10,
    marketPnl: 0.1,
    fundingPnl: 0,
    signalType: "TEST",
    hypothesisId: null,
    thesis: "tainted",
    closeReason: "manual",
  }],
  monotonicTrades: [
    {
      id: "mono-legit",
      openedAt: "2026-06-02T00:00:00.000Z",
      closedAt: "2026-06-03T00:00:00.000Z",
      asset: "SOL",
      venue: "polymarket",
      direction: "long",
      entryPrice: 0.98,
      exitPrice: 1,
      size: 1,
      pnl: 0.02,
      pnlPct: 2,
      marketPnl: 0.02,
      fundingPnl: 0,
      signalType: "MONOTONIC_ARB",
      hypothesisId: null,
      thesis: "package",
      closeReason: "resolution",
      instrumentType: "pm_package",
    },
    {
      id: "mono-error",
      openedAt: "2026-06-02T00:00:00.000Z",
      closedAt: "2026-06-02T01:00:00.000Z",
      asset: "SOL",
      venue: "polymarket",
      direction: "long",
      entryPrice: 0.11,
      exitPrice: 0.1,
      size: 1,
      pnl: -0.09,
      pnlPct: -9,
      marketPnl: -0.09,
      fundingPnl: 0,
      signalType: "MONOTONIC_ARB",
      hypothesisId: null,
      thesis: "package migrated to single leg",
      closeReason: "stop",
      instrumentType: "pm_yes",
    },
  ],
  tradeSetupRows: [["LLM_HYPOTHESIS / Breakout | Pipe", stats()]],
  assetRows: [["BTC", stats()]],
  tradeTypeAssetRows: [["LLM_HYPOTHESIS / BTC", stats()]],
  venueAssetRows: [["polymarket / BTC", stats()]],
  shadowTypeRows: [["manual / TEST", stats({ trades: 1, wins: 1, losses: 0, pnl: 0.3, pnlPctSum: 3 })]],
  shadowTypeAssetRows: [["manual / TEST / BTC", stats({ trades: 1, wins: 1, losses: 0, pnl: 0.3, pnlPctSum: 3 })]],
  setupRows: [["Breakout | Pipe (setup-1)", stats({ trades: 1, wins: 1, losses: 0, pnl: 0, pnlPctSum: 0 })]],
  hypotheses: [{
    id: "hyp-1",
    setupId: "setup-1",
    setupLabel: "Breakout | Pipe",
    description: "Watch BTC breakout | continuation",
    tests: [{ date: "2026-06-08", outcome: "pending" }],
    winRate: 0,
    status: "active",
    promotedToSignal: false,
    source: "llm",
  }],
  shadows: [{
    id: "shadow-1",
    status: "open",
    blockedAt: "2026-06-08T16:00:00.000Z",
    blockedReason: "manual",
    signalType: "TEST",
    asset: "BTC",
    venue: "polymarket",
    direction: "long",
    thesis: "shadow thesis | escaped",
    position,
  }],
  hypothesesById: new Map([["hyp-1", {
    id: "hyp-1",
    setupId: "setup-1",
    setupLabel: "Breakout | Pipe",
    description: "Watch BTC breakout | continuation",
    tests: [{ date: "2026-06-08", outcome: "pending" }],
    winRate: 0,
    status: "active",
    promotedToSignal: false,
    source: "llm",
  }]]),
  hybridBot: emptyHybridBot,
};

const csvArgs: BuildCsvReportArgs = {
  ...baseArgs,
  rawTrades: [],
  resolvedTrades: [],
  resolvedShadows: [],
  hyperliquidMids: new Map(),
};

describe("golden trader report fixture", () => {
  it("builds deterministic CSV output for a synthetic fixture", () => {
    const csv = buildCsvReport(csvArgs, deps);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(csv).toContain("summary,generated_at");
    expect(csv).toContain("2026-06-08T18:00:00.000Z");
    expect(csv).toContain("trade_setup_type,LLM_HYPOTHESIS / Breakout | Pipe,2,1,1,50.0,1.250000,0.625000,6.2500");
    expect(csv).toContain("currently_tested_llm_hypothesis,Breakout | Pipe,0,0,0,,0.000000,0.000000,0.0000,hyp-1,active,,pending_tests=1; Watch BTC breakout | continuation");
    expect(csv).toContain("monotonic_arb_accounting,legitimate_packages,1,1,0,100.0,0.020000");
    expect(csv).toContain("monotonic_arb_accounting,operational_error_excluded,1,0,1,0.0,-0.090000");
    expect(csv).toContain("monotonic_arb_accounting,raw_total,2,1,1,50.0,-0.070000");

    const openPosition = lines.find((line) => line.startsWith("open_position,LLM_HYPOTHESIS / Breakout | Pipe,1,")) ?? "";
    expect(openPosition).toContain("pos-1,open,BTC");
    expect(openPosition).toContain("entry_model=0.470000; current_model=0.620000");
    expect(openPosition).toContain("0.470000,0.620000,0.5400,0.5600,\"$100,000\",June,history_exact,2026-06-01T12:00:00.000Z,0.00,current,2026-06-08T17:00:00.000Z,1.00");
  });

  it("builds deterministic Markdown output for a synthetic fixture", () => {
    const markdown = buildMarkdownReport(baseArgs, deps);

    expect(markdown).toContain("# Trader Performance Since Inception");
    expect(markdown).toContain("- Realized P&L, de-duped counted ledger: +$1.2500 (2 counted trades, 1W/1L, 50.0% win rate)");
    expect(markdown).toContain("- Operationally tainted trades labeled separately: trade-tainted (manual correction)");
    expect(markdown).toContain("- Monotonic arb (excluded from macro ledger): +$0.0200 on 1 legitimately-managed packages; -$0.0900 across 1 operational-error closes excluded from the strategy record");
    expect(markdown).toContain("| LLM_HYPOTHESIS / Breakout \\| Pipe | 2 | 1 | 1 | 50.0% | +$1.2500 | +$0.6250 | +6.25% |");
    expect(markdown).toContain("| hyp-1 | Breakout \\| Pipe | active | 1 | 0/0 | n/a | Watch BTC breakout \\| continuation |");
    expect(markdown).toContain("| shadow-1 | manual / TEST | BTC | polymarket | long | +$0.7500 | 2026-06-08T16:00:00.000Z |");
    expect(markdown).toContain("| pos-1 | LLM_HYPOTHESIS / Breakout \\| Pipe | BTC | polymarket | long | +$0.7500 | 0.4000 | 0.5500 | 2026-06-01T12:00:00.000Z | entry_model=0.470000; current_model=0.620000");
  });
});
