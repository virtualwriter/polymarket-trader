/**
 * PnL-aware demotion for live signals.
 *
 * The adaptive-weight kill switch only ever looked at win rate, which is a
 * different question from whether a signal makes money: a signal can win 70%
 * of the time and still lose, if the losses are large enough. This module adds
 * the money question as a one-sided Student-t test on realized per-trade PnL,
 * using the same statistical primitives as the research discovery layer.
 *
 * Accumulators are forward-only. `pnlTrades` starts at zero for every signal
 * when this rule ships and counts only trades observed since, so the test is
 * never applied to a mean assembled from partially-missing history.
 */

import { oneSidedTPValue, sampleMoments, type SampleMoments } from "../research/alpha-stats.js";

/** Minimum PnL-tracked trades before the money test may disable a signal. */
export const SIGNAL_PNL_KILL_MIN_TRADES = 20;
/** A signal is disabled only when it is significantly unprofitable at this level. */
export const SIGNAL_PNL_KILL_ALPHA = 0.05;
/** Warn earlier than we kill, so a decaying signal is visible before it is cut. */
export const SIGNAL_PNL_WARN_MIN_TRADES = 10;
export const SIGNAL_PNL_WARN_ALPHA = 0.2;

/** Running moments of realized per-trade PnL, stored on a SignalWeight. */
export interface PnlAccumulator {
  pnlTrades?: number;
  pnlSum?: number;
  pnlSumSq?: number;
}

export function accumulateSignalPnl(acc: PnlAccumulator, pnl: number): void {
  if (!Number.isFinite(pnl)) return;
  acc.pnlTrades = (acc.pnlTrades ?? 0) + 1;
  acc.pnlSum = (acc.pnlSum ?? 0) + pnl;
  acc.pnlSumSq = (acc.pnlSumSq ?? 0) + pnl * pnl;
}

/**
 * Recover mean and ddof=1 standard deviation from running sums.
 * Variance is clamped at zero because accumulated rounding can make the
 * sum-of-squares form go slightly negative for near-constant series.
 */
export function signalPnlMoments(acc: PnlAccumulator): SampleMoments {
  const n = acc.pnlTrades ?? 0;
  const sum = acc.pnlSum ?? 0;
  const sumSq = acc.pnlSumSq ?? 0;
  if (n <= 0) return { n: 0, mean: 0, std: 0 };
  const mean = sum / n;
  if (n < 2) return { n, mean, std: 0 };
  const variance = Math.max(0, (sumSq - n * mean * mean) / (n - 1));
  return { n, mean, std: Math.sqrt(variance) };
}

export interface SignalPnlVerdict {
  n: number;
  mean: number;
  /** One-sided p-value that the true mean per-trade PnL is below zero. */
  pValue: number | null;
  /** Significantly unprofitable with enough evidence — disable the signal. */
  kill: boolean;
  /** Leaning unprofitable — surface it in the journal but keep trading. */
  warn: boolean;
}

/**
 * Tests whether a signal's realized per-trade PnL is significantly NEGATIVE.
 * Note this is deliberately not the mirror of the promotion test: we require
 * positive evidence of losing money before cutting a signal, so a merely
 * unproven signal keeps running.
 */
export function evaluateSignalPnl(acc: PnlAccumulator): SignalPnlVerdict {
  const { n, mean, std } = signalPnlMoments(acc);
  const pValue = oneSidedTPValue(-mean, std, n);
  if (pValue === null) return { n, mean, pValue: null, kill: false, warn: false };
  return {
    n,
    mean,
    pValue,
    kill: n >= SIGNAL_PNL_KILL_MIN_TRADES && pValue < SIGNAL_PNL_KILL_ALPHA,
    warn: n >= SIGNAL_PNL_WARN_MIN_TRADES && pValue < SIGNAL_PNL_WARN_ALPHA,
  };
}

/** Recompute moments directly from a PnL series (used by tests and backfills). */
export function evaluateSignalPnlSeries(values: readonly number[]): SignalPnlVerdict {
  const { n, mean, std } = sampleMoments(values);
  return evaluateSignalPnl({ pnlTrades: n, pnlSum: mean * n, pnlSumSq: (std * std) * Math.max(0, n - 1) + n * mean * mean });
}
