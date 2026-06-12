import { describe, expect, it } from "vitest";
import { summarizeBlockedSignals } from "./blocked-signals.js";

const baseShadow = {
  status: "resolved" as const,
  resolvedAt: "2026-06-01T00:00:00.000Z",
  signalType: "TEST_SIGNAL",
  asset: "BTC",
  venue: "polymarket",
  direction: "long",
  blockedReason: "manual_shadow_trade",
  thesis: "fixture",
  position: { instrumentLabel: "BTC fixture" },
};

describe("blocked signal summary", () => {
  it("summarizes resolved, excluded, and open quality-warning shadows", () => {
    const summary = summarizeBlockedSignals([
      {
        ...baseShadow,
        hypotheticalResult: { outcome: "win" as const, closeReason: "target", pnlPct: 12.345 },
      },
      {
        ...baseShadow,
        resolvedAt: "2026-06-02T00:00:00.000Z",
        hypotheticalResult: { outcome: "loss" as const, closeReason: "stop", pnlPct: -2.345 },
      },
      {
        ...baseShadow,
        signalType: "EXCLUDED",
        hypotheticalResult: { outcome: "win" as const, closeReason: "target", pnlPct: 50 },
        learningExcluded: { reason: "legacy" },
      },
      {
        ...baseShadow,
        status: "open" as const,
        resolvedAt: undefined,
        signalType: "OPEN_SIGNAL",
        hypotheticalResult: undefined,
        marketQuality: { flags: ["wide_spread"], yesBid: 0.1 },
      },
    ]);

    expect(summary.openCount).toBe(1);
    expect(summary.resolvedCount).toBe(2);
    expect(summary.wouldHaveWon).toBe(1);
    expect(summary.wouldHaveLost).toBe(1);
    expect(summary.bySignal).toContainEqual({
      signalType: "TEST_SIGNAL",
      blocked: 2,
      resolved: 2,
      wouldHaveWon: 1,
      wouldHaveLost: 1,
      avgPnlPct: 5,
    });
    expect(summary.bySignal.some((row) => row.signalType === "EXCLUDED")).toBe(false);
    expect(summary.recentResolved.map((row) => row.closeReason)).toEqual(["target", "stop"]);
    expect(summary.openQualityWarnings).toEqual([
      {
        signalType: "OPEN_SIGNAL",
        asset: "BTC",
        blockedReason: "manual_shadow_trade",
        instrumentLabel: "BTC fixture",
        marketQuality: { flags: ["wide_spread"], yesBid: 0.1 },
        thesis: "fixture",
      },
    ]);
  });
});
