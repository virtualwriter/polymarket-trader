# Trading Engine Learning Journal
<!-- compacted 2026-08-21: older entries archived to data/journal-archive/ -->
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.59%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have hit stop (-20.45%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.07%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 6/12; next scheduled 2026-08-20T19:28:22.079Z). Mechanical cycle ran normally._

---

### 2026-08-20 18:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.9 is -3.6 std devs from mean since 2026-04-28 (53.05 ± 12.69)
- [correlation_flip] BTC-GOLD correlation shifted from 0.80 to 0.36. Rolling correlation: 24h=-0.01, 7d=0.83, 30d=0.19. Current 24h corr is at 30th pct of last 30 daily 24h-rolling values (range -0.66 to 0.88).
- [correlation_flip] GOLD-OIL correlation shifted from 0.57 to 0.15. Rolling correlation: 24h=-0.29, 7d=0.59, 30d=-0.31. Current 24h corr is at 40th pct of last 30 daily 24h-rolling values (range -0.93 to 0.65).

**Blocked signal learning:**
- Open blocked shadows: 30
- Resolved blocked shadows: 891 (458 wins / 433 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.59%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have hit stop (-20.45%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.07%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 6/12; next scheduled 2026-08-20T20:28:17.007Z). Mechanical cycle ran normally._

---

### 2026-08-20 19:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 6.6 is -3.6 std devs from mean since 2026-04-28 (53.03 ± 12.73)
- [correlation_flip] BTC-GOLD correlation shifted from 0.80 to 0.36. Rolling correlation: 24h=0.07, 7d=0.84, 30d=0.20. Current 24h corr is at 40th pct of last 30 daily 24h-rolling values (range -0.57 to 0.92).
- [correlation_flip] GOLD-OIL correlation shifted from 0.57 to 0.15. Rolling correlation: 24h=-0.19, 7d=0.60, 30d=-0.30. Current 24h corr is at 43th pct of last 30 daily 24h-rolling values (range -0.91 to 0.70).

**Blocked signal learning:**
- Open blocked shadows: 31
- Resolved blocked shadows: 891 (458 wins / 433 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.59%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have hit stop (-20.45%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.07%)

**LLM analysis:**
No open positions and no eligible discretionary closes this run; ALLOWED ACTION SURFACE is empty. Recent blocked/shadow activity shows ONE_TOUCH_HIGH_EDGE_NO whipsawing in ETH/GOLD/BTC, with wide PM spreads and a notable GOLD stop loss. Continue monitoring funding normalization and PM EV/spot gaps, but no action needed until new promoted entries appear.

---

### 2026-08-20 20:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.6 is -3.6 std devs from mean since 2026-04-28 (53.01 ± 12.76)
- [anomaly] oil_opt_fwd_90d = 159.2 is 2.9 std devs from mean since 2026-04-28 (78.20 ± 27.69)
- [correlation_flip] BTC-GOLD correlation shifted from 0.80 to 0.37. Rolling correlation: 24h=0.08, 7d=0.85, 30d=0.21. Current 24h corr is at 37th pct of last 30 daily 24h-rolling values (range -0.47 to 0.93).
- [correlation_flip] GOLD-OIL correlation shifted from 0.57 to 0.15. Rolling correlation: 24h=-0.14, 7d=0.62, 30d=-0.30. Current 24h corr is at 53th pct of last 30 daily 24h-rolling values (range -0.90 to 0.72).

**Blocked signal learning:**
- Open blocked shadows: 31
- Resolved blocked shadows: 891 (458 wins / 433 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.59%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have hit stop (-20.45%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.07%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 7/12; next scheduled 2026-08-20T22:28:24.016Z). Mechanical cycle ran normally._

---

### 2026-08-20 21:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.9 is -3.5 std devs from mean since 2026-04-28 (52.98 ± 12.79)
- [anomaly] hype_hl_oi = 1729077577 is 2.1 std devs from mean (1250940683.01 ± 226629799.68)
- [correlation_flip] BTC-GOLD correlation shifted from 0.81 to 0.37. Rolling correlation: 24h=0.15, 7d=0.85, 30d=0.22. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.57 to 0.94).
- [correlation_flip] GOLD-OIL correlation shifted from 0.57 to 0.15. Rolling correlation: 24h=-0.11, 7d=0.63, 30d=-0.30. Current 24h corr is at 53th pct of last 30 daily 24h-rolling values (range -0.90 to 0.71).

**Blocked signal learning:**
- Open blocked shadows: 31
- Resolved blocked shadows: 891 (458 wins / 433 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.59%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have hit stop (-20.45%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.07%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 7/12; next scheduled 2026-08-20T23:28:21.665Z). Mechanical cycle ran normally._

---

### 2026-08-20 23:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 8.1 is -3.5 std devs from mean since 2026-04-28 (52.96 ± 12.83)
- [anomaly] hype_hl_funding_ann = 52.81 is 3.1 std devs from mean (9.60 ± 13.96)
- [anomaly] hype_hl_oi = 1717245066 is 2.1 std devs from mean (1251131089.04 ± 226779286.43)
- [correlation_flip] BTC-GOLD correlation shifted from 0.81 to 0.38. Rolling correlation: 24h=0.29, 7d=0.86, 30d=0.23. Current 24h corr is at 47th pct of last 30 daily 24h-rolling values (range -0.66 to 0.94).
- [correlation_flip] GOLD-OIL correlation shifted from 0.57 to 0.15. Rolling correlation: 24h=-0.02, 7d=0.64, 30d=-0.29. Current 24h corr is at 63th pct of last 30 daily 24h-rolling values (range -0.87 to 0.73).

**Blocked signal learning:**
- Open blocked shadows: 30
- Resolved blocked shadows: 893 (458 wins / 435 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have hit stop (-20.45%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.07%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.52%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-2.47%)

**LLM analysis:**
Portfolio is flat with $104.08 cash and no open positions. Market state is notable mainly for the hawkish macro backdrop, BTC near-dated IV compression, and the sharp HYPE funding spike to 52.8% annualized, but HYPE remains disabled for FUNDING_EXTREME_LONG and no action is warranted here. Recent blocked ONE_TOUCH_HIGH_EDGE_NO shadows have produced several small losses, but none are open. No discretionary closes required.

---

### 2026-08-21 00:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 16 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] hype_hl_funding_ann = 87.02 is 5.5 std devs from mean (9.63 ± 14.04)
- [anomaly] oil_opt_iv_30d = 8 is -3.5 std devs from mean since 2026-04-28 (52.94 ± 12.86)
- [anomaly] hype_hl_oi = 1729407893 is 2.1 std devs from mean (1251326304.06 ± 226938718.82)
- [correlation_flip] BTC-GOLD correlation shifted from 0.81 to 0.38. Rolling correlation: 24h=0.40, 7d=0.87, 30d=0.23. Current 24h corr is at 53th pct of last 30 daily 24h-rolling values (range -0.77 to 0.95).
- [correlation_flip] GOLD-OIL correlation shifted from 0.57 to 0.16. Rolling correlation: 24h=0.06, 7d=0.65, 30d=-0.29. Current 24h corr is at 63th pct of last 30 daily 24h-rolling values (range -0.87 to 0.76).

**Blocked signal learning:**
- Open blocked shadows: 29
- Resolved blocked shadows: 894 (459 wins / 435 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.07%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.52%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-2.47%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.41%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 0/12; next scheduled 2026-08-21T02:28:16.636Z). Mechanical cycle ran normally._

---

### 2026-08-21 02:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 16 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] BTC PM-Options IV gap moved wider by 6.4pp (was -3.3, now 3.1)
- [anomaly] oil_opt_iv_30d = 8.1 is -3.5 std devs from mean since 2026-04-28 (52.92 ± 12.89)
- [anomaly] hype_hl_oi = 1727355428 is 2.1 std devs from mean (1251520522.39 ± 227095983.33)
- [correlation_flip] BTC-GOLD correlation shifted from 0.81 to 0.39. Rolling correlation: 24h=0.55, 7d=0.87, 30d=0.24. Current 24h corr is at 60th pct of last 30 daily 24h-rolling values (range -0.77 to 0.95).
- [correlation_flip] GOLD-OIL correlation shifted from 0.57 to 0.16. Rolling correlation: 24h=0.17, 7d=0.66, 30d=-0.29. Current 24h corr is at 67th pct of last 30 daily 24h-rolling values (range -0.90 to 0.81).

**Blocked signal learning:**
- Open blocked shadows: 19
- Resolved blocked shadows: 905 (468 wins / 437 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.20%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.81%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-53.66%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
No open positions and no eligible discretionary closes this run. BTC strength is notable against a still VERY BEARISH macro backdrop, with BTC PM EV expanding faster than spot and 90d IV term spread becoming more inverted. HYPE funding normalized back near 10.95 after extreme prints earlier. Continue monitoring upcoming entry eligibility, but no action taken here.

---

### 2026-08-21 03:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] BTC PM-Options IV gap moved narrower by 6.5pp (was 3.1, now -3.4)
- [anomaly] oil_opt_iv_30d = 7.9 is -3.5 std devs from mean since 2026-04-28 (52.90 ± 12.93)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.16. Rolling correlation: 24h=0.22, 7d=0.67, 30d=-0.29. Current 24h corr is at 70th pct of last 30 daily 24h-rolling values (range -0.93 to 0.82).
- [correlation_flip] BTC-GOLD correlation shifted from 0.81 to 0.39. Rolling correlation: 24h=0.63, 7d=0.88, 30d=0.25. Current 24h corr is at 67th pct of last 30 daily 24h-rolling values (range -0.79 to 0.95).

**Blocked signal learning:**
- Open blocked shadows: 19
- Resolved blocked shadows: 905 (468 wins / 437 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+0.20%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.81%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-53.66%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 1/12; next scheduled 2026-08-21T05:28:27.586Z). Mechanical cycle ran normally._

---

### 2026-08-21 04:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] BTC PM-Options IV gap moved wider by 5.6pp (was -3.4, now 2.2)
- [anomaly] oil_opt_iv_30d = 7.5 is -3.5 std devs from mean since 2026-04-28 (52.88 ± 12.96)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.16. Rolling correlation: 24h=0.24, 7d=0.68, 30d=-0.28. Current 24h corr is at 73th pct of last 30 daily 24h-rolling values (range -0.95 to 0.83).
- [correlation_flip] BTC-GOLD correlation shifted from 0.81 to 0.40. Rolling correlation: 24h=0.69, 7d=0.88, 30d=0.26. Current 24h corr is at 70th pct of last 30 daily 24h-rolling values (range -0.80 to 0.93).

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 906 (468 wins / 438 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.81%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-53.66%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 1/12; next scheduled 2026-08-21T06:28:24.212Z). Mechanical cycle ran normally._

---

### 2026-08-21 05:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 16 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.5 is -3.5 std devs from mean since 2026-04-28 (52.86 ± 12.99)
- [anomaly] oil_opt_fwd_90d = 6.1 is -2.6 std devs from mean since 2026-04-28 (78.16 ± 27.69)
- [anomaly] hype_hl_oi = 1710219673 is 2.0 std devs from mean (1252072132.25 ± 227504238.06)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.16. Rolling correlation: 24h=0.22, 7d=0.68, 30d=-0.28. Current 24h corr is at 77th pct of last 30 daily 24h-rolling values (range -0.96 to 0.82).
- [correlation_flip] BTC-GOLD correlation shifted from 0.81 to 0.40. Rolling correlation: 24h=0.71, 7d=0.88, 30d=0.27. Current 24h corr is at 70th pct of last 30 daily 24h-rolling values (range -0.78 to 0.93).

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 909 (468 wins / 441 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)

**LLM analysis:**
No open positions or eligible discretionary closes this run. The book is flat with $104 cash and $7.32 realized P&L. Recent ONE_TOUCH_HIGH_EDGE_NO BTC shadow trades resolved as small losses, while the ETH shadow still shows a wide PM spread; nightly research may want to revisit edge gating for tiny BTC NO-touch edges.

---

### 2026-08-21 06:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.8 is -3.5 std devs from mean since 2026-04-28 (52.84 ± 13.03)
- [anomaly] hype_hl_oi = 1718086605 is 2.0 std devs from mean (1252261954.85 ± 227652190.01)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.16. Rolling correlation: 24h=0.18, 7d=0.69, 30d=-0.28. Current 24h corr is at 80th pct of last 30 daily 24h-rolling values (range -0.96 to 0.82).

**Blocked signal learning:**
- Open blocked shadows: 16
- Resolved blocked shadows: 909 (468 wins / 441 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 2/12; next scheduled 2026-08-21T08:28:28.687Z). Mechanical cycle ran normally._

---

### 2026-08-21 07:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 8.7 is -3.4 std devs from mean since 2026-04-28 (52.82 ± 13.06)
- [anomaly] hype_hl_oi = 1727714421 is 2.1 std devs from mean (1252455542.99 ± 227807863.13)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.17. Rolling correlation: 24h=0.13, 7d=0.69, 30d=-0.27. Current 24h corr is at 77th pct of last 30 daily 24h-rolling values (range -0.97 to 0.81).

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 910 (468 wins / 442 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 2/12; next scheduled 2026-08-21T09:28:25.197Z). Mechanical cycle ran normally._

---

### 2026-08-21 08:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.9 is -3.4 std devs from mean since 2026-04-28 (52.80 ± 13.09)
- [anomaly] hype_hl_oi = 1752986115 is 2.2 std devs from mean (1252659259.13 ± 227985142.71)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.17. Rolling correlation: 24h=-0.04, 7d=0.70, 30d=-0.27. Current 24h corr is at 60th pct of last 30 daily 24h-rolling values (range -0.97 to 0.80).

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
No open positions, so no discretionary closes are warranted this hour. Recent ONE_TOUCH_HIGH_EDGE_NO shadow trades in BTC and ETH have been losing as spot trends higher, and the current BTC push above the 90d forward is consistent with that pressure. Monitoring the strong BTC/ETH trend, elevated crypto funding, and steepening BTC term IV spread for possible promoted-entry conflicts, but no action required now.

---

### 2026-08-21 10:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 8.4 is -3.4 std devs from mean since 2026-04-28 (52.78 ± 13.12)
- [anomaly] hype_hl_funding_ann = 52.07 is 3.0 std devs from mean (9.66 ± 14.04)
- [anomaly] oil_opt_fwd_90d = 6.1 is -2.6 std devs from mean since 2026-04-28 (78.13 ± 27.72)
- [anomaly] btc_opt_iv_90d = 59.1 is 2.4 std devs from mean (40.84 ± 7.61)
- [anomaly] hype_hl_oi = 1768019829 is 2.3 std devs from mean (1252868925.76 ± 228175566.40)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 3/12; next scheduled 2026-08-21T12:28:12.932Z). Mechanical cycle ran normally._

---

### 2026-08-21 11:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.4 is -3.4 std devs from mean since 2026-04-28 (52.76 ± 13.16)
- [anomaly] hype_hl_oi = 1765616478 is 2.2 std devs from mean (1253077444.49 ± 228363285.62)
- [anomaly] btc_opt_iv_90d = 57.3 is 2.2 std devs from mean (40.85 ± 7.61)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.17. Rolling correlation: 24h=-0.30, 7d=0.71, 30d=-0.26. Current 24h corr is at 53th pct of last 30 daily 24h-rolling values (range -0.97 to 0.70).

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
Close review: no open positions and the allowed action surface is empty. Recent one-touch NO trades closed with several small BTC losses and one large ETH stop, while ETH one-touch NO shadow edges remain on open quality warnings. Monitoring the VERY BEARISH macro backdrop and deeply inverted BTC IV term spread for the next signal-driven entries; no discretionary action taken this run.

---

### 2026-08-21 12:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.4 is -3.4 std devs from mean since 2026-04-28 (52.74 ± 13.19)
- [anomaly] hype_hl_oi = 1733332349 is 2.1 std devs from mean (1253272670.06 ± 228522014.35)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.17. Rolling correlation: 24h=-0.21, 7d=0.72, 30d=-0.25. Current 24h corr is at 50th pct of last 30 daily 24h-rolling values (range -0.97 to 0.70).

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 4/12; next scheduled 2026-08-21T14:28:22.542Z). Mechanical cycle ran normally._

---

### 2026-08-21 13:28 UTC

**Portfolio:** $104.08 total | Cash $104.08 | 0 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.9 is -3.4 std devs from mean since 2026-04-28 (52.72 ± 13.22)
- [anomaly] hype_hl_oi = 1804421703 is 2.4 std devs from mean (1253496623.34 ± 228745431.80)
- [anomaly] hype_hl_funding_ann = 41.58 is 2.3 std devs from mean (9.67 ± 14.05)
- [anomaly] btc_opt_iv_90d = 56.3 is 2.0 std devs from mean (40.86 ± 7.62)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.18. Rolling correlation: 24h=-0.13, 7d=0.72, 30d=-0.25. Current 24h corr is at 60th pct of last 30 daily 24h-rolling values (range -0.97 to 0.70).

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 4/12; next scheduled 2026-08-21T15:28:24.729Z). Mechanical cycle ran normally._

---

### 2026-08-21 14:28 UTC

**Portfolio:** $104.08 total | Cash $103.08 | 1 open | P&L $7.3229 | 63% win rate (747 trades)

**Opened 1 positions:**
- OIL short @ $86.43 via spot/spot [OIL spot] (PC_RATIO_EXTREME_LOW)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] OIL PM-Options IV gap moved narrower by 10.2pp (was 25.3, now 15.1)
- [anomaly] oil_opt_fwd_90d = 158.4 is 2.9 std devs from mean since 2026-04-28 (78.18 ± 27.77)
- [anomaly] oil_opt_iv_30d = 18.3 is -2.6 std devs from mean since 2026-04-28 (52.70 ± 13.24)
- [anomaly] hype_hl_oi = 1777802141 is 2.3 std devs from mean (1253709582.53 ± 228942853.27)
- [anomaly] btc_opt_iv_90d = 56.3 is 2.0 std devs from mean (40.87 ± 7.63)

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
No open positions at this close review. Cash is $104.08 with realized P&L of $7.32. BTC remains rangebound near $77k and macro conditions are still very bearish/hawkish with oil spike-risk flagged, so promote-candidate entries should be treated cautiously. Noted ETH one-touch high-edge NO shadow warnings in the engine state, but no action is taken here.

---

### 2026-08-21 15:28 UTC

**Portfolio:** $104.08 total | Cash $103.08 | 1 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] OIL PM-Options IV gap moved wider by 10.9pp (was 15.1, now 26.0)
- [anomaly] hype_hl_funding_ann = 87.12 is 5.5 std devs from mean (9.70 ± 14.13)
- [anomaly] oil_opt_iv_30d = 7.3 is -3.4 std devs from mean since 2026-04-28 (52.68 ± 13.27)
- [anomaly] oil_opt_fwd_90d = 158.7 is 2.9 std devs from mean since 2026-04-28 (78.24 ± 27.83)
- [anomaly] hype_hl_oi = 1815273084 is 2.4 std devs from mean (1253937582.33 ± 229175770.00)

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 5/12; next scheduled 2026-08-21T17:28:23.985Z). Mechanical cycle ran normally._

---

### 2026-08-21 16:28 UTC

**Portfolio:** $104.08 total | Cash $103.08 | 1 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.4 is -3.4 std devs from mean since 2026-04-28 (52.66 ± 13.30)
- [anomaly] oil_opt_fwd_90d = 159.2 is 2.9 std devs from mean since 2026-04-28 (78.29 ± 27.90)
- [anomaly] hype_hl_oi = 1806253911 is 2.4 std devs from mean (1254161736.68 ± 229399154.01)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.18. Rolling correlation: 24h=0.38, 7d=0.73, 30d=-0.24. Current 24h corr is at 80th pct of last 30 daily 24h-rolling values (range -0.96 to 0.71).

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 5/12; next scheduled 2026-08-21T18:28:26.081Z). Mechanical cycle ran normally._

---

### 2026-08-21 17:28 UTC

**Portfolio:** $104.08 total | Cash $103.08 | 1 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.4 is -3.4 std devs from mean since 2026-04-28 (52.64 ± 13.33)
- [anomaly] hype_hl_funding_ann = 52.7 is 3.0 std devs from mean (9.73 ± 14.16)
- [anomaly] oil_opt_fwd_90d = 6.6 is -2.6 std devs from mean since 2026-04-28 (78.24 ± 27.95)
- [anomaly] hype_hl_oi = 1789603544 is 2.3 std devs from mean (1254378954.45 ± 229605931.29)
- [correlation_flip] GOLD-OIL correlation shifted from 0.58 to 0.18. Rolling correlation: 24h=0.39, 7d=0.73, 30d=-0.23. Current 24h corr is at 83th pct of last 30 daily 24h-rolling values (range -0.93 to 0.71).

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
Reviewed OIL short T-1787322517848-hc2z (PC_RATIO_EXTREME_LOW): it is only 3.0h into a 120h planned hold and the discretionary close gate is still false due to the 12h minimum hold, so no close action is emitted. However, the signal's own evidence metric has weakened materially: oil_cl_pc_ratio has moved from 0.258 at entry to 0.412, roughly +60%, while spot has drifted against the short. I will re-check at the 12h mark for thesis_invalidated if the P/C ratio continues normalizing and spot remains firm. No new hypotheses or parameter changes proposed here.

---

### 2026-08-21 18:28 UTC

**Portfolio:** $104.08 total | Cash $103.08 | 1 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 7.2 is -3.4 std devs from mean since 2026-04-28 (52.62 ± 13.37)
- [anomaly] oil_opt_fwd_90d = 159.6 is 2.9 std devs from mean since 2026-04-28 (78.29 ± 28.02)
- [anomaly] hype_hl_oi = 1777151792 is 2.3 std devs from mean (1254590946.68 ± 229800531.39)

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 6/12; next scheduled 2026-08-21T20:28:22.047Z). Mechanical cycle ran normally._

---

### 2026-08-21 19:28 UTC

**Portfolio:** $104.08 total | Cash $103.08 | 1 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] hype_hl_funding_ann = 102.06 is 6.5 std devs from mean (9.77 ± 14.27)
- [anomaly] oil_opt_iv_30d = 7.3 is -3.4 std devs from mean since 2026-04-28 (52.60 ± 13.40)
- [anomaly] hype_hl_oi = 1762092038 is 2.2 std devs from mean (1254796662.57 ± 229980949.37)

**Blocked signal learning:**
- Open blocked shadows: 19
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 6/12; next scheduled 2026-08-21T21:28:16.924Z). Mechanical cycle ran normally._

---

### 2026-08-21 20:28 UTC

**Portfolio:** $104.08 total | Cash $102.08 | 2 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] hype_hl_funding_ann = 59.15 is 3.5 std devs from mean (9.77 ± 14.22)
- [anomaly] oil_opt_iv_30d = 7.4 is -3.4 std devs from mean since 2026-04-28 (52.60 ± 13.40)
- [anomaly] hype_hl_oi = 1787472690 is 2.3 std devs from mean (1255018423.32 ± 230197365.48)

**Blocked signal learning:**
- Open blocked shadows: 19
- Resolved blocked shadows: 911 (468 wins / 443 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-0.10%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-1.08%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-3.07%)

**LLM analysis:**
No discretionary closes are permitted this run. OIL short is only 6h old, below the 12h minimum hold, though its P/C ratio has normalized sharply from 0.258 to 0.432 since entry; that is thesis-softening for the contrarian short and should be rechecked once the position becomes LLM-close eligible. BX weekend funding reversion long is fresh and mechanically owned, so no action is appropriate. I also note the OIL 30d IV metric dropped from ~18.3 to 7.4 in the context data, which may be a data-quality artifact worth watching but is not used as close evidence here.

---


### Nightly research advice ingested (generatedAt=2026-08-21T20:36:30.082Z, model=deepseek-v4-pro)
- Hypotheses added: 3 (rejected 3); reviews applied: 6; invalidated assumptions learned: 3; param updates: none.
- Strategy review: The core live edge remains in weekend Hyperliquid funding reversion (70% live, 74% shadow) and selected PC-ratio mean-reversion pockets in BTC/OIL, while Polymarket one-touch live executions are small and uneven. The main bleed is from gold upside one-touch/rich-tail/near-expiry premium fades, which are failing because gold is trending up and the rich YES premium is informed risk pricing. Cross-asset BTC chasing at range highs and raw funding-threshold mining variants are also burning tests. Tonight shifts gold premium signals from fade to trend-confirmation, tightens CBRS weekend context, and
- Nightly journal: No parameter changes tonight: the dominant problems are condition/mechanism mismatches rather than risk sizing. The weekend funding reversion live edge is still the cleanest profit engine, while gold one-touch/tail premium fades are now classified as invalid mean-reversion theses and are being inverted to trend-following refinements. I kept new finding-authored hypotheses to two non-duplicative angles and otherwise focused on refining failing primary variants with materially different mechanisms.
### 2026-08-21 22:28 UTC

**Portfolio:** $104.08 total | Cash $102.08 | 2 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] BTC PM-Options IV gap moved narrower by 9.6pp (was 1.7, now -7.9)
- [anomaly] hype_hl_funding_ann = 72.31 is 4.4 std devs from mean (9.80 ± 14.27)
- [anomaly] oil_opt_iv_30d = 9.3 is -3.2 std devs from mean since 2026-04-28 (52.58 ± 13.43)
- [anomaly] oil_opt_fwd_90d = 5.8 is -2.6 std devs from mean since 2026-04-28 (78.25 ± 28.06)
- [anomaly] hype_hl_oi = 1839452103 is 2.5 std devs from mean (1255255131.98 ± 230450968.95)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 915 (471 wins / 444 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-30.36%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.22%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 7/12; next scheduled 2026-08-22T00:28:20.688Z). Mechanical cycle ran normally._

---

### 2026-08-21 23:28 UTC

**Portfolio:** $104.08 total | Cash $101.08 | 3 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] BTC PM-Options IV gap moved wider by 5.2pp (was -7.9, now -2.7)
- [anomaly] oil_opt_iv_30d = 8.3 is -3.3 std devs from mean since 2026-04-28 (52.56 ± 13.46)
- [anomaly] oil_opt_fwd_90d = 5.8 is -2.6 std devs from mean since 2026-04-28 (78.20 ± 28.11)
- [anomaly] hype_hl_oi = 1847151622 is 2.6 std devs from mean (1255494766.19 ± 230711788.26)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 915 (471 wins / 444 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-30.36%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.22%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)

**LLM analysis:**
No discretionary closes executed this run. OIL PC_RATIO_EXTREME_LOW short is only about 9h into a 120h hold and below the 12h LLM min-hold gate, so no close instruction is allowed despite oil_cl_pc_ratio normalizing from 0.258 at entry to 0.432. That is a meaningful thesis-weakening move and should be re-checked at the 12h mark if the P/C ratio holds or extends beyond the entry threshold. BX and ZM WEEKEND_HL_FUNDING_REVERSION_LONG positions are mechanical-only exits; BX is +0.81% and ZM just opened, so no action taken.

---

### 2026-08-22 00:28 UTC

**Portfolio:** $104.08 total | Cash $99.08 | 5 open | P&L $7.3229 | 63% win rate (747 trades)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 💀 Setup family find_0036 KILLED (0% over 20 tests across 7 variants): FIND-linked FIND-0036
- 🧪 Opened 3 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 14 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 Opened 1 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 4 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] oil_opt_iv_30d = 9 is -3.2 std devs from mean since 2026-04-28 (52.54 ± 13.49)
- [anomaly] hype_hl_oi = 1824873262 is 2.5 std devs from mean (1255725190.51 ± 230949201.66)

**Blocked signal learning:**
- Open blocked shadows: 16
- Resolved blocked shadows: 915 (471 wins / 444 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-30.36%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.22%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 0/12; next scheduled 2026-08-22T02:28:16.092Z). Mechanical cycle ran normally._

---

### 2026-08-22 01:30 UTC

**Portfolio:** $104.08 total | Cash $96.08 | 8 open | P&L $7.3229 | 63% win rate (747 trades)

**Opened 1 positions:**
- AMZN long @ $259.28 via hyperliquid/hl_perp [HL AMZN perp] (FUNDING_EXTREME_SHORT)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [divergence] OIL PM-Options IV gap moved narrower by 31.5pp (was 24.3, now -7.2)
- [anomaly] amzn_hl_funding_ann = -35.82 is -2.6 std devs from mean (9.75 ± 17.76)
- [anomaly] hype_hl_oi = 1842579946 is 2.5 std devs from mean (1255962591.30 ± 231203850.53)

**Blocked signal learning:**
- Open blocked shadows: 16
- Resolved blocked shadows: 915 (471 wins / 444 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-30.36%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.22%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)

**LLM analysis:**
No discretionary closes emitted this run. OIL PC_RATIO_EXTREME_LOW is ineligible until the 12h mark: open 11.0h, and its P/C ratio has already round-tripped from 0.258 to 0.432 (+67%), which would normally be thesis-invalidation evidence, so I will reassess next hour. All WEEKEND_HL_FUNDING_REVERSION_LONG positions are policy-gated mechanical exits and cannot be LLM-closed. ZM is -1.53% early in its hold, but stops are mechanical. No hard portfolio risk breach observed.

---

### 2026-08-22 02:28 UTC

**Portfolio:** $104.11 total | Cash $98.11 | 6 open | P&L $7.3463 | 63% win rate (749 trades)

**Closed 2 trades:**
- ✅ BX long via hyperliquid/hl_perp [HL BX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0131 (1.3%, market 0.0119, funding 0.0012)
- ✅ SNDK long via hyperliquid/hl_perp [HL SNDK Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0103 (1.0%, market 0.0103, funding 0.0000)

**Hypothesis lifecycle:**
- 🧹 22 Polymarket-contract variants cannot be graded by the spot scorer and were kept, not retired: find_0020, find_0021, find_0023, find_0025, find_0026, find_0030.
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 4 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0025, find_0026, find_0030, find_0023.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring: find_0020.

**Statistical observations:**
- [anomaly] hype_hl_funding_ann = 140.59 is 9.0 std devs from mean (9.86 ± 14.50)
- [anomaly] hype_hl_oi = 1923402411 is 2.9 std devs from mean (1256232482.04 ± 231546254.46)
- [anomaly] hype_spot = 79.2402 is 2.2 std devs from mean (58.17 ± 9.76)

**Blocked signal learning:**
- Open blocked shadows: 16
- Resolved blocked shadows: 915 (471 wins / 444 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-30.36%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.22%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 1/12; next scheduled 2026-08-22T04:28:24.382Z). Mechanical cycle ran normally._

---

### 2026-08-22 03:28 UTC

**Portfolio:** $104.12 total | Cash $99.12 | 5 open | P&L $7.3564 | 63% win rate (751 trades)

**Closed 2 trades:**
- ❌ ZM long via hyperliquid/hl_perp [HL ZM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0001 (-0.0%, market -0.0023, funding 0.0023)
- ✅ RKLB long via hyperliquid/hl_perp [HL RKLB Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0102 (1.0%, market 0.0102, funding -0.0000)

**Hypothesis lifecycle:**
- 🧪 Opened 3 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 18 active families did not trigger; 0 later families waiting.
- 🧪 Opened 2 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 3 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1990807816 is 3.2 std devs from mean (1256529400.13 ± 231969863.67)
- [anomaly] hype_spot = 81.884 is 2.4 std devs from mean (58.18 ± 9.77)
- [anomaly] hype_pm_ev = 76.48 is 2.2 std devs from mean (58.69 ± 8.11)

**Blocked signal learning:**
- Open blocked shadows: 14
- Resolved blocked shadows: 917 (472 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 1/12; next scheduled 2026-08-22T05:28:24.176Z). Mechanical cycle ran normally._

---

### 2026-08-22 04:29 UTC

**Portfolio:** $104.11 total | Cash $95.11 | 9 open | P&L $7.3542 | 63% win rate (752 trades)

**Closed 1 trades:**
- ❌ OIL short via spot/spot [OIL spot] (PC_RATIO_EXTREME_LOW) → llm_decision: $-0.0022 (-0.2%, market -0.0022, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 Opened 2 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 3 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1972803310 is 3.1 std devs from mean (1256818803.73 ± 232369285.24)
- [anomaly] hype_spot = 81.821 is 2.4 std devs from mean (58.19 ± 9.78)
- [anomaly] hype_pm_ev = 76.8 is 2.2 std devs from mean (58.70 ± 8.12)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 917 (472 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
Closed OIL PC_RATIO_EXTREME_LOW short on thesis invalidation: oil_cl_pc_ratio rose from 0.258 to 0.432 (+67%), indicating the entry P/C extreme has normalized. No other positions eligible: WEEKEND_HL_FUNDING_REVERSION_LONG positions are mechanical-only, and AMZN is too new for discretionary close. Context-only warning: oil 30d IV spiked sharply and macro oil spike risk remains elevated, but that is not used as close evidence here.

---

### 2026-08-22 05:28 UTC

**Portfolio:** $104.11 total | Cash $89.11 | 15 open | P&L $7.3542 | 63% win rate (752 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 19 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_funding_ann = -88.72 is -5.5 std devs from mean (9.70 ± 17.86)
- [anomaly] hype_hl_funding_ann = 80.51 is 4.8 std devs from mean (9.89 ± 14.56)
- [anomaly] gold_hl_funding_ann = -42.74 is -3.0 std devs from mean (8.34 ± 17.10)
- [anomaly] hype_hl_oi = 1907350863 is 2.8 std devs from mean (1257081538.81 ± 232689762.86)
- [anomaly] hype_spot = 78.923 is 2.1 std devs from mean (58.20 ± 9.79)

**Blocked signal learning:**
- Open blocked shadows: 16
- Resolved blocked shadows: 917 (472 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
Reviewed 15 open positions. ALLOWED ACTION SURFACE shows no LLM-eligible closes: all WEEKEND_HL_FUNDING_REVERSION_LONG positions are mechanical-only, and the AMZN FUNDING_EXTREME_SHORT position is only about 4h open versus a 12h minimum hold. Largest open stress is COIN WEEKEND_HL_FUNDING_REVERSION_LONG at -11.05% shortly after entry, followed by BIRD -4.84% and HOOD -3.46%; these remain under scanner control with -100% stops, so no close was emitted. Broad negative HL funding intensified into 05:00 across equities, which is thesis continuation for the funding-reversion family, but immediate mark-to-market is adverse; will monitor for continued risk-off or forced liquidation pressure.

---

### 2026-08-22 06:28 UTC

**Portfolio:** $104.08 total | Cash $89.08 | 15 open | P&L $7.3243 | 63% win rate (754 trades)

**Closed 2 trades:**
- ❌ HIMS long via hyperliquid/hl_perp [HL HIMS Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0314 (-3.1%, market -0.0336, funding 0.0022)
- ✅ SKHX long via hyperliquid/hl_perp [HL SKHX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0015 (0.1%, market 0.0004, funding 0.0011)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1910144697 is 2.8 std devs from mean (1257345189.66 ± 233012398.76)
- [anomaly] hype_spot = 79.326 is 2.2 std devs from mean (58.21 ± 9.80)
- [anomaly] hype_pm_ev = 75.89 is 2.1 std devs from mean (58.72 ± 8.13)
- [anomaly] amzn_hl_funding_ann = -27.2 is -2.1 std devs from mean (9.69 ± 17.87)

**Blocked signal learning:**
- Open blocked shadows: 16
- Resolved blocked shadows: 917 (472 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 1.0h since last call; daily budget 3/12; next scheduled 2026-08-22T08:28:33.895Z). Mechanical cycle ran normally._

---


### Nightly research advice ingested (generatedAt=2026-08-22T07:10:25.782Z, model=deepseek-v4-pro)
- Hypotheses added: 2 (rejected 4); reviews applied: 6; invalidated assumptions learned: 2; param updates: none.
- Strategy review: The live book is still dominated by WEEKEND_HL_FUNDING_REVERSION_LONG: clean live family evidence is strong at 305/439 wins (avg +0.33%) and shadows 188/253 (avg +0.99%), but the no-stop design is now showing concentrated mark-to-market bleed in names such as COIN -9.85% and HOOD -5.05%. ONE_TOUCH_HIGH_EDGE_NO remains the best small-sample live edge (4/4, +0.74), with the newer ≥3pt edge gate still shadow-validating. The main failures are contrarian/rich-premium fades on gold and oil, plus HYPE-confirmed BTC momentum, all of which fire into already-moving markets and treat risk premium as misp
- Nightly journal: Tonight's main lesson is that several shadow-mined contrarian signals were actually trend-compensation: gold cap-edge/nobias shorts, gold P/C collapse shorts, and OIL sell-YES fades all lost in rising tape. I persisted invalidation marks on the failing gold cap-edge families and refined CBRS, gold P/C, HYPE/BTC, and OIL variants with regime-relative conditions. I also added a stop to WEEKEND_HL_FUNDING_REVERSION_LONG because the current no-stop design allowed COIN/HOOD-sized mark-to-market bleed; that change should be watched to confirm it improves realized payoff without degrading the edge.
### 2026-08-22 08:28 UTC

**Portfolio:** $104.08 total | Cash $90.08 | 14 open | P&L $7.3204 | 63% win rate (756 trades)

**Closed 2 trades:**
- ❌ BIRD long via hyperliquid/hl_perp [HL BIRD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0018 (-0.2%, market -0.0099, funding 0.0081)
- ❌ DKNG long via hyperliquid/hl_perp [HL DKNG Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0021 (-0.2%, market -0.0040, funding 0.0019)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1859194336 is 2.6 std devs from mean (1257588066.63 ± 233278767.91)
- [anomaly] hype_pm_ev = 75.27 is 2.0 std devs from mean (58.72 ± 8.13)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 917 (472 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
No discretionary closes this run: all open positions are either policy-gated rule-based WEEKEND_HL_FUNDING_REVERSION_LONG trades or below min-hold for LLM close (AMZN FUNDING_EXTREME_SHORT at ~7h). Monitoring adverse drift in COIN (-11.6%) and HOOD (-6.0%) within mechanical hold window. AMZN funding normalized from -35.8% to -16.7% and perp price is soft, but the position is still below 12h min-hold and funding has not clearly crossed back through the -15% entry threshold; I will revisit after min-hold if normalization continues materially.

---

### 2026-08-22 09:28 UTC

**Portfolio:** $104.09 total | Cash $89.09 | 15 open | P&L $7.3346 | 63% win rate (757 trades)

**Closed 1 trades:**
- ✅ INTC long via hyperliquid/hl_perp [HL INTC Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0142 (1.4%, market 0.0139, funding 0.0003)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] GOLD PM-Options IV gap moved wider by 5.8pp (was -17.2, now -11.4)
- [anomaly] hype_hl_oi = 1884562806 is 2.7 std devs from mean (1257840981.01 ± 233571270.77)
- [anomaly] hype_pm_ev = 75.25 is 2.0 std devs from mean (58.73 ± 8.14)
- [anomaly] hype_spot = 78.094 is 2.0 std devs from mean (58.23 ± 9.81)

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 917 (472 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 4/12; next scheduled 2026-08-22T11:28:19.927Z). Mechanical cycle ran normally._

---

### 2026-08-22 10:28 UTC

**Portfolio:** $104.09 total | Cash $89.09 | 15 open | P&L $7.3344 | 63% win rate (758 trades)

**Closed 1 trades:**
- ❌ EBAY long via hyperliquid/hl_perp [HL EBAY Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0002 (-0.0%, market -0.0043, funding 0.0041)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] GOLD PM-Options IV gap moved narrower by 7.8pp (was -11.4, now -19.2)
- [anomaly] hype_hl_oi = 1827472683 is 2.4 std devs from mean (1258070671.21 ± 233804034.16)

**Blocked signal learning:**
- Open blocked shadows: 19
- Resolved blocked shadows: 917 (472 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 4/12; next scheduled 2026-08-22T12:28:16.114Z). Mechanical cycle ran normally._

---

### 2026-08-22 11:28 UTC

**Portfolio:** $104.04 total | Cash $89.04 | 15 open | P&L $7.2774 | 63% win rate (759 trades)

**Closed 1 trades:**
- ❌ RIVN long via hyperliquid/hl_perp [HL RIVN Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0570 (-5.7%, market -0.0583, funding 0.0013)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1853181260 is 2.5 std devs from mean (1258310538.44 ± 234061921.72)

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 918 (473 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+2.70%)

**LLM analysis:**
Close review at 11:00 UTC: no LLM-eligible closes are available. T-1787362222642-lciw (AMZN FUNDING_EXTREME_SHORT) is below its 12h minimum open and therefore cannot be closed discretionarily, but its signal input amzn_hl_funding_ann has moved from -35.8% to +1.6%, crossing back through the -15% entry threshold; if this persists past min hold, it will be a clear thesis_invalidated candidate. Weekend HL funding reversion positions are mechanical-only; COIN (-16.3%) and HOOD (-8.2%) are notable adverse movers, but no action is permitted. Macro remains very bearish/hawkish with oil spike risk, so I will continue monitoring for hard portfolio risk.

---

### 2026-08-22 12:28 UTC

**Portfolio:** $103.86 total | Cash $95.86 | 8 open | P&L $7.0971 | 63% win rate (766 trades)

**Closed 7 trades:**
- ❌ COIN long via hyperliquid/hl_perp [HL COIN Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.1411 (-14.1%, market -0.1489, funding 0.0078)
- ✅ GOOGL long via hyperliquid/hl_perp [HL GOOGL Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0052 (0.5%, market 0.0050, funding 0.0003)
- ❌ HOOD long via hyperliquid/hl_perp [HL HOOD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0727 (-7.3%, market -0.0761, funding 0.0034)
- ❌ COST long via hyperliquid/hl_perp [HL COST Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0034 (-0.3%, market -0.0049, funding 0.0015)
- ❌ MSFT long via hyperliquid/hl_perp [HL MSFT Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0088 (-0.9%, market -0.0093, funding 0.0005)
- ✅ MSTR long via hyperliquid/hl_perp [HL MSTR Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0056 (0.6%, market 0.0042, funding 0.0014)
- ✅ CRCL long via hyperliquid/hl_perp [HL CRCL Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0349 (3.5%, market 0.0349, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1896133803 is 2.7 std devs from mean (1258567518.00 ± 234364570.24)
- [anomaly] hype_pm_ev = 75.43 is 2.0 std devs from mean (58.75 ± 8.15)
- [anomaly] hype_spot = 78.327 is 2.0 std devs from mean (58.25 ± 9.83)

**Blocked signal learning:**
- Open blocked shadows: 18
- Resolved blocked shadows: 918 (473 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+4.17%)
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+2.70%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 5/12; next scheduled 2026-08-22T14:28:15.946Z). Mechanical cycle ran normally._

---

### 2026-08-22 13:28 UTC

**Portfolio:** $103.86 total | Cash $94.86 | 9 open | P&L $7.0971 | 63% win rate (766 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1871968551 is 2.6 std devs from mean (1258814558.28 ± 234640372.48)
- [anomaly] hype_hl_funding_ann = 41.84 is 2.2 std devs from mean (9.90 ± 14.56)
- [anomaly] hype_pm_ev = 75.09 is 2.0 std devs from mean (58.75 ± 8.16)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 919 (474 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+2.70%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.14%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 5/12; next scheduled 2026-08-22T15:28:23.749Z). Mechanical cycle ran normally._

---

### 2026-08-22 15:28 UTC

**Portfolio:** $103.85 total | Cash $90.85 | 13 open | P&L $7.0932 | 63% win rate (767 trades)

**Closed 1 trades:**
- ❌ AMZN long via hyperliquid/hl_perp [HL AMZN perp] (FUNDING_EXTREME_SHORT) → llm_decision: $-0.0039 (-0.4%, market -0.0040, funding 0.0002)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1891079494 is 2.7 std devs from mean (1259069093.28 ± 234935754.77)
- [anomaly] hype_pm_ev = 75.73 is 2.1 std devs from mean (58.76 ± 8.16)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 919 (474 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+2.70%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.14%)

**LLM analysis:**
Closed the eligible AMZN FUNDING_EXTREME_SHORT long after its funding input normalized materially from -35.8% to +5.48%, crossing the entry threshold and flipping sign. All other open positions are WEEKEND_HL_FUNDING_REVERSION_LONG and are policy-gated to mechanical exits; several are early and underwater, so no discretionary closes are emitted there. Worth flagging for nightly review: the weekend funding-reversion cohort is large and correlated, and current unrealized P&L is being dragged by the newer entries.

---

### 2026-08-22 16:01 UTC

**Portfolio:** $103.85 total | Cash $89.85 | 14 open | P&L $7.0932 | 63% win rate (767 trades)

**Opened 1 positions:**
- BTC short @ $77052 via hyperliquid/hl_perp [HL BTC perp] (FUNDING_EXTREME_LONG)

**Hypothesis lifecycle:**
- 🧪 Opened 3 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 21 active families did not trigger; 0 later families waiting.
- 🧪 Opened 2 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] btc_hl_funding_ann = 27.34 is 3.1 std devs from mean (5.57 ± 7.03)
- [anomaly] hype_hl_oi = 1881420375 is 2.6 std devs from mean (1259319536.45 ± 235219894.11)
- [anomaly] hype_pm_ev = 75.52 is 2.1 std devs from mean (58.77 ± 8.17)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 919 (474 wins / 445 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ Blocked: PC_RATIO_EXTREME_LOW BTC short via spot would have hit stop (-2.17%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+2.70%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.14%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 0.5h since last call; daily budget 6/12; next scheduled 2026-08-22T18:01:21.208Z). Mechanical cycle ran normally._

---

### 2026-08-22 16:15 UTC

**Portfolio:** $103.85 total | Cash $89.85 | 14 open | P&L $7.0932 | 63% win rate (767 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 22 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1886830261 is 2.7 std devs from mean (1259321713.47 ± 235225676.76)
- [anomaly] hype_pm_ev = 75.61 is 2.1 std devs from mean (58.77 ± 8.17)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 920 (474 wins / 446 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+2.70%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.14%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 0.8h since last call; daily budget 6/12; next scheduled 2026-08-22T18:15:15.067Z). Mechanical cycle ran normally._

---

### 2026-08-22 16:28 UTC

**Portfolio:** $103.84 total | Cash $90.84 | 13 open | P&L $7.0788 | 63% win rate (768 trades)

**Closed 1 trades:**
- ❌ TSLA long via hyperliquid/hl_perp [HL TSLA Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0144 (-1.4%, market -0.0154, funding 0.0010)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 22 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1892904238 is 2.7 std devs from mean (1259324157.73 ± 235232228.72)
- [anomaly] btc_hl_funding_ann = 23.03 is 2.5 std devs from mean (5.57 ± 7.03)
- [anomaly] hype_pm_ev = 75.76 is 2.1 std devs from mean (58.77 ± 8.17)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 920 (474 wins / 446 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have closed with thesis validated profitably (+2.70%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.14%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 1.0h since last call; daily budget 6/12; next scheduled 2026-08-22T18:28:18.370Z). Mechanical cycle ran normally._

---

### 2026-08-22 18:28 UTC

**Portfolio:** $103.84 total | Cash $92.84 | 11 open | P&L $7.0843 | 63% win rate (771 trades)

**Closed 3 trades:**
- ❌ MRVL long via hyperliquid/hl_perp [HL MRVL Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0098 (-1.0%, market -0.0106, funding 0.0008)
- ✅ ARM long via hyperliquid/hl_perp [HL ARM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0055 (0.6%, market 0.0052, funding 0.0003)
- ✅ HIMS long via hyperliquid/hl_perp [HL HIMS Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0098 (1.0%, market 0.0098, funding -0.0001)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 23 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1941322749 is 2.9 std devs from mean (1259598493.44 ± 235582181.87)
- [anomaly] hype_pm_ev = 76.54 is 2.2 std devs from mean (58.78 ± 8.17)
- [anomaly] hype_spot = 79.358 is 2.1 std devs from mean (58.28 ± 9.85)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 922 (476 wins / 446 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.14%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
No discretionary closes emitted: all 11 open positions are either WEEKEND_HL_FUNDING_REVERSION_LONG holds with mechanical exits policy-gated, or the BTC FUNDING_EXTREME_LONG short is under its 12-hour minimum (2.4h open). Note BTC HL funding has cooled to 14.38% from the 23.03% entry snapshot, crossing back below the +15% trigger; this may become a thesis-invalidated candidate once min hold is met, but it is not actionable this run. Weekend HL reversion positions remain mostly flat to modestly positive; DKNG and EBAY lead at +1.25% and +1.00%. No hypothesis or parameter changes proposed here.

---

### 2026-08-22 19:28 UTC

**Portfolio:** $103.88 total | Cash $96.88 | 7 open | P&L $7.1157 | 63% win rate (775 trades)

**Closed 4 trades:**
- ✅ CRCL long via hyperliquid/hl_perp [HL CRCL Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0010 (0.1%, market 0.0005, funding 0.0005)
- ✅ DKNG long via hyperliquid/hl_perp [HL DKNG Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0144 (1.4%, market 0.0142, funding 0.0002)
- ✅ MU long via hyperliquid/hl_perp [HL MU Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0089 (0.9%, market 0.0090, funding -0.0001)
- ✅ SNDK long via hyperliquid/hl_perp [HL SNDK Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0071 (0.7%, market 0.0072, funding -0.0001)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 23 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1932403729 is 2.9 std devs from mean (1259869022.29 ± 235920725.72)
- [anomaly] hype_pm_ev = 76.37 is 2.2 std devs from mean (58.78 ± 8.18)
- [anomaly] hype_spot = 78.968 is 2.1 std devs from mean (58.29 ± 9.86)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 922 (476 wins / 446 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.14%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 1.0h since last call; daily budget 7/12; next scheduled 2026-08-22T21:28:22.728Z). Mechanical cycle ran normally._

---

### 2026-08-22 20:28 UTC

**Portfolio:** $103.88 total | Cash $98.88 | 5 open | P&L $7.1157 | 63% win rate (778 trades)

**Closed 3 trades:**
- ✅ BABA long via hyperliquid/hl_perp [HL BABA Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0012 (0.1%, market 0.0008, funding 0.0004)
- ❌ BX long via hyperliquid/hl_perp [HL BX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0084 (-0.8%, market -0.0097, funding 0.0013)
- ✅ COST long via hyperliquid/hl_perp [HL COST Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0072 (0.7%, market 0.0072, funding -0.0000)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 23 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_funding_ann = 60.43 is 3.5 std devs from mean (9.95 ± 14.60)
- [anomaly] hype_hl_oi = 1958386465 is 3.0 std devs from mean (1260149776.89 ± 236288491.41)
- [anomaly] btc_hl_funding_ann = 23.6 is 2.6 std devs from mean (5.59 ± 7.04)
- [anomaly] hype_pm_ev = 76.91 is 2.2 std devs from mean (58.79 ± 8.19)
- [anomaly] hype_spot = 79.683 is 2.2 std devs from mean (58.30 ± 9.86)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 923 (476 wins / 447 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-9.37%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 2.0h since last call; daily budget 7/12; next scheduled 2026-08-22T22:28:12.825Z). Mechanical cycle ran normally._

---

### 2026-08-22 21:28 UTC

**Portfolio:** $103.88 total | Cash $96.88 | 7 open | P&L $7.1157 | 63% win rate (778 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 23 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] btc_hl_funding_ann = 26.37 is 2.9 std devs from mean (5.59 ± 7.05)
- [anomaly] hype_hl_oi = 1936826553 is 2.9 std devs from mean (1260421643.81 ± 236629904.48)
- [anomaly] hype_pm_ev = 76.94 is 2.2 std devs from mean (58.80 ± 8.19)
- [anomaly] hype_spot = 78.96 is 2.1 std devs from mean (58.31 ± 9.87)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 923 (476 wins / 447 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-9.37%)

**LLM analysis:**
No discretionary closes taken: all weekend HL funding reversion positions are policy-gated to mechanical exits, and the BTC FUNDING_EXTREME_LONG short is only 5.4h old, below the 12h LLM close minimum. BTC funding remains elevated near 26.4% annualized with spot roughly flat, so no thesis-invalidation close would be justified even after the min hold. Continue monitoring new weekend longs for funding normalization and stop/target behavior.

---

### 2026-08-22 22:28 UTC

**Portfolio:** $103.88 total | Cash $95.88 | 8 open | P&L $7.1157 | 63% win rate (778 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 23 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_funding_ann = 67.04 is 3.9 std devs from mean (9.97 ± 14.64)
- [anomaly] hype_hl_oi = 1968432709 is 3.0 std devs from mean (1260705985.61 ± 237007300.62)
- [anomaly] btc_hl_funding_ann = 24.81 is 2.7 std devs from mean (5.60 ± 7.06)
- [anomaly] hype_pm_ev = 77.24 is 2.2 std devs from mean (58.80 ± 8.20)
- [anomaly] hype_spot = 79.636 is 2.2 std devs from mean (58.31 ± 9.88)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 923 (476 wins / 447 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-9.37%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (2 recurring signals seen within 6h); 1.0h since last call; daily budget 8/12; next scheduled 2026-08-23T00:28:18.129Z). Mechanical cycle ran normally._

---

### 2026-08-22 23:29 UTC

**Portfolio:** $103.88 total | Cash $95.88 | 8 open | P&L $7.1157 | 63% win rate (778 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 23 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1956772304 is 2.9 std devs from mean (1260985418.09 ± 237369618.61)
- [anomaly] hype_hl_funding_ann = 52.93 is 2.9 std devs from mean (9.99 ± 14.66)
- [anomaly] hype_pm_ev = 76.98 is 2.2 std devs from mean (58.81 ± 8.21)
- [anomaly] hype_spot = 79.0815 is 2.1 std devs from mean (58.32 ± 9.89)
- [anomaly] btc_hl_funding_ann = 20.28 is 2.1 std devs from mean (5.61 ± 7.06)

**Blocked signal learning:**
- Open blocked shadows: 15
- Resolved blocked shadows: 923 (476 wins / 447 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-9.37%)

**LLM analysis:**
No eligible discretionary closes this run: all WEEKEND_HL_FUNDING_REVERSION_LONG positions are policy-gated mechanical-only, and the BTC FUNDING_EXTREME_LONG short is only 7.5h open versus the 12h LLM minimum. BTC funding has softened from ~23% to ~20.3% but remains above the +15% entry threshold, so no thesis invalidation; price drift is mildly favorable to the short. Structural observation: AMZN funding reverted sharply from -88.7% to +5.5% while its position is flat, which is a useful signal-family data point even though no LLM close is permitted. No hard risk or data-quality issues requiring action.

---

### 2026-08-23 01:28 UTC

**Portfolio:** $103.96 total | Cash $98.96 | 5 open | P&L $7.2016 | 63% win rate (782 trades)

**Closed 4 trades:**
- ✅ BIRD long via hyperliquid/hl_perp [HL BIRD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0153 (1.5%, market 0.0142, funding 0.0012)
- ✅ COIN long via hyperliquid/hl_perp [HL COIN Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0275 (2.8%, market 0.0276, funding -0.0001)
- ✅ HIMS long via hyperliquid/hl_perp [HL HIMS Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0142 (1.4%, market 0.0131, funding 0.0010)
- ✅ MSTR long via hyperliquid/hl_perp [HL MSTR Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0288 (2.9%, market 0.0288, funding -0.0000)

**Hypothesis lifecycle:**
- 💀 Setup family find_0053 KILLED (0% over 21 tests across 10 variants): FIND-linked FIND-0053
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 21 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 2023555788 is 3.2 std devs from mean (1261291425.46 ± 237812918.63)
- [anomaly] btc_hl_funding_ann = 27.85 is 3.1 std devs from mean (5.62 ± 7.08)
- [anomaly] hype_hl_funding_ann = 47.49 is 2.6 std devs from mean (10.00 ± 14.67)
- [anomaly] hype_pm_ev = 77.78 is 2.3 std devs from mean (58.82 ± 8.21)
- [anomaly] hype_spot = 80.864 is 2.3 std devs from mean (58.33 ± 9.89)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 923 (476 wins / 447 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-9.37%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 2.0h since last call; daily budget 0/12; next scheduled 2026-08-23T03:28:26.193Z). Mechanical cycle ran normally._

---

### 2026-08-23 02:28 UTC

**Portfolio:** $103.96 total | Cash $96.96 | 7 open | P&L $7.2015 | 63% win rate (782 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 22 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_hl_oi = 1966689746 is 3.0 std devs from mean (1261574377.05 ± 238184408.12)
- [anomaly] hype_pm_ev = 76.9 is 2.2 std devs from mean (58.83 ± 8.22)
- [anomaly] hype_spot = 78.9331 is 2.1 std devs from mean (58.34 ± 9.90)

**Blocked signal learning:**
- Open blocked shadows: 17
- Resolved blocked shadows: 923 (476 wins / 447 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 11/19 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT BTC short via polymarket would have hit stop (-5.88%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+19.05%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-9.37%)

**LLM analysis:**
Reviewed all 7 open positions; no discretionary closes are eligible this run. All WEEKEND_HL_FUNDING_REVERSION_LONG positions are policy-gated to mechanical exits only, and the BTC FUNDING_EXTREME_LONG short is under the 12h minimum hold requirement at 10.5h. BTC funding remains above the +15% entry trigger despite cooling to ~18.5%, so no thesis invalidation appears present yet; AMZN funding has normalized sharply but that position is also mechanical-only and near expiry. No action taken.

---

