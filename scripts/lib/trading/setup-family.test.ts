import { describe, expect, it } from "vitest";
import { finalizeSetupTruthRecord, setupIdForSignalType, slugifySetupId } from "./setup-family.js";

const config = {
  oneTouchHighEdgeSignalNo: "ONE_TOUCH_HIGH_EDGE_NO",
  oneTouchHighEdgeSignalYes: "ONE_TOUCH_HIGH_EDGE_YES_SHADOW",
  staleLotteryTicketNoSignal: "STALE_LOTTERY_TICKET_NO",
};

function record(overrides: Partial<Parameters<typeof finalizeSetupTruthRecord>[0]> = {}) {
  return {
    setupLabel: "BTC momentum",
    status: "exploratory" as const,
    currentConclusion: "",
    knownInvalidAssumptions: [],
    evidenceSummary: {
      cleanTrades: 0,
      tradeWins: 0,
      avgTradePnlPct: 0,
      resolvedShadows: 0,
      shadowWins: 0,
      avgShadowPnlPct: 0,
      hypothesisTests: 0,
    },
    ...overrides,
  };
}

describe("setup family helpers", () => {
  it("slugifies setup labels without truncating", () => {
    expect(slugifySetupId("  BTC PM-IV / Compression!  ")).toBe("btc_pm_iv_compression");
  });

  it("maps special and fallback signal types to setup ids", () => {
    expect(setupIdForSignalType("ONE_TOUCH_HIGH_EDGE_NO", config)).toEqual({
      setupId: "one_touch_high_edge_no",
      setupLabel: "One-touch NO sell-YES edge",
    });
    expect(setupIdForSignalType("BTC_DOWNSIDE", config)).toEqual({
      setupId: "btc_downside",
      setupLabel: "Btc Downside Leg",
    });
    expect(setupIdForSignalType("GOLD_PM_PROXY_SHORT", config)).toEqual({
      setupId: "gold_pm_proxy_short",
      setupLabel: "Gold Polymarket Proxy Short",
    });
  });

  it("marks contaminated records for clean retest before sample size is sufficient", () => {
    const finalized = finalizeSetupTruthRecord(record({
      knownInvalidAssumptions: ["legacy contaminated trade"],
      evidenceSummary: { ...record().evidenceSummary, cleanTrades: 1 },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 });

    expect(finalized.status).toBe("contaminated_retest");
    expect(finalized.currentConclusion).toContain("under clean retest");
  });

  it("marks disabled, eligible, validating, and exploratory states", () => {
    expect(finalizeSetupTruthRecord(record({
      evidenceSummary: { ...record().evidenceSummary, cleanTrades: 5, tradeWins: 1, avgTradePnlPct: 0.2 },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 }).status).toBe("disabled");

    expect(finalizeSetupTruthRecord(record({
      evidenceSummary: { ...record().evidenceSummary, cleanTrades: 5, tradeWins: 4, avgTradePnlPct: 1.2 },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 }).status).toBe("eligible_live");

    expect(finalizeSetupTruthRecord(record({
      evidenceSummary: { ...record().evidenceSummary, hypothesisTests: 5 },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 }).status).toBe("validating");

    expect(finalizeSetupTruthRecord(record(), { killThreshold: 0.4, promoteThreshold: 0.65 }).status).toBe("exploratory");
  });

  it("promotes a profitable family that never reaches the win-rate bar", () => {
    // The gated one-touch shape: right 57% of the time, but +5.8%/trade.
    const finalized = finalizeSetupTruthRecord(record({
      evidenceSummary: {
        ...record().evidenceSummary,
        resolvedShadows: 58,
        shadowWins: 33,
        avgShadowPnlPct: 5.81,
        shadowPnlStdPct: 13,
      },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 });

    expect(finalized.status).toBe("eligible_live");
  });

  it("disables a family that is often right but significantly loses money", () => {
    const finalized = finalizeSetupTruthRecord(record({
      evidenceSummary: {
        ...record().evidenceSummary,
        resolvedShadows: 60,
        shadowWins: 42,
        avgShadowPnlPct: -3.5,
        shadowPnlStdPct: 6,
      },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 });

    expect(finalized.status).toBe("disabled");
  });

  it("ignores the expectancy route when dispersion is unknown or the sample is small", () => {
    const noStd = finalizeSetupTruthRecord(record({
      evidenceSummary: { ...record().evidenceSummary, resolvedShadows: 58, shadowWins: 33, avgShadowPnlPct: 5.81 },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 });
    expect(noStd.status).toBe("validating");

    const tooFew = finalizeSetupTruthRecord(record({
      evidenceSummary: {
        ...record().evidenceSummary,
        resolvedShadows: 12,
        shadowWins: 7,
        avgShadowPnlPct: 5.81,
        shadowPnlStdPct: 13,
      },
    }), { killThreshold: 0.4, promoteThreshold: 0.65 });
    expect(tooFew.status).toBe("validating");
  });
});
