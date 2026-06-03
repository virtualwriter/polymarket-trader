#!/usr/bin/env python3
"""
IV Model Variant Backtest -- compare one-touch probability estimates under
different IV sourcing strategies against actual PM price movements.

Motivation:
  In `touch_adjusted_probability()` the one-touch probability is computed as:
    P_touch = 2 * N( ln(spot/strike) / (iv * sqrt(t)) + 0.5 * iv * sqrt(t) )
  where `iv` comes from `choose_iv_for_expiry()` which picks the closest-strike
  option chain row to the contract's strike.  For far-OTM strikes this IV is
  inflated by tail-hedging skew, making the model overestimate touch probability
  and creating a phantom "edge" that does not predict outcomes.

This script backtests three IV strategies on every archived heatmap CSV:

  A) CLOSEST-STRIKE (current) -- pick the 4 option-chain rows closest to the
     contract strike and average their IVs.
  B) ATM-IV -- pick the 4 option-chain rows closest to AT-THE-MONEY (strike
     closest to spot) on the same expiry.  This eliminates strike-specific skew
     entirely.
  C) SKEW-ADJUSTED -- interpolate the entire IV surface (available strikes at
     the target expiry), estimate the implied volatility skew slope, and derive
     a "de-skewed" IV at the target strike by flattening the put/call skew.

For each CSV timestamp, for each row, we compute all three model probabilities
and record which one would have been more accurate vs. the PM price at exit.

Output: relative-value/iv_variant_backtest.csv
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import statistics
import sys
from bisect import bisect_left
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
HISTORY_DIR = ROOT / "relative-value" / "history"
DEFAULT_OUT = ROOT / "relative-value" / "iv_variant_backtest.csv"


# ---------------------------------------------------------------------------
# Normal CDF (rational approximation)
# ---------------------------------------------------------------------------
def norm_cdf(x: float) -> float:
    """Standard normal CDF -- Abramowitz & Stegun 26.2.17."""
    a1, a2, a3, a4, a5 = 0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429
    p = 0.3275911
    sign = 1.0 if x >= 0 else -1.0
    x = abs(x)
    t = 1.0 / (1.0 + p * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x * x)
    return 0.5 * (1.0 + sign * y)


# ---------------------------------------------------------------------------
# Core probability functions (mirrored from cross_venue_relative_value_report.py)
# ---------------------------------------------------------------------------
def one_touch_prob(
    spot: float, strike: float, iv: float, dte_days: float, direction: str
) -> Optional[float]:
    if spot <= 0 or strike <= 0 or iv <= 0 or dte_days <= 0:
        return None
    if direction == "above" and spot >= strike:
        return 1.0
    if direction == "below" and spot <= strike:
        return 1.0
    t = dte_days / 365.0
    sigma_t = iv * math.sqrt(t)
    if sigma_t <= 0:
        return None
    d1 = (math.log(spot / strike) + 0.5 * iv * iv * t) / sigma_t
    if direction == "above":
        return min(0.99, max(0.0, 2.0 * norm_cdf(d1)))
    if direction == "below":
        return min(0.99, max(0.0, 2.0 * norm_cdf(-d1)))
    return None


def terminal_prob(
    spot: float, strike: float, iv: float, dte_days: float, direction: str
) -> Optional[float]:
    if spot <= 0 or strike <= 0 or iv <= 0 or dte_days <= 0:
        return None
    t = dte_days / 365.0
    sigma_t = iv * math.sqrt(t)
    if sigma_t <= 0:
        return None
    d2 = (math.log(spot / strike) - 0.5 * iv * iv * t) / sigma_t
    if direction == "above":
        return norm_cdf(d2)
    if direction == "below":
        return norm_cdf(-d2)
    return None


def touch_adjusted_prob(
    spot: float, strike: float, iv: float, dte_days: float, direction: str
) -> Optional[float]:
    tp = terminal_prob(spot, strike, iv, dte_days, direction)
    if tp is None:
        return None
    otp = one_touch_prob(spot, strike, iv, dte_days, direction)
    if otp is not None:
        return max(tp, otp)
    return min(0.99, max(0.0, 2.0 * tp))


# ---------------------------------------------------------------------------
# IV sourcing strategies
# ---------------------------------------------------------------------------
@dataclass
class IvSurfaceRow:
    strike: float
    iv: float
    bid: float
    ask: float


def parse_option_chain(row: Dict[str, str]) -> List[IvSurfaceRow]:
    """
    Parse the 'notes' and 'option_iv' fields to reconstruct the option surface.
    Actually, the archived CSVs only store a *single* IV (option_iv) which is
    the closest-strike average.  To get the full surface we would need the
    raw options snapshot JSON, which is NOT archived.

    Therefore, we must work with what we have: the archived CSV contains the
    contract strike, spot, direction, the current closest-strike IV, and the
    `pm_iv` (implied IV from PM market price).  We use these to simulate what
    each strategy would have predicted.

    Strategy:
      A) CLOSEST-STRIKE: use the stored `option_iv` as-is.
      B) ATM-IV: we don't have the ATM IV stored.  We approximate ATM IV by
         interpolating from the `pm_iv` and `option_iv` pair, treating the
         strike distance as a proxy for skew.
         We derive an "ATM correction factor" by looking at the IV ratio vs.
         moneyness across all rows in the same snapshot.
         For a single row approximation:  ATM_IV ≈ option_iv / skew_factor
         where skew_factor is estimated from the IV skew slope.
      C) SKEW-ADJUSTED: similar approach but uses a parametric model.

    Since we lack the raw option chain in the CSV, we use a cross-sectional
    approach: for each snapshot, we look at ALL one-touch rows and fit an
    IV skew curve (IV as a function of log-moneyness).  Then we "read off"
    the ATM IV from the fitted curve and the de-skewed IV at each strike.
    """
    pass  # Surface built in process_snapshot below


# ---------------------------------------------------------------------------
# Skew estimation helpers
# ---------------------------------------------------------------------------
def estimate_iv_skew(
    rows: List[Dict[str, str]]
) -> Tuple[Optional[float], Optional[float]]:
    """
    Given all one-touch rows in a snapshot, estimate:
      - atm_iv: the IV at zero log-moneyness (strike == spot)
      - skew_slope: iv change per unit log-moneyness

    Uses a simple linear regression: IV ~ a + b * ln(strike/spot)
    Returns (atm_iv, skew_slope) or (None, None) if insufficient data.
    """
    x_vals: List[float] = []
    y_vals: List[float] = []
    for r in rows:
        spot = safe_float(r.get("spot"))
        strike = safe_float(r.get("strike"))
        opt_iv = safe_float(r.get("option_iv"))
        if not spot or not strike or not opt_iv or spot <= 0 or strike <= 0:
            continue
        if opt_iv <= 0:
            continue
        lm = math.log(strike / spot)
        x_vals.append(lm)
        y_vals.append(opt_iv)

    if len(x_vals) < 3:
        return None, None

    n = len(x_vals)
    sx = sum(x_vals)
    sy = sum(y_vals)
    sxx = sum(x * x for x in x_vals)
    sxy = sum(x * y for x, y in zip(x_vals, y_vals))

    denom = n * sxx - sx * sx
    if abs(denom) < 1e-12:
        return None, None

    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n  # IV at ln(strike/spot) = 0 → ATM
    return intercept, slope


def safe_float(value: object) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
        if parsed != parsed or parsed in (float("inf"), float("-inf")):
            return None
        return parsed
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Read history
# ---------------------------------------------------------------------------
def read_history(history_dir: Path) -> List[Tuple[datetime, Path, List[Dict[str, str]]]]:
    snapshots: List[Tuple[datetime, Path, List[Dict[str, str]]]] = []
    for path in sorted(history_dir.glob("**/*cross_venue_relative_value*.csv")):
        with path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        if not rows:
            continue
        ts_str = rows[0].get("timestamp", "")
        try:
            ts = datetime.strptime(ts_str.replace("Z", ""), "%Y-%m-%dT%H").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        snapshots.append((ts, path, rows))
    return sorted(snapshots, key=lambda item: item[0])


# ---------------------------------------------------------------------------
# Run backtest: compare model-variant predictions vs PM price movement
# ---------------------------------------------------------------------------
@dataclass
class ModelOutcome:
    market_id: str
    asset: str
    contract_question: str
    direction: str
    strike: float
    spot: float
    dte_days: float
    entry_time: datetime
    exit_time: Optional[datetime]

    # PM prices
    entry_pm_yes: float
    exit_pm_yes: Optional[float]

    # Closest-strike model (current)
    closest_strike_iv: float
    closest_strike_touch_prob: Optional[float]
    closest_strike_edge: Optional[float]

    # ATM model
    atm_iv: Optional[float]
    atm_touch_prob: Optional[float]
    atm_edge: Optional[float]

    # Skew-adjusted model
    skew_adjusted_iv: Optional[float]
    skew_adjusted_touch_prob: Optional[float]
    skew_adjusted_edge: Optional[float]

    # Actual outcome
    pm_moved_up: Optional[bool]  # did PM YES price go up?
    pm_pnl_pct: Optional[float]

    def row(self) -> List[str]:
        def f(v: object, places: int = 6) -> str:
            if v is None:
                return ""
            if isinstance(v, float):
                return f"{v:.{places}f}"
            return str(v)

        def var_win(variant_edge: Optional[float], model_name: str) -> str:
            """If variant predicted buy_yes (edge>0) and PM went up, it's a 'win'."""
            if variant_edge is None or self.pm_moved_up is None:
                return ""
            if self.pm_moved_up and variant_edge > 0:
                return f"1_{model_name}"
            if not self.pm_moved_up and variant_edge < 0:
                return f"1_{model_name}"
            return f"0_{model_name}"

        closest_win = var_win(self.closest_strike_edge, "closest")
        atm_win = var_win(self.atm_edge, "atm")
        skew_win = var_win(self.skew_adjusted_edge, "skew")

        return [
            self.asset,
            self.market_id,
            f(self.entry_time),
            f(self.exit_time),
            f(self.strike),
            f(self.spot),
            f(self.dte_days, 2),
            self.direction,
            f(self.entry_pm_yes),
            f(self.exit_pm_yes),
            f(self.closest_strike_iv),
            f(self.atm_iv),
            f(self.skew_adjusted_iv),
            f(self.closest_strike_touch_prob, 6),
            f(self.atm_touch_prob, 6),
            f(self.skew_adjusted_touch_prob, 6),
            f(self.closest_strike_edge, 6),
            f(self.atm_edge, 6),
            f(self.skew_adjusted_edge, 6),
            "up" if self.pm_moved_up else "down" if self.pm_moved_up is False else "",
            f(self.pm_pnl_pct, 4),
            closest_win,
            atm_win,
            skew_win,
        ]


FIELDNAMES = [
    "asset", "market_id",
    "entry_time", "exit_time",
    "strike", "spot", "dte_days", "direction",
    "entry_pm_yes", "exit_pm_yes",
    "closest_strike_iv", "atm_iv", "skew_adjusted_iv",
    "closest_strike_touch_prob", "atm_touch_prob", "skew_adjusted_touch_prob",
    "closest_strike_edge", "atm_edge", "skew_adjusted_edge",
    "pm_moved", "pm_pnl_pct",
    "closest_result", "atm_result", "skew_result",
]


def backtest(
    snapshots: List[Tuple[datetime, Path, List[Dict[str, str]]]],
    hold_days: int,
) -> List[ModelOutcome]:
    """Run the three IV variants against historical data."""
    results: List[ModelOutcome] = []
    hold_delta = timedelta(days=hold_days)

    # Map of market_id -> (entry_time, row) for each entry we track
    entries: Dict[str, Tuple[datetime, Dict[str, str]]] = {}

    # Process snapshots sequentially
    for i, (snap_time, _path, rows) in enumerate(snapshots):
        # ---- 1. Estimate IV skew from this snapshot ----
        one_touch_rows = [r for r in rows if "one_touch" in r.get("model_version", "")]
        atm_iv_est, skew_slope = estimate_iv_skew(one_touch_rows)

        # Index rows by market_id for exit lookups
        rows_by_mid: Dict[str, Dict[str, str]] = {}
        for r in rows:
            mid = r.get("market_id", "")
            if mid:
                rows_by_mid[mid] = r

        # ---- 2. Check for exits ----
        to_remove: List[str] = []
        for mid, (entry_time, entry_row) in entries.items():
            if snap_time < entry_time + hold_delta:
                continue
            exit_row = rows_by_mid.get(mid)
            if not exit_row:
                continue

            entry_pm = safe_float(entry_row.get("pm_yes_price"))
            exit_pm = safe_float(exit_row.get("pm_yes_price"))
            if entry_pm is None or exit_pm is None:
                to_remove.append(mid)
                continue

            pm_moved_up = exit_pm > entry_pm
            pm_pnl = ((exit_pm / entry_pm) - 1.0) * 100.0 if entry_pm > 0 else None

            # Parse entry data
            spot = safe_float(entry_row.get("spot"))
            strike = safe_float(entry_row.get("strike"))
            dte = safe_float(entry_row.get("dte_days"))
            direction = entry_row.get("direction", "")
            opt_iv = safe_float(entry_row.get("option_iv"))
            asset = entry_row.get("asset", "?")

            if not all([spot, strike, dte, opt_iv]) or not direction:
                to_remove.append(mid)
                continue

            # (A) Closest-strike model
            cs_prob = touch_adjusted_prob(spot, strike, opt_iv, dte, direction)
            cs_edge = (cs_prob - entry_pm) * 100 if cs_prob is not None else None

            # (B) ATM model
            atm_prob = None
            atm_edge = None
            atm_iv = None
            if atm_iv_est is not None and atm_iv_est > 0:
                atm_iv = atm_iv_est
                atm_prob = touch_adjusted_prob(spot, strike, atm_iv, dte, direction)
                atm_edge = (atm_prob - entry_pm) * 100 if atm_prob is not None else None

            # (C) Skew-adjusted model
            skew_prob = None
            skew_edge = None
            skew_iv = None
            if atm_iv_est is not None and skew_slope is not None and atm_iv_est > 0:
                lm = math.log(strike / spot)
                skew_iv = atm_iv_est + skew_slope * lm  # IV at target moneyness
                if skew_iv > 0:
                    skew_prob = touch_adjusted_prob(spot, strike, skew_iv, dte, direction)
                    skew_edge = (skew_prob - entry_pm) * 100 if skew_prob is not None else None

            results.append(ModelOutcome(
                market_id=mid,
                asset=asset,
                contract_question=entry_row.get("contract_question", ""),
                direction=direction,
                strike=strike,
                spot=spot,
                dte_days=dte,
                entry_time=entry_time,
                exit_time=snap_time,
                entry_pm_yes=entry_pm,
                exit_pm_yes=exit_pm,
                closest_strike_iv=opt_iv,
                closest_strike_touch_prob=cs_prob,
                closest_strike_edge=cs_edge,
                atm_iv=atm_iv,
                atm_touch_prob=atm_prob,
                atm_edge=atm_edge,
                skew_adjusted_iv=skew_iv,
                skew_adjusted_touch_prob=skew_prob,
                skew_adjusted_edge=skew_edge,
                pm_moved_up=pm_moved_up,
                pm_pnl_pct=pm_pnl,
            ))

            to_remove.append(mid)

        for mid in to_remove:
            entries.pop(mid, None)

        # ---- 3. Enter new positions ----
        for row in rows:
            mid = row.get("market_id", "")
            if not mid or mid in entries:
                continue
            model_version = row.get("model_version", "")
            if "one_touch" not in model_version:
                continue
            # Accept ALL rows for entry (not just eligible_for_backtest) to
            # maximize sample size.  The "eligible_for_backtest" flag filters
            # out short-dated serial-month contracts that we actually need to
            # evaluate.  We filter out rows with bad data instead.
            pm_bid = safe_float(row.get("pm_best_bid"))
            pm_ask = safe_float(row.get("pm_best_ask"))
            if pm_bid is None or pm_ask is None or pm_bid <= 0 or pm_ask >= 1:
                continue
            pm_yes = safe_float(row.get("pm_yes_price"))
            if pm_yes is None or pm_yes <= 0 or pm_yes >= 1:
                continue
            entries[mid] = (snap_time, row)

    return results


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
def print_summary(results: List[ModelOutcome]) -> None:
    print(f"\n{'='*60}")
    print(f"IV Model Variant Backtest: {len(results)} trades")
    print(f"{'='*60}\n")

    def variant_stats(outcomes: List[ModelOutcome], edge_attr: str, name: str):
        edges = [getattr(o, edge_attr) for o in outcomes]
        valid = [(e, o) for e, o in zip(edges, outcomes) if e is not None]

        if not valid:
            print(f"\n  {name}: no valid entries")
            return

        correct = sum(1 for e, o in valid if (e > 0 and o.pm_moved_up) or (e < 0 and not o.pm_moved_up))
        total = len(valid)
        acc = correct / total * 100 if total > 0 else 0
        avg_edge = sum(e for e, _ in valid) / total

        print(f"\n  {name}:")
        print(f"    Accuracy (edge predicts direction): {acc:.1f}% ({correct}/{total})")
        print(f"    Mean absolute edge: {sum(abs(e) for e, _ in valid) / total:.2f}pt")
        print(f"    Mean edge sign: {'+' if avg_edge > 0 else ''}{avg_edge:.2f}pt")

        # Binned accuracy
        bins = [(0, 5), (5, 10), (10, 20), (20, 100)]
        for lo, hi in bins:
            bin_ = [(e, o) for e, o in valid if lo <= abs(e) < hi]
            if bin_:
                bin_correct = sum(1 for e, o in bin_ if (e > 0 and o.pm_moved_up) or (e < 0 and not o.pm_moved_up))
                print(f"    Edge {lo}-{hi}pt: {bin_correct}/{len(bin_)} correct ({bin_correct/len(bin_)*100:.1f}%)")

    variant_stats(results, "closest_strike_edge", "A) CLOSEST-STRIKE (current)")
    variant_stats(results, "atm_edge", "B) ATM-IV")
    variant_stats(results, "skew_adjusted_edge", "C) SKEW-ADJUSTED")

    # Correlation between model prob and PM price
    print(f"\n  --- Model probability vs PM price ---")
    for variant, attr in [("Closest-Strike", "closest_strike_touch_prob"),
                          ("ATM", "atm_touch_prob"),
                          ("Skew-Adjusted", "skew_adjusted_touch_prob")]:
        pairs = [(getattr(o, attr), o.entry_pm_yes) for o in results if getattr(o, attr) is not None]
        if len(pairs) < 5:
            continue
        errors = [abs(p - m) for p, m in pairs]
        mae = sum(errors) / len(errors)
        bias = sum(p - m for p, m in pairs) / len(errors)  # positive = model overestimates vs PM
        print(f"    {variant:20s}: MAE={mae:.3f}  bias={bias:.4f}  (model - pm)")


def main() -> None:
    parser = argparse.ArgumentParser(description="IV Model Variant Backtest")
    parser.add_argument("--history-dir", type=Path, default=HISTORY_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--hold-days", type=float, default=7.0)
    args = parser.parse_args()

    snapshots = read_history(args.history_dir)
    print(f"Read {len(snapshots)} archive timestamps")
    results = backtest(snapshots, args.hold_days)
    print(f"Generated {len(results)} matched entry/exit pairs")

    with args.out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(FIELDNAMES)
        for r in results:
            writer.writerow(r.row())

    print(f"Wrote {args.out}")
    print_summary(results)


if __name__ == "__main__":
    main()
