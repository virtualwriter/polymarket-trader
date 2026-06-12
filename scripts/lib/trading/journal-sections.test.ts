import { describe, expect, it } from "vitest";
import { blockedSignalJournalSection, closedTradesJournalSection, portfolioJournalSection } from "./journal-sections.js";

describe("journal section helpers", () => {
  it("formats portfolio and closed-trade sections", () => {
    expect(portfolioJournalSection({
      cash: 87.25,
      positions: [{ id: "open-1" }],
      totalRealizedPnl: 1.23456,
      totalTrades: 4,
      winCount: 3,
    })[0]).toBe("**Portfolio:** $88.25 total | Cash $87.25 | 1 open | P&L $1.2346 | 75% win rate (4 trades)");

    expect(closedTradesJournalSection([{
      asset: "BTC",
      direction: "long",
      venue: "spot",
      signalType: "MOMENTUM_LONG",
      closeReason: "target",
      pnl: 0.25,
      pnlPct: 2.5,
    }])[1]).toContain("BTC long via spot/legacy [n/a] (MOMENTUM_LONG) → target: +$0.2500");
  });

  it("formats blocked signal learning with close-reason labels", () => {
    const lines = blockedSignalJournalSection([], {
      openCount: 1,
      resolvedCount: 1,
      wouldHaveWon: 1,
      wouldHaveLost: 0,
      recentResolved: [{
        outcome: "win",
        blockedReason: "one_touch_high_edge_shadow",
        signalType: "ONE_TOUCH_HIGH_EDGE_NO",
        asset: "GOLD",
        direction: "short",
        venue: "polymarket",
        closeReason: "expiry",
        pnlPct: 12.34,
      }],
    });

    expect(lines).toContain("- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have expired (+12.34%)");
  });
});
