"""Monte Carlo for the binary scale-out ladder in lib/trading/binary-scale-exit.ts.

The question the ladder raises is whether taking half off at 50% of max profit,
closing the rest at 70%, and cutting 40% below a ratcheting reference adds
expected value or merely reshapes the outcome distribution.

Model. A binary that settles at 0 or 1 has a price that is already a probability,
so its path is pinned at both ends: it starts at the entry price and must arrive
at 0 or 1. Writing the terminal event as {X_T > b} for a Brownian X gives

    v_t = Phi((X_t - b) / sqrt(T - t)),

which is the unique driftless price consistent with those endpoints. There is no
free volatility knob: the entry price fixes b, and vol only rescales time, which
a pure price-trigger rule like the ladder cannot see. That leaves exactly two
structural inputs, entry price and edge, plus monitoring frequency.

Edge enters as a real-world drift mu on X while the market keeps pricing off the
driftless map. mu = Phi^-1(q) - Phi^-1(v0) makes the true win probability q while
the quoted entry stays v0, so the position is mispriced by q - v0 at entry and
that mispricing is realized gradually rather than by fiat.

Monitoring frequency is the gap-risk dial. Exits fill at the next observed price,
not at the trigger, so coarse monitoring reproduces the case where a stop is
jumped rather than touched. That is the honest way to model gaps here: adding
jumps to X directly would destroy the martingale property and manufacture drift
that the pricing map would then misattribute to edge.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy.stats import norm

# Mirrors scripts/lib/trading/binary-scale-exit.ts.
FIRST_SCALE_PROFIT_FRACTION = 0.5
FIRST_SCALE_SIZE_FRACTION = 0.5
FINAL_EXIT_PROFIT_FRACTION = 0.7
LOSS_STOP_FRACTION = 0.4

STRATEGIES = ("hold", "ladder", "stop_only", "tp70_only", "tp50_only")


@dataclass
class TradeStats:
    """Per-trade outcome distribution for one strategy."""

    mean: float
    std: float
    median: float
    win_rate: float
    p05: float
    p95: float
    edge_capture: float
    early_exit_rate: float
    mean_exit_time: float
    trades_to_significance: float | None
    samples: np.ndarray = field(repr=False, default_factory=lambda: np.empty(0))

    def to_dict(self) -> dict[str, Any]:
        return {
            "mean": self.mean,
            "std": self.std,
            "median": self.median,
            "win_rate": self.win_rate,
            "p05": self.p05,
            "p95": self.p95,
            "edge_capture": self.edge_capture,
            "early_exit_rate": self.early_exit_rate,
            "mean_exit_time": self.mean_exit_time,
            "trades_to_significance": self.trades_to_significance,
        }


def drift_for_edge(entry_price: float, edge: float) -> float:
    """Real-world drift making the true win probability entry_price + edge."""
    q = min(max(entry_price + edge, 1e-6), 1 - 1e-6)
    return float(norm.ppf(q) - norm.ppf(entry_price))


def simulate_paths(
    entry_price: float,
    edge: float,
    n_paths: int,
    n_steps: int,
    half_spread: float,
    rng: np.random.Generator,
) -> dict[str, TradeStats]:
    """Return per-trade return samples for every strategy on shared price paths.

    Every strategy sees the identical set of paths so differences between them
    are attributable to the exit rule rather than to sampling noise.
    """
    b = float(norm.ppf(entry_price)) * -1.0
    mu = drift_for_edge(entry_price, edge)
    dt = 1.0 / n_steps
    sqrt_dt = np.sqrt(dt)

    x = np.zeros(n_paths)
    # Shares are normalized to 1, so cost basis is the entry price and a return
    # of proceeds/entry - 1 matches the ledger's pnl_pct convention.
    state = {
        name: {
            "shares": np.ones(n_paths),
            "proceeds": np.zeros(n_paths),
            "scale_count": np.zeros(n_paths, dtype=np.int8),
            "stop_ref": np.full(n_paths, entry_price),
            "exit_time": np.ones(n_paths),
            "early": np.zeros(n_paths, dtype=bool),
        }
        for name in STRATEGIES
    }

    target_price = entry_price + FINAL_EXIT_PROFIT_FRACTION * (1 - entry_price)
    first_rung_price = entry_price + FIRST_SCALE_PROFIT_FRACTION * (1 - entry_price)

    for step in range(1, n_steps + 1):
        t = step * dt
        x += mu * dt + sqrt_dt * rng.standard_normal(n_paths)
        settling = step == n_steps
        if settling:
            v = (x > b).astype(float)
        else:
            v = norm.cdf((x - b) / np.sqrt(1.0 - t))

        # Selling before resolution crosses the spread; settlement does not.
        fill = v if settling else np.maximum(v - half_spread, 0.0)

        for name in STRATEGIES:
            s = state[name]
            live = s["shares"] > 0
            if not live.any():
                continue

            if name == "hold":
                close_all = live & settling
                scale = np.zeros(n_paths, dtype=bool)
            else:
                wants_target = np.zeros(n_paths, dtype=bool)
                wants_stop = np.zeros(n_paths, dtype=bool)
                scale = np.zeros(n_paths, dtype=bool)

                if name in ("ladder", "tp70_only"):
                    wants_target = v >= target_price
                if name == "tp50_only":
                    wants_target = v >= first_rung_price
                if name in ("ladder", "stop_only"):
                    wants_stop = v <= s["stop_ref"] * (1 - LOSS_STOP_FRACTION)
                if name == "ladder":
                    # Target outranks the scale rung, so a path that gapped past
                    # both is closed outright rather than left with a runner.
                    scale = live & ~wants_target & (s["scale_count"] == 0) & (v >= first_rung_price)

                close_all = live & (wants_target | (wants_stop & ~scale) | settling)

            if scale.any():
                sold = s["shares"][scale] * FIRST_SCALE_SIZE_FRACTION
                s["proceeds"][scale] += sold * fill[scale]
                s["shares"][scale] -= sold
                s["scale_count"][scale] = 1
                s["stop_ref"][scale] = v[scale]

            if close_all.any():
                s["proceeds"][close_all] += s["shares"][close_all] * fill[close_all]
                s["shares"][close_all] = 0.0
                s["exit_time"][close_all] = t
                if not settling:
                    s["early"][close_all] = True

    results: dict[str, TradeStats] = {}
    max_ev = edge / entry_price
    for name in STRATEGIES:
        s = state[name]
        returns = s["proceeds"] / entry_price - 1.0
        results[name] = summarize(returns, s, max_ev)
    return results


def trades_for_significance(returns: np.ndarray, alpha_z: float = 1.96) -> float | None:
    """Trades needed before a one-sample t-test would call the mean nonzero.

    This is the practical cost of a wide outcome distribution: an edge that takes
    thousands of trades to demonstrate cannot clear a promotion gate in any
    useful timeframe, whatever its expected value.
    """
    mean = float(returns.mean())
    std = float(returns.std(ddof=1))
    if mean <= 0 or std == 0:
        return None
    return float((alpha_z * std / mean) ** 2)


def summarize(returns: np.ndarray, s: dict[str, np.ndarray], max_ev: float) -> TradeStats:
    mean = float(returns.mean())
    return TradeStats(
        mean=mean,
        std=float(returns.std(ddof=1)),
        median=float(np.median(returns)),
        win_rate=float((returns > 0).mean()),
        p05=float(np.percentile(returns, 5)),
        p95=float(np.percentile(returns, 95)),
        edge_capture=float(mean / max_ev) if max_ev > 0 else float("nan"),
        early_exit_rate=float(s["early"].mean()),
        mean_exit_time=float(s["exit_time"].mean()),
        trades_to_significance=trades_for_significance(returns),
        samples=returns,
    )


def equity_curves(
    returns: np.ndarray,
    n_trades: int,
    fraction: float,
    n_paths: int,
    rng: np.random.Generator,
) -> dict[str, Any]:
    """Bootstrap a sequence of trades at fixed fractional sizing.

    Per-trade expected value says nothing about whether a run of trades is
    survivable, which is the question a rule with a low win rate actually poses.
    """
    draws = rng.choice(returns, size=(n_paths, n_trades), replace=True)
    growth = np.cumprod(1.0 + fraction * draws, axis=1)
    final = growth[:, -1]
    running_max = np.maximum.accumulate(growth, axis=1)
    max_dd = float(np.median((1.0 - growth / running_max).max(axis=1)))
    return {
        "median_final": float(np.median(final)),
        "p05_final": float(np.percentile(final, 5)),
        "p95_final": float(np.percentile(final, 95)),
        "prob_loss": float((final < 1.0).mean()),
        "median_max_drawdown": max_dd,
        "median_curve": np.median(growth, axis=0).tolist(),
        "p05_curve": np.percentile(growth, 5, axis=0).tolist(),
        "p95_curve": np.percentile(growth, 95, axis=0).tolist(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paths", type=int, default=200_000)
    parser.add_argument("--steps", type=int, default=1_000)
    parser.add_argument("--half-spread", type=float, default=0.005)
    parser.add_argument("--seed", type=int, default=20260812)
    parser.add_argument("--entries", type=float, nargs="+", default=[0.09, 0.20, 0.35, 0.50, 0.65])
    parser.add_argument("--edges", type=float, nargs="+", default=[0.0, 0.05, 0.10])
    parser.add_argument("--equity-trades", type=int, default=250)
    parser.add_argument("--equity-fraction", type=float, default=0.02)
    parser.add_argument("--json-out", type=str, default="")
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    report: dict[str, Any] = {
        "config": {
            "paths": args.paths,
            "steps": args.steps,
            "half_spread": args.half_spread,
            "rungs": {
                "first_scale_profit_fraction": FIRST_SCALE_PROFIT_FRACTION,
                "first_scale_size_fraction": FIRST_SCALE_SIZE_FRACTION,
                "final_exit_profit_fraction": FINAL_EXIT_PROFIT_FRACTION,
                "loss_stop_fraction": LOSS_STOP_FRACTION,
            },
        },
        "grid": [],
        "monitoring": [],
        "equity": {},
    }

    for entry in args.entries:
        for edge in args.edges:
            stats = simulate_paths(entry, edge, args.paths, args.steps, args.half_spread, rng)
            cell = {
                "entry_price": entry,
                "edge": edge,
                "max_ev": edge / entry,
                "first_rung_price": entry + FIRST_SCALE_PROFIT_FRACTION * (1 - entry),
                "final_rung_price": entry + FINAL_EXIT_PROFIT_FRACTION * (1 - entry),
                "stop_price": entry * (1 - LOSS_STOP_FRACTION),
                "strategies": {name: st.to_dict() for name, st in stats.items()},
            }
            report["grid"].append(cell)
            print(
                f"entry={entry:.2f} edge={edge:+.2f}  "
                + "  ".join(
                    f"{name}: mu={st.mean:+.3f} wr={st.win_rate:.2f}"
                    for name, st in stats.items()
                )
            )

            if edge == 0.10 and entry in (0.09, 0.50):
                key = f"entry_{entry:.2f}_edge_{edge:.2f}"
                report["equity"][key] = {
                    name: equity_curves(
                        st.samples, args.equity_trades, args.equity_fraction, 20_000, rng
                    )
                    for name, st in stats.items()
                }

    # Gap risk: exits fill at the next observed price, so a coarser grid is a
    # position that was jumped rather than touched.
    for steps in (2_000, 500, 100, 25):
        stats = simulate_paths(0.09, 0.10, 100_000, steps, args.half_spread, rng)
        report["monitoring"].append(
            {
                "steps": steps,
                "entry_price": 0.09,
                "edge": 0.10,
                "strategies": {name: st.to_dict() for name, st in stats.items()},
            }
        )
        print(f"steps={steps:5d}  ladder mu={stats['ladder'].mean:+.3f}  hold mu={stats['hold'].mean:+.3f}")

    if args.json_out:
        with open(args.json_out, "w") as handle:
            json.dump(report, handle, indent=2)
        print(f"\nwrote {args.json_out}")


if __name__ == "__main__":
    main()
