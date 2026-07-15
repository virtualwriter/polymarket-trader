/**
 * Pure comparison logic for CSV-vs-Neon ledger parity checks (Phase 6).
 *
 * Kept free of any DB/IO dependencies so the comparison itself is
 * unit-testable; scripts/neon-parity-check.ts gathers the inputs and
 * hands them to compareLedgerParity.
 */

const PNL_TOLERANCE = 0.005;
const MAX_ID_LIST = 20;

export interface ParityInputs {
  csvRawRows: number;
  csvTrades: { id: string; pnl: number }[];
  neonCount: number;
  neonDistinctIds: number;
  neonPnlSum: number;
  neonIds: Set<string>;
}

export interface ParityReport {
  checkedAt: string;
  status: "ok" | "mismatch";
  csvRawRows: number;
  csvDedupedCount: number;
  csvPnlSum: number;
  neonCount: number;
  neonPnlSum: number;
  pnlDeltaAbs: number;
  missingInNeon: string[];
  extraInNeon: string[];
  notes: string[];
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function capIds(ids: string[], label: string, notes: string[]): string[] {
  if (ids.length <= MAX_ID_LIST) return ids;
  notes.push(`${label} truncated to ${MAX_ID_LIST} of ${ids.length} ids`);
  return ids.slice(0, MAX_ID_LIST);
}

export function compareLedgerParity(inputs: ParityInputs, checkedAt: string): ParityReport {
  const { csvRawRows, csvTrades, neonCount, neonDistinctIds, neonPnlSum, neonIds } = inputs;

  const csvDedupedCount = csvTrades.length;
  const csvIds = new Set(csvTrades.map((trade) => trade.id));
  const csvPnlSum = round4(csvTrades.reduce((sum, trade) => sum + trade.pnl, 0));
  const roundedNeonPnlSum = round4(neonPnlSum);
  const pnlDeltaAbs = round4(Math.abs(csvPnlSum - roundedNeonPnlSum));

  const notes: string[] = [];
  const missingInNeon = capIds(
    csvTrades.filter((trade) => !neonIds.has(trade.id)).map((trade) => trade.id),
    "missingInNeon",
    notes,
  );
  const extraInNeon = capIds(
    [...neonIds].filter((id) => !csvIds.has(id)),
    "extraInNeon",
    notes,
  );

  const countsMatch = csvDedupedCount === neonCount && neonCount === neonDistinctIds;
  const idsMatch = missingInNeon.length === 0 && extraInNeon.length === 0;
  const pnlMatches = pnlDeltaAbs <= PNL_TOLERANCE;

  const status: ParityReport["status"] = countsMatch && idsMatch && pnlMatches ? "ok" : "mismatch";

  return {
    checkedAt,
    status,
    csvRawRows,
    csvDedupedCount,
    csvPnlSum,
    neonCount,
    neonPnlSum: roundedNeonPnlSum,
    pnlDeltaAbs,
    missingInNeon,
    extraInNeon,
    notes,
  };
}
