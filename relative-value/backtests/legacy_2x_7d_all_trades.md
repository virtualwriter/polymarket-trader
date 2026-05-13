# Heatmap Forward-Hold Backtest

Generated: 2026-05-13T15:08:00+00:00
Archives read: 325
Hold days: 7
Entry policy: every-snapshot
Candidate set: all tradeable rows
Minimum absolute edge: 0

## Summary

- Total entries: 23909
- Closed entries: 16943
- Open/pending entries: 6966
- Win rate: 25.7% (4357W/12586L)
- Average P&L: -10.06%
- Median P&L: -2.17%
- Total P&L points: -170376.60

## By Edge Bucket

| Edge Bucket | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| |edge| >= 20 | 152 | 24.3% | -14.29% |
| 10 <= |edge| < 20 | 1240 | 25.2% | -17.49% |
| 5 <= |edge| < 10 | 2500 | 27.4% | -10.40% |
| |edge| < 5 | 13051 | 25.5% | -9.23% |

## By asset

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| BTC | 4597 | 22.8% | -6.49% |
| GOLD | 7972 | 33.7% | -8.99% |
| OIL | 4374 | 14.2% | -15.74% |

## By side

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| no | 10123 | 34.0% | -2.87% |
| yes | 6820 | 13.4% | -20.72% |

## By iv_resolution

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| valuations_fallback | 1985 | 33.3% | -4.23% |
| cme_snapshot | 695 | 11.1% | -10.05% |
| tv_chain | 14263 | 25.4% | -10.87% |

## By model_version

| Group | Trades | Win Rate | Avg P&L |
|---|---:|---:|---:|
| relative_value_heatmap_v1_legacy_2x | 16943 | 25.7% | -10.06% |
