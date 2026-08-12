import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  type LedgerTrade,
  baseTradeId,
  isContaminatedTrade,
  mergeScaleOutLegs,
  recomputePortfolioTotalsFromLedger,
} from "./portfolio-ledger.js";

const CSV_HEADER = "id,opened_at,closed_at,asset,venue,direction,instrument_type,instrument_id,instrument_label,entry_price,exit_price,size,leverage,pnl,pnl_pct,market_pnl,funding_pnl,signal_type,hypothesis_id,entry_confidence,thesis,close_reason";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function writeLedgerCsv(rows: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  tempDirs.push(dir);
  const path = join(dir, "trades-detailed.csv");
  writeFileSync(path, [CSV_HEADER, ...rows].join("\n") + "\n");
  return path;
}

function csvRow(id: string, size: number, pnl: number, pnlPct: number, closeReason: string): string {
  return [
    id, "2026-08-08T07:28:57.131Z", "2026-08-12T05:11:58.864Z", "OIL", "polymarket", "short",
    "pm_no", "oil-75", '"WTI NO"', 0.09, 0.59, size, 1,
    pnl.toFixed(4), pnlPct.toFixed(2), pnl.toFixed(4), "0.0000",
    "USER_PM_IV_TOUCH_RICH_NO", "", "", '"thesis"', closeReason,
  ].join(",");
}

function ledgerTrade(overrides: Partial<LedgerTrade> & { id: string }): LedgerTrade {
  return {
    openedAt: "2026-08-08T07:28:57.131Z",
    closedAt: "2026-08-12T05:00:00.000Z",
    asset: "OIL",
    venue: "polymarket",
    direction: "short",
    entryPrice: 0.09,
    exitPrice: 0.6,
    size: 1,
    pnl: 0,
    pnlPct: 0,
    marketPnl: 0,
    fundingPnl: 0,
    signalType: "USER_PM_IV_TOUCH_RICH_NO",
    hypothesisId: null,
    thesis: "t",
    closeReason: "target",
    instrumentType: "pm_no",
    ...overrides,
  };
}

describe("portfolio ledger contamination", () => {
  it("classifies one-leg monotonic arb rows as contaminated artifacts", () => {
    expect(isContaminatedTrade({
      id: "MA-bad-single-leg",
      signalType: "MONOTONIC_ARB",
      instrumentType: "pm_yes",
      closeReason: "stop",
    })).toBe(true);
  });

  it("does not classify valid monotonic package rows as contaminated by shape", () => {
    expect(isContaminatedTrade({
      id: "MA-valid-package",
      signalType: "MONOTONIC_ARB",
      instrumentType: "pm_package",
      closeReason: "expiry",
    })).toBe(false);
  });
});

describe("scale-out leg merging", () => {
  it("derives the parent position id from a leg id", () => {
    expect(baseTradeId("T-1786174137131-pym0#s1")).toBe("T-1786174137131-pym0");
    expect(baseTradeId("T-1786174137131-pym0")).toBe("T-1786174137131-pym0");
  });

  it("folds a leg into its parent as one trade carrying the summed P&L", () => {
    const merged = mergeScaleOutLegs([
      ledgerTrade({ id: "T-1#s1", size: 0.5, pnl: 2.8333, marketPnl: 2.8333, closeReason: "profit_scale_out", exitPrice: 0.6 }),
      ledgerTrade({ id: "T-1", size: 0.5, pnl: 3.5389, marketPnl: 3.5389, closeReason: "target", exitPrice: 0.727 }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("T-1");
    expect(merged[0].size).toBeCloseTo(1, 6);
    expect(merged[0].pnl).toBeCloseTo(6.3722, 4);
    // Percentage is restated over the whole original stake, not the residual.
    expect(merged[0].pnlPct).toBeCloseTo(637.22, 2);
    // The final leg's exit and reason describe how the trade ended.
    expect(merged[0].closeReason).toBe("target");
    expect(merged[0].exitPrice).toBe(0.727);
  });

  it("leaves a leg alone while its position is still open", () => {
    const rows = [ledgerTrade({ id: "T-1#s1", size: 0.5, pnl: 2.8333, closeReason: "profit_scale_out" })];
    const merged = mergeScaleOutLegs(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].closeReason).toBe("profit_scale_out");
  });

  it("passes an unscaled ledger through untouched", () => {
    const rows = [ledgerTrade({ id: "T-1", pnl: 1 }), ledgerTrade({ id: "T-2", pnl: -1 })];
    expect(mergeScaleOutLegs(rows)).toBe(rows);
  });

  it("conserves total P&L across the merge", () => {
    const rows = [
      ledgerTrade({ id: "T-1#s1", size: 0.5, pnl: 2.8333, closeReason: "profit_scale_out" }),
      ledgerTrade({ id: "T-1", size: 0.5, pnl: 3.5389, closeReason: "target" }),
      ledgerTrade({ id: "T-2", size: 1, pnl: -0.4, closeReason: "stop" }),
    ];
    const before = rows.reduce((sum, t) => sum + t.pnl, 0);
    const after = mergeScaleOutLegs(rows).reduce((sum, t) => sum + t.pnl, 0);
    expect(after).toBeCloseTo(before, 10);
  });

  it("counts a scaled trade once when read back off disk", () => {
    // Round-trips the new close reason through the CSV, so a parse or header
    // mismatch cannot silently turn one scaled trade into two.
    const path = writeLedgerCsv([
      csvRow("T-1#s1", 0.5, 2.7778, 555.56, "profit_scale_out"),
      csvRow("T-1", 0.5, 3.5389, 707.78, "target"),
    ]);
    const totals = recomputePortfolioTotalsFromLedger(path);
    expect(totals.totalTrades).toBe(1);
    expect(totals.winCount).toBe(1);
    expect(totals.lossCount).toBe(0);
    expect(totals.totalRealizedPnl).toBeCloseTo(6.3167, 4);
  });

  it("banks an open position's leg into realized P&L without calling it a trade", () => {
    // The residual is still running, so there is no parent row to merge into.
    const path = writeLedgerCsv([csvRow("T-1#s1", 0.5, 2.7778, 555.56, "profit_scale_out")]);
    const totals = recomputePortfolioTotalsFromLedger(path);
    expect(totals.totalTrades).toBe(0);
    expect(totals.winCount).toBe(0);
    expect(totals.totalRealizedPnl).toBeCloseTo(2.7778, 4);
  });

  it("handles several legs on one position", () => {
    const merged = mergeScaleOutLegs([
      ledgerTrade({ id: "T-1#s1", size: 0.5, pnl: 2, closeReason: "profit_scale_out" }),
      ledgerTrade({ id: "T-1#s2", size: 0.25, pnl: 1, closeReason: "profit_scale_out" }),
      ledgerTrade({ id: "T-1", size: 0.25, pnl: 0.5, closeReason: "target" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].size).toBeCloseTo(1, 6);
    expect(merged[0].pnl).toBeCloseTo(3.5, 6);
  });
});
