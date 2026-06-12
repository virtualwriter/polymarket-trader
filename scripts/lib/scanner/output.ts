import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function scannerCsvValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || (typeof value === "number" && Number.isNaN(value))) return "";
  if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
  return String(value);
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

  const existing = readFileSync(filepath, "utf-8");
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
  composite: number;
  label: string;
  fed: {
    score: number;
    signal: string;
    pAtLeastOneCut: number;
    expectedCuts: number;
    medianFirstCut: string | null;
  };
  iran: {
    score: number;
    signal: string;
    pDealByYE: number;
    pCeasefire: number | null;
    pNuclearTest: number;
  };
  oil: {
    score: number;
    signal: string;
    pSettleAboveCurrent: number;
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
    oil_p_settle_above_current: roundNullable(ms.oil.pSettleAboveCurrent * 100, 1),
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
