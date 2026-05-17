# Funding Extreme — Trend-Filter Stratification

Source: /Users/johnskapwingpc/Downloads/polymarket-trader/data/daily-valuations.csv

## Data window
- BTC: 425 points, 2026-04-03T00:00:00Z to 2026-05-17T05:00:00Z
- OIL: 425 points, 2026-04-03T00:00:00Z to 2026-05-17T05:00:00Z
- HYPE: 425 points, 2026-04-03T00:00:00Z to 2026-05-17T05:00:00Z
- GOLD: 425 points, 2026-04-03T00:00:00Z to 2026-05-17T05:00:00Z
- AMZN: 425 points, 2026-04-03T00:00:00Z to 2026-05-17T05:00:00Z

## What this measures

The live trader rejects FUNDING_EXTREME_LONG (short) signals when the asset has been trending up (above 24h SMA by >0.5% AND 24h momentum >+1.5%). This script replays the same funding triggers and partitions trades into:

- `filter_off` — every funding-extreme trigger taken
- `filter_default` — only entries the live filter would have allowed (matches what hit the live ledger)
- `filter_blocked` — only entries the live filter *would have blocked*, the shadow universe the LLM keeps referencing

The interesting delta is `filter_blocked - filter_default`. Negative → the filter is catching losers (working as designed). Positive → the filter is rejecting trades that would have made money (too aggressive).

## FUNDING_EXTREME_LONG asset-level rollup (live defaults: threshold>15, target=5, stop=2.5, hold=72h)

| Asset | Mode | Trades | Win% | Avg PnL | Median | Max DD | Hard-blocked |
|---|---|---:|---:|---:|---:|---:|:---:|
| BTC | filter_off | 0 | — | — | — | — | no |
| BTC | filter_default | 0 | — | — | — | — | no |
| BTC | filter_blocked | 0 | — | — | — | — | no |
| OIL | filter_off | 15 | 47% | -1.12% | -0.44% | -25.64 | yes |
| OIL | filter_default | 13 | 46% | -1.43% | -0.44% | -25.19 | yes |
| OIL | filter_blocked | 2 | 50% | +0.89% | +0.89% | -0.45 | yes |
| HYPE | filter_off | 2 | 0% | -2.55% | -2.55% | -5.10 | no |
| HYPE | filter_default | 1 | 0% | -2.66% | -2.66% | -2.66 | no |
| HYPE | filter_blocked | 1 | 0% | -2.45% | -2.45% | -2.45 | no |
| GOLD | filter_off | 16 | 62% | +0.79% | +0.41% | -1.96 | no |
| GOLD | filter_default | 15 | 67% | +0.86% | +0.46% | -1.71 | no |
| GOLD | filter_blocked | 1 | 0% | -0.25% | -0.25% | -0.25 | no |
| AMZN | filter_off | 22 | 41% | -1.32% | -1.10% | -35.90 | no |
| AMZN | filter_default | 16 | 44% | -1.46% | -2.17% | -27.19 | no |
| AMZN | filter_blocked | 6 | 33% | -0.94% | -0.31% | -8.72 | no |

## Largest filter_blocked vs filter_default deltas (n≥3 each side)

Positive delta means the filter rejected profitable trades; negative means it caught losers.

| Cell | Δ (blocked - default) | Blocked avg | Default avg | Blocked n | Default n |
|---|---:|---:|---:|---:|---:|
| HYPE FUNDING_EXTREME_LONG thr>10 t=6.0 s=3.0 hold=24h | +1.16% | +0.45% | -0.71% | 9 | 26 |
| AMZN FUNDING_EXTREME_LONG thr>15 t=4.0 s=2.5 hold=24h | -1.13% | -1.41% | -0.28% | 6 | 16 |
| AMZN FUNDING_EXTREME_LONG thr>15 t=5.0 s=2.5 hold=24h | -1.13% | -1.41% | -0.28% | 6 | 16 |
| AMZN FUNDING_EXTREME_LONG thr>15 t=6.0 s=3.0 hold=24h | -1.13% | -1.41% | -0.28% | 6 | 16 |
| HYPE FUNDING_EXTREME_LONG thr>10 t=3.0 s=2.0 hold=24h | +1.12% | +0.48% | -0.64% | 9 | 26 |
| AMZN FUNDING_EXTREME_LONG thr>20 t=6.0 s=3.0 hold=72h | +1.12% | -0.23% | -1.35% | 5 | 15 |
| AMZN FUNDING_EXTREME_LONG thr>10 t=4.0 s=2.5 hold=24h | -1.07% | -1.67% | -0.60% | 6 | 20 |
| AMZN FUNDING_EXTREME_LONG thr>10 t=5.0 s=2.5 hold=24h | -1.07% | -1.67% | -0.60% | 6 | 20 |
| AMZN FUNDING_EXTREME_LONG thr>10 t=6.0 s=3.0 hold=24h | -1.04% | -1.67% | -0.63% | 6 | 20 |
| AMZN FUNDING_EXTREME_LONG thr>20 t=4.0 s=2.5 hold=72h | +1.03% | -0.23% | -1.26% | 5 | 15 |
| AMZN FUNDING_EXTREME_LONG thr>20 t=5.0 s=2.5 hold=72h | +1.03% | -0.23% | -1.26% | 5 | 15 |
| AMZN FUNDING_EXTREME_LONG thr>10 t=6.0 s=3.0 hold=48h | -0.98% | -2.11% | -1.13% | 6 | 20 |
| HYPE FUNDING_EXTREME_LONG thr>10 t=4.0 s=2.5 hold=48h | +0.93% | +0.16% | -0.77% | 9 | 26 |
| AMZN FUNDING_EXTREME_LONG thr>20 t=3.0 s=2.0 hold=48h | +0.93% | -0.05% | -0.98% | 5 | 15 |
| AMZN FUNDING_EXTREME_LONG thr>20 t=3.0 s=2.0 hold=72h | +0.84% | -0.55% | -1.39% | 5 | 15 |

## How to read this

- If `filter_blocked` averages ≥ +0.50% across multiple assets at the live thresholds, the filter is too strict and loosening `contrarianTrendMarginPct` and/or `positiveMomentum24hPct` is justified.
- If `filter_blocked` averages around 0% or negative, the filter is doing its job — keep it.
- Sample sizes matter: a few hundred bps on n=3 is noise. Prefer cells with n≥10.
- For FUNDING_EXTREME_SHORT the filter does not engage (longs aren't blocked), so the blocked bucket should be empty by construction.

