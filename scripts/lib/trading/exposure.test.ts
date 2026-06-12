import { describe, expect, it } from "vitest";
import { buildExposureSnapshot, buildPortfolioExposurePreviews, riskClustersForExposure } from "./exposure.js";

describe("portfolio exposure helpers", () => {
  it("aggregates signed exposure by asset, signal, venue, and cluster", () => {
    const snapshot = buildExposureSnapshot([
      { asset: "BTC", venue: "polymarket", direction: "short", signalType: "ONE_TOUCH_HIGH_EDGE_NO", size: 1 },
      { asset: "BTC", venue: "hyperliquid", direction: "long", signalType: "FUNDING_EXTREME_SHORT", size: 2, leverage: 2 },
      { asset: "GOLD", venue: "spot", direction: "long", signalType: "PC_RATIO_EXTREME_HIGH", size: 0.5 },
    ]);

    expect(snapshot.totalGross).toBe(5.5);
    expect(snapshot.totalNet).toBe(3.5);
    expect(snapshot.byAsset).toMatchObject({ BTC: 3, GOLD: 0.5 });
    expect(snapshot.byVenue).toMatchObject({ polymarket: -1, hyperliquid: 4, spot: 0.5 });
    expect(snapshot.byCluster.risk_on).toBe(3);
    expect(snapshot.byCluster.commodity).toBe(0.5);
    expect(snapshot.byCluster.polymarket_touch_no).toBe(-1);
  });

  it("tags risk clusters from asset, venue, and signal family", () => {
    expect(riskClustersForExposure({
      asset: "BTC",
      venue: "polymarket",
      signalType: "NO_BIAS_ADJUSTED_GAP_SHADOW",
    })).toEqual([
      "btc_delta",
      "polymarket_binary",
      "polymarket_touch_no",
      "polymarket_venue",
      "risk_on",
    ]);
  });

  it("previews candidate exposure and warnings without mutating live state", () => {
    const previews = buildPortfolioExposurePreviews({
      maxClusterAbsExposure: 2.5,
      positions: [
        { asset: "BTC", venue: "polymarket", direction: "short", signalType: "ONE_TOUCH_HIGH_EDGE_NO", size: 1 },
        { asset: "GOLD", venue: "spot", direction: "long", signalType: "PC_RATIO_EXTREME_HIGH", size: 1 },
      ],
      candidates: [
        { candidateId: "candidate-1", asset: "BTC", venue: "polymarket", direction: "short", signalType: "PC_RATIO_EXTREME_HIGH", size: 2 },
      ],
    });

    expect(previews).toHaveLength(1);
    expect(previews[0].candidateId).toBe("candidate-1");
    expect(previews[0].current.byAsset.BTC).toBe(-1);
    expect(previews[0].afterCandidate.byAsset.BTC).toBe(-3);
    expect(previews[0].warnings.join(" ")).toContain("BTC exposure increases");
    expect(previews[0].warnings.join(" ")).toContain("btc_delta cluster exposure -3.0000 exceeds preview threshold");
  });
});
