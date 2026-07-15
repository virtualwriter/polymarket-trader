import { describe, expect, it } from "vitest";
import { compareLedgerParity } from "./neon-parity.js";

const CHECKED_AT = "2026-07-14T00:00:00.000Z";

function trades(ids: string[], pnl: (id: string) => number = () => 1): { id: string; pnl: number }[] {
  return ids.map((id) => ({ id, pnl: pnl(id) }));
}

describe("compareLedgerParity", () => {
  it("reports ok when counts, ids, and pnl sums all line up", () => {
    const csvTrades = trades(["a", "b", "c"]);
    const report = compareLedgerParity(
      {
        csvRawRows: 3,
        csvTrades,
        neonCount: 3,
        neonDistinctIds: 3,
        neonPnlSum: 3,
        neonIds: new Set(["a", "b", "c"]),
      },
      CHECKED_AT,
    );

    expect(report.status).toBe("ok");
    expect(report.csvDedupedCount).toBe(3);
    expect(report.csvPnlSum).toBe(3);
    expect(report.neonPnlSum).toBe(3);
    expect(report.pnlDeltaAbs).toBe(0);
    expect(report.missingInNeon).toEqual([]);
    expect(report.extraInNeon).toEqual([]);
    expect(report.notes).toEqual([]);
  });

  it("flags a mismatch when the neon row count differs from the CSV", () => {
    const csvTrades = trades(["a", "b", "c"]);
    const report = compareLedgerParity(
      {
        csvRawRows: 3,
        csvTrades,
        neonCount: 2,
        neonDistinctIds: 2,
        neonPnlSum: 3,
        neonIds: new Set(["a", "b"]),
      },
      CHECKED_AT,
    );

    expect(report.status).toBe("mismatch");
  });

  it("flags a mismatch when the pnl delta exceeds tolerance", () => {
    const csvTrades = trades(["a", "b"]);
    const report = compareLedgerParity(
      {
        csvRawRows: 2,
        csvTrades,
        neonCount: 2,
        neonDistinctIds: 2,
        neonPnlSum: 2.01,
        neonIds: new Set(["a", "b"]),
      },
      CHECKED_AT,
    );

    expect(report.status).toBe("mismatch");
    expect(report.pnlDeltaAbs).toBeCloseTo(0.01, 4);
  });

  it("detects ids missing from Neon and extra ids present only in Neon", () => {
    const csvTrades = trades(["a", "b", "c"]);
    const report = compareLedgerParity(
      {
        csvRawRows: 3,
        csvTrades,
        neonCount: 3,
        neonDistinctIds: 3,
        neonPnlSum: 3,
        neonIds: new Set(["a", "x", "y"]),
      },
      CHECKED_AT,
    );

    expect(report.status).toBe("mismatch");
    expect(report.missingInNeon).toEqual(["b", "c"]);
    expect(report.extraInNeon.sort()).toEqual(["x", "y"]);
  });

  it("caps missing/extra id lists at 20 and adds a truncation note", () => {
    const csvIds = Array.from({ length: 25 }, (_, i) => `csv-${i}`);
    const neonExtraIds = Array.from({ length: 25 }, (_, i) => `neon-${i}`);
    const report = compareLedgerParity(
      {
        csvRawRows: 25,
        csvTrades: trades(csvIds),
        neonCount: 25,
        neonDistinctIds: 25,
        neonPnlSum: 25,
        neonIds: new Set(neonExtraIds),
      },
      CHECKED_AT,
    );

    expect(report.missingInNeon).toHaveLength(20);
    expect(report.extraInNeon).toHaveLength(20);
    expect(report.notes).toEqual([
      "missingInNeon truncated to 20 of 25 ids",
      "extraInNeon truncated to 20 of 25 ids",
    ]);
  });

  it("treats a pnl delta of exactly 0.005 as within tolerance", () => {
    const csvTrades = trades(["a"]);
    const report = compareLedgerParity(
      {
        csvRawRows: 1,
        csvTrades,
        neonCount: 1,
        neonDistinctIds: 1,
        neonPnlSum: 1.005,
        neonIds: new Set(["a"]),
      },
      CHECKED_AT,
    );

    expect(report.pnlDeltaAbs).toBe(0.005);
    expect(report.status).toBe("ok");
  });
});
