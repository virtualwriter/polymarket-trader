# Monte Carlo: 10,000 Auctions — Real SRT Data
## Blind vs Blanket Tier 1 vs Inventory-Aware Tier 1

*Generated 2026-03-08T20:05:41Z — 1084.0s*

### Data: Christie's "Art of the Surreal" Evening Sale, 5 Mar 2026
- 26 lots, 263 real bids, exact SRT timing
- 9 YES / 17 NO outcomes (fixed)
- Pre-auction: 60min (1800 ticks)
- Traders: 8-20 per run, randomized stats

### MM Defense Modes

| Mode | Description |
|------|-------------|
| **Blind** | No defenses. Takes all flow at base 0.5¢ half-spread. |
| **Blanket Tier 1** | VPIN (2.5x on one-sided flow), toxicity scoring (3x/refuse), Bayesian shifts. Applied to ALL flow regardless of MM inventory. |
| **Inventory-Aware** | Same tools, but only activates when the trade INCREASES MM's existing exposure. Trades that reduce exposure are welcomed. Spread scales with exposure magnitude. |

---

### Market Maker P&L Comparison

| Metric | Blind | Blanket T1 | Inventory T1 |
|--------|-------|------------|--------------|
| **Mean P&L** | **$3575681** | **$780136** | **$2554341** |
| **Mean + fees** | $4006810 | $1179106 | $2988838 |
| Median | $3493230 | $725246 | $2561740 |
| Std Dev | $1263474 | $830542 | $1879682 |
| Sharpe | 2.830 | 0.939 | 1.359 |
| **Win Rate** | **100.0%** | **83.2%** | **91.2%** |
| 5th pctile | $1675017 | $-488577 | $-553894 |
| 95th pctile | $5816023 | $2247869 | $5654851 |
| Worst | $401936 | $-2271967 | $-6019880 |
| Best | $9593239 | $4967074 | $10032356 |

### Volume & Activity

| Metric | Blind | Blanket T1 | Inventory T1 |
|--------|-------|------------|--------------|
| Trades/auction | 98262 | 90645 | 99196 |
| Volume/auction | $24635938 | $22798294 | $24828392 |
| Fees/auction | $431129 | $398970 | $434497 |
| Pre/Live | 94883/3378 | 87781/2864 | 95798/3398 |
| Defense acts | — | 25634 | 3478 |

---

### Winner: **Blind** (by net P&L after fees)

- Inventory vs Blind: -1021340 raw, -1017972 net
- Inventory vs Blanket: +1774204 raw, +1809731 net

### Key Insight

The blind MM is profitable (+$3575681/auction) on this specific auction because 17/26 lots resolve NO — the structural edge from selling YES shares at ~50¢ that expire worthless dominates. Blanket Tier 1 defenses destroy this edge by blocking profitable flow. The inventory-aware mode preserves the structural advantage while still defending against dangerous accumulation.

---

*Next: Phase 2 — stall detection, pace-of-climb, cross-lot momentum*
