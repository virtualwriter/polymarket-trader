# Heatmap Forward-Hold Backtest

Generated: 2026-05-13T15:08:07+00:00
Archives read: 325
Hold days: 14
Entry policy: every-snapshot
Candidate set: all tradeable rows
Minimum absolute edge: 0

## Summary

- Total entries: 23909
- Closed entries: 1908
- Open/pending entries: 22001
- Win rate: 37.0% (706W/1202L)
- Average P&L: -4.99%
- Median P&L: -0.53%
- Total P&L points: -9525.46

## By Edge Bucket

| Edge Bucket | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| |edge| >= 20 | 67 | 52.2% | 0.75% |
| 10 <= |edge| < 20 | 182 | 52.7% | -5.87% |
| 5 <= |edge| < 10 | 381 | 28.3% | -5.60% |
| |edge| < 5 | 1278 | 36.5% | -4.99% |

## By asset

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| GOLD | 1076 | 48.6% | -4.09% |
| BTC | 523 | 23.3% | -6.11% |
| OIL | 309 | 19.7% | -6.24% |

## By side

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| no | 1450 | 43.6% | -1.96% |
| yes | 458 | 16.2% | -14.58% |

## By iv_resolution

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| valuations_fallback | 1199 | 43.0% | -3.58% |
| cme_snapshot | 459 | 21.4% | -6.52% |
| tv_chain | 250 | 37.2% | -8.95% |

## By model_version

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| relative_value_heatmap_v1_legacy_2x | 1908 | 37.0% | -4.99% |
