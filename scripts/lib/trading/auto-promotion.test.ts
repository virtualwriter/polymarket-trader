import { describe, expect, it } from "vitest";
import {
  AUTO_PROMOTE_FULL_SIZE_AFTER_TRADES,
  AUTO_PROMOTE_INITIAL_SIZE_FRACTION,
  autoPromotedSizeFraction,
  evaluateAutoPromotion,
  summarizeShadowOutcomes,
  type ShadowOutcome,
} from "./auto-promotion.js";

const GATE = "2026-06-01T00:00:00Z";

function outcomes(pnls: number[], openedAt = "2026-07-01T00:00:00Z"): ShadowOutcome[] {
  return pnls.map((pnlPct) => ({ pnlPct, win: pnlPct > 0, openedAt }));
}

/** Profitable but only 57% right — the shape a 65% win-rate bar wrongly rejects. */
function gatedOneTouchShape(): ShadowOutcome[] {
  const winners = Array.from({ length: 33 }, () => 12);
  const losers = Array.from({ length: 25 }, () => -3);
  return outcomes([...winners, ...losers]);
}

describe("summarizeShadowOutcomes", () => {
  it("counts only shadows opened after the gate as forward validation", () => {
    const mixed = [
      ...outcomes([1, 2, 3], "2026-05-01T00:00:00Z"),
      ...outcomes([4, 5], "2026-07-01T00:00:00Z"),
    ];
    const ev = summarizeShadowOutcomes(mixed, GATE);
    expect(ev.n).toBe(5);
    expect(ev.postGateN).toBe(2);
  });

  it("treats every shadow as pre-gate when no gate date is known", () => {
    expect(summarizeShadowOutcomes(outcomes([1, 2, 3]), null).postGateN).toBe(0);
  });

  it("reports win rate and expectancy independently", () => {
    const ev = summarizeShadowOutcomes(gatedOneTouchShape(), GATE);
    expect(ev.winRate).toBeCloseTo(33 / 58, 6);
    expect(ev.meanPnlPct).toBeGreaterThan(0);
    // Right barely more than half the time, but decisively profitable.
    expect(ev.winRatePValue).toBeGreaterThan(0.1);
    expect(ev.expectancyPValue!).toBeLessThan(0.001);
  });
});

describe("evaluateAutoPromotion", () => {
  it("promotes a profitable sub-65% family that the old win-rate bar would have blocked", () => {
    const decision = evaluateAutoPromotion(summarizeShadowOutcomes(gatedOneTouchShape(), GATE));
    expect(decision.promote).toBe(true);
    expect(decision.reason).toContain("mean edge");
  });

  it("refuses to judge a family on the data that set its entry rule", () => {
    const preGateOnly = summarizeShadowOutcomes(
      gatedOneTouchShape().map((o) => ({ ...o, openedAt: "2026-05-01T00:00:00Z" })),
      GATE,
    );
    const decision = evaluateAutoPromotion(preGateOnly);
    expect(decision.promote).toBe(false);
    expect(decision.reason).toContain("since the entry rule last changed");
  });

  it("holds back until the sample is large enough", () => {
    const decision = evaluateAutoPromotion(summarizeShadowOutcomes(outcomes(Array(10).fill(5)), GATE));
    expect(decision.promote).toBe(false);
    expect(decision.reason).toContain("resolved shadows");
  });

  it("rejects an edge that rests on a single outlier", () => {
    const oneJackpot = outcomes([...Array(59).fill(-0.4), 400]);
    const decision = evaluateAutoPromotion(summarizeShadowOutcomes(oneJackpot, GATE));
    expect(decision.promote).toBe(false);
    expect(decision.reason).toMatch(/single best trade|win rate|expectancy/);
  });

  it("rejects a jackpot profile on the win-rate floor", () => {
    const lottery = outcomes([...Array(57).fill(-1), 200, 190, 180]);
    const decision = evaluateAutoPromotion(summarizeShadowOutcomes(lottery, GATE));
    expect(decision.promote).toBe(false);
    expect(decision.reason).toContain("floor");
  });

  it("rejects a losing family", () => {
    const decision = evaluateAutoPromotion(summarizeShadowOutcomes(outcomes(Array(60).fill(-2)), GATE));
    expect(decision.promote).toBe(false);
  });

  it("rejects a profitable family whose edge is not significant", () => {
    // Wide dispersion around a small positive mean.
    const noisy = outcomes(Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 30 : -29)));
    const decision = evaluateAutoPromotion(summarizeShadowOutcomes(noisy, GATE));
    expect(decision.promote).toBe(false);
    expect(decision.reason).toContain("expectancy");
  });
});

describe("autoPromotedSizeFraction", () => {
  it("starts a newly promoted family at reduced size", () => {
    expect(autoPromotedSizeFraction(0)).toBe(AUTO_PROMOTE_INITIAL_SIZE_FRACTION);
    expect(autoPromotedSizeFraction(AUTO_PROMOTE_FULL_SIZE_AFTER_TRADES - 1)).toBe(AUTO_PROMOTE_INITIAL_SIZE_FRACTION);
  });

  it("sizes up once it has proven out live", () => {
    expect(autoPromotedSizeFraction(AUTO_PROMOTE_FULL_SIZE_AFTER_TRADES)).toBe(1);
  });
});
