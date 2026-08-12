/**
 * Scale-out exit policy for Polymarket binary contracts.
 *
 * A binary bought at $p settles at $0 or $1, so the profit available to a holder
 * is capped at (1 - p) per share while the loss is capped at p. Holding to
 * settlement means carrying the whole residual barrier risk to collect the last
 * slice of a payoff that is bounded by construction. The policy here takes most
 * of that payoff early and leaves the expensive tail behind:
 *
 *   - at 50% of max profit, sell half the position
 *   - at 70% of max profit, close the remainder
 *   - cut at 40% below the reference price, which starts at entry and ratchets
 *     up to the first scale-out price once that fill happens
 *
 * Thresholds are expressed as fractions of *max profit*, not as percentage
 * returns on premium. On a $0.09 contract a 4x return is only 33% of the
 * available payoff, so a return-based ladder would exit far too early on cheap
 * contracts and far too late on expensive ones. Max profit is the invariant
 * denominator across the price range.
 *
 * Known limitation: the loss stop is a fraction of premium, so on a cheap
 * contract it is only a few ticks wide — 40% below a $0.09 entry is $0.054, and
 * ordinary penny flicker on a thin book is ±11% there. Cheap binaries will
 * therefore stop out on microstructure noise rather than on a thesis break. An
 * edge-based stop (exit when the model's edge over the book is gone) would not
 * have that failure mode, and is the natural successor to this rule.
 */

/** Fraction of max profit at which half the position comes off. */
export const FIRST_SCALE_PROFIT_FRACTION = 0.5;
/** Portion of the position sold at the first scale-out. */
export const FIRST_SCALE_SIZE_FRACTION = 0.5;
/** Fraction of max profit at which the residual is closed. */
export const FINAL_EXIT_PROFIT_FRACTION = 0.7;
/** Stop distance below the ratcheting reference price. */
export const LOSS_STOP_FRACTION = 0.4;
/**
 * Slack on threshold comparisons. Entry prices arrive from the book as values
 * like 0.08999999999999997, so a threshold derived from one can land a few ulps
 * on the wrong side of its own boundary. Without slack the documented levels
 * would be knife-edges that fire or miss unpredictably.
 */
const THRESHOLD_EPSILON = 1e-9;

export type BinaryScaleAction =
  | { kind: "hold" }
  | { kind: "scale_out"; sizeFraction: number; capturedFraction: number }
  | { kind: "close"; reason: "target" | "stop"; capturedFraction: number };

export interface BinaryScaleState {
  entryPrice: number;
  currentPrice: number;
  /** How many scale-out fills have already happened on this position. */
  scaleOutCount: number;
  /**
   * Price the loss stop is measured from. Absent until the first scale-out, at
   * which point it holds that fill price so the stop locks in banked profit.
   */
  stopReferencePrice?: number;
}

/** True for instrument types that settle at 0 or 1 and are held long. */
export function isBinaryContractInstrument(instrumentType: string | undefined): boolean {
  return instrumentType === "pm_yes" || instrumentType === "pm_no";
}

/**
 * Whether a binary contract price is usable as a scale-exit input. Entry must
 * leave some payoff to capture, and both prices must sit inside the settlement
 * range; anything else means the mark is stale or the row is malformed.
 */
export function hasUsableBinaryPrices(entryPrice: number, currentPrice: number): boolean {
  return Number.isFinite(entryPrice)
    && Number.isFinite(currentPrice)
    && entryPrice > 0
    && entryPrice < 1
    && currentPrice >= 0
    && currentPrice <= 1;
}

/** Share of the payoff available at entry that the current mark has captured. */
export function capturedProfitFraction(entryPrice: number, currentPrice: number): number {
  return (currentPrice - entryPrice) / (1 - entryPrice);
}

/** Contract price at which the given fraction of max profit is captured. */
export function priceForProfitFraction(entryPrice: number, fraction: number): number {
  return entryPrice + fraction * (1 - entryPrice);
}

/** Stop price sitting LOSS_STOP_FRACTION below the reference. */
export function stopPriceForReference(referencePrice: number): number {
  return referencePrice * (1 - LOSS_STOP_FRACTION);
}

/**
 * Reference price the loss stop is measured from: entry until a scale-out has
 * banked profit, then that fill price.
 */
export function effectiveStopReference(state: BinaryScaleState): number {
  return state.scaleOutCount > 0 && state.stopReferencePrice !== undefined
    ? state.stopReferencePrice
    : state.entryPrice;
}

/**
 * The exit action a binary position warrants at its current mark.
 *
 * Target is evaluated before the stop so a position that gapped through both
 * levels is booked as the win it is. A position that gaps past the final level
 * without ever touching the first is closed outright rather than split, since
 * splitting only exists to leave a runner behind and there is nothing left to
 * run toward.
 */
export function decideBinaryScaleExit(state: BinaryScaleState): BinaryScaleAction {
  const { entryPrice, currentPrice, scaleOutCount } = state;
  if (!hasUsableBinaryPrices(entryPrice, currentPrice)) return { kind: "hold" };

  const capturedFraction = capturedProfitFraction(entryPrice, currentPrice);

  if (capturedFraction >= FINAL_EXIT_PROFIT_FRACTION - THRESHOLD_EPSILON) {
    return { kind: "close", reason: "target", capturedFraction };
  }
  if (scaleOutCount === 0 && capturedFraction >= FIRST_SCALE_PROFIT_FRACTION - THRESHOLD_EPSILON) {
    return { kind: "scale_out", sizeFraction: FIRST_SCALE_SIZE_FRACTION, capturedFraction };
  }
  if (currentPrice <= stopPriceForReference(effectiveStopReference(state)) + THRESHOLD_EPSILON) {
    return { kind: "close", reason: "stop", capturedFraction };
  }
  return { kind: "hold" };
}

/** Ledger close_reason marking a row as one leg of a scaled exit. */
export const PARTIAL_CLOSE_REASON = "profit_scale_out";

/**
 * True for ledger rows that are a scale-out leg rather than a completed trade.
 *
 * These rows carry real cash and belong in realized P&L, but they must not be
 * counted as trades: a scaled position writes two rows for one decision, and
 * feeding both to the win-rate counters and the expectancy t-test would double
 * the apparent sample size while making the two samples perfectly dependent.
 * Learning reads only the final row, whose P&L is the blend of every leg.
 */
export function isPartialScaleOutReason(reason: string | undefined): boolean {
  return reason === PARTIAL_CLOSE_REASON;
}

/** Ledger id for the nth scale-out leg of a position. */
export function scaleOutTradeId(positionId: string, legNumber: number): string {
  return `${positionId}#s${legNumber}`;
}

export interface ScaleOutRecord {
  at: string;
  /** Contract price the leg filled at. */
  price: number;
  /** Capital taken off the table at this leg. */
  sizeClosed: number;
  pnl: number;
}

export interface ScaleOutAmounts {
  sizeClosed: number;
  remainingSize: number;
  pnl: number;
}

/**
 * Cash effects of taking `sizeFraction` of a binary position off at `currentPrice`.
 *
 * P&L on these positions is linear in committed capital — shares are
 * size / entryPrice and each share gains (price - entryPrice) — so a leg's P&L
 * is just its share of the whole position's return.
 */
export function scaleOutAmounts(
  entryPrice: number,
  size: number,
  currentPrice: number,
  sizeFraction: number,
): ScaleOutAmounts {
  const sizeClosed = size * sizeFraction;
  return {
    sizeClosed,
    remainingSize: size - sizeClosed,
    pnl: sizeClosed * (currentPrice / entryPrice - 1),
  };
}

/** Capital originally committed, before any scale-out shrank the position. */
export function originalPositionSize(position: { size: number; originalSize?: number }): number {
  return position.originalSize ?? position.size;
}

/** Whole-position P&L across every scale-out leg plus the residual close. */
export function blendedRealizedPnl(scaleOuts: ScaleOutRecord[] | undefined, residualPnl: number): number {
  const banked = (scaleOuts ?? []).reduce((sum, leg) => sum + leg.pnl, 0);
  return banked + residualPnl;
}
