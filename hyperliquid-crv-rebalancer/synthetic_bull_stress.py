#!/usr/bin/env python3
"""
Synthetic 12-month regime-switching stress test.

Goal: generate price series where a SHARED bull/bear hidden Markov regime
drives all 13 coins jointly, with multi-week bull dwell times, calibrated
so the cross-coin bull signal (>=10/13 coins above 50h EMA, sustained 24h)
fires ~40% and ~50% of bars respectively. Then run:

  - Hybrid live config       (S 4/0.30/1.50, L 5/1.0/1.0, thr=10)
  - Short-only same short    (S 4/0.30/1.50)

at 1x and 5x leverage, and report per-strategy outcomes plus per-bull-
stretch behavior. Multiple Monte Carlo seeds so we get a distribution
rather than a single realization.

Outputs:
  - synthetic_bull_stress.json    full results
  - synthetic_bull_stress.csv     one row per seed per (scenario, strategy)
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import statistics
from datetime import datetime, timezone
from pathlib import Path

from fee_aware_hybrid_grid import (
    BASE_DIR, REGIME_EMA, SIGNAL_LOOKBACK_HOURS,
    discover_coins, load_data, compute_ema, build_signal_mask,
    backtest_hybrid, sharpe, max_drawdown, INITIAL_CAPITAL,
)
from short_vs_hybrid_5x import backtest_short_only


# ---------------------------------------------------------------------------
# Empirical calibration from real coin history
# ---------------------------------------------------------------------------
def empirical_hourly_stats(prices: list[float]) -> tuple[float, float]:
    """Mean and stdev of hourly log returns (drift, vol)."""
    rets = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0 and prices[i] > 0:
            rets.append(math.log(prices[i] / prices[i - 1]))
    if len(rets) < 2:
        return 0.0, 0.01
    return statistics.mean(rets), statistics.stdev(rets)


# ---------------------------------------------------------------------------
# Regime-switching generator
# ---------------------------------------------------------------------------
def generate_regime_series(n_hours: int, target_bull_pct: float,
                           bull_dwell_hours: int, rng: random.Random) -> list[bool]:
    """Two-state Markov chain shared across all coins.

    target_bull_pct sets the stationary bull share. bull_dwell_hours sets
    the average bull run length; bear dwell solves for the requested mix.
    bear_dwell = bull_dwell * (1 - p) / p
    """
    p = target_bull_pct
    bear_dwell = bull_dwell_hours * (1 - p) / p
    p_stay_bull = 1.0 - 1.0 / bull_dwell_hours
    p_stay_bear = 1.0 - 1.0 / bear_dwell
    state_bull = rng.random() < p
    regime = []
    for _ in range(n_hours):
        regime.append(state_bull)
        if state_bull:
            if rng.random() > p_stay_bull:
                state_bull = False
        else:
            if rng.random() > p_stay_bear:
                state_bull = True
    return regime


def generate_synthetic_prices(regime: list[bool], drift: float, vol: float,
                              bull_drift_add: float, bear_drift_add: float,
                              start_price: float, rng: random.Random) -> list[float]:
    """Generate a price series conditioned on the shared regime.

    Each coin keeps its empirical baseline drift/vol; the regime adds a
    drift offset (positive in bull, slightly negative in bear) to make the
    bull signal correlated to the regime.
    """
    price = start_price
    out = [price]
    for is_bull in regime[1:]:
        mu = drift + (bull_drift_add if is_bull else bear_drift_add)
        ret = rng.gauss(mu, vol)
        price = price * math.exp(ret)
        if price < 1e-9:
            price = 1e-9
        out.append(price)
    return out


# ---------------------------------------------------------------------------
# Strategy runners (operating on synthetic coin dict)
# ---------------------------------------------------------------------------
def run_hybrid_config(coin_prices: dict, mask: list[bool], lev: float,
                      fee: float, s_ema: int, s_in: float, s_out: float,
                      l_ema: int, l_in: float, l_out: float) -> dict:
    per_coin = {}
    for coin, prices in coin_prices.items():
        r = backtest_hybrid(prices, mask, s_ema, s_in, s_out,
                            l_ema, l_in, l_out, fee, lev)
        per_coin[coin] = r
    rets = [r["return_pct"] for r in per_coin.values()]
    return {
        "avg_ret": sum(rets) / len(rets),
        "median_ret": statistics.median(rets),
        "neg_coins": sum(1 for r in rets if r < 0),
        "total_liqs": sum(r["liquidations"] for r in per_coin.values()),
        "avg_trades": sum(r["trades"] for r in per_coin.values()) / len(per_coin),
        "avg_sharpe": sum(sharpe(r["equity"]) for r in per_coin.values()) / len(per_coin),
        "avg_mdd": sum(max_drawdown(r["equity"]) for r in per_coin.values()) / len(per_coin),
        "per_coin_ret": {c: r["return_pct"] for c, r in per_coin.items()},
    }


def run_short_only(coin_prices: dict, lev: float, fee: float,
                   s_ema: int, s_in: float, s_out: float) -> dict:
    per_coin = {}
    for coin, prices in coin_prices.items():
        r = backtest_short_only(prices, s_ema, s_in, s_out, fee, lev)
        per_coin[coin] = r
    rets = [r["return_pct"] for r in per_coin.values()]
    return {
        "avg_ret": sum(rets) / len(rets),
        "median_ret": statistics.median(rets),
        "neg_coins": sum(1 for r in rets if r < 0),
        "total_liqs": sum(r["liquidations"] for r in per_coin.values()),
        "avg_trades": sum(r["trades"] for r in per_coin.values()) / len(per_coin),
        "avg_sharpe": sum(sharpe(r["equity"]) for r in per_coin.values()) / len(per_coin),
        "avg_mdd": sum(max_drawdown(r["equity"]) for r in per_coin.values()) / len(per_coin),
        "per_coin_ret": {c: r["return_pct"] for c, r in per_coin.items()},
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", type=int, default=20,
                        help="Monte Carlo seeds per scenario (default 20).")
    parser.add_argument("--hours", type=int, default=8760,
                        help="Simulated horizon in hours (default 8760 = 1y).")
    parser.add_argument("--bull-dwell", type=int, default=720,
                        help="Avg bull-regime dwell in hours (default 720 = 30d).")
    parser.add_argument("--fee", type=float, default=0.045)
    args = parser.parse_args()

    # Calibrate per-coin vol from real history but ZERO the baseline drift —
    # we want the regime to be the only directional driver, otherwise individual
    # coin-level drift biases the result. Vol is also dampened to 50% of
    # empirical (~50% annualized vs ~100% empirical) because empirical vol
    # bakes in the realized regime shifts that we're now modeling explicitly.
    coins = discover_coins()
    base_stats = {}
    base_start = {}
    for coin in coins:
        prices = load_data(coin)
        if not prices:
            continue
        _, sigma = empirical_hourly_stats(prices)
        base_stats[coin] = (0.0, sigma * 0.5)
        base_start[coin] = prices[-1]
    print(f"Calibrated {len(base_stats)} coins (drift zeroed, vol halved)")
    avg_sigma = statistics.mean(s for _, s in base_stats.values())
    print(f"Avg hourly vol used: {avg_sigma*100:.3f}% "
          f"(~{avg_sigma*math.sqrt(8760)*100:.0f}% annualized)")

    # Regime drift offsets calibrated so signal-to-noise per coin is high
    # enough that the bull signal (10/13 coins above 50h EMA, sustained 24h)
    # actually fires inside bull dwells:
    #   bull: +0.12%/hr ≈ +180% pure-drift annualized
    #   bear: -0.04%/hr ≈  -29% pure-drift annualized
    # vs avg hourly vol ~0.5%, so signal-to-noise on 50h EMA is ~50*0.12/0.5
    # = ~12 stdevs — bull regime cleanly pushes coins above their 50h EMA.
    bull_drift_add = 0.0012
    bear_drift_add = -0.0004

    # Live hybrid params (which are also Sharpe-optimal at 5x).
    HYBRID = dict(s_ema=4, s_in=0.30, s_out=1.50,
                  l_ema=5, l_in=1.00, l_out=1.00)
    SHORT_ONLY_SAME_SHORT = dict(s_ema=4, s_in=0.30, s_out=1.50)
    SIG_THR = 10

    scenarios = [
        {"name": "bull_40pct", "target_bull": 0.40},
        {"name": "bull_50pct", "target_bull": 0.50},
    ]
    leverages = [1.0, 5.0]

    all_rows = []
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_seeds": args.seeds,
        "n_hours": args.hours,
        "bull_dwell_hours": args.bull_dwell,
        "fee_pct": args.fee,
        "hybrid_params": HYBRID,
        "signal_threshold": SIG_THR,
        "bull_drift_add_per_hour": bull_drift_add,
        "bear_drift_add_per_hour": bear_drift_add,
        "scenarios": {},
    }

    for scenario in scenarios:
        print(f"\n{'='*100}")
        print(f"SCENARIO: {scenario['name']}  (target bull = {scenario['target_bull']*100:.0f}%)")
        print(f"{'='*100}")
        seed_results = {f"hybrid_1x": [], f"hybrid_5x": [],
                        f"short_only_1x": [], f"short_only_5x": []}
        bull_realized_pcts = []
        signal_realized_pcts = []

        for seed in range(args.seeds):
            rng = random.Random(seed * 7919 + hash(scenario["name"]) % 99991)
            regime = generate_regime_series(args.hours, scenario["target_bull"],
                                            args.bull_dwell, rng)
            bull_realized = sum(regime) / len(regime)
            bull_realized_pcts.append(bull_realized)

            # Generate per-coin synthetic prices.
            coin_prices = {}
            for coin, (mu, sigma) in base_stats.items():
                # Each coin uses its own RNG stream for variety but driven by
                # the same shared regime.
                coin_rng = random.Random(rng.randint(0, 2**31))
                coin_prices[coin] = generate_synthetic_prices(
                    regime, mu, sigma, bull_drift_add, bear_drift_add,
                    base_start[coin], coin_rng,
                )

            # Build bull mask off the synthetic data.
            mask = build_signal_mask(coin_prices, SIG_THR)
            signal_realized_pcts.append(sum(mask) / len(mask))

            for lev in leverages:
                h = run_hybrid_config(coin_prices, mask, lev, args.fee, **HYBRID)
                s = run_short_only(coin_prices, lev, args.fee, **SHORT_ONLY_SAME_SHORT)
                seed_results[f"hybrid_{int(lev)}x"].append(h)
                seed_results[f"short_only_{int(lev)}x"].append(s)
                for typ, res in (("hybrid", h), ("short_only", s)):
                    all_rows.append({
                        "scenario": scenario["name"], "seed": seed, "lev": lev,
                        "strategy": typ,
                        "bull_realized": round(bull_realized, 4),
                        "signal_realized": round(signal_realized_pcts[-1], 4),
                        "avg_ret_pct": round(res["avg_ret"], 2),
                        "median_ret_pct": round(res["median_ret"], 2),
                        "neg_coins": res["neg_coins"],
                        "avg_sharpe": round(res["avg_sharpe"], 3),
                        "avg_mdd_pct": round(res["avg_mdd"], 2),
                        "total_liqs": res["total_liqs"],
                        "avg_trades": round(res["avg_trades"], 1),
                    })

            if (seed + 1) % 5 == 0:
                print(f"  seed {seed+1}/{args.seeds} done")

        # Aggregate
        print(f"\nRealized regime: avg bull share {statistics.mean(bull_realized_pcts)*100:.1f}% "
              f"(target {scenario['target_bull']*100:.0f}%), "
              f"avg signal-fire {statistics.mean(signal_realized_pcts)*100:.1f}%")
        print()
        print(f"{'Strategy':>16}  {'Lev':>4}  {'AvgRet (mean)':>15}  {'AvgRet (p10/p90)':>22}  "
              f"{'Sharpe':>7}  {'MDD':>7}  {'NegCoins':>10}  {'Liqs':>5}")
        print("-" * 110)

        scenario_summary = {}
        for key, runs in seed_results.items():
            mean_ret = statistics.mean(r["avg_ret"] for r in runs)
            rets_sorted = sorted(r["avg_ret"] for r in runs)
            p10 = rets_sorted[max(0, int(len(rets_sorted) * 0.1) - 1)]
            p90 = rets_sorted[min(len(rets_sorted) - 1, int(len(rets_sorted) * 0.9))]
            mean_sharpe = statistics.mean(r["avg_sharpe"] for r in runs)
            mean_mdd = statistics.mean(r["avg_mdd"] for r in runs)
            mean_neg = statistics.mean(r["neg_coins"] for r in runs)
            total_liqs = sum(r["total_liqs"] for r in runs)
            strat, lev = key.rsplit("_", 1)
            print(f"{strat:>16}  {lev:>4}  {mean_ret:>+14.1f}%  "
                  f"({p10:>+8.1f}% / {p90:>+8.1f}%)  "
                  f"{mean_sharpe:>6.2f}  {mean_mdd:>6.1f}%  "
                  f"{mean_neg:>9.1f}/13  {total_liqs:>5}")
            scenario_summary[key] = {
                "mean_ret": mean_ret, "p10_ret": p10, "p90_ret": p90,
                "mean_sharpe": mean_sharpe, "mean_mdd": mean_mdd,
                "mean_neg_coins": mean_neg, "total_liqs_across_seeds": total_liqs,
            }

        # Hybrid savings vs short-only at each leverage.
        print()
        for lev in leverages:
            h = scenario_summary[f"hybrid_{int(lev)}x"]
            s = scenario_summary[f"short_only_{int(lev)}x"]
            diff = h["mean_ret"] - s["mean_ret"]
            print(f"  Hybrid SAVINGS over short-only at {int(lev)}x: "
                  f"{diff:+.1f}pt mean return  "
                  f"(hybrid Sharpe {h['mean_sharpe']:.2f} vs short Sharpe {s['mean_sharpe']:.2f}, "
                  f"hybrid liqs {h['total_liqs_across_seeds']} vs short liqs {s['total_liqs_across_seeds']})")

        summary["scenarios"][scenario["name"]] = {
            "target_bull_pct": scenario["target_bull"],
            "realized_bull_avg": statistics.mean(bull_realized_pcts),
            "realized_signal_avg": statistics.mean(signal_realized_pcts),
            "by_strategy": scenario_summary,
        }

    # Persist
    csv_path = BASE_DIR / "synthetic_bull_stress.csv"
    with open(csv_path, "w", newline="") as f:
        fieldnames = list(all_rows[0].keys())
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in all_rows:
            w.writerow(row)
    json_path = BASE_DIR / "synthetic_bull_stress.json"
    json_path.write_text(json.dumps(summary, indent=2))
    print(f"\nSaved {len(all_rows)} rows to {csv_path.name}")
    print(f"Saved scenario summaries to {json_path.name}")


if __name__ == "__main__":
    main()
