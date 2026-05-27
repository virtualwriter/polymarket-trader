# Hyperliquid Multi-Coin Hybrid Bot — Context for the LLM Trader

This document is included in the polymarket-trader LLM's system context so the
model understands trades it sees in the `HYPERLIQUID HYBRID BOT` section of its
prompt. **The LLM does not trade these markets** — the hybrid bot runs
independently on the same VPS. This is read-only context for situational
awareness about what real capital is currently doing on Hyperliquid.

## What it is

A long-running Python daemon (`hyperliquid-crv-rebalancer/multi_coin_hybrid_bot.py`)
that trades 12 perp markets on Hyperliquid using a regime-switching trend
strategy. Real trades are $10 notional per coin per fill (Hyperliquid's perp
minimum), but the shadow-trade feed you see logs $1 notional per trade.
Treat this as a probe-sized live-validation tier, not a size book.

Universe (12 coins):
`ADA, APT, ARB, ATOM, AVAX, BCH, CRV, DOT, FARTCOIN, INJ, OP, TRUMP`

## The strategy in one paragraph

It is short most of the time and long when broad crypto is clearly trending up.
The base mode is a short-only EMA mean-reversion on the 3-hour EMA: short any
coin trading 0.5% below its 3h EMA, cover when it crosses 0.5% above. When 10
of 12 coins close above their 50-hour EMA for 24 consecutive hours, the bot
flips to long-only mode using the 5-hour EMA with 1%/1% thresholds, until the
breadth signal clears. That is the *only* regime switch — there's no other
overlay.

## Rules (precise)

| Parameter | Bear (default) | Bull (signal active) |
|---|---|---|
| Direction | Short only | Long only |
| Signal EMA | 3h | 5h |
| Entry threshold | price < EMA × (1 − 0.5%) | price > EMA × (1 + 1.0%) |
| Exit threshold | price > EMA × (1 + 0.5%) | price < EMA × (1 − 1.0%) |
| Trade size (real) | $10 USD notional | $10 USD notional |
| Trade size (shadow log) | $1 USD notional | $1 USD notional |

Regime switch:
- **Bull on**: ≥ 10/12 coins have `price > 50h_EMA` for every one of the last 24 hourly bars.
- **Bull off**: any hour in that window drops below 10/12.

Position size: `floor($1 / price)` rounded to the perp's `szDecimals`.
Execution: Hyperliquid `market_open` / `market_close` with 1% slippage cap.
Taker fee assumed: 0.035%.

## Backtest result (Jun 2025 – present)

Optimized hybrid strategy returned approximately **+207% over the period vs
+192% for pure short**, i.e. a +15 pp lift from selectively switching to long
during the one extended bull regime in the window. The improvement comes
entirely from those bull periods; the bot's base behavior is short.

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
