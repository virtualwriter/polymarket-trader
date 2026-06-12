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
