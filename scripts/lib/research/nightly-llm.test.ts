import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildNightlyResearchPrompt,
  parseNightlyAdvice,
  runNightlyLlmStep,
  type NightlyHypothesisSummary,
} from "./nightly-llm.js";

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
  it("includes the supported derived condition keys list", () => {
    const prompt = buildNightlyResearchPrompt(emptyInputs);
    expect(prompt).toContain("Supported derived condition keys:");
    expect(prompt).toContain("_pct_from_<N>h_high");
    expect(prompt).toContain("btc_spot_pct_from_7d_high > -3");
    expect(prompt).toContain("_percentile_<N>h");
    expect(prompt).toContain("_zscore_<N>h");
    expect(prompt).toContain("_change_pct_<N>h");
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
      hyp({ id: "H-001", status: "active", description: "A".repeat(150), winRate: 0.6, tests: [1, 2, 3] }),
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

describe("runNightlyLlmStep", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "nightly-llm-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("skips without writing a file when no API key is configured", async () => {
    const result = await runNightlyLlmStep({ dataDir });
    expect(result).toEqual({ skipped: true, wrote: false });
    expect(existsSync(join(dataDir, "nightly-llm-advice.json"))).toBe(false);
  });

  it("skips without writing a file when NIGHTLY_LLM_DISABLE=1, even with a key configured", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NIGHTLY_LLM_DISABLE = "1";
    const result = await runNightlyLlmStep({ dataDir });
    expect(result).toEqual({ skipped: true, wrote: false });
    expect(existsSync(join(dataDir, "nightly-llm-advice.json"))).toBe(false);
  });
});
