#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from datetime import datetime, timezone
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

    def test_proxy_option_strikes_scale_to_option_underlying(self) -> None:
        self.assertAlmostEqual(report.scaled_option_strike("ETH", "ETHA", 3000.0, 2500.0, 20.0), 24.0)
        self.assertAlmostEqual(report.scaled_option_strike("HYPE", "PURR", 50.0, 40.0, 10.0), 12.5)
        self.assertAlmostEqual(report.scaled_option_strike("SPY", "CME_ES", 8000.0, 7500.0, 7470.0), 7968.0)
        self.assertAlmostEqual(report.scaled_option_strike("SPY", "SPY", 8000.0, 7500.0, 750.0), 800.0)
        self.assertEqual(report.scaled_option_strike("GOLD", "CME_GC", 5000.0, 4700.0, 4700.0), 5000.0)

    def test_hype_uses_purr_proxy_for_option_probabilities(self) -> None:
        snapshot = {
            "timestamp": "2026-05-01T00:00:00+00:00",
            "spots": {"HYPE": 40.0},
            "hyperliquid": {"HYPE": {"markPx": 40.0, "fundingAnnualized": 0.02, "openInterestUsd": 1000000}},
            "options": {
                "PURR": {
                    "underlyingPrice": 10.0,
                    "source": "CBOE delayed",
                    "chains": [
                        {"expiration": "2026-05-29T00:00:00+00:00", "strike": 11.25, "impliedVolatility": 0.8, "bid": 0.1, "ask": 0.2},
                        {"expiration": "2026-05-29T00:00:00+00:00", "strike": 12.50, "impliedVolatility": 0.9, "bid": 0.1, "ask": 0.2},
                        {"expiration": "2026-05-29T00:00:00+00:00", "strike": 13.75, "impliedVolatility": 1.0, "bid": 0.1, "ask": 0.2},
                    ],
                }
            },
            "polymarket": [
                {
                    "asset": "HYPE",
                    "slug": "what-price-will-hyperliquid-hit-in-may-2026",
                    "contracts": [
                        {
                            "marketId": "hype-50",
                            "question": "Will Hyperliquid hit $50 in May 2026?",
                            "strike": 50.0,
                            "direction": "above",
                            "yesPrice": 0.2,
                            "bestBid": 0.19,
                            "bestAsk": 0.2,
                            "spread": 0.01,
                            "liquidity": 10000,
                            "volume": 1000,
                            "active": True,
                            "closed": False,
                            "endDate": "2026-06-01T03:59:59.999Z",
                        }
                    ],
                }
            ],
        }

        rows = report.build_rows(snapshot)

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row.asset, "HYPE")
        self.assertEqual(row.option_symbol, "PURR")
        self.assertEqual(row.iv_resolution, "cboe_snapshot")
        self.assertAlmostEqual(row.option_underlying, 10.0)
        self.assertAlmostEqual(row.option_iv, 0.9)
        self.assertIsNotNone(row.options_terminal_prob)
        self.assertIsNotNone(row.options_touch_adjusted_prob)
        self.assertIn("Strike scaled from underlying options proxy.", row.notes)

    def test_iv_selection_matches_expiry_then_nearest_strike(self) -> None:
        snapshot = {
            "underlyingPrice": 100.0,
            "chains": [
                {"expiration": "2026-06-01", "strike": 90, "impliedVolatility": 0.20, "bid": 1, "ask": 2},
                {"expiration": "2026-06-01", "strike": 100, "impliedVolatility": 0.21, "bid": 1, "ask": 2},
                {"expiration": "2026-06-01", "strike": 110, "impliedVolatility": 0.22, "bid": 1, "ask": 2},
                {"expiration": "2026-07-01", "strike": 100, "impliedVolatility": 0.50, "bid": 1, "ask": 2},
                {"expiration": "2026-07-01", "strike": 105, "impliedVolatility": 0.51, "bid": 1, "ask": 2},
                {"expiration": "2026-07-01", "strike": 110, "impliedVolatility": 0.52, "bid": 1, "ask": 2},
            ],
        }
        iv, expiry = report.choose_iv_for_expiry(
            snapshot,
            datetime(2026, 7, 1, tzinfo=timezone.utc),
            108.0,
            datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(expiry, "2026-07-01")
        self.assertAlmostEqual(iv, (0.50 + 0.51 + 0.52) / 3)


if __name__ == "__main__":
    unittest.main()
