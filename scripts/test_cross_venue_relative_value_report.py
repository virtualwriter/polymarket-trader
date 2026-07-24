#!/usr/bin/env python3
import importlib.util
import sys
import tempfile
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
        self.assertGreater(probability, 0.68)
        self.assertLess(probability, 0.71)

    def test_exact_barrier_formula_bounds(self) -> None:
        terminal = report.lognormal_terminal_probability(100.0, 120.0, 0.5, 30.0, "above")
        touch = report.one_touch_probability(100.0, 120.0, 0.5, 30.0, "above")
        self.assertGreater(touch, terminal)
        self.assertLess(touch, 1.0)
        # Far barriers keep a genuine (small) touch probability instead of the
        # old terminal-only shortcut.
        far_terminal = report.lognormal_terminal_probability(100.0, 200.0, 0.5, 30.0, "above")
        far_touch = report.one_touch_probability(100.0, 200.0, 0.5, 30.0, "above")
        self.assertGreater(far_touch, far_terminal)
        # At-the-barrier converges to certainty (capped at 0.99).
        self.assertAlmostEqual(report.one_touch_probability(100.0, 100.0001, 0.5, 30.0, "above"), 0.99)

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

    def test_cme_preferred_over_etf_proxy_when_both_present(self) -> None:
        snapshot = {
            "timestamp": "2026-05-01T00:00:00+00:00",
            "spots": {"GOLD": 4700.0},
            "hyperliquid": {"GOLD": {"markPx": 4700.0, "fundingAnnualized": 0.02, "openInterestUsd": 1000000}},
            "options": {
                "GLD": {
                    "underlyingPrice": 430.0,
                    "source": "CBOE delayed",
                    "chains": [
                        {
                            "expiration": "2026-05-29T00:00:00+00:00",
                            "strike": 458.0,
                            "impliedVolatility": 0.50,
                            "bid": 0.1,
                            "ask": 0.2,
                            "type": "call",
                        },
                    ],
                },
                "CME_GC": {
                    "underlyingPrice": 4700.0,
                    "source": "TradingView COMEX GC1! options",
                    "chains": [
                        {
                            "expiration": "2026-05-29T00:00:00+00:00",
                            "strike": 5000.0,
                            "impliedVolatility": 0.30,
                            "bid": 1,
                            "ask": 2,
                            "type": "call",
                        },
                        {
                            "expiration": "2026-05-29T00:00:00+00:00",
                            "strike": 5000.0,
                            "impliedVolatility": 0.90,
                            "bid": 1,
                            "ask": 2,
                            "type": "put",
                        },
                    ],
                },
            },
            "polymarket": [
                {
                    "asset": "GOLD",
                    "slug": "what-price-will-gold-hit-in-may-2026",
                    "contracts": [
                        {
                            "marketId": "gold-5000",
                            "question": "Will Gold (XAUUSD) hit (HIGH) $5,000 in May?",
                            "strike": 5000.0,
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
        self.assertEqual(row.option_symbol, "CME_GC")
        self.assertIn(row.iv_resolution, {"cme_snapshot", "tv_chain"})
        # Upside barrier must use call IV, not the inflated same-strike put.
        self.assertAlmostEqual(row.option_iv, 0.30)
        self.assertEqual(row.cme_option_symbol, "CME_GC")
        self.assertAlmostEqual(row.cme_option_iv, 0.30)

    def test_downside_skew_iv_uplifts_dips_only(self) -> None:
        base = 0.40
        # ATM dip still gets base uplift.
        atm = report.downside_skew_iv(base, 100.0, 100.0, "below")
        self.assertIsNotNone(atm)
        assert atm is not None
        self.assertGreater(atm, base)
        # Deeper OTM dip gets more uplift, capped.
        deep = report.downside_skew_iv(base, 100.0, 70.0, "below")
        assert deep is not None
        self.assertGreater(deep, atm)
        # Highs unchanged.
        self.assertEqual(report.downside_skew_iv(base, 100.0, 120.0, "above"), base)

    def test_choose_iv_prefers_direction_matched_option_right(self) -> None:
        snapshot = {
            "underlyingPrice": 100.0,
            "chains": [
                {"expiration": "2026-07-01", "strike": 110, "impliedVolatility": 0.40, "bid": 1, "ask": 2, "type": "call"},
                {"expiration": "2026-07-01", "strike": 110, "impliedVolatility": 0.90, "bid": 1, "ask": 2, "type": "put"},
                {"expiration": "2026-07-01", "strike": 112, "impliedVolatility": 0.42, "bid": 1, "ask": 2, "type": "call"},
                {"expiration": "2026-07-01", "strike": 112, "impliedVolatility": 0.92, "bid": 1, "ask": 2, "type": "put"},
            ],
        }
        iv_up, _ = report.choose_iv_for_expiry(
            snapshot,
            datetime(2026, 7, 1, tzinfo=timezone.utc),
            110.0,
            datetime(2026, 5, 1, tzinfo=timezone.utc),
            direction="above",
        )
        iv_down, _ = report.choose_iv_for_expiry(
            snapshot,
            datetime(2026, 7, 1, tzinfo=timezone.utc),
            110.0,
            datetime(2026, 5, 1, tzinfo=timezone.utc),
            direction="below",
        )
        self.assertAlmostEqual(iv_up, 0.41)
        self.assertAlmostEqual(iv_down, 0.91)

    def test_calibration_jsonl_dedupes_by_timestamp_and_market(self) -> None:
        snapshot = {
            "timestamp": "2026-05-01T00:00:00+00:00",
            "spots": {"BTC": 100.0},
            "hyperliquid": {"BTC": {"markPx": 100.0, "fundingAnnualized": 0.02, "openInterestUsd": 1000000}},
            "options": {
                "IBIT": {
                    "underlyingPrice": 10.0,
                    "source": "CBOE delayed",
                    "chains": [
                        {"expiration": "2026-05-29T00:00:00+00:00", "strike": 12.0, "impliedVolatility": 0.50, "bid": 0.1, "ask": 0.2},
                    ],
                },
            },
            "polymarket": [
                {
                    "asset": "BTC",
                    "slug": "what-price-will-bitcoin-hit-in-may-2026",
                    "contracts": [
                        {
                            "marketId": "btc-120",
                            "question": "Will Bitcoin hit $120 in May 2026?",
                            "strike": 120.0,
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
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "calibration.jsonl"
            self.assertEqual(report.append_calibration_jsonl(rows, path, "2026-05-01T00:00:00+00:00"), 1)
            self.assertEqual(report.append_calibration_jsonl(rows, path, "2026-05-01T00:00:00+00:00"), 0)
            self.assertEqual(len(path.read_text().strip().splitlines()), 1)

    def test_iv_selection_matches_expiry_then_nearest_strike(self) -> None:
        snapshot = {
            "underlyingPrice": 100.0,
            "chains": [
                {"expiration": "2026-06-01", "strike": 90, "impliedVolatility": 0.20, "bid": 1, "ask": 2, "type": "call"},
                {"expiration": "2026-06-01", "strike": 100, "impliedVolatility": 0.21, "bid": 1, "ask": 2, "type": "call"},
                {"expiration": "2026-06-01", "strike": 110, "impliedVolatility": 0.22, "bid": 1, "ask": 2, "type": "call"},
                {"expiration": "2026-07-01", "strike": 100, "impliedVolatility": 0.50, "bid": 1, "ask": 2, "type": "call"},
                {"expiration": "2026-07-01", "strike": 105, "impliedVolatility": 0.51, "bid": 1, "ask": 2, "type": "call"},
                {"expiration": "2026-07-01", "strike": 110, "impliedVolatility": 0.52, "bid": 1, "ask": 2, "type": "call"},
            ],
        }
        iv, expiry = report.choose_iv_for_expiry(
            snapshot,
            datetime(2026, 7, 1, tzinfo=timezone.utc),
            108.0,
            datetime(2026, 5, 1, tzinfo=timezone.utc),
            direction="above",
        )
        self.assertEqual(expiry, "2026-07-01")
        self.assertAlmostEqual(iv, (0.50 + 0.51 + 0.52) / 3)


if __name__ == "__main__":
    unittest.main()
