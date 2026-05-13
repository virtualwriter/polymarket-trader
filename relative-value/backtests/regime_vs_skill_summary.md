# One-touch vs Legacy-2x — regime-vs-skill comparison

Generated: 2026-05-13T15:11:13+00:00
Source: VPS archive `relative-value/backtest-history/{one_touch,legacy_2x}`, 325 hourly snapshots Apr 7 → May 13 2026.
Dedup: 1 entry per (market_id, best_expression) per UTC day, earliest snapshot wins.
Conventions: side=yes enters at YES ask, exits at YES bid; side=no enters at NO ask (=1-YES bid), exits at NO bid (=1-YES ask). All long, no shorting.

Loaded one_touch 7d: 1324 daily-deduped rows from one_touch_all_trades.csv
Loaded one_touch 10d: 850 daily-deduped rows from one_touch_10d_all_trades.csv
Loaded one_touch 14d: 428 daily-deduped rows from one_touch_14d_all_trades.csv
Loaded one_touch 17d: 130 daily-deduped rows from one_touch_17d_all_trades.csv
Loaded legacy_2x 7d: 1355 daily-deduped rows from legacy_2x_7d_all_trades.csv
Loaded legacy_2x 10d: 831 daily-deduped rows from legacy_2x_10d_all_trades.csv
Loaded legacy_2x 14d: 378 daily-deduped rows from legacy_2x_14d_all_trades.csv
Loaded legacy_2x 17d: 115 daily-deduped rows from legacy_2x_17d_all_trades.csv

## Headline — all daily-deduped (bid/ask)

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 1324 | 29.3% | -8.74% | 3.05pp | 1355 | 25.9% | -10.01% | 4.74pp | **+1.27%** |
| 10d | 850 | 36.4% | -7.22% | 2.11pp | 831 | 31.6% | -8.21% | 3.37pp | **+1.00%** |
| 14d | 428 | 43.9% | -2.47% | 2.61pp | 378 | 35.4% | -5.26% | 2.56pp | **+2.79%** |
| 17d | 130 | 46.2% | -0.96% | — | 115 | 36.5% | -2.75% | — | **+1.79%** |

## Headline — all daily-deduped (MIDPOINT)

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 1324 | 57.2% | -1.03% | 3.05pp | 1355 | 52.8% | -2.40% | 4.74pp | **+1.36%** |
| 10d | 850 | 63.6% | -0.50% | 2.11pp | 831 | 56.7% | -1.55% | 3.37pp | **+1.05%** |
| 14d | 428 | 75.7% | +2.77% | 2.61pp | 378 | 66.4% | +0.14% | 2.56pp | **+2.63%** |
| 17d | 130 | 81.5% | +3.98% | — | 115 | 73.9% | +2.15% | — | **+1.83%** |

## Candidate: Strict + side=no + |edge|>=10 (no OIL) — bid/ask

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 56 | 78.6% | +4.26% | 2.53pp | 29 | 72.4% | +2.79% | 5.11pp | **+1.47%** |
| 10d | 44 | 95.5% | +7.53% | 0.58pp | 26 | 84.6% | +2.53% | 1.83pp | **+4.99%** |
| 14d | 32 | 100.0% | +8.83% | 1.63pp | 18 | 94.4% | +3.53% | 1.41pp | **+5.30%** |
| 17d | 11 | 100.0% | +9.38% | — | 6 | 100.0% | +4.46% | — | **+4.92%** |

## Candidate: Strict + side=no + |edge|>=10 (no OIL) — MIDPOINT

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 56 | 92.9% | +6.24% | 2.53pp | 29 | 82.8% | +4.84% | 5.11pp | **+1.40%** |
| 10d | 44 | 97.7% | +9.64% | 0.58pp | 26 | 88.5% | +4.63% | 1.83pp | **+5.01%** |
| 14d | 32 | 100.0% | +11.27% | 1.63pp | 18 | 94.4% | +5.93% | 1.41pp | **+5.34%** |
| 17d | 11 | 100.0% | +12.17% | — | 6 | 100.0% | +7.46% | — | **+4.71%** |

## Inverse sanity: Strict + side=yes + |edge|>=10 — bid/ask

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 101 | 36.6% | -6.98% | 9.98pp | 23 | 21.7% | -29.66% | 27.92pp | **+22.68%** |
| 10d | 63 | 52.4% | +0.36% | 2.79pp | 10 | 20.0% | -13.77% | 1.27pp | **+14.13%** |
| 14d | 36 | 61.1% | +3.85% | 0.32pp | 5 | 40.0% | -11.92% | — | **+15.76%** |
| 17d | 8 | 62.5% | +2.12% | — | 0 | — | — | — | **—** |

## Inverse sanity: Strict + side=yes + |edge|>=10 — MIDPOINT

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 101 | 46.5% | -2.27% | 9.98pp | 23 | 21.7% | -24.09% | 27.92pp | **+21.82%** |
| 10d | 63 | 60.3% | +4.75% | 2.79pp | 10 | 20.0% | -9.13% | 1.27pp | **+13.88%** |
| 14d | 36 | 75.0% | +7.72% | 0.32pp | 5 | 40.0% | -7.83% | — | **+15.55%** |
| 17d | 8 | 75.0% | +5.24% | — | 0 | — | — | — | **—** |

## BTC slice (all daily-dedup) — bid/ask

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 376 | 37.8% | -4.22% | 6.57pp | 372 | 21.0% | -9.24% | 6.44pp | **+5.02%** |
| 10d | 242 | 49.2% | +0.84% | 0.48pp | 212 | 27.4% | -4.41% | 3.57pp | **+5.24%** |
| 14d | 137 | 48.9% | +1.26% | 2.21pp | 103 | 21.4% | -5.61% | 1.35pp | **+6.87%** |
| 17d | 41 | 51.2% | +2.73% | — | 33 | 18.2% | -6.43% | — | **+9.16%** |

## GOLD slice (all daily-dedup) — bid/ask

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 603 | 30.2% | -9.07% | 2.00pp | 600 | 34.3% | -7.54% | 6.03pp | **-1.53%** |
| 10d | 398 | 36.2% | -9.88% | 2.27pp | 402 | 42.0% | -6.57% | 7.00pp | **-3.31%** |
| 14d | 198 | 44.4% | -5.53% | 2.79pp | 202 | 47.5% | -4.33% | 3.33pp | **-1.20%** |
| 17d | 63 | 44.4% | -4.44% | — | 64 | 50.0% | -1.41% | — | **-3.03%** |

## OIL slice (all daily-dedup) — bid/ask

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 345 | 18.6% | -13.08% | 4.07pp | 383 | 17.5% | -14.63% | 3.13pp | **+1.55%** |
| 10d | 210 | 21.9% | -11.45% | 3.82pp | 217 | 16.6% | -14.98% | 3.30pp | **+3.53%** |
| 14d | 93 | 35.5% | -1.47% | 3.06pp | 73 | 21.9% | -7.34% | 5.55pp | **+5.88%** |
| 17d | 26 | 42.3% | +1.64% | — | 18 | 22.2% | -0.75% | — | **+2.40%** |

## side=no (all daily-dedup) — bid/ask

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 728 | 37.4% | -1.66% | 1.70pp | 804 | 34.0% | -2.62% | 0.17pp | **+0.96%** |
| 10d | 494 | 46.2% | -1.69% | 0.65pp | 537 | 40.2% | -2.61% | 0.02pp | **+0.92%** |
| 14d | 274 | 54.4% | +1.01% | 1.25pp | 271 | 42.8% | -1.57% | 0.56pp | **+2.58%** |
| 17d | 90 | 56.7% | +1.90% | — | 89 | 42.7% | -0.94% | — | **+2.84%** |

## side=yes (all daily-dedup) — bid/ask

| Hold | one_touch n | one_touch win | one_touch avg | one_touch wk-std | legacy_2x n | legacy_2x win | legacy_2x avg | legacy_2x wk-std | one_touch − legacy_2x |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7d | 596 | 19.5% | -17.38% | 3.87pp | 551 | 14.2% | -20.80% | 5.23pp | **+3.41%** |
| 10d | 356 | 22.8% | -14.88% | 2.15pp | 294 | 16.0% | -18.44% | 5.69pp | **+3.56%** |
| 14d | 154 | 25.3% | -8.68% | 3.23pp | 107 | 16.8% | -14.61% | 5.09pp | **+5.93%** |
| 17d | 40 | 22.5% | -7.39% | — | 26 | 15.4% | -8.93% | — | **+1.53%** |

## Verdict heuristic

- Candidate slice (Strict+NO+|edge|>=10, no OIL) at 14d bid/ask: one_touch +8.83%, legacy_2x +3.53%
- Inverse sanity (Strict+YES+|edge|>=10) at 14d bid/ask: one_touch +3.85%, legacy_2x -11.92%

Verdict: **MOSTLY REGIME**. Legacy-2x is mildly positive (+3.53%); one_touch only adds +5.30% of skill at most. Marginal.
