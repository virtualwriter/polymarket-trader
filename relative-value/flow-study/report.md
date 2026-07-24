# Informed Flow Study: Are Dip Buyers Smart Money?

Generated: 2026-07-22T17:40:19+00:00

## Theory
Dip-contract YES flow is informed (hedgers / macro fear with signal); high-contract YES flow is
lottery money. Tested with wallet-level tapes plus market-level lead-lag and regime controls.

## Data
- 262 resolved touch/settlement markets pulled; 595,589 trades; 2 tapes truncated by API cap
- 106,720 unique wallets, 221,338 wallet-market records across 222 touch markets

## 0. Precondition: is wallet skill persistent (not luck)?
- Wallets with >=5 markets in each half: 867
- Spearman(ROI first half, ROI second half) = 0.216

## 1. Smart-share test (walk-forward classified wallets)
- Mean smart share of net-YES exposure: dips 6.6% vs highs 2.6% (diff 4.0%, 95% CI [2.2%, 6.1%], p=0.000)
- Mean dumb share: dips 9.7% vs highs 18.3% (diff -8.6%, p=0.000)
- Smart-cohort net stance agrees with resolution: 124/198 = 62.6% (CI 55.7%-69.1%)
- Dumb-cohort net stance agrees: 29/216 = 13.4%
- Verdict: SUPPORTED (p<0.05)

## 2. Predictive lift (entry-time flow beyond PM price)
- Walk-forward scored markets: 162 (of 222)
- AUC price-only 0.863 vs price+flow 0.865
- Log-loss price-only 0.395 vs price+flow 0.396
- Markets with nonzero classified flow at entry: 86.0%

## 3. Size fingerprint (YES-token buys)
- Median YES-buy: dips $7.72 vs highs $6.07 (diff $1.65, p=0.000)
- Share of YES-buys <= $10: dips 56.9% vs highs 61.3%
- YES-buys per market (median): dips 194 vs highs 208

## 4. Wallet freshness (account age at YES-buy)
- Median age: dips 32.4d vs highs 42.1d (diff -9.7d, p=0.000)
- Share of buys from wallets < 7 days old: dips 38.0% vs highs 31.4%
- Age coverage: 24,003/114,547 trades

## 5. Lead-lag (market-level, no wallets)
Event: PM-vs-model gap widens >=2 pts in 1h with PM rising. Forward spot return vs asset baseline.
- Dip richening, 24h: -0.38% vs baseline (p=0.001) -> spot falls after dip fear: SUPPORTED (p<0.05)
- Dip richening, 72h: -0.54% (p=0.007)
- High richening, 24h: -0.20% vs baseline (p=0.121) -> informed would be positive; negative/flat = chasing
- High richening, 72h: -0.45% (p=0.046)

## 6. Regime control (trailing 7d spot trend at entry)
- down-tape: dips n=32 hit 50.0%, highs n=50 hit 6.0%; smart share dips 8.2% vs highs 2.1%
- up-tape: dips n=7 hit 57.1%, highs n=7 hit 14.3%; smart share dips 14.9% vs highs 4.1%

## Caveats
- Wallet skill measured only within these markets (not full Polymarket history).
- Tapes are taker fills from the public data API; a few high-volume tapes truncated at the 10k cap.
- Sample period (May-Jul 2026) was mostly a falling tape; regime split above is the control.
