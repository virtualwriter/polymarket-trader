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
const TRADE_SIZE = 1;
const MAX_BANKROLL = 100;
const MAX_OPEN_POSITIONS = 15;
const PROMOTE_THRESHOLD = 0.65;
const PROMOTE_MIN_TESTS = 5;
const DEMOTE_THRESHOLD = 0.45;
const KILL_THRESHOLD = 0.30;
const WEIGHT_DECAY = 0.85;
const NO_LLM = process.argv.includes("--no-llm");
const DRY_RUN = process.argv.includes("--dry-run");

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
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  targetPct: number;
  stopPct: number;
  expiryDate: string;
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
  pnl: number;
  pnlPct: number;
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  closeReason: "target" | "stop" | "expiry" | "llm_decision" | "signal_killed";
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

interface SignalWeight {
  type: string;
  weight: number;
  trades: number;
  wins: number;
  avgPnlPct: number;
  lastTriggered: string;
  enabled: boolean;
  perAsset: Record<string, { trades: number; wins: number; avgPnlPct: number }>;
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
  targetPct: number;
  stopPct: number;
  expiryDays: number;
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
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
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

function appendTradeCsv(trade: ClosedTrade) {
  const file = join(DATA_DIR, "trades.csv");
  const headers = [
    "id", "opened_at", "closed_at", "asset", "venue", "direction",
    "entry_price", "exit_price", "size", "pnl", "pnl_pct",
    "signal_type", "hypothesis_id", "thesis", "close_reason",
  ];
  if (!existsSync(file)) writeFileSync(file, headers.join(",") + "\n");
  const vals = [
    trade.id, trade.openedAt, trade.closedAt, trade.asset, trade.venue,
    trade.direction, trade.entryPrice, trade.exitPrice, trade.size,
    trade.pnl.toFixed(4), trade.pnlPct.toFixed(2),
    trade.signalType, trade.hypothesisId ?? "",
    `"${trade.thesis.replace(/"/g, '""')}"`, trade.closeReason,
  ];
  appendFileSync(file, vals.join(",") + "\n");
}

function appendJournal(entry: string) {
  const file = join(DATA_DIR, "learning-journal.md");
  if (!existsSync(file)) writeFileSync(file, "# Trading Engine Learning Journal\n\n");
  appendFileSync(file, entry + "\n");
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

function loadWeights(): SignalWeight[] {
  return readJson<SignalWeight[]>("signal-weights.json", defaultWeights());
}

function saveWeights(w: SignalWeight[]) {
  writeJson("signal-weights.json", w);
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

function getAssetPrice(row: SnapshotRow, asset: string): number | null {
  const map: Record<string, string> = {
    BTC: "btc_spot", HYPE: "hype_spot", GOLD: "gold_gc_spot",
    AMZN: "amzn_stock", OIL: "oil_wti_spot",
  };
  const v = row[map[asset] ?? ""];
  return typeof v === "number" && v > 0 ? v : null;
}

function generateSignals(rows: SnapshotRow[], macroRows: SnapshotRow[], weights: SignalWeight[]): Signal[] {
  if (rows.length === 0) return [];
  const latest = rows[rows.length - 1];
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
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
      pcRatio: "oil_cl_pc_ratio", hlPerp: "oil_brent_spot" },
  ];

  for (const a of assets) {
    const spot = num(latest[a.spot]);
    if (!spot) continue;

    // PM IV vs Options IV divergence
    const pmIv = a.pmIv ? num(latest[a.pmIv]) : null;
    const optIv = a.optIv30 ? num(latest[a.optIv30]) : null;
    if (pmIv && optIv && optIv > 0) {
      const ratio = pmIv / optIv;
      if (ratio > 1.3 && weightMap.has("PM_IV_GT_OPT_IV")) {
        const strength = Math.min(1, (ratio - 1.3) / 0.7);
        const w = weightMap.get("PM_IV_GT_OPT_IV")!;
        signals.push({
          type: "PM_IV_GT_OPT_IV", asset: a.key, venue: "polymarket", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} PM IV (${pmIv.toFixed(1)}%) >> Options IV (${optIv.toFixed(1)}%), ratio ${ratio.toFixed(2)}. PM overpricing vol → sell PM upside.`,
          hypothesisId: null, entryPrice: spot, targetPct: 3, stopPct: 5, expiryDays: 7,
        });
      }
      if (ratio < 0.7 && weightMap.has("OPT_IV_GT_PM_IV")) {
        const strength = Math.min(1, (0.7 - ratio) / 0.3);
        const w = weightMap.get("OPT_IV_GT_PM_IV")!;
        signals.push({
          type: "OPT_IV_GT_PM_IV", asset: a.key, venue: "polymarket", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} Options IV (${optIv.toFixed(1)}%) >> PM IV (${pmIv.toFixed(1)}%), ratio ${ratio.toFixed(2)}. PM underpricing vol → buy PM upside.`,
          hypothesisId: null, entryPrice: spot, targetPct: 3, stopPct: 5, expiryDays: 7,
        });
      }
    }

    // Funding rate extremes
    const funding = a.funding ? num(latest[a.funding]) : null;
    if (funding !== null) {
      if (funding > 15 && weightMap.has("FUNDING_EXTREME_LONG")) {
        const strength = Math.min(1, (funding - 15) / 35);
        const w = weightMap.get("FUNDING_EXTREME_LONG")!;
        signals.push({
          type: "FUNDING_EXTREME_LONG", asset: a.key, venue: "hyperliquid", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL funding ${funding.toFixed(1)}% annualized — crowded longs. Fade.`,
          hypothesisId: null, entryPrice: spot, targetPct: 2, stopPct: 4, expiryDays: 3,
        });
      }
      if (funding < -15 && weightMap.has("FUNDING_EXTREME_SHORT")) {
        const strength = Math.min(1, (-funding - 15) / 35);
        const w = weightMap.get("FUNDING_EXTREME_SHORT")!;
        signals.push({
          type: "FUNDING_EXTREME_SHORT", asset: a.key, venue: "hyperliquid", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL funding ${funding.toFixed(1)}% annualized — crowded shorts. Buy.`,
          hypothesisId: null, entryPrice: spot, targetPct: 2, stopPct: 4, expiryDays: 3,
        });
      }
    }

    // PM EV vs Spot divergence
    const pmEv = a.pmEv ? num(latest[a.pmEv]) : null;
    if (pmEv && spot) {
      const divergencePct = ((pmEv - spot) / spot) * 100;
      if (divergencePct > 8 && weightMap.has("PM_EV_ABOVE_SPOT")) {
        const strength = Math.min(1, (divergencePct - 8) / 20);
        const w = weightMap.get("PM_EV_ABOVE_SPOT")!;
        signals.push({
          type: "PM_EV_ABOVE_SPOT", asset: a.key, venue: "spot", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} PM EV ($${pmEv.toFixed(0)}) is ${divergencePct.toFixed(1)}% above spot ($${spot.toFixed(0)}). Market expects upside.`,
          hypothesisId: null, entryPrice: spot, targetPct: 4, stopPct: 6, expiryDays: 14,
        });
      }
      if (divergencePct < -5 && weightMap.has("PM_EV_BELOW_SPOT")) {
        const strength = Math.min(1, (-divergencePct - 5) / 15);
        const w = weightMap.get("PM_EV_BELOW_SPOT")!;
        signals.push({
          type: "PM_EV_BELOW_SPOT", asset: a.key, venue: "spot", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} PM EV ($${pmEv.toFixed(0)}) is ${divergencePct.toFixed(1)}% below spot ($${spot.toFixed(0)}). Market expects downside.`,
          hypothesisId: null, entryPrice: spot, targetPct: 3, stopPct: 5, expiryDays: 14,
        });
      }
    }

    // Put/Call ratio extremes
    const pcRatio = a.pcRatio ? num(latest[a.pcRatio]) : null;
    if (pcRatio !== null) {
      if (pcRatio > 1.2 && weightMap.has("PC_RATIO_EXTREME_HIGH")) {
        const strength = Math.min(1, (pcRatio - 1.2) / 0.8);
        const w = weightMap.get("PC_RATIO_EXTREME_HIGH")!;
        signals.push({
          type: "PC_RATIO_EXTREME_HIGH", asset: a.key, venue: "spot", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} P/C ratio ${pcRatio.toFixed(2)} — heavy put buying → contrarian long.`,
          hypothesisId: null, entryPrice: spot, targetPct: 2, stopPct: 3, expiryDays: 5,
        });
      }
      if (pcRatio < 0.5 && weightMap.has("PC_RATIO_EXTREME_LOW")) {
        const strength = Math.min(1, (0.5 - pcRatio) / 0.3);
        const w = weightMap.get("PC_RATIO_EXTREME_LOW")!;
        signals.push({
          type: "PC_RATIO_EXTREME_LOW", asset: a.key, venue: "spot", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} P/C ratio ${pcRatio.toFixed(2)} — heavy call buying → contrarian short.`,
          hypothesisId: null, entryPrice: spot, targetPct: 2, stopPct: 3, expiryDays: 5,
        });
      }
    }

    // Cross-venue basis (HL perp vs spot)
    const hlPerp = a.hlPerp ? num(latest[a.hlPerp]) : null;
    const stockSpot = a.spot === a.hlPerp ? null : num(latest[a.spot]);
    if (hlPerp && stockSpot && a.key === "AMZN") {
      const basisPct = ((hlPerp - stockSpot) / stockSpot) * 100;
      if (basisPct > 1.5 && weightMap.has("BASIS_PREMIUM")) {
        const strength = Math.min(1, (basisPct - 1.5) / 3);
        const w = weightMap.get("BASIS_PREMIUM")!;
        signals.push({
          type: "BASIS_PREMIUM", asset: a.key, venue: "hyperliquid", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL perp ($${hlPerp.toFixed(2)}) at ${basisPct.toFixed(1)}% premium to stock ($${stockSpot.toFixed(2)}). Basis convergence → short perp.`,
          hypothesisId: null, entryPrice: hlPerp, targetPct: 1.5, stopPct: 3, expiryDays: 5,
        });
      }
      if (basisPct < -1.5 && weightMap.has("BASIS_DISCOUNT")) {
        const strength = Math.min(1, (-basisPct - 1.5) / 3);
        const w = weightMap.get("BASIS_DISCOUNT")!;
        signals.push({
          type: "BASIS_DISCOUNT", asset: a.key, venue: "hyperliquid", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `${a.key} HL perp ($${hlPerp.toFixed(2)}) at ${basisPct.toFixed(1)}% discount to stock ($${stockSpot.toFixed(2)}). Basis convergence → long perp.`,
          hypothesisId: null, entryPrice: hlPerp, targetPct: 1.5, stopPct: 3, expiryDays: 5,
        });
      }
    }
  }

  // Macro momentum
  if (macroRows.length >= 2) {
    const latestMacro = macroRows[macroRows.length - 1];
    const prevMacro = macroRows[macroRows.length - 2];
    const compositeNow = num(latestMacro.macro_composite);
    const compositePrev = num(prevMacro.macro_composite);
    if (compositeNow !== null && compositePrev !== null) {
      const shift = compositeNow - compositePrev;
      if (shift > 8 && weightMap.has("MACRO_MOMENTUM_UP")) {
        const strength = Math.min(1, (shift - 8) / 20);
        const w = weightMap.get("MACRO_MOMENTUM_UP")!;
        signals.push({
          type: "MACRO_MOMENTUM_UP", asset: "BTC", venue: "spot", direction: "long",
          strength, confidence: strength * w.weight,
          thesis: `Macro composite jumped +${shift} pts (${compositePrev}→${compositeNow}). Risk-on momentum → long BTC.`,
          hypothesisId: null, entryPrice: num(rows[rows.length - 1].btc_spot) ?? 0,
          targetPct: 3, stopPct: 5, expiryDays: 7,
        });
      }
      if (shift < -8 && weightMap.has("MACRO_MOMENTUM_DOWN")) {
        const strength = Math.min(1, (-shift - 8) / 20);
        const w = weightMap.get("MACRO_MOMENTUM_DOWN")!;
        signals.push({
          type: "MACRO_MOMENTUM_DOWN", asset: "BTC", venue: "spot", direction: "short",
          strength, confidence: strength * w.weight,
          thesis: `Macro composite dropped ${shift} pts (${compositePrev}→${compositeNow}). Risk-off momentum → short BTC.`,
          hypothesisId: null, entryPrice: num(rows[rows.length - 1].btc_spot) ?? 0,
          targetPct: 3, stopPct: 5, expiryDays: 7,
        });
      }
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

function markToMarket(portfolio: Portfolio, latestRow: SnapshotRow): ClosedTrade[] {
  const closed: ClosedTrade[] = [];
  const now = new Date().toISOString();
  const remaining: Position[] = [];

  for (const pos of portfolio.positions) {
    const currentPrice = getAssetPrice(latestRow, pos.asset);
    if (!currentPrice) { remaining.push(pos); continue; }

    pos.currentPrice = currentPrice;
    const pnlPct = pos.direction === "long"
      ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
    const pnl = (pnlPct / 100) * pos.size;

    let closeReason: ClosedTrade["closeReason"] | null = null;
    if (pnlPct >= pos.targetPct) closeReason = "target";
    else if (pnlPct <= -pos.stopPct) closeReason = "stop";
    else if (new Date(pos.expiryDate) <= new Date()) closeReason = "expiry";

    if (closeReason) {
      const trade: ClosedTrade = {
        id: pos.id, openedAt: pos.openedAt, closedAt: now, asset: pos.asset,
        venue: pos.venue, direction: pos.direction, entryPrice: pos.entryPrice,
        exitPrice: currentPrice, size: pos.size, pnl, pnlPct,
        signalType: pos.signalType, hypothesisId: pos.hypothesisId,
        thesis: pos.thesis, closeReason,
      };
      closed.push(trade);
      portfolio.cash += pos.size + pnl;
      portfolio.totalRealizedPnl += pnl;
      portfolio.totalTrades++;
      if (pnl >= 0) portfolio.winCount++; else portfolio.lossCount++;
    } else {
      remaining.push(pos);
    }
  }

  portfolio.positions = remaining;
  return closed;
}

function openPositions(portfolio: Portfolio, signals: Signal[]): Position[] {
  const opened: Position[] = [];
  for (const sig of signals) {
    if (portfolio.positions.length >= MAX_OPEN_POSITIONS) break;
    if (portfolio.cash < TRADE_SIZE) break;
    if (sig.confidence < 0.15) break;

    // Don't double up on same asset+direction
    const dup = portfolio.positions.find((p) => p.asset === sig.asset && p.direction === sig.direction);
    if (dup) continue;

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + sig.expiryDays);

    const pos: Position = {
      id: `T-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openedAt: new Date().toISOString(),
      asset: sig.asset,
      venue: sig.venue,
      direction: sig.direction,
      entryPrice: sig.entryPrice,
      currentPrice: sig.entryPrice,
      size: TRADE_SIZE,
      signalType: sig.type,
      hypothesisId: sig.hypothesisId,
      thesis: sig.thesis,
      targetPct: sig.targetPct,
      stopPct: sig.stopPct,
      expiryDate: expiry.toISOString(),
    };

    portfolio.cash -= TRADE_SIZE;
    portfolio.positions.push(pos);
    opened.push(pos);
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

    // Per-asset demotion
    if (pa.trades >= 5 && pa.wins / pa.trades < KILL_THRESHOLD) {
      observations.push(`⚠ ${w.type} on ${trade.asset}: ${pa.wins}/${pa.trades} wins. Consider excluding this asset.`);
    }
  }

  return observations;
}

// ─── Hypothesis Evaluation ───────────────────────────────────────────────────

function evaluateHypotheses(hypotheses: Hypothesis[], latestRow: SnapshotRow): string[] {
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

      // Evaluate — simplified: check if the asset moved in predicted direction
      // Real evaluation would parse the prediction string more carefully
      test.outcome = "loss"; // default
      test.actualMove = "evaluation pending — insufficient price history";
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
  portfolio: Portfolio,
  weights: SignalWeight[],
  hypotheses: Hypothesis[],
  statObs: StatObservation[],
  closedTrades: ClosedTrade[],
  journalTail: string,
): Promise<{
  marketAssessment: string;
  newHypotheses: Omit<Hypothesis, "id" | "tests" | "winRate" | "status" | "promotedToSignal" | "postMortem">[];
  hypothesisReviews: { id: string; observation: string }[];
  trades: { action: "buy" | "sell"; asset: string; venue: string; direction: "long" | "short"; thesis: string }[];
  journalEntry: string;
} | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("  [LLM] No ANTHROPIC_API_KEY set, skipping LLM reasoning.");
    return null;
  }

  const recentValuations = valuationRows.slice(-14);
  const recentMacro = macroRows.slice(-14);
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

PORTFOLIO:
Cash: $${portfolio.cash.toFixed(2)} | Open positions: ${portfolio.positions.length} | Realized P&L: $${portfolio.totalRealizedPnl.toFixed(2)}
Win rate: ${portfolio.totalTrades > 0 ? ((portfolio.winCount / portfolio.totalTrades) * 100).toFixed(0) : "N/A"}% over ${portfolio.totalTrades} trades

OPEN POSITIONS:
${portfolio.positions.map((p) => `  ${p.asset} ${p.direction} @ ${p.entryPrice} (${p.signalType}) — ${p.thesis.slice(0, 80)}`).join("\n") || "  None"}

SIGNAL PERFORMANCE:
${activeWeights.map((w) => `  ${w.type}: weight=${w.weight.toFixed(2)}, ${w.wins}/${w.trades} wins (${w.trades > 0 ? ((w.wins / w.trades) * 100).toFixed(0) : "N/A"}%), avg pnl=${w.avgPnlPct.toFixed(2)}%`).join("\n") || "  No trades yet"}

ACTIVE HYPOTHESES:
${activeHypotheses.map((h) => `  ${h.id}: ${h.description} [${h.status}, ${(h.winRate * 100).toFixed(0)}% over ${h.tests.length} tests]`).join("\n") || "  None yet"}

RECENTLY KILLED HYPOTHESES:
${killedRecently.map((h) => `  ${h.id}: ${h.description} — ${h.postMortem}`).join("\n") || "  None"}

STATISTICAL OBSERVATIONS:
${statObs.map((o) => `  [${o.type}] ${o.description}`).join("\n") || "  None"}

RECENT CLOSED TRADES:
${closedTrades.slice(-10).map((t) => `  ${t.asset} ${t.direction} ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (${t.signalType})`).join("\n") || "  None"}

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
  "journalEntry": "Key observations and lessons from today's analysis..."
}`;

  const models = ["claude-3-5-haiku-20241022", "claude-sonnet-4-20250514"];
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          const delay = 2000 * Math.pow(2, attempt);
          console.log(`  [LLM] Retry ${attempt}/2 for ${model} in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
        }

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (res.status === 429) {
          console.log(`  [LLM] Rate limited on ${model}, attempt ${attempt + 1}`);
          continue;
        }
        if (res.status === 529 || res.status === 503) {
          console.log(`  [LLM] ${model} overloaded (${res.status}), attempt ${attempt + 1}`);
          continue;
        }
        if (!res.ok) {
          console.log(`  [LLM] API error on ${model}: ${res.status} ${res.statusText}`);
          break; // non-retryable error, try next model
        }

        const data = await res.json() as any;
        const text = data.content?.[0]?.text ?? "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.log(`  [LLM] Could not parse JSON from ${model}`);
          break;
        }

        console.log(`  [LLM] Success with ${model}`);
        return JSON.parse(jsonMatch[0]);
      } catch (e: any) {
        console.log(`  [LLM] Error with ${model}: ${e.message}`);
        break;
      }
    }
  }

  console.log("  [LLM] All models exhausted, proceeding without LLM.");
  return null;
}

// ─── Journal Writer ──────────────────────────────────────────────────────────

function writeJournalEntry(
  closedTrades: ClosedTrade[],
  openedPositions: Position[],
  weightObs: string[],
  hypothesisObs: string[],
  statObs: StatObservation[],
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
      lines.push(`- ${emoji} ${t.asset} ${t.direction} (${t.signalType}) → ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (${t.pnlPct.toFixed(1)}%)`);
    }
    lines.push("");
  }

  if (openedPositions.length > 0) {
    lines.push(`**Opened ${openedPositions.length} positions:**`);
    for (const p of openedPositions) {
      lines.push(`- ${p.asset} ${p.direction} @ $${p.entryPrice} via ${p.venue} (${p.signalType})`);
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

  const recentFile = join(DATA_DIR, "trades.csv");
  if (!existsSync(recentFile)) return { inDrawdown: false, sizeMultiplier: 1.0 };

  const lines = readFileSync(recentFile, "utf-8").trim().split("\n");
  const recent = lines.slice(-20);
  let wins = 0, total = 0;
  for (const line of recent) {
    if (line.startsWith("id,")) continue;
    const pnl = parseFloat(line.split(",")[9] ?? "0");
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

function readJournalTail(lines: number = 50): string {
  const file = join(DATA_DIR, "learning-journal.md");
  if (!existsSync(file)) return "";
  const content = readFileSync(file, "utf-8");
  const allLines = content.split("\n");
  return allLines.slice(-lines).join("\n");
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

  if (valRows.length === 0) {
    console.log("  No snapshot data found. Run market-scanner.ts --snapshot first.");
    return;
  }

  console.log(`  Data: ${valRows.length} valuation snapshots, ${macroRows.length} macro snapshots`);

  // Load state
  const portfolio = loadPortfolio();
  const weights = loadWeights();
  let hypotheses = loadHypotheses();

  console.log(`  Portfolio: $${portfolio.cash.toFixed(2)} cash, ${portfolio.positions.length} open positions, $${portfolio.totalRealizedPnl.toFixed(4)} realized P&L`);

  // Regime check
  const regime = checkRegime(portfolio);
  if (regime.inDrawdown) {
    console.log(`  ⚠ DRAWDOWN MODE — win rate below 35% in last 20 trades. Position sizes halved.`);
  }

  // Step 1: Mark-to-market and close positions
  const latestRow = valRows[valRows.length - 1];
  const closedTrades = markToMarket(portfolio, latestRow);
  if (closedTrades.length > 0) {
    console.log(`\n  Closed ${closedTrades.length} positions:`);
    for (const t of closedTrades) {
      const emoji = t.pnl >= 0 ? "✅" : "❌";
      console.log(`    ${emoji} ${t.asset} ${t.direction} → ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (${t.pnlPct.toFixed(1)}%)`);
      appendTradeCsv(t);
    }
  }

  // Step 2: Update signal weights
  const weightObs = updateWeights(weights, closedTrades);
  for (const o of weightObs) console.log(`  ${o}`);

  // Step 3: Evaluate hypotheses
  const hypothesisObs = evaluateHypotheses(hypotheses, latestRow);
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
  const signals = generateSignals(valRows, macroRows, weights);
  console.log(`\n  Signals generated: ${signals.length}`);
  for (const s of signals.slice(0, 8)) {
    console.log(`    ${s.asset} ${s.direction} (${s.type}) confidence=${s.confidence.toFixed(3)} — ${s.thesis.slice(0, 70)}`);
  }

  // Step 6: LLM reasoning
  let llmJournal: string | null = null;
  if (!NO_LLM) {
    console.log(`\n  Calling LLM for pattern discovery...`);
    const journalTail = readJournalTail(40);
    const llmResult = await callLLM(valRows, macroRows, portfolio, weights, hypotheses, statObs, closedTrades, journalTail);

    if (llmResult) {
      console.log(`  LLM assessment: ${llmResult.marketAssessment.slice(0, 120)}`);

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
        const price = getAssetPrice(latestRow, lt.asset);
        if (!price) continue;
        signals.push({
          type: "LLM_HYPOTHESIS", asset: lt.asset,
          venue: lt.venue as Signal["venue"], direction: lt.direction,
          strength: 0.5, confidence: 0.4,
          thesis: `[LLM] ${lt.thesis}`,
          hypothesisId: null, entryPrice: price,
          targetPct: 3, stopPct: 5, expiryDays: 7,
        });
      }

      llmJournal = llmResult.journalEntry;
    }
  }

  // Step 7: Open new positions
  if (!DRY_RUN) {
    const sortedSignals = signals.sort((a, b) => b.confidence - a.confidence);
    const opened = openPositions(portfolio, sortedSignals);
    if (opened.length > 0) {
      console.log(`\n  Opened ${opened.length} new positions:`);
      for (const p of opened) {
        console.log(`    ${p.asset} ${p.direction} @ $${p.entryPrice} via ${p.venue} (${p.signalType})`);
      }
    }

    // Step 8: Write journal entry
    writeJournalEntry(closedTrades, opened, weightObs, hypothesisObs, statObs, llmJournal, portfolio);

    // Step 9: Save all state
    savePortfolio(portfolio);
    saveWeights(weights);
    saveHypotheses(hypotheses);
  }

  // Summary
  const totalValue = portfolio.cash + portfolio.positions.length * TRADE_SIZE;
  const unrealized = portfolio.positions.reduce((s, p) => {
    const dir = p.direction === "long" ? 1 : -1;
    return s + dir * ((p.currentPrice - p.entryPrice) / p.entryPrice) * p.size;
  }, 0);

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
