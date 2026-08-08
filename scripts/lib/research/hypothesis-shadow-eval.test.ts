import { describe, expect, it } from "vitest";
import {
  HYPOTHESIS_SHADOW_TESTS_EXTENDED_CAP,
  appendPostMortemSegment,
  binomialPValue,
  evaluateHypothesisTest,
  fundingAnnConditionKey,
  hypothesisScoringMode,
  hypothesisSetupFamilies,
  hypothesisSetupNeedsMoreShadowTests,
  inferHypothesisAsset,
  resolveHypothesisDirection,
  setupFamilyIsDecisive,
  setupFamilyIsPromotable,
  setupFamilyIsUnprofitable,
  setupMagnitudeEvidence,
  sweepUnscorableHypotheses,
  estimateTriggerFrequency,
  isTriggerTooRare,
  pendingHypothesisTests,
  MIN_TRIGGERS_PER_WEEK,
  UNSCORABLE_BURN_RETIRE_THRESHOLD,
  PROMOTE_SIGNIFICANCE_ALPHA,
  type Hypothesis,
  type HypothesisTest,
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
  it("scores short GOLD as win when spot falls (H-540 class bug)", () => {
    const h = hyp({
      id: "H-540",
      direction: "short",
      prediction:
        "GOLD one-touch YES contracts with rich sell-YES edge will revert toward fair value, generating positive PnL on the short side",
      conditions: {
        venue: "polymarket",
        asset: "GOLD",
        signalType: "ONE_TOUCH_HIGH_EDGE_NO",
      },
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

  it("leaves a lightly-burned variant active so the LLM can re-author it", () => {
    const h = unscorable("H-902", 2, 1);
    const result = sweepUnscorableHypotheses([h]);
    expect(result.flaggedForReauthor).toBe(1);
    expect(result.retiredVariants).toBe(0);
    expect(h.status).toBe("active");
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

  it("treats an unevaluable condition as too rare — it can never open a test", () => {
    const bogus = hyp({
      direction: "long",
      prediction: "BTC rises > 2%",
      conditions: { asset: "BTC", nonexistent_column_xyz: "> 5" },
    });
    const estimate = estimateTriggerFrequency(bogus, history(720, () => -30));
    expect(estimate.triggers).toBe(0);
    expect(isTriggerTooRare(estimate)).toBe(true);
  });

  it("refuses to judge when history is too short (fails open)", () => {
    const estimate = estimateTriggerFrequency(frequent, history(50, () => 30));
    expect(estimate.reliable).toBe(false);
    expect(isTriggerTooRare(estimate)).toBe(false);
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
