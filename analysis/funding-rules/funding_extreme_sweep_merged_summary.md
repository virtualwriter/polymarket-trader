# Funding Extreme Sweep Summary

Source: /Users/johnskapwingpc/Downloads/polymarket-trader/analysis/funding-rules/vps_instrument_snapshots_compact.csv merged with /Users/johnskapwingpc/Downloads/polymarket-trader/data/daily-valuations.csv

## Data Window
- BTC: 351 points, 2026-04-03T00:00:00Z to 2026-05-13T16:00:00Z
- OIL: 351 points, 2026-04-03T00:00:00Z to 2026-05-13T16:00:00Z
- HYPE: 351 points, 2026-04-03T00:00:00Z to 2026-05-13T16:00:00Z
- GOLD: 351 points, 2026-04-03T00:00:00Z to 2026-05-13T16:00:00Z
- AMZN: 351 points, 2026-04-03T00:00:00Z to 2026-05-13T16:00:00Z

## Best Cell Per Asset/Side

| Asset | Signal | T | Target | Stop | Hold h | Raw hits | Dedup trades | Win rate | Avg market | Avg funding | Avg total | Max DD | Sharpe-like |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BTC | FUNDING_EXTREME_LONG | 8 | 3 | 4 | 12 | 62 | 19 | 47.37% | -0.20 | 0.01 | -0.19 | -4.20 | -0.19 |
| BTC | FUNDING_EXTREME_SHORT | 12 | 8 | 4 | 168 | 33 | 11 | 100.00% | 4.46 | 0.03 | 4.49 | 0.00 | 1.57 |
| OIL | FUNDING_EXTREME_LONG | 12 | 4 | 1.5 | 48 | 46 | 14 | 78.57% | 0.48 | 0.13 | 0.61 | -2.88 | 0.29 |
| OIL | FUNDING_EXTREME_SHORT | 25 | 5 | 4 | 168 | 104 | 23 | 65.22% | 3.97 | 0.91 | 4.88 | -5.37 | 0.62 |
| HYPE | FUNDING_EXTREME_LONG | 10 | 5 | 1.5 | 168 | 232 | 32 | 28.12% | 0.08 | 0.03 | 0.11 | -20.40 | 0.03 |
| HYPE | FUNDING_EXTREME_SHORT | 10 | 10 | 4 | 168 | 32 | 13 | 53.85% | 3.04 | -0.05 | 2.98 | -21.41 | 0.39 |
| GOLD | FUNDING_EXTREME_LONG | 50 | 5 | 1.5 | 168 | 4 | 4 | 75.00% | 1.95 | 0.13 | 2.08 | -1.24 | 0.97 |
| GOLD | FUNDING_EXTREME_SHORT | 30 | 3 | 2.5 | 168 | 7 | 4 | 75.00% | 1.65 | 0.19 | 1.85 | -1.68 | 0.85 |
| AMZN | FUNDING_EXTREME_LONG | 25 | 3 | 4 | 12 | 70 | 13 | 38.46% | 0.03 | 0.02 | 0.05 | -3.99 | 0.04 |
| AMZN | FUNDING_EXTREME_SHORT | 10 | 10 | 2.5 | 168 | 19 | 8 | 100.00% | 7.10 | -0.03 | 7.07 | 0.00 | 2.23 |

Note: best cells require only >=3 deduped trades, so this table is a search aid, not a production recommendation.

## Conservative Best Cell Per Asset/Side

Selector: require >=10 deduped trades and finite Sharpe-like, then sort by Sharpe-like, avg total P&L, and trade count.

| Asset | Signal | T | Target | Stop | Hold h | Raw hits | Dedup trades | Win rate | Avg market | Avg funding | Avg total | Max DD | Sharpe-like |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BTC | FUNDING_EXTREME_LONG | 8 | 3 | 4 | 12 | 62 | 19 | 47.37% | -0.20 | 0.01 | -0.19 | -4.20 | -0.19 |
| BTC | FUNDING_EXTREME_SHORT | 12 | 3 | 4 | 168 | 33 | 11 | 100.00% | 3.09 | 0.03 | 3.12 | 0.00 | 3.18 |
| OIL | FUNDING_EXTREME_LONG | 25 | 4 | 1.5 | 24 | 35 | 13 | 84.62% | 0.39 | 0.16 | 0.55 | -0.51 | 0.66 |
| OIL | FUNDING_EXTREME_SHORT | 25 | 5 | 4 | 168 | 104 | 23 | 65.22% | 3.97 | 0.91 | 4.88 | -5.37 | 0.62 |
| HYPE | FUNDING_EXTREME_LONG | 10 | 5 | 1.5 | 168 | 232 | 32 | 28.12% | 0.08 | 0.03 | 0.11 | -20.40 | 0.03 |
| HYPE | FUNDING_EXTREME_SHORT | 10 | 4 | 2.5 | 168 | 32 | 13 | 61.54% | 1.87 | -0.01 | 1.86 | -8.58 | 0.48 |
| GOLD | FUNDING_EXTREME_LONG | 20 | 3 | 1.5 | 168 | 20 | 10 | 70.00% | 1.48 | 0.11 | 1.59 | -2.97 | 0.86 |
| GOLD | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| AMZN | FUNDING_EXTREME_LONG | 25 | 3 | 4 | 12 | 70 | 13 | 38.46% | 0.03 | 0.02 | 0.05 | -3.99 | 0.04 |
| AMZN | FUNDING_EXTREME_SHORT | 5 | 4 | 2.5 | 168 | 28 | 11 | 100.00% | 4.79 | -0.05 | 4.74 | 0.00 | 4.83 |
