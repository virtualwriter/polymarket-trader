import { describe, expect, it } from "vitest";
import type { ReportClosedTrade } from "../reporting/report-builders.js";
import { toTimestamptz, tradeToUpsertParams } from "./neon-trades.js";

function baseTrade(overrides: Partial<ReportClosedTrade> = {}): ReportClosedTrade {
  return {
    id: "T1",
    openedAt: "2026-07-01T00:00:00.000Z",
    closedAt: "2026-07-02T00:00:00.000Z",
    asset: "BTC",
    venue: "polymarket",
    direction: "long",
    entryPrice: 0.5,
    exitPrice: 0.6,
    size: 100,
    pnl: 10,
    pnlPct: 0.1,
    marketPnl: 9,
    fundingPnl: 1,
    signalType: "monotonic-arb",
    hypothesisId: null,
    thesis: "test thesis",
    closeReason: "target",
    ...overrides,
  };
}

describe("toTimestamptz", () => {
  it("returns an ISO string for a valid ISO input", () => {
    expect(toTimestamptz("2026-07-14T12:00:00.000Z")).toBe("2026-07-14T12:00:00.000Z");
  });

  it("returns null for garbage input", () => {
    expect(toTimestamptz("not-a-date")).toBeNull();
  });

  it("returns null for empty or nullish input", () => {
    expect(toTimestamptz("")).toBeNull();
    expect(toTimestamptz(null)).toBeNull();
    expect(toTimestamptz(undefined)).toBeNull();
  });
});

describe("tradeToUpsertParams", () => {
  it("produces params in the correct order with length 20", () => {
    const params = tradeToUpsertParams(baseTrade());
    expect(params).toHaveLength(20);
    expect(params).toEqual([
      "T1",
      "2026-07-01T00:00:00.000Z",
      "2026-07-02T00:00:00.000Z",
      "BTC",
      "polymarket",
      "long",
      null,
      null,
      null,
      0.5,
      0.6,
      100,
      10,
      0.1,
      9,
      1,
      "monotonic-arb",
      null,
      "test thesis",
      "target",
    ]);
  });

  it("maps NaN prices/size/pnlPct/marketPnl/fundingPnl to null", () => {
    const params = tradeToUpsertParams(baseTrade({
      entryPrice: NaN,
      exitPrice: NaN,
      size: NaN,
      pnlPct: NaN,
      marketPnl: NaN,
      fundingPnl: NaN,
    }));
    const [, , , , , , , , , entryPrice, exitPrice, size, , pnlPct, marketPnl, fundingPnl] = params;
    expect(entryPrice).toBeNull();
    expect(exitPrice).toBeNull();
    expect(size).toBeNull();
    expect(pnlPct).toBeNull();
    expect(marketPnl).toBeNull();
    expect(fundingPnl).toBeNull();
  });

  it("maps missing optional fields (instrumentType/Id/Label, hypothesisId) to null", () => {
    const params = tradeToUpsertParams(baseTrade({
      instrumentType: undefined,
      instrumentId: undefined,
      instrumentLabel: undefined,
      hypothesisId: null,
    }));
    const [, , , , , , instrumentType, instrumentId, instrumentLabel, , , , , , , , , hypothesisId] = params;
    expect(instrumentType).toBeNull();
    expect(instrumentId).toBeNull();
    expect(instrumentLabel).toBeNull();
    expect(hypothesisId).toBeNull();
  });

  it("maps NaN pnl to 0", () => {
    const params = tradeToUpsertParams(baseTrade({ pnl: NaN }));
    expect(params[12]).toBe(0);
  });
});
