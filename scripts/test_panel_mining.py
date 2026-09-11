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
    def test_bucket_conditions_use_engine_expression_grammar(self) -> None:
        features = {f.name: f for f in panel_features()}
        conditions, covered = miner.conditions_for_bucket_parts(
            features, [("dir", "dir=above"), ("edge", "e3-8")]
        )
        self.assertTrue(covered)
        # Exactly the syntax satisfiesNumericExpression parses and the
        # condition catalog documents (touch_direction: above=+1).
        self.assertEqual(conditions["touch_direction"], ">= 1")
        self.assertEqual(conditions["sell_yes_edge_pts"], "between 3 and 8")

    def test_open_ended_and_metadata_buckets(self) -> None:
        features = {f.name: f for f in panel_features()}
        conditions, _ = miner.conditions_for_bucket_parts(features, [("edge", "e8+")])
        self.assertEqual(conditions["sell_yes_edge_pts"], ">= 8")
        conditions, _ = miner.conditions_for_bucket_parts(features, [("edge", "e<1")])
        self.assertEqual(conditions["sell_yes_edge_pts"], "< 1")
        conditions, covered = miner.conditions_for_bucket_parts(features, [("dow", "weekend")])
        self.assertTrue(covered)
        self.assertEqual(conditions["day_of_week"], "in [sat, sun]")
        conditions, _ = miner.conditions_for_bucket_parts(features, [("stance", "s-1")])
        self.assertEqual(conditions["smart_flow_stance"], "<= -1")

    def test_panel_only_features_are_flagged_uncovered(self) -> None:
        features = {f.name: f for f in panel_features()}
        conditions, covered = miner.conditions_for_bucket_parts(
            features, [("dir", "dir=above"), ("fund", "f<-10")]
        )
        self.assertFalse(covered)
        self.assertEqual(conditions, {"touch_direction": ">= 1"})

    def test_render_condition_is_copy_pasteable(self) -> None:
        text = miner.render_condition(
            {"touch_direction": ">= 1", "sell_yes_edge_pts": "between 3 and 8"}
        )
        self.assertEqual(text, "touch_direction >= 1 AND sell_yes_edge_pts between 3 and 8")


class ProposedStratificationsTest(unittest.TestCase):
    """Explorer-proposed strat combos: validated, deduped, capped."""

    def _write(self, tmp_path: Path, payload) -> Path:
        import json

        path = tmp_path / "miner-proposed-strats.json"
        path.write_text(json.dumps(payload))
        return path

    def test_accepts_valid_combos_and_drops_junk(self) -> None:
        import tempfile

        feature_names = {f.name for f in panel_features()}
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(
                Path(tmp),
                {
                    "proposals": [
                        {"features": ["fund", "liq"], "rationale": "funding x liquidity"},
                        {"features": ["liq", "fund"], "rationale": "dup, other order"},
                        {"features": ["fund", "not_a_feature"], "rationale": "unknown"},
                        {"features": ["fund"], "rationale": "too short"},
                        {"features": ["money", "dow", "spread"], "rationale": "triple"},
                        {"features": ["dir", "edge"], "rationale": "already built-in"},
                    ]
                },
            )
            combos = miner.load_proposed_stratifications(path, feature_names)
        self.assertEqual(combos, [("fund", "liq"), ("money", "dow", "spread")])

    def test_missing_or_corrupt_file_is_empty(self) -> None:
        import tempfile

        feature_names = {f.name for f in panel_features()}
        self.assertEqual(
            miner.load_proposed_stratifications(Path("/nonexistent.json"), feature_names), []
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "miner-proposed-strats.json"
            path.write_text("{corrupt")
            self.assertEqual(miner.load_proposed_stratifications(path, feature_names), [])


class DerivedFeaturesTest(unittest.TestCase):
    """Explorer-proposed derived features: validated, materialized, mined
    through the identical pipeline, always coverage-gap (no catalog key)."""

    def _write(self, tmp_path: Path, payload) -> Path:
        import json

        path = tmp_path / "miner-proposed-features.json"
        path.write_text(json.dumps(payload))
        return path

    def _rows(self, n_days: int = 20) -> list[dict]:
        rows = []
        for d in range(1, n_days + 1):
            day_str = date.fromordinal(date(2026, 6, 1).toordinal() + d - 1).isoformat()
            for k in range(3):
                rows.append(
                    panel_row(
                        day_str, f"m{k}-{d}", 1.0,
                        liquidity=str(1000.0 * (k + 1)),
                        volume=str(500.0 * (d % 5 + 1)),
                    )
                )
        return rows

    def test_accepts_valid_and_drops_junk(self) -> None:
        import tempfile

        rows = self._rows()
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(
                Path(tmp),
                {
                    "proposals": [
                        {"name": "turnover", "transform": "ratio",
                         "columns": ["volume", "liquidity"], "rationale": "turnover proxy"},
                        {"name": "dup", "transform": "ratio",
                         "columns": ["volume", "liquidity"], "rationale": "same transform+cols"},
                        {"name": "bad_col", "transform": "ratio",
                         "columns": ["volume", "not_a_column"], "rationale": ""},
                        {"name": "bad_arity", "transform": "abs",
                         "columns": ["volume", "liquidity"], "rationale": ""},
                        {"name": "bad transform", "transform": "sqrt",
                         "columns": ["volume"], "rationale": ""},
                        {"name": "UPPER NAME!!", "transform": "abs",
                         "columns": ["moneyness_pct"], "rationale": "dropped: bad name"},
                        {"name": "with_edges", "transform": "diff",
                         "columns": ["liquidity", "volume"],
                         "edges": [0.0, 1500.0], "rationale": "explicit edges"},
                    ]
                },
            )
            feats = miner.load_proposed_features(path, rows)
        names = [f.name for f in feats]
        self.assertEqual(names, ["x_turnover", "x_with_edges"])
        self.assertEqual(feats[1].edges, [0.0, 1500.0])
        # Tercile edges were derived from the data for the ratio feature.
        self.assertEqual(len(feats[0].edges), 2)
        self.assertLess(feats[0].edges[0], feats[0].edges[1])

    def test_derived_bucketing_and_values(self) -> None:
        feat = miner.DerivedPanelFeature("x_turnover", "ratio", ["volume", "liquidity"], [0.5, 1.5])
        self.assertAlmostEqual(feat.value({"volume": "1000", "liquidity": "2000"}), 0.5)
        self.assertEqual(feat.bucket({"volume": "100", "liquidity": "2000"}), "<0.5")
        self.assertEqual(feat.bucket({"volume": "2000", "liquidity": "2000"}), "0.5-1.5")
        self.assertEqual(feat.bucket({"volume": "4000", "liquidity": "2000"}), ">=1.5")
        self.assertIsNone(feat.bucket({"volume": "1000", "liquidity": "0"}))  # div by zero
        self.assertIsNone(feat.bucket({"volume": "", "liquidity": "2000"}))
        self.assertIsNone(feat.condition_for_bucket("<0.5"))
        self.assertIsNone(feat.catalog_key)

    def test_low_coverage_or_degenerate_features_dropped(self) -> None:
        import tempfile

        # Rows where 'volume' is always empty: no coverage; and where the
        # derived value is constant: degenerate terciles.
        rows = [panel_row("2026-06-01", f"m{i}", 1.0, liquidity="1000", volume="")
                for i in range(60)]
        const_rows = [panel_row("2026-06-01", f"c{i}", 1.0, liquidity="1000", volume="1000")
                      for i in range(60)]
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(
                Path(tmp),
                {"proposals": [{"name": "t", "transform": "ratio",
                                "columns": ["volume", "liquidity"], "rationale": ""}]},
            )
            self.assertEqual(miner.load_proposed_features(path, rows), [])
            self.assertEqual(miner.load_proposed_features(path, const_rows), [])

    def test_mined_strata_via_derived_feature_are_coverage_gaps(self) -> None:
        """A planted edge visible only through a derived feature must be found
        — and must land in gaps (catalogCovered=False), never covered."""
        import random

        rng = random.Random(3)
        rows = []
        for d in range(1, 61):
            day_str = date.fromordinal(date(2026, 6, 1).toordinal() + d - 1).isoformat()
            for k in range(4):
                hot = k % 2 == 0  # high-turnover contracts carry the edge
                rows.append(
                    panel_row(
                        day_str, f"m{k}-{d}",
                        (4.0 if hot else 0.0) + rng.gauss(0, 4.0),
                        # Same edge bucket everywhere so raw features can't cut it.
                        sell_yes_edge_pts="5.0",
                        liquidity="10000",
                        volume="30000" if hot else "1000",
                    )
                )
        feat = miner.DerivedPanelFeature("x_turnover", "ratio", ["volume", "liquidity"], [1.0])
        result = miner.mine_panel(rows, max_findings=10, extra_features=[feat])
        derived_hits = [
            c for c in (result["candidates"])
            if "x_turnover" in c["dims"]
        ]
        self.assertTrue(derived_hits, "planted turnover edge should surface")
        self.assertTrue(all(not c["catalogCovered"] for c in derived_hits))
        covered_via_derived = [c for c in result["covered"] if "x_turnover" in c["dims"]]
        self.assertEqual(covered_via_derived, [])

    def test_proposed_combo_may_reference_derived_feature(self) -> None:
        import tempfile

        derived_names = {"x_turnover"}
        feature_names = {f.name for f in panel_features()} | derived_names
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "miner-proposed-strats.json"
            import json
            path.write_text(json.dumps(
                {"proposals": [{"features": ["x_turnover", "price"], "rationale": "turnover x price"}]}
            ))
            combos = miner.load_proposed_stratifications(path, feature_names)
        self.assertEqual(combos, [("x_turnover", "price")])


if __name__ == "__main__":
    unittest.main()
