# Trading Engine Learning Journal
<!-- compacted 2026-07-14: older entries archived to data/journal-archive/ -->

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 10 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_opt_iv_30d = 37.7 is 3.1 std devs from mean (24.31 ± 4.26)
- [correlation_flip] GOLD-OIL correlation shifted from -0.41 to 0.67. Rolling correlation: 24h=0.06, 7d=-0.92, 30d=0.46. Current 24h corr is at 47th pct of last 30 daily 24h-rolling values (range -0.94 to 0.86).

**Blocked signal learning:**
- Open blocked shadows: 58
- Resolved blocked shadows: 515 (298 wins / 217 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.16%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.22%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.11%)

**LLM analysis:**
No clear new edges emerged. Existing PC RATIO EXTREME LOW short on OIL saw P/C ratio normalize from 0.405 to 0.445, but remains in bottom 2nd percentile of 30d range, so thesis still intact. HYPE funding negative and OI stable support potential H-521 re-evaluation, but conditions not explicit. Gold IV anomaly likely reflects macro uncertainty rather than actionable mean reversion. Continue monitoring BTC PM IV for H-523 trigger.

---

### 2026-07-11 20:35 UTC

**Portfolio:** $98.70 total | Cash $91.70 | 7 open | P&L $1.2869 | 61% win rate (446 trades)

**Closed 1 trades:**
- ✅ BX long via hyperliquid/hl_perp [HL BX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0211 (2.1%, market 0.0212, funding -0.0001)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 10 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [divergence] GOLD PM-Options IV gap moved wider by 7.6pp (was -23.7, now -16.1)
- [correlation_flip] GOLD-OIL correlation shifted from -0.41 to 0.66. Rolling correlation: 24h=-0.14, 7d=-0.92, 30d=0.46. Current 24h corr is at 43th pct of last 30 daily 24h-rolling values (range -0.94 to 0.82).

**Blocked signal learning:**
- Open blocked shadows: 56
- Resolved blocked shadows: 517 (298 wins / 219 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.11%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-5.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 7/12; next scheduled 2026-07-11T22:35:23.527Z). Mechanical cycle ran normally._

---

### 2026-07-11 21:36 UTC

**Portfolio:** $98.70 total | Cash $90.70 | 8 open | P&L $1.2869 | 61% win rate (446 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 10 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from -0.41 to 0.66. Rolling correlation: 24h=-0.48, 7d=-0.92, 30d=0.46. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.94 to 0.74).

**Blocked signal learning:**
- Open blocked shadows: 57
- Resolved blocked shadows: 517 (298 wins / 219 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.11%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-5.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
Closed OIL short after P/C ratio normalization eroded the contrarian edge. HYPE breakout continuation hypothesis remains valid. Gold/Oil correlation flip to positive 0.66 is notable and may be driven by broader macro factors; not yet actionable. The BIRD long from weekend funding reversion is deep in the red (-8.98%), highlighting risk of illiquid HL perps, but we cannot intervene. Overall portfolio is near flat, waiting for weekend reversion longs to mature.

**LLM close rejections today (2026-07-11, token-burn signal):**
- Total rejected close instructions: 1
- Top signal/asset pairs: PC_RATIO_EXTREME_LOW / OIL (1)

---

### 2026-07-11 23:35 UTC

**Portfolio:** $98.66 total | Cash $88.66 | 10 open | P&L $1.2200 | 61% win rate (450 trades)

**Closed 4 trades:**
- ✅ COST long via hyperliquid/hl_perp [HL COST Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: +$0.0176 (1.8%, market 0.0162, funding 0.0014)
- ❌ BIRD long via hyperliquid/hl_perp [HL BIRD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: $-0.0718 (-7.2%, market -0.0736, funding 0.0018)
- ✅ BX long via hyperliquid/hl_perp [HL BX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: +$0.0319 (3.2%, market 0.0319, funding 0.0000)
- ❌ OIL short via spot/spot [OIL spot] (PC_RATIO_EXTREME_LOW) → undefined: $-0.0223 (-2.2%, market -0.0223, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 10 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = 243.78 is 3.5 std devs from mean since 2026-04-28 (-9.11 ± 73.01)
- [correlation_flip] GOLD-OIL correlation shifted from -0.41 to 0.66. Rolling correlation: 24h=-0.68, 7d=-0.92, 30d=0.45. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.93 to 0.83).

**Blocked signal learning:**
- Open blocked shadows: 58
- Resolved blocked shadows: 517 (298 wins / 219 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.11%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-5.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 8/12; next scheduled 2026-07-12T01:35:22.780Z). Mechanical cycle ran normally._

---

### 2026-07-14 17:06 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1102 | 61% win rate (460 trades)

**Closed 10 trades:**
- ❌ RKLB long via hyperliquid/hl_perp [HL RKLB Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: $-0.0175 (-1.8%, market -0.0176, funding 0.0001)
- ✅ PLTR long via hyperliquid/hl_perp [HL PLTR Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: +$0.0100 (1.0%, market 0.0095, funding 0.0005)
- ✅ SNDK long via hyperliquid/hl_perp [HL SNDK Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: +$0.0084 (0.8%, market 0.0082, funding 0.0002)
- ❌ AMD long via hyperliquid/hl_perp [HL AMD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: $-0.0464 (-4.6%, market -0.0481, funding 0.0017)
- ❌ META long via hyperliquid/hl_perp [HL META Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: $-0.0028 (-0.3%, market -0.0028, funding 0.0000)
- ❌ ZM long via hyperliquid/hl_perp [HL ZM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: $-0.0299 (-3.0%, market -0.0345, funding 0.0046)
- ❌ TSM long via hyperliquid/hl_perp [HL TSM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: $-0.0044 (-0.4%, market -0.0050, funding 0.0007)
- ✅ HOOD long via hyperliquid/hl_perp [HL HOOD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: +$0.0165 (1.6%, market 0.0161, funding 0.0004)
- ✅ EBAY long via hyperliquid/hl_perp [HL EBAY Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → undefined: +$0.0000 (0.0%, market -0.0039, funding 0.0038)
- ✅ AMZN long via hyperliquid/hl_perp [HL AMZN perp] (FUNDING_EXTREME_SHORT) → llm_decision: +$0.0001 (0.0%, market 0.0002, funding -0.0001)

**Opened 1 positions:**
- GOLD long @ $4061 via spot/spot [GOLD spot] (PC_RATIO_EXTREME_HIGH)

**Hypothesis lifecycle:**
- 🧪 Opened 3 condition-triggered setup-family shadow tests from the first 25 LLM setup families.
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 2.862 is 6.6 std devs from mean (0.73 ± 0.33)
- [anomaly] btc_opt_iv_term_spread = -19.05 is -3.4 std devs from mean (-0.48 ± 5.47)
- [anomaly] btc_opt_iv_90d = 54.5 is 2.2 std devs from mean (39.82 ± 6.56)
- [correlation_flip] GOLD-OIL correlation shifted from -0.36 to 0.54. Rolling correlation: 24h=0.23, 7d=-0.87, 30d=0.46. Current 24h corr is at 67th pct of last 30 daily 24h-rolling values (range -0.91 to 0.92).

**Blocked signal learning:**
- Open blocked shadows: 57
- Resolved blocked shadows: 522 (300 wins / 222 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_YES_SHADOW HYPE long via polymarket would have edge compressed but trade lost money (-2.56%)
- ✅ Blocked: PC_RATIO_EXTREME_LOW GOLD short via spot would have expired (+1.67%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW OIL short via spot would have hit stop (-7.26%)

**LLM analysis:**
Closed AMZN long as funding normalized and flipped positive, removing the crowded-short thesis. BTC's term structure anomaly (30d IV 35.4 vs 90d IV 54.5, -19pt spread) is the most notable cross-venue datapoint today; this extreme backwardation may signal dealer hedging stress or a regime shift in options. Oil's persistent negative funding and weak spot suggest continued downside pressure; however, OIL FUNDING_EXTREME_SHORT is disabled, so no action. Current backlog of LLM shadow tests remains at 17/35 families needing more data – no new hypotheses should be proposed until that backlog clears.

---

### 2026-07-14 17:35 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1763 | 61% win rate (460 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 2.79 is 6.3 std devs from mean (0.73 ± 0.33)
- [anomaly] btc_opt_iv_term_spread = -17.55 is -3.1 std devs from mean (-0.49 ± 5.49)
- [anomaly] btc_opt_iv_90d = 53.4 is 2.1 std devs from mean (39.83 ± 6.56)
- [correlation_flip] GOLD-OIL correlation shifted from -0.36 to 0.54. Rolling correlation: 24h=0.09, 7d=-0.86, 30d=0.46. Current 24h corr is at 57th pct of last 30 daily 24h-rolling values (range -0.92 to 0.92).

**Blocked signal learning:**
- Open blocked shadows: 52
- Resolved blocked shadows: 527 (303 wins / 224 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+22.95%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.04%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.20%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 0.5h since last call; daily budget 1/12; next scheduled 2026-07-14T19:35:24.133Z). Mechanical cycle ran normally._

---

### 2026-07-14 18:28 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1763 | 61% win rate (460 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 2.583 is 5.6 std devs from mean (0.73 ± 0.33)
- [anomaly] btc_opt_iv_term_spread = -18.25 is -3.2 std devs from mean (-0.50 ± 5.50)
- [anomaly] btc_opt_iv_90d = 54 is 2.2 std devs from mean (39.84 ± 6.57)
- [correlation_flip] GOLD-OIL correlation shifted from -0.36 to 0.54. Rolling correlation: 24h=0.01, 7d=-0.86, 30d=0.46. Current 24h corr is at 53th pct of last 30 daily 24h-rolling values (range -0.92 to 0.91).

**Blocked signal learning:**
- Open blocked shadows: 55
- Resolved blocked shadows: 527 (303 wins / 224 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+22.95%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.04%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.20%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.4h since last call; daily budget 1/12; next scheduled 2026-07-14T20:28:12.510Z). Mechanical cycle ran normally._

---

### 2026-07-14 19:29 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1763 | 61% win rate (460 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 3.202 is 7.3 std devs from mean (0.73 ± 0.34)
- [anomaly] btc_opt_iv_term_spread = -18.44 is -3.2 std devs from mean (-0.52 ± 5.52)
- [anomaly] btc_opt_iv_90d = 54.1 is 2.2 std devs from mean (39.85 ± 6.58)
- [correlation_flip] GOLD-OIL correlation shifted from -0.36 to 0.53. Rolling correlation: 24h=-0.09, 7d=-0.85, 30d=0.45. Current 24h corr is at 47th pct of last 30 daily 24h-rolling values (range -0.92 to 0.89).

**Blocked signal learning:**
- Open blocked shadows: 52
- Resolved blocked shadows: 530 (303 wins / 227 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have edge compressed but trade lost money (-1.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO HYPE short via polymarket would have edge compressed but trade lost money (-0.52%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.33%)

**LLM analysis:**
Market showing early signs of crypto recovery with BTC bouncing back to 64.6k. The open gold long from PC_RATIO_EXTREME_HIGH is very early, but the P/C ratio has jumped to 3.2 (well above entry threshold), supporting the contrarian long thesis. No close warranted. One-touch NO edge remains a robust signal, so opening a BTC NO trade on the July $67,500 contract, where edge is solid and market quality meets all gates. Oil funding extreme short continues, but OIL is disabled from FUNDING_EXTREME_SHORT signal due to poor historical performance, so no trades there. Continue monitoring gold thesis.

---

### 2026-07-14 20:28 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1763 | 61% win rate (460 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 2.714 is 5.8 std devs from mean (0.74 ± 0.34)
- [anomaly] btc_opt_iv_term_spread = -18.05 is -3.2 std devs from mean (-0.53 ± 5.53)
- [anomaly] btc_opt_iv_90d = 53.3 is 2.0 std devs from mean (39.86 ± 6.58)
- [correlation_flip] GOLD-OIL correlation shifted from -0.35 to 0.53. Rolling correlation: 24h=-0.18, 7d=-0.85, 30d=0.45. Current 24h corr is at 47th pct of last 30 daily 24h-rolling values (range -0.92 to 0.86).

**Blocked signal learning:**
- Open blocked shadows: 53
- Resolved blocked shadows: 530 (303 wins / 227 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have edge compressed but trade lost money (-1.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO HYPE short via polymarket would have edge compressed but trade lost money (-0.52%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.33%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 2/12; next scheduled 2026-07-14T22:28:11.958Z). Mechanical cycle ran normally._

---

### 2026-07-14 21:28 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1763 | 61% win rate (460 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 2.714 is 5.7 std devs from mean (0.74 ± 0.34)
- [anomaly] btc_opt_iv_term_spread = -17.53 is -3.1 std devs from mean (-0.54 ± 5.55)
- [correlation_flip] GOLD-OIL correlation shifted from -0.35 to 0.53. Rolling correlation: 24h=-0.32, 7d=-0.84, 30d=0.44. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.92 to 0.82).

**Blocked signal learning:**
- Open blocked shadows: 52
- Resolved blocked shadows: 531 (304 wins / 227 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have edge compressed but trade lost money (-1.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO HYPE short via polymarket would have edge compressed but trade lost money (-0.52%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.33%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+3.30%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 2/12; next scheduled 2026-07-14T23:28:10.502Z). Mechanical cycle ran normally._

---

### 2026-07-14 22:29 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1763 | 61% win rate (460 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 2.714 is 5.7 std devs from mean (0.74 ± 0.35)
- [anomaly] btc_opt_iv_term_spread = -17.22 is -3.0 std devs from mean (-0.55 ± 5.56)
- [anomaly] btc_opt_iv_90d = 55.4 is 2.4 std devs from mean (39.87 ± 6.60)
- [correlation_flip] GOLD-OIL correlation shifted from -0.35 to 0.53. Rolling correlation: 24h=-0.48, 7d=-0.84, 30d=0.44. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.92 to 0.74).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 532 (305 wins / 227 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO HYPE short via polymarket would have edge compressed but trade lost money (-0.52%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.33%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+3.30%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
Today’s data reinforces the range-bound but risk-on leaning crypto environment despite macro bearishness. The relative-value heatmap continues to flag mispriced one-touch upside contracts; we initiate a shadow trade on BTC $80k July YES to test the H-526 cap-ratio buy strategy. The open GOLD long remains within mechanical and LLM constraints; no close action needed. The backlog of hypothesis shadow tests remains large, so we refrain from creating new setup families.

---

### 2026-07-14 23:28 UTC

**Portfolio:** $98.59 total | Cash $97.59 | 1 open | P&L $1.1763 | 61% win rate (460 trades)

**Hypothesis lifecycle:**
- 🧪 Hypothesis setup retest queue: 11 of the first 25 setup families did not trigger; 0 later setup families are waiting for the next batch.

**Statistical observations:**
- [anomaly] gold_gld_pc_ratio = 2.714 is 5.6 std devs from mean (0.74 ± 0.35)
- [anomaly] btc_opt_iv_term_spread = -20.32 is -3.5 std devs from mean (-0.56 ± 5.58)
- [anomaly] btc_opt_iv_90d = 54.6 is 2.2 std devs from mean (39.88 ± 6.61)
- [correlation_flip] GOLD-OIL correlation shifted from -0.35 to 0.52. Rolling correlation: 24h=-0.58, 7d=-0.84, 30d=0.44. Current 24h corr is at 30th pct of last 30 daily 24h-rolling values (range -0.91 to 0.78).

**Blocked signal learning:**
- Open blocked shadows: 52
- Resolved blocked shadows: 532 (305 wins / 227 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 16/20 shadows would have won, avg P&L 14.43%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 9/15 blocked trades would have won.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 11/20 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO HYPE short via polymarket would have edge compressed but trade lost money (-0.52%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.33%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+3.30%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 3/12; next scheduled 2026-07-15T01:28:08.500Z). Mechanical cycle ran normally._

---

