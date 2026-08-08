import { describe, expect, it } from "vitest";
import {
  SIGNAL_PNL_KILL_MIN_TRADES,
  accumulateSignalPnl,
  evaluateSignalPnl,
  evaluateSignalPnlSeries,
  signalPnlMoments,
  type PnlAccumulator,
} from "./signal-pnl-guard.js";

function accumulate(values: number[]): PnlAccumulator {
  const acc: PnlAccumulator = {};
  for (const v of values) accumulateSignalPnl(acc, v);
  return acc;
}

describe("signalPnlMoments", () => {
  it("recovers mean and ddof=1 std from running sums", () => {
    const m = signalPnlMoments(accumulate([1, 2, 3, 4]));
    expect(m.n).toBe(4);
    expect(m.mean).toBeCloseTo(2.5, 12);
    expect(m.std).toBeCloseTo(1.2909944487358056, 10);
  });

  it("is inert on a fresh accumulator and ignores non-finite PnL", () => {
    expect(signalPnlMoments({})).toEqual({ n: 0, mean: 0, std: 0 });
    const acc = accumulate([Number.NaN, Number.POSITIVE_INFINITY]);
    expect(acc.pnlTrades ?? 0).toBe(0);
  });

  it("never returns a negative variance for a constant series", () => {
    const m = signalPnlMoments(accumulate(Array(30).fill(0.01)));
    expect(m.std).toBeGreaterThanOrEqual(0);
    expect(m.mean).toBeCloseTo(0.01, 12);
  });
});

describe("evaluateSignalPnl", () => {
  it("stays inactive below the minimum trade count even when clearly losing", () => {
    const verdict = evaluateSignalPnlSeries(Array(SIGNAL_PNL_KILL_MIN_TRADES - 1).fill(-0.05));
    expect(verdict.kill).toBe(false);
  });

  it("disables a signal that is significantly unprofitable", () => {
    const losing = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? 0.01 : -0.03));
    const verdict = evaluateSignalPnlSeries(losing);
    expect(verdict.mean).toBeLessThan(0);
    expect(verdict.pValue!).toBeLessThan(0.05);
    expect(verdict.kill).toBe(true);
  });

  it("catches the high-win-rate / fat-loss shape the win-rate gate misses", () => {
    // 24 wins of +$0.002 against 6 losses of -$0.06: 80% win rate, loses money.
    const series = [...Array(24).fill(0.002), ...Array(6).fill(-0.06)];
    const wins = series.filter((v) => v >= 0).length;
    expect(wins / series.length).toBeCloseTo(0.8, 10); // sails past a win-rate gate
    const verdict = evaluateSignalPnlSeries(series);
    expect(verdict.mean).toBeLessThan(0);
    expect(verdict.kill).toBe(true);
  });

  it("keeps a profitable signal enabled even at a mediocre win rate", () => {
    // 40% win rate but wins are 3x the losses — the PROMOTED_HYPOTHESIS shape.
    const series = [...Array(12).fill(0.038), ...Array(18).fill(-0.021)];
    const wins = series.filter((v) => v >= 0).length;
    expect(wins / series.length).toBeCloseTo(0.4, 10);
    const verdict = evaluateSignalPnlSeries(series);
    expect(verdict.mean).toBeGreaterThan(0);
    expect(verdict.kill).toBe(false);
    expect(verdict.warn).toBe(false);
  });

  it("does not kill a merely unproven signal", () => {
    const series = [0.05, -0.04, 0.03, -0.06, 0.02, -0.01, 0.04, -0.03, 0.01, -0.02,
      0.03, -0.05, 0.02, -0.01, 0.04, -0.04, 0.01, -0.02, 0.03, -0.03, 0.02, -0.02];
    const verdict = evaluateSignalPnlSeries(series);
    expect(verdict.kill).toBe(false);
  });

  it("warns before it kills", () => {
    const series = Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? 0.01 : -0.012));
    const verdict = evaluateSignalPnlSeries(series);
    expect(verdict.n).toBe(12);
    expect(verdict.warn).toBe(true);
    expect(verdict.kill).toBe(false); // below SIGNAL_PNL_KILL_MIN_TRADES
  });
});
