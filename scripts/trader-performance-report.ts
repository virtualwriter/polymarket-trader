#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Outcome = "win" | "loss";

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

interface Position {
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
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  instrumentType?: string;
  instrumentId?: string;
  instrumentLabel?: string;
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
}

interface Stats {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  pnlPctSum: number;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
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
] as const;

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cell += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }

  cells.push(cell);
  return cells;
}

function readClosedTrades(): ClosedTrade[] {
  const file = join(DATA_DIR, "trades-detailed.csv");
  if (!existsSync(file)) return [];

  const lines = readFileSync(file, "utf-8").split("\n").filter((line) => line.trim());
  const [headerLine, ...rows] = lines;
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine);
  return rows.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ""]));
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

function emptyStats(): Stats {
  return { trades: 0, wins: 0, losses: 0, pnl: 0, pnlPctSum: 0 };
}

function addStats(stats: Stats, pnl: number, pnlPct: number, outcome?: Outcome) {
  stats.trades += 1;
  stats.pnl += Number.isFinite(pnl) ? pnl : 0;
  stats.pnlPctSum += Number.isFinite(pnlPct) ? pnlPct : 0;
  const resolvedOutcome = outcome ?? (pnl >= 0 ? "win" : "loss");
  if (resolvedOutcome === "win") stats.wins += 1;
  else stats.losses += 1;
}

function winRateValue(stats: Stats): number {
  return stats.trades > 0 ? stats.wins / stats.trades : -1;
}

function sortStatsRows(rows: Array<[string, Stats]>): Array<[string, Stats]> {
  return rows.sort((a, b) =>
    winRateValue(b[1]) - winRateValue(a[1]) ||
    b[1].trades - a[1].trades ||
    b[1].pnl - a[1].pnl ||
    a[0].localeCompare(b[0])
  );
}

function grouped<T>(items: T[], keyFn: (item: T) => string, statFn: (stats: Stats, item: T) => void): Array<[string, Stats]> {
  const map = new Map<string, Stats>();
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    const stats = map.get(key) ?? emptyStats();
    statFn(stats, item);
    map.set(key, stats);
  }
  return sortStatsRows([...map.entries()]);
}

function fmtUsd(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(4)}`;
}

function fmtPct(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function winRate(stats: Stats): string {
  return stats.trades > 0 ? `${((stats.wins / stats.trades) * 100).toFixed(1)}%` : "n/a";
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(",");
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function hypothesisMap(hypotheses: Hypothesis[]): Map<string, Hypothesis> {
  return new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
}

function setupLabel(hypothesis: Hypothesis | undefined): string {
  if (!hypothesis) return "unassigned";
  return hypothesis.setupLabel || hypothesis.setupId || "unclassified";
}

function reportSignalType(trade: ClosedTrade): string {
  if (trade.signalType === "PC_RATIO_EXTREME_LOW" && trade.closeReason.includes("DATA_CORRECTION_ARTIFACT")) {
    return "PC_RATIO_EXTREME_LOW_DATA_CORRECTION_ARTIFACT";
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

function positionUnrealizedPnl(position: Position): number | null {
  if (!Number.isFinite(position.entryPrice) || position.entryPrice === 0 || !Number.isFinite(position.currentPrice)) return null;
  const currentPrice = position.currentPrice as number;

  // Polymarket YES/NO rows represent owned shares. A short thesis can map to
  // buying NO, so token P&L still rises when the NO token price rises.
  const isOwnedPolymarketToken =
    position.instrumentType === "pm_yes" ||
    position.instrumentType === "pm_no" ||
    position.instrumentType === "pm_package";

  const rawMove = position.direction === "short" && !isOwnedPolymarketToken
    ? (position.entryPrice - currentPrice) / position.entryPrice
    : (currentPrice - position.entryPrice) / position.entryPrice;
  return rawMove * (Number.isFinite(position.size) ? position.size : 1);
}

function positionUnrealizedPnlPct(position: Position): number | null {
  const pnl = positionUnrealizedPnl(position);
  if (pnl === null) return null;
  const size = Number.isFinite(position.size) && position.size !== 0 ? position.size : 1;
  return (pnl / size) * 100;
}

function marketDetail(position?: Position): string {
  if (!position) return "";
  const parts = [
    position.instrumentLabel ? `market=${position.instrumentLabel}` : "",
    position.instrumentType ? `instrument_type=${position.instrumentType}` : "",
    position.instrumentId ? `instrument_id=${position.instrumentId}` : "",
    Number.isFinite(position.entryPrice) ? `entry=${position.entryPrice}` : "",
    Number.isFinite(position.currentPrice) ? `current=${position.currentPrice}` : "",
    Number.isFinite(position.entryUnderlyingPrice) ? `entry_underlying=${position.entryUnderlyingPrice}` : "",
    Number.isFinite(position.currentUnderlyingPrice) ? `current_underlying=${position.currentUnderlyingPrice}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

function statsCsvRow(section: string, group: string, stats: Stats): string[] {
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

function detailCsvRow(section: string, group: string, stats: Stats, id: string, status: string, asset: string, notes: string): string[] {
  const row = statsCsvRow(section, group, stats);
  row[9] = id;
  row[10] = status;
  row[11] = asset;
  row[12] = notes;
  return row;
}

function llmHypothesisTradeBreakoutRows(trades: ClosedTrade[], hypothesesById: Map<string, Hypothesis>): Array<{ group: string; stats: Stats; id: string; asset: string; notes: string }> {
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

function table(title: string, rows: Array<[string, Stats]>, limit = 30): string[] {
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

function pendingHypothesisRows(hypotheses: Hypothesis[]): Array<{ hypothesis: Hypothesis; stats: Stats; pending: number }> {
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

function markdownPendingHypotheses(hypotheses: Hypothesis[]): string[] {
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

function markdownOpenShadows(shadows: BlockedSignalShadow[]): string[] {
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

function buildCsvReport(args: {
  generatedAt: string;
  portfolio: Portfolio;
  allTradeStats: Stats;
  allShadowStats: Stats;
  duplicateTradeIds: Set<string>;
  resolvedTrades: ClosedTrade[];
  resolvedShadows: BlockedSignalShadow[];
  tradeSetupRows: Array<[string, Stats]>;
  assetRows: Array<[string, Stats]>;
  tradeTypeAssetRows: Array<[string, Stats]>;
  venueAssetRows: Array<[string, Stats]>;
  shadowTypeRows: Array<[string, Stats]>;
  shadowTypeAssetRows: Array<[string, Stats]>;
  setupRows: Array<[string, Stats]>;
  hypotheses: Hypothesis[];
  shadows: BlockedSignalShadow[];
  hypothesesById: Map<string, Hypothesis>;
}): string {
  const rows: string[][] = [CSV_HEADER.slice()];

  rows.push(["summary", "generated_at", "", "", "", "", "", "", "", "", "", "", args.generatedAt, "", "", "", "", "", "", "", "", ""]);
  rows.push(["summary", "portfolio_realized_pnl", String(args.portfolio.totalTrades), String(args.portfolio.winCount), String(args.portfolio.lossCount), args.portfolio.totalTrades > 0 ? ((args.portfolio.winCount / args.portfolio.totalTrades) * 100).toFixed(1) : "", args.portfolio.totalRealizedPnl.toFixed(6), "", "", "", "", "", `source=portfolio.json; cash=${args.portfolio.cash.toFixed(6)}; last_updated=${args.portfolio.lastUpdated}`, "", args.portfolio.totalRealizedPnl.toFixed(6), "", "", "", "", "", "", ""]);
  rows.push(detailCsvRow("summary", "detailed_trade_ledger_rollup", args.allTradeStats, "", "", "", `source=trades-detailed.csv; duplicate_trade_ids=${args.duplicateTradeIds.size}`));
  rows.push(detailCsvRow("summary", "resolved_shadow_rollup", args.allShadowStats, "", "", "", `source=blocked-signals.json; resolved_shadows=${args.resolvedShadows.length}`));
  rows.push(["summary", "open_positions", String(args.portfolio.positions.length), "", "", "", "", "", "", "", "", "", "Current live/open positions from portfolio.json", "", args.portfolio.totalRealizedPnl.toFixed(6), "", "", "", "", "", "", ""]);
  rows.push(["summary", "duplicate_trade_ids", String(args.duplicateTradeIds.size), "", "", "", "", "", "", "", "", "", [...args.duplicateTradeIds].join("; "), "", "", "", "", "", "", "", "", ""]);

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
      `${shadow.venue} ${shadow.direction}; opened ${shadow.blockedAt}; ${marketDetail(shadow.position)}; ${shadow.thesis}`,
      shadow.position ? (positionUnrealizedPnlPct(shadow.position)?.toFixed(4) ?? "") : "",
      "",
      shadow.position ? (positionUnrealizedPnl(shadow.position)?.toFixed(6) ?? "") : "",
      shadow.position?.entryPrice?.toString() ?? "",
      shadow.position?.currentPrice?.toString() ?? "",
      shadow.position?.instrumentType ?? "",
      shadow.position?.instrumentId ?? "",
      shadow.position?.instrumentLabel ?? "",
      shadow.blockedAt,
    ]);
  }

  for (const position of args.portfolio.positions) {
    const hypothesis = position.hypothesisId ? args.hypothesesById.get(position.hypothesisId) : undefined;
    const signal = position.signalType === "LLM_HYPOTHESIS" || position.signalType === "PROMOTED_HYPOTHESIS"
      ? `${position.signalType} / ${setupLabel(hypothesis)}`
      : position.signalType;
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
      `${position.venue} ${position.direction}; ${marketDetail(position)}; ${position.thesis}`,
      positionUnrealizedPnlPct(position)?.toFixed(4) ?? "",
      args.portfolio.totalRealizedPnl.toFixed(6),
      positionUnrealizedPnl(position)?.toFixed(6) ?? "",
      position.entryPrice.toString(),
      position.currentPrice?.toString() ?? "",
      position.instrumentType ?? "",
      position.instrumentId ?? "",
      position.instrumentLabel ?? "",
      position.openedAt,
    ]);
  }

  const columnCount = CSV_HEADER.length;
  return rows
    .map((row) => csvLine([...row.slice(0, columnCount), ...Array(Math.max(0, columnCount - row.length)).fill("")]))
    .join("\n");
}

function buildMarkdownReport(args: {
  generatedAt: string;
  portfolio: Portfolio;
  allTradeStats: Stats;
  allShadowStats: Stats;
  duplicateTradeIds: Set<string>;
  tradeSetupRows: Array<[string, Stats]>;
  assetRows: Array<[string, Stats]>;
  tradeTypeAssetRows: Array<[string, Stats]>;
  venueAssetRows: Array<[string, Stats]>;
  shadowTypeRows: Array<[string, Stats]>;
  shadowTypeAssetRows: Array<[string, Stats]>;
  setupRows: Array<[string, Stats]>;
  hypotheses: Hypothesis[];
  shadows: BlockedSignalShadow[];
  hypothesesById: Map<string, Hypothesis>;
}): string {
  const lines: string[] = [];
  lines.push("# Trader Performance Since Inception");
  lines.push("");
  lines.push(`Generated: ${args.generatedAt}`);
  lines.push(`Portfolio last updated: ${args.portfolio.lastUpdated}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Realized P&L, portfolio source of truth: ${fmtUsd(args.portfolio.totalRealizedPnl)} (${args.portfolio.totalTrades} total trades, ${args.portfolio.winCount}W/${args.portfolio.lossCount}L)`);
  lines.push(`- Detailed trade ledger rollup: ${fmtUsd(args.allTradeStats.pnl)} (${args.allTradeStats.trades} closed trade rows, ${args.allTradeStats.wins}W/${args.allTradeStats.losses}L, ${winRate(args.allTradeStats)} win rate)`);
  if (args.duplicateTradeIds.size > 0) {
    lines.push(`- Ledger note: ${args.duplicateTradeIds.size} duplicate trade IDs found in trades-detailed.csv; grouped tables below use ledger rows so they tie to the visible detailed history, while total P&L above uses portfolio.json as canonical.`);
  }
  lines.push(`- Current cash: $${args.portfolio.cash.toFixed(4)}`);
  lines.push(`- Open positions: ${args.portfolio.positions.length}`);
  lines.push(`- Resolved shadow P&L: ${fmtUsd(args.allShadowStats.pnl)} (${args.allShadowStats.trades} resolved shadows, ${args.allShadowStats.wins}W/${args.allShadowStats.losses}L, ${winRate(args.allShadowStats)} win rate)`);
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
  lines.push("| Position | Signal | Asset | Venue | Direction | Unrealized P&L | Entry | Current | Opened | Thesis |");
  lines.push("|---|---|---|---|---|---:|---:|---:|---|---|");
  if (args.portfolio.positions.length === 0) {
    lines.push("| None | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | No open positions |");
  } else {
    for (const position of args.portfolio.positions) {
      const hypothesis = position.hypothesisId ? args.hypothesesById.get(position.hypothesisId) : undefined;
      const signal = position.signalType === "LLM_HYPOTHESIS" || position.signalType === "PROMOTED_HYPOTHESIS"
        ? `${position.signalType} / ${setupLabel(hypothesis)}`
        : position.signalType;
      const pnl = positionUnrealizedPnl(position);
      lines.push(`| ${position.id} | ${escapeMd(signal)} | ${position.asset} | ${position.venue} | ${position.direction} | ${pnl === null ? "n/a" : fmtUsd(pnl)} | ${position.entryPrice.toFixed(4)} | ${position.currentPrice?.toFixed(4) ?? "n/a"} | ${position.openedAt} | ${escapeMd(`${marketDetail(position)}; ${position.thesis}`.slice(0, 220))} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function writeOutput(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content + "\n");
}

function main() {
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
  const hypothesesById = hypothesisMap(hypotheses);

  const duplicateTradeIds = new Set<string>();
  const seenTradeIds = new Set<string>();
  for (const trade of trades) {
    if (seenTradeIds.has(trade.id)) duplicateTradeIds.add(trade.id);
    seenTradeIds.add(trade.id);
  }

  const allTradeStats = emptyStats();
  for (const trade of trades) addStats(allTradeStats, trade.pnl, trade.pnlPct);

  const resolvedShadows = shadows.filter((shadow) => shadow.status === "resolved" && shadow.hypotheticalResult);
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
    allShadowStats,
    duplicateTradeIds,
    resolvedTrades: trades,
    resolvedShadows,
    tradeSetupRows: grouped(trades, (trade) => tradeSetupKey(trade, hypothesesById), (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    assetRows: grouped(trades, (trade) => trade.asset, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    tradeTypeAssetRows: grouped(trades, (trade) => `${reportSignalType(trade)} / ${trade.asset}`, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
    venueAssetRows: grouped(trades, (trade) => `${trade.venue} / ${trade.asset}`, (stats, trade) => addStats(stats, trade.pnl, trade.pnlPct)),
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
  };

  const report = format === "csv" ? buildCsvReport(reportArgs) : buildMarkdownReport(reportArgs);
  if (outPath) writeOutput(outPath, report);
  console.log(report);
}

main();
