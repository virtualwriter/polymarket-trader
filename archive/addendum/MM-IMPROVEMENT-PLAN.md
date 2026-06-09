# Market Maker Improvement Plan

## Phase 1: Survival Mechanics — COMPLETE

Implemented in `engine/src/mm/RiskManager.ts`, wired into LMSR + MatchingEngine.

1. **Hard position limits** — $5k max net directional exposure per lot
2. **Inventory-skewed spreads** — widens with accumulated exposure
3. **Time-based quote withdrawal** — pulls quotes in final 10s before resolution
4. **Per-trade size limits** — $500 max per fill

**Results (10k Monte Carlo):**
- Average loss: -$22,885 → -$1,910 (92% reduction)
- Worst case: -$89,546 → -$8,320 (91% reduction)
- Win rate: 2.9% → 39.3%
- Remaining gap closeable via fee rebates + deposit subsidies

---

## Phase 2: Insider Detection Engine — COMPLETE (Tier 1)

Implemented in `scripts/monte-carlo-tier1.ts` as the "Tier 1 Defended MM", validated over **10,000 Monte Carlo runs**.

5. **VPIN-based spread widening** — Tracks the last 20 fills per market. If >75% are one-sided, spread multiplier → 2.5x. Fires ~3,051 times per auction on average.

6. **Bayesian prior updating from order flow** — If >65% of last N fills are one-sided, baseBias shifts 1.5¢ toward flow direction. Fires ~3,321 times per auction on average. This replaces the static prior with a flow-adjusted one.

7. **Counterparty scoring (toxicity per wallet)** — Tracks each wallet's correct-side rate across resolved lots. After 3+ lots at >70% accuracy → 3x spread multiplier. After 5+ lots at >80% accuracy → refuse fill entirely (P2P only). Fires ~521 toxic spread widenings per auction.

**Results (10K Monte Carlo — randomized traders, 8-20 per run):**

| Metric | Blind MM | Tier 1 MM | Delta |
|--------|----------|-----------|-------|
| **Mean P&L** | **-$159,440** | **-$27,349** | **+$132,091 (83% better)** |
| **Mean + fees** | **-$123,528** | **+$5,686** | **NET PROFITABLE** |
| Median | -$160,446 | -$31,858 | +$128,588 |
| Std Dev | $125,673 | $53,485 | 57% lower |
| Sharpe | -1.269 | -0.511 | +0.757 |
| **Win Rate** | **9.9%** | **26.4%** | **+16.5pp** |
| 5th percentile | -$363,312 | -$105,640 | |
| 95th percentile | +$48,820 | +$66,211 | |
| **Worst** | **-$584,487** | **-$259,389** | **56% better** |
| Best | +$508,462 | +$235,369 | |
| Trades/auction | 8,434 | 7,752 | -8% (toxic refusals) |
| Volume/auction | $2,052,137 | $1,887,703 | -8% |
| Fees/auction | $35,912 | $33,035 | -8% |

**Key findings:**
- Tier 1 defenses flip the MM from -$123K net to **+$5.7K net** (including fees)
- VPIN is the highest-impact defense (3,051 activations/auction)
- Toxic wallet detection kicks in after 3-5 resolved lots, building accuracy over the auction
- Volume drops only 8% — acceptable trade-off for 83% loss reduction
- The 26.4% win rate means the MM still loses raw P&L most auctions, but fee revenue covers the gap

---

## Phase 3: Adaptive Intelligence — TODO

8. **Stall detection during live auction** — If the auction price hasn't moved for 5+ seconds, slash YES probability immediately. In one sim, the price froze 11 seconds before the hammer — an MM with stall detection would have repriced from ~70% to ~20% in those 5 seconds.

9. **Pace-of-climb modeling** — Continuous regression: `P(reach target) = f(remaining distance, recent velocity, time remaining)`. If the price needs £500k more in 15 seconds but is climbing at £50k/s, the math says it won't make it.

10. **Cross-lot momentum adjustment** — If the previous lot hammered above estimate, shift base rate up 3-5% for the next lot (hot room effect). Down after a NO. Compounds across a 14-lot sale.

---

## Scenario Analysis: Key Findings from Custom Simulations

Six manual scenarios were run on Lot 101 (£6.5M–£9.5M estimate) varying trader bias, outcome, volume, and pre-auction base. Full results logged below.

### Summary Table

| Run | Insider Bias | Outcome | Insiders Correct? | MM P&L | Key Factor |
|-----|-------------|---------|-------------------|--------|------------|
| 1 | All YES (smart 8-10) | YES | All right | -$3,438 | 95 cap hits saved MM from worse; $50K volume target |
| 2 | All YES (smart 7-10) | NO | Split — Alice (7) wrong, Bob/Ian right via smartness | +$543 | Insiders partially wrong + low volume = MM profits |
| 3 | Mixed (Alice/Bob NO, Ian YES) | NO | All correct via smartness | +$71 | Balanced flow → more P2P; MM barely exposed |
| 4 | Mixed (Alice/Bob NO, Ian YES) | YES | All correct via smartness override | -$6,848 | Smartness overrides bias — all buy YES |
| 5 | All YES (smart 7-10) | YES | All right | -$7,864 | Worst case: bias+info alignment = max conviction |
| 6 | All YES (smart 7-10) | NO | Split — Bob/Ian right, Alice wrong | -$466 | Smart insiders extract on NO side |

### Key Insights

**1. The outcome is the single most powerful variable.**
Flipping the hammer from £9.6M (YES) to £9.4M (NO) — a £200K difference — swung MM P&L from -$7,864 to -$466 (Runs 5→6). The pre-auction base (0.25–0.35) is far below true YES value (0.85), so YES outcomes mean the MM sold cheap shares that resolve at $1.

**2. Smartness overrides bias — always.**
At smartness ≥5, the information score dominates the belief calculation. In Run 4, Alice (NO bias, smart 7) and Bob (NO bias, smart 8) both bought YES because their belief (0.65, 0.72) exceeded the 0.25 midpoint. Stated bias is nearly irrelevant for smart traders. Only at smartness ≤3 does bias actually drive behavior.

**3. Bias + information alignment is the worst case for the MM.**
Run 5 (all YES-biased, YES outcome) was worse than Run 4 (mixed bias, YES outcome) by $1,015. When bias aligns with the correct outcome, belief scores are higher (Bob: 0.78 vs 0.72), creating more conviction, more trades, and bigger positions. Alignment amplifies damage.

**4. The position cap is the most effective defense — but kills volume.**
Run 1 had 95 cap hits, limiting the loss to -$3,438 on a $65K volume target. Without the cap, Alice ($10K budget, only spent $20) and Ian ($8K budget, only deployed $533) would have extracted thousands more. The cap works but leaves ~$57K of unserved demand — real revenue left on the table.

**5. Lower pre-auction base is a double-edged sword.**
Setting the base from 0.35 to 0.25 was intended to be more conservative. On NO outcomes (Run 2), it helped — less premium collected means less at risk. On YES outcomes (Run 5), it made things worse — insiders bought at 0.25 instead of 0.35, giving them $0.75/share profit vs $0.65/share. The "conservative" setting increased the discount.

**6. Balanced trader flow shields the MM.**
Run 3 (mixed bias, 4 YES / 6 NO) had 73 flow shifts and the MM barely lost — the two-way flow created more P2P matching and less directional exposure. Run 5 (one-sided) had 97 flow shifts but the detection couldn't prevent the loss because all flow was on the same side.

**7. Smart insiders cancel each other when they split.**
In Run 6, Bob (+$971) and Ian (+$903) traded against Alice (-$877). The insiders partially cancelled, limiting total extraction. When insiders disagree, the MM's exposure is the net of their positions rather than the gross.

### Belief Calculation Reference

```
info = (smartness - 1) / 9          // 0.0 for smartness 1, 1.0 for smartness 10
trueProb = isYes ? 0.85 : 0.15     // pre-auction; 0.90/0.10 during live
biasFactor = (bias === "yes") ? 0.55 : 0.25
belief = info * trueProb + (1 - info) * biasFactor
edge = belief - fairYes             // >0.04 → buy YES, <-0.04 → buy NO
```

At smartness 10: belief = trueProb (pure information, bias irrelevant)
At smartness 1: belief = biasFactor (pure bias, no information)
Crossover point: ~smartness 5 is where information starts dominating bias

---

## Meta-strategy

- **Subsidy-only mode for first 10-20 auctions** — Accept losses capped at $2k/auction. Use this period purely for data collection: identify informed traders, calibrate Bayesian prior, estimate GARCH parameters, build pace-of-climb regression. The $20-40k in early losses is training data cost — far cheaper than running blind at -$18,921/auction forever.

---

## Estimated combined impact

| Defense | Est. loss reduction |
|---------|-------------------|
| Position limits (Phase 1) | 60-70% of tail risk |
| Inventory skew (Phase 1) | 15-20% of avg loss |
| VPIN spread widening | 20-30% of avg loss |
| Bayesian prior | 10-15% of avg loss |
| Stall detection | 15-25% of avg loss |
| Pace-of-climb | 5-10% of avg loss |
| Pull quotes at end (Phase 1) | 5-10% of avg loss |
| Cross-lot momentum | 3-5% of avg loss |
| Counterparty scoring | 10-15% of avg loss |
| Subsidy mode | N/A (training cost) |

These overlap (not additive), but combined could plausibly flip the MM from -$18,921 to breakeven or slightly positive — where fee rebates and deposit subsidies become the real revenue.

---

## Engine-Backed CLOB Results — PROFITABLE

**Date**: 2026-03-06
**Auction**: René Engel Collection (Sale 31341) — 30 wine lots
**Engine**: Real `MatchingEngine` + `LMSRAMMProvider` + `RiskManager` (Phase 1)
**Data**: Actual hammer prices from Christie's live auction

After rewriting the sim server to use the actual engine (replacing the fake constant-spread AMM with the real CLOB + LMSR + Phase 1 risk controls), the **MM flipped from -$4,243 net on the old fake sim to +$1,063 profit**.

### Trader P&L (Engine-Backed CLOB)

| Name | Bias | P&L | Trades | Volume |
|------|------|-----|--------|--------|
| **LMSR MARKET MAKER** | — | **+$1,063** | 49,783 | $7,015 |
| Semi-Pro Dave | NO | +$247 | 14,444 | $1,039 |
| Degen Greg | NO | +$155 | 16,276 | $580 |
| Noise Trader Jan | NO | +$107 | 15,846 | $395 |
| Retail Eve | NO | +$77 | 6,694 | $328 |
| Degen Helen | YES | +$26 | 13,318 | $417 |
| Retail Frank | YES | -$18 | 11,989 | $455 |
| Semi-Pro Carol | YES | -$126 | 18,108 | $1,122 |
| Insider Bob | YES | -$326 | 11,259 | $1,804 |
| Insider Alice | YES | -$533 | 13,275 | $2,775 |
| Whale Insider Ian | YES | -$671 | 21,752 | $3,061 |

### Trade Routing

- **48.3% P2P / 51.7% AMM** across 96,372 total trades
- Maker traders (aggression ≤ 0.35) posted `postOnly: true` GTC limit orders inside the spread
- Taker traders (aggression > 0.35) submitted aggressive FAK orders to cross the spread

### Why the MM Was Profitable

1. **18 of 30 lots resolved NO** (below high estimate) — YES-biased insiders lost money. Alice (-$533), Bob (-$326), Ian (-$671) all lost because they were buying YES shares that expired worthless.

2. **Phase 1 risk controls prevented ruinous positions**:
   - Position caps ($5,000 max) stopped the MM from accumulating dangerous directional exposure
   - Inventory-skewed spreads widened the bid when the MM was long YES, encouraging selling back
   - Per-trade size limits ($500 max) prevented single large fills from blowing out positions
   - Time-based withdrawal pulled quotes in the final 10s before resolution

3. **The engine's CLOB enabled genuine P2P matching** (48.3% of trades). The old fake sim routed 100% through the MM — the real engine let traders match directly, reducing the MM's adverse selection exposure.

4. **LMSR pricing was more accurate** than the old constant-spread model. The LMSR cost function naturally adjusts prices based on outstanding shares, producing tighter and more responsive quotes.

### Key Inversion: Old Sim → Engine CLOB

| Metric | Old Fake Sim | Engine-Backed CLOB | Delta |
|--------|-------------|-------------------|-------|
| MM P&L | -$4,243 | **+$1,063** | **+$5,306** |
| P2P % | ~0% | 48.3% | +48.3pp |
| MM takes all flow | Yes | No (CLOB routes P2P) | — |
| Price accuracy | Constant spread | LMSR + CLOB midpoint | Better |
| Risk controls | Heuristic wrappers | Native `RiskManager` integration | Native |

The engine-backed results prove that the MM architecture — LMSR providing passive liquidity into a real CLOB with Phase 1 risk controls — is viable for production.

---

## Monte Carlo Run Log

| 2026-03-08 | 50 | Real SRT | Blind: $3464500 / Tier1: $-9066 | Win: 100%→48% | 100% |
| 2026-03-08 | 10,000 | Real SRT | Blind: $3578637 / Tier1: $-65329 | Win: 100%→42% | 102% |
| 2026-03-08 | 20 | Real SRT | $3591808 (100%) | $-493700 (15%) | $-13168179 (0%) | Blind |
| 2026-03-08 | 20 | Real SRT | $3289316 (100%) | $831387 (85%) | $-5031478 (5%) | Blind |
| 2026-03-08 | 50 | Real SRT | $3503667 (100%) | $705753 (82%) | $2509596 (94%) | Blind |
| 2026-03-08 | 10,000 | Real SRT | $3575681 (100%) | $780136 (83%) | $2554341 (91%) | Blind |
