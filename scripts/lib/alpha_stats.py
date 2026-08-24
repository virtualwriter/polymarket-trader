"""Statistical primitives for alpha research — no heuristics, standard tests only.

Everything here is a textbook statistic with a citable definition:
  - exact binomial tail test (win rate vs. chance)
  - one-sided Student-t test on mean per-trade PnL (the alpha claim itself)
  - Wilson score lower confidence bound on win rate
  - Benjamini-Hochberg q-values for multiple-comparisons control

The Student-t survival function uses the regularized incomplete beta
function (continued-fraction evaluation, Numerical Recipes §6.4), so
p-values are exact for small samples rather than normal approximations.
"""
from __future__ import annotations

import math

# One-sided 95% normal quantile, used for Wilson lower bounds.
Z_ONE_SIDED_95 = 1.6448536269514722


def binomial_p_value(wins: int, n: int, p: float = 0.5) -> float:
    """One-sided exact binomial P(X >= wins | n, p).

    Terms are summed in log-space (lgamma binomial coefficients), so the
    computation stays exact for panel-scale n where math.comb overflows
    float conversion.
    """
    if n <= 0:
        return 1.0
    wins = max(0, min(wins, n))
    if wins == 0:
        return 1.0
    if p <= 0.0:
        return 0.0
    if p >= 1.0:
        return 1.0
    log_p = math.log(p)
    log_q = math.log(1.0 - p)
    total = 0.0
    for k in range(wins, n + 1):
        log_term = (
            math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
            + k * log_p + (n - k) * log_q
        )
        total += math.exp(log_term)
    return min(1.0, total)


def _betacf(a: float, b: float, x: float) -> float:
    """Continued fraction for the incomplete beta function (NR §6.4)."""
    MAXIT = 200
    EPS = 3.0e-14
    FPMIN = 1.0e-300

    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < EPS:
            break
    return h


def regularized_incomplete_beta(a: float, b: float, x: float) -> float:
    """I_x(a, b), regularized incomplete beta function."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    ln_beta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(ln_beta + a * math.log(x) + b * math.log(1.0 - x))
    # Use the continued fraction directly or via the symmetry relation,
    # whichever converges faster (NR criterion).
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - front * _betacf(b, a, 1.0 - x) / b


def student_t_sf(t: float, df: int) -> float:
    """One-sided survival function P(T > t) for Student's t with df degrees."""
    if df <= 0:
        return 1.0
    x = df / (df + t * t)
    tail = 0.5 * regularized_incomplete_beta(df / 2.0, 0.5, x)
    return tail if t >= 0 else 1.0 - tail


def one_sided_t_pvalue(mean: float, std: float, n: int) -> float | None:
    """P(observing this mean PnL | true mean <= 0). None when untestable (n<2).

    std is the sample standard deviation (ddof=1). A degenerate sample
    (std == 0) is decided by the sign of the mean.
    """
    if n < 2:
        return None
    if std <= 0.0:
        return 0.0 if mean > 0 else 1.0
    t = mean / (std / math.sqrt(n))
    return student_t_sf(t, n - 1)


def wilson_lower_bound(wins: int, n: int, z: float = Z_ONE_SIDED_95) -> float:
    """Wilson score interval lower bound on a binomial proportion."""
    if n <= 0:
        return 0.0
    wins = max(0, min(wins, n))
    p_hat = wins / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = p_hat + z2 / (2.0 * n)
    margin = z * math.sqrt(p_hat * (1.0 - p_hat) / n + z2 / (4.0 * n * n))
    return max(0.0, (center - margin) / denom)


def bh_qvalues(p_values: list[float]) -> list[float]:
    """Benjamini-Hochberg step-up q-values, order-preserving with the input."""
    m = len(p_values)
    if m == 0:
        return []
    order = sorted(range(m), key=lambda i: p_values[i])
    q = [0.0] * m
    running_min = 1.0
    for rank_from_end in range(m, 0, -1):
        idx = order[rank_from_end - 1]
        candidate = p_values[idx] * m / rank_from_end
        running_min = min(running_min, candidate)
        q[idx] = min(1.0, running_min)
    return q
