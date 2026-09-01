import { describe, expect, it } from "vitest";
import {
  HYPOTHESIS_SHADOW_TESTS_EXTENDED_CAP,
  appendPostMortemSegment,
  binomialPValue,
  deriveContractEntry,
  distinctEligibleContracts,
  PM_CONTRACT_MAX_PENDING_PER_VARIANT,
  empiricalBaseRate,
  evaluateHypothesisTest,
  evidenceBackedDirection,
  fundingAnnConditionKey,
  hypothesisScoringMode,
  hypothesisSetupFamilies,
  hypothesisSetupNeedsMoreShadowTests,
  inferHypothesisAsset,
  resolveHypothesisDirection,
  setupFamilyIsDecisive,
  promoteWinRateFloor,
  setupFamilyIsPromotable,
  setupFamilyIsUnprofitable,
  setupMagnitudeEvidence,
  sweepUnscorableHypotheses,
  isPolymarketExpression,
  estimateWeeksToVerdict,
  isTooSlowToVerdict,
  MAX_TEST_HORIZON_DAYS,
  MAX_WEEKS_TO_VERDICT,
  estimateTriggerFrequency,
  isTriggerTooRare,
  conditionsReplayableFromValuationHistory,
  pendingHypothesisTests,
  MIN_TRIGGERS_PER_WEEK,
  UNSCORABLE_BURN_RETIRE_THRESHOLD,
  PROMOTE_SIGNIFICANCE_ALPHA,
  PROMOTION_GROUPS,
  dedupePooledGroupTests,
  promotionGroupForSetup,
  type Hypothesis,
  type HypothesisTest,
  type RelativeValueObservation,
  type SnapshotRow,
} from "./hypothesis-shadow-eval.js";

function hyp(partial: Partial<Hypothesis> & Pick<Hypothesis, "prediction" | "conditions">): Hypothesis {
  return {
    id: partial.id ?? "H-TEST",
    created: "2026-07-01",
    description: partial.description ?? "test hyp",
    conditions: partial.conditions,
    prediction: partial.prediction,
    timeframeDays: partial.timeframeDays ?? 14,
    confidence: partial.confidence ?? 0.6,
    direction: partial.direction,
    originFindingId: partial.originFindingId,
    tests: [],
    winRate: 0,
    status: "active",
    promotedToSignal: false,
    postMortem: null,
    source: "llm",
    setupId: partial.setupId,
    setupLabel: partial.setupLabel,
  };
}

function row(date: string, fields: Record<string, number>): SnapshotRow {
  return { date, ...fields };
}

function contractRow(
  partial: Partial<RelativeValueObservation> & { marketId: string; pmYes: number },
): RelativeValueObservation {
  return {
    timestamp: partial.timestamp ?? "2026-07-01T00:00:00Z",
    modelVersion: "",
    asset: partial.asset ?? "BTC",
    eventSlug: partial.eventSlug ?? "slug",
    marketId: partial.marketId,
    question: "",
    contractMonth: "",
    direction: partial.direction ?? "above",
    strike: partial.strike ?? 120_000,
    expiry: partial.expiry ?? "2026-08-01T00:00:00Z",
    pmYes: partial.pmYes,
    pmBid: null,
    pmAsk: null,
    pmSpread: partial.pmSpread ?? null,
    modelProb: null,
    underlyingCapYes: null,
    pmToUnderlyingCapRatio: null,
    underlyingCapSignal: "",
    settlementYesSum: null,
    settlementOverround: null,
    settlementTailYes: null,
    settlementSkewYes: null,
    edgePts: null,
    bestExpression: "",
    optionIv: null,
    pmIv: null,
    cboeNoGapPts: null,
    cmeNoGapPts: null,
    adjustedNoGapPts: null,
    sourceAgreementBucket: "",
    noBiasCandidatePassed: false,
    liquidity: partial.liquidity ?? 10_000,
    perpFundingAnn: null,
    perpOiUsd: null,
    perpBasisPct: null,
    sellYesEdgePts: partial.sellYesEdgePts ?? null,
    flags: "",
  };
}

describe("empiricalBaseRate", () => {
  /** `days` daily rows where the asset drifts by `dailyPct` each step. */
  function drift(days: number, dailyPct: number): SnapshotRow[] {
    const rows: SnapshotRow[] = [];
    let price = 100;
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      rows.push(row(date, { btc_spot: price }));
      price *= 1 + dailyPct / 100;
    }
    return rows;
  }

  it("measures a criterion that is almost always true as a high null", () => {
    // Rising 3%/day makes "BTC gains > 2% in 1 day" true in every window, so a
    // family winning 60% of the time is well BELOW chance, not above it.
    const h = hyp({
      direction: "long",
      prediction: "BTC gains > 2% within 1 day",
      conditions: { asset: "BTC" },
      timeframeDays: 1,
    });
    const measured = empiricalBaseRate(h, drift(80, 3));
    expect(measured).not.toBeNull();
    expect(measured!.baseRate).toBeCloseTo(1, 6);
    expect(measured!.days).toBeGreaterThanOrEqual(20);
  });

  it("measures a criterion that never fires as a null of zero", () => {
    const h = hyp({
      direction: "long",
      prediction: "BTC gains > 2% within 1 day",
      conditions: { asset: "BTC" },
      timeframeDays: 1,
    });
    const measured = empiricalBaseRate(h, drift(80, 0.1));
    expect(measured!.baseRate).toBe(0);
  });

  it("returns null rather than guessing when there are too few windows", () => {
    const h = hyp({
      direction: "long",
      prediction: "BTC gains > 2% within 1 day",
      conditions: { asset: "BTC" },
      timeframeDays: 1,
    });
    expect(empiricalBaseRate(h, drift(5, 3))).toBeNull();
  });

  it("measures hour-truncated timestamps, the format the engine actually stores", () => {
    // daily-valuations.csv writes "2026-08-21T20", which Date.parse rejects.
    // A strict parse made this silently return null for every family, which is
    // indistinguishable from the feature not being wired at all.
    const rows: SnapshotRow[] = [];
    let price = 100;
    for (let h = 0; h < 30 * 24; h++) {
      const day = 1 + Math.floor(h / 24);
      const hour = String(h % 24).padStart(2, "0");
      rows.push(row(`2026-01-${String(day).padStart(2, "0")}T${hour}`, { btc_spot: price }));
      price *= 1.005;
    }
    const h = hyp({
      direction: "long",
      prediction: "BTC gains > 2% within 1 day",
      conditions: { asset: "BTC" },
      timeframeDays: 1,
    });
    const measured = empiricalBaseRate(h, rows);
    expect(measured).not.toBeNull();
    expect(measured!.days).toBeGreaterThanOrEqual(20);
    // +0.5%/hour compounds past 2% within a day in every window.
    expect(measured!.baseRate).toBeCloseTo(1, 6);
  });

  it("declines to measure a contract thesis from spot rows", () => {
    const h = hyp({
      direction: "short",
      prediction: "the NO sale is profitable",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 3" },
      timeframeDays: 1,
    });
    expect(empiricalBaseRate(h, drift(80, 3))).toBeNull();
  });
});

describe("setupFamilyIsPromotable against a measured null", () => {
  it("promotes a record that beats a low base rate but not a coin flip", () => {
    // 18/40 = 45%: never significant against 50%, clearly so against 25%.
    expect(setupFamilyIsPromotable(18, 40, 0.4, [], 0.5)).toBe(false);
    expect(setupFamilyIsPromotable(18, 40, 0.4, [], 0.25)).toBe(true);
  });

  it("refuses a record that only looks good against a coin flip", () => {
    // 70/113 = 61.9%. Against a base rate of 45% that is a 1.38x lift and
    // significant. Against 72% — the win rate implied by the prices actually
    // paid — the same record is well below what doing nothing would produce.
    expect(setupFamilyIsPromotable(70, 113, 0.4, [], 0.45)).toBe(true);
    expect(setupFamilyIsPromotable(70, 113, 0.4, [], 0.72)).toBe(false);
  });

  it("requires the edge to be large, not merely detectable", () => {
    // 61.9% over a 50% base rate is a 1.24x lift: statistically clear on 113
    // samples, but under the size bar, so it does not promote on win rate.
    expect(binomialPValue(70, 113, 0.5)).toBeLessThan(PROMOTE_SIGNIFICANCE_ALPHA);
    expect(setupFamilyIsPromotable(70, 113, 0.4, [], 0.5)).toBe(false);
  });

  it("keeps the absolute floor when the base rate could not be measured", () => {
    expect(promoteWinRateFloor(null, 0.65)).toBe(0.65);
    expect(setupFamilyIsPromotable(70, 113, 0.65, [], null)).toBe(false);
  });

  it("stops killing families that beat their own base rate", () => {
    // 40% used to be an automatic kill. Against a criterion that comes up 33%
    // of the time by chance, 40% is an edge, so it is no longer decisive.
    expect(setupFamilyIsDecisive(17, 43, 0.65, 0.4, [], 0.33)).toBe(false);
    expect(setupFamilyIsDecisive(17, 43, 0.65, 0.4, [], null)).toBe(true);
  });
});

describe("polymarket contract scoring", () => {
  it("refuses to grade a contract thesis on the underlying's move", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO: the NO sale is profitable over the window",
      conditions: { asset: "BTC", venue: "polymarket", signalType: "ONE_TOUCH_HIGH_EDGE_NO" },
    });
    const result = evaluateHypothesisTest(
      h,
      row("2026-07-01", { btc_spot: 100 }),
      row("2026-07-08", { btc_spot: 95 }),
    );

    // Spot fell 5%, which the old proxy recorded as a win. Without a contract
    // quote there is no honest verdict to give.
    expect(result.method).toBe("awaiting_contract_scorer");
    expect(result.scorable).toBe(false);
  });

  it("scores a NO sale on the contract's own P&L", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO: the NO sale is profitable over the window",
      conditions: { asset: "BTC", venue: "polymarket", sell_yes_edge_pts: ">= 3" },
    });
    const result = evaluateHypothesisTest(
      h,
      row("2026-07-01", { btc_spot: 100 }),
      row("2026-07-08", { btc_spot: 95 }),
      {
        // NO bought at 1 - 0.30 = 0.70, marked later at 1 - 0.10 = 0.90.
        entryRows: [contractRow({ marketId: "m1", pmYes: 0.30, sellYesEdgePts: 6 })],
        exitRows: [contractRow({ marketId: "m1", pmYes: 0.10 })],
      },
    );

    expect(result.scorable).toBe(true);
    expect(result.method).toBe("pm_contract_pnl");
    expect(result.outcome).toBe("win");
    expect(result.magnitudeUnit).toBe("pct_return");
    expect(result.magnitude).toBeCloseTo(28.5714, 3);
  });

  it("records a loss when the contract moves against the position", () => {
    const h = hyp({
      direction: "short",
      prediction: "GOLD one-touch: selling the YES premium is profitable",
      conditions: { asset: "GOLD", sell_yes_edge_pts: ">= 3" },
    });
    const result = evaluateHypothesisTest(
      h,
      row("2026-07-01", { gold_gc_spot: 4000 }),
      row("2026-07-08", { gold_gc_spot: 3900 }),
      {
        // Spot fell, which the proxy would call a win, but the barrier
        // repriced against the NO: 0.80 -> 0.40.
        entryRows: [contractRow({ marketId: "g1", asset: "GOLD", pmYes: 0.20, sellYesEdgePts: 5 })],
        exitRows: [contractRow({ marketId: "g1", asset: "GOLD", pmYes: 0.60 })],
      },
    );

    expect(result.scorable).toBe(true);
    expect(result.outcome).toBe("loss");
    expect(result.magnitude).toBeCloseTo(-50, 6);
  });

  it("grades a vanished contract at terminal value from its last archived quote", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO: the NO sale is profitable over the window",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 3" },
    });
    const result = evaluateHypothesisTest(
      h,
      row("2026-07-01", { btc_spot: 100 }),
      row("2026-07-08", { btc_spot: 95 }),
      {
        // NO bought at 1 - 0.30 = 0.70; contract expired and vanished with its
        // last archived YES quote pinned at 0.01 -> NO resolved worth 1.0.
        entryRows: [contractRow({ marketId: "m1", pmYes: 0.30, sellYesEdgePts: 6 })],
        exitRows: [],
        lastArchivedYesQuote: (marketId) => (marketId === "m1" ? 0.01 : null),
      },
    );

    expect(result.scorable).toBe(true);
    expect(result.method).toBe("pm_contract_terminal");
    expect(result.outcome).toBe("win");
    expect(result.magnitude).toBeCloseTo(42.857, 2);
  });

  it("grades a vanished contract as a loss when it resolved against the side held", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO: the NO sale is profitable over the window",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 3" },
    });
    const result = evaluateHypothesisTest(
      h,
      row("2026-07-01", { btc_spot: 100 }),
      row("2026-07-08", { btc_spot: 105 }),
      {
        entryRows: [contractRow({ marketId: "m1", pmYes: 0.30, sellYesEdgePts: 6 })],
        exitRows: [],
        lastArchivedYesQuote: () => 0.99, // barrier touched: YES resolved
      },
    );

    expect(result.scorable).toBe(true);
    expect(result.method).toBe("pm_contract_terminal");
    expect(result.outcome).toBe("loss");
    expect(result.magnitude).toBeCloseTo(-100, 6);
  });

  it("stays unscorable when a vanished contract's last quote is mid-range", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO: the NO sale is profitable over the window",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 3" },
    });
    const result = evaluateHypothesisTest(
      h,
      row("2026-07-01", { btc_spot: 100 }),
      row("2026-07-08", { btc_spot: 95 }),
      {
        entryRows: [contractRow({ marketId: "m1", pmYes: 0.30, sellYesEdgePts: 6 })],
        exitRows: [],
        lastArchivedYesQuote: () => 0.55, // delisted mid-range: no honest verdict
      },
    );

    expect(result.scorable).toBe(false);
    expect(result.method).toBe("contract_exit_unavailable");
  });

  it("picks the max sell-YES-edge contract, matching the shadow opener", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO sale is profitable",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 3" },
    });
    const entry = deriveContractEntry(h, [
      contractRow({ marketId: "low", pmYes: 0.4, sellYesEdgePts: 2 }),
      contractRow({ marketId: "high", pmYes: 0.2, sellYesEdgePts: 9 }),
    ]);
    expect(entry?.marketId).toBe("high");
    expect(entry?.side).toBe("no");
    expect(entry?.entryPrice).toBeCloseTo(0.8, 6);
  });

  it("applies thresholds per contract, not reduced across all of them", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO sale is profitable",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 8", yesSpread: "<= 0.015" },
    });
    // The wide-edge contract is also wide-spread. Reducing each metric across
    // the set passes both conditions, but no single contract meets both, and
    // the tight one does not clear the edge bar either.
    const entry = deriveContractEntry(h, [
      contractRow({ marketId: "wide", pmYes: 0.02, sellYesEdgePts: 12, pmSpread: 0.06 }),
      contractRow({ marketId: "tight", pmYes: 0.30, sellYesEdgePts: 3, pmSpread: 0.01 }),
    ]);
    expect(entry).toBeNull();

    const ok = deriveContractEntry(h, [
      contractRow({ marketId: "wide", pmYes: 0.02, sellYesEdgePts: 12, pmSpread: 0.06 }),
      contractRow({ marketId: "both", pmYes: 0.28, sellYesEdgePts: 9, pmSpread: 0.01 }),
    ]);
    expect(ok?.marketId).toBe("both");
  });

  it("skips excluded markets so concurrent tests land on distinct contracts", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO sale is profitable",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 3" },
    });
    const rows = [
      contractRow({ marketId: "best", pmYes: 0.2, sellYesEdgePts: 9 }),
      contractRow({ marketId: "second", pmYes: 0.3, sellYesEdgePts: 5 }),
    ];
    expect(deriveContractEntry(h, rows)?.marketId).toBe("best");
    expect(deriveContractEntry(h, rows, new Set(["best"]))?.marketId).toBe("second");
    expect(deriveContractEntry(h, rows, new Set(["best", "second"]))).toBeNull();
  });

  it("counts distinct eligible contracts for concurrency, zero for spot theses", () => {
    const contract = hyp({
      direction: "short",
      prediction: "BTC one-touch NO sale is profitable",
      conditions: { asset: "BTC", sell_yes_edge_pts: ">= 3" },
    });
    const rows = [
      contractRow({ marketId: "a", pmYes: 0.2, sellYesEdgePts: 9 }),
      contractRow({ marketId: "b", pmYes: 0.3, sellYesEdgePts: 5 }),
      contractRow({ marketId: "thin", pmYes: 0.4, sellYesEdgePts: 1 }),
    ];
    expect(distinctEligibleContracts(contract, rows)).toBe(2);

    const spot = hyp({
      direction: "short",
      prediction: "BTC declines > 2% over the window",
      conditions: { asset: "BTC" },
    });
    expect(distinctEligibleContracts(spot, rows)).toBe(0);
  });

  it("honours a touch_direction gate when choosing the contract", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC one-touch NO sale is profitable",
      conditions: { asset: "BTC", touch_direction: "= -1", sell_yes_edge_pts: ">= 3" },
    });
    const entry = deriveContractEntry(h, [
      contractRow({ marketId: "above", pmYes: 0.2, sellYesEdgePts: 9, direction: "above" }),
      contractRow({ marketId: "below", pmYes: 0.3, sellYesEdgePts: 4, direction: "below" }),
    ]);
    expect(entry?.marketId).toBe("below");
  });

  it("still records magnitude for a plain spot thesis", () => {
    const h = hyp({
      direction: "short",
      prediction: "BTC declines > 2% over the window",
      conditions: { asset: "BTC" },
    });
    const result = evaluateHypothesisTest(
      h,
      row("2026-07-01", { btc_spot: 100 }),
      row("2026-07-08", { btc_spot: 95 }),
    );

    expect(result.method).not.toContain("pm_underlying_proxy");
    expect(typeof result.magnitude).toBe("number");
  });
});

describe("evidenceBackedDirection", () => {
  it("returns the explicit direction the scorer graded on", () => {
    expect(evidenceBackedDirection(hyp({
      direction: "short",
      prediction: "gold edge compresses toward fair value",
      conditions: { asset: "GOLD" },
    }))).toBe("short");
  });

  it("returns null for funding-reversion theses that carry no spot view", () => {
    // Graded by funding_normalize_up: the win meant funding rose, not that
    // spot did. Trading spot long off that record is unsupported.
    const h = hyp({
      prediction: "Gold funding normalizes above -20% within 48-72 hours as extreme positioning unwinds",
      conditions: { asset: "GOLD", gold_hl_funding_ann: "< -100" },
    });
    expect(hypothesisScoringMode(h)).toBe("funding");
    expect(evidenceBackedDirection(h)).toBeNull();
  });

  it("returns null when the thesis resolves neutral", () => {
    expect(evidenceBackedDirection(hyp({
      prediction: "HYPE continues above 43 within 5-7 days with PM EV following above 44",
      conditions: { asset: "HYPE" },
    }))).toBeNull();
  });

  it("disagrees with bullish prose when the scorer graded the family short", () => {
    // H-012 shape: prose reads long, scorer resolved short off the signalType,
    // so every recorded win was measured on BTC falling.
    const h = hyp({
      description: "BTC listed IV momentum confirmation",
      prediction: "Long BTC spot/perp should outperform over 3-7 days on rising downside demand",
      conditions: { asset: "BTC", signalType: "ONE_TOUCH_HIGH_EDGE_NO" },
    });
    expect(resolveHypothesisDirection(h)).toBe("short");
    expect(evidenceBackedDirection(h)).toBe("short");
  });
});

describe("hypothesisScoringMode", () => {
  it("flags the AMZN perp/spot convergence shape as unscorable (no direction, no reversion language)", () => {
    // Real failure mode: 82 tests burned UNSCORABLE on this family.
    const h = hyp({
      prediction: "AMZN stock continues outperforming perp as arbitrage completes and basis stays near zero",
      conditions: { asset: "AMZN", amzn_hl_funding_ann: "< -20" },
    });
    expect(hypothesisScoringMode(h)).toBeNull();
  });

  it("keeps funding-reversion theses scorable via the funding path even without direction", () => {
    const h = hyp({
      prediction: "AMZN funding normalizes toward zero within a week",
      conditions: { asset: "AMZN", amzn_hl_funding_ann: "< -20" },
    });
    expect(hypothesisScoringMode(h)).toBe("funding");
  });

  it("scores explicit-direction hypotheses directionally", () => {
    const h = hyp({
      direction: "short",
      prediction: "edge compresses toward fair value",
      conditions: { asset: "GOLD" },
    });
    expect(hypothesisScoringMode(h)).toBe("directional");
  });

  it("scores neutral vol theses via move language", () => {
    const h = hyp({
      direction: "neutral",
      prediction: "BTC moves > 3% in either direction",
      conditions: { asset: "BTC" },
    });
    expect(hypothesisScoringMode(h)).toBe("neutral_move");
  });

  it("is unscorable when no asset can be inferred", () => {
    const h = hyp({
      direction: "long",
      prediction: "the market rallies",
      conditions: { liquidity: ">= 100" },
    });
    expect(hypothesisScoringMode(h)).toBeNull();
  });
});

describe("appendPostMortemSegment", () => {
  it("appends to empty and existing postMortems", () => {
    expect(appendPostMortemSegment(null, "first note")).toBe("first note");
    expect(appendPostMortemSegment("first note", "second note")).toBe("first note | second note");
  });

  it("caps segments so stale optimistic narration falls off", () => {
    let pm: string | null = null;
    for (const note of ["working perfectly", "still great", "hmm mixed", "losing now", "family is failing"]) {
      pm = appendPostMortemSegment(pm, note);
    }
    expect(pm).toBe("still great | hmm mixed | losing now | family is failing");
    expect(pm).not.toContain("working perfectly");
  });
});

describe("resolveHypothesisDirection", () => {
  it("prefers explicit direction over prediction text", () => {
    const h = hyp({
      direction: "short",
      prediction: "GOLD will rally hard",
      conditions: { asset: "GOLD" },
    });
    expect(resolveHypothesisDirection(h)).toBe("short");
  });

  it("infers short from ONE_TOUCH_HIGH_EDGE_NO signalType", () => {
    const h = hyp({
      prediction: "edge compresses toward fair value",
      conditions: { asset: "GOLD", signalType: "ONE_TOUCH_HIGH_EDGE_NO" },
    });
    expect(resolveHypothesisDirection(h)).toBe("short");
  });

  it("does not treat arbitrary 'down' substring inside other words as short via legacy path", () => {
    // explicit neutral + no short keywords → neutral
    const h = hyp({
      direction: "neutral",
      prediction: "watch the markdown carefully",
      conditions: { asset: "GOLD" },
    });
    expect(resolveHypothesisDirection(h)).toBe("neutral");
  });
});

describe("inferHypothesisAsset", () => {
  it("uses conditions.asset first", () => {
    const h = hyp({
      prediction: "hyperliquid funding normalizes",
      conditions: { asset: "MU", mu_hl_funding_ann: "<-50" },
    });
    expect(inferHypothesisAsset(h)).toBe("MU");
  });
});

describe("fundingAnnConditionKey", () => {
  it("ignores percentile funding keys", () => {
    const h = hyp({
      prediction: "funding",
      conditions: {
        btc_hl_funding_ann_percentile_30d: ">90",
        btc_hl_funding_ann: "<-50",
      },
    });
    expect(fundingAnnConditionKey(h)).toBe("btc_hl_funding_ann");
  });
});

describe("evaluateHypothesisTest scorer v2", () => {
  it("scores a short spot thesis as win when spot falls (H-540 class bug)", () => {
    // The original bug defaulted shorts to needing the underlying to RISE. The
    // fixture was a one-touch contract thesis, which is no longer graded on
    // spot at all, so the guard now uses a genuine spot short.
    const h = hyp({
      id: "H-540",
      direction: "short",
      prediction: "GOLD spot declines > 2% over the window",
      conditions: { asset: "GOLD", gold_gc_spot_pct_vs_24h_sma: "> 0" },
    });
    const start = row("2026-05-26", { gold_gc_spot: 4509 });
    const end = row("2026-06-09", { gold_gc_spot: 4254 });
    const result = evaluateHypothesisTest(h, start, end);
    expect(result.scorable).toBe(true);
    expect(result.outcome).toBe("win");
    expect(result.method).toContain("short");
    expect(result.actualMove).toContain("short needs");
  });

  it("scores long as win when spot rises", () => {
    const h = hyp({
      direction: "long",
      prediction: "MU bounces on funding reversion",
      conditions: { asset: "AMZN", signalType: "WEEKEND_HL_FUNDING_REVERSION_LONG" },
    });
    const start = row("2026-06-01", { amzn_stock: 100 });
    const end = row("2026-06-08", { amzn_stock: 104 });
    const result = evaluateHypothesisTest(h, start, end);
    expect(result.outcome).toBe("win");
    expect(result.scorable).toBe(true);
  });

  it("does not hard-lose when only percentile funding keys exist; falls through", () => {
    const h = hyp({
      direction: "long",
      prediction: "funding mean reverts while spot rises",
      conditions: {
        asset: "BTC",
        btc_hl_funding_ann_percentile_30d: ">90",
      },
    });
    const start = row("2026-06-01", { btc_spot: 100, btc_hl_funding_ann_percentile_30d: 95 });
    const end = row("2026-06-08", { btc_spot: 103, btc_hl_funding_ann_percentile_30d: 40 });
    const result = evaluateHypothesisTest(h, start, end);
    expect(result.scorable).toBe(true);
    expect(result.outcome).toBe("win");
    expect(result.method).toContain("spot_directional_long");
  });

  it("returns unscorable when direction and asset mark are unavailable", () => {
    const h = hyp({
      prediction: "something vague happens",
      conditions: { liquidity: ">= 1000" },
    });
    const start = row("2026-06-01", { btc_spot: 100 });
    const end = row("2026-06-08", { btc_spot: 110 });
    const result = evaluateHypothesisTest(h, start, end);
    expect(result.scorable).toBe(false);
    expect(result.actualMove.startsWith("UNSCORABLE:")).toBe(true);
  });

  it("scores funding-only long reversion via funding increase when no mark exists", () => {
    const h = hyp({
      direction: "long",
      prediction: "weekend funding reversion long on MU",
      conditions: {
        asset: "MU",
        signalType: "WEEKEND_HL_FUNDING_REVERSION_LONG",
        mu_hl_funding_ann: "<-0.5",
      },
    });
    const start = row("2026-06-01", { mu_hl_funding_ann: -0.8 });
    const end = row("2026-06-02", { mu_hl_funding_ann: -0.2 });
    const result = evaluateHypothesisTest(h, start, end);
    expect(result.scorable).toBe(true);
    expect(result.outcome).toBe("win");
    expect(result.method).toBe("funding_normalize_up");
  });
});

describe("promotion groups", () => {
  const stampedTest = (
    date: string,
    outcome: "win" | "loss",
    marketId: string,
  ): HypothesisTest => ({
    date,
    triggered: true,
    outcome,
    actualMove: "test",
    magnitude: outcome === "win" ? 5 : -5,
    magnitudeUnit: "pct_return",
    contractEntry: {
      marketId,
      eventSlug: "e",
      asset: "BTC",
      direction: "above",
      strike: 1,
      entryPrice: 0.5,
      side: "no",
    },
  });

  it("maps member setupIds to their group and others to null", () => {
    expect(promotionGroupForSetup("find_0043")?.groupId).toBe("btc_one_touch_moderate_edge_no");
    expect(promotionGroupForSetup("find_0070")?.groupId).toBe("panel_mid_band_no");
    expect(promotionGroupForSetup("find_0022")).toBeNull();
    expect(promotionGroupForSetup(undefined)).toBeNull();
    // Group membership must be disjoint: a setup in two groups would have its
    // evidence counted twice.
    const all = PROMOTION_GROUPS.flatMap((g) => g.setupIds);
    expect(new Set(all).size).toBe(all.length);
  });

  it("pools completed tests across members and counts a shared contract-window once", () => {
    const a = hyp({
      id: "H-A", setupId: "find_0043", timeframeDays: 7,
      prediction: "contract pnl", conditions: { asset: "BTC" },
    });
    const b = hyp({
      id: "H-B", setupId: "find_0054", timeframeDays: 3,
      prediction: "contract pnl", conditions: { asset: "BTC" },
    });
    // Same contract, overlapping windows -> one observation (earliest kept).
    a.tests = [stampedTest("2026-08-20", "win", "M1"), stampedTest("2026-08-20", "win", "M2")];
    b.tests = [stampedTest("2026-08-22", "loss", "M1"), stampedTest("2026-08-21", "win", "M3")];
    const pooled = dedupePooledGroupTests([a, b]);
    expect(pooled).toHaveLength(3);
    const m1 = pooled.filter((t) => t.contractEntry?.marketId === "M1");
    expect(m1).toHaveLength(1);
    expect(m1[0].outcome).toBe("win"); // the earlier-opened test is the one kept
  });

  it("keeps same-contract tests whose windows do not overlap", () => {
    const a = hyp({
      id: "H-A", setupId: "find_0065", timeframeDays: 3,
      prediction: "contract pnl", conditions: { yesAsk: "between 0.35 and 0.65" },
    });
    a.tests = [stampedTest("2026-08-01", "win", "M1"), stampedTest("2026-08-20", "loss", "M1")];
    expect(dedupePooledGroupTests([a])).toHaveLength(2);
  });

  it("ignores killed members and excluded or pending tests", () => {
    const a = hyp({
      id: "H-A", setupId: "find_0066", timeframeDays: 7,
      prediction: "contract pnl", conditions: { yesAsk: "between 0.35 and 0.65" },
    });
    a.tests = [
      stampedTest("2026-08-20", "win", "M1"),
      { ...stampedTest("2026-08-21", "win", "M2"), excludedFromSetupStats: true },
      { ...stampedTest("2026-08-22", "win", "M3"), outcome: "pending" as const },
    ];
    const killed = hyp({
      id: "H-K", setupId: "find_0067", timeframeDays: 7,
      prediction: "contract pnl", conditions: { yesAsk: "between 0.35 and 0.65" },
    });
    killed.status = "killed";
    killed.tests = [stampedTest("2026-08-23", "win", "M4")];
    expect(dedupePooledGroupTests([a, killed])).toHaveLength(1);
  });
});

describe("binomialPValue", () => {
  it("matches exact tail probabilities", () => {
    expect(binomialPValue(9, 10)).toBeCloseTo(11 / 1024, 9);
    expect(binomialPValue(13, 20)).toBeCloseTo(0.1316, 4);
    expect(binomialPValue(16, 20)).toBeCloseTo(0.0059, 4);
    expect(binomialPValue(0, 10)).toBe(1);
    expect(binomialPValue(0, 0)).toBe(1);
  });
});

describe("sequential shadow-test evidence", () => {
  it("13/20 (old promote boundary) is inconclusive, not decisive", () => {
    // p = 0.1316 — this record used to promote; now it keeps testing.
    expect(setupFamilyIsDecisive(13, 20, 0.65, 0.40)).toBe(false);
  });

  it("16/20 is decisively promotable (p < 0.01 and WR over threshold)", () => {
    expect(setupFamilyIsDecisive(16, 20, 0.65, 0.40)).toBe(true);
  });

  it("7/20 (35%) is decisive futility below the kill floor", () => {
    expect(setupFamilyIsDecisive(7, 20, 0.65, 0.40)).toBe(true);
  });

  function familyWithRecord(wins: number, losses: number): ReturnType<typeof hypothesisSetupFamilies>[number] {
    const h = hyp({
      prediction: "test",
      conditions: { asset: "BTC" },
      setupId: "seq_test_family",
      setupLabel: "Sequential test family",
    });
    h.tests = [
      ...Array.from({ length: wins }, (_, i) => ({ date: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`, triggered: true, outcome: "win" as const, actualMove: "up" })),
      ...Array.from({ length: losses }, (_, i) => ({ date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`, triggered: true, outcome: "loss" as const, actualMove: "down" })),
    ];
    return hypothesisSetupFamilies([h])[0];
  }

  it("keeps testing an inconclusive family past 20 completed tests", () => {
    expect(hypothesisSetupNeedsMoreShadowTests(familyWithRecord(13, 7))).toBe(true);
  });

  it("stops testing once significantly promotable", () => {
    expect(hypothesisSetupNeedsMoreShadowTests(familyWithRecord(16, 4))).toBe(false);
  });

  it("stops testing at the extended cap even when inconclusive", () => {
    const wins = Math.round(HYPOTHESIS_SHADOW_TESTS_EXTENDED_CAP * 0.55);
    const losses = HYPOTHESIS_SHADOW_TESTS_EXTENDED_CAP - wins;
    expect(hypothesisSetupNeedsMoreShadowTests(familyWithRecord(wins, losses))).toBe(false);
  });

  it("still requires the base 20 tests regardless of early record", () => {
    expect(hypothesisSetupNeedsMoreShadowTests(familyWithRecord(10, 0))).toBe(true);
  });
});

describe("realized-edge (magnitude) gate", () => {
  function test(
    outcome: "win" | "loss",
    magnitude?: number,
    unit: "pct_return" | "funding_pts" = "pct_return",
    extra: Partial<HypothesisTest> = {},
  ): HypothesisTest {
    return {
      date: "2026-07-01",
      triggered: true,
      outcome,
      actualMove: "x",
      ...(magnitude === undefined ? {} : { magnitude, magnitudeUnit: unit }),
      ...extra,
    };
  }

  it("reports no usable evidence when tests predate magnitude recording", () => {
    const evidence = setupMagnitudeEvidence(Array.from({ length: 20 }, () => test("win")));
    expect(evidence.n).toBe(0);
    expect(evidence.usable).toBe(false);
  });

  it("ignores pending and unscorable tests", () => {
    const tests = [
      test("win", 5),
      { ...test("win", 99), outcome: "pending" as const },
      test("loss", -99, "pct_return", { excludedFromSetupStats: true }),
    ];
    const evidence = setupMagnitudeEvidence(tests);
    expect(evidence.n).toBe(1);
    expect(evidence.mean).toBeCloseTo(5, 10);
  });

  it("does not average across incompatible units — majority unit wins", () => {
    const tests = [
      ...Array.from({ length: 8 }, () => test("win", 2, "pct_return")),
      ...Array.from({ length: 3 }, () => test("win", 40, "funding_pts")),
    ];
    const evidence = setupMagnitudeEvidence(tests);
    expect(evidence.unit).toBe("pct_return");
    expect(evidence.n).toBe(8);
    expect(evidence.mean).toBeCloseTo(2, 10);
  });

  it("blocks promotion of a high-win-rate family whose edge is not positive", () => {
    // 17/20 wins (binomially very significant) but wins are tiny and losses huge.
    const tests = [
      ...Array.from({ length: 17 }, () => test("win", 0.2)),
      ...Array.from({ length: 3 }, () => test("loss", -6)),
    ];
    expect(binomialPValue(17, 20)).toBeLessThan(PROMOTE_SIGNIFICANCE_ALPHA);
    expect(setupFamilyIsPromotable(17, 20, 0.65, tests)).toBe(false);
    expect(setupFamilyIsUnprofitable(tests)).toBe(true);
  });

  it("promotes a family that is both significantly right and significantly profitable", () => {
    const tests = [
      ...Array.from({ length: 17 }, () => test("win", 3.0)),
      ...Array.from({ length: 3 }, () => test("loss", -1.0)),
    ];
    expect(setupFamilyIsPromotable(17, 20, 0.65, tests)).toBe(true);
    expect(setupFamilyIsUnprofitable(tests)).toBe(false);
  });

  it("falls back to win rate when magnitude evidence is too thin to gate on", () => {
    // Only 4 magnitude-bearing tests: below MAGNITUDE_EVIDENCE_MIN_TESTS.
    const tests = [
      ...Array.from({ length: 4 }, () => test("win", -5)),
      ...Array.from({ length: 16 }, () => test("win")),
    ];
    expect(setupMagnitudeEvidence(tests).usable).toBe(false);
    expect(setupFamilyIsPromotable(17, 20, 0.65, tests)).toBe(true);
  });

  it("does not flag an unproven family as unprofitable", () => {
    const tests = Array.from({ length: 20 }, (_, i) => test(i % 2 === 0 ? "win" : "loss", i % 2 === 0 ? 2 : -2));
    expect(setupFamilyIsUnprofitable(tests)).toBe(false);
  });

  it("treats a money-losing family as decisive so it stops consuming test budget", () => {
    const tests = [
      ...Array.from({ length: 17 }, () => test("win", 0.2)),
      ...Array.from({ length: 3 }, () => test("loss", -6)),
    ];
    expect(setupFamilyIsDecisive(17, 20, 0.65, 0.40, tests)).toBe(true);
  });
});

describe("sweepUnscorableHypotheses", () => {
  function unscorable(id: string, burned: number, pending: number): Hypothesis {
    const h = hyp({
      id,
      // No direction, no funding thesis, no move language => scorer cannot grade.
      prediction: "AMZN stock continues outperforming perp as arbitrage completes",
      conditions: { asset: "AMZN" },
    });
    h.tests = [
      ...Array.from({ length: burned }, () => ({
        date: "2026-06-01", triggered: true, outcome: "loss" as const,
        actualMove: "UNSCORABLE", excludedFromSetupStats: true, exclusionReason: "unscorable_scorer_v2:unscorable_direction",
      })),
      ...Array.from({ length: pending }, () => ({
        date: "2026-08-01", triggered: true, outcome: "pending" as const, actualMove: "queued",
      })),
    ];
    return h;
  }

  it("cancels queued tests that could only resolve UNSCORABLE", () => {
    const h = unscorable("H-900", 0, 3);
    const result = sweepUnscorableHypotheses([h]);
    expect(result.cancelledTests).toBe(3);
    expect(pendingHypothesisTests(h)).toHaveLength(0);
    expect(h.tests.every((t) => t.exclusionReason === "cancelled_unscorable_variant")).toBe(true);
  });

  it("retires a variant that has already burned past the threshold", () => {
    const h = unscorable("H-901", UNSCORABLE_BURN_RETIRE_THRESHOLD, 1);
    const result = sweepUnscorableHypotheses([h]);
    expect(result.retiredVariants).toBe(1);
    expect(h.status).toBe("killed");
    expect(h.postMortem).toContain("Retired unscorable");
  });

  it("leaves a recent lightly-burned variant active so the LLM can re-author it", () => {
    const h = unscorable("H-902", 2, 1);
    // Two days after it was authored: still inside the re-authoring window.
    const result = sweepUnscorableHypotheses([h], new Date("2026-07-03T00:00:00.000Z"));
    expect(result.flaggedForReauthor).toBe(1);
    expect(result.retiredVariants).toBe(0);
    expect(h.status).toBe("active");
  });

  it("names the families it kept, so the note is actionable", () => {
    const h = unscorable("H-902b", 2, 1);
    h.setupId = "gold_pm_premium_futures_spread_mean_reversion";
    const result = sweepUnscorableHypotheses([h], new Date("2026-07-03T00:00:00.000Z"));
    expect(result.retainedSetupIds).toEqual(["gold_pm_premium_futures_spread_mean_reversion"]);
  });

  it("retires a variant abandoned past the re-authoring window", () => {
    const h = unscorable("H-905", 2, 1);
    const result = sweepUnscorableHypotheses([h], new Date("2026-08-01T00:00:00.000Z"));
    expect(result.retiredVariants).toBe(1);
    expect(h.status).toBe("killed");
    // The cancelled test must leave the pending queue, or it holds a family
    // slot forever and never counts toward the burn total.
    expect(pendingHypothesisTests(h)).toHaveLength(0);
  });

  it("leaves a Polymarket-contract variant untouched: it is contract-scored", () => {
    const h = unscorable("H-906", 2, 1);
    h.conditions = { ...h.conditions, venue: "polymarket" };
    const result = sweepUnscorableHypotheses([h], new Date("2026-08-01T00:00:00.000Z"));
    // Contract theses are scorable now, so the unscorable sweep never sees
    // them and cannot retire the mined one-touch research.
    expect(result.retiredVariants).toBe(0);
    expect(result.cancelledTests).toBe(0);
    expect(h.status).toBe("active");
  });

  it("recognizes the contract families the spot scorer cannot grade", () => {
    const contract: Record<string, string>[] = [
      { asset: "BTC", venue: "polymarket" },
      { asset: "BTC", signalType: "ONE_TOUCH_HIGH_EDGE_NO" },
      { asset: "BTC", signalType: "NO_BIAS_ADJUSTED_GAP" },
      { asset: "BTC", signalType: "PM_IV_GT_OPT_IV" },
      // The FIND-derived theses set neither venue nor signalType; they name the
      // contract's own price instead.
      { touch_direction: "= 1", sell_yes_edge_pts: ">= 8", liquidity: ">= 5000" },
      { pm_iv_minus_opt_iv_pts: ">= 10", days_to_expiry: "< 30" },
      { adjusted_no_gap_pts: "> 0" },
      { yesAsk: "<= 0.2" },
    ];
    for (const conditions of contract) {
      expect(isPolymarketExpression(hyp({ prediction: "x", conditions }))).toBe(true);
    }
  });

  it("does not mistake a perp thesis for a contract thesis", () => {
    const spot: Record<string, string>[] = [
      { asset: "BTC", venue: "hyperliquid" },
      // Liquidity, expiry and flow stance can scope a perp trade just as well.
      { asset: "BTC", liquidity: ">= 5000", days_to_expiry: "< 30" },
      { asset: "BTC", smart_flow_stance: "< 0" },
      { asset: "BTC", btc_hl_funding_ann: "<= -50" },
    ];
    for (const conditions of spot) {
      expect(isPolymarketExpression(hyp({ prediction: "x", conditions }))).toBe(false);
    }
  });

  it("never touches scorable hypotheses", () => {
    const h = hyp({ id: "H-903", direction: "long", prediction: "BTC rises > 2%", conditions: { asset: "BTC" } });
    h.tests = [{ date: "2026-08-01", triggered: true, outcome: "pending", actualMove: "queued" }];
    const result = sweepUnscorableHypotheses([h]);
    expect(result.cancelledTests).toBe(0);
    expect(pendingHypothesisTests(h)).toHaveLength(1);
    expect(h.status).toBe("active");
  });

  it("is idempotent across repeated engine cycles", () => {
    const h = unscorable("H-904", 3, 2);
    const first = sweepUnscorableHypotheses([h]);
    const second = sweepUnscorableHypotheses([h]);
    expect(first.cancelledTests).toBe(2);
    expect(second.cancelledTests).toBe(0);
  });
});

describe("trigger-rarity gate", () => {
  function history(count: number, value: (i: number) => number): SnapshotRow[] {
    return Array.from({ length: count }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString().slice(0, 19),
      btc_spot: 100,
      btc_hl_funding_ann: value(i),
    }));
  }

  const frequent = hyp({
    direction: "long",
    prediction: "BTC rises > 2%",
    conditions: { asset: "BTC", btc_hl_funding_ann: "< 0" },
  });

  it("accepts a condition that fires often", () => {
    // Negative funding on every row => fires constantly.
    const estimate = estimateTriggerFrequency(frequent, history(720, () => -30));
    expect(estimate.reliable).toBe(true);
    expect(estimate.triggersPerWeek).toBeGreaterThan(MIN_TRIGGERS_PER_WEEK);
    expect(isTriggerTooRare(estimate)).toBe(false);
  });

  it("rejects a condition that almost never fires", () => {
    // Negative funding on 2 rows out of 720 (~30 days) => well under 1/week.
    const estimate = estimateTriggerFrequency(frequent, history(720, (i) => (i < 2 ? -30 : 30)));
    expect(estimate.triggers).toBe(2);
    expect(estimate.triggersPerWeek).toBeLessThan(MIN_TRIGGERS_PER_WEEK);
    expect(isTriggerTooRare(estimate)).toBe(true);
  });

  it("abstains on an unevaluable key rather than guessing", () => {
    // validateHypothesisConditions already rejects unknown keys at ingest, so
    // this gate does not need to and must not add a second chance to be wrong.
    const bogus = hyp({
      direction: "long",
      prediction: "BTC rises > 2%",
      conditions: { asset: "BTC", nonexistent_column_xyz: "> 5" },
    });
    const estimate = estimateTriggerFrequency(bogus, history(720, () => -30));
    expect(estimate.unreliableReason).toBe("not_replayable");
    expect(isTriggerTooRare(estimate)).toBe(false);
  });

  it("refuses to judge when history is too short (fails open)", () => {
    const estimate = estimateTriggerFrequency(frequent, history(50, () => 30));
    expect(estimate.reliable).toBe(false);
    expect(estimate.unreliableReason).toBe("insufficient_history");
    expect(isTriggerTooRare(estimate)).toBe(false);
  });

  it("exempts heatmap conditions, which have no replayable history", () => {
    // Measured against production data, judging these wrongly scored the most
    // productive heatmap families at zero triggers.
    const heatmap = hyp({
      direction: "short",
      prediction: "PM YES richness compresses > 2%",
      conditions: { asset: "GOLD", sell_yes_edge_pts: ">= 5", liquidity: ">= 1000" },
    });
    const estimate = estimateTriggerFrequency(heatmap, history(720, () => 30));
    expect(estimate.reliable).toBe(false);
    expect(estimate.unreliableReason).toBe("not_replayable");
    expect(isTriggerTooRare(estimate)).toBe(false);
  });

  it("exempts relative-value aggregate keys too", () => {
    const agg = hyp({
      direction: "short",
      prediction: "spread compresses > 2%",
      conditions: { asset: "BTC", btc_pm_underlying_cap_ratio_max: "> 1.05" },
    });
    expect(estimateTriggerFrequency(agg, history(720, () => 30)).unreliableReason).toBe("not_replayable");
  });

  it("still judges pure valuation-column conditions", () => {
    expect(estimateTriggerFrequency(frequent, history(720, () => -30)).reliable).toBe(true);
  });

  it("does not judge conditions that are only metadata", () => {
    const metaOnly = hyp({
      direction: "long", prediction: "BTC rises > 2%", conditions: { asset: "BTC", venue: "hyperliquid" },
    });
    expect(estimateTriggerFrequency(metaOnly, history(720, () => 30)).unreliableReason).toBe("not_replayable");
  });

  it("accepts derived keys whose base column exists", () => {
    const derived = hyp({
      direction: "long", prediction: "BTC rises > 2%",
      conditions: { asset: "BTC", btc_hl_funding_ann_percentile_30d: "< 20" },
    });
    expect(conditionsReplayableFromValuationHistory(derived, history(720, () => 30))).toBe(true);
  });

  it("rejects a key that resolves to nothing at all", () => {
    const bogus = hyp({
      direction: "long", prediction: "BTC rises > 2%", conditions: { asset: "BTC", made_up_key: "> 1" },
    });
    expect(conditionsReplayableFromValuationHistory(bogus, history(720, () => 30))).toBe(false);
  });
});

describe("evaluateHypothesisTest records signed magnitude", () => {
  const start: SnapshotRow = { date: "2026-07-01", btc_spot: 100 };
  const end: SnapshotRow = { date: "2026-07-08", btc_spot: 105 };

  it("signs a long by the move and a short against it", () => {
    const long = evaluateHypothesisTest(
      hyp({ prediction: "BTC rises > 2%", conditions: { asset: "BTC" }, direction: "long" }), start, end);
    expect(long.magnitude).toBeCloseTo(5, 6);
    expect(long.magnitudeUnit).toBe("pct_return");

    const short = evaluateHypothesisTest(
      hyp({ prediction: "BTC falls > 2%", conditions: { asset: "BTC" }, direction: "short" }), start, end);
    expect(short.magnitude).toBeCloseTo(-5, 6);
    expect(short.outcome).toBe("loss");
  });

  it("omits magnitude on unscorable results", () => {
    const result = evaluateHypothesisTest(
      hyp({ prediction: "something happens", conditions: { asset: "BTC" } }), start, end);
    expect(result.scorable).toBe(false);
    expect(result.magnitude).toBeUndefined();
  });
});

describe("time-to-verdict gate", () => {
  it("takes the worse of the horizon and the trigger rate", () => {
    // Fires constantly, but a 7-day horizon still yields one test per week.
    const horizonBound = estimateWeeksToVerdict(7, 134, 1);
    expect(horizonBound.testsPerWeek).toBeCloseTo(1, 6);
    expect(horizonBound.boundBy).toBe("horizon");
    expect(horizonBound.weeksToVerdict).toBeCloseTo(20, 6);

    // Short horizon, but the conditions almost never hold.
    const triggerBound = estimateWeeksToVerdict(2, 0.5, 1);
    expect(triggerBound.testsPerWeek).toBeCloseTo(0.5, 6);
    expect(triggerBound.boundBy).toBe("trigger_rate");
  });

  it("rejects a single-variant idea at the horizon cap", () => {
    expect(isTooSlowToVerdict(estimateWeeksToVerdict(7, 100, 1))).toBe(true);
  });

  it("admits the 2-3 day horizons the prompt asks for", () => {
    for (const days of [2, 3]) {
      expect(isTooSlowToVerdict(estimateWeeksToVerdict(days, 100, 1))).toBe(false);
    }
  });

  it("lets sibling variants rescue a slower thesis", () => {
    // Same 7-day thesis: hopeless alone, decidable expressed three ways.
    expect(isTooSlowToVerdict(estimateWeeksToVerdict(7, 100, 1))).toBe(true);
    expect(isTooSlowToVerdict(estimateWeeksToVerdict(7, 100, 3))).toBe(false);
  });

  it("lets concurrent contract entries rescue a slower contract thesis", () => {
    // The panel NO-edge shape: 7-day horizon, single variant, but several
    // distinct contracts eligible at once. Serially it needs 20 weeks;
    // with concurrent entries it fits inside the cap.
    expect(isTooSlowToVerdict(estimateWeeksToVerdict(7, 100, 1, 1))).toBe(true);
    const concurrent = estimateWeeksToVerdict(7, 100, 1, PM_CONTRACT_MAX_PENDING_PER_VARIANT);
    expect(concurrent.testsPerWeek).toBeCloseTo(4, 6);
    expect(isTooSlowToVerdict(concurrent)).toBe(false);
    // Concurrency multiplies horizon capacity, not the trigger rate: a thesis
    // that rarely fires stays bound by how often it fires.
    const rare = estimateWeeksToVerdict(7, 0.5, 1, PM_CONTRACT_MAX_PENDING_PER_VARIANT);
    expect(rare.testsPerWeek).toBeCloseTo(0.5, 6);
    expect(rare.boundBy).toBe("trigger_rate");
  });

  it("never reaches a verdict when conditions never fire", () => {
    const estimate = estimateWeeksToVerdict(2, 0, 1);
    expect(estimate.weeksToVerdict).toBe(Number.POSITIVE_INFINITY);
    expect(isTooSlowToVerdict(estimate)).toBe(true);
  });

  it("keeps the cap consistent with what a capped horizon can deliver", () => {
    // A single variant at the horizon cap must need a shorter window, which is
    // the arithmetic that makes the prompt's "about 4 days" guidance true.
    expect(isTooSlowToVerdict(estimateWeeksToVerdict(4, 100, 1))).toBe(false);
    expect(isTooSlowToVerdict(estimateWeeksToVerdict(5, 100, 1))).toBe(true);
    expect(MAX_TEST_HORIZON_DAYS).toBe(7);
    expect(MAX_WEEKS_TO_VERDICT).toBe(13);
  });
});
