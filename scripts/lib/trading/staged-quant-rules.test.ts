import { describe, expect, it } from "vitest";
import { buildStagedQuantRulePreviews } from "./staged-quant-rules.js";

const sizingPreview = {
  signalType: "ONE_TOUCH_HIGH_EDGE_NO",
  asset: "BTC",
  venue: "polymarket",
  direction: "short",
  currentFlatSize: 1,
  previewSize: 2.5,
  reason: "positive_edge",
  entryPrice: 0.4,
  probabilitySource: "calibration_bucket",
  winProbability: 0.58,
  probabilitySampleSize: 42,
  edgePts: 18,
  rawKellyFraction: 0.3,
  adjustedKellyFraction: 0.15,
  cappedKellyFraction: 0.03,
  notes: [],
};

const exposurePreview = {
  candidateId: "ONE_TOUCH_HIGH_EDGE_NO:BTC:0",
  asset: "BTC",
  venue: "polymarket" as const,
  direction: "short" as const,
  signalType: "ONE_TOUCH_HIGH_EDGE_NO",
  candidateSize: 2.5,
  riskClusters: ["btc_delta", "polymarket_binary", "polymarket_touch_no", "polymarket_venue", "risk_on"],
  current: {
    totalGross: 1,
    totalNet: 1,
    byAsset: { BTC: 1 },
    bySignalType: { ONE_TOUCH_HIGH_EDGE_NO: 1 },
    byVenue: { polymarket: 1 },
    byCluster: { risk_on: 1 },
  },
  afterCandidate: {
    totalGross: 3.5,
    totalNet: 3.5,
    byAsset: { BTC: 3.5 },
    bySignalType: { ONE_TOUCH_HIGH_EDGE_NO: 3.5 },
    byVenue: { polymarket: 3.5 },
    byCluster: { risk_on: 3.5 },
  },
  warnings: [],
};

describe("staged quant rule previews", () => {
  it("keeps enforced live size uniform when live sizing is disabled", () => {
    const [preview] = buildStagedQuantRulePreviews({
      sizingPreviews: [sizingPreview],
      exposurePreviews: [exposurePreview],
      config: {
        mode: "observe_uniform",
        tradeSize: 1,
        liveSizingEnabled: false,
        minEdgePts: 5,
        maxExposureAlertAbs: 5,
      },
    });

    expect(preview).toMatchObject({
      candidateId: "ONE_TOUCH_HIGH_EDGE_NO:BTC:0",
      currentFlatSize: 1,
      previewSize: 2.5,
      enforcedLiveSize: 1,
      wouldResize: true,
      liveSizingEnabled: false,
      alerts: [],
    });
  });

  it("shows the future flip-on size without changing defaults", () => {
    const [preview] = buildStagedQuantRulePreviews({
      sizingPreviews: [sizingPreview],
      exposurePreviews: [exposurePreview],
      config: {
        mode: "apply_sizing_preview",
        tradeSize: 1,
        liveSizingEnabled: true,
        minEdgePts: 5,
        maxExposureAlertAbs: 5,
      },
    });

    expect(preview.enforcedLiveSize).toBe(2.5);
    expect(preview.notes[0]).toContain("enabled");
  });

  it("emits non-blocking alerts for low edge and exposure", () => {
    const [preview] = buildStagedQuantRulePreviews({
      sizingPreviews: [{ ...sizingPreview, edgePts: 2 }],
      exposurePreviews: [exposurePreview],
      config: {
        mode: "observe_uniform",
        tradeSize: 1,
        liveSizingEnabled: false,
        minEdgePts: 5,
        maxExposureAlertAbs: 2,
      },
    });

    expect(preview.alerts).toEqual([
      "edge 2.00pt < staged min 5.00pt",
      "cluster exposure 3.50 > alert cap 2.00",
    ]);
  });
});
