import { describe, expect, it } from "vitest";
import {
  CONDITION_CATALOG,
  CONDITION_KEY_ALIASES,
  MARKET_ROW_CONDITION_KEYS,
  METADATA_CONDITION_KEYS,
  buildConditionCatalogPromptSection,
  formatConditionIssues,
  suggestConditionKey,
  validateHypothesisConditions,
} from "./condition-catalog.js";
import {
  evaluateHypothesisCondition,
  type Hypothesis,
  type RelativeValueObservation,
  type SnapshotRow,
} from "./hypothesis-shadow-eval.js";

// ─── Synthetic engine state ─────────────────────────────────────────────────
// Deliberately constructed so that EVERY catalog example condition holds.
// If a catalog definition drifts from what the engine computes, the
// example-evaluation test below fails and the definition cannot ship.

const VALUATION_COLUMNS = [
  "btc_spot", "btc_ibit_pc_ratio", "btc_pm_iv", "btc_opt_iv_30d",
  "gold_gc_spot", "oil_wti_spot", "cbrs_hl_funding_ann",
];

function valuationRow(date: string, btcSpot: number): SnapshotRow {
  return {
    date,
    btc_spot: btcSpot,
    btc_ibit_pc_ratio: 0.6,
    btc_pm_iv: 43.4,
    btc_opt_iv_30d: 48.8,
    gold_gc_spot: 4600,
    oil_wti_spot: 85,
    cbrs_hl_funding_ann: -62.9,
  };
}

const VALUATION_ROWS: SnapshotRow[] = [
  valuationRow("2026-07-26", 100),
  valuationRow("2026-07-27", 104),
  valuationRow("2026-07-28", 102),
];

function rvRow(overrides: Partial<RelativeValueObservation>): RelativeValueObservation {
  return {
    timestamp: "2026-07-28T23",
    modelVersion: "v1",
    asset: "BTC",
    eventSlug: "e",
    marketId: "m",
    question: "q",
    contractMonth: "2026-08",
    direction: "above",
    strike: 100000,
    expiry: "2026-08-10T03:59:59.999Z",
    pmYes: 0.5,
    pmBid: 0.49,
    pmAsk: 0.5,
    pmSpread: 0.01,
    modelProb: 0.45,
    underlyingCapYes: 0.4,
    pmToUnderlyingCapRatio: 1.25,
    underlyingCapSignal: "sell_yes",
    settlementYesSum: 1.02,
    settlementOverround: 2,
    settlementTailYes: 0.05,
    settlementSkewYes: 0.1,
    edgePts: 10,
    bestExpression: "sell_yes",
    optionIv: 0.4,
    pmIv: 0.53,
    cboeNoGapPts: 4,
    cmeNoGapPts: 5,
    adjustedNoGapPts: 6.2,
    sourceAgreementBucket: "agree",
    noBiasCandidatePassed: true,
    liquidity: 10_000,
    perpFundingAnn: -0.62,
    perpOiUsd: 1_000_000,
    perpBasisPct: 0.1,
    sellYesEdgePts: 2.5,
    smartFlowNetYes: 5,
    smartFlowStance: -1,
    flags: "",
    ...overrides,
  };
}

const RELATIVE_VALUE_ROWS: RelativeValueObservation[] = [
  rvRow({}),
  rvRow({ asset: "OIL", edgePts: 15, expiry: "2026-08-05T03:59:59.999Z" }),
  rvRow({ asset: "GOLD", direction: "below", settlementYesSum: 1.01 }),
];

function hypothesisWith(conditions: Record<string, string>): Hypothesis {
  return {
    id: "H-TEST", created: "2026-07-28", description: "catalog validation fixture",
    conditions, prediction: "n/a", timeframeDays: 7, confidence: 0.7,
    tests: [], winRate: 0, status: "active", promotedToSignal: false,
    postMortem: null, source: "llm",
  };
}

// ─── 1. Definition ⇄ engine consistency ─────────────────────────────────────

describe("condition catalog examples evaluate through the real engine", () => {
  for (const entry of CONDITION_CATALOG) {
    it(`${entry.label} — example {"${entry.example.key}": "${entry.example.expression}"} is evaluable`, () => {
      const hypothesis = hypothesisWith({ [entry.example.key]: entry.example.expression });
      const satisfied = evaluateHypothesisCondition(
        entry.example.key,
        entry.example.expression,
        VALUATION_ROWS,
        hypothesis,
        RELATIVE_VALUE_ROWS,
      );
      expect(satisfied).toBe(true);
    });

    it(`${entry.label} — example passes ingest validation`, () => {
      const issues = validateHypothesisConditions(
        { [entry.example.key]: entry.example.expression },
        VALUATION_COLUMNS,
      );
      expect(issues).toEqual([]);
    });
  }
});

describe("new market-row keys match their documented semantics", () => {
  it("days_to_expiry aggregates as MIN (nearest contract)", () => {
    // OIL row expires 2026-08-05, others 2026-08-10; min ≈ 7.2 days from 07-28T23.
    const hyp = hypothesisWith({ days_to_expiry: "<= 8" });
    expect(evaluateHypothesisCondition("days_to_expiry", "<= 8", VALUATION_ROWS, hyp, RELATIVE_VALUE_ROWS)).toBe(true);
    expect(evaluateHypothesisCondition("days_to_expiry", "<= 5", VALUATION_ROWS, hyp, RELATIVE_VALUE_ROWS)).toBe(false);
  });

  it("days_to_expiry respects asset scoping", () => {
    // Scoped to BTC/GOLD (expiry 08-10): min ≈ 12.2 days, so <= 8 no longer holds.
    const hyp = hypothesisWith({ asset: "GOLD", days_to_expiry: "<= 8" });
    expect(evaluateHypothesisCondition("days_to_expiry", "<= 8", VALUATION_ROWS, hyp, RELATIVE_VALUE_ROWS)).toBe(false);
  });

  it("pm_iv_minus_opt_iv_pts converts decimal IVs to points", () => {
    // pmIv 0.53 − optionIv 0.40 = 13 points.
    const hyp = hypothesisWith({ pm_iv_minus_opt_iv_pts: ">= 12" });
    expect(evaluateHypothesisCondition("pm_iv_minus_opt_iv_pts", ">= 12", VALUATION_ROWS, hyp, RELATIVE_VALUE_ROWS)).toBe(true);
    expect(evaluateHypothesisCondition("pm_iv_minus_opt_iv_pts", ">= 14", VALUATION_ROWS, hyp, RELATIVE_VALUE_ROWS)).toBe(false);
  });

  it("adjusted_no_gap_pts reads the no-bias gap", () => {
    const hyp = hypothesisWith({ adjusted_no_gap_pts: ">= 6" });
    expect(evaluateHypothesisCondition("adjusted_no_gap_pts", ">= 6", VALUATION_ROWS, hyp, RELATIVE_VALUE_ROWS)).toBe(true);
  });
});

describe("metadata conditions in the live evaluator", () => {
  it("asset/venue/signalType scope-pass instead of silently failing", () => {
    const hyp = hypothesisWith({ asset: "OIL" });
    expect(evaluateHypothesisCondition("asset", "OIL", VALUATION_ROWS, hyp, RELATIVE_VALUE_ROWS)).toBe(true);
    expect(evaluateHypothesisCondition("signalType", "ONE_TOUCH", VALUATION_ROWS, hyp, [])).toBe(true);
  });

  it("day_of_week genuinely gates on the decision row's weekday", () => {
    // 2026-07-28 is a Tuesday.
    const hyp = hypothesisWith({ day_of_week: "in [tue]" });
    expect(evaluateHypothesisCondition("day_of_week", "in [tue]", VALUATION_ROWS, hyp, [])).toBe(true);
    expect(evaluateHypothesisCondition("day_of_week", "in [sat, sun]", VALUATION_ROWS, hyp, [])).toBe(false);
    expect(evaluateHypothesisCondition("day_of_week", "in [saturday, tuesday]", VALUATION_ROWS, hyp, [])).toBe(true);
  });
});

// ─── 2. Ingest validation rejects the historically-broken vocabulary ────────

describe("validateHypothesisConditions rejects the known-bad keys from the July audit", () => {
  const cases: Array<{ conditions: Record<string, string>; expectKey: string; expectSuggestion: string | null }> = [
    { conditions: { dumb_share_highs: "> 0.6" }, expectKey: "dumb_share_highs", expectSuggestion: null },
    { conditions: { smart_share_dips: "> 0.6" }, expectKey: "smart_share_dips", expectSuggestion: null },
    { conditions: { pm_iv_gt_opt_iv_pps: ">= 10" }, expectKey: "pm_iv_gt_opt_iv_pps", expectSuggestion: "pm_iv_minus_opt_iv_pts" },
    { conditions: { pm_iv_minus_opt_iv_30d: "> 10" }, expectKey: "pm_iv_minus_opt_iv_30d", expectSuggestion: "pm_iv_minus_opt_iv_pts" },
    { conditions: { contract_expiry_days: "<= 5" }, expectKey: "contract_expiry_days", expectSuggestion: "days_to_expiry" },
    { conditions: { oil_one_touch_sell_yes_edge_pts: ">= 2" }, expectKey: "oil_one_touch_sell_yes_edge_pts", expectSuggestion: "sell_yes_edge_pts" },
    { conditions: { yes_spread: "<= 0.03" }, expectKey: "yes_spread", expectSuggestion: "yesSpread" },
    { conditions: { no_bias_adjusted_gap: ">= 5" }, expectKey: "no_bias_adjusted_gap", expectSuggestion: "adjusted_no_gap_pts" },
    { conditions: { "pm_iv - opt_iv_30d": "> 10" }, expectKey: "pm_iv - opt_iv_30d", expectSuggestion: null },
    { conditions: { macro_composite: "> 0" }, expectKey: "macro_composite", expectSuggestion: null },
  ];

  for (const { conditions, expectKey, expectSuggestion } of cases) {
    it(`rejects ${expectKey}${expectSuggestion ? ` and suggests ${expectSuggestion}` : ""}`, () => {
      const issues = validateHypothesisConditions(conditions, VALUATION_COLUMNS);
      expect(issues).toHaveLength(1);
      expect(issues[0].key).toBe(expectKey);
      expect(issues[0].reason).toBe("unknown_key");
      expect(issues[0].suggestion).toBe(expectSuggestion);
    });
  }

  it("rejects en-dash ranges with a between-syntax suggestion", () => {
    const issues = validateHypothesisConditions({ sell_yes_edge_pts: "1.0–3.0" }, VALUATION_COLUMNS);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe("invalid_expression");
    expect(issues[0].suggestion).toBe("between 1.0 and 3.0");
  });

  it("rejects arithmetic / column references on the right side", () => {
    const issues = validateHypothesisConditions({ btc_pm_iv: "> btc_opt_iv_30d + 10" }, VALUATION_COLUMNS);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe("invalid_expression");
  });

  it("rejects derived keys whose base is not a valuation column", () => {
    const issues = validateHypothesisConditions({ pm_iv_zscore_30d: "< -2" }, VALUATION_COLUMNS);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe("derived_base_unknown");
  });

  it("accepts the legacy ratio key only alongside its sibling IV keys", () => {
    expect(validateHypothesisConditions(
      { btc_pm_iv: "< 50", btc_opt_iv_30d: "> 30", ratio: "< 0.92" },
      VALUATION_COLUMNS,
    )).toEqual([]);
    const alone = validateHypothesisConditions({ ratio: "< 0.92" }, VALUATION_COLUMNS);
    expect(alone).toHaveLength(1);
    expect(alone[0].suggestion).toBe("pm_iv_minus_opt_iv_pts");
  });

  it("accepts a fully valid multi-key research hypothesis", () => {
    const issues = validateHypothesisConditions({
      asset: "OIL",
      touch_direction: ">= 1",
      sell_yes_edge_pts: ">= 1",
      smart_flow_stance: "<= 0",
      days_to_expiry: "between 1 and 10",
      liquidity: ">= 5000",
    }, VALUATION_COLUMNS);
    expect(issues).toEqual([]);
  });

  it("formats issues into a readable reject note", () => {
    const issues = validateHypothesisConditions({ contract_expiry_days: "<= 5" }, VALUATION_COLUMNS);
    expect(formatConditionIssues(issues)).toContain("did you mean \"days_to_expiry\"?");
  });
});

describe("spot-panel miner conditions validate against the catalog", () => {
  // Representative condition sets exactly as mine_spot_panel_findings.py
  // emits them (see SpotFeature.condition_for in spot_panel_common.py).
  // If the catalog grammar or derived-key pattern ever changes shape, this
  // fails before a nightly run can register unauthorable FINDs.
  const SPOT_COLUMNS = [
    ...VALUATION_COLUMNS,
    "gold_gc_spot", "oil_hl_funding_ann", "btc_hl_funding_ann",
    "btc_opt_iv_term_spread", "amzn_pc_ratio",
  ];

  it("accepts derived, funding, metadata and term-spread conditions", () => {
    const conditionSets: Record<string, string>[] = [
      { asset: "BTC", btc_spot_change_pct_24h: "between -2 and 0", day_of_week: "in [sat, sun]" },
      { asset: "GOLD", gold_gc_spot_pct_from_7d_high: "< -5" },
      { asset: "OIL", oil_hl_funding_ann: "between 0 and 20", day_of_week: "in [mon, tue, wed, thu, fri]" },
      { asset: "BTC", btc_hl_funding_ann_zscore_30d: "< -1.5" },
      { asset: "AMZN", amzn_pc_ratio_percentile_30d: ">= 80" },
      { asset: "BTC", btc_opt_iv_term_spread: ">= 5" },
      { asset: "GOLD", gold_gc_spot_pct_vs_30d_sma: "between -3 and 0" },
    ];
    for (const conditions of conditionSets) {
      const issues = validateHypothesisConditions(conditions, SPOT_COLUMNS);
      expect(issues, JSON.stringify(conditions)).toEqual([]);
    }
  });
});

describe("alias table stays inside the catalog", () => {
  it("every alias target is an evaluable catalog key", () => {
    for (const target of Object.values(CONDITION_KEY_ALIASES)) {
      expect(MARKET_ROW_CONDITION_KEYS.has(target) || METADATA_CONDITION_KEYS.has(target)).toBe(true);
    }
  });

  it("suggestConditionKey resolves dynamic asset-prefixed edge keys", () => {
    expect(suggestConditionKey("gold_one_touch_sell_yes_edge_pts")).toBe("sell_yes_edge_pts");
    expect(suggestConditionKey("completely_made_up_key")).toBeNull();
  });
});

// ─── 3. Prompt section completeness ──────────────────────────────────────────

describe("buildConditionCatalogPromptSection", () => {
  const section = buildConditionCatalogPromptSection(VALUATION_COLUMNS);

  it("advertises every catalog entry with its definition", () => {
    for (const entry of CONDITION_CATALOG) {
      if (entry.advertise === false) continue;
      expect(section).toContain(entry.label);
      expect(section).toContain(entry.example.key);
    }
  });

  it("lists the live valuation columns", () => {
    for (const column of VALUATION_COLUMNS) expect(section).toContain(column);
  });

  it("states the ingest rejection consequence and the syntax whitelist", () => {
    expect(section).toContain("unevaluable_conditions");
    expect(section).toContain("between A and B");
    expect(section).toContain("PROHIBITED");
  });

  it("flags missing valuation columns instead of omitting the section", () => {
    expect(buildConditionCatalogPromptSection([])).toContain("valuation columns unavailable");
  });
});
