/**
 * Autonomous shadow-to-live promotion.
 *
 * A shadow family graduates to live trading on its own realized per-trade P&L
 * rather than on a human flipping an ENABLE_ constant. The bar is deliberately
 * expectancy-first: the reason one-touch could never promote under the old
 * rules is that PROMOTE_THRESHOLD demanded a 65% win rate, and the gated
 * one-touch cohort makes money at 57% because its winners are far larger than
 * its losers. Requiring win-rate significance here would rebuild that wall, so
 * win rate is only a floor against fragile lottery profiles, and the load is
 * carried by a one-sided t-test on realized edge plus two robustness guards.
 */

import { binomialPValue, oneSidedTPValue, sampleMoments, wilsonLowerBound } from "../research/alpha-stats.js";

/** Significance required on realized per-trade edge. */
export const AUTO_PROMOTE_ALPHA = 0.01;
/** Total resolved shadows a family needs before it can be considered. */
export const AUTO_PROMOTE_MIN_SHADOWS = 30;
/**
 * Shadows that resolved after the family's entry rule was last changed.
 *
 * Without this a family could promote on the same data used to choose its
 * entry threshold, which is circular.
 *
 * What this count does and does not buy, worked through on the cohort that
 * motivated it (one-touch NO, +4.95% mean at 16.69 sd): twenty post-gate
 * samples have 80% power to detect a mean worse than about -9%, so they screen
 * for a reversal or a blow-up, not for a mild fade. Confirming an edge that
 * size against that dispersion takes roughly 114 samples at this alpha. So the
 * post-gate count is the out-of-sample sanity check, and the significance test
 * below — which pools every resolved shadow, post-gate ones included — is what
 * actually establishes the edge. Raising this constant would not substitute for
 * that pooled test, and lowering it would remove the only guard against a rule
 * that has already stopped working.
 */
export const AUTO_PROMOTE_MIN_POST_GATE_SHADOWS = 20;
/** Floor guarding against jackpot-dependent profiles that are fragile live. */
export const AUTO_PROMOTE_MIN_WIN_RATE = 0.4;
/** Live size multiplier applied for a family's first live outing. */
export const AUTO_PROMOTE_INITIAL_SIZE_FRACTION = 0.5;
/** Live trades before a newly promoted family sizes up to full. */
export const AUTO_PROMOTE_FULL_SIZE_AFTER_TRADES = 20;

export interface ShadowOutcome {
  pnlPct: number;
  /**
   * Whether the trade made money, which is not the same as its recorded
   * outcome label: that label calls a P&L of exactly zero a win, and 13 of
   * this cohort's 117 shadows exited flat. Counting scratches as wins reported
   * 62.4% where the strict rate was 51.3%, which is the difference between a
   * cohort that looks like an edge and one that looks like a coin flip.
   */
  win: boolean;
  /** When the shadow was opened; used for the post-gate cutoff. */
  openedAt: string;
  /**
   * Price paid for the side held, 0..1.
   *
   * For a binary this is the market's own probability that the trade wins, so
   * the average of it across a cohort is the win rate to expect with no edge —
   * the correct null for the win-rate test. A coin-flip null flatters a book of
   * cheap-NO premium sales, where most trades are supposed to win.
   */
  entryPrice?: number;
}

export interface AutoPromotionEvidence {
  n: number;
  wins: number;
  winRate: number;
  meanPnlPct: number;
  stdPnlPct: number;
  /** One-sided t-test that mean realized edge exceeds zero. */
  expectancyPValue: number | null;
  /** Same test with the single best trade removed. */
  expectancyPValueExBest: number | null;
  /** Binomial on win rate against `impliedWinRate`; context, never required. */
  winRatePValue: number;
  winRateLowerBound: number;
  postGateN: number;
  /**
   * Mean entry price, i.e. the win rate the market itself implies for this
   * cohort. Null when no entry prices were recorded, in which case the win-rate
   * test falls back to a coin flip and means much less.
   */
  impliedWinRate: number | null;
}

export function summarizeShadowOutcomes(
  outcomes: readonly ShadowOutcome[],
  gateInstalledAt: string | null,
): AutoPromotionEvidence {
  const pnls = outcomes.map((o) => o.pnlPct).filter((p) => Number.isFinite(p));
  const wins = outcomes.filter((o) => o.win).length;
  const { n, mean, std } = sampleMoments(pnls);

  const exBest = [...pnls].sort((a, b) => b - a).slice(1);
  const exBestMoments = sampleMoments(exBest);

  const cutoff = gateInstalledAt ? new Date(gateInstalledAt).getTime() : null;
  const postGateN = cutoff === null
    ? 0
    : outcomes.filter((o) => new Date(o.openedAt).getTime() >= cutoff).length;

  const entryPrices = outcomes
    .map((o) => o.entryPrice)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0 && p < 1);
  const impliedWinRate = entryPrices.length > 0
    ? entryPrices.reduce((a, b) => a + b, 0) / entryPrices.length
    : null;

  return {
    n,
    wins,
    winRate: n > 0 ? wins / n : 0,
    meanPnlPct: mean,
    stdPnlPct: std,
    expectancyPValue: oneSidedTPValue(mean, std, n),
    expectancyPValueExBest: oneSidedTPValue(exBestMoments.mean, exBestMoments.std, exBestMoments.n),
    winRatePValue: binomialPValue(wins, n, impliedWinRate ?? 0.5),
    winRateLowerBound: n > 0 ? wilsonLowerBound(wins, n) : 0,
    postGateN,
    impliedWinRate,
  };
}

export interface AutoPromotionOptions {
  alpha?: number;
  minShadows?: number;
  minPostGateShadows?: number;
  minWinRate?: number;
}

export interface AutoPromotionDecision {
  promote: boolean;
  /** Human-readable rationale, recorded in the audit trail either way. */
  reason: string;
  evidence: AutoPromotionEvidence;
}

export function evaluateAutoPromotion(
  evidence: AutoPromotionEvidence,
  options: AutoPromotionOptions = {},
): AutoPromotionDecision {
  const alpha = options.alpha ?? AUTO_PROMOTE_ALPHA;
  const minShadows = options.minShadows ?? AUTO_PROMOTE_MIN_SHADOWS;
  const minPostGate = options.minPostGateShadows ?? AUTO_PROMOTE_MIN_POST_GATE_SHADOWS;
  const minWinRate = options.minWinRate ?? AUTO_PROMOTE_MIN_WIN_RATE;

  const fail = (reason: string): AutoPromotionDecision => ({ promote: false, reason, evidence });

  if (evidence.n < minShadows) {
    return fail(`only ${evidence.n} resolved shadows (need ${minShadows})`);
  }
  if (evidence.postGateN < minPostGate) {
    return fail(`only ${evidence.postGateN} shadows resolved since the entry rule last changed (need ${minPostGate} so activation is not judged on the data that set the rule)`);
  }
  if (evidence.winRate < minWinRate) {
    return fail(`win rate ${(evidence.winRate * 100).toFixed(0)}% is below the ${(minWinRate * 100).toFixed(0)}% floor; a profile this jackpot-dependent is fragile live`);
  }
  if (evidence.meanPnlPct <= 0) {
    return fail(`mean realized edge is ${evidence.meanPnlPct.toFixed(2)}%`);
  }
  if (evidence.expectancyPValue === null || evidence.expectancyPValue >= alpha) {
    const p = evidence.expectancyPValue === null ? "n/a" : evidence.expectancyPValue.toFixed(4);
    return fail(`expectancy not significant (p=${p}, need < ${alpha})`);
  }
  if (evidence.expectancyPValueExBest === null || evidence.expectancyPValueExBest >= alpha) {
    const p = evidence.expectancyPValueExBest === null ? "n/a" : evidence.expectancyPValueExBest.toFixed(4);
    return fail(`expectancy collapses without its single best trade (p=${p}); the edge rests on one outlier`);
  }

  return {
    promote: true,
    reason: `${evidence.wins}/${evidence.n} shadows (${(evidence.winRate * 100).toFixed(0)}%), mean edge ${evidence.meanPnlPct.toFixed(2)}%/trade, expectancy p=${evidence.expectancyPValue.toFixed(4)} (p=${evidence.expectancyPValueExBest!.toFixed(4)} excluding the best trade), ${evidence.postGateN} of them since the entry rule last changed`,
    evidence,
  };
}

/** Size multiplier for a family that has been promoted but is still proving out live. */
export function autoPromotedSizeFraction(liveTradesSincePromotion: number): number {
  return liveTradesSincePromotion >= AUTO_PROMOTE_FULL_SIZE_AFTER_TRADES
    ? 1
    : AUTO_PROMOTE_INITIAL_SIZE_FRACTION;
}
