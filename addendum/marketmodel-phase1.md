# Monte Carlo: 10,000 Auctions — Phase 1 Defenses Active

*Completed in 0.6s*

## Phase 1 Risk Controls

| Defense | Setting |
|---------|---------|
| 1a. Position cap | $5,000 max net directional per market |
| 1b. Inventory skew | 1¢ base + 0.5¢ per $500 exposure |
| 1c. Time withdrawal | Pull quotes final 10s |
| 1d. Max fill size | $500 per trade |

## Defense Activation Stats

| Event | Count | Avg per Auction |
|-------|-------|-----------------|
| Position cap blocks | 1,354,008 | 135.4 |
| Size clips (reduced fill) | 47,553 | 4.8 |
| Withdrawal seconds | 100,000 | 10.0 |

---

## Market Maker P&L — Phase 1 vs. Blind

| Statistic | **Phase 1 (defended)** | Blind (baseline) | Improvement |
|-----------|----------------------|-----------------|-------------|
| **Mean P&L** | **-$2730.10** | -$18921.36 | +86% |
| **Mean + fees** | **-$2714.88** | -$18869.13 | +86% |
| Median | -$2929.00 | -$11214.70 | +74% |
| Std Dev | $4165.23 | $23236.58 | +82% |
| Sharpe | -0.655 | -0.814 | 0.159 |
| Win Rate | **39.1%** | 17.6% | 21.5pp |
| 5th pctile | -$8095.73 | -$75870.49 | |
| 95th pctile | +$2474.00 | +$1878.49 | |
| Worst | -$8510.00 | -$79145.90 | +89% |
| Best | +$2606.00 | +$4773.80 | |

---

## Trader Tier Performance

| Tier | Count | Total P&L | Avg/Trader | Win Rate |
|------|-------|-----------|-----------|----------|
| Insiders (>70%) | 39,470 | **+$17544174.86** | +$444.49 | 82.5% |
| Semi-informed (40-70%) | 40,025 | **+$18058297.04** | +$451.18 | 71.8% |
| Retail (20-40%) | 29,558 | **+$4028499.89** | +$136.29 | 59.1% |
| Degens (<20%) | 26,943 | **-$7485858.74** | -$277.84 | 42.4% |
| **Market Maker** | 10,000 | **-$27300977.67** | -$2730.10 | 39.1% |

---

## Volume & Fees

| Metric | Phase 1 | Blind | Change |
|--------|---------|-------|--------|
| Avg trades/auction | 43 | 185 | |
| Avg volume/auction | $8089.93 | $26,462.98 | |
| Avg fees/auction | $15.21 | $52.23 | |
| P2P fill rate | 13.6% | 9.6% | |

---

## Conclusion

Phase 1 defenses improved average MM P&L by **$16191.26** per auction (+86% reduction in losses).

Tail risk cut from -$79145.90 to -$8510.00 worst case (+89% improvement).

Position cap blocked 1,354,008 fills that would have increased exposure beyond $5,000.

Next step: Phase 2 (insider detection + toxicity scoring) to further reduce adverse selection losses.