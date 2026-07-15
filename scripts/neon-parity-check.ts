import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCsvRecords } from "./lib/reporting/csv.js";
import { dedupeClosedTrades, readClosedTrades } from "./lib/reporting/report-data.js";
import { connectNeon, fetchNeonTradeIds, fetchTradeParitySummary, neonConfigured } from "./lib/db/neon-trades.js";
import { compareLedgerParity } from "./lib/db/neon-parity.js";
import type { ParityReport } from "./lib/db/neon-parity.js";

/**
 * Compares data/trades-detailed.csv against the Neon mirror table and
 * writes a parity report (Phase 6). See scripts/lib/db/neon-trades.ts for
 * the safety contract: the CSV is the source of truth, Neon issues are
 * warnings, not trading-blocking errors.
 */

const ROOT = join(import.meta.dirname, "..");
const CSV_PATH = join(ROOT, "data", "trades-detailed.csv");
const REPORT_PATH = join(ROOT, "data", "neon-parity.json");

function writeReport(report: ParityReport): void {
  const tmp = `${REPORT_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(report, null, 2) + "\n");
  renameSync(tmp, REPORT_PATH);
}

async function main(): Promise<void> {
  if (!neonConfigured()) {
    console.log("[neon-parity] NEON_DATABASE_URL not set; skipping.");
    return;
  }

  const checkedAt = new Date().toISOString();
  const csvRawRows = readCsvRecords(CSV_PATH).length;
  const csvTrades = dedupeClosedTrades(readClosedTrades(CSV_PATH));

  const client = await connectNeon();
  try {
    const [summary, neonIds] = await Promise.all([
      fetchTradeParitySummary(client),
      fetchNeonTradeIds(client),
    ]);

    const report = compareLedgerParity(
      {
        csvRawRows,
        csvTrades: csvTrades.map((trade) => ({ id: trade.id, pnl: trade.pnl })),
        neonCount: summary.neonCount,
        neonDistinctIds: summary.neonDistinctIds,
        neonPnlSum: summary.neonPnlSum,
        neonIds,
      },
      checkedAt,
    );

    writeReport(report);
    console.log(
      `[neon-parity] status=${report.status} csv=${report.csvDedupedCount} neon=${report.neonCount} ` +
      `pnl_delta=${report.pnlDeltaAbs} missing=${report.missingInNeon.length} extra=${report.extraInNeon.length}`,
    );

    if (report.status === "mismatch") process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.log(`[neon-parity] FAILED: ${message}`);
  process.exitCode = 1;
});
