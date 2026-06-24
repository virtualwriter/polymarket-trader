import { csvLine } from "./csv.js";
import { escapeMd, fmtModelValue, fmtPct, fmtPriceValue, fmtUsd, winRate } from "./format.js";
import { safeNumber } from "./number.js";
import { extractExpiryMonth, extractStrikePrice, marketDetail, positionUnrealizedPnl, positionUnrealizedPnlPct } from "./position.js";
import { addStats, emptyStats, winRateValue } from "./stats.js";
import type { Outcome, Stats } from "./stats.js";
import { parseTimestamp } from "./time.js";

export interface ReportPosition {
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

export interface ReportClosedTrade {
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

export interface ReportPortfolio {
  cash: number;
  positions: ReportPosition[];
  totalRealizedPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  lastUpdated: string;
}

export interface ReportHypothesisTest {
  date: string;
  outcome: "win" | "loss" | "pending";
  excludedFromSetupStats?: boolean;
  exclusionReason?: string;
}

export interface ReportHypothesis {
  id: string;
  setupId?: string;
  setupLabel?: string;
  description: string;
  tests: ReportHypothesisTest[];
  winRate: number;
  status: "active" | "promoted" | "archived" | "killed";
  promotedToSignal: boolean;
  source: "llm" | "statistical";
}

export interface ReportBlockedSignalShadow {
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
  position?: ReportPosition;
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

export interface ReportHybridBotPosition {
  in_position?: boolean;
  is_long?: boolean;
  entry_price?: number;
  entry_time?: string | null;
  mode?: "long" | "short";
}

export interface ReportHybridBotCoinStats {
  trades: number;
  wins: number;
  losses: number;
  realizedPnlUsd: number;
  realizedPnlPctSum: number;
  feesUsd: number;
  opens: number;
  closes: number;
  lastEventTs: string | null;
}

export interface ReportHybridBot {
  available: boolean;
  stateLastModified: string | null;
  feedLastModified: string | null;
  positions: Map<string, ReportHybridBotPosition>;
  perCoinStats: Map<string, ReportHybridBotCoinStats>;
  totalsAcrossAllCoins: ReportHybridBotCoinStats;
}

export interface ReportRelativeValueRowMatch {
  row?: Record<string, string>;
  source: "snapshot" | "history_exact" | "history_nearest" | "missing";
  timestamp: Date | null;
  distanceHours: number | null;
}

export interface ReportBuilderDeps {
  csvHeader: readonly string[];
  operationallyTaintedTrades: Record<string, string>;
  hybridBotTradesFile: string;
  readRelativeValueRows: () => Map<string, Record<string, string>>;
  readRelativeValueHistoryRows: () => Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>;
  relativeValueKey: (position?: ReportPosition) => string | null;
  relativeValueEntryMatch: (
    historyRows: Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>,
    position: ReportPosition | undefined,
    openedAt: string | undefined,
    snapshotRow?: Record<string, string>,
  ) => ReportRelativeValueRowMatch;
  currentBidAsk: (row: Record<string, string> | undefined, instrumentType: string | undefined) => { bid: number | null; ask: number | null };
  entryOneTouchModel: (row: Record<string, string> | undefined) => number | null;
  rowTimestamp: (row: Record<string, string> | undefined) => Date | null;
  hoursBetween: (a: Date | null, b: Date | null) => number | null;
  fmtHours: (value: number | null) => string;
  relativeValueContextNote: (args: {
    entryMatch: ReportRelativeValueRowMatch;
    currentRow: Record<string, string> | undefined;
    generatedAt: string;
    entryModel: number | null;
    currentModel: number | null;
    bidAsk: { bid: number | null; ask: number | null };
    strike: string;
    expiry: string;
  }) => string;
}

export interface BuildCsvReportArgs {
  generatedAt: string;
  portfolio: ReportPortfolio;
  allTradeStats: Stats;
  rawTradeStats: Stats;
  allShadowStats: Stats;
  duplicateTradeIds: Set<string>;
  operationallyTaintedTrades: ReportClosedTrade[];
  rawTrades: ReportClosedTrade[];
  resolvedTrades: ReportClosedTrade[];
  resolvedShadows: ReportBlockedSignalShadow[];
  tradeSetupRows: Array<[string, Stats]>;
  assetRows: Array<[string, Stats]>;
  tradeTypeAssetRows: Array<[string, Stats]>;
  venueAssetRows: Array<[string, Stats]>;
  shadowTypeRows: Array<[string, Stats]>;
  shadowTypeAssetRows: Array<[string, Stats]>;
  setupRows: Array<[string, Stats]>;
  hypotheses: ReportHypothesis[];
  shadows: ReportBlockedSignalShadow[];
  hypothesesById: Map<string, ReportHypothesis>;
  hybridBot: ReportHybridBot;
  hyperliquidMids: Map<string, number>;
}

export interface BuildMarkdownReportArgs {
  generatedAt: string;
  portfolio: ReportPortfolio;
  allTradeStats: Stats;
  rawTradeStats: Stats;
  allShadowStats: Stats;
  duplicateTradeIds: Set<string>;
  operationallyTaintedTrades: ReportClosedTrade[];
  tradeSetupRows: Array<[string, Stats]>;
  assetRows: Array<[string, Stats]>;
  tradeTypeAssetRows: Array<[string, Stats]>;
  venueAssetRows: Array<[string, Stats]>;
  shadowTypeRows: Array<[string, Stats]>;
  shadowTypeAssetRows: Array<[string, Stats]>;
  setupRows: Array<[string, Stats]>;
  hypotheses: ReportHypothesis[];
  shadows: ReportBlockedSignalShadow[];
  hypothesesById: Map<string, ReportHypothesis>;
  hybridBot: ReportHybridBot;
}

export function statsCsvRow(section: string, group: string, stats: Stats): string[] {
  const avgPnl = stats.trades > 0 ? stats.pnl / stats.trades : 0;
  const avgPnlPct = stats.trades > 0 ? stats.pnlPctSum / stats.trades : 0;
  return [
    section,
    group,
    String(stats.trades),
    String(stats.wins),
    String(stats.losses),
    stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : "",
    stats.pnl.toFixed(6),
    avgPnl.toFixed(6),
    avgPnlPct.toFixed(4),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

export function detailCsvRow(section: string, group: string, stats: Stats, id: string, status: string, asset: string, notes: string): string[] {
  const row = statsCsvRow(section, group, stats);
  row[9] = id;
  row[10] = status;
  row[11] = asset;
  row[12] = notes;
  return row;
}

function setupLabel(hypothesis: ReportHypothesis | undefined): string {
  if (!hypothesis) return "unassigned";
  return hypothesis.setupLabel || hypothesis.setupId || "unclassified";
}

function shadowKey(shadow: ReportBlockedSignalShadow): string {
  return `${shadow.blockedReason} / ${shadow.signalType}`;
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

function llmHypothesisTradeBreakoutRows(trades: ReportClosedTrade[], hypothesesById: Map<string, ReportHypothesis>): Array<{ group: string; stats: Stats; id: string; asset: string; notes: string }> {
  const rows = new Map<string, { group: string; stats: Stats; id: string; asset: string; notes: string }>();
  for (const trade of trades.filter((item) => item.signalType === "LLM_HYPOTHESIS" || item.signalType === "PROMOTED_HYPOTHESIS")) {
    const hypothesis = trade.hypothesisId ? hypothesesById.get(trade.hypothesisId) : undefined;
    const hypothesisKey = trade.hypothesisId ?? trade.thesis.replace(/^\[(LLM|PROMOTED)[^\]]*\]\s*/i, "").slice(0, 120);
    const group = `${trade.signalType} / ${setupLabel(hypothesis)} / ${trade.asset} / ${trade.venue} / ${trade.direction} / ${hypothesisKey}`;
    const existing = rows.get(group) ?? {
      group,
      stats: emptyStats(),
      id: trade.hypothesisId ?? "",
      asset: trade.asset,
      notes: `${trade.instrumentLabel ? `market=${trade.instrumentLabel}; ` : ""}${trade.thesis}`,
    };
    addStats(existing.stats, trade.pnl, trade.pnlPct);
    rows.set(group, existing);
  }
  return [...rows.values()].sort((a, b) =>
    winRateValue(b.stats) - winRateValue(a.stats) ||
    b.stats.trades - a.stats.trades ||
    b.stats.pnl - a.stats.pnl ||
    a.group.localeCompare(b.group)
  );
}

export function table(title: string, rows: Array<[string, Stats]>, limit = 30): string[] {
  const out = [`## ${title}`, "", "| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |", "|---|---:|---:|---:|---:|---:|---:|---:|"];
  if (rows.length === 0) {
    out.push("| None | 0 | 0 | 0 | n/a | +$0.0000 | +$0.0000 | +0.00% |");
  } else {
    for (const [label, stats] of rows.slice(0, limit)) {
      const avgPnl = stats.trades > 0 ? stats.pnl / stats.trades : 0;
      const avgPnlPct = stats.trades > 0 ? stats.pnlPctSum / stats.trades : 0;
      out.push(`| ${escapeMd(label)} | ${stats.trades} | ${stats.wins} | ${stats.losses} | ${winRate(stats)} | ${fmtUsd(stats.pnl)} | ${fmtUsd(avgPnl)} | ${fmtPct(avgPnlPct)} |`);
    }
    if (rows.length > limit) out.push(`| ... ${rows.length - limit} more |  |  |  |  |  |  |  |`);
  }
  out.push("");
  return out;
}

function pendingHypothesisRows(hypotheses: ReportHypothesis[]): Array<{ hypothesis: ReportHypothesis; stats: Stats; pending: number }> {
  return hypotheses
    .filter((hypothesis) => hypothesis.source === "llm")
    .filter((hypothesis) => hypothesis.status === "active" || hypothesis.status === "promoted")
    .filter((hypothesis) => (hypothesis.tests ?? []).some((test) => test.outcome === "pending"))
    .map((hypothesis) => {
      const stats = hypothesisStats(hypothesis);
      const pending = (hypothesis.tests ?? []).filter((test) => test.outcome === "pending").length;
      return { hypothesis, stats, pending };
    })
    .sort((a, b) =>
      b.pending - a.pending ||
      winRateValue(b.stats) - winRateValue(a.stats) ||
      b.stats.trades - a.stats.trades ||
      a.hypothesis.id.localeCompare(b.hypothesis.id)
    );
}

export function markdownPendingHypotheses(hypotheses: ReportHypothesis[]): string[] {
  const out = ["## Currently Tested LLM Hypotheses", "", "| Hypothesis | Setup | Status | Pending Tests | Completed W/L | Win Rate | Description |", "|---|---|---|---:|---:|---:|---|"];
  const rows = pendingHypothesisRows(hypotheses);
  if (rows.length === 0) {
    out.push("| None | n/a | n/a | 0 | 0/0 | n/a | No pending hypothesis tests |");
  } else {
    for (const { hypothesis, stats, pending } of rows.slice(0, 40)) {
      out.push(`| ${hypothesis.id} | ${escapeMd(setupLabel(hypothesis))} | ${hypothesis.status}${hypothesis.promotedToSignal ? " promoted-signal" : ""} | ${pending} | ${stats.wins}/${stats.losses} | ${winRate(stats)} | ${escapeMd(hypothesis.description.slice(0, 140))} |`);
    }
    if (rows.length > 40) out.push(`| ... ${rows.length - 40} more |  |  |  |  |  |  |`);
  }
  out.push("");
  return out;
}

export function markdownOpenShadows(shadows: ReportBlockedSignalShadow[]): string[] {
  const open = shadows.filter((shadow) => shadow.status === "open").sort((a, b) => a.blockedAt.localeCompare(b.blockedAt));
  const out = ["## Currently Open Shadow Trades", "", "| Shadow | Type | Asset | Venue | Direction | Unrealized P&L | Opened | Thesis |", "|---|---|---|---|---|---:|---|---|"];
  if (open.length === 0) {
    out.push("| None | n/a | n/a | n/a | n/a | n/a | n/a | No open shadow trades |");
  } else {
    for (const shadow of open.slice(0, 40)) {
      const pnl = shadow.position ? positionUnrealizedPnl(shadow.position) : null;
      out.push(`| ${shadow.id} | ${escapeMd(shadowKey(shadow))} | ${shadow.asset} | ${shadow.venue} | ${shadow.direction} | ${pnl === null ? "n/a" : fmtUsd(pnl)} | ${shadow.blockedAt} | ${escapeMd(`${marketDetail(shadow.position)}; ${shadow.thesis}`.slice(0, 220))} |`);
    }
    if (open.length > 40) out.push(`| ... ${open.length - 40} more |  |  |  |  |  |  |  |`);
  }
  out.push("");
  return out;
}

export function buildCsvReport(args: BuildCsvReportArgs, deps: ReportBuilderDeps): string {
  const rows: string[][] = [deps.csvHeader.slice()];
  const relativeValueRows = deps.readRelativeValueRows();
  const relativeValueHistoryRows = deps.readRelativeValueHistoryRows();

  rows.push(["summary", "generated_at", "", "", "", "", "", "", "", "", "", "", args.generatedAt, "", "", "", "", "", "", "", "", ""]);
  rows.push(detailCsvRow("summary", "deduped_counted_ledger", args.allTradeStats, "", "", "", `canonical=true; source=trades-detailed.csv; dedupe=earliest_closed_at_per_trade_id; excludes=operationally_tainted,DATA_CORRECTION_ARTIFACT,NON_LEARNING_CLOSE; raw_rows=${args.rawTrades.length}; duplicate_trade_ids=${args.duplicateTradeIds.size}`));
  rows.push(["summary", "portfolio_audit", String(args.portfolio.totalTrades), String(args.portfolio.winCount), String(args.portfolio.lossCount), args.portfolio.totalTrades > 0 ? ((args.portfolio.winCount / args.portfolio.totalTrades) * 100).toFixed(1) : "", args.allTradeStats.pnl.toFixed(6), "", "", "", "", "", `corrected_counted_total=true; raw_portfolio_total=${args.portfolio.totalRealizedPnl.toFixed(6)}; source=portfolio.json; cash=${args.portfolio.cash.toFixed(6)}; last_updated=${args.portfolio.lastUpdated}`, "", args.allTradeStats.pnl.toFixed(6), "", "", "", "", "", "", ""]);
  rows.push(detailCsvRow("summary", "raw_detailed_trade_ledger_audit", args.rawTradeStats, "", "", "", `reference_only=true; source=trades-detailed.csv; duplicate_trade_ids=${args.duplicateTradeIds.size}`));
  rows.push(detailCsvRow("summary", "resolved_shadow_rollup", args.allShadowStats, "", "", "", `source=blocked-signals.json; resolved_shadows=${args.resolvedShadows.length}`));
  rows.push(["summary", "open_positions", String(args.portfolio.positions.length), "", "", "", "", "", "", "", "", "", "Current live/open positions from portfolio.json; realized_pnl uses corrected counted ledger", "", args.allTradeStats.pnl.toFixed(6), "", "", "", "", "", "", ""]);
  rows.push(["summary", "duplicate_trade_ids", String(args.duplicateTradeIds.size), "", "", "", "", "", "", "", "", "", [...args.duplicateTradeIds].join("; "), "", "", "", "", "", "", "", "", ""]);
  rows.push(["summary", "operationally_tainted_trade_ids", String(args.operationallyTaintedTrades.length), "", "", "", "", "", "", "", "", "", args.operationallyTaintedTrades.map((trade) => `${trade.id}: ${deps.operationallyTaintedTrades[trade.id]}`).join("; "), "", "", "", "", "", "", "", "", ""]);

  for (const [group, stats] of args.tradeSetupRows) rows.push(statsCsvRow("trade_setup_type", group, stats));
  for (const row of llmHypothesisTradeBreakoutRows(args.resolvedTrades, args.hypothesesById)) {
    rows.push(detailCsvRow("llm_hypothesis_trade_breakout", row.group, row.stats, row.id, "", row.asset, row.notes));
  }
  for (const [group, stats] of args.assetRows) rows.push(statsCsvRow("asset", group, stats));
  for (const [group, stats] of args.tradeTypeAssetRows) rows.push(statsCsvRow("trade_type_asset", group, stats));
  for (const [group, stats] of args.venueAssetRows) rows.push(statsCsvRow("venue_asset", group, stats));
  for (const [group, stats] of args.shadowTypeRows) rows.push(statsCsvRow("shadow_trade_type", group, stats));
  for (const [group, stats] of args.shadowTypeAssetRows) rows.push(statsCsvRow("shadow_type_asset", group, stats));
  for (const [group, stats] of args.setupRows) rows.push(statsCsvRow("llm_setup_family_tests", group, stats));

  for (const { hypothesis, stats, pending } of pendingHypothesisRows(args.hypotheses)) {
    rows.push(detailCsvRow(
      "currently_tested_llm_hypothesis",
      setupLabel(hypothesis),
      stats,
      hypothesis.id,
      `${hypothesis.status}${hypothesis.promotedToSignal ? " promoted-signal" : ""}`,
      "",
      `pending_tests=${pending}; ${hypothesis.description}`
    ));
  }

  for (const shadow of args.shadows.filter((shadow) => shadow.status === "open")) {
    const currentRowKey = deps.relativeValueKey(shadow.position);
    const currentRow = currentRowKey ? relativeValueRows.get(currentRowKey) : undefined;
    const entryMatch = deps.relativeValueEntryMatch(relativeValueHistoryRows, shadow.position, shadow.blockedAt, shadow.heatmapRowSnapshot?.row);
    const entryRow = entryMatch.row;
    const bidAsk = deps.currentBidAsk(currentRow, shadow.position?.instrumentType);
    const entryModel = deps.entryOneTouchModel(entryRow);
    const currentModel = safeNumber(currentRow?.options_touch_adjusted_prob);
    const strike = extractStrikePrice(shadow.position);
    const expiry = extractExpiryMonth(shadow.position);
    const currentTs = deps.rowTimestamp(currentRow);
    const currentAgeHours = deps.hoursBetween(currentTs, parseTimestamp(args.generatedAt));
    const rvContext = deps.relativeValueContextNote({
      entryMatch,
      currentRow,
      generatedAt: args.generatedAt,
      entryModel,
      currentModel,
      bidAsk,
      strike,
      expiry,
    });
    rows.push([
      "currently_open_shadow_trade",
      shadowKey(shadow),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      shadow.id,
      shadow.status,
      shadow.asset,
      `${shadow.venue} ${shadow.direction}; opened ${shadow.blockedAt}; ${marketDetail(shadow.position)}; ${rvContext}; ${shadow.thesis}`,
      shadow.position ? (positionUnrealizedPnlPct(shadow.position)?.toFixed(4) ?? "") : "",
      "",
      shadow.position ? (positionUnrealizedPnl(shadow.position)?.toFixed(6) ?? "") : "",
      shadow.position?.entryPrice?.toString() ?? "",
      shadow.position?.currentPrice?.toString() ?? "",
      shadow.position?.instrumentType ?? "",
      shadow.position?.instrumentId ?? "",
      shadow.position?.instrumentLabel ?? "",
      shadow.blockedAt,
      fmtModelValue(entryModel),
      fmtModelValue(currentModel),
      fmtPriceValue(bidAsk.bid),
      fmtPriceValue(bidAsk.ask),
      strike,
      expiry,
      entryMatch.source,
      entryMatch.timestamp?.toISOString() ?? "",
      deps.fmtHours(entryMatch.distanceHours),
      currentRow ? "current" : "missing",
      currentTs?.toISOString() ?? "",
      deps.fmtHours(currentAgeHours),
    ]);
  }

  for (const position of args.portfolio.positions) {
    const hypothesis = position.hypothesisId ? args.hypothesesById.get(position.hypothesisId) : undefined;
    const signal = position.signalType === "LLM_HYPOTHESIS" || position.signalType === "PROMOTED_HYPOTHESIS"
      ? `${position.signalType} / ${setupLabel(hypothesis)}`
      : position.signalType;
    const currentRowKey = deps.relativeValueKey(position);
    const currentRow = currentRowKey ? relativeValueRows.get(currentRowKey) : undefined;
    const entryMatch = deps.relativeValueEntryMatch(relativeValueHistoryRows, position, position.openedAt);
    const entryRow = entryMatch.row;
    const bidAsk = deps.currentBidAsk(currentRow, position.instrumentType);
    const entryModel = deps.entryOneTouchModel(entryRow);
    const currentModel = safeNumber(currentRow?.options_touch_adjusted_prob);
    const strike = extractStrikePrice(position);
    const expiry = extractExpiryMonth(position);
    const currentTs = deps.rowTimestamp(currentRow);
    const currentAgeHours = deps.hoursBetween(currentTs, parseTimestamp(args.generatedAt));
    const rvContext = deps.relativeValueContextNote({
      entryMatch,
      currentRow,
      generatedAt: args.generatedAt,
      entryModel,
      currentModel,
      bidAsk,
      strike,
      expiry,
    });
    rows.push([
      "open_position",
      signal,
      "1",
      "",
      "",
      "",
      "",
      "",
      "",
      position.id,
      "open",
      position.asset,
      `${position.venue} ${position.direction}; ${marketDetail(position)}; ${rvContext}; ${position.thesis}`,
      positionUnrealizedPnlPct(position)?.toFixed(4) ?? "",
      args.allTradeStats.pnl.toFixed(6),
      positionUnrealizedPnl(position)?.toFixed(6) ?? "",
      position.entryPrice.toString(),
      position.currentPrice?.toString() ?? "",
      position.instrumentType ?? "",
      position.instrumentId ?? "",
      position.instrumentLabel ?? "",
      position.openedAt,
      fmtModelValue(entryModel),
      fmtModelValue(currentModel),
      fmtPriceValue(bidAsk.bid),
      fmtPriceValue(bidAsk.ask),
      strike,
      expiry,
      entryMatch.source,
      entryMatch.timestamp?.toISOString() ?? "",
      deps.fmtHours(entryMatch.distanceHours),
      currentRow ? "current" : "missing",
      currentTs?.toISOString() ?? "",
      deps.fmtHours(currentAgeHours),
    ]);
  }

  if (args.hybridBot.available) {
    const bot = args.hybridBot;
    const totals = bot.totalsAcrossAllCoins;
    const totalWinRate = totals.trades > 0 ? ((totals.wins / totals.trades) * 100).toFixed(1) : "";
    rows.push([
      "summary", "hyperliquid_hybrid_bot",
      String(totals.trades), String(totals.wins), String(totals.losses), totalWinRate,
      totals.realizedPnlUsd.toFixed(6), "", "", "", "", "",
      `source=${deps.hybridBotTradesFile}; state_mtime=${bot.stateLastModified ?? "n/a"}; `
      + `feed_mtime=${bot.feedLastModified ?? "n/a"}; opens=${totals.opens}; closes=${totals.closes}; `
      + `fees_usd=${totals.feesUsd.toFixed(6)}; open_positions=${bot.positions.size}; `
      + `note=shadow trades from the separate Hyperliquid hybrid perp bot; `
      + `LLM trader does not own these positions; size_usd is scaled shadow size (default $1)`,
      "", totals.realizedPnlUsd.toFixed(6), "", "", "", "", "", bot.totalsAcrossAllCoins.lastEventTs ?? "", "", "", "", "", "", "",
    ]);

    const sortedCoinStats = [...bot.perCoinStats.entries()].sort(
      ([, a], [, b]) => b.realizedPnlUsd - a.realizedPnlUsd,
    );
    for (const [coin, stats] of sortedCoinStats) {
      const winRatePct = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : "";
      const avgPnl = stats.trades > 0 ? (stats.realizedPnlUsd / stats.trades).toFixed(6) : "";
      const avgPnlPct = stats.trades > 0 ? (stats.realizedPnlPctSum / stats.trades).toFixed(4) : "";
      rows.push([
        "hyperliquid_hybrid_shadow_asset", coin,
        String(stats.trades), String(stats.wins), String(stats.losses), winRatePct,
        stats.realizedPnlUsd.toFixed(6), avgPnl, avgPnlPct, "", "", coin,
        `opens=${stats.opens}; closes=${stats.closes}; fees_usd=${stats.feesUsd.toFixed(6)}; `
        + `last_event=${stats.lastEventTs ?? "n/a"}`,
        "", stats.realizedPnlUsd.toFixed(6), "", "", "", "", "", stats.lastEventTs ?? "", "", "", "", "", "", "",
      ]);
    }

    const HYBRID_SHADOW_SIZE_USD = 1.0;
    for (const [coin, pos] of [...bot.positions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const entry = pos.entry_price ?? 0;
      const mid = args.hyperliquidMids.get(coin) ?? args.hyperliquidMids.get(coin.toUpperCase());
      const isLong = pos.is_long === true;
      let unrealizedPct: number | null = null;
      let unrealizedUsd: number | null = null;
      if (entry > 0 && mid && mid > 0) {
        unrealizedPct = isLong ? (mid / entry - 1) * 100 : (entry / mid - 1) * 100;
        unrealizedUsd = (unrealizedPct / 100) * HYBRID_SHADOW_SIZE_USD;
      }
      const sideLabel = isLong ? "long" : "short";
      const groupLabel = `hyperliquid_hybrid_shadow / HL_HYBRID_${sideLabel.toUpperCase()} / ${coin}`;
      rows.push([
        "currently_open_shadow_trade",
        groupLabel,
        "", "", "", "",
        "", "", "",
        `HL-HYBRID-${coin}`, "open", coin,
        `hyperliquid perp ${sideLabel} shadow; opened ${pos.entry_time ?? "n/a"}; `
        + `mode=${pos.mode ?? "n/a"}; instrument_type=hl_perp; instrument_id=${coin}; `
        + `entry=${entry || "n/a"}; current=${mid ?? "n/a"}; shadow_size_usd=${HYBRID_SHADOW_SIZE_USD}; `
        + `source=hyperliquid-hybrid-state.json; `
        + `note=Hyperliquid hybrid bot shadow — LLM trader does not own this position`,
        unrealizedPct !== null ? unrealizedPct.toFixed(4) : "",
        "",
        unrealizedUsd !== null ? unrealizedUsd.toFixed(6) : "",
        entry ? entry.toString() : "",
        mid ? mid.toString() : "",
        "hl_perp",
        coin,
        `${coin} perp`,
        pos.entry_time ?? "",
        "", "", "", "", "", "",
      ]);
    }
  }

  const columnCount = deps.csvHeader.length;
  return rows
    .map((row) => csvLine([...row.slice(0, columnCount), ...Array(Math.max(0, columnCount - row.length)).fill("")]))
    .join("\n");
}

export function buildMarkdownReport(args: BuildMarkdownReportArgs, deps: ReportBuilderDeps): string {
  const lines: string[] = [];
  lines.push("# Trader Performance Since Inception");
  lines.push("");
  lines.push(`Generated: ${args.generatedAt}`);
  lines.push(`Portfolio last updated: ${args.portfolio.lastUpdated}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Realized P&L, de-duped counted ledger: ${fmtUsd(args.allTradeStats.pnl)} (${args.allTradeStats.trades} counted trades, ${args.allTradeStats.wins}W/${args.allTradeStats.losses}L, ${winRate(args.allTradeStats)} win rate)`);
  lines.push(`- Portfolio audit/reference: ${fmtUsd(args.portfolio.totalRealizedPnl)} (${args.portfolio.totalTrades} total trades, ${args.portfolio.winCount}W/${args.portfolio.lossCount}L)`);
  lines.push(`- Raw detailed trade ledger audit: ${fmtUsd(args.rawTradeStats.pnl)} (${args.rawTradeStats.trades} closed trade rows, ${args.rawTradeStats.wins}W/${args.rawTradeStats.losses}L, ${winRate(args.rawTradeStats)} win rate)`);
  if (args.duplicateTradeIds.size > 0) {
    lines.push(`- Ledger note: ${args.duplicateTradeIds.size} duplicate trade IDs found in trades-detailed.csv; grouped tables below use the de-duped counted ledger.`);
  }
  if (args.operationallyTaintedTrades.length > 0) {
    lines.push(`- Operationally tainted trades labeled separately: ${args.operationallyTaintedTrades.map((trade) => `${trade.id} (${deps.operationallyTaintedTrades[trade.id]})`).join("; ")}`);
  }
  lines.push(`- Current cash: $${args.portfolio.cash.toFixed(4)}`);
  lines.push(`- Open positions: ${args.portfolio.positions.length}`);
  lines.push(`- Resolved shadow P&L: ${fmtUsd(args.allShadowStats.pnl)} (${args.allShadowStats.trades} resolved shadows, ${args.allShadowStats.wins}W/${args.allShadowStats.losses}L, ${winRate(args.allShadowStats)} win rate)`);
  if (args.hybridBot.available) {
    const t = args.hybridBot.totalsAcrossAllCoins;
    const wr = t.trades > 0 ? `${((t.wins / t.trades) * 100).toFixed(1)}%` : "n/a";
    lines.push(`- Hyperliquid hybrid bot (separate; LLM does not own): ${fmtUsd(t.realizedPnlUsd)} shadow realized over ${t.trades} closed trades (${t.wins}W/${t.losses}L, ${wr} win rate), ${args.hybridBot.positions.size} open, fees ${fmtUsd(t.feesUsd)}`);
  }
  lines.push("");
  lines.push(...table("Win/Loss By Trade Setup Type", args.tradeSetupRows, 60));
  lines.push(...table("Win/Loss By Asset", args.assetRows, 30));
  lines.push(...table("P&L By Trade Type And Asset", args.tradeTypeAssetRows, 80));
  lines.push(...table("P&L By Venue And Asset", args.venueAssetRows, 40));
  lines.push(...table("Shadow P&L By Shadow Trade Type", args.shadowTypeRows, 80));
  lines.push(...table("Shadow P&L By Shadow Type And Asset", args.shadowTypeAssetRows, 80));
  lines.push(...table("LLM Setup-Family Test Win/Loss", args.setupRows, 80));
  lines.push(...markdownPendingHypotheses(args.hypotheses));
  lines.push(...markdownOpenShadows(args.shadows));
  lines.push("## Open Positions");
  lines.push("");
  lines.push("| Position | Signal | Asset | Venue | Direction | Unrealized P&L | Entry | Current | Opened | Model Context | Thesis |");
  lines.push("|---|---|---|---|---|---:|---:|---:|---|---|---|");
  if (args.portfolio.positions.length === 0) {
    lines.push("| None | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | No open positions |");
  } else {
    const relativeValueRows = deps.readRelativeValueRows();
    const relativeValueHistoryRows = deps.readRelativeValueHistoryRows();
    for (const position of args.portfolio.positions) {
      const hypothesis = position.hypothesisId ? args.hypothesesById.get(position.hypothesisId) : undefined;
      const signal = position.signalType === "LLM_HYPOTHESIS" || position.signalType === "PROMOTED_HYPOTHESIS"
        ? `${position.signalType} / ${setupLabel(hypothesis)}`
        : position.signalType;
      const pnl = positionUnrealizedPnl(position);
      const currentRowKey = deps.relativeValueKey(position);
      const currentRow = currentRowKey ? relativeValueRows.get(currentRowKey) : undefined;
      const entryMatch = deps.relativeValueEntryMatch(relativeValueHistoryRows, position, position.openedAt);
      const bidAsk = deps.currentBidAsk(currentRow, position.instrumentType);
      const context = deps.relativeValueContextNote({
        entryMatch,
        currentRow,
        generatedAt: args.generatedAt,
        entryModel: deps.entryOneTouchModel(entryMatch.row),
        currentModel: safeNumber(currentRow?.options_touch_adjusted_prob),
        bidAsk,
        strike: extractStrikePrice(position),
        expiry: extractExpiryMonth(position),
      });
      lines.push(`| ${position.id} | ${escapeMd(signal)} | ${position.asset} | ${position.venue} | ${position.direction} | ${pnl === null ? "n/a" : fmtUsd(pnl)} | ${position.entryPrice.toFixed(4)} | ${position.currentPrice?.toFixed(4) ?? "n/a"} | ${position.openedAt} | ${escapeMd(context)} | ${escapeMd(`${marketDetail(position)}; ${position.thesis}`.slice(0, 220))} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
