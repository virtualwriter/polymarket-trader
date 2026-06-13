import { describe, expect, it } from "vitest";
import { buildMechanicalExitCandidates, buildSignalKillExitCandidates } from "./candidate-exits.js";

describe("candidate exit helpers", () => {
  it("keeps only positions with a mechanical close reason", () => {
    expect(buildMechanicalExitCandidates([
      { positionId: "T-1", closeReason: "target" },
      { positionId: "T-2", closeReason: null },
      { positionId: "T-3", closeReason: "stop" },
    ])).toEqual([
      { positionId: "T-1", reason: "target" },
      { positionId: "T-3", reason: "stop" },
    ]);
  });

  it("summarizes positions whose signal or asset bucket has been disabled", () => {
    const exits = buildSignalKillExitCandidates(
      [
        { id: "T-1", signalType: "PC_RATIO_EXTREME_HIGH", asset: "BTC" },
        { id: "T-2", signalType: "FUNDING_EXTREME_SHORT", asset: "ETH" },
        { id: "T-3", signalType: "MOMENTUM_LONG", asset: "GOLD" },
      ],
      [
        { type: "PC_RATIO_EXTREME_HIGH", enabled: true, perAsset: { BTC: { disabled: true } } },
        { type: "FUNDING_EXTREME_SHORT", enabled: false },
        { type: "MOMENTUM_LONG", enabled: true },
      ],
    );

    expect(exits).toEqual([
      { positionId: "T-1", signalType: "PC_RATIO_EXTREME_HIGH", asset: "BTC" },
      { positionId: "T-2", signalType: "FUNDING_EXTREME_SHORT", asset: "ETH" },
    ]);
  });
});
