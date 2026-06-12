export type LlmCloseCategory =
  | "thesis_invalidated"
  | "data_quality_issue"
  | "hard_portfolio_risk"
  | "risk_stale"
  | "profit_taking";

export interface PositionTimingInput {
  openedAt: string;
  expiryDate: string;
}

export interface PositionTimingContext {
  hoursOpen: number | null;
  hoursToExpiry: number | null;
  plannedHoldHours: number | null;
  elapsedHoldPct: number | null;
}

export interface LlmCloseEligibilityPosition extends PositionTimingInput {
  id: string;
  signalType: string;
  asset: string;
  venue: string;
  direction: string;
  targetPct: number | null;
}

export interface LlmCloseEligibilityMark {
  pnlPct: number;
}

export interface LlmCloseEligibilityConfig {
  closeMinHoldHours: number;
  longDatedCloseHours: number;
  longDatedCloseMinProgress: number;
  longDatedCloseMaxExtraBufferHours: number;
  profitTakeTargetFraction: number;
}

export interface LlmCloseEligibility {
  positionId: string;
  signalType: string;
  asset: string;
  venue: string;
  direction: string;
  allowed: boolean;
  allowedCategories: LlmCloseCategory[];
  evidenceColumns: string[];
  hoursOpen: number | null;
  hoursToExpiry: number | null;
  plannedHoldHours: number | null;
  elapsedHoldPct: number | null;
  minHoldHours: number;
  reason: string;
}

function rounded(value: number | null, decimals: number): number | null {
  return value === null ? null : Number(value.toFixed(decimals));
}

export function positionTimingContext(position: PositionTimingInput, nowMs = Date.now()): PositionTimingContext {
  const openedMs = Date.parse(position.openedAt);
  const expiryMs = Date.parse(position.expiryDate);
  const hoursOpen = Number.isFinite(openedMs) ? (nowMs - openedMs) / (60 * 60 * 1000) : null;
  const hoursToExpiry = Number.isFinite(expiryMs) ? (expiryMs - nowMs) / (60 * 60 * 1000) : null;
  const plannedHoldHours = Number.isFinite(openedMs) && Number.isFinite(expiryMs)
    ? Math.max(0, (expiryMs - openedMs) / (60 * 60 * 1000))
    : null;
  const elapsedHoldPct = plannedHoldHours && plannedHoldHours > 0 && hoursOpen !== null
    ? Math.max(0, Math.min(1, hoursOpen / plannedHoldHours))
    : null;
  return { hoursOpen, hoursToExpiry, plannedHoldHours, elapsedHoldPct };
}

export function llmCloseMinHoldHours(
  config: Pick<LlmCloseEligibilityConfig, "closeMinHoldHours" | "longDatedCloseHours" | "longDatedCloseMinProgress" | "longDatedCloseMaxExtraBufferHours">,
  timing: PositionTimingContext,
): number {
  const plannedHoldHours = timing.plannedHoldHours;
  if (plannedHoldHours === null || plannedHoldHours < config.longDatedCloseHours) return config.closeMinHoldHours;
  const progressBuffer = plannedHoldHours * config.longDatedCloseMinProgress;
  return Math.max(
    config.closeMinHoldHours,
    Math.min(config.longDatedCloseMaxExtraBufferHours, progressBuffer),
  );
}

export function buildLlmCloseEligibility(inputs: {
  position: LlmCloseEligibilityPosition;
  mark: LlmCloseEligibilityMark | null;
  evidenceColumns: string[];
  signalOwned: boolean;
  mechanicalEligible: boolean;
  config: LlmCloseEligibilityConfig;
  timing?: PositionTimingContext;
}): LlmCloseEligibility {
  const { position, mark, evidenceColumns, signalOwned, mechanicalEligible, config } = inputs;
  const llmCloseEligible = signalOwned || mechanicalEligible;
  const timing = inputs.timing ?? positionTimingContext(position);
  const minHoldHours = llmCloseMinHoldHours(config, timing);
  const baseCategories: LlmCloseCategory[] = signalOwned
    ? ["thesis_invalidated", "data_quality_issue", "hard_portfolio_risk", "risk_stale", "profit_taking"]
    : mechanicalEligible
      ? ["thesis_invalidated", "data_quality_issue", "hard_portfolio_risk"]
      : [];
  const conservativeCategories: LlmCloseCategory[] = ["data_quality_issue", "hard_portfolio_risk"];
  const profitableEnoughForEarlyTake =
    signalOwned
    && mark !== null
    && position.targetPct !== null
    && mark.pnlPct >= position.targetPct * config.profitTakeTargetFraction;
  if (profitableEnoughForEarlyTake) conservativeCategories.push("profit_taking");

  let allowed = llmCloseEligible;
  let allowedCategories = baseCategories;
  let reason = signalOwned
    ? `LLM-owned/promoted setup may be closed after ${config.closeMinHoldHours}h if signal-family evidence supports it.`
    : mechanicalEligible
      ? `Mechanical ${position.signalType} setup may be closed after ${config.closeMinHoldHours}h only when the signal's own input has reversed (thesis_invalidated), or for hard portfolio risk / data quality. Profit-taking remains mechanical.`
      : "Rule-based signal exits remain mechanical; LLM closes are not allowed.";

  if (llmCloseEligible && (timing.hoursOpen === null || timing.hoursOpen < config.closeMinHoldHours)) {
    allowed = false;
    allowedCategories = [];
    const observed = timing.hoursOpen === null ? "unknown" : `${timing.hoursOpen.toFixed(1)}h`;
    reason = `Too new for discretionary LLM close: open ${observed}, requires at least ${config.closeMinHoldHours}h.`;
  } else if (signalOwned && timing.hoursOpen !== null && timing.hoursOpen < minHoldHours) {
    allowed = true;
    allowedCategories = conservativeCategories;
    reason = `Long-dated trade is only ${(timing.elapsedHoldPct === null ? 0 : timing.elapsedHoldPct * 100).toFixed(1)}% through planned hold; early LLM closes limited to hard risk/data quality${profitableEnoughForEarlyTake ? "/profit-taking near target" : ""} until ${minHoldHours.toFixed(1)}h.`;
  }

  return {
    positionId: position.id,
    signalType: position.signalType,
    asset: position.asset,
    venue: position.venue,
    direction: position.direction,
    allowed,
    allowedCategories,
    evidenceColumns,
    hoursOpen: rounded(timing.hoursOpen, 2),
    hoursToExpiry: rounded(timing.hoursToExpiry, 2),
    plannedHoldHours: rounded(timing.plannedHoldHours, 2),
    elapsedHoldPct: rounded(timing.elapsedHoldPct, 4),
    minHoldHours: Number(minHoldHours.toFixed(2)),
    reason,
  };
}
