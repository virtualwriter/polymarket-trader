import { describe, expect, it } from "vitest";
import { binaryKellyFraction, sizeBinaryPosition } from "./sizing.js";

describe("trading sizing helpers", () => {
  it("computes binary Kelly fraction from model probability and entry price", () => {
    expect(binaryKellyFraction({ entryPrice: 0.4, winProbability: 0.55 })).toBeCloseTo(0.25, 8);
    expect(binaryKellyFraction({ entryPrice: 0.4, winProbability: 0.4 })).toBe(0);
    expect(binaryKellyFraction({ entryPrice: 0.4, winProbability: 0.35 })).toBe(0);
  });

  it("sizes positive-edge binary positions with fractional Kelly and caps", () => {
    const sizing = sizeBinaryPosition({
      bankroll: 100,
      availableCash: 10,
      minSize: 0.25,
      maxSize: 5,
      entryPrice: 0.4,
      winProbability: 0.55,
      kellyFraction: 0.5,
      maxBankrollFraction: 0.03,
    });

    expect(sizing.size).toBe(3);
    expect(sizing.edgePts).toBeCloseTo(15, 8);
    expect(sizing.rawKellyFraction).toBeCloseTo(0.25, 8);
    expect(sizing.cappedKellyFraction).toBe(0.03);
    expect(sizing.reason).toBe("positive_edge");
  });

  it("applies confidence and available cash limits", () => {
    const sizing = sizeBinaryPosition({
      bankroll: 100,
      availableCash: 1.25,
      minSize: 0.25,
      maxSize: 5,
      entryPrice: 0.4,
      winProbability: 0.55,
      confidence: 0.5,
      maxBankrollFraction: 0.2,
    });

    expect(sizing.size).toBe(1.25);
    expect(sizing.adjustedKellyFraction).toBeCloseTo(0.0625, 8);
    expect(sizing.reason).toBe("positive_edge");
  });

  it("does not force trades when edge is absent or size is too small", () => {
    expect(sizeBinaryPosition({
      bankroll: 100,
      availableCash: 10,
      minSize: 0.25,
      maxSize: 5,
      entryPrice: 0.5,
      winProbability: 0.5,
    }).reason).toBe("non_positive_edge");

    expect(sizeBinaryPosition({
      bankroll: 10,
      availableCash: 10,
      minSize: 0.25,
      maxSize: 5,
      entryPrice: 0.5,
      winProbability: 0.51,
      maxBankrollFraction: 0.2,
    }).reason).toBe("below_min_size");
  });

  it("rejects invalid inputs and no-cash portfolios", () => {
    expect(binaryKellyFraction({ entryPrice: 1, winProbability: 0.55 })).toBeNull();
    expect(sizeBinaryPosition({
      bankroll: 100,
      availableCash: 10,
      minSize: 0.25,
      maxSize: 5,
      entryPrice: 1,
      winProbability: 0.55,
    }).reason).toBe("invalid_input");

    expect(sizeBinaryPosition({
      bankroll: 100,
      availableCash: 0,
      minSize: 0.25,
      maxSize: 5,
      entryPrice: 0.4,
      winProbability: 0.55,
    }).reason).toBe("no_cash");
  });
});
