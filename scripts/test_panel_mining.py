#!/usr/bin/env python3
"""Tests for the outcome panel builder and panel miner."""
import importlib.util
import sys
import unittest
from datetime import date
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lib.panel_common import (  # noqa: E402
    OUTCOME_AMBIGUOUS,
    OUTCOME_CLEAN,
    OUTCOME_TERMINAL_NO,
    OUTCOME_TERMINAL_YES,
    compute_outcome,
    dedupe_non_overlapping,
    entry_eligible,
    panel_features,
)

MINER_PATH = SCRIPTS / "mine_panel_findings.py"
SPEC = importlib.util.spec_from_file_location("mine_panel_findings", MINER_PATH)
assert SPEC and SPEC.loader
miner = importlib.util.module_from_spec(SPEC)
sys.modules["mine_panel_findings"] = miner
SPEC.loader.exec_module(miner)


def rv_row(market_id: str, bid: float, ask: float, **extra) -> dict:
    row = {
        "market_id": market_id,
        "asset": "BTC",
        "pm_best_bid": str(bid),
        "pm_best_ask": str(ask),
        "pm_yes_price": str((bid + ask) / 2),
        "liquidity": "10000",
    }
    row.update({k: str(v) for k, v in extra.items()})
    return row


class ComputeOutcomeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.d0 = date(2026, 8, 1)
        self.d3 = date(2026, 8, 4)

    def test_clean_exit_pnl_math(self) -> None:
        entry = rv_row("m1", 0.60, 0.62)
        day_maps = {
            self.d0: {"m1": entry},
            self.d3: {"m1": rv_row("m1", 0.40, 0.42)},
        }
        oc = compute_outcome(entry, self.d0, 3, day_maps, [self.d0, self.d3])
        self.assertEqual(oc["quality"], OUTCOME_CLEAN)
        # YES: buy at 0.62, sell at 0.40 -> -35.48%
        self.assertAlmostEqual(oc["yes_pnl_pct"], (0.40 - 0.62) / 0.62 * 100, places=2)
        # NO: buy at 1-0.60=0.40, sell at 1-0.42=0.58 -> +45%
        self.assertAlmostEqual(oc["no_pnl_pct"], (0.58 - 0.40) / 0.40 * 100, places=2)

    def test_terminal_yes_when_contract_vanishes_pinned_high(self) -> None:
        entry = rv_row("m1", 0.60, 0.62)
        d1 = date(2026, 8, 2)
        day_maps = {
            self.d0: {"m1": entry},
            d1: {"m1": rv_row("m1", 0.985, 0.995)},
            self.d3: {},  # gone
        }
        oc = compute_outcome(entry, self.d0, 3, day_maps, [self.d0, d1, self.d3])
        self.assertEqual(oc["quality"], OUTCOME_TERMINAL_YES)
        self.assertAlmostEqual(oc["no_pnl_pct"], -100.0, places=1)
        self.assertGreater(oc["yes_pnl_pct"], 0)

    def test_terminal_no_when_contract_vanishes_pinned_low(self) -> None:
        entry = rv_row("m1", 0.10, 0.12)
        d1 = date(2026, 8, 2)
        day_maps = {
            self.d0: {"m1": entry},
            d1: {"m1": rv_row("m1", 0.01, 0.02)},
            self.d3: {},
        }
        oc = compute_outcome(entry, self.d0, 3, day_maps, [self.d0, d1, self.d3])
        self.assertEqual(oc["quality"], OUTCOME_TERMINAL_NO)
        self.assertAlmostEqual(oc["yes_pnl_pct"], -100.0, places=1)

    def test_ambiguous_disappearance_is_not_scored(self) -> None:
        entry = rv_row("m1", 0.55, 0.57)
        day_maps = {self.d0: {"m1": entry}, self.d3: {}}
        oc = compute_outcome(entry, self.d0, 3, day_maps, [self.d0, self.d3])
        self.assertEqual(oc["quality"], OUTCOME_AMBIGUOUS)
        self.assertIsNone(oc["yes_pnl_pct"])
        self.assertIsNone(oc["no_pnl_pct"])

    def test_exit_tolerance_uses_nearby_day(self) -> None:
        entry = rv_row("m1", 0.50, 0.52)
        d4 = date(2026, 8, 5)
        day_maps = {self.d0: {"m1": entry}, d4: {"m1": rv_row("m1", 0.70, 0.72)}}
        oc = compute_outcome(entry, self.d0, 3, day_maps, [self.d0, d4])
        self.assertEqual(oc["quality"], OUTCOME_CLEAN)
        self.assertEqual(oc["exit_day"], "2026-08-05")


class EntryEligibleTest(unittest.TestCase):
    def test_rejects_wide_spread_and_thin_book(self) -> None:
        self.assertTrue(entry_eligible(rv_row("m", 0.40, 0.42)))
        self.assertFalse(entry_eligible(rv_row("m", 0.40, 0.60)))  # spread 0.20
        self.assertFalse(entry_eligible(rv_row("m", 0.40, 0.42, liquidity=100)))
        self.assertFalse(entry_eligible(rv_row("m", 0.005, 0.008)))  # sub-penny bid


class DedupeNonOverlappingTest(unittest.TestCase):
    def test_enforces_horizon_spacing_per_contract(self) -> None:
        rows = [
            {"market_id": "m1", "entry_date": f"2026-08-{d:02d}"} for d in range(1, 8)
        ] + [{"market_id": "m2", "entry_date": "2026-08-02"}]
        kept = dedupe_non_overlapping(rows, 3)
        m1_dates = sorted(r["entry_date"] for r in kept if r["market_id"] == "m1")
        self.assertEqual(m1_dates, ["2026-08-01", "2026-08-04", "2026-08-07"])
        self.assertEqual(sum(1 for r in kept if r["market_id"] == "m2"), 1)


class SplitDaysTest(unittest.TestCase):
    def test_temporal_split_puts_recent_days_in_holdout(self) -> None:
        days = [f"2026-08-{d:02d}" for d in range(1, 11)]
        disc, hold = miner.split_days(days, 0.30)
        self.assertEqual(len(disc), 7)
        self.assertEqual(len(hold), 3)
        self.assertTrue(max(disc) < min(hold))


def panel_row(day: str, market_id: str, no_pnl: float, **features) -> dict:
    row = {
        "entry_date": day,
        "asset": "BTC",
        "market_id": market_id,
        "direction": "above",
        "sell_yes_edge_pts": "5.0",
        "dte_days": "20",
        "yes_ask": "0.30",
        "pm_spread": "0.01",
        "liquidity": "10000",
        "smart_flow_stance": "",
        "pm_iv_minus_opt_iv_pts": "",
        "adjusted_no_gap_pts": "",
        "is_weekend": "0",
        "perp_funding_ann": "",
        "moneyness_pct": "",
        "macro_composite": "",
        "spot_ret_24h_pct": "",
        "no_pnl_pct_3d": str(no_pnl),
        "yes_pnl_pct_3d": str(-no_pnl),
        "outcome_quality_3d": "clean",
        "no_pnl_pct_7d": "",
        "yes_pnl_pct_7d": "",
        "outcome_quality_7d": "missing",
    }
    row.update({k: str(v) for k, v in features.items()})
    return row


class MinePanelTest(unittest.TestCase):
    def _panel(self, edge_effect: float, holdout_effect: float) -> list[dict]:
        """60 days; contracts with edge>=3 get a planted mean, others none."""
        rows = []
        import random

        rng = random.Random(7)
        for d in range(1, 61):
            day = (date(2026, 6, 1).toordinal() + d - 1)
            day_str = date.fromordinal(day).isoformat()
            in_holdout = d > 42
            effect = holdout_effect if in_holdout else edge_effect
            for k in range(4):
                rows.append(
                    panel_row(
                        day_str, f"edge{k}-{d}",
                        effect + rng.gauss(0, 4.0),
                        sell_yes_edge_pts="5.0",
                    )
                )
                rows.append(
                    panel_row(
                        day_str, f"flat{k}-{d}",
                        rng.gauss(0, 4.0),
                        sell_yes_edge_pts="0.5",
                    )
                )
        return rows

    def test_planted_edge_survives_when_holdout_confirms(self) -> None:
        result = miner.mine_panel(self._panel(4.0, 4.0), max_findings=10)
        keys = [miner.cluster_key_for(c) for c in result["covered"]]
        self.assertTrue(
            any("e3-8" in k and "|no" in k for k in keys),
            f"expected an e3-8 NO finding, got: {keys}",
        )
        # The flat cohort must not be registered.
        self.assertFalse(any("e<1" in k for k in keys))

    def test_edge_that_dies_in_holdout_is_rejected(self) -> None:
        result = miner.mine_panel(self._panel(4.0, -4.0), max_findings=10)
        keys = [miner.cluster_key_for(c) for c in result["covered"]]
        self.assertFalse(any("e3-8" in k for k in keys), f"holdout should block: {keys}")

    def test_high_priced_no_pool_needs_more_than_its_base_rate(self) -> None:
        """A NO bought at 20c wins ~80% of the time with zero edge; the
        binomial null must come from the pool, not a coin flip."""
        import random

        rng = random.Random(11)
        rows = []
        for d in range(1, 61):
            day_str = date.fromordinal(date(2026, 6, 1).toordinal() + d - 1).isoformat()
            for k in range(6):
                # 80% small win (+5%), 20% total loss (-100%): EV negative.
                pnl = 5.0 if rng.random() < 0.8 else -100.0
                rows.append(panel_row(day_str, f"c{k}-{d}", pnl, sell_yes_edge_pts="5.0"))
        result = miner.mine_panel(rows, max_findings=10)
        no_keys = [
            miner.cluster_key_for(c) for c in result["covered"] if c["side"] == "no"
        ]
        self.assertEqual(
            no_keys, [],
            "negative-EV NO pool with an 80% base win rate must not produce NO findings",
        )
        # The mirror-image YES side genuinely has positive EV in this fixture;
        # the miner is right to flag it, so no assertion against it.


class ConditionRenderingTest(unittest.TestCase):
    def test_bucket_conditions_merge_into_catalog_keys(self) -> None:
        features = {f.name: f for f in panel_features()}
        conditions, covered = miner.conditions_for_bucket_parts(
            features, [("dir", "dir=above"), ("edge", "e3-8")]
        )
        self.assertTrue(covered)
        self.assertEqual(conditions["touch_direction"], "above")
        self.assertEqual(conditions["sell_yes_edge_pts"], {"gte": 3.0, "lt": 8.0})

    def test_panel_only_features_are_flagged_uncovered(self) -> None:
        features = {f.name: f for f in panel_features()}
        conditions, covered = miner.conditions_for_bucket_parts(
            features, [("dir", "dir=above"), ("fund", "f<-10")]
        )
        self.assertFalse(covered)
        self.assertEqual(conditions, {"touch_direction": "above"})

    def test_render_condition_is_human_readable(self) -> None:
        text = miner.render_condition(
            {"touch_direction": "above", "sell_yes_edge_pts": {"gte": 3.0, "lt": 8.0}}
        )
        self.assertIn("touch_direction=above", text)
        self.assertIn("3.0<=sell_yes_edge_pts<8.0", text)


if __name__ == "__main__":
    unittest.main()
