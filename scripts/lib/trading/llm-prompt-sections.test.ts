import { describe, expect, it } from "vitest";
import {
  formatActiveHypothesesPrompt,
  formatAllowedActionSurfacePrompt,
  formatPortfolioPromptSummary,
  formatRecentClosedTradesPrompt,
  formatSignalPerformancePrompt,
} from "./llm-prompt-sections.js";

describe("LLM prompt section helpers", () => {
  it("formats portfolio summary exactly as the prompt expects", () => {
    expect(formatPortfolioPromptSummary({
      cash: 87.3467,
      positions: [{ id: "T-1" }, { id: "T-2" }],
      totalRealizedPnl: 0.9344,
      totalTrades: 198,
      winCount: 99,
    })).toBe("Cash: $87.35 | Open positions: 2 | Realized P&L: $0.93\nWin rate: 50% over 198 trades");
  });

  it("formats allowed action surface with stable counts", () => {
    expect(formatAllowedActionSurfacePrompt({
      llmCloseEligibility: [{ positionId: "T-1", allowed: true }],
      entryCandidates: [{ type: "PC_RATIO_EXTREME_HIGH" }, { type: "PC_RATIO_EXTREME_LOW" }],
      mechanicalExits: [],
      signalKillExits: [{ positionId: "T-2" }],
    })).toBe(`{
 "llmCloseEligibility": [
  {
   "positionId": "T-1",
   "allowed": true
  }
 ],
 "candidateEntryCount": 2,
 "mechanicalExitCount": 0,
 "signalKillExitCount": 1
}`);
  });

  it("formats signal performance including disabled asset notes", () => {
    expect(formatSignalPerformancePrompt([{
      type: "PC_RATIO_EXTREME_HIGH",
      weight: 0.75,
      trades: 4,
      wins: 3,
      avgPnlPct: 1.234,
      perAsset: { BTC: { trades: 2, wins: 1, avgPnlPct: -0.5, disabled: true } },
    }])).toBe("  PC_RATIO_EXTREME_HIGH: weight=0.75, 3/4 wins (75%), avg pnl=1.23% | disabled assets: BTC disabled (1/2 wins, avg pnl=-0.50%)");
  });

  it("formats hypothesis and closed-trade sections", () => {
    expect(formatActiveHypothesesPrompt([{
      id: "H-1",
      setupId: "btc_momentum",
      description: "BTC breaks out above trend",
      status: "active",
      winRate: 0.5,
      tests: [{}, {}],
      postMortem: null,
    }])).toBe("  H-1 (btc_momentum): BTC breaks out above trend [active, 50% over 2 variant tests]");

    expect(formatRecentClosedTradesPrompt([{
      asset: "BTC",
      direction: "long",
      venue: "spot",
      closeReason: "target",
      pnl: 0.25,
      marketPnl: 0.2,
      fundingPnl: 0.05,
    }])).toBe("  BTC long via spot/legacy target: +$0.2500 (market=0.2000, funding=0.0500) [n/a]");
  });
});
