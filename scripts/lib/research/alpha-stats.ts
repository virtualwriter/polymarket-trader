/**
 * Statistical primitives for alpha research — TypeScript port of
 * `scripts/lib/alpha_stats.py`, kept numerically identical so the Python
 * discovery layer (mining, finding scores) and the TypeScript promotion layer
 * (shadow-test gates, signal demotion) can never disagree about whether a
 * result is significant.
 *
 * Everything here is a textbook statistic with a citable definition:
 *   - exact binomial tail test (win rate vs. chance)
 *   - one-sided Student-t test on mean per-trade PnL (the alpha claim itself)
 *   - Wilson score lower confidence bound on win rate
 *
 * The Student-t survival function uses the regularized incomplete beta
 * function (continued-fraction evaluation, Numerical Recipes §6.4), so
 * p-values are exact for small samples rather than normal approximations.
 */

/** One-sided 95% normal quantile, used for Wilson lower bounds. */
export const Z_ONE_SIDED_95 = 1.6448536269514722;

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** Natural log of the gamma function (Lanczos approximation). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula keeps accuracy for small/negative arguments.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let series = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) series += LANCZOS_COEFFICIENTS[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

/** Continued fraction for the incomplete beta function (NR §6.4). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3.0e-14;
  const FPMIN = 1.0e-300;

  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1.0) < EPS) break;
  }
  return h;
}

/** I_x(a, b), regularized incomplete beta function. */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  const lnBeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(lnBeta + a * Math.log(x) + b * Math.log(1.0 - x));
  // Use the continued fraction directly or via the symmetry relation,
  // whichever converges faster (NR criterion).
  if (x < (a + 1.0) / (a + b + 2.0)) return (front * betacf(a, b, x)) / a;
  return 1.0 - (front * betacf(b, a, 1.0 - x)) / b;
}

/** One-sided survival function P(T > t) for Student's t with df degrees. */
export function studentTSf(t: number, df: number): number {
  if (df <= 0) return 1.0;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(df / 2.0, 0.5, x);
  return t >= 0 ? tail : 1.0 - tail;
}

export interface SampleMoments {
  n: number;
  mean: number;
  /** Sample standard deviation (ddof=1). */
  std: number;
}

/** Sample size, mean and ddof=1 standard deviation of a finite-value series. */
export function sampleMoments(values: readonly number[]): SampleMoments {
  const finite = values.filter((v) => Number.isFinite(v));
  const n = finite.length;
  if (n === 0) return { n: 0, mean: 0, std: 0 };
  const mean = finite.reduce((sum, v) => sum + v, 0) / n;
  if (n < 2) return { n, mean, std: 0 };
  const variance = finite.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  return { n, mean, std: Math.sqrt(variance) };
}

/**
 * P(observing this mean | true mean <= 0) — the one-sided Student-t test that
 * the sample's expected value is genuinely positive. Returns null when
 * untestable (n < 2). A degenerate sample (std == 0) is decided by sign.
 */
export function oneSidedTPValue(mean: number, std: number, n: number): number | null {
  if (n < 2) return null;
  if (std <= 0.0) return mean > 0 ? 0.0 : 1.0;
  const t = mean / (std / Math.sqrt(n));
  return studentTSf(t, n - 1);
}

/** Convenience wrapper: one-sided t-test that the series mean exceeds zero. */
export function meanPositivePValue(values: readonly number[]): number | null {
  const { n, mean, std } = sampleMoments(values);
  return oneSidedTPValue(mean, std, n);
}

/** One-sided t-test that the series mean is genuinely BELOW zero. */
export function meanNegativePValue(values: readonly number[]): number | null {
  const { n, mean, std } = sampleMoments(values);
  return oneSidedTPValue(-mean, std, n);
}

/**
 * One-sided exact binomial P(X >= wins | n, p). Small p => win rate above chance.
 *
 * Sums the upper tail directly rather than as `1 - cdfBelow`. The complement
 * form catastrophically cancels once the true tail falls below double
 * precision — e.g. P(X >= 352 | 498) is 5.7e-21 but evaluates to exactly 0 —
 * which silently destroys the ability to rank strong results against each
 * other. The first term is computed in log space so large n cannot overflow.
 */
export function binomialPValue(wins: number, n: number, p = 0.5): number {
  if (n <= 0) return 1.0;
  const clamped = Math.max(0, Math.min(wins, n));
  if (clamped <= 0) return 1.0;
  if (p <= 0) return 0.0;
  if (p >= 1) return 1.0;

  const logPmfAtWins = logGamma(n + 1) - logGamma(clamped + 1) - logGamma(n - clamped + 1)
    + clamped * Math.log(p) + (n - clamped) * Math.log(1 - p);
  let pmf = Math.exp(logPmfAtWins);
  const ratio = p / (1 - p);

  let tail = 0;
  for (let k = clamped; k <= n; k++) {
    tail += pmf;
    pmf *= ((n - k) / (k + 1)) * ratio;
  }
  return Math.min(1, Math.max(0, tail));
}

/** Wilson score interval lower bound on a binomial proportion. */
export function wilsonLowerBound(wins: number, n: number, z: number = Z_ONE_SIDED_95): number {
  if (n <= 0) return 0.0;
  const clamped = Math.max(0, Math.min(wins, n));
  const pHat = clamped / n;
  const z2 = z * z;
  const denom = 1.0 + z2 / n;
  const center = pHat + z2 / (2.0 * n);
  const margin = z * Math.sqrt((pHat * (1.0 - pHat)) / n + z2 / (4.0 * n * n));
  return Math.max(0.0, (center - margin) / denom);
}

/** Benjamini-Hochberg step-up q-values, order-preserving with the input. */
export function bhQValues(pValues: readonly number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => pValues[a] - pValues[b]);
  const q = new Array<number>(m).fill(0);
  let runningMin = 1.0;
  for (let rankFromEnd = m; rankFromEnd >= 1; rankFromEnd--) {
    const idx = order[rankFromEnd - 1];
    const candidate = (pValues[idx] * m) / rankFromEnd;
    runningMin = Math.min(runningMin, candidate);
    q[idx] = Math.min(1.0, runningMin);
  }
  return q;
}
