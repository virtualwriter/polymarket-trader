export type LlmAdviceDirection = "long" | "short" | "any";
export type LlmAdviceVenue = "polymarket" | "hyperliquid" | "spot";
export type LlmCloseReasonCategory =
  | "thesis_invalidated"
  | "data_quality_issue"
  | "hard_portfolio_risk"
  | "risk_stale"
  | "profit_taking";

export interface LlmAdviceInstruction {
  action: "buy" | "sell" | "close";
  positionId?: string;
  asset: string;
  venue: LlmAdviceVenue;
  direction: LlmAdviceDirection;
  closeReasonCategory?: LlmCloseReasonCategory;
  evidenceColumns?: string[];
  thesis: string;
}

export interface LlmAdvicePosition {
  id: string;
  asset: string;
  venue: LlmAdviceVenue;
  direction: Exclude<LlmAdviceDirection, "any">;
  signalType: string;
}

export interface LlmCloseEligibilityForGate {
  positionId: string;
  allowed: boolean;
  allowedCategories: readonly LlmCloseReasonCategory[];
  evidenceColumns: string[];
}

export interface GatedLlmAdviceResult<TParameterUpdates> {
  acceptedCloses: LlmAdviceInstruction[];
  rejectedCloses: Array<{ instruction: LlmAdviceInstruction; reason: string }>;
  skippedTrades: Array<{ instruction: LlmAdviceInstruction; reason: string }>;
  parameterUpdates: TParameterUpdates | undefined;
}

export function buildGatedLlmAdvice<TParameterUpdates>(inputs: {
  llmResult: { trades?: LlmAdviceInstruction[]; parameterUpdates?: TParameterUpdates } | null;
  positions: LlmAdvicePosition[];
  llmCloseEligibility: LlmCloseEligibilityForGate[];
  allowHourlyLlmCloses: boolean;
}): GatedLlmAdviceResult<TParameterUpdates> {
  const acceptedCloses: LlmAdviceInstruction[] = [];
  const rejectedCloses: GatedLlmAdviceResult<TParameterUpdates>["rejectedCloses"] = [];
  const skippedTrades: GatedLlmAdviceResult<TParameterUpdates>["skippedTrades"] = [];
  if (!inputs.llmResult) {
    return { acceptedCloses, rejectedCloses, skippedTrades, parameterUpdates: undefined };
  }

  for (const instruction of inputs.llmResult.trades ?? []) {
    if (instruction.action !== "close") {
      skippedTrades.push({ instruction, reason: "Direct LLM entries remain disabled; hypotheses must be promoted before trading." });
      continue;
    }
    if (!inputs.allowHourlyLlmCloses) {
      rejectedCloses.push({ instruction, reason: "LLM close rejected: hourly discretionary closes are disabled; minute scanner handles mechanical exits." });
      continue;
    }
    if (!instruction.positionId) {
      rejectedCloses.push({ instruction, reason: "LLM close rejected: missing positionId." });
      continue;
    }
    const position = inputs.positions.find((candidate) => candidate.id === instruction.positionId);
    if (!position) {
      rejectedCloses.push({ instruction, reason: `LLM close rejected: unknown positionId ${instruction.positionId}.` });
      continue;
    }
    if (instruction.asset !== position.asset || instruction.venue !== position.venue || (instruction.direction !== "any" && instruction.direction !== position.direction)) {
      rejectedCloses.push({ instruction, reason: "LLM close rejected: position identity fields do not match the requested positionId." });
      continue;
    }
    const eligibility = inputs.llmCloseEligibility.find((row) => row.positionId === position.id);
    if (!eligibility?.allowed) {
      rejectedCloses.push({ instruction, reason: "LLM close rejected: position is not eligible for LLM exits." });
      continue;
    }
    const category = instruction.closeReasonCategory ?? "thesis_invalidated";
    if (!eligibility.allowedCategories.includes(category)) {
      rejectedCloses.push({ instruction, reason: `LLM close rejected: category ${category} is not allowed for ${position.signalType}.` });
      continue;
    }
    const evidenceColumns = instruction.evidenceColumns ?? [];
    const invalidEvidence = evidenceColumns.filter((column) => !eligibility.evidenceColumns.includes(column));
    if (invalidEvidence.length > 0 && category !== "hard_portfolio_risk" && category !== "data_quality_issue") {
      rejectedCloses.push({ instruction, reason: `LLM close rejected: evidence columns outside signal family (${invalidEvidence.join(", ")}).` });
      continue;
    }
    if (position.signalType !== "LLM_HYPOTHESIS" && position.signalType !== "PROMOTED_HYPOTHESIS" && category === "profit_taking") {
      rejectedCloses.push({ instruction, reason: "LLM close rejected: profit-taking on rule-based signals is handled by mechanical targets." });
      continue;
    }
    acceptedCloses.push(instruction);
  }

  return {
    acceptedCloses,
    rejectedCloses,
    skippedTrades,
    parameterUpdates: inputs.llmResult.parameterUpdates,
  };
}

export interface LlmShadowSignalDraft {
  type: "LLM_HYPOTHESIS";
  asset: string;
  venue: LlmAdviceVenue;
  direction: Exclude<LlmAdviceDirection, "any">;
  strength: number;
  confidence: number;
  thesis: string;
  hypothesisId: null;
  entryPrice: number;
  targetPct: number | null;
  stopPct: number;
  expiryDays: number;
}

/**
 * Convert a skipped LLM entry instruction into a shadow-signal draft so
 * unvetted ideas are measured instead of silently discarded. Live entries
 * stay disabled (the gate above skips them); this preserves the learning
 * signal so promotion decisions can be made on evidence. Returns null when
 * the instruction cannot be expressed as a shadow (close action, unknown
 * entry price).
 */
export function llmEntryInstructionToShadowDraft(
  instruction: LlmAdviceInstruction,
  opts: { entryPrice: number | null; targetPct: number | null; stopPct: number; expiryDays: number },
): LlmShadowSignalDraft | null {
  if (instruction.action === "close") return null;
  if (opts.entryPrice === null || !(opts.entryPrice > 0)) return null;
  const direction: Exclude<LlmAdviceDirection, "any"> = instruction.direction !== "any"
    ? instruction.direction
    : instruction.action === "buy" ? "long" : "short";
  return {
    type: "LLM_HYPOTHESIS",
    asset: instruction.asset,
    venue: instruction.venue,
    direction,
    strength: 0.5,
    confidence: 0.5,
    thesis: `[LLM UNPROMOTED ENTRY SHADOW] ${instruction.thesis}`,
    hypothesisId: null,
    entryPrice: opts.entryPrice,
    targetPct: opts.targetPct,
    stopPct: opts.stopPct,
    expiryDays: opts.expiryDays,
  };
}
