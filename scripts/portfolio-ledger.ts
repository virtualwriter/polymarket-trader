/**
 * Shared portfolio ledger utilities.
 *
 * Single source of truth for:
 *  - the operationally-tainted trade ID list (loaded from
 *    data/operationally-tainted-trades.json),
 *  - what counts as a contaminated trade (tainted IDs + data-quality
 *    artifact close reasons + NON_LEARNING_CLOSE thesis tags),
 *  - dedupe-by-id + artifact-filter of trades-detailed.csv,
 *  - recomputation of portfolio counters (totalRealizedPnl,
 *    totalTrades, winCount, lossCount) from that cleaned ledger.
 *
 * Imported by trading-engine.ts, position-exit-scanner.ts, and
 * trader-performance-report.ts so all three services share one
 * accounting definition. Drift between accumulator-style counters
 * and the cleaned ledger is the bug this module exists to prevent.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DATA_DIR = join(ROOT, "data");
const TAINTED_FILE = join(DATA_DIR, "operationally-tainted-trades.json");
const TRADES_CSV = join(DATA_DIR, "trades-detailed.csv");

export interface LedgerTrade {
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

export interface PortfolioTotals {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  totalRealizedPnl: number;
}

let cachedTainted: Record<string, string> | null = null;

export function loadOperationallyTaintedTrades(): Record<string, string> {
  if (cachedTainted) return cachedTainted;
  if (!existsSync(TAINTED_FILE)) {
    cachedTainted = {};
    return cachedTainted;
  }
  try {
    const parsed = JSON.parse(readFileSync(TAINTED_FILE, "utf-8")) as Record<string, string>;
    cachedTainted = parsed ?? {};
  } catch {
    cachedTainted = {};
  }
  return cachedTainted;
}

export function operationallyTaintedTradeIds(): Set<string> {
  return new Set(Object.keys(loadOperationallyTaintedTrades()));
}

export interface ContaminationInput {
  id: string;
  closeReason?: string | null;
  signalType?: string | null;
  instrumentType?: string | null;
  thesis?: string | null;
}

export function isContaminatedTrade(trade: ContaminationInput): boolean {
  const tainted = loadOperationallyTaintedTrades();
  if (trade.id && tainted[trade.id]) return true;
  if (trade.signalType === "MONOTONIC_ARB" && trade.instrumentType !== "pm_package") return true;
  const reason = trade.closeReason ?? "";
  if (reason === "data_quality_artifact") return true;
  if (reason.includes("DATA_CORRECTION_ARTIFACT")) return true;
  const thesis = trade.thesis ?? "";
  if (thesis.includes("NON_LEARNING_CLOSE")) return true;
  return false;
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

export function readLedgerTrades(csvPath: string = TRADES_CSV): LedgerTrade[] {
  if (!existsSync(csvPath)) return [];
  const lines = readFileSync(csvPath, "utf-8").split("\n").filter((line) => line.trim());
  const [headerLine, ...rows] = lines;
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine);
  const trades: LedgerTrade[] = [];
  for (const line of rows) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ""]));
    if (!row.id || !row.closed_at) continue;
    trades.push({
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
    });
  }
  return trades;
}

function closedAtMs(t: LedgerTrade): number {
  const ms = new Date(t.closedAt).getTime();
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

export function dedupeLedgerTrades(trades: LedgerTrade[]): LedgerTrade[] {
  const byId = new Map<string, LedgerTrade>();
  for (const trade of trades) {
    const existing = byId.get(trade.id);
    if (!existing || closedAtMs(trade) < closedAtMs(existing)) {
      byId.set(trade.id, trade);
    }
  }
  return [...byId.values()].sort((a, b) =>
    new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime() ||
    closedAtMs(a) - closedAtMs(b) ||
    a.id.localeCompare(b.id),
  );
}

export function cleanLedgerTrades(csvPath: string = TRADES_CSV): LedgerTrade[] {
  const raw = readLedgerTrades(csvPath);
  const deduped = dedupeLedgerTrades(raw);
  return deduped.filter((t) => !isContaminatedTrade(t));
}

export function recomputePortfolioTotalsFromLedger(
  csvPath: string = TRADES_CSV,
): PortfolioTotals {
  const trades = cleanLedgerTrades(csvPath);
  let totalRealizedPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  for (const t of trades) {
    const pnl = Number.isFinite(t.pnl) ? t.pnl : 0;
    totalRealizedPnl += pnl;
    if (pnl >= 0) winCount++;
    else lossCount++;
  }
  return {
    totalTrades: trades.length,
    winCount,
    lossCount,
    totalRealizedPnl,
  };
}

export function __resetTaintedCacheForTests(): void {
  cachedTainted = null;
}
