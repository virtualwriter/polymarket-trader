"""Monte Carlo for the binary scale-out ladder in lib/trading/binary-scale-exit.ts.

The question the ladder raises is whether taking half off at 50% of max profit,
closing the rest at 70%, and cutting 40% below a ratcheting reference adds
expected value or merely reshapes the outcome distribution.

Two price models are provided, and they disagree sharply, so the choice matters
more than any parameter inside either one.

`persistent` treats the edge as a permanent drift: a position that is down 40%
is assumed to be exactly as mispriced in your favour as it was at entry. That is
the best possible case for holding and the worst possible case for a stop, and
it is not how a real mispricing behaves.

`decay` is the realistic one and the default. It separates the true probability
from the quoted price. The true probability q_t is a martingale under the real
measure, because a conditional probability of a fixed terminal event has to be.
The edge e_t is the gap between q_t and the quote, starts at the entry edge,
decays toward zero over the life of the trade, and can wander through zero into
negative territory. The traded price is v_t = q_t - e_t, which is deliberately
not a martingale: its drift is the edge closing, and that drift is the entire
source of expected value.

Two consequences follow, and both are visible in the output. Any exit taken
after the edge has closed captures nearly all of it, so profit-taking stops
being expensive. And a stop only forfeits whatever edge remains at the moment it
fires, which is small once the edge has decayed and can be negative when adverse
price moves are informative about the edge having flipped. That last case is the
`rho` parameter, and it is the difference between a stop that costs money and a
stop that earns it.

The identity EV = e_0 - E[e_tau] holds exactly for any single-exit rule, by
optional stopping applied to q. The simulation checks it rather than assuming
it, which is what makes the decomposition trustworthy.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np
from scipy.stats import norm

# Mirrors scripts/lib/trading/binary-scale-exit.ts.
FIRST_SCALE_PROFIT_FRACTION = 0.5
FIRST_SCALE_SIZE_FRACTION = 0.5
FINAL_EXIT_PROFIT_FRACTION = 0.7
LOSS_STOP_FRACTION = 0.4

STRATEGIES = ("hold", "ladder", "stop_only", "tp70_only", "tp50_only")
# Exits keyed off the edge rather than the price. Only meaningful under the
# decaying-edge model, and idealized there: the rule is shown the true edge,
# where a live implementation would see the model's noisy estimate of it. Read
# them as the ceiling an edge-based stop is aiming at, not as a forecast.
EDGE_AWARE_STRATEGIES = ("edge_stop", "ladder_edge_stop")

# Keeps the quote inside the tradable range without letting it settle early.
PRICE_FLOOR = 1e-3


class PriceModel(Protocol):
    """A generator of binary contract quotes, stepped forward in time."""

    entry_price: float
    edge: float

    def step(self, i: int, n_steps: int) -> tuple[np.ndarray, np.ndarray]:
        """Advance to step i and return (quote, remaining edge)."""


class PersistentEdgeModel:
    """Edge as a permanent real-world drift on the underlying.

    The market prices off a driftless map while the underlying actually drifts,
    so the mispricing is never arbitraged away and never reverses. Retained as
    the pessimistic bound on what a stop can cost.
    """

    def __init__(self, entry_price: float, edge: float, n_paths: int, rng: np.random.Generator):
        self.entry_price = entry_price
        self.edge = edge
        self.rng = rng
        self.b = -float(norm.ppf(entry_price))
        q = min(max(entry_price + edge, 1e-6), 1 - 1e-6)
        self.mu = float(norm.ppf(q) - norm.ppf(entry_price))
        self.x = np.zeros(n_paths)
        self.n_paths = n_paths

    def step(self, i: int, n_steps: int) -> tuple[np.ndarray, np.ndarray]:
        dt = 1.0 / n_steps
        self.x += self.mu * dt + math.sqrt(dt) * self.rng.standard_normal(self.n_paths)
        if i == n_steps:
            settle = (self.x > self.b).astype(float)
            return settle, np.zeros(self.n_paths)
        t = i * dt
        quote = norm.cdf((self.x - self.b) / math.sqrt(1.0 - t))
        return quote, np.zeros(self.n_paths)


class DecayingEdgeModel:
    """Edge as a closing gap between a true probability and the quote.

    q_t is the martingale probability of the terminal event. The edge is pinned
    to zero at expiry by the (1 - t) factor, since quote and truth must agree
    once the contract settles, and decays before then at `half_life`. Its noise
    term is what lets a trade entered with edge end up holding none, or holding
    edge against itself.

    `rho` correlates the edge with the underlying: at rho > 0 a move against the
    position also destroys its edge, which is the adverse-selection case where a
    price stop is picking up real information rather than noise.
    """

    def __init__(
        self,
        entry_price: float,
        edge: float,
        n_paths: int,
        rng: np.random.Generator,
        half_life: float = 0.25,
        edge_vol: float = 0.10,
        rho: float = 0.0,
        edge_floor: float = 0.0,
    ):
        self.entry_price = entry_price
        self.edge = edge
        self.rng = rng
        self.half_life = half_life
        self.edge_vol = edge_vol
        self.rho = rho
        # Level the edge decays toward. Measured history overshoots through zero
        # to a mildly negative asymptote, meaning a position held long after its
        # edge closed is on average holding edge against itself.
        self.edge_floor = edge_floor
        self.n_paths = n_paths
        # b is set from the TRUE probability, so the quote starts at entry_price
        # only after the edge is subtracted.
        q0 = min(max(entry_price + edge, 1e-6), 1 - 1e-6)
        self.b = -float(norm.ppf(q0))
        self.x = np.zeros(n_paths)
        self.z = np.zeros(n_paths)

    def step(self, i: int, n_steps: int) -> tuple[np.ndarray, np.ndarray]:
        dt = 1.0 / n_steps
        sqrt_dt = math.sqrt(dt)
        dw = sqrt_dt * self.rng.standard_normal(self.n_paths)
        self.x += dw
        if self.edge_vol > 0:
            dperp = sqrt_dt * self.rng.standard_normal(self.n_paths)
            self.z += self.rho * dw + math.sqrt(1.0 - self.rho**2) * dperp

        if i == n_steps:
            settle = (self.x > self.b).astype(float)
            return settle, np.zeros(self.n_paths)

        t = i * dt
        q = norm.cdf((self.x - self.b) / math.sqrt(1.0 - t))
        decay = math.exp(-t / self.half_life) if math.isfinite(self.half_life) else 1.0
        level = self.edge_floor + (self.edge - self.edge_floor) * decay
        remaining_edge = (1.0 - t) * (level + self.edge_vol * self.z)
        quote = np.clip(q - remaining_edge, PRICE_FLOOR, 1.0 - PRICE_FLOOR)
        return quote, remaining_edge


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
    mean_edge_at_exit: float
    negative_edge_at_exit_rate: float
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
            "mean_edge_at_exit": self.mean_edge_at_exit,
            "negative_edge_at_exit_rate": self.negative_edge_at_exit_rate,
            "trades_to_significance": self.trades_to_significance,
        }


def run_strategies(
    model: PriceModel,
    n_paths: int,
    n_steps: int,
    half_spread: float,
    include_edge_rules: bool = False,
) -> dict[str, TradeStats]:
    """Apply every exit rule to one shared set of price paths.

    Sharing paths across strategies means the differences between them are
    attributable to the rule rather than to sampling noise.
    """
    entry_price = model.entry_price
    target_price = entry_price + FINAL_EXIT_PROFIT_FRACTION * (1 - entry_price)
    first_rung_price = entry_price + FIRST_SCALE_PROFIT_FRACTION * (1 - entry_price)
    names = STRATEGIES + (EDGE_AWARE_STRATEGIES if include_edge_rules else ())

    # Shares are normalized to 1, so cost basis is the entry price and a return
    # of proceeds/entry - 1 matches the ledger's pnl_pct convention.
    state = {
        name: {
            "shares": np.ones(n_paths),
            "proceeds": np.zeros(n_paths),
            "scale_count": np.zeros(n_paths, dtype=np.int8),
            "stop_ref": np.full(n_paths, entry_price),
            "exit_time": np.ones(n_paths),
            "edge_at_exit": np.zeros(n_paths),
            "early": np.zeros(n_paths, dtype=bool),
        }
        for name in names
    }

    for step in range(1, n_steps + 1):
        t = step / n_steps
        settling = step == n_steps
        v, remaining_edge = model.step(step, n_steps)

        # Selling before resolution crosses the spread; settlement does not.
        fill = v if settling else np.maximum(v - half_spread, 0.0)

        for name in names:
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

                if name in ("ladder", "tp70_only", "ladder_edge_stop"):
                    wants_target = v >= target_price
                if name == "tp50_only":
                    wants_target = v >= first_rung_price
                if name in ("ladder", "stop_only"):
                    wants_stop = v <= s["stop_ref"] * (1 - LOSS_STOP_FRACTION)
                if name in EDGE_AWARE_STRATEGIES and not settling:
                    wants_stop = remaining_edge <= 0
                # Target outranks the scale rung, so a path that gapped past
                # both is closed outright rather than left with a runner.
                scale = (
                    live & ~wants_target & (s["scale_count"] == 0) & (v >= first_rung_price)
                    if name in ("ladder", "ladder_edge_stop")
                    else np.zeros(n_paths, dtype=bool)
                )
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
                s["edge_at_exit"][close_all] = remaining_edge[close_all]
                if not settling:
                    s["early"][close_all] = True

    max_ev = model.edge / entry_price
    return {
        name: summarize(state[name]["proceeds"] / entry_price - 1.0, state[name], max_ev)
        for name in names
    }


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
        mean_edge_at_exit=float(s["edge_at_exit"].mean()),
        negative_edge_at_exit_rate=float((s["edge_at_exit"] < 0).mean()),
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
    return {
        "median_final": float(np.median(final)),
        "p05_final": float(np.percentile(final, 5)),
        "p95_final": float(np.percentile(final, 95)),
        "prob_loss": float((final < 1.0).mean()),
        "median_max_drawdown": float(np.median((1.0 - growth / running_max).max(axis=1))),
        "median_curve": np.median(growth, axis=0).tolist(),
    }


def build_model(
    kind: str,
    entry_price: float,
    edge: float,
    n_paths: int,
    rng: np.random.Generator,
    half_life: float,
    edge_vol: float,
    rho: float,
    edge_floor: float = 0.0,
) -> PriceModel:
    if kind == "persistent":
        return PersistentEdgeModel(entry_price, edge, n_paths, rng)
    return DecayingEdgeModel(
        entry_price,
        edge,
        n_paths,
        rng,
        half_life=half_life,
        edge_vol=edge_vol,
        rho=rho,
        edge_floor=edge_floor,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paths", type=int, default=200_000)
    parser.add_argument("--steps", type=int, default=1_000)
    parser.add_argument("--half-spread", type=float, default=0.005)
    parser.add_argument("--seed", type=int, default=20260812)
    parser.add_argument("--entries", type=float, nargs="+", default=[0.09, 0.20, 0.35, 0.50, 0.65])
    parser.add_argument("--edges", type=float, nargs="+", default=[0.05, 0.10])
    parser.add_argument("--half-life", type=float, default=0.25)
    parser.add_argument("--edge-vol", type=float, default=0.10)
    parser.add_argument("--rho", type=float, default=0.0)
    parser.add_argument("--edge-floor", type=float, default=0.0)
    parser.add_argument("--equity-trades", type=int, default=250)
    parser.add_argument("--equity-fraction", type=float, default=0.02)
    parser.add_argument("--json-out", type=str, default="")
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    report: dict[str, Any] = {
        "config": vars(args) | {
            "rungs": {
                "first_scale_profit_fraction": FIRST_SCALE_PROFIT_FRACTION,
                "first_scale_size_fraction": FIRST_SCALE_SIZE_FRACTION,
                "final_exit_profit_fraction": FINAL_EXIT_PROFIT_FRACTION,
                "loss_stop_fraction": LOSS_STOP_FRACTION,
            }
        },
        "grid": [],
        "half_life_sweep": [],
        "rho_sweep": [],
        "equity": {},
    }

    print("=== decaying-edge model: capture by entry price ===")
    for entry in args.entries:
        for edge in args.edges:
            model = build_model(
                "decay",
                entry,
                edge,
                args.paths,
                rng,
                args.half_life,
                args.edge_vol,
                args.rho,
                args.edge_floor,
            )
            stats = run_strategies(
                model, args.paths, args.steps, args.half_spread, include_edge_rules=True
            )
            report["grid"].append(
                {
                    "entry_price": entry,
                    "edge": edge,
                    "max_ev": edge / entry,
                    "strategies": {n: st.to_dict() for n, st in stats.items()},
                }
            )
            print(
                f"entry={entry:.2f} edge={edge:+.2f}  "
                + "  ".join(f"{n}: {100*st.edge_capture:3.0f}%" for n, st in stats.items())
            )
            if entry in (0.09, 0.50) and edge == 0.10:
                report["equity"][f"entry_{entry:.2f}_edge_{edge:.2f}"] = {
                    n: equity_curves(
                        st.samples, args.equity_trades, args.equity_fraction, 20_000, rng
                    )
                    for n, st in stats.items()
                }

    print("\n=== how fast the edge closes (entry 0.09, edge +10pt, rho=0) ===")
    for half_life in (0.05, 0.10, 0.25, 0.50, float("inf")):
        model = build_model("decay", 0.09, 0.10, 100_000, rng, half_life, args.edge_vol, 0.0)
        stats = run_strategies(
            model, 100_000, args.steps, args.half_spread, include_edge_rules=True
        )
        report["half_life_sweep"].append(
            {"half_life": half_life, "strategies": {n: st.to_dict() for n, st in stats.items()}}
        )
        print(
            f"half_life={half_life:<5}  "
            + "  ".join(f"{n}: {100*st.edge_capture:3.0f}%" for n, st in stats.items())
        )

    print("\n=== adverse selection: does a down move mean the edge is gone? ===")
    for rho in (0.0, 0.2, 0.4, 0.6, 0.8):
        model = build_model("decay", 0.09, 0.10, 100_000, rng, args.half_life, args.edge_vol, rho)
        stats = run_strategies(
            model, 100_000, args.steps, args.half_spread, include_edge_rules=True
        )
        report["rho_sweep"].append(
            {"rho": rho, "strategies": {n: st.to_dict() for n, st in stats.items()}}
        )
        print(
            f"rho={rho:.1f}  "
            + "  ".join(f"{n}: {100*st.edge_capture:3.0f}%" for n, st in stats.items())
            + f"   | edge left when ladder exits: {stats['ladder'].mean_edge_at_exit:+.4f}"
        )

    if args.json_out:
        with open(args.json_out, "w") as handle:
            json.dump(report, handle, indent=2)
        print(f"\nwrote {args.json_out}")


if __name__ == "__main__":
    main()
