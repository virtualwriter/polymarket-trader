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

