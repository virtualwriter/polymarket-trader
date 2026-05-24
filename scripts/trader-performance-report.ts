#!/usr/bin/env tsx
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
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
  leverage?: number;
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

interface Stats {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  pnlPctSum: number;
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
const OPERATIONALLY_TAINTED_TRADES: Record<string, string> = {
  "T-1778707778058-9nsi": "hourly LLM close had authority over rule-owned funding trade",
  "T-1778718867328-1tjp": "one-touch NO inherited generic 2% Polymarket stop instead of 100% hold-to-expiry stop",
  "T-1779049817841-htfg": "strike-IV-skew data-quality artifact; excluded from live trader totals",
  "T-1779478230785-kc6x": "sub-cent one-sided Polymarket entry artifact outside the trader thesis",
};
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
] as const;

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
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

function safeNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalCdf(x: number): number {
  // Abramowitz and Stegun 7.1.26 approximation.
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * abs);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs);
  return 0.5 * (1 + sign * erf);
}

function parseHeatmapTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(value) ? `${value}:00:00Z` : value;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
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
  if (!existsSync(file)) return new Map();
  let lines: string[];
  try {
    lines = readFileSync(file, "utf-8").split("\n").filter((line) => line.trim());
  } catch {
    return new Map();
  }
  const [headerLine, ...rows] = lines;
  if (!headerLine) return new Map();
  const headers = parseCsvLine(headerLine);
  const map = new Map<string, Record<string, string>>();
  for (const line of rows) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ""]));
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

function nearestRelativeValueEntryRow(
  historyRows: Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>,
  position: Position | undefined,
  openedAt: string | undefined,
): Record<string, string> | undefined {
  const key = relativeValueKey(position);
  const opened = parseTimestamp(openedAt);
  if (!key || !opened) return undefined;
  const rows = historyRows.get(key);
  if (!rows?.length) return undefined;
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
  return best && bestDistance <= maxDistanceMs ? best.row : undefined;
}

// Prefer the canonical model probability stored in the row by the Python heatmap pipeline
// (`options_touch_adjusted_prob`). That column is the value the user actually saw at entry,
// computed against the scaled option proxy strike that we do not write back to the CSV.
// Fall back to a local recompute only when the column is missing (legacy rows).
function entryOneTouchModel(row: Record<string, string> | undefined): number | null {
  return safeNumber(row?.options_touch_adjusted_prob) ?? recomputedOneTouchProbability(row);
}

function currentBidAsk(row: Record<string, string> | undefined, instrumentType: string | undefined): { bid: number | null; ask: number | null } {
  const yesBid = safeNumber(row?.pm_best_bid);
  const yesAsk = safeNumber(row?.pm_best_ask);
  if (yesBid === null || yesAsk === null) return { bid: null, ask: null };
  if (instrumentType === "pm_no") return { bid: 1 - yesAsk, ask: 1 - yesBid };
  return { bid: yesBid, ask: yesAsk };
}

function fmtModelValue(value: number | null): string {
  return value === null ? "" : value.toFixed(6);
}

function fmtPriceValue(value: number | null): string {
  return value === null ? "" : value.toFixed(4);
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
  const size = Number.isFinite(position.size) ? position.size : 1;
  const leverage = position.instrumentType === "hl_perp" && Number.isFinite(position.leverage)
    ? (position.leverage as number)
    : 1;
  return rawMove * size * leverage;
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

const MONTH_NAMES: Record<string, string> = {
  jan: "January",
  january: "January",
  feb: "February",
  february: "February",
  mar: "March",
  march: "March",
  apr: "April",
  april: "April",
  may: "May",
  jun: "June",
  june: "June",
  jul: "July",
  july: "July",
  aug: "August",
  august: "August",
  sep: "September",
  sept: "September",
  september: "September",
  oct: "October",
  october: "October",
  nov: "November",
  november: "November",
  dec: "December",
  december: "December",
};

function formatStrike(value: string): string {
  const normalized = value.replace(/,/g, "");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return value;
  return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
}

function extractStrikePrice(position?: Position): string {
  if (!position) return "";
  const label = position.instrumentLabel ?? "";
  const packageMatch = label.match(/monotonic arb package\s+—\s+YES\s+([\d,.]+)\s*\/\s*NO\s+([\d,.]+)/i);
  if (packageMatch) return `${formatStrike(packageMatch[1])} / ${formatStrike(packageMatch[2])}`;

  const dollarMatches = [...label.matchAll(/\$([\d,]+(?:\.\d+)?)/g)];
  if (dollarMatches.length > 0) return formatStrike(dollarMatches[dollarMatches.length - 1][1]);

  const id = position.instrumentId ?? "";
  const packageIdMatch = id.match(/::YES-([\d,.]+)\+NO-([\d,.]+)/i);
  if (packageIdMatch) return `${formatStrike(packageIdMatch[1])} / ${formatStrike(packageIdMatch[2])}`;

  return "";
}

function extractExpiryMonth(position?: Position): string {
  if (!position) return "";
  const source = `${position.instrumentLabel ?? ""} ${position.instrumentId ?? ""}`;
  const slugMonthMatch = source.match(/(?:^|[-\s])(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:[-\s]|$)/i);
  if (slugMonthMatch) return MONTH_NAMES[slugMonthMatch[1].toLowerCase()] ?? "";

  const phraseMonthMatch = source.match(/\b(?:in|by end of|end of|by)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  if (phraseMonthMatch) return MONTH_NAMES[phraseMonthMatch[1].toLowerCase()] ?? "";

  return "";
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
  rawTradeStats: Stats;
  allShadowStats: Stats;
  duplicateTradeIds: Set<string>;
  operationallyTaintedTrades: ClosedTrade[];
  rawTrades: ClosedTrade[];
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
  const relativeValueRows = readRelativeValueRows();
  const relativeValueHistoryRows = readRelativeValueHistoryRows();

  rows.push(["summary", "generated_at", "", "", "", "", "", "", "", "", "", "", args.generatedAt, "", "", "", "", "", "", "", "", ""]);
  rows.push(detailCsvRow("summary", "deduped_counted_ledger", args.allTradeStats, "", "", "", `canonical=true; source=trades-detailed.csv; dedupe=earliest_closed_at_per_trade_id; excludes=operationally_tainted,DATA_CORRECTION_ARTIFACT,NON_LEARNING_CLOSE; raw_rows=${args.rawTrades.length}; duplicate_trade_ids=${args.duplicateTradeIds.size}`));
  rows.push(["summary", "portfolio_audit", String(args.portfolio.totalTrades), String(args.portfolio.winCount), String(args.portfolio.lossCount), args.portfolio.totalTrades > 0 ? ((args.portfolio.winCount / args.portfolio.totalTrades) * 100).toFixed(1) : "", args.allTradeStats.pnl.toFixed(6), "", "", "", "", "", `corrected_counted_total=true; raw_portfolio_total=${args.portfolio.totalRealizedPnl.toFixed(6)}; source=portfolio.json; cash=${args.portfolio.cash.toFixed(6)}; last_updated=${args.portfolio.lastUpdated}`, "", args.allTradeStats.pnl.toFixed(6), "", "", "", "", "", "", ""]);
  rows.push(detailCsvRow("summary", "raw_detailed_trade_ledger_audit", args.rawTradeStats, "", "", "", `reference_only=true; source=trades-detailed.csv; duplicate_trade_ids=${args.duplicateTradeIds.size}`));
  rows.push(detailCsvRow("summary", "resolved_shadow_rollup", args.allShadowStats, "", "", "", `source=blocked-signals.json; resolved_shadows=${args.resolvedShadows.length}`));
  rows.push(["summary", "open_positions", String(args.portfolio.positions.length), "", "", "", "", "", "", "", "", "", "Current live/open positions from portfolio.json; realized_pnl uses corrected counted ledger", "", args.allTradeStats.pnl.toFixed(6), "", "", "", "", "", "", ""]);
  rows.push(["summary", "duplicate_trade_ids", String(args.duplicateTradeIds.size), "", "", "", "", "", "", "", "", "", [...args.duplicateTradeIds].join("; "), "", "", "", "", "", "", "", "", ""]);
  rows.push(["summary", "operationally_tainted_trade_ids", String(args.operationallyTaintedTrades.length), "", "", "", "", "", "", "", "", "", args.operationallyTaintedTrades.map((trade) => `${trade.id}: ${OPERATIONALLY_TAINTED_TRADES[trade.id]}`).join("; "), "", "", "", "", "", "", "", "", ""]);

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
    const currentRowKey = relativeValueKey(shadow.position);
    const currentRow = currentRowKey ? relativeValueRows.get(currentRowKey) : undefined;
    const entryRow = shadow.heatmapRowSnapshot?.row ?? nearestRelativeValueEntryRow(relativeValueHistoryRows, shadow.position, shadow.blockedAt);
    const bidAsk = currentBidAsk(currentRow, shadow.position?.instrumentType);
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
      fmtModelValue(entryOneTouchModel(entryRow)),
      fmtModelValue(safeNumber(currentRow?.options_touch_adjusted_prob)),
      fmtPriceValue(bidAsk.bid),
      fmtPriceValue(bidAsk.ask),
      extractStrikePrice(shadow.position),
      extractExpiryMonth(shadow.position),
    ]);
  }

  for (const position of args.portfolio.positions) {
    const hypothesis = position.hypothesisId ? args.hypothesesById.get(position.hypothesisId) : undefined;
    const signal = position.signalType === "LLM_HYPOTHESIS" || position.signalType === "PROMOTED_HYPOTHESIS"
      ? `${position.signalType} / ${setupLabel(hypothesis)}`
      : position.signalType;
    const currentRowKey = relativeValueKey(position);
    const currentRow = currentRowKey ? relativeValueRows.get(currentRowKey) : undefined;
    const entryRow = nearestRelativeValueEntryRow(relativeValueHistoryRows, position, position.openedAt);
    const bidAsk = currentBidAsk(currentRow, position.instrumentType);
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
      args.allTradeStats.pnl.toFixed(6),
      positionUnrealizedPnl(position)?.toFixed(6) ?? "",
      position.entryPrice.toString(),
      position.currentPrice?.toString() ?? "",
      position.instrumentType ?? "",
      position.instrumentId ?? "",
      position.instrumentLabel ?? "",
      position.openedAt,
      fmtModelValue(entryOneTouchModel(entryRow)),
      fmtModelValue(safeNumber(currentRow?.options_touch_adjusted_prob)),
      fmtPriceValue(bidAsk.bid),
      fmtPriceValue(bidAsk.ask),
      extractStrikePrice(position),
      extractExpiryMonth(position),
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
  rawTradeStats: Stats;
  allShadowStats: Stats;
  duplicateTradeIds: Set<string>;
  operationallyTaintedTrades: ClosedTrade[];
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
  lines.push(`- Realized P&L, de-duped counted ledger: ${fmtUsd(args.allTradeStats.pnl)} (${args.allTradeStats.trades} counted trades, ${args.allTradeStats.wins}W/${args.allTradeStats.losses}L, ${winRate(args.allTradeStats)} win rate)`);
  lines.push(`- Portfolio audit/reference: ${fmtUsd(args.portfolio.totalRealizedPnl)} (${args.portfolio.totalTrades} total trades, ${args.portfolio.winCount}W/${args.portfolio.lossCount}L)`);
  lines.push(`- Raw detailed trade ledger audit: ${fmtUsd(args.rawTradeStats.pnl)} (${args.rawTradeStats.trades} closed trade rows, ${args.rawTradeStats.wins}W/${args.rawTradeStats.losses}L, ${winRate(args.rawTradeStats)} win rate)`);
  if (args.duplicateTradeIds.size > 0) {
    lines.push(`- Ledger note: ${args.duplicateTradeIds.size} duplicate trade IDs found in trades-detailed.csv; grouped tables below use the de-duped counted ledger.`);
  }
  if (args.operationallyTaintedTrades.length > 0) {
    lines.push(`- Operationally tainted trades labeled separately: ${args.operationallyTaintedTrades.map((trade) => `${trade.id} (${OPERATIONALLY_TAINTED_TRADES[trade.id]})`).join("; ")}`);
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
  };

  const report = format === "csv" ? buildCsvReport(reportArgs) : buildMarkdownReport(reportArgs);
  if (outPath) writeOutput(outPath, report);
  console.log(report);
}

main();
