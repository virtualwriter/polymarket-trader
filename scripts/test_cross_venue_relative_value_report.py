#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("cross_venue_relative_value_report.py")
SPEC = importlib.util.spec_from_file_location("cross_venue_relative_value_report", MODULE_PATH)
assert SPEC and SPEC.loader
report = importlib.util.module_from_spec(SPEC)
sys.modules["cross_venue_relative_value_report"] = report
SPEC.loader.exec_module(report)


class OneTouchProbabilityTest(unittest.TestCase):
    def test_non_touch_question_uses_terminal_probability(self) -> None:
        self.assertEqual(
            report.touch_adjusted_probability(0.35, "above", "Will Gold settle above $5,000?"),
            0.35,
        )

    def test_already_touched_barrier_returns_one(self) -> None:
        self.assertEqual(report.one_touch_probability(105.0, 100.0, 0.4, 10.0, "above"), 1.0)
        self.assertEqual(report.one_touch_probability(95.0, 100.0, 0.4, 10.0, "below"), 1.0)

    def test_gold_downside_fixture_uses_named_one_touch_model(self) -> None:
        probability = report.one_touch_probability(4705.0, 4600.0, 0.243, 19.4, "below")
        self.assertIsNotNone(probability)
        self.assertGreater(probability, 0.65)
        self.assertLess(probability, 0.68)

    def test_oil_downside_fixture_is_not_old_two_x_shortcut(self) -> None:
        terminal = report.lognormal_terminal_probability(99.25, 90.0, 0.65, 19.4, "below")
        probability = report.touch_adjusted_probability(
            terminal,
            "below",
            "Will WTI Crude Oil (WTI) hit (LOW) $90 in May?",
            99.25,
            90.0,
            0.65,
            19.4,
        )
        self.assertIsNotNone(terminal)
        self.assertIsNotNone(probability)
        self.assertLess(probability, min(0.99, 2.0 * terminal))
        self.assertGreater(probability, terminal)

    def test_incomplete_touch_row_keeps_legacy_fallback(self) -> None:
        self.assertEqual(
            report.touch_adjusted_probability(0.3, "above", "Will BTC hit $120,000?", None, None, None, None),
            0.6,
        )


if __name__ == "__main__":
    unittest.main()
