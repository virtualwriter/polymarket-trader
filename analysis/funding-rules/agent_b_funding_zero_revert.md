# Hold-to-funding-zero vs production fixed-hold (Agent B / Attack 7)

Threshold T=±15 (production), 24h dedup, hard cap 168h.
Funding-zero revert band |funding_ann_pct| <= 5.0.
Production fixed-hold uses hold=72h, stop=2.5, target=5/4.

Source: VPS compact merged with daily-valuations fallback.

| Asset | Signal | n | Prod fixed-hold avg | Prod wr | Funding-zero avg | Fund-zero wr | Δ avg |
|---|---|---:|---:|---:|---:|---:|---:|
| BTC | FUNDING_EXTREME_SHORT | 6 | +0.77% | 50% | -0.15% | 33% | -0.92% |
| OIL | FUNDING_EXTREME_LONG | 14 | -1.17% | 50% | -0.85% | 29% | +0.32% |
| OIL | FUNDING_EXTREME_SHORT | 24 | +1.81% | 54% | +0.84% | 64% | -0.97% |
| HYPE | FUNDING_EXTREME_LONG | 1 | -2.45% | 0% | -5.39% | 0% | -2.94% |
| HYPE | FUNDING_EXTREME_SHORT | 11 | +0.74% | 55% | +0.00% | 45% | -0.74% |
| GOLD | FUNDING_EXTREME_LONG | 14 | +0.35% | 50% | +0.56% | 43% | +0.22% |
| GOLD | FUNDING_EXTREME_SHORT | 7 | +0.20% | 57% | -0.45% | 29% | -0.65% |
| AMZN | FUNDING_EXTREME_LONG | 18 | -2.04% | 22% | -1.06% | 33% | +0.98% |
| AMZN | FUNDING_EXTREME_SHORT | 8 | +2.77% | 88% | +1.69% | 62% | -1.07% |

## Aggregated by side (trade-weighted)

| Signal | Trades | Prod avg | Funding-zero avg | Δ |
|---|---:|---:|---:|---:|
| FUNDING_EXTREME_LONG | 47 | -1.08% | -0.61% | +0.47% |
| FUNDING_EXTREME_SHORT | 56 | +1.43% | +0.53% | -0.90% |

