import { describe, expect, it } from "vitest";
import {
  MAX_DATA_REQUESTS,
  MAX_SAMPLE_ROWS,
  buildQueryCatalogPromptSection,
  executeResearchQueries,
  executeResearchQuery,
  formatQueryResults,
  parseDataRequests,
  type ResearchDataset,
} from "./research-queries.js";
import type { LedgerTrade } from "../../portfolio-ledger.js";

function trade(partial: Partial<LedgerTrade> = {}): LedgerTrade {
  return {
    id: "T-1", openedAt: "2026-07-01T00:00:00Z", closedAt: "2026-07-05T00:00:00Z",
    asset: "BTC", venue: "hyperliquid", direction: "long",
    entryPrice: 100, exitPrice: 102, size: 1, pnl: 0.02, pnlPct: 2,
    marketPnl: 0.02, fundingPnl: 0, signalType: "FUNDING_EXTREME_LONG",
    ...partial,
  } as LedgerTrade;
}

const dataset: ResearchDataset = {
  trades: [
    trade({ id: "T-1", asset: "BTC", pnl: 0.05, pnlPct: 5, closedAt: "2026-07-05T00:00:00Z" }),
    trade({ id: "T-2", asset: "ETH", pnl: -0.03, pnlPct: -3, closedAt: "2026-07-12T00:00:00Z" }),
    trade({ id: "T-3", asset: "BTC", pnl: 0.01, pnlPct: 1, closedAt: "2026-08-02T00:00:00Z" }),
    trade({ id: "T-4", asset: "BTC", signalType: "MOMENTUM_LONG", pnl: -0.10, pnlPct: -10, closedAt: "2026-08-03T00:00:00Z" }),
  ],
  shadows: [
    { id: "S-1", status: "resolved", signalType: "ONE_TOUCH_HIGH_EDGE_NO", asset: "BTC", direction: "short", resolvedAt: "2026-07-20T00:00:00Z", hypotheticalResult: { outcome: "win", pnl: 0.04, pnlPct: 4 } },
    { id: "S-2", status: "resolved", signalType: "ONE_TOUCH_HIGH_EDGE_NO", asset: "ETH", direction: "short", resolvedAt: "2026-07-22T00:00:00Z", hypotheticalResult: { outcome: "loss", pnl: -0.02, pnlPct: -2 } },
    { id: "S-3", status: "open", signalType: "ONE_TOUCH_HIGH_EDGE_NO", asset: "BTC", hypotheticalResult: null },
    { id: "S-4", status: "resolved", learningExcluded: true, signalType: "ONE_TOUCH_HIGH_EDGE_NO", asset: "BTC", resolvedAt: "2026-07-23T00:00:00Z", hypotheticalResult: { outcome: "win", pnl: 99, pnlPct: 9900 } },
  ],
  hypotheses: [
    {
      id: "H-1", setupId: "family_a", tests: [
        { date: "2026-07-01", outcome: "win", magnitude: 2.5, magnitudeUnit: "pct_return" },
        { date: "2026-07-02", outcome: "loss", magnitude: -1.0, magnitudeUnit: "pct_return" },
        { date: "2026-07-03", outcome: "pending" },
        { date: "2026-07-04", outcome: "loss", excludedFromSetupStats: true, exclusionReason: "unscorable_scorer_v2:unscorable_direction" },
      ],
    },
    { id: "H-2", setupId: "family_b", tests: [{ date: "2026-07-05", outcome: "win", magnitude: 0.5, magnitudeUnit: "pct_return" }] },
  ],
  valuationRows: Array.from({ length: 300 }, (_, i) => ({ date: `row-${i}`, btc_spot: String(100 + i), blank_col: "" })),
};

describe("parseDataRequests", () => {
  it("parses each supported kind and drops unknown ones", () => {
    const queries = parseDataRequests([
      { kind: "trades", signalType: "FUNDING_EXTREME_LONG", groupBy: "asset" },
      { kind: "shadows", asset: "BTC" },
      { kind: "hypothesis_tests", setupId: "family_a", includeUnscorable: true },
      { kind: "market_stats", column: "btc_spot", windowRows: 90 },
      { kind: "drop_table_users" },
      { kind: "market_stats" },
    ]);
    expect(queries.map((q) => q.kind)).toEqual(["trades", "shadows", "hypothesis_tests", "market_stats"]);
  });

  it("caps the number of requests", () => {
    const many = Array.from({ length: 30 }, () => ({ kind: "trades" }));
    expect(parseDataRequests(many)).toHaveLength(MAX_DATA_REQUESTS);
  });

  it("ignores non-array and malformed input", () => {
    expect(parseDataRequests(null)).toEqual([]);
    expect(parseDataRequests("trades")).toEqual([]);
    expect(parseDataRequests([null, 5, "x"])).toEqual([]);
  });

  it("drops an invalid groupBy rather than passing it through", () => {
    const [q] = parseDataRequests([{ kind: "trades", groupBy: "; DROP" }]);
    expect((q as { groupBy?: string }).groupBy).toBeUndefined();
  });
});

describe("trades query", () => {
  it("filters by signal and date window and computes expectancy stats", () => {
    const result = executeResearchQuery(
      { kind: "trades", signalType: "FUNDING_EXTREME_LONG", closedFrom: "2026-07-01", closedTo: "2026-07-31" },
      dataset,
    );
    expect(result.n).toBe(2);
    expect(result.summary.wins).toBe(1);
    expect(result.summary.totalPnl).toBeCloseTo(0.02, 5);
    expect(result.summary.pMeanPnlPositive).not.toBeNull();
  });

  it("groups by asset", () => {
    const result = executeResearchQuery({ kind: "trades", groupBy: "asset" }, dataset);
    const btc = result.groups!.find((g) => g.key === "BTC")!;
    expect(btc.n).toBe(3);
    expect(result.groups!.find((g) => g.key === "ETH")!.n).toBe(1);
  });

  it("filters by outcome", () => {
    expect(executeResearchQuery({ kind: "trades", outcome: "loss" }, dataset).n).toBe(2);
  });

  it("caps returned sample rows", () => {
    const big: ResearchDataset = { ...dataset, trades: Array.from({ length: 50 }, (_, i) => trade({ id: `T-${i}` })) };
    expect(executeResearchQuery({ kind: "trades" }, big).samples).toHaveLength(MAX_SAMPLE_ROWS);
  });
});

describe("shadows query", () => {
  it("counts only resolved, non-excluded shadows", () => {
    const result = executeResearchQuery({ kind: "shadows", signalType: "ONE_TOUCH_HIGH_EDGE_NO" }, dataset);
    expect(result.n).toBe(2); // open S-3 and learning-excluded S-4 are both omitted
    expect(result.summary.totalPnl).toBeCloseTo(0.02, 5);
  });

  it("filters by asset", () => {
    expect(executeResearchQuery({ kind: "shadows", asset: "ETH" }, dataset).n).toBe(1);
  });
});

describe("hypothesis_tests query", () => {
  it("excludes pending and unscorable tests by default", () => {
    const result = executeResearchQuery({ kind: "hypothesis_tests", setupId: "family_a" }, dataset);
    expect(result.n).toBe(2);
    expect(result.summary.totalPnl).toBeCloseTo(1.5, 5); // 2.5 + (-1.0) realized edge
  });

  it("can include unscorable tests for diagnosing burn", () => {
    const result = executeResearchQuery(
      { kind: "hypothesis_tests", setupId: "family_a", includeUnscorable: true, groupBy: "exclusionReason" },
      dataset,
    );
    expect(result.n).toBe(3);
    expect(result.groups!.some((g) => g.key.includes("unscorable_direction"))).toBe(true);
  });

  it("groups across families", () => {
    const result = executeResearchQuery({ kind: "hypothesis_tests", groupBy: "setupId" }, dataset);
    expect(result.groups!.map((g) => g.key).sort()).toEqual(["family_a", "family_b"]);
  });
});

describe("market_stats query", () => {
  it("summarises a numeric column", () => {
    const result = executeResearchQuery({ kind: "market_stats", column: "btc_spot", windowRows: 100 }, dataset);
    expect(result.n).toBe(100);
    expect(result.summary.last).toBe(399);
    expect(result.summary.median).toBeGreaterThan(Number(result.summary.min));
  });

  it("reports an error for a column with no numeric data", () => {
    const result = executeResearchQuery({ kind: "market_stats", column: "blank_col" }, dataset);
    expect(result.error).toContain("no numeric data");
  });

  it("reports an error for a column that does not exist", () => {
    expect(executeResearchQuery({ kind: "market_stats", column: "nope" }, dataset).error).toBeTruthy();
  });
});

describe("batch execution and formatting", () => {
  it("never throws on a bad query and caps the batch", () => {
    const queries = Array.from({ length: 20 }, () => ({ kind: "market_stats", column: "nope" }) as const);
    const results = executeResearchQueries(queries, dataset);
    expect(results).toHaveLength(MAX_DATA_REQUESTS);
    expect(results.every((r) => r.error)).toBe(true);
  });

  it("formats results with an instruction to answer", () => {
    const text = formatQueryResults(executeResearchQueries([{ kind: "trades", groupBy: "asset" }], dataset));
    expect(text).toContain("DATA REQUEST RESULTS");
    expect(text).toContain("Now produce the final advice JSON");
    expect(text).toContain("summary");
  });

  it("documents every executable kind in the prompt catalog", () => {
    const catalog = buildQueryCatalogPromptSection();
    for (const kind of ["trades", "shadows", "hypothesis_tests", "market_stats"]) {
      expect(catalog).toContain(`"${kind}"`);
    }
  });
});
