import { join } from "node:path";
import { dedupeClosedTrades, readClosedTrades } from "./lib/reporting/report-data.js";
import { connectNeon, ensureTradesSchema, neonConfigured, upsertClosedTrades } from "./lib/db/neon-trades.js";

/**
 * Mirrors data/trades-detailed.csv into the Neon Postgres trades table
 * (Phase 6). The CSV remains the source of truth; a Neon failure here is a
 * warning, never a trading-blocking error — see scripts/lib/db/neon-trades.ts
 * for the full safety contract.
 */

const ROOT = join(import.meta.dirname, "..");
const CSV_PATH = join(ROOT, "data", "trades-detailed.csv");

async function main(): Promise<void> {
  if (!neonConfigured()) {
    console.log("[neon-sync] NEON_DATABASE_URL not set; skipping.");
    return;
  }

  const startedAt = Date.now();
  const rawTrades = readClosedTrades(CSV_PATH);
  const deduped = dedupeClosedTrades(rawTrades);

  const client = await connectNeon();
  try {
    await ensureTradesSchema(client);
    const result = await upsertClosedTrades(client, deduped);
    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[neon-sync] csv_rows=${rawTrades.length} deduped=${deduped.length} ` +
      `upserted_or_updated=${result.upsertedOrUpdated} unchanged=${result.unchanged} elapsed_ms=${elapsedMs}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.log(`[neon-sync] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
