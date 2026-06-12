import { describe, expect, it } from "vitest";
import { buildCandidateActionPreviews, sizingSignalHistories } from "./candidate-actions.js";

const sizingConfig = {
  tradeSize: 1,
  maxBankroll: 100,
  minSize: 0.25,
  maxSize: 3,
  kellyFraction: 0.5,
  maxBankrollFraction: 0.03,
  minCalibrationEvents: 5,
  minAssetHistoryTrades: 5,
  minSignalHistoryTrades: 10,
};

describe("candidate action preview helpers", () => {
  it("maps signal weights into sizing histories", () => {
    expect(sizingSignalHistories([
      { type: "PC_RATIO_EXTREME_HIGH", trades: 12, wins: 7, perAsset: { BTC: { trades: 5, wins: 3 } } },
    ])).toEqual([
      { signalType: "PC_RATIO_EXTREME_HIGH", trades: 12, wins: 7, perAsset: { BTC: { trades: 5, wins: 3 } } },
    ]);
  });

  it("builds sizing and exposure previews from candidates without live sizing changes", () => {
    const previews = buildCandidateActionPreviews({
      portfolio: {
        cash: 10,
        positions: [
          { asset: "BTC", venue: "polymarket", direction: "short", signalType: "ONE_TOUCH_HIGH_EDGE_NO", size: 1 },
        ],
      },
      signals: [
        {
          type: "PC_RATIO_EXTREME_HIGH",
          asset: "BTC",
          venue: "polymarket",
          direction: "long",
          entryPrice: 0.4,
          confidence: 0.55,
        },
      ],
      calibrationBuckets: [],
      signalHistories: [],
      sizingConfig,
      maxClusterAbsExposure: 2,
    });

    expect(previews.sizingPreviews).toHaveLength(1);
    expect(previews.sizingPreviews[0]).toMatchObject({
      currentFlatSize: 1,
      previewSize: 3,
      probabilitySource: "signal_confidence_fallback",
      edgePts: 15,
    });
    expect(previews.portfolioExposurePreviews[0].candidateId).toBe("PC_RATIO_EXTREME_HIGH:BTC:0");
    expect(previews.portfolioExposurePreviews[0].current.byAsset.BTC).toBe(-1);
    expect(previews.portfolioExposurePreviews[0].afterCandidate.byAsset.BTC).toBe(2);
  });
});
