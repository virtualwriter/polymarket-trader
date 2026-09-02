import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildNightlyResearchPrompt,
  collectStrugglingFamilies,
  isSubstantiveNightlyAdvice,
  parseNightlyAdvice,
  runNightlyLlmStep,
  type NightlyHypothesisSummary,
} from "./nightly-llm.js";

const requestLlmText = vi.hoisted(() => vi.fn());
vi.mock("../trading/llm-transport.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trading/llm-transport.js")>();
  return {
    ...actual,
    requestLlmText,
    resolveLlmRoute: (purpose: Parameters<typeof actual.resolveLlmRoute>[0]) => {
      if (process.env.NIGHTLY_LLM_DISABLE === "1") return null;
      if (!process.env.ANTHROPIC_API_KEY && !process.env.DEEPSEEK_API_KEY) return null;
      return actual.resolveLlmRoute(purpose) ?? {
        provider: "deepseek" as const,
        model: "deepseek-v4-pro",
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || "test-key",
      };
    },
  };
});

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "DEEPSEEK_API_KEY",
  "LLM_PROVIDER",
  "NIGHTLY_LLM_PROVIDER",
  "NIGHTLY_LLM_MODEL",
  "NIGHTLY_LLM_DISABLE",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function hyp(overrides: Partial<NightlyHypothesisSummary> & { id: string }): NightlyHypothesisSummary {
  return {
    status: "active",
    description: "BTC pulls back after crowded long positioning near highs",
    winRate: 0.55,
    tests: [{ outcome: "win" }, { outcome: "loss" }],
    ...overrides,
  };
}

const emptyInputs = {
  truthState: null,
  engineState: null,
  lessons: null,
  hypotheses: [] as NightlyHypothesisSummary[],
  learningParams: null,
};

describe("buildNightlyResearchPrompt", () => {
  it("includes the strict condition key catalog", () => {
    const prompt = buildNightlyResearchPrompt({ ...emptyInputs, valuationColumns: ["btc_spot", "btc_pm_iv"] });
    expect(prompt).toContain("CONDITION KEY CATALOG (STRICT");
    expect(prompt).toContain("unevaluable_conditions");
    expect(prompt).toContain("sell_yes_edge_pts");
    expect(prompt).toContain("days_to_expiry");
    expect(prompt).toContain("_pct_from_<N>h|d_high");
    expect(prompt).toContain("btc_spot, btc_pm_iv");
    expect(prompt).toContain("ONLY keys from the CONDITION KEY CATALOG");
  });

  it("shows prior ingest rejections so the model does not resubmit them unchanged", () => {
    const prompt = buildNightlyResearchPrompt({
      ...emptyInputs,
      priorRejections: {
        ingestedAt: "2026-08-27T07:28:00Z",
        lines: ["Nightly advice: skipping too-rare hypothesis (~0.00 triggers/week over 35d, need ≥1): Refinement of H-539"],
      },
    });
    expect(prompt).toContain("YOUR PREVIOUS RUN'S INGEST REJECTIONS (2026-08-27T07:28:00Z)");
    expect(prompt).toContain("Refinement of H-539");
    expect(prompt).toContain("Do NOT resubmit the same idea unchanged");
  });

  it("omits the prior-rejection section when there are none", () => {
    const prompt = buildNightlyResearchPrompt({ ...emptyInputs, priorRejections: null });
    expect(prompt).not.toContain("PREVIOUS RUN'S INGEST REJECTIONS");
  });

  it("shows the hourly shadow-learning digest with the weekend-clustering caution", () => {
    const prompt = buildNightlyResearchPrompt({
      ...emptyInputs,
      shadowLearning: {
        notes: ["WEEKEND_HL_FUNDING_REVERSION_LONG: trend filter may be too strict (188/253 blocked would have won)"],
        weekendFunding: { entryPct: -0.5, live: { weekends: 14, meanWeekendPnlPct: -0.4 } },
      },
    });
    expect(prompt).toContain("HOURLY SHADOW-LEARNING DIGEST");
    expect(prompt).toContain("188/253 blocked would have won");
    expect(prompt).toContain("each weekend is ONE observation");
    expect(prompt).toContain("weekendFundingEntryPct: -0.75 to -0.25");
  });

  it("marks the valuation column list unavailable when columns are missing", () => {
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain("valuation columns unavailable this run");
  });

  it("includes the direction field rule", () => {
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain('Every newHypothesis MUST include a direction field: "long"');
    expect(prompt).toContain("neutral");
  });

  it("includes the parameter bounds list", () => {
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain("macroMomentum24hThresholdPts: 2 to 20");
    expect(prompt).toContain("contrarianTrendMarginPct: 0 to 5");
    expect(prompt).toContain("positiveMomentum24hPct: 0 to 10");
    expect(prompt).toContain("llmTradeExpiryDays: 3 to 30");
    expect(prompt).toContain("momentumLongExpiryDays: 3 to 45");
    expect(prompt).toContain("signalRisk.<signal>.targetPct: 0.5 to 15");
    expect(prompt).toContain("signalRisk.<signal>.stopPct: 0.5 to 10");
  });

  it("includes the locked-signal line", () => {
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain("ONE_TOUCH_HIGH_EDGE_NO");
  });

  it("renders ranked research opportunities and theme summaries", () => {
    const prompt = buildNightlyResearchPrompt({
      ...emptyInputs,
      opportunities: [
        {
          rank: 1,
          id: "FIND-0003",
          clusterKey: "ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no",
          opportunityScore: 0.7807,
          confidenceScore: 0.3182,
          evidence: { n: 12, winRate: 0.5833, sumPnl: 0.6492 },
          themeId: "THEME-0001",
          title: "Shadow FIND: one-touch GOLD NO",
        },
      ],
      themes: [
        {
          id: "THEME-0001",
          title: "Heatmap one-touch shadows",
          status: "active",
          findingIds: ["FIND-0003"],
          findingCount: 1,
          avgOpportunityScore: 0.7807,
        },
      ],
    });
    expect(prompt).toContain("RANKED RESEARCH OPPORTUNITIES");
    expect(prompt).toContain("FIND-0003");
    expect(prompt).toContain("themeId=THEME-0001");
    expect(prompt).toContain("ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no");
    expect(prompt).toContain("RESEARCH THEMES SUMMARY");
    expect(prompt).toContain("every non-refinement newHypothesis MUST be authored from one of those findings");
  });

  it("lists retired setup ids as blocked when provided", () => {
    const prompt = buildNightlyResearchPrompt({ ...emptyInputs, retiredSetupIds: ["generic_macro_correlation"] });
    expect(prompt).toContain("Retired LLM setup families are blocked");
    expect(prompt).toContain("generic_macro_correlation");
  });

  it("says no setup families are retired when the list is empty", () => {
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain("No setup families are currently retired.");
  });

  it("renders active/promoted hypotheses as compact one-liners and excludes killed/archived from that section", () => {
    const hypotheses: NightlyHypothesisSummary[] = [
      hyp({ id: "H-001", status: "active", description: "A".repeat(150), winRate: 0.6, tests: [{ outcome: "win" }, { outcome: "win" }, { outcome: "loss" }] }),
      hyp({ id: "H-002", status: "promoted", description: "promoted thesis" }),
      hyp({ id: "H-003", status: "archived", description: "should not appear in active section" }),
      hyp({ id: "H-004", status: "killed", description: "killed thesis one", postMortem: "did not pan out" }),
    ];
    const prompt = buildNightlyResearchPrompt({ ...emptyInputs, hypotheses });

    expect(prompt).toContain("H-001");
    expect(prompt).toContain("H-002");
    expect(prompt).toContain("promoted thesis");
    expect(prompt).toContain("60% win rate over 3 test(s)");
    expect(prompt).not.toContain("A".repeat(101));
    expect(prompt).not.toContain("should not appear in active section");

    expect(prompt).toContain("H-004");
    expect(prompt).toContain("did not pan out");
  });

  it("keeps only the last 5 killed hypotheses", () => {
    const hypotheses: NightlyHypothesisSummary[] = Array.from({ length: 8 }, (_, i) =>
      hyp({ id: `H-${i}`, status: "killed", description: `killed number ${i}`, postMortem: "reason" }));
    const prompt = buildNightlyResearchPrompt({ ...emptyInputs, hypotheses });
    for (let i = 0; i < 3; i++) expect(prompt).not.toContain(`killed number ${i}`);
    for (let i = 3; i < 8; i++) expect(prompt).toContain(`killed number ${i}`);
  });

  it("includes the JSON response format block matching the advice-file schema", () => {
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain('"strategyReview"');
    expect(prompt).toContain('"failureClusters"');
    expect(prompt).toContain('"newHypotheses"');
    expect(prompt).toContain('"hypothesisReviews"');
    expect(prompt).toContain('"parameterUpdates"');
    expect(prompt).toContain('"journalEntry"');
    expect(prompt).not.toContain('"generatedAt"');
    expect(prompt).not.toContain('"model"');
  });

  it("handles missing/null/empty inputs without throwing", () => {
    expect(() => buildNightlyResearchPrompt(emptyInputs)).not.toThrow();
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain("(not available)");
    expect(prompt).toContain("None yet");
    expect(prompt).toContain("None");
  });

  it("shows real test outcomes for struggling setup families so the LLM can diagnose WHY", () => {
    const failingFamily: NightlyHypothesisSummary[] = Array.from({ length: 1 }, () => hyp({
      id: "H-045",
      setupId: "amzn_perp_spot_funding_convergence",
      conditions: { asset: "AMZN", amzn_hl_funding_ann: "< -20" },
      prediction: "AMZN funding normalizes toward zero",
      tests: [
        ...Array.from({ length: 7 }, (_, i) => ({
          date: `2026-07-${10 + i}`,
          outcome: i < 3 ? "win" : "loss",
          actualMove: `Funding moved -35.0% → ${i < 3 ? "-20.0" : "-40.0"}% (long reversion needs increase)`,
        })),
        { date: "2026-07-20", outcome: "loss", actualMove: "UNSCORABLE: missing hypothesis.direction and no directional language in prediction", excludedFromSetupStats: true },
      ],
    }));
    const prompt = buildNightlyResearchPrompt({ ...emptyInputs, hypotheses: failingFamily });

    expect(prompt).toContain("STRUGGLING SETUP FAMILIES");
    expect(prompt).toContain("amzn_perp_spot_funding_convergence — 3/7 scorable tests (43% win)");
    expect(prompt).toContain("long reversion needs increase");
    expect(prompt).toContain('"amzn_hl_funding_ann":"< -20"');
    expect(prompt).toContain("AMZN funding normalizes toward zero");
    // Diagnosis + refinement instructions are present.
    expect(prompt).toContain("invalidatedAssumption");
    expect(prompt).toContain("refinesHypothesisId");
    expect(prompt).toContain("learnedInvalidAssumptions");
  });

  it("says no families are struggling when records are healthy", () => {
    const healthy = [hyp({
      id: "H-001",
      setupId: "healthy_family",
      tests: Array.from({ length: 10 }, () => ({ outcome: "win", actualMove: "won" })),
    })];
    const prompt = buildNightlyResearchPrompt({ ...emptyInputs, hypotheses: healthy });
    expect(prompt).toContain("None currently meet the struggling threshold.");
  });

  it("serializes real truthState/engineState/lessons/learningParams objects", () => {
    const prompt = buildNightlyResearchPrompt({
      truthState: { setupFamilies: [{ setupId: "btc_iv_reversion" }] },
      engineState: { portfolio: { cash: 42 } },
      lessons: { lessons: [{ signalType: "SIG_A", note: "works well" }] },
      hypotheses: [],
      learningParams: { macroMomentum24hThresholdPts: 4 },
    });
    expect(prompt).toContain("btc_iv_reversion");
    expect(prompt).toContain("works well");
    expect(prompt).toContain("\"cash\": 42");
  });
});

describe("collectStrugglingFamilies", () => {
  it("flags unscorable-burn families even with few scorable tests", () => {
    const family = [hyp({
      id: "H-050",
      setupId: "burned_family",
      tests: Array.from({ length: 6 }, () => ({
        outcome: "loss",
        actualMove: "UNSCORABLE: missing hypothesis.direction and no directional language in prediction",
        excludedFromSetupStats: true,
      })),
    })];
    const out = collectStrugglingFamilies(family);
    expect(out).toHaveLength(1);
    expect(out[0].unscorableBurned).toBe(6);
    expect(out[0].completed).toBe(0);
  });

  it("ignores killed/archived hypotheses and healthy families", () => {
    const out = collectStrugglingFamilies([
      hyp({ id: "H-051", status: "killed", setupId: "dead", tests: Array.from({ length: 10 }, () => ({ outcome: "loss" })) }),
      hyp({ id: "H-052", setupId: "healthy", tests: Array.from({ length: 10 }, () => ({ outcome: "win" })) }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("aggregates variants of the same family and orders evidence chronologically", () => {
    const out = collectStrugglingFamilies([
      hyp({ id: "H-060", setupId: "fam", tests: [{ date: "2026-07-02", outcome: "loss", actualMove: "second" }, { date: "2026-07-01", outcome: "win", actualMove: "first" }] }),
      hyp({ id: "H-061", setupId: "fam", tests: [{ date: "2026-07-03", outcome: "loss", actualMove: "third" }, { date: "2026-07-04", outcome: "loss", actualMove: "fourth" }, { date: "2026-07-05", outcome: "loss", actualMove: "fifth" }] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].completed).toBe(5);
    expect(out[0].wins).toBe(1);
    expect(out[0].variantIds).toEqual(["H-060", "H-061"]);
    expect(out[0].recentOutcomes[0]).toContain("first");
    expect(out[0].recentOutcomes[4]).toContain("fifth");
  });
});

describe("parseNightlyAdvice", () => {
  const validPayload = {
    strategyReview: "Momentum setups are outperforming mean-reversion setups this week.",
    failureClusters: [
      { theme: "wide-spread PM entries", evidence: "3 losses on >6c spread", recommendation: "tighten spread gate" },
    ],
    newHypotheses: [
      {
        created: "2026-07-14",
        description: "BTC bounces after funding normalizes from extreme negative",
        conditions: { btc_funding_pct_vs_24h_sma: "> 0" },
        prediction: "BTC spot rises >2% within 5 days",
        timeframeDays: 5,
        confidence: 0.6,
        direction: "long",
        originFindingId: "FIND-0003",
        themeId: "THEME-0001",
        source: "llm",
      },
    ],
    hypothesisReviews: [{ id: "H-001", observation: "triggered twice this week, both wins" }],
    parameterUpdates: {
      macroMomentum24hThresholdPts: 5,
      signalRisk: { LLM_HYPOTHESIS: { targetPct: 4, stopPct: 2.5 } },
    },
    journalEntry: "Solid night of research.",
  };

  it("parses valid JSON wrapped in markdown fences", () => {
    const text = "Here is my analysis:\n```json\n" + JSON.stringify(validPayload) + "\n```";
    const { advice, error } = parseNightlyAdvice(text);
    expect(error).toBeNull();
    expect(advice).not.toBeNull();
    expect(advice!.strategyReview).toBe(validPayload.strategyReview);
    expect(advice!.failureClusters).toHaveLength(1);
    expect(advice!.newHypotheses).toHaveLength(1);
    expect(advice!.newHypotheses[0].direction).toBe("long");
    expect(advice!.newHypotheses[0].originFindingId).toBe("FIND-0003");
    expect(advice!.newHypotheses[0].themeId).toBe("THEME-0001");
    expect(advice!.hypothesisReviews).toHaveLength(1);
    expect(advice!.parameterUpdates?.macroMomentum24hThresholdPts).toBe(5);
    expect(advice!.parameterUpdates?.signalRisk?.LLM_HYPOTHESIS.targetPct).toBe(4);
    expect(advice!.journalEntry).toBe("Solid night of research.");
  });

  it("drops per-item out-of-bounds hypotheses instead of failing the whole response", () => {
    const payload = {
      ...validPayload,
      newHypotheses: [
        validPayload.newHypotheses[0],
        { ...validPayload.newHypotheses[0], created: "2026-07-14", timeframeDays: 99 }, // out of bounds (max 30)
        { ...validPayload.newHypotheses[0], created: "2026-07-14", confidence: 4 }, // out of bounds (max 1)
      ],
    };
    const { advice, error } = parseNightlyAdvice(JSON.stringify(payload));
    expect(error).toBeNull();
    expect(advice).not.toBeNull();
    // Only the well-formed hypothesis survives; the two out-of-bounds items are dropped.
    expect(advice!.newHypotheses).toHaveLength(1);
    expect(advice!.newHypotheses[0].timeframeDays).toBe(5);
  });

  it("drops hypotheses that carry neither originFindingId nor refinesHypothesisId", () => {
    const payload = {
      ...validPayload,
      newHypotheses: [
        validPayload.newHypotheses[0],
        { ...validPayload.newHypotheses[0], originFindingId: undefined },
      ],
    };
    const { advice, error } = parseNightlyAdvice(JSON.stringify(payload));
    expect(error).toBeNull();
    expect(advice!.newHypotheses).toHaveLength(1);
    expect(advice!.newHypotheses[0].originFindingId).toBe("FIND-0003");
  });

  it("keeps refinement hypotheses without originFindingId, even when a FIND allowlist is active", () => {
    const payload = {
      ...validPayload,
      newHypotheses: [
        {
          ...validPayload.newHypotheses[0],
          originFindingId: undefined,
          themeId: undefined,
          refinesHypothesisId: "H-045",
          description: "refinement: gate on funding percentile instead of raw level so entries catch turns not pins",
        },
      ],
    };
    const { advice, error } = parseNightlyAdvice(JSON.stringify(payload), { allowedOriginFindingIds: ["FIND-0003"] });
    expect(error).toBeNull();
    expect(advice!.newHypotheses).toHaveLength(1);
    expect(advice!.newHypotheses[0].refinesHypothesisId).toBe("H-045");
    expect(advice!.newHypotheses[0].originFindingId).toBeUndefined();
  });

  it("keeps invalidatedAssumption on hypothesis reviews", () => {
    const payload = {
      ...validPayload,
      hypothesisReviews: [
        { id: "H-045", observation: "7 of 10 tests show funding pinned negative for weeks", invalidatedAssumption: "Extreme negative AMZN funding does not mean-revert within 7 days." },
        { id: "H-001", observation: "fine", invalidatedAssumption: "too short" },
      ],
    };
    const { advice, error } = parseNightlyAdvice(JSON.stringify(payload));
    expect(error).toBeNull();
    expect(advice!.hypothesisReviews).toHaveLength(2);
    expect(advice!.hypothesisReviews[0].invalidatedAssumption).toContain("does not mean-revert");
    // Too-short assumptions are dropped without discarding the review itself.
    expect(advice!.hypothesisReviews[1].observation).toBe("fine");
    expect(advice!.hypothesisReviews[1].invalidatedAssumption).toBeUndefined();
  });

  it("drops hypotheses whose originFindingId was not in the ranked opportunities set", () => {
    const payload = {
      ...validPayload,
      newHypotheses: [
        validPayload.newHypotheses[0],
        { ...validPayload.newHypotheses[0], originFindingId: "FIND-9999" },
      ],
    };
    const { advice, error } = parseNightlyAdvice(JSON.stringify(payload), { allowedOriginFindingIds: ["FIND-0003"] });
    expect(error).toBeNull();
    expect(advice!.newHypotheses).toHaveLength(1);
    expect(advice!.newHypotheses[0].originFindingId).toBe("FIND-0003");
  });

  it("drops out-of-bounds parameterUpdates fields but keeps in-bounds ones", () => {
    const payload = {
      ...validPayload,
      parameterUpdates: {
        macroMomentum24hThresholdPts: 999, // out of bounds (max 20)
        contrarianTrendMarginPct: 1.5, // in bounds
        signalRisk: {
          GOOD_SIGNAL: { targetPct: 4, stopPct: 2 },
          BAD_SIGNAL: { targetPct: 999, stopPct: 2 }, // out of bounds
        },
      },
    };
    const { advice, error } = parseNightlyAdvice(JSON.stringify(payload));
    expect(error).toBeNull();
    expect(advice!.parameterUpdates?.macroMomentum24hThresholdPts).toBeUndefined();
    expect(advice!.parameterUpdates?.contrarianTrendMarginPct).toBe(1.5);
    expect(advice!.parameterUpdates?.signalRisk?.GOOD_SIGNAL).toBeDefined();
    expect(advice!.parameterUpdates?.signalRisk?.BAD_SIGNAL).toBeUndefined();
  });

  it("returns an error (never throws) for garbage input", () => {
    expect(() => parseNightlyAdvice("not json at all, just prose")).not.toThrow();
    const { advice, error } = parseNightlyAdvice("not json at all, just prose");
    expect(advice).toBeNull();
    expect(error).not.toBeNull();
  });

  it("returns an error (never throws) for malformed JSON", () => {
    expect(() => parseNightlyAdvice("{ this is not valid json")).not.toThrow();
    const { advice, error } = parseNightlyAdvice("{ this is not valid json");
    expect(advice).toBeNull();
    expect(error).not.toBeNull();
  });

  it("tolerates a partial response with only some top-level keys present", () => {
    const { advice, error } = parseNightlyAdvice(JSON.stringify({ strategyReview: "only this field" }));
    expect(error).toBeNull();
    expect(advice).not.toBeNull();
    expect(advice!.strategyReview).toBe("only this field");
    expect(advice!.failureClusters).toEqual([]);
    expect(advice!.newHypotheses).toEqual([]);
    expect(advice!.hypothesisReviews).toEqual([]);
    expect(advice!.parameterUpdates).toBeUndefined();
  });
});

describe("isSubstantiveNightlyAdvice", () => {
  it("rejects empty shells and accepts any substantive field", () => {
    expect(isSubstantiveNightlyAdvice({
      failureClusters: [],
      newHypotheses: [],
      hypothesisReviews: [],
    })).toBe(false);
    expect(isSubstantiveNightlyAdvice({
      strategyReview: "  ",
      failureClusters: [],
      newHypotheses: [],
      hypothesisReviews: [],
    })).toBe(false);
    expect(isSubstantiveNightlyAdvice({
      strategyReview: "review",
      failureClusters: [],
      newHypotheses: [],
      hypothesisReviews: [],
    })).toBe(true);
  });
});

describe("runNightlyLlmStep", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "nightly-llm-"));
    requestLlmText.mockReset();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("skips without writing a file when no API key is configured", async () => {
    const result = await runNightlyLlmStep({ dataDir });
    expect(result).toEqual({ skipped: true, wrote: false });
    expect(existsSync(join(dataDir, "nightly-llm-advice.json"))).toBe(false);
    expect(requestLlmText).not.toHaveBeenCalled();
  });

  it("skips without writing a file when NIGHTLY_LLM_DISABLE=1, even with a key configured", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NIGHTLY_LLM_DISABLE = "1";
    const result = await runNightlyLlmStep({ dataDir });
    expect(result).toEqual({ skipped: true, wrote: false });
    expect(existsSync(join(dataDir, "nightly-llm-advice.json"))).toBe(false);
    expect(requestLlmText).not.toHaveBeenCalled();
  });

  it("retries and fails hard when advice is empty while opportunities exist", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    writeFileSync(join(dataDir, "research-opportunities.json"), JSON.stringify({
      topN: 10,
      opportunities: [{
        rank: 1,
        id: "FIND-0003",
        clusterKey: "ONE_TOUCH|BTC|heatmap|no",
        opportunityScore: 0.8,
        title: "test finding",
      }],
    }));
    const emptyStub = JSON.stringify({
      strategyReview: "",
      failureClusters: [],
      newHypotheses: [],
      hypothesisReviews: [],
    });
    requestLlmText
      .mockResolvedValueOnce({ text: emptyStub, stopReason: "stop" })
      .mockResolvedValueOnce({ text: emptyStub, stopReason: "stop" });

    const result = await runNightlyLlmStep({ dataDir });
    expect(result.skipped).toBe(false);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatch(/empty advice after repair/i);
    expect(requestLlmText).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dataDir, "nightly-llm-advice.json"))).toBe(false);
  });

  it("writes after empty-advice repair succeeds", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    writeFileSync(join(dataDir, "research-opportunities.json"), JSON.stringify({
      topN: 10,
      opportunities: [{ rank: 1, id: "FIND-0003", opportunityScore: 0.8 }],
    }));
    const emptyStub = JSON.stringify({ newHypotheses: [], hypothesisReviews: [], failureClusters: [] });
    const repaired = JSON.stringify({
      strategyReview: "Highs-only fades remain the best edge.",
      failureClusters: [],
      newHypotheses: [],
      hypothesisReviews: [{ id: "H-001", observation: "still working" }],
    });
    requestLlmText
      .mockResolvedValueOnce({ text: emptyStub, stopReason: "stop" })
      .mockResolvedValueOnce({ text: repaired, stopReason: "stop" });

    const result = await runNightlyLlmStep({ dataDir });
    expect(result).toEqual({ skipped: false, wrote: true });
    expect(requestLlmText).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dataDir, "nightly-llm-advice.json"))).toBe(true);
  });
});
