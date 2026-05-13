# Funding Extreme Sweep Summary

Source: /Users/johnskapwingpc/Downloads/polymarket-trader/analysis/funding-rules/vps_instrument_snapshots_compact.csv

## Data Window
- BTC: 36 points, 2026-05-06T00:00:00Z to 2026-05-13T16:00:00Z
- OIL: 36 points, 2026-05-06T00:00:00Z to 2026-05-13T16:00:00Z
- HYPE: 36 points, 2026-05-06T00:00:00Z to 2026-05-13T16:00:00Z
- GOLD: 36 points, 2026-05-06T00:00:00Z to 2026-05-13T16:00:00Z
- AMZN: 36 points, 2026-05-06T00:00:00Z to 2026-05-13T16:00:00Z

## Best Cell Per Asset/Side

| Asset | Signal | T | Target | Stop | Hold h | Raw hits | Dedup trades | Win rate | Avg market | Avg funding | Avg total | Max DD | Sharpe-like |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BTC | FUNDING_EXTREME_LONG | 5 | 3 | 2.5 | 168 | 29 | 4 | 100.00% | 1.31 | 0.01 | 1.32 | 0.00 | 1.26 |
| BTC | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=3 deduped trades |  |  |
| OIL | FUNDING_EXTREME_LONG |  |  |  |  |  |  |  |  |  | no cells with >=3 deduped trades |  |  |
| OIL | FUNDING_EXTREME_SHORT | 40 | 3 | 1.5 | 168 | 22 | 3 | 33.33% | 0.28 | 0.89 | 1.17 | -2.91 | 0.32 |
| HYPE | FUNDING_EXTREME_LONG | 5 | 10 | 2.5 | 168 | 26 | 4 | 75.00% | 5.51 | 0.10 | 5.61 | -0.63 | 1.22 |
| HYPE | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=3 deduped trades |  |  |
| GOLD | FUNDING_EXTREME_LONG | 5 | 3 | 1.5 | 24 | 36 | 4 | 0.00% | -0.73 | 0.01 | -0.72 | -2.87 | -1.28 |
| GOLD | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=3 deduped trades |  |  |
| AMZN | FUNDING_EXTREME_LONG | 30 | 3 | 2.5 | 168 | 16 | 3 | 66.67% | 1.95 | 0.22 | 2.17 | -0.70 | 1.05 |
| AMZN | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=3 deduped trades |  |  |

Note: best cells require only >=3 deduped trades, so this table is a search aid, not a production recommendation.

## Conservative Best Cell Per Asset/Side

Selector: require >=10 deduped trades and finite Sharpe-like, then sort by Sharpe-like, avg total P&L, and trade count.

| Asset | Signal | T | Target | Stop | Hold h | Raw hits | Dedup trades | Win rate | Avg market | Avg funding | Avg total | Max DD | Sharpe-like |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BTC | FUNDING_EXTREME_LONG |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| BTC | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| OIL | FUNDING_EXTREME_LONG |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| OIL | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| HYPE | FUNDING_EXTREME_LONG |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| HYPE | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| GOLD | FUNDING_EXTREME_LONG |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| GOLD | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| AMZN | FUNDING_EXTREME_LONG |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
| AMZN | FUNDING_EXTREME_SHORT |  |  |  |  |  |  |  |  |  | no cells with >=10 deduped trades and finite Sharpe-like |  |  |
