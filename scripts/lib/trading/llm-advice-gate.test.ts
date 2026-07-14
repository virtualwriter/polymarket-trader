import { describe, expect, it } from "vitest";
import { buildGatedLlmAdvice, llmEntryInstructionToShadowDraft, type LlmAdviceInstruction } from "./llm-advice-gate.js";

const baseInstruction: LlmAdviceInstruction = {
  action: "close",
  positionId: "T-1",
  asset: "BTC",
  venue: "spot",
  direction: "long",
  closeReasonCategory: "thesis_invalidated",
  evidenceColumns: ["btc_spot"],
  thesis: "Signal invalidated.",
};

const position = {
  id: "T-1",
  asset: "BTC",
  venue: "spot" as const,
  direction: "long" as const,
  signalType: "LLM_HYPOTHESIS",
};

const eligibility = {
  positionId: "T-1",
  allowed: true,
  allowedCategories: ["thesis_invalidated", "profit_taking"] as const,
  evidenceColumns: ["btc_spot"],
};

describe("LLM advice gate", () => {
  it("accepts eligible close instructions and preserves parameter updates", () => {
    const result = buildGatedLlmAdvice({
      llmResult: { trades: [baseInstruction], parameterUpdates: { llmTradeExpiryDays: 14 } },
      positions: [position],
      llmCloseEligibility: [eligibility],
      allowHourlyLlmCloses: true,
    });

    expect(result.acceptedCloses).toEqual([baseInstruction]);
    expect(result.rejectedCloses).toEqual([]);
    expect(result.parameterUpdates).toEqual({ llmTradeExpiryDays: 14 });
  });

  it("skips direct LLM entries", () => {
    const buyInstruction: LlmAdviceInstruction = { ...baseInstruction, action: "buy" };
    const result = buildGatedLlmAdvice({
      llmResult: { trades: [buyInstruction] },
      positions: [position],
      llmCloseEligibility: [eligibility],
      allowHourlyLlmCloses: true,
    });

    expect(result.skippedTrades[0]).toMatchObject({
      instruction: buyInstruction,
      reason: "Direct LLM entries remain disabled; hypotheses must be promoted before trading.",
    });
  });

  it("rejects closes when hourly LLM closes are disabled", () => {
    const result = buildGatedLlmAdvice({
      llmResult: { trades: [baseInstruction] },
      positions: [position],
      llmCloseEligibility: [eligibility],
      allowHourlyLlmCloses: false,
    });

    expect(result.rejectedCloses[0].reason).toBe("LLM close rejected: hourly discretionary closes are disabled; minute scanner handles mechanical exits.");
  });

  it("rejects mismatched position identity and ineligible categories", () => {
    const identityResult = buildGatedLlmAdvice({
      llmResult: { trades: [{ ...baseInstruction, asset: "GOLD" }] },
      positions: [position],
      llmCloseEligibility: [eligibility],
      allowHourlyLlmCloses: true,
    });
    expect(identityResult.rejectedCloses[0].reason).toBe("LLM close rejected: position identity fields do not match the requested positionId.");

    const categoryResult = buildGatedLlmAdvice({
      llmResult: { trades: [{ ...baseInstruction, closeReasonCategory: "risk_stale" }] },
      positions: [position],
      llmCloseEligibility: [eligibility],
      allowHourlyLlmCloses: true,
    });
    expect(categoryResult.rejectedCloses[0].reason).toBe("LLM close rejected: category risk_stale is not allowed for LLM_HYPOTHESIS.");
  });

  it("rejects invalid evidence except hard-risk and data-quality categories", () => {
    const result = buildGatedLlmAdvice({
      llmResult: { trades: [{ ...baseInstruction, evidenceColumns: ["eth_spot"] }] },
      positions: [position],
      llmCloseEligibility: [eligibility],
      allowHourlyLlmCloses: true,
    });
    expect(result.rejectedCloses[0].reason).toBe("LLM close rejected: evidence columns outside signal family (eth_spot).");

    const hardRisk = buildGatedLlmAdvice({
      llmResult: { trades: [{ ...baseInstruction, closeReasonCategory: "hard_portfolio_risk", evidenceColumns: ["eth_spot"] }] },
      positions: [position],
      llmCloseEligibility: [{ ...eligibility, allowedCategories: ["hard_portfolio_risk"] }],
      allowHourlyLlmCloses: true,
    });
    expect(hardRisk.acceptedCloses).toHaveLength(1);
  });

  it("rejects LLM profit taking for rule-based signals", () => {
    const result = buildGatedLlmAdvice({
      llmResult: { trades: [{ ...baseInstruction, closeReasonCategory: "profit_taking" }] },
      positions: [{ ...position, signalType: "PC_RATIO_EXTREME_HIGH" }],
      llmCloseEligibility: [eligibility],
      allowHourlyLlmCloses: true,
    });

    expect(result.rejectedCloses[0].reason).toBe("LLM close rejected: profit-taking on rule-based signals is handled by mechanical targets.");
  });
});

describe("llmEntryInstructionToShadowDraft", () => {
  const buyInstruction: LlmAdviceInstruction = {
    action: "buy",
    asset: "BTC",
    venue: "spot",
    direction: "long",
    thesis: "BTC momentum idea.",
  };
  const opts = { entryPrice: 60000, targetPct: 3.5, stopPct: 2.5, expiryDays: 14 };

  it("converts a buy instruction into a shadow-only LLM_HYPOTHESIS draft", () => {
    const draft = llmEntryInstructionToShadowDraft(buyInstruction, opts);
    expect(draft).toMatchObject({
      type: "LLM_HYPOTHESIS",
      asset: "BTC",
      venue: "spot",
      direction: "long",
      entryPrice: 60000,
      targetPct: 3.5,
      stopPct: 2.5,
      expiryDays: 14,
    });
    expect(draft?.thesis).toContain("[LLM UNPROMOTED ENTRY SHADOW]");
  });

  it("infers direction from the action when direction is 'any'", () => {
    const sell = llmEntryInstructionToShadowDraft({ ...buyInstruction, action: "sell", direction: "any" }, opts);
    expect(sell?.direction).toBe("short");
    const buy = llmEntryInstructionToShadowDraft({ ...buyInstruction, direction: "any" }, opts);
    expect(buy?.direction).toBe("long");
  });

  it("returns null for close instructions and unknown entry prices", () => {
    expect(llmEntryInstructionToShadowDraft({ ...buyInstruction, action: "close" }, opts)).toBeNull();
    expect(llmEntryInstructionToShadowDraft(buyInstruction, { ...opts, entryPrice: null })).toBeNull();
    expect(llmEntryInstructionToShadowDraft(buyInstruction, { ...opts, entryPrice: 0 })).toBeNull();
  });
});
