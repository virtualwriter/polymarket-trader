# Trading Engine Learning Journal
<!-- compacted 2026-09-10: older entries archived to data/journal-archive/ -->

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1015 (520 wins / 495 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-4.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+2.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)

**LLM analysis:**
Close review at 2026-09-09T16: no open positions, so no discretionary closes are eligible. Macro remains bearish/hawkish; BTC looks rangebound with PM EV still carrying premium; oil funding deeply negative and SPY soft. Shadow one-touch warnings persist but are not actionable until promoted. No hypothesis or parameter changes here.

---

### 2026-09-09 17:28 UTC

**Portfolio:** $103.79 total | Cash $103.79 | 0 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -411.9 is -5.5 std devs from mean since 2026-04-28 (-12.67 ± 72.66)
- [anomaly] hype_med_max = 122.3 is 2.3 std devs from mean (83.67 ± 16.49)
- [anomaly] hype_pm_ev = 90.4 is 2.2 std devs from mean (62.60 ± 12.44)

**Blocked signal learning:**
- Open blocked shadows: 24
- Resolved blocked shadows: 1016 (520 wins / 496 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+2.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 7/12; next scheduled 2026-09-09T19:28:27.832Z). Mechanical cycle ran normally._

---

### 2026-09-09 18:28 UTC

**Portfolio:** $103.79 total | Cash $103.79 | 0 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -428.24 is -5.7 std devs from mean since 2026-04-28 (-12.82 ± 73.08)
- [anomaly] hype_med_max = 122.3 is 2.3 std devs from mean (83.68 ± 16.50)
- [anomaly] hype_pm_ev = 90.65 is 2.3 std devs from mean (62.61 ± 12.45)

**Blocked signal learning:**
- Open blocked shadows: 24
- Resolved blocked shadows: 1016 (520 wins / 496 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+2.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 7/12; next scheduled 2026-09-09T20:28:20.054Z). Mechanical cycle ran normally._

---

### 2026-09-09 19:28 UTC

**Portfolio:** $103.79 total | Cash $103.79 | 0 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -461.53 is -6.1 std devs from mean since 2026-04-28 (-12.99 ± 73.57)
- [anomaly] hype_med_max = 122.3 is 2.3 std devs from mean (83.70 ± 16.51)
- [anomaly] hype_pm_ev = 90.4 is 2.2 std devs from mean (62.62 ± 12.45)

**Blocked signal learning:**
- Open blocked shadows: 24
- Resolved blocked shadows: 1016 (520 wins / 496 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+2.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)

**LLM analysis:**
No open positions to review. Engine state shows two candidate entries, but entries are not in scope for the hourly close review. Notable context: BTC funding normalized materially, oil carry remains extremely negative, and several one-touch NO edge shadows remain blocked by quality gates. Macro stays bearish/hawkish, so any promoted-signal opens should be watched closely for funding and carry behavior.

---

### 2026-09-09 20:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Opened 1 positions:**
- GOLD short @ $4399 via hyperliquid/hl_perp [HL GOLD perp] (FUNDING_EXTREME_LONG)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -502.19 is -6.6 std devs from mean since 2026-04-28 (-13.17 ± 74.15)
- [anomaly] hype_med_max = 122.3 is 2.3 std devs from mean (83.71 ± 16.53)
- [anomaly] hype_pm_ev = 89.84 is 2.2 std devs from mean (62.63 ± 12.46)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1016 (520 wins / 496 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+2.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 1.0h since last call; daily budget 8/12; next scheduled 2026-09-09T22:28:21.380Z). Mechanical cycle ran normally._

---

### 2026-09-09 21:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 Opened 1 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 3 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -305.78 is -3.9 std devs from mean since 2026-04-28 (-13.27 ± 74.35)
- [anomaly] hype_med_max = 122.4 is 2.3 std devs from mean (83.72 ± 16.54)
- [anomaly] hype_pm_ev = 90.08 is 2.2 std devs from mean (62.64 ± 12.47)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 2.0h since last call; daily budget 8/12; next scheduled 2026-09-09T23:28:27.174Z). Mechanical cycle ran normally._

---

### 2026-09-09 22:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 25 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] btc_hl_funding_ann = -11.4 is -2.5 std devs from mean (6.20 ± 7.00)
- [anomaly] hype_med_max = 122.4 is 2.3 std devs from mean (83.74 ± 16.55)
- [anomaly] hype_pm_ev = 89.39 is 2.1 std devs from mean (62.65 ± 12.48)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
Reviewed the open GOLD short (FUNDING_EXTREME_LONG) but it is only 2.0h into a 72h hold and below the 12h discretionary close minimum, so no close action is permitted. The thesis is not invalidated: gold HL funding remains elevated at 31.51% annualized and spot is only +0.14% since entry; the move from 36.02% to 31.51% funding is cooling but still deep in crowded-long territory. PnL is roughly flat at -0.13%. Will re-evaluate after the min hold window if funding normalizes materially or price action breaks the signal premise.

---

### 2026-09-09 23:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 26 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_med_max = 122.5 is 2.3 std devs from mean (83.75 ± 16.56)
- [anomaly] hype_pm_ev = 89.4 is 2.1 std devs from mean (62.66 ± 12.49)
- [anomaly] btc_hl_funding_ann = -7.95 is -2.0 std devs from mean (6.19 ± 7.01)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 1.0h since last call; daily budget 9/12; next scheduled 2026-09-10T01:28:17.077Z). Mechanical cycle ran normally._

---

### 2026-09-10 00:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 3 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 26 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_med_max = 122.4 is 2.3 std devs from mean (83.76 ± 16.58)
- [anomaly] oil_hl_funding_ann = -174.2 is -2.2 std devs from mean since 2026-04-28 (-13.43 ± 74.47)
- [anomaly] hype_pm_ev = 89.46 is 2.1 std devs from mean (62.67 ± 12.49)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 2.0h since last call; daily budget 0/12; next scheduled 2026-09-10T02:28:19.594Z). Mechanical cycle ran normally._

---

### 2026-09-10 02:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_med_max = 120 is 2.2 std devs from mean (83.78 ± 16.59)
- [anomaly] hype_pm_ev = 88.61 is 2.1 std devs from mean (62.68 ± 12.50)
- [anomaly] oil_hl_funding_ann = -167.99 is -2.1 std devs from mean since 2026-04-28 (-13.49 ± 74.51)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
Reviewed open GOLD short T-1788985701424-wtmc. The signal-family evidence has round-tripped: gold_hl_funding_ann fell from +32.80% at entry to +5.48%, crossing back through the +15% entry threshold and materially normalizing, which would argue for thesis_invalidated. However, the ALLOWED ACTION SURFACE shows allowed=false because the position is only 6.0h old versus the 12h minimum hold. No discretionary close emitted; will re-evaluate after the min-hold window if funding remains normalized.

---

### 2026-09-10 03:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] GOLD PM-Options IV gap moved narrower by 5.5pp (was -11.5, now -17.0)
- [anomaly] oil_hl_funding_ann = -177.17 is -2.2 std devs from mean since 2026-04-28 (-13.55 ± 74.56)
- [anomaly] hype_pm_ev = 88.65 is 2.1 std devs from mean (62.69 ± 12.51)
- [anomaly] hype_med_max = 117.5 is 2.0 std devs from mean (83.79 ± 16.60)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 1/12; next scheduled 2026-09-10T05:28:16.654Z). Mechanical cycle ran normally._

---

### 2026-09-10 04:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 26 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] GOLD PM-Options IV gap moved wider by 5.5pp (was -17.0, now -11.5)
- [anomaly] oil_hl_funding_ann = -186.58 is -2.3 std devs from mean since 2026-04-28 (-13.61 ± 74.62)
- [anomaly] hype_pm_ev = 88.61 is 2.1 std devs from mean (62.69 ± 12.52)
- [anomaly] hype_med_max = 117.5 is 2.0 std devs from mean (83.80 ± 16.61)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 1/12; next scheduled 2026-09-10T06:28:24.919Z). Mechanical cycle ran normally._

---

### 2026-09-10 05:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 Opened 1 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -194.81 is -2.4 std devs from mean since 2026-04-28 (-13.68 ± 74.69)
- [anomaly] hype_pm_ev = 88.43 is 2.1 std devs from mean (62.70 ± 12.52)
- [anomaly] hype_med_max = 117.5 is 2.0 std devs from mean (83.81 ± 16.62)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
Reviewed open GOLD short T-1788985701424-wtmc: funding signal has materially weakened from 32.8% annualized at open to 12.96%, crossing back below the +15% entry threshold, while spot has risen +0.50% against the position. This would normally support thesis_invalidated, but ALLOWED ACTION SURFACE shows allowed=false (9.0h open vs 12.0h min hold), so no discretionary close is emitted. Position remains within mechanical stop/target; re-evaluate after min hold if funding stays normalized.

---


### Nightly research advice ingested (generatedAt=2026-09-10T07:12:12.919Z, model=deepseek-v4-pro)
- Hypotheses added: 5 (rejected 2); reviews applied: 6; invalidated assumptions learned: 3; param updates: none.
- Strategy review: Working: the Polymarket NO/YES-overpricing edge remains the strongest book—panel cuts (FIND-0065/0067/0069/0070) still show 58–78% win rates against a 49% base with positive holdout means, while ONE_TOUCH_HIGH_EDGE_NO live is 4/4 at +18.42% and USER_PM_IV_TOUCH_RICH_NO shadows are 9/10. The clean weekend HL funding reversion family is also profitable in aggregate (425/612 live, +0.18%; 188/253 shadow, +0.99%). Failing: per-name shadow-mined funding thresholds (CBRS/AAPL/MU) have decayed to 38–50% win rates, the GOLD no-bias/one-touch cap-edge families are mis-authored as spot >2% calls when th
- Nightly journal: Tonight's main lesson is that many struggling shadow-mined variants are not just weak—they are tested on the wrong outcome or the wrong condition. GOLD no-bias/one-touch edge families need contract-P&L exams, not spot >2% calls. The per-name funding reversion signals need regime-relative extreme conditions plus normalization turn, not static -10% thresholds. The clean house edge continues to be YES overpricing localized through the panel cuts; we added tight-spread and liquidity-guarded near-dated NO siblings under FIND-0067 and FIND-0069 rather than adding more loose panel variants. No weeken
### 2026-09-10 07:28 UTC

**Portfolio:** $103.79 total | Cash $102.79 | 1 open | P&L $7.0317 | 64% win rate (948 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 26 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -221.03 is -2.8 std devs from mean since 2026-04-28 (-13.76 ± 74.78)
- [anomaly] hype_med_max = 120 is 2.2 std devs from mean (83.83 ± 16.63)
- [anomaly] hype_pm_ev = 88.16 is 2.0 std devs from mean (62.71 ± 12.53)

**Blocked signal learning:**
- Open blocked shadows: 25
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 2/12; next scheduled 2026-09-10T09:28:28.565Z). Mechanical cycle ran normally._

---

### 2026-09-10 08:28 UTC

**Portfolio:** $103.79 total | Cash $103.79 | 0 open | P&L $7.0299 | 64% win rate (949 trades)

**Closed 1 trades:**
- ❌ GOLD short via hyperliquid/hl_perp [HL GOLD perp] (FUNDING_EXTREME_LONG) → llm_decision: $-0.0018 (-0.2%, market -0.0020, funding 0.0002)

**Hypothesis lifecycle:**
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 25 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -244.24 is -3.1 std devs from mean since 2026-04-28 (-13.84 ± 74.90)
- [anomaly] hype_pm_ev = 88.5 is 2.1 std devs from mean (62.72 ± 12.54)
- [anomaly] hype_med_max = 117.5 is 2.0 std devs from mean (83.84 ± 16.64)

**Blocked signal learning:**
- Open blocked shadows: 29
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
Reviewed the open GOLD FUNDING_EXTREME_LONG short. Its own signal input has round-tripped through invalidation: funding annualized fell from 32.8% to 10.7%, now below the +15% entry threshold. Price action has not confirmed the fade thesis, with spot up +0.20% since entry. Emitted discretionary close under thesis_invalidated. No other open positions required review.

---

### 2026-09-10 09:28 UTC

**Portfolio:** $103.79 total | Cash $103.79 | 0 open | P&L $7.0299 | 64% win rate (949 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 26 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -293.8 is -3.7 std devs from mean since 2026-04-28 (-13.94 ± 75.08)
- [anomaly] hype_pm_ev = 88.48 is 2.1 std devs from mean (62.73 ± 12.54)

**Blocked signal learning:**
- Open blocked shadows: 29
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
No open positions to review for discretionary close. Candidate entry count is 2, but entries are outside this close-review scope. One-touch NO edge shadows remain visible in ETH/GOLD/OIL/BTC quality warnings, but they are blocked shadows, not live portfolio risk. Oil funding is deeply negative and Brent funding is even more negative, suggesting continued short crowding rather than a fresh close trigger.

---

### 2026-09-10 10:28 UTC

**Portfolio:** $103.79 total | Cash $103.79 | 0 open | P&L $7.0299 | 64% win rate (949 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 25 active families did not trigger; 0 later families waiting.
- 🧪 Opened 1 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -307.63 is -3.9 std devs from mean since 2026-04-28 (-14.05 ± 75.27)
- [anomaly] hype_pm_ev = 88.13 is 2.0 std devs from mean (62.74 ± 12.55)
- [anomaly] hype_med_max = 117.5 is 2.0 std devs from mean (83.86 ± 16.65)

**Blocked signal learning:**
- Open blocked shadows: 29
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 4/12; next scheduled 2026-09-10T12:28:21.719Z). Mechanical cycle ran normally._

---

### 2026-09-10 11:28 UTC

**Portfolio:** $103.79 total | Cash $103.79 | 0 open | P&L $7.0299 | 64% win rate (949 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = -325.07 is -4.1 std devs from mean since 2026-04-28 (-14.16 ± 75.49)
- [anomaly] hype_pm_ev = 88.15 is 2.0 std devs from mean (62.75 ± 12.56)

**Blocked signal learning:**
- Open blocked shadows: 29
- Resolved blocked shadows: 1017 (520 wins / 497 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-1.89%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.64%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-3.64%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 4/12; next scheduled 2026-09-10T13:28:25.484Z). Mechanical cycle ran normally._

---

