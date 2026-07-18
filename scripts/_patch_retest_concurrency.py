#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENGINE = REPO / "scripts" / "trading-engine.ts"

OLD = """const HYPOTHESIS_SHADOW_TESTS_REQUIRED = 20;
const HYPOTHESIS_SETUP_RETEST_ACTIVE_LIMIT = 25;
/** Parallel retest budget for shadow-mined families (does not steal LLM slots). */
const SHADOW_MINED_RETEST_ACTIVE_LIMIT = 40;
/** Allow multiple in-flight tests per shadow-mined family to accelerate evidence. */
const SHADOW_MINED_MAX_PENDING_PER_FAMILY = 2;
"""

NEW = """const HYPOTHESIS_SHADOW_TESTS_REQUIRED = 20;
/** Live retest fan-out for LLM + FIND-linked setup families (~8x prior 25). */
const HYPOTHESIS_SETUP_RETEST_ACTIVE_LIMIT = 200;
/** Max in-flight pending shadow tests per LLM/FIND family (~8x prior 1). */
const HYPOTHESIS_SETUP_MAX_PENDING_PER_FAMILY = 8;
/** Parallel retest budget for shadow-mined families (does not steal LLM slots). */
const SHADOW_MINED_RETEST_ACTIVE_LIMIT = 80;
/** Allow multiple in-flight tests per shadow-mined family to accelerate evidence. */
const SHADOW_MINED_MAX_PENDING_PER_FAMILY = 4;
"""

OLD_CALL = 'openRetestsForSources(new Set(["llm"]), HYPOTHESIS_SETUP_RETEST_ACTIVE_LIMIT, 1, "LLM");'
NEW_CALL = (
    'openRetestsForSources(new Set(["llm"]), HYPOTHESIS_SETUP_RETEST_ACTIVE_LIMIT, '
    'HYPOTHESIS_SETUP_MAX_PENDING_PER_FAMILY, "LLM");'
)


def main() -> int:
    text = ENGINE.read_text(encoding="utf-8")
    if "HYPOTHESIS_SETUP_MAX_PENDING_PER_FAMILY" in text and "ACTIVE_LIMIT = 200" in text:
        print("already patched")
        return 0
    if OLD not in text:
        raise SystemExit("constants block not found")
    if OLD_CALL not in text:
        raise SystemExit("openRetests call not found")
    text = text.replace(OLD, NEW, 1).replace(OLD_CALL, NEW_CALL, 1)
    ENGINE.write_text(text, encoding="utf-8")
    print("patched retest concurrency")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
