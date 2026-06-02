#!/usr/bin/env python3
"""
Cooldown threshold counterfactual on the full historical backtest.

Replays the live short-leg config (EMA=4, entry=0.30%, exit=1.50%, fee=4.5bps)
over each coin's hourly CG history with the consecutive-loser cooldown overlaid
at thresholds {none, 2, 3, 4} and durations {18h, 36h}, then prints per-coin
and portfolio-level deltas. This is the empirical answer the previous chat
was missing: whether dropping the threshold from 3 to 2 helps, hurts, or is
noise across the full 11-month tape.

Cooldown rule (mirrors live bot):
  - On a short close with gross_ret <= -0.5%, increment loss_streak.
  - On gross_ret > 0, reset loss_streak to 0.
  - Closes in (-0.5%, 0] are no-ops on the streak.
  - When loss_streak >= threshold and no cooldown active, schedule cooldown
    for COOLDOWN_HOURS from the close timestamp.
  - During cooldown, new short opens are suppressed.

We use the CG hourly snapshot in *_prices_cg_range.json (the same data the
fee_aware_grid backtest consumed). The data is 5+ days stale, so this is a
historical study, not a live forecast.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import math
import statistics

BASE_DIR = Path(__file__).parent
START_DATE = datetime(2025, 6, 1, tzinfo=timezone.utc)

SHORT_EMA = 4
ENTRY_PCT = 0.30
EXIT_PCT = 1.50
FEE_PCT = 0.045
LEVERAGE = 1.0
COOLDOWN_LOSS_THRESHOLD = -0.5  # gross_ret_pct <= this => "loss"


def compute_ema(prices: list[float], period: int) -> list[float | None]:
    alpha = 2 / (period + 1)
    out: list[float | None] = []
    ema: float | None = None
    for i, p in enumerate(prices):
        if i < period - 1:
            out.append(None)
            continue
        if ema is None:
            ema = sum(prices[:period]) / period
        else:
            ema = alpha * p + (1 - alpha) * ema
        out.append(ema)
    return out


def load_data(coin: str) -> tuple[list[float], list[datetime]]:
    raw_path = BASE_DIR / f"{coin}_prices_cg_range_raw.json"
    prices_path = BASE_DIR / f"{coin}_prices_cg_range.json"
    if not raw_path.exists() or not prices_path.exists():
        return [], []
    raw = json.loads(raw_path.read_text())
    prices = json.loads(prices_path.read_text())
    n = min(len(prices), len(raw))
    prices = prices[:n]
    times = [datetime.fromtimestamp(raw[i][0] / 1000, tz=timezone.utc) for i in range(n)]
    start_idx = next((i for i, t in enumerate(times) if t >= START_DATE), 0)
    return prices[start_idx:], times[start_idx:]


def backtest_short_with_cooldown(
    prices: list[float],
    times: list[datetime],
    ema_period: int,
    entry_pct: float,
    exit_pct: float,
    fee_pct: float,
    threshold: int | None,
    cooldown_hours: int,
) -> dict:
    """Same arithmetic as fee_aware_grid.backtest_short, plus cooldown overlay.

    threshold=None means cooldown disabled (baseline)."""
    ema = compute_ema(prices, ema_period)
    capital = 10_000.0
    entry_p = None
    trades = 0
    wins = 0
    equity = []
    fee_cost_round = 2 * fee_pct / 100  # round-trip taker fees, 1x leverage
    loss_streak = 0
    cooldown_until: datetime | None = None
    suppressed_opens = 0

    for i in range(ema_period, len(prices)):
        p, e, t = prices[i], ema[i], times[i]
        if e is None:
            equity.append(capital)
            continue
        # Cooldown expiry on time march
        if cooldown_until is not None and t >= cooldown_until:
            cooldown_until = None
            loss_streak = 0

        if entry_p is None:
            if p < e * (1 - entry_pct / 100):
                if cooldown_until is not None and t < cooldown_until:
                    suppressed_opens += 1
                else:
                    entry_p = p
        else:
            if p > e * (1 + exit_pct / 100):
                gross = (entry_p / p - 1)  # 1x leverage
                net = gross - fee_cost_round
                capital = capital * (1 + net)
                gross_pct = gross * 100
                if net > 0:
                    wins += 1
                trades += 1
                if threshold is not None:
                    if gross_pct <= COOLDOWN_LOSS_THRESHOLD:
                        loss_streak += 1
                        if loss_streak >= threshold and cooldown_until is None:
                            cooldown_until = t + timedelta(hours=cooldown_hours)
                    elif gross_pct > 0:
                        loss_streak = 0
                        cooldown_until = None
                entry_p = None
        equity.append(capital)

    if entry_p is not None and prices:
        gross = (entry_p / prices[-1] - 1)
        net = gross - fee_cost_round
        capital = capital * (1 + net)
        if net > 0:
            wins += 1
        trades += 1
        if equity:
            equity[-1] = capital

    rets = []
    for i in range(1, len(equity)):
        if equity[i - 1] > 0:
            rets.append(equity[i] / equity[i - 1] - 1)
    sharpe = 0.0
    if len(rets) > 1:
        m = statistics.mean(rets)
        sd = statistics.stdev(rets)
        if sd > 0:
            sharpe = (m / sd) * math.sqrt(24 * 365)
    peak = -math.inf
    mdd = 0.0
    for v in equity:
        if v > peak:
            peak = v
        if peak > 0 and (peak - v) / peak > mdd:
            mdd = (peak - v) / peak

    return {
        "return_pct": (capital / 10_000 - 1) * 100,
        "trades": trades,
        "wins": wins,
        "wr_pct": (wins / trades * 100) if trades else 0.0,
        "suppressed": suppressed_opens,
        "sharpe": sharpe,
        "mdd_pct": mdd * 100,
    }


def discover_coins() -> list[str]:
    coins = []
    for f in sorted(BASE_DIR.glob("*_prices_cg_range.json")):
        coin = f.stem.replace("_prices_cg_range", "")
        coins.append(coin)
    return coins


def main():
    coins = discover_coins()
    variants = [
        ("baseline (no cooldown)", None, 36),
        ("threshold=2, 18h", 2, 18),
        ("threshold=2, 36h", 2, 36),
        ("threshold=3, 18h", 3, 18),
        ("threshold=3, 36h (live)", 3, 36),
        ("threshold=4, 36h", 4, 36),
    ]
    print(f"Cooldown counterfactual on full CG history "
          f"({START_DATE.date()} → snapshot end)")
    print(f"Short config: EMA={SHORT_EMA}, entry={ENTRY_PCT}%, exit={EXIT_PCT}%, "
          f"fee={FEE_PCT}%, leverage={LEVERAGE}x, "
          f"loss_thresh={COOLDOWN_LOSS_THRESHOLD}%\n")

    coin_data = {c: load_data(c) for c in coins}
    coin_data = {c: v for c, v in coin_data.items() if v[0]}
    print(f"Loaded {len(coin_data)} coins.\n")

    portfolio_results = {}
    for name, threshold, hours in variants:
        per_coin = {}
        for c, (prices, times) in coin_data.items():
            per_coin[c] = backtest_short_with_cooldown(
                prices, times, SHORT_EMA, ENTRY_PCT, EXIT_PCT,
                FEE_PCT, threshold, hours,
            )
        portfolio_results[name] = per_coin

    # Portfolio summary
    print(f"{'variant':<28}{'avg_ret':>10}{'med_ret':>10}{'avg_sharpe':>12}"
          f"{'avg_mdd':>10}{'neg_coins':>11}{'avg_trades':>12}{'avg_supp':>10}")
    print("-" * 105)
    for name, _, _ in variants:
        pc = portfolio_results[name]
        rets = [r["return_pct"] for r in pc.values()]
        shr = [r["sharpe"] for r in pc.values()]
        mdds = [r["mdd_pct"] for r in pc.values()]
        trs = [r["trades"] for r in pc.values()]
        sup = [r["suppressed"] for r in pc.values()]
        neg = sum(1 for r in rets if r < 0)
        print(f"{name:<28}{statistics.mean(rets):>+9.1f}%"
              f"{statistics.median(rets):>+9.1f}%"
              f"{statistics.mean(shr):>12.3f}"
              f"{statistics.mean(mdds):>9.1f}%"
              f"{neg:>8}/{len(pc)}"
              f"{statistics.mean(trs):>12.0f}"
              f"{statistics.mean(sup):>10.1f}")

    # Per-coin diff: live (threshold=3, 36h) vs threshold=2, 36h
    base = portfolio_results["threshold=3, 36h (live)"]
    chal = portfolio_results["threshold=2, 36h"]
    print(f"\n{'coin':<12}{'live (t=3)':>15}{'t=2, 36h':>15}{'delta':>12}{'trades_t3':>11}{'trades_t2':>11}{'supp_t2':>10}")
    print("-" * 90)
    deltas = []
    for c in sorted(base.keys()):
        d = chal[c]["return_pct"] - base[c]["return_pct"]
        deltas.append(d)
        print(f"{c:<12}{base[c]['return_pct']:>+13.1f}%"
              f"{chal[c]['return_pct']:>+13.1f}%"
              f"{d:>+11.1f}%"
              f"{base[c]['trades']:>11}"
              f"{chal[c]['trades']:>11}"
              f"{chal[c]['suppressed']:>10}")
    print(f"\nAvg delta (t=2 − t=3) across coins: {statistics.mean(deltas):+.1f}%")
    print(f"Coins where t=2 is better:  {sum(1 for d in deltas if d > 0)}/{len(deltas)}")
    print(f"Coins where t=3 is better:  {sum(1 for d in deltas if d < 0)}/{len(deltas)}")
    print(f"Coins unchanged:            {sum(1 for d in deltas if d == 0)}/{len(deltas)}")


if __name__ == "__main__":
    main()
