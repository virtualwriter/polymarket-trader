/**
 * Paper Trading Engine with Adaptive Learning
 *
 * Runs after market-scanner.ts --snapshot. Evaluates signals, manages positions,
 * tracks P&L, and calls an LLM for hypothesis-driven pattern discovery.
 *
 * Usage:
 *   npx tsx scripts/trading-engine.ts              # full run (signals + LLM)
 *   npx tsx scripts/trading-engine.ts --no-llm     # signals only, skip LLM call
 *   npx tsx scripts/trading-engine.ts --dry-run    # show signals without trading
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

const DATA_DIR = join(import.meta.dirname ?? ".", "..", "data");
const RELATIVE_VALUE_CSV = join(import.meta.dirname ?? ".", "..", "relative-value", "cross_venue_relative_value.csv");
const INSTRUMENT_SNAPSHOTS_JSONL = "instrument-snapshots.jsonl";
const LEARNING_PARAMS_FILE = "learning-params.json";
const BLOCKED_SIGNALS_FILE = "blocked-signals.json";
const TRADE_SIZE = 1;
const MAX_BANKROLL = 100;
const MAX_OPEN_POSITIONS = 15;
const PROMOTE_THRESHOLD = 0.65;
const PROMOTE_MIN_TESTS = 5;
const DEMOTE_THRESHOLD = 0.45;
const KILL_THRESHOLD = 0.30;
const WEIGHT_DECAY = 0.85;
const LOOKBACK_HOURS = 24;
const NO_LLM = process.argv.includes("--no-llm");
const DRY_RUN = process.argv.includes("--dry-run");

const DEFAULT_SIGNAL_RISK: Record<string, SignalRiskParams> = {
  PM_IV_GT_OPT_IV: { targetPct: null, stopPct: 5 },
  OPT_IV_GT_PM_IV: { targetPct: 4, stopPct: 4 },
  FUNDING_EXTREME_LONG: { targetPct: 2.5, stopPct: 2.5 },
  FUNDING_EXTREME_SHORT: { targetPct: 2.5, stopPct: 2.5 },
  PM_EV_ABOVE_SPOT: { targetPct: 4, stopPct: 4 },
  PM_EV_BELOW_SPOT: { targetPct: 3, stopPct: 3.5 },
  PC_RATIO_EXTREME_HIGH: { targetPct: 2, stopPct: 2 },
  PC_RATIO_EXTREME_LOW: { targetPct: 2, stopPct: 2 },
  BASIS_PREMIUM: { targetPct: 1.5, stopPct: 1.5 },
  BASIS_DISCOUNT: { targetPct: 1.5, stopPct: 1.5 },
  MACRO_MOMENTUM_UP: { targetPct: 4, stopPct: 3 },
  MACRO_MOMENTUM_DOWN: { targetPct: 4, stopPct: 3 },
  LLM_HYPOTHESIS: { targetPct: 5, stopPct: 3.5 },
  MOMENTUM_LONG: { targetPct: 6, stopPct: 3.5 },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Position {
  id: string;
  openedAt: string;
  asset: string;
  venue: "polymarket" | "hyperliquid" | "spot";
  direction: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage?: number;
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  targetPct: number | null;
  stopPct: number;
  expiryDate: string;
  instrumentType?: "spot" | "hl_perp" | "pm_yes" | "pm_no" | "legacy_asset";
  instrumentId?: string;
  instrumentLabel?: string;
  entryUnderlyingPrice?: number;
  currentUnderlyingPrice?: number;
  fundingPnlAccrued?: number;
}

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
  leverage?: number;
  pnl: number;
  pnlPct: number;
  marketPnl?: number;
  fundingPnl?: number;
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  closeReason: "target" | "stop" | "expiry" | "llm_decision" | "signal_killed";
  instrumentType?: string;
  instrumentId?: string;
  instrumentLabel?: string;
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

interface PerAssetSignalStats {
  trades: number;
  wins: number;
  avgPnlPct: number;
  disabled?: boolean;
  disabledAt?: string;
  disabledReason?: string;
}

interface SignalWeight {
  type: string;
  weight: number;
  trades: number;
  wins: number;
  avgPnlPct: number;
  lastTriggered: string;
  enabled: boolean;
  perAsset: Record<string, PerAssetSignalStats>;
}

interface SignalRiskParams {
  targetPct: number | null;
  stopPct: number;
}

interface LearningParams {
  macroMomentum24hThresholdPts: number;
  contrarianTrendMarginPct: number;
  positiveMomentum24hPct: number;
  llmTradeExpiryDays: number;
  momentumLongExpiryDays: number;
  signalRisk: Record<string, SignalRiskParams>;
  updatedAt: string;
}

interface LlmTradeInstruction {
  action: "buy" | "sell" | "close";
  asset: string;
  venue: "polymarket" | "hyperliquid" | "spot";
  direction: "long" | "short" | "any";
  thesis: string;
}

interface HypothesisTest {
  date: string;
  triggered: boolean;
  outcome: "win" | "loss" | "pending";
  actualMove: string;
}

interface Hypothesis {
  id: string;
  created: string;
  description: string;
  conditions: Record<string, string>;
  prediction: string;
  timeframeDays: number;
  confidence: number;
  tests: HypothesisTest[];
  winRate: number;
  status: "active" | "promoted" | "archived" | "killed";
  promotedToSignal: boolean;
  postMortem: string | null;
  source: "llm" | "statistical";
}

interface Signal {
  type: string;
  asset: string;
  venue: "polymarket" | "hyperliquid" | "spot";
  direction: "long" | "short";
  strength: number; // 0-1, raw signal strength
  confidence: number; // strength * weight
  thesis: string;
  hypothesisId: string | null;
  entryPrice: number;
  targetPct: number | null;
  stopPct: number;
  expiryDays: number;
  leverage?: number;
  contractHint?: {
    preferredEventSlug?: string;
    preferredDirection?: "above" | "below";
    allowDirectionFallback?: boolean;
    forceInstrumentType?: "pm_yes" | "pm_no";
  };
}

interface BlockedSignalShadow {
  id: string;
  status: "open" | "resolved";
  blockedAt: string;
  resolvedAt?: string;
  blockedReason: "short_blocked_by_positive_trend" | "iv_downside_leg_untracked" | "manual_shadow_trade" | "polymarket_proxy_short" | "relative_value_heatmap";
  signalType: string;
  asset: string;
  venue: Signal["venue"];
  direction: Signal["direction"];
  confidence: number;
  thesis: string;
  sourcePositionId?: string;
  sourcePositionLabel?: string;
  trendMetrics?: {
    aboveTrendPct: number;
    momentumPct: number;
  };
  learningParamsSnapshot: Omit<LearningParams, "updatedAt">;
  position: Position;
  hypotheticalResult?: {
    closeReason: ClosedTrade["closeReason"];
    exitPrice: number;
    pnl: number;
    pnlPct: number;
    marketPnl: number;
    fundingPnl: number;
    outcome: "win" | "loss";
  };
  sourceComparison?: {
    sourceClosedAt: string;
    sourcePnl: number;
    sourcePnlPct: number;
    proxyOutperformed: boolean;
    correlation: "same_direction" | "opposite_direction" | "flat";
  };
}

interface BlockedSignalLearningSummary {
  openCount: number;
  resolvedCount: number;
  wouldHaveWon: number;
  wouldHaveLost: number;
  bySignal: Array<{
    signalType: string;
    blocked: number;
    resolved: number;
    wouldHaveWon: number;
    wouldHaveLost: number;
    avgPnlPct: number;
  }>;
  recentResolved: Array<{
    signalType: string;
    asset: string;
    venue: Signal["venue"];
    direction: Signal["direction"];
    blockedReason: BlockedSignalShadow["blockedReason"];
    outcome: "win" | "loss";
    closeReason: ClosedTrade["closeReason"];
    pnlPct: number;
    resolvedAt: string;
    trendMetrics?: BlockedSignalShadow["trendMetrics"];
    sourceComparison?: BlockedSignalShadow["sourceComparison"];
  }>;
}

interface SnapshotRow {
  date: string;
  [key: string]: string | number;
}

interface StatObservation {
  type: "correlation_flip" | "anomaly" | "lead_lag" | "divergence" | "regime_change";
  description: string;
  assets: string[];
  magnitude: number;
  data: Record<string, number>;
}

interface RelativeValueObservation {
  timestamp: string;
  asset: string;
  eventSlug: string;
  question: string;
  contractMonth: string;
  direction: "above" | "below";
  strike: number;
  expiry: string;
  pmYes: number | null;
  pmBid: number | null;
  pmAsk: number | null;
  modelProb: number | null;
  edgePts: number;
  bestExpression: string;
  optionIv: number | null;
  pmIv: number | null;
  liquidity: number | null;
  flags: string;
}

interface InstrumentSnapshotContract {
  marketId: string;
  question: string;
  strike: number;
  direction: "above" | "below";
  yesPrice: number;
  volume: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  liquidity?: number;
  active?: boolean;
  closed?: boolean;
  endDate?: string | null;
}

interface InstrumentSnapshotEvent {
  asset: string;
  slug: string;
  title: string;
  totalVolume: number;
  contracts: InstrumentSnapshotContract[];
}

interface InstrumentSnapshotOptionQuote {
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: string;
  type: "call" | "put";
}

interface InstrumentSnapshotOptions {
  symbol: string;
  underlyingPrice: number;
  source: string;
  chains: InstrumentSnapshotOptionQuote[];
}

interface InstrumentSnapshotFile {
  timestamp: string;
  spots: Record<string, number | null>;
  hyperliquid: Record<string, { markPx: number | null; fundingAnnualized: number | null; openInterestUsd: number | null }>;
  polymarket: InstrumentSnapshotEvent[];
  options?: Record<string, InstrumentSnapshotOptions>;
}

// ─── File I/O ────────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(filename: string, fallback: T): T {
  const p = join(DATA_DIR, filename);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return fallback; }
}

function writeJson(filename: string, data: unknown) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2) + "\n");
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

function readCsv(filename: string): SnapshotRow[] {
  const p = join(DATA_DIR, filename);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf-8").trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const row: SnapshotRow = { date: "" };
    headers.forEach((h, i) => {
      const v = vals[i] ?? "";
      row[h] = v !== "" && !isNaN(Number(v)) ? Number(v) : v;
    });
    return row;
  });
}

function readCsvFile(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];
  const lines = raw.split("\n");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ""]));
  });
}

function readRelativeValueObservations(limit = 30): RelativeValueObservation[] {
  return readCsvFile(RELATIVE_VALUE_CSV)
    .map((row): RelativeValueObservation | null => {
      const edgePts = num(row.edge_score);
      const strike = num(row.strike);
      const direction = row.direction === "above" || row.direction === "below" ? row.direction : null;
      if (edgePts === null || strike === null || !direction) return null;
      if (!row.option_symbol || !row.options_touch_adjusted_prob) return null;
      return {
        timestamp: row.timestamp ?? "",
        asset: row.asset ?? "",
        eventSlug: row.event_slug ?? "",
        question: row.contract_question ?? "",
        contractMonth: row.contract_month ?? "",
        direction,
        strike,
        expiry: row.expiry ?? "",
        pmYes: num(row.pm_yes_price),
        pmBid: num(row.pm_best_bid),
        pmAsk: num(row.pm_best_ask),
        modelProb: num(row.options_touch_adjusted_prob),
        edgePts,
        bestExpression: row.best_expression ?? "",
        optionIv: num(row.option_iv),
        pmIv: num(row.pm_iv),
        liquidity: num(row.liquidity),
        flags: row.flags ?? "",
      };
    })
    .filter((row): row is RelativeValueObservation => !!row)
    .filter((row) => row.bestExpression !== "no-options-model")
    .sort((a, b) => Math.abs(b.edgePts) - Math.abs(a.edgePts))
    .slice(0, limit);
}

function appendTradeCsv(trade: ClosedTrade) {
  const file = join(DATA_DIR, "trades-detailed.csv");
  const headers = [
    "id", "opened_at", "closed_at", "asset", "venue", "direction",
    "instrument_type", "instrument_id", "instrument_label",
    "entry_price", "exit_price", "size", "leverage",
    "pnl", "pnl_pct", "market_pnl", "funding_pnl",
    "signal_type", "hypothesis_id", "thesis", "close_reason",
  ];
  if (!existsSync(file)) writeFileSync(file, headers.join(",") + "\n");
  const vals = [
    trade.id, trade.openedAt, trade.closedAt, trade.asset, trade.venue,
    trade.direction, trade.instrumentType ?? "", trade.instrumentId ?? "",
    `"${(trade.instrumentLabel ?? "").replace(/"/g, '""')}"`,
    trade.entryPrice, trade.exitPrice, trade.size, trade.leverage ?? 1,
    trade.pnl.toFixed(4), trade.pnlPct.toFixed(2),
    (trade.marketPnl ?? trade.pnl).toFixed(4), (trade.fundingPnl ?? 0).toFixed(4),
    trade.signalType, trade.hypothesisId ?? "",
    `"${trade.thesis.replace(/"/g, '""')}"`, trade.closeReason,
  ];
  appendFileSync(file, vals.join(",") + "\n");
}

function readClosedTradeCsv(): ClosedTrade[] {
  const file = join(DATA_DIR, "trades-detailed.csv");
  if (!existsSync(file)) return [];

  const lines = readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "");
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
      leverage: Number(row.leverage),
      pnl: Number(row.pnl),
      pnlPct: Number(row.pnl_pct),
      marketPnl: Number(row.market_pnl),
      fundingPnl: Number(row.funding_pnl),
      signalType: row.signal_type,
      hypothesisId: row.hypothesis_id || null,
      thesis: row.thesis,
      closeReason: row.close_reason as ClosedTrade["closeReason"],
      instrumentType: row.instrument_type || undefined,
      instrumentId: row.instrument_id || undefined,
      instrumentLabel: row.instrument_label || undefined,
    };
  }).filter((trade) => !!trade.id && !!trade.closedAt);
}

function appendJournal(entry: string) {
  const file = join(DATA_DIR, "learning-journal.md");
  if (!existsSync(file)) writeFileSync(file, "# Trading Engine Learning Journal\n\n");
  appendFileSync(file, entry + "\n");
}

function readInstrumentSnapshots(): InstrumentSnapshotFile[] {
  const p = join(DATA_DIR, INSTRUMENT_SNAPSHOTS_JSONL);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as InstrumentSnapshotFile;
      } catch {
        return null;
      }
    })
    .filter((row): row is InstrumentSnapshotFile => row !== null);
}

function compactInstrumentSnapshotForLlm(snapshot: InstrumentSnapshotFile) {
  const optionSummaries = Object.fromEntries(
    Object.entries(snapshot.options ?? {}).map(([symbol, optionSnapshot]) => {
      const expirations = Array.from(
        new Set(optionSnapshot.chains.map((chain) => chain.expiration).filter(Boolean)),
      )
        .sort()
        .slice(0, 6);
      const callCount = optionSnapshot.chains.filter((chain) => chain.type === "call").length;
      const putCount = optionSnapshot.chains.length - callCount;
      const totalVolume = optionSnapshot.chains.reduce((sum, chain) => sum + (chain.volume ?? 0), 0);
      const totalOpenInterest = optionSnapshot.chains.reduce((sum, chain) => sum + (chain.openInterest ?? 0), 0);

      return [
        symbol,
        {
          underlyingPrice: optionSnapshot.underlyingPrice,
          source: optionSnapshot.source,
          chainCount: optionSnapshot.chains.length,
          callCount,
          putCount,
          expirations,
          totalVolume,
          totalOpenInterest,
        },
      ];
    }),
  );

  return {
    timestamp: snapshot.timestamp,
    spots: snapshot.spots,
    hyperliquid: snapshot.hyperliquid,
    polymarket: snapshot.polymarket,
    options: optionSummaries,
  };
}

function latestInstrumentSnapshot(snapshots: InstrumentSnapshotFile[]): InstrumentSnapshotFile | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

// ─── Portfolio Management ────────────────────────────────────────────────────

function loadPortfolio(): Portfolio {
  return readJson<Portfolio>("portfolio.json", {
    cash: MAX_BANKROLL,
    positions: [],
    totalRealizedPnl: 0,
    totalTrades: 0,
    winCount: 0,
    lossCount: 0,
    lastUpdated: new Date().toISOString(),
  });
}

function savePortfolio(p: Portfolio) {
  p.lastUpdated = new Date().toISOString();
  writeJson("portfolio.json", p);
}

function normalizeSignalWeight(weight: SignalWeight): SignalWeight {
  const perAsset = weight.perAsset ?? {};
  for (const [asset, stats] of Object.entries(perAsset)) {
    const accuracy = stats.trades > 0 ? stats.wins / stats.trades : 0.5;
    if (stats.trades >= 5 && accuracy < KILL_THRESHOLD && !stats.disabled) {
      stats.disabled = true;
      stats.disabledAt = weight.lastTriggered || new Date().toISOString();
      stats.disabledReason = `${weight.type} on ${asset} disabled after ${stats.wins}/${stats.trades} wins (${(accuracy * 100).toFixed(0)}% accuracy).`;
    }
  }
  return {
    ...weight,
    perAsset,
  };
}

function loadWeights(): SignalWeight[] {
  return readJson<SignalWeight[]>("signal-weights.json", defaultWeights()).map(normalizeSignalWeight);
}

function saveWeights(w: SignalWeight[]) {
  writeJson("signal-weights.json", w);
}

function defaultLearningParams(): LearningParams {
  return {
    macroMomentum24hThresholdPts: 4,
    contrarianTrendMarginPct: 0.5,
    positiveMomentum24hPct: 1.5,
    llmTradeExpiryDays: 14,
    momentumLongExpiryDays: 21,
    signalRisk: DEFAULT_SIGNAL_RISK,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSignalRisk(raw: Partial<LearningParams>["signalRisk"]): Record<string, SignalRiskParams> {
  const normalized: Record<string, SignalRiskParams> = {};
  for (const [signalType, defaults] of Object.entries(DEFAULT_SIGNAL_RISK)) {
    const candidate = raw?.[signalType];
    normalized[signalType] = {
      targetPct: candidate?.targetPct === null || typeof candidate?.targetPct === "number" ? candidate.targetPct : defaults.targetPct,
      stopPct: typeof candidate?.stopPct === "number" ? candidate.stopPct : defaults.stopPct,
    };
  }
  return normalized;
}

function loadLearningParams(): LearningParams {
  const defaults = defaultLearningParams();
  const raw = readJson<Partial<LearningParams>>(LEARNING_PARAMS_FILE, defaults);
  return {
    macroMomentum24hThresholdPts: typeof raw.macroMomentum24hThresholdPts === "number" ? raw.macroMomentum24hThresholdPts : defaults.macroMomentum24hThresholdPts,
    contrarianTrendMarginPct: typeof raw.contrarianTrendMarginPct === "number" ? raw.contrarianTrendMarginPct : defaults.contrarianTrendMarginPct,
    positiveMomentum24hPct: typeof raw.positiveMomentum24hPct === "number" ? raw.positiveMomentum24hPct : defaults.positiveMomentum24hPct,
    llmTradeExpiryDays: typeof raw.llmTradeExpiryDays === "number" ? raw.llmTradeExpiryDays : defaults.llmTradeExpiryDays,
    momentumLongExpiryDays: typeof raw.momentumLongExpiryDays === "number" ? raw.momentumLongExpiryDays : defaults.momentumLongExpiryDays,
    signalRisk: normalizeSignalRisk(raw.signalRisk),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : defaults.updatedAt,
  };
}

function saveLearningParams(params: LearningParams) {
  writeJson(LEARNING_PARAMS_FILE, params);
}

function loadBlockedSignals(): BlockedSignalShadow[] {
  return readJson<BlockedSignalShadow[]>(BLOCKED_SIGNALS_FILE, []);
}

function saveBlockedSignals(blockedSignals: BlockedSignalShadow[]) {
  writeJson(BLOCKED_SIGNALS_FILE, blockedSignals);
}

function loadHypotheses(): Hypothesis[] {
  return readJson<Hypothesis[]>("hypotheses.json", []);
}

function saveHypotheses(h: Hypothesis[]) {
  writeJson("hypotheses.json", h);
}

// ─── Default Signal Weights ──────────────────────────────────────────────────

function defaultWeights(): SignalWeight[] {
  const types = [
    "PM_IV_GT_OPT_IV",
    "OPT_IV_GT_PM_IV",
    "FUNDING_EXTREME_LONG",
    "FUNDING_EXTREME_SHORT",
    "PM_EV_ABOVE_SPOT",
    "PM_EV_BELOW_SPOT",
    "MACRO_MOMENTUM_UP",
    "MACRO_MOMENTUM_DOWN",
    "BASIS_PREMIUM",
    "BASIS_DISCOUNT",
    "PC_RATIO_EXTREME_HIGH",
    "PC_RATIO_EXTREME_LOW",
    "LLM_HYPOTHESIS",
  ];
  return types.map((t) => ({
    type: t,
    weight: 0.5,
    trades: 0,
    wins: 0,
    avgPnlPct: 0,
    lastTriggered: "",
    enabled: true,
    perAsset: {},
  }));
}

// ─── Signal Generation ───────────────────────────────────────────────────────

function weightForSignalAsset(
  weightMap: Map<string, SignalWeight>,
  signalType: string,
  asset: string,
): SignalWeight | null {
  const weight = weightMap.get(signalType);
  if (!weight || !weight.enabled) return null;
  if (weight.perAsset?.[asset]?.disabled) return null;
  return weight;
}

function riskForSignal(learningParams: LearningParams, signalType: string): SignalRiskParams {
  return learningParams.signalRisk[signalType] ?? DEFAULT_SIGNAL_RISK[signalType] ?? { targetPct: 3, stopPct: 3 };
}

function formatTargetPct(targetPct: number | null): string {
  return targetPct === null ? "uncapped" : `+${targetPct}`;
}

function getAssetPrice(row: SnapshotRow, asset: string): number | null {
  const map: Record<string, string> = {
    BTC: "btc_spot", HYPE: "hype_spot", GOLD: "gold_gc_spot",
    AMZN: "amzn_stock", OIL: "oil_wti_spot",
  };
  const v = row[map[asset] ?? ""];
  return typeof v === "number" && v > 0 ? v : null;
}

function getHyperliquidPerpPrice(row: SnapshotRow, asset: string): number | null {
  const map: Record<string, string> = {
    BTC: "btc_spot",
    HYPE: "hype_spot",
    GOLD: "gold_gc_spot",
    AMZN: "amzn_hl_perp",
    OIL: "oil_wti_spot",
  };
  const v = row[map[asset] ?? ""];
  return typeof v === "number" && v > 0 ? v : null;
}

function getHyperliquidFundingAnnualized(row: SnapshotRow, asset: string): number | null {
  const map: Record<string, string> = {
    BTC: "btc_hl_funding_ann",
    HYPE: "hype_hl_funding_ann",
    GOLD: "gold_hl_funding_ann",
    AMZN: "amzn_hl_funding_ann",
    OIL: "oil_hl_funding_ann",
  };
  const v = row[map[asset] ?? ""];
  return typeof v === "number" ? v / 100 : null;
}

function preferredPolymarketEventSlugs(asset: string): string[] {
  switch (asset) {
    case "BTC":
      return ["what-price-will-bitcoin-hit-before-2027"];
    case "HYPE":
      return ["what-price-will-hyperliquid-hit-before-2027"];
    case "GOLD":
      return ["gc-over-under-jun-2026", "gc-hit-jun-2026", "what-will-gold-gc-hit-by-end-of-december"];
    case "OIL":
      return ["cl-over-under-jun-2026", "cl-hit-jun-2026"];
    default:
      return [];
  }
}

function inferPolymarketPreferredDirection(
  direction: "long" | "short",
  signalType?: string,
  thesis?: string,
): "above" | "below" {
  if (signalType === "PM_IV_GT_OPT_IV" || signalType === "OPT_IV_GT_PM_IV" || signalType === "PM_EV_ABOVE_SPOT") {
    return "above";
  }
  if (signalType === "PM_EV_BELOW_SPOT") {
    return "below";
  }

  const text = (thesis ?? "").toLowerCase();
  if (
    text.includes("below")
    || text.includes("downside")
    || text.includes("decline")
    || text.includes("drop")
    || text.includes("bearish")
    || text.includes("selloff")
    || text.includes("fade")
  ) {
    return "below";
  }
  if (
    text.includes("above")
    || text.includes("upside")
    || text.includes("breakout")
    || text.includes("rally")
    || text.includes("bullish")
    || text.includes("target")
  ) {
    return "above";
  }

  return direction === "long" ? "above" : "below";
}

function instrumentTypeForPolymarketExposure(
  positionDirection: "long" | "short",
  contractDirection: "above" | "below",
): "pm_yes" | "pm_no" {
  if (positionDirection === "long") {
    return contractDirection === "above" ? "pm_yes" : "pm_no";
  }
  return contractDirection === "above" ? "pm_no" : "pm_yes";
}

function selectPolymarketContract(
  snapshot: InstrumentSnapshotFile,
  asset: string,
  underlyingSpot: number,
  direction: "long" | "short",
  hint?: Signal["contractHint"],
): { event: InstrumentSnapshotEvent; contract: InstrumentSnapshotContract; instrumentType: "pm_yes" | "pm_no"; entryPrice: number } | null {
  const preferredSlugs = hint?.preferredEventSlug ? [hint.preferredEventSlug, ...preferredPolymarketEventSlugs(asset)] : preferredPolymarketEventSlugs(asset);
  const events = snapshot.polymarket.filter((event) => event.asset === asset);
  const rankedEvents = preferredSlugs
    .map((slug) => events.find((event) => event.slug === slug))
    .filter((event): event is InstrumentSnapshotEvent => !!event);
  const extraEvents = events
    .filter((event) => !rankedEvents.some((ranked) => ranked.slug === event.slug))
    .sort((a, b) => b.totalVolume - a.totalVolume);
  const eventOrder = [...rankedEvents, ...extraEvents];

  const preferredDirection = hint?.preferredDirection ?? inferPolymarketPreferredDirection(direction);
  const directionOrder: Array<"above" | "below"> = hint?.allowDirectionFallback === false
    ? [preferredDirection]
    : preferredDirection === "above" ? ["above", "below"] : ["below", "above"];

  for (const event of eventOrder) {
    const live = event.contracts.filter((c) => c.yesPrice > 0 && c.yesPrice < 1);
    for (const contractDirection of directionOrder) {
      const directional = live.filter((c) => c.direction === contractDirection);
      const preferredSide = directional
        .filter((c) => contractDirection === "above" ? c.strike >= underlyingSpot : c.strike <= underlyingSpot)
        .sort((a, b) => Math.abs(a.strike - underlyingSpot) - Math.abs(b.strike - underlyingSpot) || b.volume - a.volume);
      const fallback = directional
        .sort((a, b) => Math.abs(a.strike - underlyingSpot) - Math.abs(b.strike - underlyingSpot) || b.volume - a.volume);
      const contract = preferredSide[0] ?? fallback[0];
      if (!contract) continue;

      const instrumentType = hint?.forceInstrumentType ?? instrumentTypeForPolymarketExposure(direction, contractDirection);
      const entryPrice = instrumentType === "pm_yes" ? contract.yesPrice : 1 - contract.yesPrice;
      if (entryPrice <= 0 || entryPrice >= 1) continue;

      return { event, contract, instrumentType, entryPrice };
    }
  }

  return null;
}

function findPolymarketContractMark(
  snapshot: InstrumentSnapshotFile,
  position: Position,
): { price: number; underlyingPrice: number | null } | null {
  const event = snapshot.polymarket.find((candidate) =>
    candidate.slug === position.instrumentId?.split("::")[0] && candidate.contracts.some((c) => c.marketId === position.instrumentId?.split("::")[1]),
  );
  if (!event) return null;
  const marketId = position.instrumentId?.split("::")[1];
  const contract = event.contracts.find((c) => c.marketId === marketId);
  if (!contract) return null;
  const price = position.instrumentType === "pm_no" ? 1 - contract.yesPrice : contract.yesPrice;
  return { price, underlyingPrice: snapshot.spots[position.asset] ?? null };
}

function estimateFundingPnlSinceOpen(position: Position, snapshots: InstrumentSnapshotFile[]): number {
  if (position.venue !== "hyperliquid" || position.instrumentType !== "hl_perp") return 0;
  const openedAt = new Date(position.openedAt).getTime();
  const relevant = snapshots.filter((s) => snapshotTimeMs(s.timestamp) >= openedAt);
  if (relevant.length < 2) return position.fundingPnlAccrued ?? 0;

  let fundingPnl = 0;
  for (let i = 0; i < relevant.length - 1; i++) {
    const current = relevant[i];
    const next = relevant[i + 1];
    const fundingAnnualized = current.hyperliquid[position.asset]?.fundingAnnualized ?? 0;
    const dtHours = (snapshotTimeMs(next.timestamp) - snapshotTimeMs(current.timestamp)) / (1000 * 60 * 60);
    if (dtHours <= 0) continue;
    const intervalFunding = position.size * (position.leverage ?? 1) * fundingAnnualized * (dtHours / (365 * 24));
    fundingPnl += position.direction === "long" ? -intervalFunding : intervalFunding;
  }
  return fundingPnl;
}

function nearestInstrumentSnapshot(
  snapshots: InstrumentSnapshotFile[],
  openedAtIso: string,
): InstrumentSnapshotFile | null {
  if (snapshots.length === 0) return null;
  const openedAtMs = new Date(openedAtIso).getTime();
  let best: InstrumentSnapshotFile | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const snapshot of snapshots) {
    const distance = Math.abs(snapshotTimeMs(snapshot.timestamp) - openedAtMs);
    if (distance < bestDistance) {
      best = snapshot;
      bestDistance = distance;
    }
  }

  return best;
}

function migrateLegacyPolymarketPositions(
  portfolio: Portfolio,
  snapshots: InstrumentSnapshotFile[],
): string[] {
  const notes: string[] = [];
  if (snapshots.length === 0) return notes;

  for (const position of portfolio.positions) {
    if (position.venue !== "polymarket") continue;
    if (position.instrumentType === "pm_yes" || position.instrumentType === "pm_no") continue;

    const openedSnapshot = nearestInstrumentSnapshot(snapshots, position.openedAt) ?? latestInstrumentSnapshot(snapshots);
    if (!openedSnapshot) continue;
    const underlyingAtOpen = openedSnapshot.spots[position.asset];
    if (underlyingAtOpen == null) continue;

    const preferredDirection = inferPolymarketPreferredDirection(position.direction, position.signalType, position.thesis);
    const selected = selectPolymarketContract(
      openedSnapshot,
      position.asset,
      underlyingAtOpen,
      position.direction,
      { preferredDirection },
    );
    if (!selected) continue;

    position.instrumentType = selected.instrumentType;
    position.instrumentId = `${selected.event.slug}::${selected.contract.marketId}`;
    position.instrumentLabel = `${selected.event.slug} — ${selected.instrumentType === "pm_yes" ? "YES" : "NO"} — ${selected.contract.question}`;
    position.entryUnderlyingPrice = underlyingAtOpen;
    position.currentUnderlyingPrice = latestInstrumentSnapshot(snapshots)?.spots[position.asset] ?? underlyingAtOpen;
    position.entryPrice = selected.entryPrice;
    position.currentPrice = selected.entryPrice;
    position.fundingPnlAccrued = 0;

    notes.push(`Migrated legacy Polymarket ${position.asset} ${position.direction} to ${position.instrumentLabel} @ ${selected.entryPrice.toFixed(3)}.`);
  }

  return notes;
}

function markPosition(
  position: Position,
  latestRow: SnapshotRow,
  snapshots: InstrumentSnapshotFile[],
): {
  currentPrice: number;
  underlyingPrice: number | null;
  marketPnl: number;
  fundingPnl: number;
  pnl: number;
  pnlPct: number;
} | null {
  const latestSnapshot = latestInstrumentSnapshot(snapshots);
  let currentPrice: number | null = null;
  let underlyingPrice: number | null = getAssetPrice(latestRow, position.asset);
  let marketPnl = 0;
  let fundingPnl = 0;

  if (position.instrumentType === "pm_yes" || position.instrumentType === "pm_no") {
    if (!latestSnapshot) return null;
    const pmMark = findPolymarketContractMark(latestSnapshot, position);
    if (!pmMark) return null;
    currentPrice = pmMark.price;
    underlyingPrice = pmMark.underlyingPrice;
    const shares = position.size / position.entryPrice;
    marketPnl = shares * (currentPrice - position.entryPrice);
  } else if (position.instrumentType === "hl_perp") {
    currentPrice = getHyperliquidPerpPrice(latestRow, position.asset);
    if (!currentPrice) return null;
    const rawReturn = position.direction === "long"
      ? (currentPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - currentPrice) / position.entryPrice;
    marketPnl = position.size * (position.leverage ?? 1) * rawReturn;
    fundingPnl = estimateFundingPnlSinceOpen(position, snapshots);
  } else {
    currentPrice = getAssetPrice(latestRow, position.asset);
    if (!currentPrice) return null;
    const rawReturn = position.direction === "long"
      ? (currentPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - currentPrice) / position.entryPrice;
    marketPnl = position.size * rawReturn;
  }

  const pnl = marketPnl + fundingPnl;
  const pnlPct = (pnl / position.size) * 100;
  return { currentPrice, underlyingPrice, marketPnl, fundingPnl, pnl, pnlPct };
}

function realizeClosedPosition(
  portfolio: Portfolio,
  position: Position,
  mark: {
    currentPrice: number;
    underlyingPrice: number | null;
    marketPnl: number;
    fundingPnl: number;
    pnl: number;
    pnlPct: number;
  },
  closeReason: ClosedTrade["closeReason"],
  closedAt: string,
  thesisOverride?: string,
): ClosedTrade {
  position.currentPrice = mark.currentPrice;
  position.currentUnderlyingPrice = mark.underlyingPrice ?? undefined;
  position.fundingPnlAccrued = mark.fundingPnl;

  const trade: ClosedTrade = {
    id: position.id,
    openedAt: position.openedAt,
    closedAt,
    asset: position.asset,
    venue: position.venue,
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice: mark.currentPrice,
    size: position.size,
    leverage: position.leverage ?? 1,
    pnl: mark.pnl,
    pnlPct: mark.pnlPct,
    marketPnl: mark.marketPnl,
    fundingPnl: mark.fundingPnl,
    signalType: position.signalType,
    hypothesisId: position.hypothesisId,
    thesis: thesisOverride ?? position.thesis,
    closeReason,
    instrumentType: position.instrumentType,
    instrumentId: position.instrumentId,
    instrumentLabel: position.instrumentLabel,
  };

  portfolio.cash += position.size + mark.pnl;
  portfolio.totalRealizedPnl += mark.pnl;
  portfolio.totalTrades++;
  if (mark.pnl >= 0) portfolio.winCount++; else portfolio.lossCount++;
  return trade;
}

function isValidVenue(value: string): value is Signal["venue"] {
  return value === "polymarket" || value === "hyperliquid" || value === "spot";
}

function closePositionsFromLlm(
  portfolio: Portfolio,
  instructions: LlmTradeInstruction[],
  latestRow: SnapshotRow,
  snapshots: InstrumentSnapshotFile[],
): ClosedTrade[] {
  if (instructions.length === 0) return [];
  const closed: ClosedTrade[] = [];
  const remaining: Position[] = [];
  const now = new Date().toISOString();

  for (const position of portfolio.positions) {
    const instruction = instructions.find((candidate) =>
      candidate.asset === position.asset
      && candidate.venue === position.venue
      && (candidate.direction === "any" || candidate.direction === position.direction),
    );
    if (!instruction) {
      remaining.push(position);
      continue;
    }

    const mark = markPosition(position, latestRow, snapshots);
    if (!mark) {
      remaining.push(position);
      continue;
    }

    closed.push(realizeClosedPosition(
      portfolio,
      position,
      mark,
      "llm_decision",
      now,
      `${position.thesis} | [LLM close] ${instruction.thesis}`,
    ));
  }

  portfolio.positions = remaining;
  return closed;
}

function getRowTimeMs(row: SnapshotRow): number | null {
  return typeof row.date === "string" && row.date ? snapshotTimeMs(row.date) : null;
}

function findRowAtOrBefore(rows: SnapshotRow[], targetMs: number): SnapshotRow | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const ts = getRowTimeMs(rows[i]);
    if (ts !== null && ts <= targetMs) return rows[i];
  }
  return null;
}

function average(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
}

function assetTrendMetrics(
  rows: SnapshotRow[],
  asset: string,
  lookbackHours: number,
): { current: number; lookback: number; sma: number; momentumPct: number; aboveTrendPct: number } | null {
  if (rows.length < 2) return null;
  const latest = rows[rows.length - 1];
  const latestTs = getRowTimeMs(latest);
  const current = getAssetPrice(latest, asset);
  if (latestTs === null || current === null) return null;

  const lookbackRow = findRowAtOrBefore(rows, latestTs - lookbackHours * 60 * 60 * 1000);
  const lookback = lookbackRow ? getAssetPrice(lookbackRow, asset) : null;
  if (lookback === null || lookback <= 0) return null;

  const windowPrices = rows
    .filter((row) => {
      const ts = getRowTimeMs(row);
      return ts !== null && ts >= latestTs - lookbackHours * 60 * 60 * 1000;
    })
    .map((row) => getAssetPrice(row, asset))
    .filter((value): value is number => value !== null && value > 0);
  const sma = average(windowPrices);
  if (sma === null || sma <= 0) return null;

  return {
    current,
    lookback,
    sma,
    momentumPct: ((current - lookback) / lookback) * 100,
    aboveTrendPct: ((current - sma) / sma) * 100,
  };
}

function macroCompositeShiftPts(rows: SnapshotRow[], lookbackHours: number): { shift: number; previous: number; current: number } | null {
  if (rows.length < 2) return null;
  const latest = rows[rows.length - 1];
  const latestTs = getRowTimeMs(latest);
  const latestComposite = num(latest.macro_composite);
  if (latestTs === null || latestComposite === null) return null;

  const lookbackRow = findRowAtOrBefore(rows, latestTs - lookbackHours * 60 * 60 * 1000);
  const previousComposite = lookbackRow ? num(lookbackRow.macro_composite) : null;
  if (previousComposite === null) return null;

  return {
    shift: latestComposite - previousComposite,
    previous: previousComposite,
    current: latestComposite,
  };
}

function isAssetTrendAndMomentumPositive(rows: SnapshotRow[], asset: string, learningParams: LearningParams): boolean {
  const metrics = assetTrendMetrics(rows, asset, LOOKBACK_HOURS);
  if (!metrics) return false;
  return metrics.aboveTrendPct >= learningParams.contrarianTrendMarginPct
    && metrics.momentumPct >= learningParams.positiveMomentum24hPct;
}

function isShortSignalBlockedByTrend(signal: Signal, rows: SnapshotRow[], learningParams: LearningParams): boolean {
  if (signal.direction !== "short") return false;
  if (signal.type === "MACRO_MOMENTUM_DOWN") return false;
  return isAssetTrendAndMomentumPositive(rows, signal.asset, learningParams);
}

function isMomentumLongSignal(signal: Signal, rows: SnapshotRow[], learningParams: LearningParams): boolean {
  if (signal.direction !== "long") return false;
  if (signal.type === "MACRO_MOMENTUM_UP") return true;
  return isAssetTrendAndMomentumPositive(rows, signal.asset, learningParams);
}

function blockedSignalKey(signal: Pick<Signal, "type" | "asset" | "venue" | "direction">): string {
  return [signal.type, signal.asset, signal.venue, signal.direction].join("|");
}

function recordBlockedSignalShadow(
  signal: Signal,
  rows: SnapshotRow[],
  learningParams: LearningParams,
  latestRow: SnapshotRow,
  latestSnapshot: InstrumentSnapshotFile | null,
  blockedSignals: BlockedSignalShadow[],
) {
  const key = blockedSignalKey(signal);
  if (blockedSignals.some((shadow) =>
    shadow.status === "open"
    && blockedSignalKey({
      type: shadow.signalType,
      asset: shadow.asset,
      venue: shadow.venue,
      direction: shadow.direction,
    }) === key
  )) {
    return;
  }

  const position = buildPositionFromSignal(signal, latestRow, latestSnapshot);
  if (!position) return;

  const blockedAt = new Date().toISOString();
  position.id = `B-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  position.openedAt = blockedAt;

  const metrics = assetTrendMetrics(rows, signal.asset, LOOKBACK_HOURS);
  blockedSignals.push({
    id: position.id,
    status: "open",
    blockedAt,
    blockedReason: "short_blocked_by_positive_trend",
    signalType: signal.type,
    asset: signal.asset,
    venue: signal.venue,
    direction: signal.direction,
    confidence: Number(signal.confidence.toFixed(4)),
    thesis: signal.thesis,
    trendMetrics: metrics ? {
      aboveTrendPct: Number(metrics.aboveTrendPct.toFixed(2)),
      momentumPct: Number(metrics.momentumPct.toFixed(2)),
    } : undefined,
    learningParamsSnapshot: {
      macroMomentum24hThresholdPts: learningParams.macroMomentum24hThresholdPts,
      contrarianTrendMarginPct: learningParams.contrarianTrendMarginPct,
      positiveMomentum24hPct: learningParams.positiveMomentum24hPct,
      llmTradeExpiryDays: learningParams.llmTradeExpiryDays,
      momentumLongExpiryDays: learningParams.momentumLongExpiryDays,
      signalRisk: learningParams.signalRisk,
    },
    position,
  });
}

/**
 * When an IV-divergence signal fires, the engine always expresses the trade through
 * the upside ("above") Polymarket contract. This function records a shadow position
 * for the *missing downside leg* — what would have happened if the same vol signal
 * had instead been expressed through the nearest "below" contract. The shadow is
 * tracked through normal resolution so the learning system can detect whether the
 * missing leg is consistently profitable and surface that to the LLM.
 */
function recordIVDownsideLegShadow(
  signal: Signal,
  latestRow: SnapshotRow,
  latestSnapshot: InstrumentSnapshotFile | null,
  learningParams: LearningParams,
  blockedSignals: BlockedSignalShadow[],
) {
  const shadowSignalType = `${signal.type}_DOWNSIDE`;
  // One open shadow per asset/direction at a time.
  if (blockedSignals.some((s) =>
    s.status === "open" &&
    s.signalType === shadowSignalType &&
    s.asset === signal.asset &&
    s.venue === signal.venue &&
    s.direction === signal.direction,
  )) return;

  // Build a mirror signal pointing at the below contract while preserving
  // the token side of the real above-contract trade: YES-above -> YES-below,
  // NO-above -> NO-below.
  const forcedInstrumentType = instrumentTypeForPolymarketExposure(signal.direction, "above");
  const mirrorSignal: Signal = {
    ...signal,
    type: shadowSignalType,
    contractHint: { preferredDirection: "below", allowDirectionFallback: false, forceInstrumentType: forcedInstrumentType },
  };
  const position = buildPositionFromSignal(mirrorSignal, latestRow, latestSnapshot);
  if (!position) return;

  const now = new Date().toISOString();
  position.id = `DL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  position.openedAt = now;

  blockedSignals.push({
    id: position.id,
    status: "open",
    blockedAt: now,
    blockedReason: "iv_downside_leg_untracked",
    signalType: shadowSignalType,
    asset: signal.asset,
    venue: signal.venue,
    direction: signal.direction,
    confidence: signal.confidence,
    thesis: `[DOWNSIDE LEG SHADOW] ${signal.thesis}`,
    learningParamsSnapshot: {
      macroMomentum24hThresholdPts: learningParams.macroMomentum24hThresholdPts,
      contrarianTrendMarginPct: learningParams.contrarianTrendMarginPct,
      positiveMomentum24hPct: learningParams.positiveMomentum24hPct,
      llmTradeExpiryDays: learningParams.llmTradeExpiryDays,
      momentumLongExpiryDays: learningParams.momentumLongExpiryDays,
      signalRisk: learningParams.signalRisk,
    },
    position,
  });
}

function recordPolymarketProxyShortShadow(
  sourcePosition: Position,
  latestRow: SnapshotRow,
  latestSnapshot: InstrumentSnapshotFile | null,
  learningParams: LearningParams,
  blockedSignals: BlockedSignalShadow[],
) {
  if (!["BTC", "GOLD", "HYPE"].includes(sourcePosition.asset)) return;
  if (sourcePosition.direction !== "short") return;
  if (sourcePosition.venue === "polymarket") return;
  if (!latestSnapshot) return;

  const shadowSignalType = `${sourcePosition.signalType}_PM_PROXY_SHORT`;
  const proxySignal: Signal = {
    type: shadowSignalType,
    asset: sourcePosition.asset,
    venue: "polymarket",
    direction: "short",
    strength: 0.5,
    confidence: 0.25,
    thesis: `[PM PROXY SHORT SHADOW] Real ${sourcePosition.asset} short via ${sourcePosition.venue}/${sourcePosition.instrumentType ?? "legacy"} (${sourcePosition.signalType}). Track buying NO on the comparable Polymarket upside contract.`,
    hypothesisId: sourcePosition.hypothesisId,
    entryPrice: getAssetPrice(latestRow, sourcePosition.asset) ?? sourcePosition.entryUnderlyingPrice ?? sourcePosition.entryPrice,
    targetPct: sourcePosition.targetPct,
    stopPct: sourcePosition.stopPct,
    expiryDays: Math.max(1, Math.ceil((new Date(sourcePosition.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
    contractHint: { preferredDirection: "above", allowDirectionFallback: false, forceInstrumentType: "pm_no" },
  };

  const position = buildPositionFromSignal(proxySignal, latestRow, latestSnapshot);
  if (!position) return;

  if (blockedSignals.some((shadow) =>
    shadow.status === "open" &&
    shadow.signalType === shadowSignalType &&
    shadow.asset === position.asset &&
    shadow.venue === position.venue &&
    shadow.direction === position.direction &&
    shadow.position.instrumentId === position.instrumentId,
  )) return;

  const now = new Date().toISOString();
  position.id = `PS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  position.openedAt = now;

  blockedSignals.push({
    id: position.id,
    status: "open",
    blockedAt: now,
    blockedReason: "polymarket_proxy_short",
    signalType: shadowSignalType,
    asset: sourcePosition.asset,
    venue: "polymarket",
    direction: "short",
    confidence: proxySignal.confidence,
    thesis: proxySignal.thesis,
    sourcePositionId: sourcePosition.id,
    sourcePositionLabel: `${sourcePosition.asset} ${sourcePosition.direction} via ${sourcePosition.venue}/${sourcePosition.instrumentType ?? "legacy"} (${sourcePosition.signalType})`,
    learningParamsSnapshot: {
      macroMomentum24hThresholdPts: learningParams.macroMomentum24hThresholdPts,
      contrarianTrendMarginPct: learningParams.contrarianTrendMarginPct,
      positiveMomentum24hPct: learningParams.positiveMomentum24hPct,
      llmTradeExpiryDays: learningParams.llmTradeExpiryDays,
      momentumLongExpiryDays: learningParams.momentumLongExpiryDays,
      signalRisk: learningParams.signalRisk,
    },
    position,
  });
}

function recordRelativeValueHeatmapShadows(
  observations: RelativeValueObservation[],
  latestRow: SnapshotRow,
  latestSnapshot: InstrumentSnapshotFile | null,
  learningParams: LearningParams,
  blockedSignals: BlockedSignalShadow[],
): number {
  if (!latestSnapshot) return 0;
  let recorded = 0;

  for (const obs of observations.slice(0, 10)) {
    if (!["buy_yes", "sell_yes_or_buy_no", "avoid_buy_yes"].includes(obs.bestExpression)) continue;
    const event = latestSnapshot.polymarket.find((candidate) => candidate.slug === obs.eventSlug && candidate.asset === obs.asset);
    if (!event) continue;
    const contract = event.contracts.find((candidate) =>
      candidate.question === obs.question || (candidate.strike === obs.strike && candidate.direction === obs.direction)
    );
    if (!contract || !contract.marketId || contract.closed || contract.active === false) continue;

    const instrumentType: "pm_yes" | "pm_no" = obs.bestExpression === "buy_yes" ? "pm_yes" : "pm_no";
    const entryPrice = instrumentType === "pm_yes"
      ? (obs.pmAsk && obs.pmAsk > 0 ? obs.pmAsk : contract.yesPrice)
      : (obs.pmBid && obs.pmBid > 0 ? 1 - obs.pmBid : 1 - contract.yesPrice);
    if (entryPrice <= 0 || entryPrice >= 1) continue;

    const instrumentId = `${event.slug}::${contract.marketId}`;
    if (blockedSignals.some((shadow) =>
      shadow.status === "open" &&
      shadow.signalType === "RELATIVE_VALUE_HEATMAP" &&
      shadow.position.instrumentId === instrumentId &&
      shadow.position.instrumentType === instrumentType
    )) continue;

    const now = new Date().toISOString();
    const expiryDate = obs.expiry || contract.endDate || new Date(Date.now() + 14 * 86400000).toISOString();
    const position: Position = {
      id: `RV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openedAt: now,
      asset: obs.asset,
      venue: "polymarket",
      direction: instrumentType === "pm_yes" ? "long" : "short",
      entryPrice,
      currentPrice: entryPrice,
      size: TRADE_SIZE,
      leverage: 1,
      signalType: "RELATIVE_VALUE_HEATMAP",
      hypothesisId: null,
      thesis: `[RELATIVE VALUE SHADOW] ${obs.bestExpression} edge=${obs.edgePts.toFixed(1)}pts, PM=${formatPct(obs.pmYes)}, model=${formatPct(obs.modelProb)}, optIV=${formatPct(obs.optionIv)}, pmIV=${formatPct(obs.pmIv)} — ${obs.question}`,
      targetPct: 20,
      stopPct: 12,
      expiryDate,
      instrumentType,
      instrumentId,
      instrumentLabel: `${event.slug} — ${instrumentType === "pm_yes" ? "YES" : "NO"} — ${contract.question}`,
      entryUnderlyingPrice: getAssetPrice(latestRow, obs.asset) ?? undefined,
      currentUnderlyingPrice: getAssetPrice(latestRow, obs.asset) ?? undefined,
    };

    blockedSignals.push({
      id: position.id,
      status: "open",
      blockedAt: now,
      blockedReason: "relative_value_heatmap",
      signalType: "RELATIVE_VALUE_HEATMAP",
      asset: obs.asset,
      venue: "polymarket",
      direction: position.direction,
      confidence: Number(Math.min(1, Math.abs(obs.edgePts) / 20).toFixed(4)),
      thesis: position.thesis,
      learningParamsSnapshot: {
        macroMomentum24hThresholdPts: learningParams.macroMomentum24hThresholdPts,
        contrarianTrendMarginPct: learningParams.contrarianTrendMarginPct,
        positiveMomentum24hPct: learningParams.positiveMomentum24hPct,
        llmTradeExpiryDays: learningParams.llmTradeExpiryDays,
        momentumLongExpiryDays: learningParams.momentumLongExpiryDays,
        signalRisk: learningParams.signalRisk,
      },
      position,
    });
    recorded++;
  }

  return recorded;
}

function resolveBlockedSignalShadows(
  blockedSignals: BlockedSignalShadow[],
  latestRow: SnapshotRow,
  snapshots: InstrumentSnapshotFile[],
): BlockedSignalShadow[] {
  const resolved: BlockedSignalShadow[] = [];
  const now = new Date().toISOString();

  for (const shadow of blockedSignals) {
    if (shadow.status === "resolved") continue;
    const mark = markPosition(shadow.position, latestRow, snapshots);
    if (!mark) continue;

    let closeReason: ClosedTrade["closeReason"] | null = null;
    if (shadow.position.targetPct !== null && mark.pnlPct >= shadow.position.targetPct) closeReason = "target";
    else if (mark.pnlPct <= -shadow.position.stopPct) closeReason = "stop";
    else if (new Date(shadow.position.expiryDate) <= new Date()) closeReason = "expiry";

    shadow.position.currentPrice = mark.currentPrice;
    shadow.position.currentUnderlyingPrice = mark.underlyingPrice ?? undefined;
    shadow.position.fundingPnlAccrued = mark.fundingPnl;

    if (!closeReason) continue;

    shadow.status = "resolved";
    shadow.resolvedAt = now;
    shadow.hypotheticalResult = {
      closeReason,
      exitPrice: mark.currentPrice,
      pnl: Number(mark.pnl.toFixed(4)),
      pnlPct: Number(mark.pnlPct.toFixed(2)),
      marketPnl: Number(mark.marketPnl.toFixed(4)),
      fundingPnl: Number(mark.fundingPnl.toFixed(4)),
      outcome: mark.pnl >= 0 ? "win" : "loss",
    };
    resolved.push(shadow);
  }

  return resolved;
}

function pnlCorrelation(proxyPnl: number, sourcePnl: number): NonNullable<BlockedSignalShadow["sourceComparison"]>["correlation"] {
  if (proxyPnl === 0 || sourcePnl === 0) return "flat";
  return Math.sign(proxyPnl) === Math.sign(sourcePnl) ? "same_direction" : "opposite_direction";
}

function updateProxyShortShadowComparisons(
  blockedSignals: BlockedSignalShadow[],
  closedTrades: ClosedTrade[],
): string[] {
  const notes: string[] = [];
  const tradesById = new Map(closedTrades.map((trade) => [trade.id, trade]));

  for (const shadow of blockedSignals) {
    if (
      shadow.blockedReason !== "polymarket_proxy_short" ||
      shadow.status !== "resolved" ||
      !shadow.hypotheticalResult ||
      !shadow.sourcePositionId ||
      shadow.sourceComparison
    ) continue;

    const sourceTrade = tradesById.get(shadow.sourcePositionId);
    if (!sourceTrade) continue;

    const comparison = {
      sourceClosedAt: sourceTrade.closedAt,
      sourcePnl: Number(sourceTrade.pnl.toFixed(4)),
      sourcePnlPct: Number(sourceTrade.pnlPct.toFixed(2)),
      proxyOutperformed: shadow.hypotheticalResult.pnlPct > sourceTrade.pnlPct,
      correlation: pnlCorrelation(shadow.hypotheticalResult.pnl, sourceTrade.pnl),
    };
    shadow.sourceComparison = comparison;

    const better = comparison.proxyOutperformed ? "outperformed" : "underperformed";
    const correlated = comparison.correlation === "same_direction"
      ? "correlated"
      : comparison.correlation === "opposite_direction" ? "inversely correlated" : "flat/mixed";
    notes.push(
      `${shadow.signalType} ${shadow.asset} PM proxy short ${better} actual short ` +
      `(${shadow.hypotheticalResult.pnlPct >= 0 ? "+" : ""}${shadow.hypotheticalResult.pnlPct.toFixed(2)}% vs ` +
      `${sourceTrade.pnlPct >= 0 ? "+" : ""}${sourceTrade.pnlPct.toFixed(2)}%) and was ${correlated}.`,
    );
  }

  return notes;
}

function summarizeBlockedSignals(blockedSignals: BlockedSignalShadow[]): BlockedSignalLearningSummary {
  const openCount = blockedSignals.filter((shadow) => shadow.status === "open").length;
  const resolved = blockedSignals
    .filter((shadow): shadow is BlockedSignalShadow & { hypotheticalResult: NonNullable<BlockedSignalShadow["hypotheticalResult"]>; resolvedAt: string } =>
      shadow.status === "resolved" && !!shadow.hypotheticalResult && !!shadow.resolvedAt)
    .sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt));

  const bySignal = new Map<string, BlockedSignalLearningSummary["bySignal"][number]>();
  for (const shadow of blockedSignals) {
    const row = bySignal.get(shadow.signalType) ?? {
      signalType: shadow.signalType,
      blocked: 0,
      resolved: 0,
      wouldHaveWon: 0,
      wouldHaveLost: 0,
      avgPnlPct: 0,
    };
    row.blocked++;
    if (shadow.hypotheticalResult) {
      row.resolved++;
      if (shadow.hypotheticalResult.outcome === "win") row.wouldHaveWon++;
      else row.wouldHaveLost++;
      row.avgPnlPct = ((row.avgPnlPct * (row.resolved - 1)) + shadow.hypotheticalResult.pnlPct) / row.resolved;
    }
    bySignal.set(shadow.signalType, row);
  }

  return {
    openCount,
    resolvedCount: resolved.length,
    wouldHaveWon: resolved.filter((shadow) => shadow.hypotheticalResult.outcome === "win").length,
    wouldHaveLost: resolved.filter((shadow) => shadow.hypotheticalResult.outcome === "loss").length,
    bySignal: Array.from(bySignal.values())
      .map((row) => ({ ...row, avgPnlPct: Number(row.avgPnlPct.toFixed(2)) }))
      .sort((a, b) => (b.wouldHaveWon - b.wouldHaveLost) - (a.wouldHaveWon - a.wouldHaveLost))
      .slice(0, 8),
    recentResolved: resolved.slice(-8).map((shadow) => ({
      signalType: shadow.signalType,
      asset: shadow.asset,
      venue: shadow.venue,
      direction: shadow.direction,
      blockedReason: shadow.blockedReason,
      outcome: shadow.hypotheticalResult.outcome,
      closeReason: shadow.hypotheticalResult.closeReason,
      pnlPct: shadow.hypotheticalResult.pnlPct,
      resolvedAt: shadow.resolvedAt,
      trendMetrics: shadow.trendMetrics,
      sourceComparison: shadow.sourceComparison,
    })),
  };
}

function blockedSignalObservations(summary: BlockedSignalLearningSummary): string[] {
  const notes: string[] = [];
  for (const row of summary.bySignal) {
    if (row.resolved < 3) continue;
    if (row.signalType.endsWith("_DOWNSIDE")) {
      // IV divergence missing-leg shadows
      const base = row.signalType.replace("_DOWNSIDE", "");
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${base} missing downside leg is profitable: ${row.wouldHaveWon}/${row.resolved} below-contract shadows would have won. The engine is leaving money on the table by ignoring the downside contract.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${base} missing downside leg is unprofitable: ${row.wouldHaveLost}/${row.resolved} below-contract shadows would have lost. The current upside-only approach appears correct.`);
      } else {
        notes.push(`${base} missing downside leg is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else if (row.signalType.endsWith("_PM_PROXY_SHORT")) {
      const base = row.signalType.replace("_PM_PROXY_SHORT", "");
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${base} Polymarket proxy short is promising: ${row.wouldHaveWon}/${row.resolved} NO-upside proxy shorts would have won, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${base} Polymarket proxy short is weak: ${row.wouldHaveLost}/${row.resolved} NO-upside proxy shorts would have lost, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else {
        notes.push(`${base} Polymarket proxy short is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else if (row.signalType.startsWith("USER_")) {
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${row.signalType} manual shadow signal is promising: ${row.wouldHaveWon}/${row.resolved} shadows would have won, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${row.signalType} manual shadow signal is weak: ${row.wouldHaveLost}/${row.resolved} shadows would have lost, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else {
        notes.push(`${row.signalType} manual shadow signal is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else {
      // Trend-blocked shadows
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${row.signalType} trend filter may be too strict: ${row.wouldHaveWon}/${row.resolved} blocked trades would have won.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${row.signalType} trend filter is avoiding losses: ${row.wouldHaveLost}/${row.resolved} blocked trades would have lost.`);
      }
    }
  }
  return notes;
}

function finalizeSignal(
  signal: Signal,
  rows: SnapshotRow[],
  learningParams: LearningParams,
  blockedContext?: {
    latestRow: SnapshotRow;
    latestSnapshot: InstrumentSnapshotFile | null;
    blockedSignals: BlockedSignalShadow[];
  },
): Signal | null {
  if (isShortSignalBlockedByTrend(signal, rows, learningParams)) {
    if (blockedContext) {
      recordBlockedSignalShadow(
        signal,
        rows,
        learningParams,
        blockedContext.latestRow,
        blockedContext.latestSnapshot,
        blockedContext.blockedSignals,
      );
    }
    return null;
  }

  const next = { ...signal };
  if (next.type === "LLM_HYPOTHESIS") {
    const llmRisk = riskForSignal(learningParams, "LLM_HYPOTHESIS");
    next.targetPct = next.targetPct === null || llmRisk.targetPct === null ? null : Math.max(next.targetPct, llmRisk.targetPct);
    next.stopPct = Math.min(next.stopPct, llmRisk.stopPct);
    next.expiryDays = Math.max(next.expiryDays, learningParams.llmTradeExpiryDays);
  }
  if (isMomentumLongSignal(next, rows, learningParams)) {
    const momentumRisk = riskForSignal(learningParams, "MOMENTUM_LONG");
    next.targetPct = next.targetPct === null || momentumRisk.targetPct === null ? null : Math.max(next.targetPct, momentumRisk.targetPct);
    next.stopPct = Math.min(next.stopPct, momentumRisk.stopPct);
    next.expiryDays = Math.max(next.expiryDays, learningParams.momentumLongExpiryDays);
  }
  return next;
}

function generateSignals(
  rows: SnapshotRow[],
  macroRows: SnapshotRow[],
  weights: SignalWeight[],
  learningParams: LearningParams,
  latestSnapshot: InstrumentSnapshotFile | null,
  blockedSignals: BlockedSignalShadow[],
): Signal[] {
  if (rows.length === 0) return [];
  const latest = rows[rows.length - 1];
  const signals: Signal[] = [];
  const weightMap = new Map(weights.filter((w) => w.enabled).map((w) => [w.type, w]));

  const assets = [
    { key: "BTC", pmIv: "btc_pm_iv", optIv30: "btc_opt_iv_30d", optIv90: "btc_opt_iv_90d",
      funding: "btc_hl_funding_ann", pmEv: "btc_pm_ev", spot: "btc_spot",
      pcRatio: "btc_ibit_pc_ratio", hlPerp: "btc_spot" },
    { key: "HYPE", pmIv: "hype_pm_iv", optIv30: null, optIv90: null,
      funding: "hype_hl_funding_ann", pmEv: "hype_pm_ev", spot: "hype_spot",
      pcRatio: null, hlPerp: "hype_spot" },
    { key: "GOLD", pmIv: "gold_pm_iv", optIv30: "gold_opt_iv_30d", optIv90: "gold_opt_iv_90d",
      funding: "gold_hl_funding_ann", pmEv: "gold_pm_settle_ev", spot: "gold_gc_spot",
      pcRatio: "gold_gld_pc_ratio", hlPerp: "gold_gc_spot" },
    { key: "AMZN", pmIv: null, optIv30: "amzn_opt_iv_30d", optIv90: "amzn_opt_iv_90d",
      funding: "amzn_hl_funding_ann", pmEv: null, spot: "amzn_stock",
      pcRatio: "amzn_pc_ratio", hlPerp: "amzn_hl_perp" },
    { key: "OIL", pmIv: "oil_pm_iv", optIv30: "oil_opt_iv_30d", optIv90: "oil_opt_iv_90d",
      funding: "oil_hl_funding_ann", pmEv: "oil_pm_settle_ev", spot: "oil_wti_spot",
      pcRatio: "oil_cl_pc_ratio", hlPerp: "oil_wti_spot" },
  ];

  for (const a of assets) {
    const spot = num(latest[a.spot]);
    if (!spot) continue;

    const pmIv = a.pmIv ? num(latest[a.pmIv]) : null;
    const optIv = a.optIv30 ? num(latest[a.optIv30]) : null;
    if (pmIv && optIv && optIv > 0) {
      const ratio = pmIv / optIv;
      const pmIvGtWeight = weightForSignalAsset(weightMap, "PM_IV_GT_OPT_IV", a.key);
      if (ratio > 1.3 && pmIvGtWeight) {
        const strength = Math.min(1, (ratio - 1.3) / 0.7);
        const w = pmIvGtWeight;
        const risk = riskForSignal(learningParams, "PM_IV_GT_OPT_IV");
        const rawSignalPmGt: Signal = {
          type: "PM_IV_GT_OPT_IV", asset: a.key, venue: "polymarket", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} PM IV (${pmIv.toFixed(1)}%) >> Options IV (${optIv.toFixed(1)}%), ratio ${ratio.toFixed(2)}. PM overpricing vol → sell PM upside.`,
          hypothesisId: null, entryPrice: spot, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 7,
          contractHint: { preferredDirection: "above" },
        };
        const signal = finalizeSignal(rawSignalPmGt, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) {
          signals.push(signal);
          recordIVDownsideLegShadow(signal, latest, latestSnapshot, learningParams, blockedSignals);
        }
      }
      const optIvGtWeight = weightForSignalAsset(weightMap, "OPT_IV_GT_PM_IV", a.key);
      if (ratio < 0.7 && optIvGtWeight) {
        const strength = Math.min(1, (0.7 - ratio) / 0.3);
        const w = optIvGtWeight;
        const risk = riskForSignal(learningParams, "OPT_IV_GT_PM_IV");
        const rawSignalOptGt: Signal = {
          type: "OPT_IV_GT_PM_IV", asset: a.key, venue: "polymarket", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} Options IV (${optIv.toFixed(1)}%) >> PM IV (${pmIv.toFixed(1)}%), ratio ${ratio.toFixed(2)}. PM underpricing vol → buy PM upside.`,
          hypothesisId: null, entryPrice: spot, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 7,
          contractHint: { preferredDirection: "above" },
        };
        const signal = finalizeSignal(rawSignalOptGt, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) {
          signals.push(signal);
          recordIVDownsideLegShadow(signal, latest, latestSnapshot, learningParams, blockedSignals);
        }
      }
    }

    const funding = a.funding ? num(latest[a.funding]) : null;
    if (funding !== null) {
      const fundingLongWeight = weightForSignalAsset(weightMap, "FUNDING_EXTREME_LONG", a.key);
      if (funding > 15 && fundingLongWeight) {
        const strength = Math.min(1, (funding - 15) / 35);
        const w = fundingLongWeight;
        const risk = riskForSignal(learningParams, "FUNDING_EXTREME_LONG");
        const perpEntry = getHyperliquidPerpPrice(latest, a.key) ?? spot;
        const signal = finalizeSignal({
          type: "FUNDING_EXTREME_LONG", asset: a.key, venue: "hyperliquid", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL funding ${funding.toFixed(1)}% annualized — crowded longs. Fade.`,
          hypothesisId: null, entryPrice: perpEntry, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 3, leverage: 1,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
      const fundingShortWeight = weightForSignalAsset(weightMap, "FUNDING_EXTREME_SHORT", a.key);
      if (funding < -15 && fundingShortWeight) {
        const strength = Math.min(1, (-funding - 15) / 35);
        const w = fundingShortWeight;
        const risk = riskForSignal(learningParams, "FUNDING_EXTREME_SHORT");
        const perpEntry = getHyperliquidPerpPrice(latest, a.key) ?? spot;
        const signal = finalizeSignal({
          type: "FUNDING_EXTREME_SHORT", asset: a.key, venue: "hyperliquid", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL funding ${funding.toFixed(1)}% annualized — crowded shorts. Buy.`,
          hypothesisId: null, entryPrice: perpEntry, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 3, leverage: 1,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
    }

    const pmEv = a.pmEv ? num(latest[a.pmEv]) : null;
    if (pmEv && spot) {
      const divergencePct = ((pmEv - spot) / spot) * 100;
      const pmEvAboveWeight = weightForSignalAsset(weightMap, "PM_EV_ABOVE_SPOT", a.key);
      if (divergencePct > 8 && pmEvAboveWeight) {
        const strength = Math.min(1, (divergencePct - 8) / 20);
        const w = pmEvAboveWeight;
        const risk = riskForSignal(learningParams, "PM_EV_ABOVE_SPOT");
        const signal = finalizeSignal({
          type: "PM_EV_ABOVE_SPOT", asset: a.key, venue: "spot", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} PM EV ($${pmEv.toFixed(0)}) is ${divergencePct.toFixed(1)}% above spot ($${spot.toFixed(0)}). Market expects upside.`,
          hypothesisId: null, entryPrice: spot, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 14,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
      const pmEvBelowWeight = weightForSignalAsset(weightMap, "PM_EV_BELOW_SPOT", a.key);
      if (divergencePct < -5 && pmEvBelowWeight) {
        const strength = Math.min(1, (-divergencePct - 5) / 15);
        const w = pmEvBelowWeight;
        const risk = riskForSignal(learningParams, "PM_EV_BELOW_SPOT");
        const signal = finalizeSignal({
          type: "PM_EV_BELOW_SPOT", asset: a.key, venue: "spot", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} PM EV ($${pmEv.toFixed(0)}) is ${divergencePct.toFixed(1)}% below spot ($${spot.toFixed(0)}). Market expects downside.`,
          hypothesisId: null, entryPrice: spot, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 14,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
    }

    const pcRatio = a.pcRatio ? num(latest[a.pcRatio]) : null;
    if (pcRatio !== null) {
      const pcHighWeight = weightForSignalAsset(weightMap, "PC_RATIO_EXTREME_HIGH", a.key);
      if (pcRatio > 1.2 && pcHighWeight) {
        const strength = Math.min(1, (pcRatio - 1.2) / 0.8);
        const w = pcHighWeight;
        const risk = riskForSignal(learningParams, "PC_RATIO_EXTREME_HIGH");
        const signal = finalizeSignal({
          type: "PC_RATIO_EXTREME_HIGH", asset: a.key, venue: "spot", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} P/C ratio ${pcRatio.toFixed(2)} — heavy put buying → contrarian long.`,
          hypothesisId: null, entryPrice: spot, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 5,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
      const pcLowWeight = weightForSignalAsset(weightMap, "PC_RATIO_EXTREME_LOW", a.key);
      if (a.key !== "AMZN" && pcRatio < 0.5 && pcLowWeight) {
        const strength = Math.min(1, (0.5 - pcRatio) / 0.3);
        const w = pcLowWeight;
        const risk = riskForSignal(learningParams, "PC_RATIO_EXTREME_LOW");
        const signal = finalizeSignal({
          type: "PC_RATIO_EXTREME_LOW", asset: a.key, venue: "spot", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} P/C ratio ${pcRatio.toFixed(2)} — heavy call buying → contrarian short.`,
          hypothesisId: null, entryPrice: spot, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 5,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
    }

    const hlPerp = a.hlPerp ? num(latest[a.hlPerp]) : null;
    const stockSpot = a.spot === a.hlPerp ? null : num(latest[a.spot]);
    if (hlPerp && stockSpot && a.key === "AMZN") {
      const basisPct = ((hlPerp - stockSpot) / stockSpot) * 100;
      const basisPremiumWeight = weightForSignalAsset(weightMap, "BASIS_PREMIUM", a.key);
      if (basisPct > 1.5 && basisPremiumWeight) {
        const strength = Math.min(1, (basisPct - 1.5) / 3);
        const w = basisPremiumWeight;
        const risk = riskForSignal(learningParams, "BASIS_PREMIUM");
        const signal = finalizeSignal({
          type: "BASIS_PREMIUM", asset: a.key, venue: "hyperliquid", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL perp ($${hlPerp.toFixed(2)}) at ${basisPct.toFixed(1)}% premium to stock ($${stockSpot.toFixed(2)}). Basis convergence → short perp.`,
          hypothesisId: null, entryPrice: hlPerp, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 5, leverage: 1,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
      const basisDiscountWeight = weightForSignalAsset(weightMap, "BASIS_DISCOUNT", a.key);
      if (basisPct < -1.5 && basisDiscountWeight) {
        const strength = Math.min(1, (-basisPct - 1.5) / 3);
        const w = basisDiscountWeight;
        const risk = riskForSignal(learningParams, "BASIS_DISCOUNT");
        const signal = finalizeSignal({
          type: "BASIS_DISCOUNT", asset: a.key, venue: "hyperliquid", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL perp ($${hlPerp.toFixed(2)}) at ${basisPct.toFixed(1)}% discount to stock ($${stockSpot.toFixed(2)}). Basis convergence → long perp.`,
          hypothesisId: null, entryPrice: hlPerp, targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 5, leverage: 1,
        }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }
    }
  }

  const macroShift = macroCompositeShiftPts(macroRows, LOOKBACK_HOURS);
  if (macroShift) {
    const threshold = learningParams.macroMomentum24hThresholdPts;
    const macroUpWeight = weightForSignalAsset(weightMap, "MACRO_MOMENTUM_UP", "BTC");
    if (macroShift.shift > threshold && macroUpWeight) {
      const strength = Math.min(1, (macroShift.shift - threshold) / 12);
      const w = macroUpWeight;
      const risk = riskForSignal(learningParams, "MACRO_MOMENTUM_UP");
      const signal = finalizeSignal({
        type: "MACRO_MOMENTUM_UP", asset: "BTC", venue: "spot", direction: "long",
        strength, confidence: strength * w.weight,
        thesis: `Macro composite rose +${macroShift.shift.toFixed(1)} pts over ${LOOKBACK_HOURS}h (${macroShift.previous.toFixed(1)}→${macroShift.current.toFixed(1)}). Risk-on momentum → long BTC.`,
        hypothesisId: null, entryPrice: num(rows[rows.length - 1].btc_spot) ?? 0,
        targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 7,
      }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
      if (signal) signals.push(signal);
    }
    const macroDownWeight = weightForSignalAsset(weightMap, "MACRO_MOMENTUM_DOWN", "BTC");
    if (macroShift.shift < -threshold && macroDownWeight) {
      const strength = Math.min(1, (-macroShift.shift - threshold) / 12);
      const w = macroDownWeight;
      const risk = riskForSignal(learningParams, "MACRO_MOMENTUM_DOWN");
      const signal = finalizeSignal({
        type: "MACRO_MOMENTUM_DOWN", asset: "BTC", venue: "spot", direction: "short",
        strength, confidence: strength * w.weight,
        thesis: `Macro composite fell ${macroShift.shift.toFixed(1)} pts over ${LOOKBACK_HOURS}h (${macroShift.previous.toFixed(1)}→${macroShift.current.toFixed(1)}). Risk-off momentum → short BTC.`,
        hypothesisId: null, entryPrice: num(rows[rows.length - 1].btc_spot) ?? 0,
        targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 7,
      }, rows, learningParams, { latestRow: latest, latestSnapshot, blockedSignals });
      if (signal) signals.push(signal);
    }
  }

  return signals.sort((a, b) => b.confidence - a.confidence);
}

// ─── Statistical Scanner ─────────────────────────────────────────────────────

function statisticalScan(rows: SnapshotRow[], macroRows: SnapshotRow[]): StatObservation[] {
  const obs: StatObservation[] = [];
  if (rows.length < 3) return obs;

  const numericCols = Object.keys(rows[0]).filter((k) => k !== "date" && typeof rows[0][k] === "number");
  const latest = rows[rows.length - 1];

  // Z-score anomalies (need at least 5 data points)
  if (rows.length >= 5) {
    for (const col of numericCols) {
      const vals = rows.map((r) => num(r[col])).filter((v): v is number => v !== null);
      if (vals.length < 5) continue;
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      if (std === 0) continue;
      const latestVal = num(latest[col]);
      if (latestVal === null) continue;
      const z = (latestVal - mean) / std;
      if (Math.abs(z) > 2) {
        obs.push({
          type: "anomaly",
          description: `${col} = ${latestVal} is ${z.toFixed(1)} std devs from mean (${mean.toFixed(2)} ± ${std.toFixed(2)})`,
          assets: [col.split("_")[0].toUpperCase()],
          magnitude: Math.abs(z),
          data: { value: latestVal, mean, std, z },
        });
      }
    }
  }

  // Day-over-day divergences
  if (rows.length >= 2) {
    const prev = rows[rows.length - 2];
    const pairs = [
      ["btc_pm_iv", "btc_opt_iv_30d", "BTC"],
      ["gold_pm_iv", "gold_opt_iv_30d", "GOLD"],
      ["oil_pm_iv", "oil_opt_iv_30d", "OIL"],
    ];
    for (const [a, b, asset] of pairs) {
      const nowA = num(latest[a]), nowB = num(latest[b]);
      const prevA = num(prev[a]), prevB = num(prev[b]);
      if (nowA && nowB && prevA && prevB) {
        const gapNow = nowA - nowB;
        const gapPrev = prevA - prevB;
        const gapChange = gapNow - gapPrev;
        if (Math.abs(gapChange) > 5) {
          obs.push({
            type: "divergence",
            description: `${asset} PM-Options IV gap moved ${gapChange > 0 ? "wider" : "narrower"} by ${Math.abs(gapChange).toFixed(1)}pp (was ${gapPrev.toFixed(1)}, now ${gapNow.toFixed(1)})`,
            assets: [asset],
            magnitude: Math.abs(gapChange),
            data: { gapNow, gapPrev, gapChange },
          });
        }
      }
    }
  }

  // Correlation changes (need 7+ rows)
  if (rows.length >= 7) {
    const corrPairs = [
      ["btc_spot", "gold_gc_spot", "BTC", "GOLD"],
      ["btc_spot", "oil_wti_spot", "BTC", "OIL"],
      ["gold_gc_spot", "oil_wti_spot", "GOLD", "OIL"],
      ["btc_hl_funding_ann", "hype_hl_funding_ann", "BTC", "HYPE"],
    ];
    const halfLen = Math.floor(rows.length / 2);
    for (const [colA, colB, assetA, assetB] of corrPairs) {
      const recentA = rows.slice(-halfLen).map((r) => num(r[colA])).filter((v): v is number => v !== null);
      const recentB = rows.slice(-halfLen).map((r) => num(r[colB])).filter((v): v is number => v !== null);
      const olderA = rows.slice(0, halfLen).map((r) => num(r[colA])).filter((v): v is number => v !== null);
      const olderB = rows.slice(0, halfLen).map((r) => num(r[colB])).filter((v): v is number => v !== null);
      const len = Math.min(recentA.length, recentB.length, olderA.length, olderB.length);
      if (len < 3) continue;
      const corrRecent = pearson(recentA.slice(0, len), recentB.slice(0, len));
      const corrOlder = pearson(olderA.slice(0, len), olderB.slice(0, len));
      if (Math.abs(corrRecent - corrOlder) > 0.4) {
        obs.push({
          type: "correlation_flip",
          description: `${assetA}-${assetB} correlation shifted from ${corrOlder.toFixed(2)} to ${corrRecent.toFixed(2)}`,
          assets: [assetA, assetB],
          magnitude: Math.abs(corrRecent - corrOlder),
          data: { corrRecent, corrOlder },
        });
      }
    }
  }

  return obs.sort((a, b) => b.magnitude - a.magnitude);
}

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

// ─── Position Management ─────────────────────────────────────────────────────

function markToMarket(
  portfolio: Portfolio,
  latestRow: SnapshotRow,
  snapshots: InstrumentSnapshotFile[],
): ClosedTrade[] {
  const closed: ClosedTrade[] = [];
  const now = new Date().toISOString();
  const remaining: Position[] = [];

  for (const pos of portfolio.positions) {
    const mark = markPosition(pos, latestRow, snapshots);
    if (!mark) { remaining.push(pos); continue; }

    let closeReason: ClosedTrade["closeReason"] | null = null;
    if (pos.targetPct !== null && mark.pnlPct >= pos.targetPct) closeReason = "target";
    else if (mark.pnlPct <= -pos.stopPct) closeReason = "stop";
    else if (new Date(pos.expiryDate) <= new Date()) closeReason = "expiry";

    if (closeReason) {
      const trade = realizeClosedPosition(portfolio, pos, mark, closeReason, now);
      closed.push(trade);
    } else {
      pos.currentPrice = mark.currentPrice;
      pos.currentUnderlyingPrice = mark.underlyingPrice ?? undefined;
      pos.fundingPnlAccrued = mark.fundingPnl;
      remaining.push(pos);
    }
  }

  portfolio.positions = remaining;
  return closed;
}

function buildPositionFromSignal(
  signal: Signal,
  latestRow: SnapshotRow,
  latestSnapshot: InstrumentSnapshotFile | null,
): Position | null {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + signal.expiryDays);
  const underlyingPrice = getAssetPrice(latestRow, signal.asset) ?? signal.entryPrice;

  const base: Position = {
    id: `T-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    openedAt: new Date().toISOString(),
    asset: signal.asset,
    venue: signal.venue,
    direction: signal.direction,
    entryPrice: signal.entryPrice,
    currentPrice: signal.entryPrice,
    currentUnderlyingPrice: underlyingPrice,
    entryUnderlyingPrice: underlyingPrice,
    size: TRADE_SIZE,
    leverage: signal.leverage ?? 1,
    signalType: signal.type,
    hypothesisId: signal.hypothesisId,
    thesis: signal.thesis,
    targetPct: signal.targetPct,
    stopPct: signal.stopPct,
    expiryDate: expiry.toISOString(),
  };

  if (signal.venue === "spot") {
    return { ...base, instrumentType: "spot", instrumentLabel: `${signal.asset} spot` };
  }

  if (signal.venue === "hyperliquid") {
    const perpPrice = getHyperliquidPerpPrice(latestRow, signal.asset);
    if (!perpPrice) return null;
    return {
      ...base,
      entryPrice: perpPrice,
      currentPrice: perpPrice,
      instrumentType: "hl_perp",
      instrumentId: signal.asset,
      instrumentLabel: `HL ${signal.asset} perp`,
      fundingPnlAccrued: 0,
    };
  }

  if (signal.venue === "polymarket") {
    if (!latestSnapshot) return null;
    const selected = selectPolymarketContract(
      latestSnapshot,
      signal.asset,
      underlyingPrice,
      signal.direction,
      signal.contractHint ?? { preferredDirection: inferPolymarketPreferredDirection(signal.direction, signal.type, signal.thesis) },
    );
    if (!selected) return null;
    return {
      ...base,
      entryPrice: selected.entryPrice,
      currentPrice: selected.entryPrice,
      instrumentType: selected.instrumentType,
      instrumentId: `${selected.event.slug}::${selected.contract.marketId}`,
      instrumentLabel: `${selected.event.slug} — ${selected.instrumentType === "pm_yes" ? "YES" : "NO"} — ${selected.contract.question}`,
    };
  }

  return { ...base, instrumentType: "legacy_asset" };
}

function openPositions(
  portfolio: Portfolio,
  signals: Signal[],
  latestRow: SnapshotRow,
  snapshots: InstrumentSnapshotFile[],
  learningParams: LearningParams,
  blockedSignals: BlockedSignalShadow[],
): Position[] {
  const opened: Position[] = [];
  const latestSnapshot = latestInstrumentSnapshot(snapshots);
  for (const sig of signals) {
    if (portfolio.positions.length >= MAX_OPEN_POSITIONS) break;
    if (portfolio.cash < TRADE_SIZE) break;
    if (sig.confidence < 0.15) break;

    // Don't double up on same asset+direction
    const dup = portfolio.positions.find((p) => p.asset === sig.asset && p.direction === sig.direction);
    if (dup) continue;

    const pos = buildPositionFromSignal(sig, latestRow, latestSnapshot);
    if (!pos) continue;

    portfolio.cash -= TRADE_SIZE;
    portfolio.positions.push(pos);
    opened.push(pos);
    recordPolymarketProxyShortShadow(pos, latestRow, latestSnapshot, learningParams, blockedSignals);
  }
  return opened;
}

// ─── Weight Updates ──────────────────────────────────────────────────────────

function updateWeights(weights: SignalWeight[], closedTrades: ClosedTrade[]): string[] {
  const observations: string[] = [];

  for (const trade of closedTrades) {
    const w = weights.find((w) => w.type === trade.signalType);
    if (!w) continue;

    const isWin = trade.pnl >= 0;
    w.trades++;
    if (isWin) w.wins++;
    w.avgPnlPct = ((w.avgPnlPct * (w.trades - 1)) + trade.pnlPct) / w.trades;
    w.lastTriggered = trade.closedAt;

    // Per-asset tracking
    if (!w.perAsset[trade.asset]) w.perAsset[trade.asset] = { trades: 0, wins: 0, avgPnlPct: 0 };
    const pa = w.perAsset[trade.asset];
    pa.trades++;
    if (isWin) pa.wins++;
    pa.avgPnlPct = ((pa.avgPnlPct * (pa.trades - 1)) + trade.pnlPct) / pa.trades;

    // Adaptive weight update
    const recentAccuracy = w.trades > 0 ? w.wins / w.trades : 0.5;
    w.weight = w.weight * WEIGHT_DECAY + recentAccuracy * (1 - WEIGHT_DECAY);
    w.weight = Math.max(0.05, Math.min(0.95, w.weight));

    // Demotion check
    if (w.trades >= 10 && recentAccuracy < DEMOTE_THRESHOLD && w.enabled) {
      observations.push(`⚠ ${w.type} accuracy dropped to ${(recentAccuracy * 100).toFixed(0)}% over ${w.trades} trades. Weight reduced to ${w.weight.toFixed(2)}.`);
    }
    if (w.trades >= 10 && recentAccuracy < KILL_THRESHOLD) {
      w.enabled = false;
      observations.push(`🛑 ${w.type} DISABLED — accuracy ${(recentAccuracy * 100).toFixed(0)}% over ${w.trades} trades is below kill threshold.`);
    }

    // Per-asset kill switch. This keeps a broken asset/signal pair from
    // suppressing useful behavior on other assets.
    const perAssetAccuracy = pa.trades > 0 ? pa.wins / pa.trades : 0.5;
    if (pa.trades >= 5 && perAssetAccuracy < KILL_THRESHOLD && !pa.disabled) {
      pa.disabled = true;
      pa.disabledAt = trade.closedAt;
      pa.disabledReason = `${w.type} on ${trade.asset} disabled after ${pa.wins}/${pa.trades} wins (${(perAssetAccuracy * 100).toFixed(0)}% accuracy).`;
      observations.push(`🛑 ${w.type} on ${trade.asset} DISABLED — ${pa.wins}/${pa.trades} wins is below per-asset kill threshold.`);
    }
  }

  return observations;
}

// ─── Hypothesis Evaluation ───────────────────────────────────────────────────

function inferHypothesisAsset(hypothesis: Hypothesis): string | null {
  const keys = Object.keys(hypothesis.conditions).join(" ").toLowerCase();
  const text = `${hypothesis.description} ${hypothesis.prediction} ${keys}`.toLowerCase();
  if (text.includes("btc") || text.includes("bitcoin")) return "BTC";
  if (text.includes("hype") || text.includes("hyperliquid")) return "HYPE";
  if (text.includes("gold")) return "GOLD";
  if (text.includes("amzn") || text.includes("amazon")) return "AMZN";
  if (text.includes("oil") || text.includes("brent") || text.includes("wti")) return "OIL";
  return null;
}

function evaluateHypothesisTest(hypothesis: Hypothesis, startRow: SnapshotRow, endRow: SnapshotRow): { outcome: "win" | "loss"; actualMove: string } {
  const prediction = hypothesis.prediction.toLowerCase();
  const percentMatch = prediction.match(/>(\d+(?:\.\d+)?)%/);
  const thresholdPct = percentMatch ? parseFloat(percentMatch[1]) : 2;

  if (prediction.includes("funding")) {
    const conditionKey = Object.keys(hypothesis.conditions).find((key) => key.includes("_hl_funding_ann"));
    if (!conditionKey) return { outcome: "loss", actualMove: "No funding key found" };
    const start = num(startRow[conditionKey]);
    const end = num(endRow[conditionKey]);
    if (start === null || end === null) return { outcome: "loss", actualMove: "Missing funding history" };
    if (prediction.includes("below")) {
      const target = prediction.match(/below\s+(\d+(?:\.\d+)?)/);
      const level = target ? parseFloat(target[1]) : 10;
      return {
        outcome: end < level ? "win" : "loss",
        actualMove: `Funding moved ${start.toFixed(1)}% → ${end.toFixed(1)}%`,
      };
    }
  }

  const asset = inferHypothesisAsset(hypothesis);
  if (!asset) return { outcome: "loss", actualMove: "Could not infer asset" };
  const startPx = getAssetPrice(startRow, asset);
  const endPx = getAssetPrice(endRow, asset);
  if (!startPx || !endPx) return { outcome: "loss", actualMove: "Missing price history" };
  const movePct = ((endPx - startPx) / startPx) * 100;

  if (prediction.includes("decline") || prediction.includes("drop") || prediction.includes("down")) {
    return {
      outcome: movePct <= -thresholdPct ? "win" : "loss",
      actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx})`,
    };
  }
  if (prediction.includes("move")) {
    return {
      outcome: Math.abs(movePct) >= thresholdPct ? "win" : "loss",
      actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx})`,
    };
  }

  return {
    outcome: movePct >= thresholdPct ? "win" : "loss",
    actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx})`,
  };
}

function evaluateHypotheses(hypotheses: Hypothesis[], valuationRows: SnapshotRow[]): string[] {
  const observations: string[] = [];
  const now = new Date();

  for (const h of hypotheses) {
    if (h.status === "killed" || h.status === "archived") continue;

    // Check pending tests
    for (const test of h.tests) {
      if (test.outcome !== "pending") continue;
      const testDate = new Date(test.date);
      const elapsed = (now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24);
      if (elapsed < h.timeframeDays) continue;
      const startRow = valuationRows.find((row) => row.date.startsWith(test.date));
      const endRow = valuationRows[valuationRows.length - 1];
      if (!startRow || !endRow) {
        test.outcome = "loss";
        test.actualMove = "Missing valuation history";
        continue;
      }
      const result = evaluateHypothesisTest(h, startRow, endRow);
      test.outcome = result.outcome;
      test.actualMove = result.actualMove;
    }

    // Update win rate
    const completed = h.tests.filter((t) => t.outcome !== "pending");
    if (completed.length > 0) {
      h.winRate = completed.filter((t) => t.outcome === "win").length / completed.length;
    }

    // Promotion
    if (!h.promotedToSignal && h.status === "active" && completed.length >= PROMOTE_MIN_TESTS && h.winRate >= PROMOTE_THRESHOLD) {
      h.status = "promoted";
      h.promotedToSignal = true;
      observations.push(`🎯 Hypothesis ${h.id} PROMOTED to active signal (${(h.winRate * 100).toFixed(0)}% over ${completed.length} tests): ${h.description}`);
    }

    // Demotion
    if (h.status === "promoted" && completed.length >= PROMOTE_MIN_TESTS && h.winRate < DEMOTE_THRESHOLD) {
      h.status = "active";
      h.promotedToSignal = false;
      h.postMortem = `Demoted: win rate dropped to ${(h.winRate * 100).toFixed(0)}% after ${completed.length} tests.`;
      observations.push(`📉 Hypothesis ${h.id} DEMOTED back to testing: ${h.description}`);
    }

    // Kill
    if (completed.length >= PROMOTE_MIN_TESTS && h.winRate < KILL_THRESHOLD) {
      h.status = "killed";
      h.postMortem = h.postMortem ?? `Killed: win rate ${(h.winRate * 100).toFixed(0)}% over ${completed.length} tests.`;
      observations.push(`💀 Hypothesis ${h.id} KILLED (${(h.winRate * 100).toFixed(0)}%): ${h.description}`);
    }
  }

  return observations;
}

// ─── LLM Integration ─────────────────────────────────────────────────────────

async function callLLM(
  valuationRows: SnapshotRow[],
  macroRows: SnapshotRow[],
  instrumentSnapshots: InstrumentSnapshotFile[],
  portfolio: Portfolio,
  learningParams: LearningParams,
  weights: SignalWeight[],
  hypotheses: Hypothesis[],
  statObs: StatObservation[],
  closedTrades: ClosedTrade[],
  blockedSummary: BlockedSignalLearningSummary,
  relativeValueRows: RelativeValueObservation[],
  journalTail: string,
): Promise<{
  marketAssessment: string;
  newHypotheses: Omit<Hypothesis, "id" | "tests" | "winRate" | "status" | "promotedToSignal" | "postMortem">[];
  hypothesisReviews: { id: string; observation: string }[];
  trades: LlmTradeInstruction[];
  parameterUpdates?: Partial<Omit<LearningParams, "updatedAt">>;
  journalEntry: string;
} | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("  [LLM] No ANTHROPIC_API_KEY set, skipping LLM reasoning.");
    return null;
  }

  const recentValuations = valuationRows.slice(-14);
  const recentMacro = macroRows.slice(-14);
  const recentInstruments = instrumentSnapshots.slice(-4).map(compactInstrumentSnapshotForLlm);
  const activeHypotheses = hypotheses.filter((h) => h.status === "active" || h.status === "promoted");
  const killedRecently = hypotheses.filter((h) => h.status === "killed").slice(-5);
  const activeWeights = weights.filter((w) => w.trades > 0);

  const prompt = `You are a quantitative paper trading system analyzing cross-venue market data. Your job is to:
1. Assess the current market state
2. Propose NEW testable hypotheses about patterns in the data
3. Review existing hypotheses
4. Suggest specific trades

MARKET DATA (last ${recentValuations.length} snapshots):
${JSON.stringify(recentValuations, null, 1)}

MACRO DATA (last ${recentMacro.length} snapshots):
${JSON.stringify(recentMacro, null, 1)}

INSTRUMENT SNAPSHOTS (last ${recentInstruments.length} runs):
${JSON.stringify(recentInstruments, null, 1)}

PORTFOLIO:
Cash: $${portfolio.cash.toFixed(2)} | Open positions: ${portfolio.positions.length} | Realized P&L: $${portfolio.totalRealizedPnl.toFixed(2)}
Win rate: ${portfolio.totalTrades > 0 ? ((portfolio.winCount / portfolio.totalTrades) * 100).toFixed(0) : "N/A"}% over ${portfolio.totalTrades} trades

OPEN POSITIONS:
${portfolio.positions.map((p) => `  ${p.asset} ${p.direction} via ${p.venue} / ${p.instrumentType ?? "legacy"} @ ${p.entryPrice} [${p.instrumentLabel ?? "n/a"}] (${p.signalType}) — ${p.thesis.slice(0, 100)}`).join("\n") || "  None"}

SIGNAL PERFORMANCE:
${activeWeights.map((w) => {
  const disabledAssets = Object.entries(w.perAsset ?? {})
    .filter(([, stats]) => stats.disabled)
    .map(([asset, stats]) => `${asset} disabled (${stats.wins}/${stats.trades} wins, avg pnl=${stats.avgPnlPct.toFixed(2)}%)`)
    .join("; ");
  return `  ${w.type}: weight=${w.weight.toFixed(2)}, ${w.wins}/${w.trades} wins (${w.trades > 0 ? ((w.wins / w.trades) * 100).toFixed(0) : "N/A"}%), avg pnl=${w.avgPnlPct.toFixed(2)}%${disabledAssets ? ` | disabled assets: ${disabledAssets}` : ""}`;
}).join("\n") || "  No trades yet"}

ACTIVE HYPOTHESES:
${activeHypotheses.map((h) => `  ${h.id}: ${h.description} [${h.status}, ${(h.winRate * 100).toFixed(0)}% over ${h.tests.length} tests]`).join("\n") || "  None yet"}

RECENTLY KILLED HYPOTHESES:
${killedRecently.map((h) => `  ${h.id}: ${h.description} — ${h.postMortem}`).join("\n") || "  None"}

STATISTICAL OBSERVATIONS:
${statObs.map((o) => `  [${o.type}] ${o.description}`).join("\n") || "  None"}

RECENT CLOSED TRADES:
${closedTrades.slice(-10).map((t) => `  ${t.asset} ${t.direction} via ${t.venue}/${t.instrumentType ?? "legacy"} ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (market=${(t.marketPnl ?? t.pnl).toFixed(4)}, funding=${(t.fundingPnl ?? 0).toFixed(4)}) [${t.instrumentLabel ?? "n/a"}]`).join("\n") || "  None"}

CURRENT LEARNABLE PARAMETERS:
${JSON.stringify(learningParams, null, 2)}

BLOCKED SIGNAL SHADOW LEARNING:
${JSON.stringify(blockedSummary, null, 1)}

RELATIVE-VALUE HEATMAP OBSERVATIONS (ranked by absolute executable edge):
${JSON.stringify(relativeValueRows, null, 1)}

RECENT LEARNING JOURNAL:
${journalTail || "  No entries yet"}

IMPORTANT RULES:
- Each hypothesis MUST be specific and testable with a clear timeframe (1-14 days)
- Each hypothesis MUST define measurable conditions using column names from the data
- Focus on cross-venue divergences and patterns the rule-based system can't detect
- Be honest about what's working and what isn't
- If a pattern stopped working, explain WHY you think it changed
- Trade sizes are always $1, max $100 bankroll
- Available venues: polymarket, hyperliquid, spot
- Available assets: BTC, HYPE, GOLD, AMZN, OIL
- Polymarket trades are real contract simulations: long = buy YES, short = buy NO on a specific contract
- Hyperliquid trades are perp simulations and include funding carry in realized P&L
- Spot trades are marked only to the underlying spot price
- Prefer polymarket only for assets with explicit contracts in the instrument snapshots
- If you suggest parameter changes, keep them incremental and evidence-based
- Use BLOCKED SIGNAL SHADOW LEARNING to judge whether filters are too strict or appropriately defensive
- Use RELATIVE-VALUE HEATMAP OBSERVATIONS to look for clean cross-venue edges. If you suggest a trade because of this section, say "relative-value heatmap" in the thesis so its performance can be reviewed.
- You may return \"action: close\" to exit an existing open position; use that only when the thesis has clearly weakened or a target/stop is likely stale
- For \"action: close\", set direction to long, short, or any to identify which existing position to close
- Keep parameter updates inside these bounds:
  - macroMomentum24hThresholdPts: 2 to 20
  - contrarianTrendMarginPct: 0 to 5
  - positiveMomentum24hPct: 0 to 10
  - llmTradeExpiryDays: 3 to 30
  - momentumLongExpiryDays: 3 to 45
  - signalRisk.<signal>.targetPct: 0.5 to 15, or null for no upside take-profit cap
  - signalRisk.<signal>.stopPct: 0.5 to 10
- You may update signalRisk when realized wins are too small, losses are too large, or shadow/blocked learning shows a better payoff shape.
- Keep signalRisk updates incremental and explain them in journalEntry.

Respond with ONLY valid JSON in this exact format:
{
  "marketAssessment": "2-3 sentence summary",
  "newHypotheses": [
    {
      "created": "YYYY-MM-DD",
      "description": "clear description of pattern",
      "conditions": {"column_name": "> value", ...},
      "prediction": "specific testable prediction",
      "timeframeDays": 7,
      "confidence": 0.6,
      "source": "llm"
    }
  ],
  "hypothesisReviews": [{"id": "H-xxx", "observation": "what happened and why"}],
  "trades": [{"action": "buy", "asset": "BTC", "venue": "spot", "direction": "long", "thesis": "reason"}],
  "parameterUpdates": {
    "macroMomentum24hThresholdPts": 4,
    "contrarianTrendMarginPct": 0.5,
    "positiveMomentum24hPct": 1.5,
    "llmTradeExpiryDays": 14,
    "momentumLongExpiryDays": 21,
    "signalRisk": {
      "PM_IV_GT_OPT_IV": {"targetPct": null, "stopPct": 5},
      "FUNDING_EXTREME_SHORT": {"targetPct": 2.5, "stopPct": 2.5},
      "LLM_HYPOTHESIS": {"targetPct": 5, "stopPct": 3.5}
    }
  },
  "journalEntry": "Key observations and lessons from today's analysis..."
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.log(`  [LLM] API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as any;
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("  [LLM] Could not parse JSON from response");
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    console.log(`  [LLM] Error: ${e.message}`);
    return null;
  }
}

function formatPct(v: number | null): string {
  return v === null ? "n/a" : `${(v * 100).toFixed(1)}%`;
}

// ─── Journal Writer ──────────────────────────────────────────────────────────

function writeJournalEntry(
  closedTrades: ClosedTrade[],
  openedPositions: Position[],
  weightObs: string[],
  hypothesisObs: string[],
  statObs: StatObservation[],
  blockedObs: string[],
  blockedSummary: BlockedSignalLearningSummary,
  llmJournal: string | null,
  portfolio: Portfolio,
) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace("T", " ");
  const lines: string[] = [];

  lines.push(`### ${dateStr} UTC`);
  lines.push("");

  // Portfolio summary
  const winRate = portfolio.totalTrades > 0 ? ((portfolio.winCount / portfolio.totalTrades) * 100).toFixed(0) : "N/A";
  lines.push(`**Portfolio:** $${(portfolio.cash + portfolio.positions.length * TRADE_SIZE).toFixed(2)} total | Cash $${portfolio.cash.toFixed(2)} | ${portfolio.positions.length} open | P&L $${portfolio.totalRealizedPnl.toFixed(4)} | ${winRate}% win rate (${portfolio.totalTrades} trades)`);
  lines.push("");

  if (closedTrades.length > 0) {
    lines.push(`**Closed ${closedTrades.length} trades:**`);
    for (const t of closedTrades) {
      const emoji = t.pnl >= 0 ? "✅" : "❌";
      lines.push(`- ${emoji} ${t.asset} ${t.direction} via ${t.venue}/${t.instrumentType ?? "legacy"} [${t.instrumentLabel ?? "n/a"}] (${t.signalType}) → ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (${t.pnlPct.toFixed(1)}%, market ${(t.marketPnl ?? t.pnl).toFixed(4)}, funding ${(t.fundingPnl ?? 0).toFixed(4)})`);
    }
    lines.push("");
  }

  if (openedPositions.length > 0) {
    lines.push(`**Opened ${openedPositions.length} positions:**`);
    for (const p of openedPositions) {
      lines.push(`- ${p.asset} ${p.direction} @ $${p.entryPrice} via ${p.venue}/${p.instrumentType ?? "legacy"} [${p.instrumentLabel ?? "n/a"}] (${p.signalType})`);
    }
    lines.push("");
  }

  if (weightObs.length > 0) {
    lines.push("**Signal weight changes:**");
    for (const o of weightObs) lines.push(`- ${o}`);
    lines.push("");
  }

  if (hypothesisObs.length > 0) {
    lines.push("**Hypothesis lifecycle:**");
    for (const o of hypothesisObs) lines.push(`- ${o}`);
    lines.push("");
  }

  if (statObs.length > 0) {
    lines.push("**Statistical observations:**");
    for (const o of statObs.slice(0, 5)) lines.push(`- [${o.type}] ${o.description}`);
    lines.push("");
  }

  if (blockedObs.length > 0 || blockedSummary.recentResolved.length > 0 || blockedSummary.openCount > 0) {
    lines.push("**Blocked signal learning:**");
    lines.push(`- Open blocked shadows: ${blockedSummary.openCount}`);
    lines.push(`- Resolved blocked shadows: ${blockedSummary.resolvedCount} (${blockedSummary.wouldHaveWon} wins / ${blockedSummary.wouldHaveLost} losses)`);
    for (const note of blockedObs) lines.push(`- ${note}`);
    for (const shadow of blockedSummary.recentResolved.slice(-4)) {
      const emoji = shadow.outcome === "win" ? "✅" : "❌";
      const label = shadow.blockedReason === "iv_downside_leg_untracked"
        ? "Missing downside leg"
        : shadow.blockedReason === "polymarket_proxy_short" ? "PM proxy short"
        : shadow.blockedReason === "relative_value_heatmap" ? "Relative-value heatmap"
        : shadow.blockedReason === "manual_shadow_trade" ? "Manual shadow" : "Blocked";
      lines.push(`- ${emoji} ${label}: ${shadow.signalType} ${shadow.asset} ${shadow.direction} via ${shadow.venue} would have ${shadow.closeReason} (${shadow.pnlPct >= 0 ? "+" : ""}${shadow.pnlPct.toFixed(2)}%)`);
    }
    lines.push("");
  }

  if (llmJournal) {
    lines.push("**LLM analysis:**");
    lines.push(llmJournal);
    lines.push("");
  }

  lines.push("---\n");
  appendJournal(lines.join("\n"));
}

// ─── Regime Detection ────────────────────────────────────────────────────────

function checkRegime(portfolio: Portfolio): { inDrawdown: boolean; sizeMultiplier: number } {
  if (portfolio.totalTrades < 10) return { inDrawdown: false, sizeMultiplier: 1.0 };

  const recentFile = existsSync(join(DATA_DIR, "trades-detailed.csv"))
    ? join(DATA_DIR, "trades-detailed.csv")
    : join(DATA_DIR, "trades.csv");
  if (!existsSync(recentFile)) return { inDrawdown: false, sizeMultiplier: 1.0 };

  const lines = readFileSync(recentFile, "utf-8").trim().split("\n");
  const headers = parseCsvLine(lines[0] ?? "");
  const pnlIndex = Math.max(0, headers.indexOf("pnl"));
  const recent = lines.slice(-20);
  let wins = 0, total = 0;
  for (const line of recent) {
    if (line.startsWith("id,")) continue;
    const cols = parseCsvLine(line);
    const pnl = parseFloat(cols[pnlIndex] ?? "0");
    total++;
    if (pnl >= 0) wins++;
  }

  const winRate = total > 0 ? wins / total : 0.5;
  if (winRate < 0.35) {
    return { inDrawdown: true, sizeMultiplier: 0.5 };
  }
  return { inDrawdown: false, sizeMultiplier: 1.0 };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  return null;
}

function snapshotTimeMs(ts: string): number {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(ts)) return Date.parse(`${ts}:00:00Z`);
  return Date.parse(ts);
}

function readJournalTail(lines: number = 50): string {
  const file = join(DATA_DIR, "learning-journal.md");
  if (!existsSync(file)) return "";
  const content = readFileSync(file, "utf-8");
  const allLines = content.split("\n");
  return allLines.slice(-lines).join("\n");
}

function estimateOpenPositionPnl(position: Position): number {
  if (position.instrumentType === "pm_yes" || position.instrumentType === "pm_no") {
    const shares = position.size / position.entryPrice;
    return shares * (position.currentPrice - position.entryPrice);
  }
  const leverage = position.leverage ?? 1;
  const directional = position.direction === "long"
    ? ((position.currentPrice - position.entryPrice) / position.entryPrice)
    : ((position.entryPrice - position.currentPrice) / position.entryPrice);
  const marketPnl = position.size * leverage * directional;
  return marketPnl + (position.fundingPnlAccrued ?? 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyLearningParamUpdates(
  current: LearningParams,
  updates: Partial<Omit<LearningParams, "updatedAt">> | undefined,
): { next: LearningParams; notes: string[] } {
  if (!updates) return { next: current, notes: [] };
  const next = { ...current };
  const notes: string[] = [];
  const candidates: Array<{
    key: "macroMomentum24hThresholdPts" | "contrarianTrendMarginPct" | "positiveMomentum24hPct" | "llmTradeExpiryDays" | "momentumLongExpiryDays";
    min: number;
    max: number;
    digits: number;
  }> = [
    { key: "macroMomentum24hThresholdPts", min: 2, max: 20, digits: 1 },
    { key: "contrarianTrendMarginPct", min: 0, max: 5, digits: 2 },
    { key: "positiveMomentum24hPct", min: 0, max: 10, digits: 2 },
    { key: "llmTradeExpiryDays", min: 3, max: 30, digits: 0 },
    { key: "momentumLongExpiryDays", min: 3, max: 45, digits: 0 },
  ];

  for (const candidate of candidates) {
    const proposed = updates[candidate.key];
    if (typeof proposed !== "number" || Number.isNaN(proposed)) continue;
    const bounded = clamp(proposed, candidate.min, candidate.max);
    const normalized = candidate.digits === 0
      ? Math.round(bounded)
      : Number(bounded.toFixed(candidate.digits));
    if (normalized !== next[candidate.key]) {
      notes.push(`${candidate.key}: ${next[candidate.key]} -> ${normalized}`);
      next[candidate.key] = normalized;
    }
  }

  if (updates.signalRisk && typeof updates.signalRisk === "object") {
    const nextSignalRisk = { ...next.signalRisk };
    for (const [signalType, proposed] of Object.entries(updates.signalRisk)) {
      if (!DEFAULT_SIGNAL_RISK[signalType] || !proposed) continue;
      const currentRisk = nextSignalRisk[signalType] ?? DEFAULT_SIGNAL_RISK[signalType];
      const nextRisk = { ...currentRisk };
      if (proposed.targetPct === null) {
        nextRisk.targetPct = null;
      } else if (typeof proposed.targetPct === "number" && !Number.isNaN(proposed.targetPct)) {
        nextRisk.targetPct = Number(clamp(proposed.targetPct, 0.5, 15).toFixed(2));
      }
      if (typeof proposed.stopPct === "number" && !Number.isNaN(proposed.stopPct)) {
        nextRisk.stopPct = Number(clamp(proposed.stopPct, 0.5, 10).toFixed(2));
      }
      if (nextRisk.targetPct !== currentRisk.targetPct || nextRisk.stopPct !== currentRisk.stopPct) {
        notes.push(`${signalType} risk: ${formatTargetPct(currentRisk.targetPct)}/-${currentRisk.stopPct} -> ${formatTargetPct(nextRisk.targetPct)}/-${nextRisk.stopPct}`);
        nextSignalRisk[signalType] = nextRisk;
      }
    }
    next.signalRisk = nextSignalRisk;
  }

  if (notes.length > 0) next.updatedAt = new Date().toISOString();
  return { next, notes };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDataDir();
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  console.log(`\n  Trading Engine — ${timestamp} UTC`);
  console.log(`  ${"─".repeat(55)}`);

  // Load data
  const valRows = readCsv("daily-valuations.csv");
  const macroRows = readCsv("daily-macro.csv");
  const instrumentSnapshots = readInstrumentSnapshots();

  if (valRows.length === 0) {
    console.log("  No snapshot data found. Run market-scanner.ts --snapshot first.");
    return;
  }

  console.log(`  Data: ${valRows.length} valuation snapshots, ${macroRows.length} macro snapshots`);

  // Load state
  const portfolio = loadPortfolio();
  let learningParams = loadLearningParams();
  const weights = loadWeights();
  let hypotheses = loadHypotheses();
  const blockedSignals = loadBlockedSignals();
  const migrationNotes = migrateLegacyPolymarketPositions(portfolio, instrumentSnapshots);

  console.log(`  Portfolio: $${portfolio.cash.toFixed(2)} cash, ${portfolio.positions.length} open positions, $${portfolio.totalRealizedPnl.toFixed(4)} realized P&L`);
  console.log(`  Learnable params: macro24h>${learningParams.macroMomentum24hThresholdPts.toFixed(1)}, trend>${learningParams.contrarianTrendMarginPct.toFixed(2)}%, momentum>${learningParams.positiveMomentum24hPct.toFixed(2)}%, llm expiry=${learningParams.llmTradeExpiryDays}d, momentum expiry=${learningParams.momentumLongExpiryDays}d`);
  console.log(`  Risk params: HL funding ${formatTargetPct(learningParams.signalRisk.FUNDING_EXTREME_SHORT.targetPct)}/-${learningParams.signalRisk.FUNDING_EXTREME_SHORT.stopPct}, LLM ${formatTargetPct(learningParams.signalRisk.LLM_HYPOTHESIS.targetPct)}/-${learningParams.signalRisk.LLM_HYPOTHESIS.stopPct}, PM overvol ${formatTargetPct(learningParams.signalRisk.PM_IV_GT_OPT_IV.targetPct)}/-${learningParams.signalRisk.PM_IV_GT_OPT_IV.stopPct}`);
  for (const note of migrationNotes) console.log(`  ${note}`);

  // Regime check
  const regime = checkRegime(portfolio);
  if (regime.inDrawdown) {
    console.log(`  ⚠ DRAWDOWN MODE — win rate below 35% in last 20 trades. Position sizes halved.`);
  }

  // Step 1: Mark-to-market and close positions
  const latestRow = valRows[valRows.length - 1];
  const latestSnapshot = latestInstrumentSnapshot(instrumentSnapshots);
  const relativeValueRows = readRelativeValueObservations(30);
  const closedTrades = markToMarket(portfolio, latestRow, instrumentSnapshots);
  if (closedTrades.length > 0) {
    console.log(`\n  Closed ${closedTrades.length} positions:`);
    for (const t of closedTrades) {
      const emoji = t.pnl >= 0 ? "✅" : "❌";
      console.log(`    ${emoji} ${t.asset} ${t.direction} via ${t.venue}/${t.instrumentType ?? "legacy"} [${t.instrumentLabel ?? "n/a"}] → ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (${t.pnlPct.toFixed(1)}%)`);
      appendTradeCsv(t);
    }
  }

  const resolvedBlockedSignals = resolveBlockedSignalShadows(blockedSignals, latestRow, instrumentSnapshots);
  if (resolvedBlockedSignals.length > 0) {
    console.log(`\n  Resolved ${resolvedBlockedSignals.length} blocked-signal shadows:`);
    for (const shadow of resolvedBlockedSignals.slice(-6)) {
      const result = shadow.hypotheticalResult!;
      const emoji = result.outcome === "win" ? "✅" : "❌";
      const shadowLabel = shadow.blockedReason === "iv_downside_leg_untracked"
        ? "Missing downside leg"
        : shadow.blockedReason === "polymarket_proxy_short" ? "PM proxy short"
        : shadow.blockedReason === "relative_value_heatmap" ? "Relative-value heatmap"
        : shadow.blockedReason === "manual_shadow_trade" ? "Manual shadow" : "Blocked";
      console.log(`    ${emoji} ${shadowLabel}: ${shadow.signalType} ${shadow.asset} ${shadow.direction} via ${shadow.venue} would have ${result.closeReason}: ${result.pnlPct >= 0 ? "+" : ""}${result.pnlPct.toFixed(2)}%`);
    }
  }
  const newRelativeValueShadows = recordRelativeValueHeatmapShadows(relativeValueRows, latestRow, latestSnapshot, learningParams, blockedSignals);
  if (newRelativeValueShadows > 0) {
    console.log(`\n  Opened ${newRelativeValueShadows} relative-value heatmap shadow trades.`);
  }
  let proxyComparisonObs = updateProxyShortShadowComparisons(blockedSignals, [...readClosedTradeCsv(), ...closedTrades]);
  let blockedSummary = summarizeBlockedSignals(blockedSignals);
  let blockedObs = [...blockedSignalObservations(blockedSummary), ...proxyComparisonObs];
  for (const note of blockedObs) console.log(`  Shadow learning: ${note}`);

  // Step 2: Update signal weights
  let weightObs = updateWeights(weights, closedTrades);
  for (const o of weightObs) console.log(`  ${o}`);

  // Step 3: Evaluate hypotheses
  const hypothesisObs = evaluateHypotheses(hypotheses, valRows);
  for (const o of hypothesisObs) console.log(`  ${o}`);

  // Step 4: Statistical scan
  const statObs = statisticalScan(valRows, macroRows);
  if (statObs.length > 0) {
    console.log(`\n  Statistical observations (${statObs.length}):`);
    for (const o of statObs.slice(0, 5)) {
      console.log(`    [${o.type}] ${o.description}`);
    }
  }

  // Step 5: Generate rule-based signals
  const signals = generateSignals(valRows, macroRows, weights, learningParams, latestSnapshot, blockedSignals);
  proxyComparisonObs = updateProxyShortShadowComparisons(blockedSignals, [...readClosedTradeCsv(), ...closedTrades]);
  blockedSummary = summarizeBlockedSignals(blockedSignals);
  blockedObs = [...blockedSignalObservations(blockedSummary), ...proxyComparisonObs];
  console.log(`\n  Signals generated: ${signals.length}`);
  for (const s of signals.slice(0, 8)) {
    console.log(`    ${s.asset} ${s.direction} (${s.type}) confidence=${s.confidence.toFixed(3)} — ${s.thesis.slice(0, 70)}`);
  }

  // Step 6: LLM reasoning
  let llmJournal: string | null = null;
  if (!NO_LLM) {
    console.log(`\n  Calling LLM for pattern discovery...`);
    const journalTail = readJournalTail(40);
    const llmResult = await callLLM(valRows, macroRows, instrumentSnapshots, portfolio, learningParams, weights, hypotheses, statObs, closedTrades, blockedSummary, relativeValueRows, journalTail);

    if (llmResult) {
      console.log(`  LLM assessment: ${llmResult.marketAssessment.slice(0, 120)}`);
      const appliedUpdates = applyLearningParamUpdates(learningParams, llmResult.parameterUpdates);
      learningParams = appliedUpdates.next;
      for (const note of appliedUpdates.notes) {
        console.log(`    Param update: ${note}`);
      }

      const llmCloseInstructions: LlmTradeInstruction[] = [];

      // Add new hypotheses
      for (const nh of llmResult.newHypotheses ?? []) {
        const id = `H-${String(hypotheses.length + 1).padStart(3, "0")}`;
        hypotheses.push({
          id, created: nh.created, description: nh.description,
          conditions: nh.conditions, prediction: nh.prediction,
          timeframeDays: nh.timeframeDays, confidence: nh.confidence,
          tests: [{ date: new Date().toISOString().slice(0, 10), triggered: true, outcome: "pending", actualMove: "" }],
          winRate: 0, status: "active", promotedToSignal: false, postMortem: null,
          source: nh.source ?? "llm",
        });
        console.log(`    New hypothesis ${id}: ${nh.description.slice(0, 80)}`);
      }

      // Process hypothesis reviews
      for (const review of llmResult.hypothesisReviews ?? []) {
        const h = hypotheses.find((h) => h.id === review.id);
        if (h) {
          if (!h.postMortem) h.postMortem = review.observation;
          else h.postMortem += " | " + review.observation;
        }
      }

      // Add LLM-suggested trades as signals
      for (const lt of llmResult.trades ?? []) {
        if (!isValidVenue(lt.venue)) {
          console.log(`    Skipping invalid LLM venue for ${lt.asset}: ${String(lt.venue)}`);
          continue;
        }
        if (lt.action === "close") {
          if (lt.direction !== "long" && lt.direction !== "short" && lt.direction !== "any") {
            console.log(`    Skipping invalid LLM close direction for ${lt.asset}: ${String(lt.direction)}`);
            continue;
          }
          llmCloseInstructions.push(lt);
          continue;
        }
        if (lt.direction !== "long" && lt.direction !== "short") {
          console.log(`    Skipping invalid LLM trade direction for ${lt.asset}: ${String(lt.direction)}`);
          continue;
        }
        if (lt.action !== "buy" && lt.action !== "sell") {
          console.log(`    Skipping unsupported LLM trade action for ${lt.asset}: ${String(lt.action)}`);
          continue;
        }
        const price =
          lt.venue === "hyperliquid"
            ? getHyperliquidPerpPrice(latestRow, lt.asset)
            : getAssetPrice(latestRow, lt.asset);
        if (!price) continue;
        const risk = riskForSignal(learningParams, "LLM_HYPOTHESIS");
        const signal = finalizeSignal({
          type: "LLM_HYPOTHESIS", asset: lt.asset,
          venue: lt.venue as Signal["venue"], direction: lt.direction,
          strength: 0.5, confidence: 0.4,
          thesis: `[LLM] ${lt.thesis}`,
          hypothesisId: null, entryPrice: price,
          targetPct: risk.targetPct, stopPct: risk.stopPct, expiryDays: 7,
          leverage: lt.venue === "hyperliquid" ? 1 : undefined,
          contractHint: lt.venue === "polymarket"
            ? { preferredDirection: inferPolymarketPreferredDirection(lt.direction, "LLM_HYPOTHESIS", lt.thesis) }
            : undefined,
        }, valRows, learningParams, { latestRow, latestSnapshot, blockedSignals });
        if (signal) signals.push(signal);
      }

      const llmClosedTrades = closePositionsFromLlm(portfolio, llmCloseInstructions, latestRow, instrumentSnapshots);
      if (llmClosedTrades.length > 0) {
        console.log(`\n  LLM closed ${llmClosedTrades.length} positions:`);
        for (const t of llmClosedTrades) {
          const emoji = t.pnl >= 0 ? "✅" : "❌";
          console.log(`    ${emoji} ${t.asset} ${t.direction} via ${t.venue}/${t.instrumentType ?? "legacy"} [${t.instrumentLabel ?? "n/a"}] → ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (${t.pnlPct.toFixed(1)}%)`);
          appendTradeCsv(t);
          closedTrades.push(t);
        }
        weightObs = [...weightObs, ...updateWeights(weights, llmClosedTrades)];
      }

      llmJournal = llmResult.journalEntry;
      proxyComparisonObs = updateProxyShortShadowComparisons(blockedSignals, [...readClosedTradeCsv(), ...closedTrades]);
      blockedSummary = summarizeBlockedSignals(blockedSignals);
      blockedObs = [...blockedSignalObservations(blockedSummary), ...proxyComparisonObs];
    }
  }

  // Step 7: Open new positions
  if (!DRY_RUN) {
    const sortedSignals = signals.sort((a, b) => b.confidence - a.confidence);
    const opened = openPositions(portfolio, sortedSignals, latestRow, instrumentSnapshots, learningParams, blockedSignals);
    if (opened.length > 0) {
      console.log(`\n  Opened ${opened.length} new positions:`);
      for (const p of opened) {
        console.log(`    ${p.asset} ${p.direction} @ $${p.entryPrice} via ${p.venue}/${p.instrumentType ?? "legacy"} [${p.instrumentLabel ?? "n/a"}] (${p.signalType})`);
      }
    }

    // Step 8: Write journal entry
    writeJournalEntry(closedTrades, opened, weightObs, hypothesisObs, statObs, blockedObs, blockedSummary, llmJournal, portfolio);

    // Step 9: Save all state
    savePortfolio(portfolio);
    saveWeights(weights);
    saveHypotheses(hypotheses);
    saveLearningParams(learningParams);
    saveBlockedSignals(blockedSignals);
  }

  // Summary
  const totalValue = portfolio.cash + portfolio.positions.length * TRADE_SIZE;
  const unrealized = portfolio.positions.reduce((s, p) => s + estimateOpenPositionPnl(p), 0);

  console.log(`\n  ${"─".repeat(55)}`);
  console.log(`  Portfolio Summary:`);
  console.log(`    Cash:           $${portfolio.cash.toFixed(2)}`);
  console.log(`    Open positions: ${portfolio.positions.length}`);
  console.log(`    Unrealized P&L: $${unrealized.toFixed(4)}`);
  console.log(`    Realized P&L:   $${portfolio.totalRealizedPnl.toFixed(4)}`);
  console.log(`    Total value:    ~$${(totalValue + unrealized).toFixed(2)}`);
  console.log(`    Win rate:       ${portfolio.totalTrades > 0 ? ((portfolio.winCount / portfolio.totalTrades) * 100).toFixed(0) : "N/A"}% (${portfolio.totalTrades} trades)`);
  console.log(`    Active signals: ${weights.filter((w) => w.enabled).length}/${weights.length}`);
  console.log(`    Hypotheses:     ${hypotheses.filter((h) => h.status === "active").length} active, ${hypotheses.filter((h) => h.status === "promoted").length} promoted, ${hypotheses.filter((h) => h.status === "killed").length} killed`);
  console.log(`  ${"─".repeat(55)}\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
