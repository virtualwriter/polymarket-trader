import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function scannerCsvValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || (typeof value === "number" && Number.isNaN(value))) return "";
  if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
  return String(value);
}


function parseScannerCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
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

function migrateScannerCsvHeader(existing: string, headers: string[]): string {
  const lines = existing.trimEnd().split("\n");
  if (lines.length === 0 || lines[0] === headers.join(",")) return existing;

  const existingHeaders = parseScannerCsvLine(lines[0] ?? "");
  const isAdditive = existingHeaders.every((header) => headers.includes(header));
  if (!isAdditive) return existing;

  const migrated = [headers.join(",")];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = parseScannerCsvLine(line);
    const row = new Map(existingHeaders.map((header, idx) => [header, values[idx] ?? ""]));
    migrated.push(headers.map((header) => scannerCsvValue(row.get(header) ?? "")).join(","));
  }
  return migrated.join("\n") + "\n";
}

export function scannerHyperliquidFundingColumn(asset: string): string {
  const normalized = asset
    .replace(/^GOLD \(GC\)$/i, "GOLD")
    .replace(/^OIL \(CL\)$/i, "OIL")
    .replace(/^xyz:/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${normalized}_hl_funding_ann`;
}

export function scannerHyperliquidFundingColumns(assets: string[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const asset of assets) {
    const column = scannerHyperliquidFundingColumn(asset);
    if (seen.has(column)) continue;
    seen.add(column);
    columns.push(column);
  }
  return columns;
}

function fundingAnnualizedPct(value: number | null | undefined): number | null {
  return roundNullable(value == null ? null : value * 100, 2);
}
export function appendScannerCsvRow(
  dataDir: string,
  filename: string,
  headers: string[],
  row: Record<string, unknown>,
) {
  const filepath = join(dataDir, filename);
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(filepath)) {
    writeFileSync(filepath, headers.join(",") + "\n");
  }

  const rawExisting = readFileSync(filepath, "utf-8");
  const existing = migrateScannerCsvHeader(rawExisting, headers);
  if (existing !== rawExisting) writeFileSync(filepath, existing);
  const ts = row.date ?? new Date().toISOString().slice(0, 13);
  const lines = existing.trim().split("\n");
  const lastLine = lines[lines.length - 1] ?? "";
  if (lastLine.startsWith(`"${ts}"`) || lastLine.startsWith(String(ts))) {
    lines[lines.length - 1] = headers.map((header) => scannerCsvValue(row[header] as number | string | null | undefined)).join(",");
    writeFileSync(filepath, lines.join("\n") + "\n");
    return;
  }

  const values = headers.map((header) => scannerCsvValue(row[header] as number | string | null | undefined));
  appendFileSync(filepath, values.join(",") + "\n");
}

export function appendScannerJsonl(dataDir: string, filename: string, value: unknown) {
  const filepath = join(dataDir, filename);
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const line = JSON.stringify(value);
  if (!existsSync(filepath)) {
    writeFileSync(filepath, line + "\n");
    return;
  }
  appendFileSync(filepath, line + "\n");
}

export function roundNullable(value: number | null | undefined, decimals = 2): number | null {
  return value != null ? Number(value.toFixed(decimals)) : null;
}

export interface ScannerHyperliquidQuote {
  markPx?: number | null;
  fundingAnnualized?: number | null;
  openInterestUsd?: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  spread?: number | null;
}

export function scannerHyperliquidQuoteSnapshot(quote: ScannerHyperliquidQuote | null | undefined) {
  return {
    markPx: roundNullable(quote?.markPx ?? null, 6),
    fundingAnnualized: roundNullable(quote?.fundingAnnualized ?? null, 6),
    openInterestUsd: roundNullable(quote?.openInterestUsd ?? null, 2),
    bestBid: roundNullable(quote?.bestBid ?? null, 6),
    bestAsk: roundNullable(quote?.bestAsk ?? null, 6),
    spread: roundNullable(quote?.spread ?? null, 6),
  };
}

export function buildScannerHyperliquidSnapshot(
  quotes: Record<string, ScannerHyperliquidQuote>,
) {
  const snapshot: Record<string, ReturnType<typeof scannerHyperliquidQuoteSnapshot>> = {};
  for (const [asset, quote] of Object.entries(quotes)) {
    if (asset === "GOLD (GC)" || asset === "OIL (CL)" || asset === "BRENT OIL") continue;
    snapshot[asset] = scannerHyperliquidQuoteSnapshot(quote);
  }
  snapshot.GOLD = scannerHyperliquidQuoteSnapshot(quotes["GOLD (GC)"]);
  snapshot.OIL = scannerHyperliquidQuoteSnapshot(quotes["OIL (CL)"]);
  return snapshot;
}

export interface ScannerMacroScore {
  /** Null when no component had a live market; never 0 as a placeholder. */
  composite: number | null;
  label: string;
  /** Share of nominal component weight that was live, 0-1. */
  coverage: number;
  fed: {
    score: number;
    signal: string;
    pAtLeastOneCut: number;
    expectedCuts: number;
    medianFirstCut: string | null;
  };
  iran: {
    score: number | null;
    signal: string;
    pDealByYE: number;
    pCeasefire: number | null;
    pNuclearTest: number;
  };
  oil: {
    score: number | null;
    signal: string;
    pSettleAboveCurrent: number | null;
    pSpike120: number;
    brentWtiSpread: number | null;
  };
}

export interface ScannerCategoryMarket {
  question: string;
  closed?: boolean;
  yesPrice: number;
}

export interface ScannerCategoryEvent {
  markets: ScannerCategoryMarket[];
}

function scannerMarketProbability(
  events: ScannerCategoryEvent[],
  predicate: (question: string) => boolean,
): number | null {
  for (const event of events) {
    const market = event.markets.find((item) => predicate(item.question) && !item.closed);
    if (market) return roundNullable(market.yesPrice * 100, 1);
  }
  return null;
}

export function buildScannerMacroCsvRow(inputs: {
  date: string;
  macroScore: ScannerMacroScore;
  btcOutperform: ScannerCategoryEvent[];
  gpu: ScannerCategoryEvent[];
}): Record<string, number | string | null> {
  const { date, macroScore: ms, btcOutperform, gpu } = inputs;
  const btcOutperformProbability = (keyword: string): number | null =>
    scannerMarketProbability(btcOutperform, (question) => question.toLowerCase().includes(keyword));
  const gpuHitProbability = (strike: string): number | null =>
    scannerMarketProbability(gpu, (question) => question.includes(strike));

  return {
    date,
    macro_composite: ms.composite,
    macro_label: ms.label,
    // Persisted so a momentum reading can refuse to compare two composites
    // built from different component sets. Renormalising over a changed set
    // shifts the level, which is indistinguishable from a real move otherwise.
    macro_coverage: roundNullable(ms.coverage * 100, 0),
    fed_score: ms.fed.score,
    fed_signal: ms.fed.signal,
    fed_p_at_least_one_cut: roundNullable(ms.fed.pAtLeastOneCut * 100, 1),
    fed_expected_cuts: roundNullable(ms.fed.expectedCuts, 1),
    fed_median_first_cut: ms.fed.medianFirstCut,
    iran_score: ms.iran.score,
    iran_signal: ms.iran.signal,
    iran_p_deal_ye: roundNullable(ms.iran.pDealByYE * 100, 1),
    iran_p_ceasefire: ms.iran.pCeasefire === null ? null : roundNullable(ms.iran.pCeasefire * 100, 1),
    iran_p_nuke_test: roundNullable(ms.iran.pNuclearTest * 100, 1),
    oil_macro_score: ms.oil.score,
    oil_signal: ms.oil.signal,
    oil_p_settle_above_current: ms.oil.pSettleAboveCurrent === null
      ? null
      : roundNullable(ms.oil.pSettleAboveCurrent * 100, 1),
    oil_p_spike_120: roundNullable(ms.oil.pSpike120 * 100, 1),
    oil_brent_wti_spread: roundNullable(ms.oil.brentWtiSpread, 1),
    btc_outperform_sp500: btcOutperformProbability("s&p 500"),
    btc_outperform_gold: btcOutperformProbability("gold"),
    btc_outperform_nvda: btcOutperformProbability("nvidia"),
    btc_outperform_silver: btcOutperformProbability("silver"),
    gpu_h100_hit_275: gpuHitProbability("$2.75"),
    gpu_h100_hit_300: gpuHitProbability("$3.00"),
  };
}

interface ScannerIvTenor {
  iv: number;
}

interface ScannerPmTouchValue {
  ev?: number | null;
  impliedVol?: number | null;
  medianMax?: number | null;
  medianMin?: number | null;
}

export function buildScannerValuationCsvRow(inputs: {
  date: string;
  btcSpot: number | null;
  btcFwd: number | null;
  btcPm: ScannerPmTouchValue | null;
  btcIv30: ScannerIvTenor | null;
  btcIv90: ScannerIvTenor | null;
  btcFundingAnnualized: number | null | undefined;
  btcOpenInterestUsd: number | null | undefined;
  btcPcRatio: number | null;
  hypeSpot: number | null;
  hypePm: ScannerPmTouchValue | null;
  hypeFundingAnnualized: number | null | undefined;
  hypeOpenInterestUsd: number | null | undefined;
  goldGcSpot: number | null;
  goldFwd: number | null;
  goldSettleEV: number | null;
  goldPm: ScannerPmTouchValue | null;
  goldIv30: ScannerIvTenor | null;
  goldIv90: ScannerIvTenor | null;
  goldFundingAnnualized: number | null | undefined;
  goldPcRatio: number | null;
  amznStock: number | null;
  amznHlPerp: number | null;
  amznFwd: number | null;
  amznIv30: ScannerIvTenor | null;
  amznIv90: ScannerIvTenor | null;
  amznFundingAnnualized: number | null | undefined;
  amznBasis: number | null;
  amznPcRatio: number | null;
  oilWti: number | null;
  oilBrent: number | null;
  oilSpread: number | null;
  oilFwd: number | null;
  oilSettleEV: number | null;
  oilPm: ScannerPmTouchValue | null;
  oilIv30: ScannerIvTenor | null;
  oilIv90: ScannerIvTenor | null;
  oilFundingAnnualized: number | null | undefined;
  oilPcRatio: number | null;
  hyperliquidQuotes?: Record<string, ScannerHyperliquidQuote | null | undefined>;
  spySpot: number | null;
  silverSpot: number | null;
  ethSpot: number | null;
  solSpot: number | null;
}): Record<string, number | string | null> {
  const r = roundNullable;
  const row: Record<string, number | string | null> = {
    date: inputs.date,
    btc_spot: r(inputs.btcSpot, 0),
    btc_opt_fwd_90d: r(inputs.btcFwd, 0),
    btc_pm_ev: r(inputs.btcPm?.ev, 0),
    btc_opt_iv_30d: r(inputs.btcIv30?.iv ? inputs.btcIv30.iv * 100 : null, 1),
    btc_opt_iv_90d: r(inputs.btcIv90?.iv ? inputs.btcIv90.iv * 100 : null, 1),
    btc_opt_iv_term_spread: r(
      inputs.btcIv30?.iv && inputs.btcIv90?.iv ? (inputs.btcIv30.iv * 100) - (inputs.btcIv90.iv * 100) : null,
      2,
    ),
    btc_pm_iv: r(inputs.btcPm?.impliedVol ? inputs.btcPm.impliedVol * 100 : null, 1),
    btc_hl_funding_ann: fundingAnnualizedPct(inputs.btcFundingAnnualized),
    btc_hl_oi: r(inputs.btcOpenInterestUsd, 0),
    btc_med_max: r(inputs.btcPm?.medianMax, 0),
    btc_med_min: r(inputs.btcPm?.medianMin, 0),
    btc_ibit_pc_ratio: r(inputs.btcPcRatio, 3),
    hype_spot: r(inputs.hypeSpot, 4),
    hype_pm_ev: r(inputs.hypePm?.ev, 2),
    hype_pm_iv: r(inputs.hypePm?.impliedVol ? inputs.hypePm.impliedVol * 100 : null, 1),
    hype_hl_funding_ann: fundingAnnualizedPct(inputs.hypeFundingAnnualized),
    hype_hl_oi: r(inputs.hypeOpenInterestUsd, 0),
    hype_med_max: r(inputs.hypePm?.medianMax, 1),
    hype_med_min: r(inputs.hypePm?.medianMin, 1),
    gold_gc_spot: r(inputs.goldGcSpot, 0),
    gold_gld_spot: null,
    gold_opt_fwd_90d: r(inputs.goldFwd, 0),
    gold_pm_settle_ev: r(inputs.goldSettleEV, 0),
    gold_opt_iv_30d: r(inputs.goldIv30?.iv ? inputs.goldIv30.iv * 100 : null, 1),
    gold_opt_iv_90d: r(inputs.goldIv90?.iv ? inputs.goldIv90.iv * 100 : null, 1),
    gold_pm_iv: r(inputs.goldPm?.impliedVol ? inputs.goldPm.impliedVol * 100 : null, 1),
    gold_hl_funding_ann: fundingAnnualizedPct(inputs.goldFundingAnnualized),
    gold_med_max: r(inputs.goldPm?.medianMax, 0),
    gold_med_min: r(inputs.goldPm?.medianMin, 0),
    gold_gld_pc_ratio: r(inputs.goldPcRatio, 3),
    amzn_stock: r(inputs.amznStock, 2),
    amzn_hl_perp: r(inputs.amznHlPerp, 2),
    amzn_opt_fwd_90d: r(inputs.amznFwd, 2),
    amzn_opt_iv_30d: r(inputs.amznIv30?.iv ? inputs.amznIv30.iv * 100 : null, 1),
    amzn_opt_iv_90d: r(inputs.amznIv90?.iv ? inputs.amznIv90.iv * 100 : null, 1),
    amzn_hl_funding_ann: fundingAnnualizedPct(inputs.amznFundingAnnualized),
    amzn_hl_basis_pct: r(inputs.amznBasis, 2),
    amzn_pc_ratio: r(inputs.amznPcRatio, 3),
    oil_wti_spot: r(inputs.oilWti, 2),
    oil_brent_spot: r(inputs.oilBrent, 2),
    oil_brent_wti_spread: r(inputs.oilSpread, 1),
    oil_opt_fwd_90d: r(inputs.oilFwd, 1),
    oil_pm_settle_ev: r(inputs.oilSettleEV, 1),
    oil_opt_iv_30d: r(inputs.oilIv30?.iv ? inputs.oilIv30.iv * 100 : null, 1),
    oil_opt_iv_90d: r(inputs.oilIv90?.iv ? inputs.oilIv90.iv * 100 : null, 1),
    oil_pm_iv: r(inputs.oilPm?.impliedVol ? inputs.oilPm.impliedVol * 100 : null, 1),
    oil_hl_funding_ann: fundingAnnualizedPct(inputs.oilFundingAnnualized),
    oil_cl_pc_ratio: r(inputs.oilPcRatio, 3),
    spy_spot: r(inputs.spySpot, 2),
    silver_spot: r(inputs.silverSpot, 4),
    eth_spot: r(inputs.ethSpot, 2),
    sol_spot: r(inputs.solSpot, 4),
  };

  for (const [asset, quote] of Object.entries(inputs.hyperliquidQuotes ?? {})) {
    row[scannerHyperliquidFundingColumn(asset)] = fundingAnnualizedPct(quote?.fundingAnnualized);
  }

  return row;
}
