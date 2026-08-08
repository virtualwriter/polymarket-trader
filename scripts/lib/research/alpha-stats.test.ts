import { describe, expect, it } from "vitest";
import { binomialPValue } from "./hypothesis-shadow-eval.js";
import {
  bhQValues,
  meanNegativePValue,
  meanPositivePValue,
  oneSidedTPValue,
  sampleMoments,
  studentTSf,
  wilsonLowerBound,
} from "./alpha-stats.js";

/**
 * Every expected value below was produced by scripts/lib/alpha_stats.py at
 * 17 significant digits. The Python discovery layer and this TypeScript
 * promotion layer MUST agree, otherwise a finding can be significant when
 * mined and insignificant when promoted (or vice versa).
 */
describe("parity with scripts/lib/alpha_stats.py", () => {
  it("matches one_sided_t_pvalue", () => {
    expect(oneSidedTPValue(0.5, 1.0, 5)!).toBeCloseTo(0.16308211767253006, 14);
    expect(oneSidedTPValue(0.02, 0.05, 20)!).toBeCloseTo(0.04479726055976898, 14);
    expect(oneSidedTPValue(-0.01, 0.03, 12)!).toBeCloseTo(0.86365915702249096, 14);
    expect(oneSidedTPValue(0.001, 0.0004, 30)!).toBeCloseTo(1.7206215128663646e-14, 20);
    expect(oneSidedTPValue(1.5, 2.0, 3)!).toBeCloseTo(0.161759287398726, 14);
  });

  it("matches wilson_lower_bound", () => {
    expect(wilsonLowerBound(4, 6)).toBeCloseTo(0.34701476700031814, 15);
    expect(wilsonLowerBound(20, 25)).toBeCloseTo(0.64231851439768395, 15);
    expect(wilsonLowerBound(0, 10)).toBe(0);
    expect(wilsonLowerBound(10, 10)).toBeCloseTo(0.78705802991659313, 15);
    expect(wilsonLowerBound(352, 498)).toBeCloseTo(0.67222886944711524, 15);
  });

  it("matches student_t_sf", () => {
    expect(studentTSf(2.0, 10)).toBeCloseTo(0.03669401738537012, 15);
    expect(studentTSf(-1.5, 7)).toBeCloseTo(0.91135075650501485, 15);
    expect(studentTSf(0.0, 5)).toBeCloseTo(0.5, 15);
    expect(studentTSf(3.5, 29)).toBeCloseTo(0.00076222315732729889, 15);
  });

  it("matches binomial_p_value (engine implementation)", () => {
    expect(binomialPValue(4, 6)).toBeCloseTo(0.34375, 12);
    expect(binomialPValue(20, 25)).toBeCloseTo(0.0020386576652526855, 12);
    expect(binomialPValue(15, 20)).toBeCloseTo(0.020694732666015625, 12);
    expect(binomialPValue(352, 498)).toBeCloseTo(5.653486547870298e-21, 24);
  });

  it("matches bh_qvalues", () => {
    const q = bhQValues([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205]);
    const expected = [0.008, 0.032, 0.0672, 0.0672, 0.0672, 0.08, 0.08457142857142856, 0.205];
    for (let i = 0; i < expected.length; i++) expect(q[i]).toBeCloseTo(expected[i], 15);
  });
});

describe("sampleMoments", () => {
  it("uses ddof=1 and ignores non-finite values", () => {
    const m = sampleMoments([1, 2, 3, 4, Number.NaN, Number.POSITIVE_INFINITY]);
    expect(m.n).toBe(4);
    expect(m.mean).toBeCloseTo(2.5, 12);
    expect(m.std).toBeCloseTo(1.2909944487358056, 12);
  });

  it("returns zero std for degenerate samples", () => {
    expect(sampleMoments([]).n).toBe(0);
    expect(sampleMoments([7]).std).toBe(0);
  });
});

describe("mean sign tests", () => {
  it("meanPositivePValue is small for a clearly profitable series", () => {
    const p = meanPositivePValue([0.02, 0.03, 0.025, 0.018, 0.031, 0.022, 0.027])!;
    expect(p).toBeLessThan(0.001);
  });

  it("meanNegativePValue is small for a clearly losing series", () => {
    const p = meanNegativePValue([-0.02, -0.03, -0.025, -0.018, -0.031, -0.022, -0.027])!;
    expect(p).toBeLessThan(0.001);
  });

  it("both are inconclusive for a coin-flip series", () => {
    const series = [0.05, -0.04, 0.03, -0.06, 0.02, -0.01];
    expect(meanPositivePValue(series)!).toBeGreaterThan(0.1);
    expect(meanNegativePValue(series)!).toBeGreaterThan(0.1);
  });

  it("is untestable below n=2", () => {
    expect(meanPositivePValue([0.05])).toBeNull();
    expect(meanPositivePValue([])).toBeNull();
  });

  it("high win rate with fat losses is NOT significantly profitable", () => {
    // 8 small wins, 2 large losses: 80% win rate, negative expectancy.
    const series = [0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002, -0.06, -0.06];
    expect(meanPositivePValue(series)!).toBeGreaterThan(0.5);
  });
});
