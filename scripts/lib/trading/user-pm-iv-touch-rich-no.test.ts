import { describe, expect, it } from "vitest";
import {
  USER_PM_IV_TOUCH_RICH_NO_MIN_EDGE_PTS,
  ivTouchRichnessPts,
  userPmIvTouchRichNoConfidence,
  userPmIvTouchRichNoEligible,
  type IvTouchRichNoRow,
} from "./user-pm-iv-touch-rich-no.js";

function row(partial: Partial<IvTouchRichNoRow> = {}): IvTouchRichNoRow {
  return {
    asset: "GOLD",
    eventSlug: "what-price-will-gold-hit-in-aug-2026",
    marketId: "123",
    direction: "above",
    bestExpression: "sell_yes_or_buy_no",
    edgePts: -8,
    pmSpread: 0.01,
    liquidity: 20_000,
    modelProb: 0.3,
    pmYes: 0.4,
    flags: "",
    dteDays: 20,
    ...partial,
  };
}

describe("ivTouchRichnessPts", () => {
  it("reads negative edge_score on sell_yes_or_buy_no as PM-richness", () => {
    expect(ivTouchRichnessPts(row({ edgePts: -14.6 }))).toBeCloseTo(14.6);
  });

  it("rejects positive edge (PM cheap / buy-YES side)", () => {
    expect(ivTouchRichnessPts(row({ edgePts: 8 }))).toBeNull();
  });

  it("rejects non sell_yes expressions", () => {
    expect(ivTouchRichnessPts(row({ bestExpression: "buy_yes", edgePts: -10 }))).toBeNull();
  });
});

describe("userPmIvTouchRichNoEligible", () => {
  it("accepts a typical winning manual-shadow shape", () => {
    expect(userPmIvTouchRichNoEligible(row())).toBe(true);
  });

  it("requires minimum richness", () => {
    expect(userPmIvTouchRichNoEligible(row({ edgePts: -(USER_PM_IV_TOUCH_RICH_NO_MIN_EDGE_PTS - 0.1) }))).toBe(false);
    expect(userPmIvTouchRichNoEligible(row({ edgePts: -USER_PM_IV_TOUCH_RICH_NO_MIN_EDGE_PTS }))).toBe(true);
  });

  it("rejects wide spread, low liquidity, long DTE, bad flags, unknown assets", () => {
    expect(userPmIvTouchRichNoEligible(row({ pmSpread: 0.05 }))).toBe(false);
    expect(userPmIvTouchRichNoEligible(row({ liquidity: 100 }))).toBe(false);
    expect(userPmIvTouchRichNoEligible(row({ dteDays: 90 }))).toBe(false);
    expect(userPmIvTouchRichNoEligible(row({ flags: "wide_pm_spread" }))).toBe(false);
    expect(userPmIvTouchRichNoEligible(row({ asset: "HYPE" }))).toBe(false);
  });

  it("allows below-direction fades (manual book won on both)", () => {
    expect(userPmIvTouchRichNoEligible(row({ direction: "below", asset: "SPY" }))).toBe(true);
  });
});

describe("userPmIvTouchRichNoConfidence", () => {
  it("stays above the openPositions 0.15 gate even at the min edge", () => {
    expect(userPmIvTouchRichNoConfidence(5, 0.5)).toBeGreaterThanOrEqual(0.2);
  });
});
