#!/usr/bin/env python3
"""Tests for the spot/perp outcome panel builder and miner.

Focused on the first-night failure modes the contract panel hit, translated
to spot: exam-aligned win definitions, stale-market exclusion, no look-ahead
in trailing features, per-asset non-overlap dedupe, and conditions that
render into the engine's exact catalog grammar.
"""
import importlib.util
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lib.spot_panel_common import (  # noqa: E402
    SPOT_EXAM_THRESHOLD_PCT,
    SPOT_HORIZONS_DAYS,
    SPOT_OUTCOME_CLEAN,
    SPOT_OUTCOME_MISSING,
    SPOT_OUTCOME_STALE,
    TrailingSeries,
    compute_spot_outcome,
    dedupe_non_overlapping_spot,
    entry_is_stale,
    sample_daily_rows,
    spot_panel_features,
)

MINER_PATH = SCRIPTS / "mine_spot_panel_findings.py"
SPEC = importlib.util.spec_from_file_location("mine_spot_panel_findings", MINER_PATH)
assert SPEC and SPEC.loader
miner = importlib.util.module_from_spec(SPEC)
sys.modules["mine_spot_panel_findings"] = miner
SPEC.loader.exec_module(miner)


def series_from(prices: dict[str, float], column: str = "px") -> TrailingSeries:
    samples = {
        date.fromisoformat(day): {column: str(value)}
        for day, value in prices.items()
    }
    return TrailingSeries(samples, column)


class SamplingTest(unittest.TestCase):
    def test_picks_row_closest_to_preferred_hour(self):
        rows = [
            {"date": "2026-05-01T03", "px": "1"},
            {"date": "2026-05-01T14", "px": "2"},
            {"date": "2026-05-01T22", "px": "3"},
            {"date": "2026-05-02", "px": "4"},  # bare date reads as hour 12
        ]
        samples = sample_daily_rows(rows)
        self.assertEqual(samples[date(2026, 5, 1)]["px"], "2")
        self.assertEqual(samples[date(2026, 5, 2)]["px"], "4")


class OutcomeTest(unittest.TestCase):
    def test_clean_forward_move(self):
        s = series_from({
            "2026-05-01": 100.0,
            "2026-05-02": 101.0,
            "2026-05-04": 103.0,
        })
        oc = compute_spot_outcome(s, date(2026, 5, 1), 3)
        self.assertEqual(oc["quality"], SPOT_OUTCOME_CLEAN)
        self.assertAlmostEqual(oc["move_pct"], 3.0, places=4)
        self.assertEqual(oc["exit_day"], "2026-05-04")

    def test_one_day_horizon_only_exits_on_the_exact_next_day(self):
        # No sample on 05-02: a 1d claim must NOT be graded on the 05-03 move.
        s = series_from({
            "2026-05-01": 100.0,
            "2026-05-03": 110.0,
        })
        oc = compute_spot_outcome(s, date(2026, 5, 1), 1)
        self.assertEqual(oc["quality"], SPOT_OUTCOME_MISSING)

    def test_flat_window_is_stale_not_a_loss(self):
        # Stock market closed: price repeats. Counting this as a 0% move
        # would flood cells with fake losses at any exam threshold.
        s = series_from({
            "2026-05-01": 200.0,
            "2026-05-02": 200.0,
            "2026-05-03": 200.0,
            "2026-05-04": 200.0,
        })
        oc = compute_spot_outcome(s, date(2026, 5, 1), 3)
        self.assertEqual(oc["quality"], SPOT_OUTCOME_STALE)

    def test_stale_entry_detection(self):
        s = series_from({"2026-05-01": 200.0, "2026-05-02": 200.0, "2026-05-03": 201.0})
        self.assertTrue(entry_is_stale(s, date(2026, 5, 2)))
        self.assertFalse(entry_is_stale(s, date(2026, 5, 3)))


class TrailingFeatureTest(unittest.TestCase):
    def test_trailing_stats_never_look_ahead(self):
        days = {f"2026-05-{d:02d}": 100.0 + d for d in range(1, 21)}
        s = series_from(days)
        asof = date(2026, 5, 10)
        # 7d high as of day 10 is 110 (days 3..10); later, larger values must not leak in.
        self.assertAlmostEqual(s.pct_from_high(asof, 7), 0.0, places=4)
        window = s.window(asof, 30)
        self.assertEqual(max(window), 110.0)

    def test_change_pct_24h_uses_prior_sample_within_gap(self):
        s = series_from({"2026-05-01": 100.0, "2026-05-02": 102.0})
        self.assertAlmostEqual(s.change_pct_24h(date(2026, 5, 2)), 2.0, places=4)
        # A 4-day-old sample is not a 24h change.
        s2 = series_from({"2026-05-01": 100.0, "2026-05-05": 102.0})
        self.assertIsNone(s2.change_pct_24h(date(2026, 5, 5)))


class DedupeTest(unittest.TestCase):
    def test_per_asset_spacing(self):
        rows = [
            {"asset": "BTC", "entry_date": "2026-05-01"},
            {"asset": "BTC", "entry_date": "2026-05-02"},
            {"asset": "BTC", "entry_date": "2026-05-04"},
            {"asset": "ETH", "entry_date": "2026-05-02"},
        ]
        kept = dedupe_non_overlapping_spot(rows, 3)
        btc = [r["entry_date"] for r in kept if r["asset"] == "BTC"]
        self.assertEqual(btc, ["2026-05-01", "2026-05-04"])
        self.assertEqual(len([r for r in kept if r["asset"] == "ETH"]), 1)


class ConditionRenderingTest(unittest.TestCase):
    """Conditions must be copy-paste valid for the engine's catalog:
    derived patterns over real valuation columns, funding keys, metadata."""

    def setUp(self):
        self.features = {f.name: f for f in spot_panel_features()}

    def test_funding_condition_uses_perp_key(self):
        cond = self.features["fund"].condition_for("BTC", "f<-20")
        self.assertEqual(cond, {"btc_hl_funding_ann": "< -20"})

    def test_derived_conditions_reference_real_columns(self):
        cond = self.features["ret24"].condition_for("GOLD", "r-2-0")
        self.assertEqual(cond, {"gold_gc_spot_change_pct_24h": "between -2 and 0"})
        cond = self.features["fundz"].condition_for("OIL", "fz<-1.5")
        self.assertEqual(cond, {"oil_hl_funding_ann_zscore_30d": "< -1.5"})
        cond = self.features["pcr"].condition_for("BTC", "pc80+")
        self.assertEqual(cond, {"btc_ibit_pc_ratio_percentile_30d": ">= 80"})

    def test_dow_condition_is_metadata_list(self):
        cond = self.features["dow"].condition_for("BTC", "weekend")
        self.assertEqual(cond, {"day_of_week": "in [sat, sun]"})

    def test_assets_without_a_column_yield_no_condition(self):
        # SPY has no funding column; ETH has no PC ratio or IV term spread.
        self.assertIsNone(self.features["fund"].condition_for("SPY", "f<-20"))
        self.assertIsNone(self.features["pcr"].condition_for("ETH", "pc<20"))
        self.assertIsNone(self.features["ivts"].condition_for("ETH", "iv<0"))

    def test_panel_only_features_have_no_key(self):
        self.assertIsNone(self.features["macro"].condition_for("BTC", "mac<0"))
        self.assertIsNone(self.features["rvol"].condition_for("BTC", "v<1"))


def synthetic_panel(edge_asset: str = "BTC") -> list[dict]:
    """~200 days, two assets. BTC has a real long edge after down days
    (deterministic alternation, strong enough to clear BH); ETH is noise."""
    rows = []
    start = date(2026, 1, 1)
    for i in range(200):
        day = start + timedelta(days=i)
        # BTC: 24h return alternates; after a down day the next 1d move is +1%.
        btc_down_yesterday = i % 2 == 0
        btc_move = 1.0 if btc_down_yesterday else -0.8
        rows.append({
            "entry_date": day.isoformat(),
            "asset": edge_asset,
            "ret_24h_pct": "-2.5" if btc_down_yesterday else "1.5",
            "fund_ann": "5",
            "day_of_week": str(day.weekday()),
            "is_weekend": "1" if day.weekday() >= 5 else "0",
            "outcome_quality_1d": "clean",
            "move_pct_1d": str(btc_move),
            "outcome_quality_3d": "clean",
            "move_pct_3d": str(btc_move * 1.5),
            "outcome_quality_7d": "clean",
            "move_pct_7d": str(btc_move * 2.0),
        })
        eth_move = 0.3 if i % 3 == 0 else -0.3
        rows.append({
            "entry_date": day.isoformat(),
            "asset": "ETH",
            "ret_24h_pct": "0.1",
            "fund_ann": "5",
            "day_of_week": str(day.weekday()),
            "is_weekend": "1" if day.weekday() >= 5 else "0",
            "outcome_quality_1d": "clean",
            "move_pct_1d": str(eth_move),
            "outcome_quality_3d": "clean",
            "move_pct_3d": str(eth_move),
            "outcome_quality_7d": "clean",
            "move_pct_7d": str(eth_move),
        })
    return rows


class MinerTest(unittest.TestCase):
    def test_finds_planted_edge_with_catalog_conditions_and_exam_threshold(self):
        result = miner.mine_spot_panel(synthetic_panel(), max_findings=10)
        self.assertGreater(len(result["covered"]), 0)
        best = result["covered"][0]
        self.assertEqual(best["asset"], "BTC")
        self.assertEqual(best["side"], "long")
        self.assertTrue(best["catalogCovered"])
        self.assertIn("asset", best["conditions"])
        # Exam thresholds are stamped per horizon and wins were counted at them.
        self.assertEqual(
            best["thresholdPct"], SPOT_EXAM_THRESHOLD_PCT[best["horizon"]]
        )
        self.assertGreater(
            best["discovery"]["winRate"], best["discovery"]["baseRate"]
        )
        # Holdout independently confirms.
        self.assertGreater(best["holdout"]["meanPnlPct"], 0)

    def test_suggested_prediction_carries_the_exam_threshold(self):
        result = miner.mine_spot_panel(synthetic_panel(), max_findings=10)
        best = result["covered"][0]
        pred = miner.suggested_prediction(best)
        move = best["thresholdPct"]
        move_s = str(int(move)) if float(move).is_integer() else str(move)
        self.assertIn("> %s%%" % move_s, pred)
        self.assertIn("BTC", pred)
        # The engine scorer parses "> X%"; the direction word must be present.
        self.assertTrue("rises" in pred or "declines" in pred)

    def test_cluster_key_shape_parses_for_theme_assignment(self):
        result = miner.mine_spot_panel(synthetic_panel(), max_findings=10)
        best = result["covered"][0]
        key = miner.cluster_key_for(best)
        parts = key.split("|")
        self.assertEqual(len(parts), 4)
        self.assertTrue(parts[0].startswith("SPOTPANEL_"))

    def test_noise_asset_yields_no_findings(self):
        rows = [r for r in synthetic_panel() if r["asset"] == "ETH"]
        result = miner.mine_spot_panel(rows, max_findings=10)
        self.assertEqual(result["covered"], [])

    def test_win_at_base_rate_is_not_a_candidate(self):
        # A cell whose exam win rate equals the pool base rate must be
        # filtered even if mean pnl is positive.
        rows = synthetic_panel()
        result = miner.mine_spot_panel(rows, max_findings=10)
        for c in result["candidates"]:
            self.assertGreater(c["discovery"]["winRate"], c["discovery"]["baseRate"])


class ExamAlignmentTest(unittest.TestCase):
    def test_exam_thresholds_defined_for_every_horizon(self):
        for h in SPOT_HORIZONS_DAYS:
            self.assertIn(h, SPOT_EXAM_THRESHOLD_PCT)


if __name__ == "__main__":
    unittest.main()
