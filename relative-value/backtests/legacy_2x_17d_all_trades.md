# Heatmap Forward-Hold Backtest

Generated: 2026-05-13T15:08:09+00:00
Archives read: 325
Hold days: 17
Entry policy: every-snapshot
Candidate set: all tradeable rows
Minimum absolute edge: 0

## Summary

- Total entries: 23909
- Closed entries: 496
- Open/pending entries: 23413
- Win rate: 37.9% (188W/308L)
- Average P&L: -3.05%
- Median P&L: -0.32%
- Total P&L points: -1510.92

## By Edge Bucket

| Edge Bucket | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| |edge| >= 20 | 19 | 52.6% | -1.22% |
| 10 <= |edge| < 20 | 42 | 61.9% | -0.32% |
| 5 <= |edge| < 10 | 101 | 28.7% | -1.48% |
| |edge| < 5 | 334 | 36.8% | -3.97% |

## By asset

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| GOLD | 283 | 51.6% | -1.34% |
| OIL | 74 | 20.3% | -3.56% |
| BTC | 139 | 19.4% | -6.25% |

## By side

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| no | 386 | 44.0% | -1.20% |
| yes | 110 | 16.4% | -9.52% |

## By iv_resolution

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| valuations_fallback | 357 | 45.1% | -1.80% |
| cme_snapshot | 139 | 19.4% | -6.25% |

## By model_version

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| relative_value_heatmap_v1_legacy_2x | 496 | 37.9% | -3.05% |
