import type { BuildCsvReportArgs, ReportBlockedSignalShadow, ReportClosedTrade, ReportHybridBot, ReportHypothesis, ReportPortfolio } from "./report-builders.js";
import { addStats, emptyStats, grouped, sortStatsRows } from "./stats.js";
import type { Stats } from "./stats.js";

export interface BuildReportInputsArgs {
  generatedAt: string;
  portfolio: ReportPortfolio;
  trades: ReportClosedTrade[];
  dedupedTrades: ReportClosedTrade[];
  monotonicTrades?: ReportClosedTrade[];
  hypotheses: ReportHypothesis[];
  shadows: ReportBlockedSignalShadow[];
  hybridBot: ReportHybridBot;
  hyperliquidMids: Map<string, number>;
  operationallyTaintedTrades: Record<string, string>;
  isCountedRealTrade: (trade: ReportClosedTrade) => boolean;
}

function hypothesisMap(hypotheses: ReportHypothesis[]): Map<string, ReportHypothesis> {
  return new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
}

function setupLabel(hypothesis: ReportHypothesis | undefined): string {
  if (!hypothesis) return "unassigned";
  return hypothesis.setupLabel || hypothesis.setupId || "unclassified";
}

function reportSignalType(trade: ReportClosedTrade, operationallyTaintedTrades: Record<string, string>): string {
  if (operationallyTaintedTrades[trade.id]) {
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

function tradeSetupKey(
  trade: ReportClosedTrade,
  hypothesesById: Map<string, ReportHypothesis>,
  operationallyTaintedTrades: Record<string, string>,
): string {
  if (trade.signalType === "LLM_HYPOTHESIS" || trade.signalType === "PROMOTED_HYPOTHESIS") {
    const hypothesis = trade.hypothesisId ? hypothesesById.get(trade.hypothesisId) : undefined;
    return `${trade.signalType} / ${setupLabel(hypothesis)}`;
  }
  return reportSignalType(trade, operationallyTaintedTrades);
}

function shadowKey(shadow: ReportBlockedSignalShadow): string {
  return `${shadow.blockedReason} / ${shadow.signalType}`;
}

/**
 * One-touch NO shadows resolved on "edge_disappeared" were force-closed at a
 * mid-flight mark instead of being held to expiry as the family's convention
 * requires (the resolver bug is fixed in trading-engine.ts, 2026-07-10).
 * Those historical closes are measurement artifacts, not strategy results,
 * so they are excluded from shadow P&L rollups.
 */
export function isForceClosedOneTouchShadow(shadow: ReportBlockedSignalShadow): boolean {
  return shadow.signalType === "ONE_TOUCH_HIGH_EDGE_NO"
    && shadow.blockedReason === "one_touch_high_edge_shadow"
    && shadow.thesis.includes("edge_disappeared");
}

function hypothesisStats(hypothesis: ReportHypothesis): Stats {
  const stats = emptyStats();
  for (const test of hypothesis.tests ?? []) {
    if (test.excludedFromSetupStats || test.outcome === "pending") continue;
    addStats(stats, test.outcome === "win" ? 1 : -1, test.outcome === "win" ? 100 : -100, test.outcome);
  }
  stats.pnl = 0;
  stats.pnlPctSum = 0;
  return stats;
}

function setupFamilyRows(hypotheses: ReportHypothesis[]): Array<[string, Stats]> {
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

export function buildReportInputs(args: BuildReportInputsArgs): BuildCsvReportArgs {
  const hypothesesById = hypothesisMap(args.hypotheses);
  const countedTrades = args.dedupedTrades.filter(args.isCountedRealTrade);

  const duplicateTradeIds = new Set<string>();
  const seenTradeIds = new Set<string>();
  for (const trade of args.trades) {
    if (seenTradeIds.has(trade.id)) duplicateTradeIds.add(trade.id);
    seenTradeIds.add(trade.id);
  }

  const allTradeStats = emptyStats();
  for (const trade of countedTrades) addStats(allTradeStats, trade.pnl, trade.pnlPct);
  const rawTradeStats = emptyStats();
  for (const trade of args.trades) addStats(rawTradeStats, trade.pnl, trade.pnlPct);
  const operationallyTaintedTrades = args.trades.filter((trade) => args.operationallyTaintedTrades[trade.id]);

  const resolvedShadows = args.shadows.filter((shadow) =>
    shadow.status === "resolved" && shadow.hypotheticalResult && !shadow.learningExcluded
    && !isForceClosedOneTouchShadow(shadow)
  );
  const allShadowStats = emptyStats();
  for (const shadow of resolvedShadows) {
    const result = shadow.hypotheticalResult!;
    addStats(allShadowStats, result.pnl, result.pnlPct, result.outcome);
  }

  return {
    generatedAt: args.generatedAt,
    portfolio: args.portfolio,
    allTradeStats,
    rawTradeStats,
    allShadowStats,
    duplicateTradeIds,
    operationallyTaintedTrades,
    monotonicTrades: args.monotonicTrades ?? [],
    rawTrades: args.trades,
    resolvedTrades: countedTrades,
    resolvedShadows,
    tradeSetupRows: grouped(countedTrades, (trade) => tradeSetupKey(trade, hypothesesById, args.operationallyTaintedTrades), (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    assetRows: grouped(countedTrades, (trade) => trade.asset, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    tradeTypeAssetRows: grouped(countedTrades, (trade) => `${reportSignalType(trade, args.operationallyTaintedTrades)} / ${trade.asset}`, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    venueAssetRows: grouped(countedTrades, (trade) => `${trade.venue} / ${trade.asset}`, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    shadowTypeRows: grouped(resolvedShadows, shadowKey, (stats, shadow) => {
      const result = shadow.hypotheticalResult!;
      addStats(stats, result.pnl, result.pnlPct, result.outcome);
    }),
    shadowTypeAssetRows: grouped(resolvedShadows, (shadow) => `${shadowKey(shadow)} / ${shadow.asset}`, (stats, shadow) => {
      const result = shadow.hypotheticalResult!;
      addStats(stats, result.pnl, result.pnlPct, result.outcome);
    }),
    setupRows: setupFamilyRows(args.hypotheses),
    hypotheses: args.hypotheses,
    shadows: args.shadows,
    hypothesesById,
    hybridBot: args.hybridBot,
    hyperliquidMids: args.hyperliquidMids,
  };
}
