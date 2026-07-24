#!/usr/bin/env python3
"""Tests for alpha_stats against known textbook values."""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lib.alpha_stats import (  # noqa: E402
    bh_qvalues,
    binomial_p_value,
    one_sided_t_pvalue,
    student_t_sf,
    wilson_lower_bound,
)


def approx(a: float, b: float, tol: float = 1e-3) -> bool:
    return abs(a - b) <= tol


def test_binomial_known_values() -> None:
    # P(X >= 9 | n=10, p=0.5) = 11/1024
    assert approx(binomial_p_value(9, 10), 11 / 1024, 1e-9)
    # P(X >= 5 | n=10) includes the median: > 0.5 boundary case
    assert approx(binomial_p_value(5, 10), 0.623046875, 1e-9)
    assert binomial_p_value(0, 10) == 1.0
    assert binomial_p_value(0, 0) == 1.0


def test_student_t_sf_known_values() -> None:
    # Critical values: P(T > t_crit) = 0.05 at the tabled one-sided 95% points.
    assert approx(student_t_sf(1.895, 7), 0.05, 2e-4)
    assert approx(student_t_sf(1.812, 10), 0.05, 2e-4)
    assert approx(student_t_sf(1.725, 20), 0.05, 2e-4)
    assert approx(student_t_sf(1.645, 10_000), 0.05, 5e-4)
    # Symmetry
    assert approx(student_t_sf(0.0, 10), 0.5, 1e-9)
    assert approx(student_t_sf(-1.812, 10), 0.95, 2e-4)


def test_one_sided_t_pvalue() -> None:
    # mean=1, std=1, n=16 => t=4, df=15 => p ~ 0.000582
    p = one_sided_t_pvalue(1.0, 1.0, 16)
    assert p is not None and approx(p, 0.000582, 5e-5)
    assert one_sided_t_pvalue(0.5, 0.0, 10) == 0.0
    assert one_sided_t_pvalue(-0.5, 0.0, 10) == 1.0
    assert one_sided_t_pvalue(1.0, 1.0, 1) is None


def test_wilson_lower_bound_known_value() -> None:
    # wins=9, n=10, z=1.645 => ~0.6523
    assert approx(wilson_lower_bound(9, 10), 0.6523, 1e-3)
    # More trials at same rate tightens the bound upward.
    assert wilson_lower_bound(90, 100) > wilson_lower_bound(9, 10)
    assert wilson_lower_bound(0, 0) == 0.0


def test_bh_qvalues() -> None:
    q = bh_qvalues([0.01, 0.02, 0.03, 0.5])
    assert [round(v, 6) for v in q] == [0.04, 0.04, 0.04, 0.5]
    # Order-preserving with shuffled input
    q2 = bh_qvalues([0.5, 0.03, 0.01, 0.02])
    assert [round(v, 6) for v in q2] == [0.5, 0.04, 0.04, 0.04]
    assert bh_qvalues([]) == []


def run_tests() -> None:
    test_binomial_known_values()
    test_student_t_sf_known_values()
    test_one_sided_t_pvalue()
    test_wilson_lower_bound_known_value()
    test_bh_qvalues()
    print("ok: test_alpha_stats passed")


if __name__ == "__main__":
    run_tests()
