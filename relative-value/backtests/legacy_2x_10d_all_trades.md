# Heatmap Forward-Hold Backtest

Generated: 2026-05-13T15:08:04+00:00
Archives read: 325
Hold days: 10
Entry policy: every-snapshot
Candidate set: all tradeable rows
Minimum absolute edge: 0

## Summary

- Total entries: 23909
- Closed entries: 9714
- Open/pending entries: 14195
- Win rate: 31.0% (3009W/6705L)
- Average P&L: -9.05%
- Median P&L: -2.13%
- Total P&L points: -87954.84

## By Edge Bucket

| Edge Bucket | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| |edge| >= 20 | 103 | 41.7% | -5.37% |
| 10 <= |edge| < 20 | 806 | 32.4% | -12.03% |
| 5 <= |edge| < 10 | 1497 | 29.7% | -9.79% |
| |edge| < 5 | 7308 | 30.9% | -8.63% |

## By asset

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| BTC | 2520 | 30.3% | -3.43% |
| GOLD | 4768 | 40.0% | -9.16% |
| OIL | 2426 | 14.0% | -14.68% |

## By side

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| no | 6192 | 41.8% | -2.60% |
| yes | 3522 | 12.0% | -20.40% |

## By iv_resolution

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| valuations_fallback | 1422 | 40.0% | -4.01% |
| cme_snapshot | 521 | 17.5% | -7.41% |
| tv_chain | 7771 | 30.2% | -10.09% |

## By model_version

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| relative_value_heatmap_v1_legacy_2x | 9714 | 31.0% | -9.05% |
