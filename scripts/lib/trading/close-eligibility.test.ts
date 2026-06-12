import { describe, expect, it } from "vitest";
import { buildLlmCloseEligibility, positionTimingContext } from "./close-eligibility.js";

const config = {
  closeMinHoldHours: 12,
  longDatedCloseHours: 30 * 24,
  longDatedCloseMinProgress: 0.1,
  longDatedCloseMaxExtraBufferHours: 7 * 24,
  profitTakeTargetFraction: 0.75,
};

describe("LLM close eligibility helpers", () => {
  it("computes position timing context from open and expiry dates", () => {
    const timing = positionTimingContext({
      openedAt: "2026-06-01T00:00:00Z",
      expiryDate: "2026-06-03T00:00:00Z",
    }, Date.parse("2026-06-02T00:00:00Z"));

    expect(timing.hoursOpen).toBe(24);
    expect(timing.hoursToExpiry).toBe(24);
    expect(timing.plannedHoldHours).toBe(48);
    expect(timing.elapsedHoldPct).toBe(0.5);
  });

  it("limits early long-dated LLM-owned closes to conservative categories", () => {
    const eligibility = buildLlmCloseEligibility({
      position: {
        id: "T-1",
        signalType: "LLM_HYPOTHESIS",
        asset: "BTC",
        venue: "spot",
        direction: "long",
        openedAt: "2026-06-01T00:00:00Z",
        expiryDate: "2026-08-01T00:00:00Z",
        targetPct: 4,
      },
      mark: { pnlPct: 3.1 },
      evidenceColumns: ["btc_spot"],
      signalOwned: true,
      mechanicalEligible: false,
      config,
      timing: positionTimingContext({
        openedAt: "2026-06-01T00:00:00Z",
        expiryDate: "2026-08-01T00:00:00Z",
      }, Date.parse("2026-06-02T00:00:00Z")),
    });

    expect(eligibility.allowed).toBe(true);
    expect(eligibility.allowedCategories).toEqual(["data_quality_issue", "hard_portfolio_risk", "profit_taking"]);
    expect(eligibility.minHoldHours).toBe(146.4);
  });
});
