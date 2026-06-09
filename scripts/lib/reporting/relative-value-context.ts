import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readCsvRecords } from "./csv.js";
import { fmtModelValue, fmtPriceValue } from "./format.js";
import { normalCdf } from "./math.js";
import { safeNumber } from "./number.js";
import { parseHeatmapTimestamp, parseTimestamp } from "./time.js";

const ONE_TOUCH_TERMINAL_ONLY_SIGMA = 1.5;

export interface RelativeValuePosition {
  instrumentId?: string;
}

export interface RelativeValueRowMatch {
  row?: Record<string, string>;
  source: "snapshot" | "history_exact" | "history_nearest" | "missing";
  timestamp: Date | null;
  distanceHours: number | null;
}

export function readRelativeValueRowsFromFile(file: string): Map<string, Record<string, string>> {
  if (!existsSync(file)) return new Map();
  return readRelativeValueCsv(file);
}

function readRelativeValueCsv(file: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const row of readCsvRecords(file)) {
    if (row.event_slug && row.market_id) map.set(`${row.event_slug}::${row.market_id}`, row);
  }
  return map;
}

export function relativeValueKey(position?: RelativeValuePosition): string | null {
  if (!position?.instrumentId) return null;
  const [eventSlug, marketId] = position.instrumentId.split("::");
  return eventSlug && marketId ? `${eventSlug}::${marketId}` : null;
}

function relativeValueHistoryFiles(historyDirs: readonly string[], currentFile: string): string[] {
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
  for (const dir of historyDirs) visit(dir);
  if (existsSync(currentFile)) files.add(currentFile);
  return [...files].sort();
}

export function readRelativeValueHistoryRowsFromDirs(
  historyDirs: readonly string[],
  currentFile: string,
): Map<string, Array<{ timestamp: Date; row: Record<string, string> }>> {
  const byKey = new Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>();
  for (const file of relativeValueHistoryFiles(historyDirs, currentFile)) {
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

export function rowTimestamp(row: Record<string, string> | undefined): Date | null {
  return row ? parseHeatmapTimestamp(row.timestamp) : null;
}

export function hoursBetween(a: Date | null, b: Date | null): number | null {
  return a && b ? Math.abs(a.getTime() - b.getTime()) / 3_600_000 : null;
}

export function fmtHours(value: number | null): string {
  return value === null ? "" : value.toFixed(2);
}

export function relativeValueEntryMatch(
  historyRows: Map<string, Array<{ timestamp: Date; row: Record<string, string> }>>,
  position: RelativeValuePosition | undefined,
  openedAt: string | undefined,
  snapshotRow?: Record<string, string>,
): RelativeValueRowMatch {
  const opened = parseTimestamp(openedAt);
  if (snapshotRow) {
    const timestamp = rowTimestamp(snapshotRow);
    return {
      row: snapshotRow,
      source: "snapshot",
      timestamp,
      distanceHours: hoursBetween(timestamp, opened),
    };
  }

  const key = relativeValueKey(position);
  if (!key || !opened) return { source: "missing", timestamp: null, distanceHours: null };
  const rows = historyRows.get(key);
  if (!rows?.length) return { source: "missing", timestamp: null, distanceHours: null };
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
  if (!best || bestDistance > maxDistanceMs) return { source: "missing", timestamp: null, distanceHours: null };
  return {
    row: best.row,
    source: bestDistance === 0 ? "history_exact" : "history_nearest",
    timestamp: best.timestamp,
    distanceHours: bestDistance / 3_600_000,
  };
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
// Python scales asset-basis strike to option-proxy basis for these proxy symbols.
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

// Prefer the canonical model probability stored in the row by the Python heatmap pipeline.
// Fall back to a local recompute only when the column is missing (legacy rows).
export function entryOneTouchModel(row: Record<string, string> | undefined): number | null {
  return safeNumber(row?.options_touch_adjusted_prob) ?? recomputedOneTouchProbability(row);
}

export function currentBidAsk(row: Record<string, string> | undefined, instrumentType: string | undefined): { bid: number | null; ask: number | null } {
  const yesBid = safeNumber(row?.pm_best_bid);
  const yesAsk = safeNumber(row?.pm_best_ask);
  if (yesBid === null || yesAsk === null) return { bid: null, ask: null };
  if (instrumentType === "pm_no") return { bid: 1 - yesAsk, ask: 1 - yesBid };
  return { bid: yesBid, ask: yesAsk };
}

export function relativeValueContextNote(args: {
  entryMatch: RelativeValueRowMatch;
  currentRow: Record<string, string> | undefined;
  generatedAt: string;
  entryModel: number | null;
  currentModel: number | null;
  bidAsk: { bid: number | null; ask: number | null };
  strike: string;
  expiry: string;
}): string {
  const generated = parseTimestamp(args.generatedAt);
  const currentTs = rowTimestamp(args.currentRow);
  const currentAgeHours = currentTs && generated
    ? Math.max(0, (generated.getTime() - currentTs.getTime()) / 3_600_000)
    : null;
  return [
    `entry_model=${fmtModelValue(args.entryModel) || "n/a"}`,
    `current_model=${fmtModelValue(args.currentModel) || "n/a"}`,
    `current_bid=${fmtPriceValue(args.bidAsk.bid) || "n/a"}`,
    `current_ask=${fmtPriceValue(args.bidAsk.ask) || "n/a"}`,
    `strike=${args.strike || "n/a"}`,
    `expiry=${args.expiry || "n/a"}`,
    `entry_row_source=${args.entryMatch.source}`,
    `entry_row_ts=${args.entryMatch.timestamp?.toISOString() ?? "n/a"}`,
    `entry_row_distance_hours=${fmtHours(args.entryMatch.distanceHours) || "n/a"}`,
    `current_row_source=${args.currentRow ? "current" : "missing"}`,
    `current_row_ts=${currentTs?.toISOString() ?? "n/a"}`,
    `current_row_age_hours=${fmtHours(currentAgeHours) || "n/a"}`,
  ].join("; ");
}
