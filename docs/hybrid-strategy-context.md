# Hyperliquid Multi-Coin Hybrid Bot — Context for the LLM Trader

This document is included in the polymarket-trader LLM's system context so the
model understands trades it sees in the `HYPERLIQUID HYBRID BOT` section of its
prompt. **The LLM does not trade these markets** — the hybrid bot runs
independently on the same VPS. This is read-only context for situational
awareness about what real capital is currently doing on Hyperliquid.

## What it is

A long-running Python daemon (`hyperliquid-crv-rebalancer/multi_coin_hybrid_bot.py`)
that trades 13 perp markets on Hyperliquid using a regime-switching trend
strategy. Real trades are $10 notional per coin per fill (Hyperliquid's perp
minimum), but the shadow-trade feed you see logs $1 notional per trade.
Treat this as a probe-sized live-validation tier, not a size book.

Universe (13 coins):
`ADA, APT, ARB, ATOM, AVAX, BCH, BTC, CRV, DOT, FARTCOIN, INJ, OP, TRUMP`

## The strategy in one paragraph

It is short most of the time and long when broad crypto is clearly trending up.
The base mode is a short-only EMA mean-reversion on the 4-hour EMA with an
asymmetric tight-entry / wide-exit pair (short any coin trading 0.30% below its
4h EMA, cover when it bounces 1.50% above). When 10 of 13 coins close above
their 50-hour EMA for 24 consecutive hours, the bot flips to long-only mode
using the 5-hour EMA with 1%/1% thresholds, until the breadth signal clears.
A consecutive-loser cooldown (3 back-to-back losing shorts ≤ −0.5% suppresses
new shorts on that coin for 36h) is layered on top of the backtested strategy
to mute single-coin whipsaw failure modes (e.g. INJ).

## Rules (precise)

| Parameter | Bear (default) | Bull (signal active) |
|---|---|---|
| Direction | Short only | Long only |
| Signal EMA | 4h | 5h |
| Entry threshold | price < EMA × (1 − 0.30%) | price > EMA × (1 + 1.0%) |
| Exit threshold | price > EMA × (1 + 1.50%) | price < EMA × (1 − 1.0%) |
| Trade size (real) | $10 USD notional | $10 USD notional |
| Trade size (shadow log) | $1 USD notional | $1 USD notional |

Regime switch:
- **Bull on**: ≥ 10/13 coins have `price > 50h_EMA` for every one of the last 24 hourly bars.
- **Bull off**: any hour in that window drops below 10/13.

Cooldown (originally a post-hoc patch; now validated against the same backtest
the live config was tuned on — see "Cooldown threshold validation" below):
- A short close with `gross_ret ≤ −0.5%` increments that coin's `loss_streak`.
- Any winning close (`gross_ret > 0`) resets it.
- Closes in `(−0.5%, 0]` are no-ops on the streak (dead zone).
- When `loss_streak ≥ 3` and no cooldown is already active, suppress new shorts
  on that coin for 36 hours. Longs (rare; only fire during global bull regime)
  are intentionally unaffected.

Position size: `ceil($notional / price)` rounded to the perp's `szDecimals`
(ceiling, not floor, so post-rounding notional never lands below Hyperliquid's
$10 minimum order value).
Execution: Hyperliquid `market_open` / `market_close` with 1% slippage cap.
Actual taker fee charged is ~4.5 bps (the `TAKER_FEE = 0.00035` constant in the
code is stale and unused — real fees come from fill responses).

## Provenance of the current live config

The short-leg parameters (`4h / 0.30% / 1.50%`) and the universe of 13 coins
came from chat `a416c31e` on 2026-05-27, in two stages:

1. **Fee-aware short-leg re-tune (commit `93bae6a`).** The original backtest
   used `3h / 0.5% / 0.5%` at an assumed 3.5 bps taker. Real Hyperliquid taker
   fees are ~4.5 bps, which materially degrades the original config's edge on
   high-trade-count coins. `hyperliquid-crv-rebalancer/fee_aware_grid.py` swept
   the short leg at 4.5 bps and surfaced `4h / 0.30% / 1.50%` as the global
   short-only portfolio optimum (+110 pp avg return vs the old config, 66 %
   fewer round-trips, 0/13 coins negative). The doc you are reading was not
   updated at that time; this section is the catch-up.

2. **Hybrid grid validation (commit `f672d9b`).** `fee_aware_hybrid_grid.py`
   ran a joint sweep of (short EMA / entry / exit) × (long EMA / entry / exit)
   × bull threshold — 972 combos at 1x and 5x leverage. Outputs are persisted
   to `fee_aware_hybrid_grid_{1x,5x}.csv` and `_summary.json`. Findings on the
   1x grid (the leverage we actually run):

   | Rank metric | Live (`thr=10, S 4/0.3/1.5, L 5/1.0/1.0`) | Grid #1 (`thr=12, S 4/0.3/1.5, L 8/1.0/0.5`) |
   |---|---|---|
   | avg_ret | #9 of 972 (+275 %) | #1 (+286 %) |
   | avg_sharpe | #53 of 972 (1.603) | #1 (1.741) |
   | MDD | 41 % | 38 % |
   | neg_coins | 2 / 13 | 1 / 13 |

   The live config was kept rather than flipped to the grid #1 because: same
   short leg as the top 8 configs (all use `4 / 0.30 / 1.50`); 4 pp return gap
   and 0.14 Sharpe gap are within parameter-search noise; the synthetic
   regime-switching Monte Carlo (`synthetic_bull_stress.py`, 20 seeds × 40 %
   and 50 % bull-share scenarios) showed the live config was survival-optimal
   (0 liquidations and positive median return) where short-only wiped out at
   −89 % in the 50 % bull scenario.

   Note: the prior chat summarized this as "Sharpe-optimal at 5x" — that
   characterization was relative to a three-way comparison (live vs.
   return-best vs. short-only-best), **not** the full 972-row grid. By full-
   grid Sharpe the live config is #51 / #53 (5x / 1x), not #1.

## Cooldown threshold validation

`hyperliquid-crv-rebalancer/cooldown_threshold_counterfactual.py` re-runs the
live short-leg config (EMA=4, 0.30%/1.50%, 4.5 bps, 1x) over the full 13-coin
CG hourly history with cooldown overlaid at thresholds {none, 2, 3, 4} ×
durations {18h, 36h}. Portfolio summary:

| variant | avg_ret | avg_sharpe | avg_mdd | trades | suppressed opens |
|---|---|---|---|---|---|
| baseline (no cooldown) | +279.8 % | 1.667 | 41.0 % | 107 | 0 |
| threshold=2, 18h | +252.6 % | 1.593 | 39.4 % | 99 | 104 |
| threshold=2, 36h | +221.2 % | 1.487 | 41.0 % | 93 | 209 |
| **threshold=3, 36h (live)** | **+302.9 %** | **1.742** | **38.3 %** | 99 | 87 |
| threshold=3, 18h | +307.3 % | 1.707 | 38.9 % | 103 | 41 |
| threshold=4, 36h | +265.8 % | 1.623 | 42.0 % | 102 | 62 |

Takeaways:
1. **Cooldown adds real edge** when set correctly: threshold=3 / 36h is +23 pp
   over no-cooldown baseline, with lower MDD and higher Sharpe.
2. **threshold=3 is the inflection point.** Both threshold=2 (too sensitive,
   suppresses normal mean-reversion noise) and threshold=4 (too lenient, lets
   real failures bleed) are worse than threshold=3.
3. **36h is Sharpe-optimal at threshold=3**, 18h is return-best by ~4 pp but
   loses Sharpe. The live config (3 / 36h) is the risk-adjusted optimum,
   consistent with the strategy's general preference for Sharpe over raw
   return.
4. **threshold=2 strictly worse on all 13 coins** (−81.7 pp avg delta) — the
   intuition that "2 losses in a row" is a signal turns out to be wrong on
   the full tape, because two-in-a-row losses are *the strategy's normal
   operating pattern* during mean-reverting chop. Threshold=3 captures only
   the genuine failure modes (e.g. the INJ trend-into-the-short scenario).

The per-coin breakdown and rerun script live alongside the code in
`hyperliquid-crv-rebalancer/`. Rerun after any future config or universe
change.

## Cooldown persistence bug (2026-06-01)

A bug in the open-block of `multi_coin_hybrid_bot.py` was silently disabling
the cooldown on the live bot: every time a new short opened, the position
dict was overwritten without `loss_streak` / `cooldown_until` keys, so the
streak reset to 0 on every open and could never reach the threshold of 3.
Visible symptom: every in-position coin in `data/hyperliquid-hybrid-state.json`
was missing the `loss_streak` / `cooldown_until` fields; INJ accumulated 7
consecutive losing shorts (≤ −0.5%) without ever entering cooldown.

The fix preserves the streak fields across the open dict overwrite. After
deploy, threshold=3 / 36h will behave as the backtest validates.

## Known divergences from the backtest

These are documented so the LLM (and future reviewers) don't read live results
as a clean re-run of the backtest:

- **Universe**: the backtest evaluated 13 coins
  (`ada, apt, arb, avax, bch, crv, dot, fartcoin, inj, lido, op, purr, trump`).
  Live trades 12 coins: same set minus `LIDO` and `PURR`, plus `ATOM`. ATOM
  has no backtested edge for this config; LIDO and PURR (positive contributors
  in the backtest) were dropped without recorded rationale.
- **Cooldown**: not present in the backtest; will systematically reduce live
  INJ-style trade counts vs. backtest expectations.
- **Bull regime never fires**: the 10/12 × 24h threshold has not triggered in
  live runs to date, so live performance reflects pure short-leg behavior.

## What this means for the polymarket-trader LLM

1. **These trades are not your trades.** Don't try to "close" them, evaluate
   them for promotion, or fold them into hypothesis backtests. They are
   informational only.
2. **Regime is the most useful bit.** The bot's current `regime` field (bull /
   bear) is a real-money breadth signal across 12 alt perps and is a cleaner
   read than guessing from the BTC chart alone. Treat a sustained bull regime
   as confirmation that crypto-adjacent risk markets are in an uptrend; treat
   a flip back to bear as alt-breadth deterioration.
3. **Per-coin entries are noisy.** A single FARTCOIN short opening is not a
   thesis-changing event. Watch the *aggregate*: how many coins are positioned
   long vs short, and which side is winning recently.
4. **Closed-trade P&L tells you whether trend or mean-reversion is paying.**
   A run of positive closes in short mode = mean-reversion is working = ranges
   intact. A run of negative closes in short mode = breakouts dominating, often
   a precursor to the regime flipping bull.
5. **Do not infer macro views from a small recent sample.** Last 20 closed
   trades is what you see. Anything less than ~30 closes is too few to update
   priors strongly.
