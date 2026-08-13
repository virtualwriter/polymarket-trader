# Trading Engine Learning Journal
<!-- compacted 2026-08-13: older entries archived to data/journal-archive/ -->
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
No open positions or eligible discretionary closes this run. Promoted ONE_TOUCH_HIGH_EDGE_NO shadows remain visible in open quality warnings but have not produced portfolio entries, and candidateEntryCount is 0. Watching BTC's deteriorating sentiment and oil spike-risk macro backdrop.

---

### 2026-08-12 18:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.06. Rolling correlation: 24h=-0.48, 7d=0.72, 30d=-0.25. Current 24h corr is at 40th pct of last 30 daily 24h-rolling values (range -0.94 to 0.71).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=0.36, 7d=-0.16, 30d=0.21. Current 24h corr is at 43th pct of last 30 daily 24h-rolling values (range -0.59 to 0.85).

**Blocked signal learning:**
- Open blocked shadows: 50
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 9/12; next scheduled 2026-08-12T20:28:17.318Z). Mechanical cycle ran normally._

---

### 2026-08-12 20:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.05. Rolling correlation: 24h=-0.51, 7d=0.73, 30d=-0.25. Current 24h corr is at 37th pct of last 30 daily 24h-rolling values (range -0.93 to 0.67).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=0.33, 7d=-0.20, 30d=0.20. Current 24h corr is at 50th pct of last 30 daily 24h-rolling values (range -0.56 to 0.86).

**Blocked signal learning:**
- Open blocked shadows: 50
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
No open positions to review and no discretionary close candidates in the allowed action surface. BTC term IV spread widened then compressed intraday, while ibit put/call ratio spiked above 1.3 before easing to ~0.91; oil funding remains deeply negative and Brent funding is very negative, but no position is exposed. Continue watching ONE_TOUCH_HIGH_EDGE_NO shadow warnings, especially ETH/OIL/BTC upside-barrier markets, but no action is warranted this close-review run.

---

### 2026-08-12 21:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [divergence] GOLD PM-Options IV gap moved narrower by 10.5pp (was -8.9, now -19.4)
- [anomaly] gold_opt_iv_30d = 32.5 is 2.2 std devs from mean (23.97 ± 3.87)
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.05. Rolling correlation: 24h=-0.53, 7d=0.73, 30d=-0.25. Current 24h corr is at 37th pct of last 30 daily 24h-rolling values (range -0.93 to 0.65).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=0.28, 7d=-0.22, 30d=0.20. Current 24h corr is at 47th pct of last 30 daily 24h-rolling values (range -0.33 to 0.88).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 10/12; next scheduled 2026-08-12T23:28:13.728Z). Mechanical cycle ran normally._

---

### 2026-08-12 22:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [divergence] GOLD PM-Options IV gap moved wider by 10.6pp (was -19.4, now -8.8)
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.05. Rolling correlation: 24h=-0.56, 7d=0.73, 30d=-0.24. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.91 to 0.70).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=0.24, 7d=-0.25, 30d=0.20. Current 24h corr is at 47th pct of last 30 daily 24h-rolling values (range -0.26 to 0.92).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 10/12; next scheduled 2026-08-13T00:28:18.368Z). Mechanical cycle ran normally._

---

### 2026-08-12 23:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 17 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.05. Rolling correlation: 24h=-0.55, 7d=0.73, 30d=-0.24. Current 24h corr is at 37th pct of last 30 daily 24h-rolling values (range -0.90 to 0.72).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=0.09, 7d=-0.27, 30d=0.19. Current 24h corr is at 40th pct of last 30 daily 24h-rolling values (range -0.39 to 0.93).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
No open positions, so no discretionary close review was required. Monitored market state only: macro remains VERY BEARISH, crypto spot drifted lower into the 23:00 snapshot, and multiple ONE_TOUCH_HIGH_EDGE_NO shadow candidates remain visible in the engine state but have no associated open positions to manage.

---

### 2026-08-13 00:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 4 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 16 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.04. Rolling correlation: 24h=-0.61, 7d=0.74, 30d=-0.24. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.90 to 0.71).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=0.03, 7d=-0.30, 30d=0.19. Current 24h corr is at 27th pct of last 30 daily 24h-rolling values (range -0.57 to 0.94).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 0/12; next scheduled 2026-08-13T02:28:22.304Z). Mechanical cycle ran normally._

---

### 2026-08-13 01:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 18 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.04. Rolling correlation: 24h=-0.72, 7d=0.74, 30d=-0.24. Current 24h corr is at 17th pct of last 30 daily 24h-rolling values (range -0.90 to 0.73).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=-0.03, 7d=-0.33, 30d=0.19. Current 24h corr is at 27th pct of last 30 daily 24h-rolling values (range -0.66 to 0.94).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 0/12; next scheduled 2026-08-13T03:28:15.950Z). Mechanical cycle ran normally._

---

### 2026-08-13 02:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 18 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.04. Rolling correlation: 24h=-0.69, 7d=0.74, 30d=-0.24. Current 24h corr is at 20th pct of last 30 daily 24h-rolling values (range -0.89 to 0.76).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=-0.02, 7d=-0.36, 30d=0.18. Current 24h corr is at 30th pct of last 30 daily 24h-rolling values (range -0.77 to 0.95).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
No open positions and no eligible discretionary close candidates; ALLOWED_ACTION_SURFACE is empty. Observed continued BTC PM premium and PM IV > opt IV, plus deeply negative oil/Brent funding while WTI drifts lower; these are context observations only and may inform the nightly research run. No close action taken.

---

### 2026-08-13 03:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 18 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.04. Rolling correlation: 24h=-0.63, 7d=0.75, 30d=-0.24. Current 24h corr is at 17th pct of last 30 daily 24h-rolling values (range -0.90 to 0.81).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=-0.03, 7d=-0.38, 30d=0.18. Current 24h corr is at 30th pct of last 30 daily 24h-rolling values (range -0.77 to 0.95).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 1/12; next scheduled 2026-08-13T05:28:16.068Z). Mechanical cycle ran normally._

---

### 2026-08-13 04:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 18 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.04. Rolling correlation: 24h=-0.53, 7d=0.76, 30d=-0.24. Current 24h corr is at 33th pct of last 30 daily 24h-rolling values (range -0.93 to 0.82).
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.31. Rolling correlation: 24h=0.03, 7d=-0.41, 30d=0.18. Current 24h corr is at 27th pct of last 30 daily 24h-rolling values (range -0.79 to 0.96).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 1/12; next scheduled 2026-08-13T06:28:18.016Z). Mechanical cycle ran normally._

---

### 2026-08-13 06:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 18 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.30. Rolling correlation: 24h=-0.03, 7d=-0.42, 30d=0.17. Current 24h corr is at 30th pct of last 30 daily 24h-rolling values (range -0.80 to 0.93).
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.03. Rolling correlation: 24h=-0.43, 7d=0.76, 30d=-0.24. Current 24h corr is at 40th pct of last 30 daily 24h-rolling values (range -0.95 to 0.83).

**Blocked signal learning:**
- Open blocked shadows: 51
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
No open positions, so no discretionary close review was required. Noted BTC IV term structure flattened from about +3.6 to 0.0 over the last few hours while spot firmed; potentially a vol-surface signal but not actionable in this session. Allowed action surface has no eligible closes.

---


### Nightly research advice ingested (generatedAt=2026-08-13T07:09:21.014Z, model=deepseek-v4-pro)
- Hypotheses added: 1 (rejected 5); reviews applied: 6; invalidated assumptions learned: 5; param updates: none.
- Strategy review: The standout is weekend HL funding reversion long: clean live trades are 271/391 (69%) with average +0.36% and shadows are 188/253 with average +0.99%; one-touch NO sell-YES edge and manual PM-IV rich-NO are also small but positive. The main damage is coming from shadow-mined spot-prediction families and Polymarket proxy shorts: gold cap/no-bias tail shorts are 0% on scorable tests, CBRS/AAPL fixed-threshold funding reversions whipsaw near post-normalization states, BTC cross-asset/listed-IV momentum confirmations are late/coincident, and PM proxy short clusters are leaking because they transl
- Nightly journal: Tonight's main lesson is that rich PM contract edges are not automatically spot-directional signals: GOLD cap/no-bias tail shorts all failed because the richness persisted while spot rallied. Fixed funding thresholds were too loose and fired after normalization; refinements now require weekend timing plus a 7-day funding percentile tail. BTC momentum confirmations are also late: HYPE and listed-IV confirmations chased extension, so refinements replace HYPE with BTC PM IV compression and shift the IV-momentum entry to a 24h pullback. PM proxy shorts remain dangerous when the source signal disag
### 2026-08-13 08:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 💀 Setup family btc_momentum_correlation_breakout KILLED (25% over 20 tests across 3 variants): BTC momentum / correlation breakout
- 🧪 LLM retest queue: 16 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.30. Rolling correlation: 24h=-0.08, 7d=-0.44, 30d=0.17. Current 24h corr is at 27th pct of last 30 daily 24h-rolling values (range -0.78 to 0.93).
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.03. Rolling correlation: 24h=-0.14, 7d=0.76, 30d=-0.24. Current 24h corr is at 57th pct of last 30 daily 24h-rolling values (range -0.96 to 0.82).

**Blocked signal learning:**
- Open blocked shadows: 54
- Resolved blocked shadows: 832 (425 wins / 407 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.49%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 2/12; next scheduled 2026-08-13T10:28:17.117Z). Mechanical cycle ran normally._

---

### 2026-08-13 09:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 16 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.30. Rolling correlation: 24h=-0.06, 7d=-0.46, 30d=0.17. Current 24h corr is at 20th pct of last 30 daily 24h-rolling values (range -0.77 to 0.93).
- [correlation_flip] GOLD-OIL correlation shifted from 0.43 to -0.03. Rolling correlation: 24h=0.09, 7d=0.76, 30d=-0.24. Current 24h corr is at 73th pct of last 30 daily 24h-rolling values (range -0.96 to 0.82).

**Blocked signal learning:**
- Open blocked shadows: 53
- Resolved blocked shadows: 833 (425 wins / 408 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.77%)

**LLM analysis:**
Close review: portfolio is flat, so there are no discretionary close candidates. Cash $104.04, realized P&L $7.28. One-touch NO edge shadows remain visible for SPY, ETH, BTC, and GOLD in warnings, but they are blocked and not open positions. BTC PM IV continues to trade rich versus options IV, while macro stays bearish/hawkish and oil funding is very negative; no action taken.

---

### 2026-08-13 10:28 UTC

**Portfolio:** $104.04 total | Cash $104.04 | 0 open | P&L $7.2810 | 63% win rate (702 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 16 active families did not trigger; 0 later families waiting.
- 🧪 LLM retest queue: 5 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 families skipped — no scorable variant (missing direction / funding thesis / move language); needs re-authoring.

**Statistical observations:**
- [correlation_flip] BTC-GOLD correlation shifted from 0.77 to 0.30. Rolling correlation: 24h=-0.03, 7d=-0.46, 30d=0.17. Current 24h corr is at 20th pct of last 30 daily 24h-rolling values (range -0.76 to 0.93).
- [correlation_flip] GOLD-OIL correlation shifted from 0.44 to -0.03. Rolling correlation: 24h=0.27, 7d=0.76, 30d=-0.24. Current 24h corr is at 77th pct of last 30 daily 24h-rolling values (range -0.97 to 0.81).

**Blocked signal learning:**
- Open blocked shadows: 53
- Resolved blocked shadows: 833 (425 wins / 408 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 6/7 shadows would have won, avg P&L 2.70%.
- PC_RATIO_EXTREME_LOW trend filter may be too strict: 16/29 blocked trades would have won.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/18 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch edge_bucket="near-fair" n=306 (83W/180L/43flat, 31.6% win-rate, sum $-1.1375, avg -0.37%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-15.69%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+3.45%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-10.00%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-3.77%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 3/12; next scheduled 2026-08-13T12:28:18.653Z). Mechanical cycle ran normally._

---

