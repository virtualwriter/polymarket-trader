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
