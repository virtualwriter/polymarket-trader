import { describe, expect, it } from "vitest";
import { binaryKellyFraction, resolveSizingProbability, sizeBinaryPosition } from "./sizing.js";

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

  it("prefers sampled calibration buckets over signal history", () => {
    const probability = resolveSizingProbability({
      signalType: "NO_BIAS_ADJUSTED_GAP_SHADOW",
      asset: "BTC",
      fallbackConfidence: 0.51,
      calibrationBuckets: [
        { signalType: "NO_BIAS_ADJUSTED_GAP_SHADOW", asset: "BTC", n: 8, winRate: 0.75, label: "BTC gate" },
      ],
      signalHistories: [
        { signalType: "NO_BIAS_ADJUSTED_GAP_SHADOW", trades: 20, wins: 10 },
      ],
      minCalibrationEvents: 5,
    });

    expect(probability).toMatchObject({
      probability: 0.75,
      source: "calibration_bucket",
      sampleSize: 8,
    });
    expect(probability.notes[0]).toContain("BTC gate");
  });

  it("falls through undersampled calibration to asset and family history", () => {
    const assetProbability = resolveSizingProbability({
      signalType: "PC_RATIO_EXTREME_HIGH",
      asset: "BTC",
      fallbackConfidence: 0.2,
      calibrationBuckets: [
        { signalType: "PC_RATIO_EXTREME_HIGH", asset: "BTC", n: 2, winRate: 1 },
      ],
      signalHistories: [
        {
          signalType: "PC_RATIO_EXTREME_HIGH",
          trades: 26,
          wins: 15,
          perAsset: { BTC: { trades: 6, wins: 3 } },
        },
      ],
    });

    expect(assetProbability.source).toBe("signal_asset_history");
    expect(assetProbability.probability).toBeCloseTo(4 / 8, 8);

    const familyProbability = resolveSizingProbability({
      signalType: "PC_RATIO_EXTREME_LOW",
      asset: "GOLD",
      fallbackConfidence: 0.2,
      signalHistories: [
        { signalType: "PC_RATIO_EXTREME_LOW", trades: 18, wins: 12, perAsset: { GOLD: { trades: 2, wins: 2 } } },
      ],
    });

    expect(familyProbability.source).toBe("signal_family_history");
    expect(familyProbability.probability).toBeCloseTo(13 / 20, 8);
  });

  it("falls back to signal confidence when no sampled evidence is available", () => {
    const probability = resolveSizingProbability({
      signalType: "NEW_SIGNAL",
      asset: "ETH",
      fallbackConfidence: 0.42,
      signalHistories: [
        { signalType: "NEW_SIGNAL", trades: 2, wins: 2 },
      ],
    });

    expect(probability).toMatchObject({
      probability: 0.42,
      source: "signal_confidence_fallback",
      sampleSize: null,
    });
    expect(probability.notes.join(" ")).toContain("Falling back");
  });
});
