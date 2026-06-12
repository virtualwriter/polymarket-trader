import { describe, expect, it } from "vitest";
import { buildBlockedSignalObservations, summarizeBlockedSignals } from "./blocked-signals.js";

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
} as const;

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

const observationConfig = {
  staleLotteryTicketNoSignal: "STALE_LOTTERY_TICKET_NO",
  oneTouchHighEdgeSignalNo: "ONE_TOUCH_HIGH_EDGE_NO",
  oneTouchHighEdgeSignalYes: "ONE_TOUCH_HIGH_EDGE_YES_SHADOW",
  oneTouchNoShadowMinSellYesEdgePts: 1,
  oneTouchNoShadowMaxSpread: 0.03,
  oneTouchNoShadowMinLiquidity: 5000,
};

describe("blocked signal observations", () => {
  it("emits stable notes for core shadow families", () => {
    const notes = buildBlockedSignalObservations({
      bySignal: [
        { signalType: "OPT_IV_GT_PM_IV_DOWNSIDE", resolved: 4, wouldHaveWon: 4, wouldHaveLost: 0, avgPnlPct: 12.34 },
        { signalType: "MONOTONIC_ARB", resolved: 3, wouldHaveWon: 1, wouldHaveLost: 2, avgPnlPct: -1.23 },
        { signalType: "USER_MANUAL", resolved: 3, wouldHaveWon: 0, wouldHaveLost: 3, avgPnlPct: -5 },
      ],
    }, observationConfig);

    expect(notes).toEqual([
      "OPT_IV_GT_PM_IV missing downside leg is profitable: 4/4 below-contract shadows would have won. The engine is leaving money on the table by ignoring the downside contract.",
      "MONOTONIC_ARB setup category has execution/model breaks: 2/3 shadow packages lost money despite locked-edge screening, avg P&L -1.23%.",
      "USER_MANUAL manual shadow signal is weak: 3/3 shadows would have lost, avg P&L -5.00%.",
    ]);
  });

  it("uses configured one-touch thresholds in observation text", () => {
    const notes = buildBlockedSignalObservations({
      bySignal: [
        { signalType: "ONE_TOUCH_HIGH_EDGE_NO", resolved: 4, wouldHaveWon: 4, wouldHaveLost: 0, avgPnlPct: 20 },
      ],
    }, observationConfig);

    expect(notes[0]).toContain("sell_yes_edge_pts >= 1");
    expect(notes[0]).toContain("spread <= 3c");
    expect(notes[0]).toContain("liquidity >= 5000");
  });
});
