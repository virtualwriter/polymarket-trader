import { describe, expect, it } from "vitest";
import {
  FINAL_EXIT_PROFIT_FRACTION,
  FIRST_SCALE_PROFIT_FRACTION,
  LOSS_STOP_FRACTION,
  PARTIAL_CLOSE_REASON,
  type ScaleOutRecord,
  blendedRealizedPnl,
  capturedProfitFraction,
  decideBinaryScaleExit,
  effectiveStopReference,
  hasUsableBinaryPrices,
  isBinaryContractInstrument,
  isPartialScaleOutReason,
  originalPositionSize,
  priceForProfitFraction,
  scaleOutAmounts,
  scaleOutTradeId,
  stopPriceForReference,
} from "./binary-scale-exit.js";

// The two live positions this policy was written against, so the thresholds are
// pinned to real book prices rather than to round test numbers.
const OIL_ENTRY = 0.08999999999999997;
const ETH_ENTRY = 0.10999999999999999;

describe("price arithmetic", () => {
  it("measures captured profit against the payoff available at entry", () => {
    // A $0.09 contract can pay $0.91; at $0.60 it has delivered $0.51 of that.
    expect(capturedProfitFraction(OIL_ENTRY, 0.6)).toBeCloseTo(0.5604, 4);
    expect(capturedProfitFraction(OIL_ENTRY, OIL_ENTRY)).toBeCloseTo(0, 12);
    expect(capturedProfitFraction(OIL_ENTRY, 1)).toBeCloseTo(1, 12);
  });

  it("inverts cleanly into the price for a target fraction", () => {
    expect(priceForProfitFraction(OIL_ENTRY, 0.5)).toBeCloseTo(0.545, 6);
    expect(priceForProfitFraction(OIL_ENTRY, 0.7)).toBeCloseTo(0.727, 6);
    for (const fraction of [0, 0.25, 0.5, 0.7, 1]) {
      const price = priceForProfitFraction(OIL_ENTRY, fraction);
      expect(capturedProfitFraction(OIL_ENTRY, price)).toBeCloseTo(fraction, 12);
    }
  });

  it("places the stop 40% below its reference", () => {
    expect(stopPriceForReference(OIL_ENTRY)).toBeCloseTo(0.054, 6);
    expect(stopPriceForReference(ETH_ENTRY)).toBeCloseTo(0.066, 6);
    expect(stopPriceForReference(0.6)).toBeCloseTo(0.36, 6);
    expect(LOSS_STOP_FRACTION).toBe(0.4);
  });

  it("recognises only outright binary contracts", () => {
    expect(isBinaryContractInstrument("pm_yes")).toBe(true);
    expect(isBinaryContractInstrument("pm_no")).toBe(true);
    // Packages have their own payoff dynamics; perps and spot never settle at 1.
    expect(isBinaryContractInstrument("pm_package")).toBe(false);
    expect(isBinaryContractInstrument("hl_perp")).toBe(false);
    expect(isBinaryContractInstrument("spot")).toBe(false);
    expect(isBinaryContractInstrument(undefined)).toBe(false);
  });

  it("rejects prices that leave no payoff or fall outside settlement bounds", () => {
    expect(hasUsableBinaryPrices(OIL_ENTRY, 0.6)).toBe(true);
    expect(hasUsableBinaryPrices(0, 0.5)).toBe(false);
    expect(hasUsableBinaryPrices(1, 0.5)).toBe(false);
    expect(hasUsableBinaryPrices(0.5, 1.4)).toBe(false);
    expect(hasUsableBinaryPrices(0.5, -0.1)).toBe(false);
    expect(hasUsableBinaryPrices(Number.NaN, 0.5)).toBe(false);
    expect(hasUsableBinaryPrices(0.5, Number.NaN)).toBe(false);
  });
});

describe("winners", () => {
  it("scales half off once half the payoff is captured", () => {
    // The live OIL position: $0.09 entry marked at $0.60.
    const action = decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: 0.6,
      scaleOutCount: 0,
    });
    expect(action.kind).toBe("scale_out");
    if (action.kind !== "scale_out") throw new Error("expected scale_out");
    expect(action.sizeFraction).toBe(0.5);
    expect(action.capturedFraction).toBeCloseTo(0.5604, 4);
  });

  it("fires the first scale-out exactly at the documented threshold", () => {
    const action = decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: priceForProfitFraction(OIL_ENTRY, FIRST_SCALE_PROFIT_FRACTION),
      scaleOutCount: 0,
    });
    expect(action.kind).toBe("scale_out");
  });

  it("holds below the first threshold", () => {
    const justUnder = priceForProfitFraction(OIL_ENTRY, 0.49);
    expect(decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: justUnder,
      scaleOutCount: 0,
    }).kind).toBe("hold");
  });

  it("lets the residual ride between the two thresholds", () => {
    // Scaled at $0.60, now $0.65: 61.5% captured, short of the 70% exit.
    expect(decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: 0.65,
      scaleOutCount: 1,
      stopReferencePrice: 0.6,
    }).kind).toBe("hold");
  });

  it("closes the residual at 70% of max profit", () => {
    const action = decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: priceForProfitFraction(OIL_ENTRY, FINAL_EXIT_PROFIT_FRACTION),
      scaleOutCount: 1,
      stopReferencePrice: 0.6,
    });
    expect(action).toMatchObject({ kind: "close", reason: "target" });
  });

  it("closes outright when a gap clears both levels at once", () => {
    // Nothing is left to run toward, so splitting the position is pointless.
    const action = decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: 0.8,
      scaleOutCount: 0,
    });
    expect(action).toMatchObject({ kind: "close", reason: "target" });
  });

  it("never scales the same position twice", () => {
    const action = decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: 0.62,
      scaleOutCount: 1,
      stopReferencePrice: 0.6,
    });
    expect(action.kind).not.toBe("scale_out");
  });
});

describe("losers", () => {
  it("cuts a pre-scale position 40% below entry", () => {
    // The live ETH position: $0.11 entry marked at $0.03, far through $0.066.
    const action = decideBinaryScaleExit({
      entryPrice: ETH_ENTRY,
      currentPrice: 0.03,
      scaleOutCount: 0,
    });
    expect(action).toMatchObject({ kind: "close", reason: "stop" });
  });

  it("fires at the stop boundary and holds just above it", () => {
    expect(decideBinaryScaleExit({
      entryPrice: ETH_ENTRY,
      currentPrice: stopPriceForReference(ETH_ENTRY),
      scaleOutCount: 0,
    })).toMatchObject({ kind: "close", reason: "stop" });

    expect(decideBinaryScaleExit({
      entryPrice: ETH_ENTRY,
      currentPrice: 0.07,
      scaleOutCount: 0,
    }).kind).toBe("hold");
  });

  it("ratchets the stop up to the scale-out price so banked profit is protected", () => {
    // Scaled at $0.60, so the residual now stops at $0.36 — still a large win
    // rather than the $0.054 the entry-based stop would have allowed.
    const state = { entryPrice: OIL_ENTRY, scaleOutCount: 1, stopReferencePrice: 0.6 };
    expect(effectiveStopReference({ ...state, currentPrice: 0.4 })).toBe(0.6);
    expect(decideBinaryScaleExit({ ...state, currentPrice: 0.36 }))
      .toMatchObject({ kind: "close", reason: "stop" });
    expect(decideBinaryScaleExit({ ...state, currentPrice: 0.4 }).kind).toBe("hold");
  });

  it("ignores a stale reference price until a scale-out actually happens", () => {
    expect(effectiveStopReference({
      entryPrice: OIL_ENTRY,
      currentPrice: 0.2,
      scaleOutCount: 0,
      stopReferencePrice: 0.6,
    })).toBe(OIL_ENTRY);
  });

  it("books a gap through both the target and the stop as the win it is", () => {
    // Settlement at 1.0 is above the target and cannot also be a stop.
    expect(decideBinaryScaleExit({
      entryPrice: OIL_ENTRY,
      currentPrice: 1,
      scaleOutCount: 1,
      stopReferencePrice: 0.6,
    })).toMatchObject({ kind: "close", reason: "target" });
  });
});

describe("scale-out accounting", () => {
  it("splits the live OIL position into the P&L the policy actually banks", () => {
    // $1 committed at $0.09, half taken off at $0.60.
    const first = scaleOutAmounts(OIL_ENTRY, 1, 0.6, 0.5);
    expect(first.sizeClosed).toBeCloseTo(0.5, 12);
    expect(first.remainingSize).toBeCloseTo(0.5, 12);
    expect(first.pnl).toBeCloseTo(2.8333, 4);

    // The residual then exits at the 70%-of-max-profit level.
    const finalPrice = priceForProfitFraction(OIL_ENTRY, FINAL_EXIT_PROFIT_FRACTION);
    const residualPnl = first.remainingSize * (finalPrice / OIL_ENTRY - 1);
    expect(residualPnl).toBeCloseTo(3.5389, 4);

    const legs: ScaleOutRecord[] = [
      { at: "2026-08-12T05:00:00.000Z", price: 0.6, sizeClosed: first.sizeClosed, pnl: first.pnl },
    ];
    // +$6.37 of the +$10.11 that riding all the way to settlement would pay.
    expect(blendedRealizedPnl(legs, residualPnl)).toBeCloseTo(6.3722, 4);
  });

  it("keeps the blend equal to a single full close when nothing was scaled", () => {
    const wholePnl = 1 * (0.6 / OIL_ENTRY - 1);
    expect(blendedRealizedPnl(undefined, wholePnl)).toBeCloseTo(wholePnl, 12);
    expect(blendedRealizedPnl([], wholePnl)).toBeCloseTo(wholePnl, 12);
  });

  it("conserves P&L however the position is sliced", () => {
    // Scaling out cannot create or destroy P&L relative to closing at once.
    const atOnce = 1 * (0.5 / OIL_ENTRY - 1);
    const leg = scaleOutAmounts(OIL_ENTRY, 1, 0.5, 0.5);
    const residual = leg.remainingSize * (0.5 / OIL_ENTRY - 1);
    expect(blendedRealizedPnl([{ at: "t", price: 0.5, sizeClosed: leg.sizeClosed, pnl: leg.pnl }], residual))
      .toBeCloseTo(atOnce, 12);
  });

  it("remembers the capital originally committed", () => {
    expect(originalPositionSize({ size: 0.5, originalSize: 1 })).toBe(1);
    expect(originalPositionSize({ size: 1 })).toBe(1);
  });

  it("marks scale-out legs so learning counts one sample per decision", () => {
    expect(isPartialScaleOutReason(PARTIAL_CLOSE_REASON)).toBe(true);
    expect(isPartialScaleOutReason("target")).toBe(false);
    expect(isPartialScaleOutReason("stop")).toBe(false);
    expect(isPartialScaleOutReason(undefined)).toBe(false);
    expect(scaleOutTradeId("T-123-abc", 1)).toBe("T-123-abc#s1");
  });
});

describe("guards", () => {
  it("holds rather than acting on unusable prices", () => {
    for (const [entryPrice, currentPrice] of [[0, 0.5], [1, 0.5], [0.5, 1.4], [0.5, -0.2], [Number.NaN, 0.5]]) {
      expect(decideBinaryScaleExit({ entryPrice, currentPrice, scaleOutCount: 0 }).kind).toBe("hold");
    }
  });
});
