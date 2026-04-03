# Head-to-Head: Blind MM vs. Phase 1 MM — 10,000 Fresh Auctions

*Seed: 112956 | Completed in 1.3s*

---

## Auction Universe

| Stat | Value |
|------|-------|
| Auctions | 10,000 |
| YES outcomes | 3644 (36.4%) |
| NO outcomes | 6356 (63.6%) |
| Traders per auction | 8–20 (random) |

---

## Market Maker P&L Comparison

| Metric | Blind MM | Phase 1 MM | Delta |
|--------|----------|-----------|-------|
| **Mean P&L** | **-$21781.04** | **-$1844.66** | **+$19936.39** |
| **Mean + fees** | -$21728.51 | -$1828.40 | |
| Median | -$11663.12 | -$984.59 | +$10678.53 |
| Std Dev | $21635 | $3719 | 83% lower |
| Sharpe | -1.007 | -0.496 | 0.511 |
| **Win Rate** | **4.3%** | **40.7%** | **+36.4pp** |
| 5th percentile | -$68051.56 | -$7792.48 | |
| 25th percentile | -$35561.93 | -$5583.88 | |
| 75th percentile | -$5940.07 | +$2086.26 | |
| 95th percentile | -$343.42 | +$2452.00 | |
| **Worst** | **-$86873.56** | **-$8231.56** | 91% better |
| Best | +$4263.83 | +$2545.00 | |
| Cumulative | -$217810429.17 | -$18446551.65 | **+$199363877.52** saved |

---

## Volume & Market Quality

| Metric | Blind | Phase 1 | Change |
|--------|-------|---------|--------|
| Trades/auction | 205 | 49 | -76% |
| Volume/auction | $26430 | $8401 | -68% |
| Fees/auction | $52.54 | $16.25 | |
| P2P fill rate | 15.9% | 22.2% | |

---

## Phase 1 Defense Activations

| Defense | Activations | Per Auction |
|---------|------------|------------|
| Position cap blocks | 1,370,050 | 137.0 |
| Size clips | 48,303 | 4.8 |

---

## Trader Tier P&L (both modes)

| Tier | Blind Avg/Trader | Phase 1 Avg/Trader | Blind Win% | Phase 1 Win% |
|------|-----------------|-------------------|-----------|-------------|
| Insiders | +$2160.44 | +$430.16 | 99.8% | 81.0% |
| Semi-informed | +$1955.96 | +$390.57 | 94.9% | 72.8% |
| Retail | +$1267.92 | -$22.83 | 71.0% | 56.4% |
| Degens | +$568.27 | -$299.58 | 61.7% | 45.5% |

---

## Summary

- **92% reduction** in average losses ($21781 → $1845)
- **91% reduction** in worst-case loss ($86874 → $8232)
- **+36.4pp** win rate improvement (4.3% → 40.7%)
- Remaining avg loss of $1845/auction is in range for fee rebates + deposit subsidies to close the gap