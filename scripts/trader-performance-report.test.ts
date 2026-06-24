import { describe, expect, it } from "vitest";
import {
  buildCsvReport,
  buildMarkdownReport,
  currentBidAsk,
  detailCsvRow,
  markdownOpenShadows,
  markdownPendingHypotheses,
  relativeValueContextNote,
  relativeValueEntryMatch,
  statsCsvRow,
  table,
  type Position,
} from "./trader-performance-report.js";
import type { Stats } from "./lib/reporting/stats.js";

const position: Position = {
  id: "test-position",
  openedAt: "2026-06-01T12:30:00.000Z",
  asset: "BTC",
  venue: "polymarket",
  direction: "long",
  entryPrice: 0.4,
  currentPrice: 0.5,
  size: 1,
  signalType: "TEST",
  hypothesisId: null,
  thesis: "test",
  instrumentType: "pm_yes",
  instrumentId: "btc-hit-jun-2026::123",
};

const stats = (overrides: Partial<Stats> = {}): Stats => ({
  trades: 2,
  wins: 1,
  losses: 1,
  pnl: 1.25,
  pnlPctSum: 12.5,
  ...overrides,
});

const emptyHybridBot = {
  available: false,
  stateLastModified: null,
  feedLastModified: null,
  positions: new Map(),
  perCoinStats: new Map(),
  totalsAcrossAllCoins: {
    trades: 0,
    wins: 0,
    losses: 0,
    realizedPnlUsd: 0,
    realizedPnlPctSum: 0,
    feesUsd: 0,
    opens: 0,
    closes: 0,
    lastEventTs: null,
  },
};

describe("trader report relative-value provenance", () => {
  it("marks heatmap snapshots as snapshot with distance from open time", () => {
    const match = relativeValueEntryMatch(
      new Map(),
      position,
      position.openedAt,
      { timestamp: "2026-06-01T12:00:00.000Z", options_touch_adjusted_prob: "0.42" },
    );

    expect(match.source).toBe("snapshot");
    expect(match.timestamp?.toISOString()).toBe("2026-06-01T12:00:00.000Z");
    expect(match.distanceHours).toBeCloseTo(0.5);
  });

  it("finds the nearest history row and reports distance from open time", () => {
    const match = relativeValueEntryMatch(
      new Map([
        ["btc-hit-jun-2026::123", [
          { timestamp: new Date("2026-06-01T10:00:00.000Z"), row: { timestamp: "2026-06-01 10:00" } },
          { timestamp: new Date("2026-06-01T13:00:00.000Z"), row: { timestamp: "2026-06-01 13:00" } },
        ]],
      ]),
      position,
      position.openedAt,
    );

    expect(match.source).toBe("history_nearest");
    expect(match.timestamp?.toISOString()).toBe("2026-06-01T13:00:00.000Z");
    expect(match.distanceHours).toBeCloseTo(0.5);
  });

  it("marks exact timestamp matches separately from nearest history matches", () => {
    const match = relativeValueEntryMatch(
      new Map([
        ["btc-hit-jun-2026::123", [
          { timestamp: new Date("2026-06-01T12:30:00.000Z"), row: { timestamp: "2026-06-01 12:30" } },
        ]],
      ]),
      position,
      position.openedAt,
    );

    expect(match.source).toBe("history_exact");
    expect(match.distanceHours).toBe(0);
  });

  it("marks missing rows when no match is available within the max distance", () => {
    const match = relativeValueEntryMatch(
      new Map([
        ["btc-hit-jun-2026::123", [
          { timestamp: new Date("2026-05-29T12:30:00.000Z"), row: { timestamp: "2026-05-29 12:30" } },
        ]],
      ]),
      position,
      position.openedAt,
    );

    expect(match.source).toBe("missing");
    expect(match.row).toBeUndefined();
    expect(match.distanceHours).toBeNull();
  });

  it("converts YES bid/ask into NO token bid/ask", () => {
    expect(currentBidAsk({ pm_best_bid: "0.25", pm_best_ask: "0.30" }, "pm_no")).toEqual({
      bid: 0.7,
      ask: 0.75,
    });
  });

  it("includes model, market, provenance, and current row age in context notes", () => {
    const note = relativeValueContextNote({
      entryMatch: {
        row: { timestamp: "2026-06-01T12:00:00.000Z" },
        source: "snapshot",
        timestamp: new Date("2026-06-01T12:00:00.000Z"),
        distanceHours: 0.5,
      },
      currentRow: {
        timestamp: "2026-06-08T17:00:00.000Z",
        options_touch_adjusted_prob: "0.55",
        pm_best_bid: "0.44",
        pm_best_ask: "0.46",
      },
      generatedAt: "2026-06-08T18:30:00.000Z",
      entryModel: 0.42,
      currentModel: 0.55,
      bidAsk: { bid: 0.44, ask: 0.46 },
      strike: "$100,000",
      expiry: "June",
    });

    expect(note).toContain("entry_model=0.420000");
    expect(note).toContain("current_model=0.550000");
    expect(note).toContain("current_bid=0.4400");
    expect(note).toContain("current_ask=0.4600");
    expect(note).toContain("strike=$100,000");
    expect(note).toContain("expiry=June");
    expect(note).toContain("entry_row_source=snapshot");
    expect(note).toContain("entry_row_distance_hours=0.50");
    expect(note).toContain("current_row_source=current");
    expect(note).toContain("current_row_age_hours=1.50");
  });
});

describe("trader report row builders", () => {
  it("builds summary CSV rows with stable field placement", () => {
    const row = statsCsvRow("summary", "test_group", stats());

    expect(row.slice(0, 9)).toEqual([
      "summary",
      "test_group",
      "2",
      "1",
      "1",
      "50.0",
      "1.250000",
      "0.625000",
      "6.2500",
    ]);
    expect(row[9]).toBe("");
    expect(row[12]).toBe("");
  });

  it("adds detail fields on top of summary CSV rows", () => {
    const row = detailCsvRow("detail", "group", stats({ trades: 0, wins: 0, losses: 0, pnl: 0, pnlPctSum: 0 }), "id-1", "open", "BTC", "notes");

    expect(row[0]).toBe("detail");
    expect(row[9]).toBe("id-1");
    expect(row[10]).toBe("open");
    expect(row[11]).toBe("BTC");
    expect(row[12]).toBe("notes");
    expect(row[5]).toBe("");
  });

  it("builds Markdown stats tables with escaping, averages, limits, and empty states", () => {
    expect(table("Empty", [])).toContain("| None | 0 | 0 | 0 | n/a | +$0.0000 | +$0.0000 | +0.00% |");

    const lines = table("Stats", [
      ["BTC | breakout", stats()],
      ["ETH", stats({ trades: 1, wins: 1, losses: 0, pnl: 2, pnlPctSum: 10 })],
    ], 1);

    expect(lines[0]).toBe("## Stats");
    expect(lines).toContain("| BTC \\| breakout | 2 | 1 | 1 | 50.0% | +$1.2500 | +$0.6250 | +6.25% |");
    expect(lines).toContain("| ... 1 more |  |  |  |  |  |  |  |");
  });

  it("builds pending hypothesis rows sorted by pending tests", () => {
    const lines = markdownPendingHypotheses([
      {
        id: "hyp-1",
        setupLabel: "Breakout | test",
        description: "Watch breakout continuation",
        tests: [
          { date: "2026-06-01", outcome: "pending" },
          { date: "2026-06-02", outcome: "win" },
        ],
        winRate: 1,
        status: "active",
        promotedToSignal: false,
        source: "llm",
      },
    ]);

    expect(lines).toContain("| hyp-1 | Breakout \\| test | active | 1 | 1/0 | 100.0% | Watch breakout continuation |");
  });

  it("builds open shadow rows with escaped thesis and unrealized P&L", () => {
    const lines = markdownOpenShadows([
      {
        id: "shadow-1",
        status: "open",
        blockedAt: "2026-06-01T00:00:00.000Z",
        blockedReason: "manual",
        signalType: "TEST",
        asset: "BTC",
        venue: "polymarket",
        direction: "long",
        thesis: "edge | note",
        position,
      },
    ]);

    const joined = lines.join("\n");
    expect(joined).toContain("| shadow-1 | manual / TEST | BTC | polymarket | long | +$0.2500 | 2026-06-01T00:00:00.000Z |");
    expect(joined).toContain("instrument_type=pm_yes; instrument_id=btc-hit-jun-2026::123; entry=0.4; current=0.5; edge \\| note");
  });

  it("excludes monotonic package shadows from macro open-shadow reports", () => {
    const lines = markdownOpenShadows([
      {
        id: "macro-shadow",
        status: "open",
        blockedAt: "2026-06-01T00:00:00.000Z",
        blockedReason: "manual",
        signalType: "TEST",
        asset: "BTC",
        venue: "polymarket",
        direction: "long",
        thesis: "macro shadow",
        position,
      },
      {
        id: "monotonic-shadow",
        status: "open",
        blockedAt: "2026-06-01T00:01:00.000Z",
        blockedReason: "monotonic_arb_shadow",
        signalType: "MONOTONIC_ARB",
        asset: "GOLD",
        venue: "polymarket",
        direction: "long",
        thesis: "monotonic package",
        position: {
          ...position,
          id: "monotonic-position",
          asset: "GOLD",
          signalType: "MONOTONIC_ARB",
          instrumentType: "pm_package",
          instrumentId: "gc-hit-jun-2026::YES-1+NO-2",
          instrumentLabel: "gc-hit-jun-2026 — monotonic arb package — YES 9000 / NO 10000",
        },
      },
    ]);

    const joined = lines.join("\n");
    expect(joined).toContain("macro-shadow");
    expect(joined).not.toContain("monotonic-shadow");
  });

  it("keeps full CSV and Markdown report builder headers stable for empty reports", () => {
    const baseArgs = {
      generatedAt: "2026-06-08T18:00:00.000Z",
      portfolio: {
        cash: 10,
        positions: [],
        totalRealizedPnl: 0,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        lastUpdated: "2026-06-08T17:00:00.000Z",
      },
      allTradeStats: stats({ trades: 0, wins: 0, losses: 0, pnl: 0, pnlPctSum: 0 }),
      rawTradeStats: stats({ trades: 0, wins: 0, losses: 0, pnl: 0, pnlPctSum: 0 }),
      allShadowStats: stats({ trades: 0, wins: 0, losses: 0, pnl: 0, pnlPctSum: 0 }),
      duplicateTradeIds: new Set<string>(),
      operationallyTaintedTrades: [],
      tradeSetupRows: [],
      assetRows: [],
      tradeTypeAssetRows: [],
      venueAssetRows: [],
      shadowTypeRows: [],
      shadowTypeAssetRows: [],
      setupRows: [],
      hypotheses: [],
      shadows: [],
      hypothesesById: new Map(),
      hybridBot: emptyHybridBot,
    };
    const csv = buildCsvReport({
      ...baseArgs,
      rawTrades: [],
      resolvedTrades: [],
      resolvedShadows: [],
      hyperliquidMids: new Map(),
    });
    const markdown = buildMarkdownReport(baseArgs);

    expect(csv.split("\n")[0]).toContain("entry_row_distance_hours,current_model_source,current_row_timestamp,current_row_age_hours");
    expect(csv).toContain("summary,generated_at");
    expect(markdown).toContain("| Position | Signal | Asset | Venue | Direction | Unrealized P&L | Entry | Current | Opened | Model Context | Thesis |");
    expect(markdown).toContain("| None | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | No open positions |");
  });
});
