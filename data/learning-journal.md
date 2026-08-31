# Trading Engine Learning Journal
<!-- compacted 2026-08-31: older entries archived to data/journal-archive/ -->

**Blocked signal learning:**
- Open blocked shadows: 23
- Resolved blocked shadows: 981 (501 wins / 480 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=437 (148W/232L/57flat, 38.9% win-rate, sum $-0.2221, avg -0.05%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+16.28%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-4.88%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)

**LLM analysis:**
No eligible discretionary closes this run: all six open positions are either policy-gated mechanical exits or below the 12h LLM min-hold. Notable to revisit: GOLD short (FUNDING_EXTREME_LONG) has seen its signal input round-trip hard—gold_hl_funding_ann went from +27.1% at entry to -12.2% now, crossing back through the entry threshold and beyond—but the position is only ~6h old, so no thesis_invalidated close is permitted yet. If this funding normalization persists past the 12h min-hold, it will be a clean candidate for discretionary thesis-invalidated exit. Weekend HL funding-reversion longs remain mechanical and show no hard risk breach.

---

### 2026-08-30 21:28 UTC

**Portfolio:** $104.38 total | Cash $90.38 | 14 open | P&L $7.6172 | 65% win rate (857 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_funding_ann = -55.93 is -3.7 std devs from mean (9.34 ± 17.85)
- [anomaly] hype_pm_ev = 88.07 is 2.7 std devs from mean (60.48 ± 10.32)
- [anomaly] btc_med_min = 67444 is 2.4 std devs from mean (53359.67 ± 5763.37)
- [anomaly] oil_hl_funding_ann = 152.72 is 2.3 std devs from mean since 2026-04-28 (-8.76 ± 69.30)
- [anomaly] hype_hl_oi = 1994400043 is 2.3 std devs from mean (1308841486.92 ± 295431833.44)

**Blocked signal learning:**
- Open blocked shadows: 26
- Resolved blocked shadows: 981 (501 wins / 480 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=437 (148W/232L/57flat, 38.9% win-rate, sum $-0.2221, avg -0.05%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+16.28%)
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-4.88%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)

**LLM analysis:**
No discretionary closes were eligible this run: all weekend HL funding reversion positions are policy-gated to mechanical exits, and the sole FUNDING_EXTREME_LONG GOLD short is only 7h old vs the 12h minimum hold. Noting that GOLD funding has already round-tripped from +27.1% at entry to -16.5%, which would be thesis-invalidation evidence, but the position is not yet LLM-close eligible. Also flagging concentration risk: several weekend HL funding reversion longs opened simultaneously at 21h (AMZN, BIRD, CBRS, COIN, CRCL, INTC, LITE, RKLB) with very negative funding, and MSTR is already -4.39% while still under a mechanical -100% stop / +3% target regime. Structural concern to revisit overnight: the weekend funding reversion family is being exposed to a broad negative-funding equity tape at once; portfolio heat should be watched even though no current rule breach exists.

---

### 2026-08-30 22:28 UTC

**Portfolio:** $104.38 total | Cash $89.38 | 15 open | P&L $7.6148 | 64% win rate (858 trades)

**Closed 1 trades:**
- ❌ BIRD long via hyperliquid/hl_perp [HL BIRD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0024 (-0.2%, market -0.0024, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] BTC PM-Options IV gap moved wider by 7.2pp (was -8.9, now -1.7)
- [anomaly] amzn_hl_funding_ann = -74.45 is -4.7 std devs from mean (9.31 ± 17.92)
- [anomaly] hype_pm_ev = 87.77 is 2.6 std devs from mean (60.49 ± 10.33)
- [anomaly] btc_med_min = 67500 is 2.5 std devs from mean (53364.98 ± 5768.81)
- [anomaly] hype_med_max = 113.3 is 2.2 std devs from mean (81.25 ± 14.55)

**Blocked signal learning:**
- Open blocked shadows: 26
- Resolved blocked shadows: 982 (501 wins / 481 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-4.88%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)

**LLM analysis:**
No discretionary closes taken: all 15 open positions are either policy-gated mechanical WEEKEND_HL_FUNDING_REVERSION_LONG positions, or the GOLD FUNDING_EXTREME_LONG short is still under the 12h LLM min hold. Watch GOLD closely: funding has normalized from +27.1% annualized at entry to +16.0%; if it slips below the +15% entry threshold after min hold, a thesis_invalidated close would become eligible. Concentration in weekend HL funding-reversion longs is high and several names (MSTR, RKLB, SKHX) are underwater, but they remain inside mechanical stop/expiry rules, so no close at this review.

---

### 2026-08-30 23:28 UTC

**Portfolio:** $104.38 total | Cash $89.38 | 15 open | P&L $7.6148 | 64% win rate (858 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 5 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.27 is 2.6 std devs from mean (60.50 ± 10.34)
- [anomaly] btc_med_min = 67444 is 2.4 std devs from mean (53370.28 ± 5774.18)
- [anomaly] hype_med_max = 113 is 2.2 std devs from mean (81.26 ± 14.56)
- [anomaly] hype_hl_oi = 1922763401 is 2.1 std devs from mean (1309315090.08 ± 295825337.96)
- [anomaly] hype_med_min = 63 is 2.0 std devs from mean (37.28 ± 12.62)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 982 (501 wins / 481 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-4.88%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 10/12; next scheduled 2026-08-31T01:28:27.046Z). Mechanical cycle ran normally._

---

### 2026-08-31 00:28 UTC

**Portfolio:** $104.17 total | Cash $90.17 | 14 open | P&L $7.4054 | 64% win rate (860 trades)

**Closed 2 trades:**
- ✅ DKNG long via hyperliquid/hl_perp [HL DKNG Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0047 (0.5%, market 0.0040, funding 0.0008)
- ❌ SKHX long via hyperliquid/hl_perp [HL SKHX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.2141 (-21.4%, market -0.2156, funding 0.0015)

**Hypothesis lifecycle:**
- 🧪 Opened 3 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 Opened 3 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 3 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.25 is 2.6 std devs from mean (60.51 ± 10.35)
- [anomaly] btc_med_min = 67872 is 2.5 std devs from mean (53375.73 ± 5779.93)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.27 ± 14.57)
- [anomaly] hype_med_min = 63.1 is 2.0 std devs from mean (37.29 ± 12.62)

**Blocked signal learning:**
- Open blocked shadows: 28
- Resolved blocked shadows: 982 (501 wins / 481 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-4.88%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 0/12; next scheduled 2026-08-31T02:28:20.057Z). Mechanical cycle ran normally._

---

### 2026-08-31 01:28 UTC

**Portfolio:** $103.85 total | Cash $91.85 | 12 open | P&L $7.0915 | 64% win rate (864 trades)

**Closed 4 trades:**
- ❌ COST long via hyperliquid/hl_perp [HL COST Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0315 (-3.2%, market -0.0334, funding 0.0018)
- ❌ MSTR long via hyperliquid/hl_perp [HL MSTR Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.1527 (-15.3%, market -0.1558, funding 0.0030)
- ❌ CRCL long via hyperliquid/hl_perp [HL CRCL Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.1296 (-13.0%, market -0.1307, funding 0.0011)
- ✅ ZM long via hyperliquid/hl_perp [HL ZM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → signal_killed: +$0.0000 (0.0%, market 0.0000, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 Opened 2 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.83 is 2.6 std devs from mean (60.52 ± 10.36)
- [anomaly] btc_med_min = 67813 is 2.5 std devs from mean (53381.15 ± 5785.61)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.28 ± 14.58)
- [anomaly] hype_med_min = 63.1 is 2.0 std devs from mean (37.30 ± 12.63)

**Blocked signal learning:**
- Open blocked shadows: 28
- Resolved blocked shadows: 982 (501 wins / 481 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ PM proxy short: FUNDING_EXTREME_LONG_PM_PROXY_SHORT GOLD short via polymarket would have hit stop (-4.88%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)

**LLM analysis:**
No eligible discretionary closes this hour: all WEEKEND_HL_FUNDING_REVERSION_LONG positions are policy-gated to mechanical exits, and the GOLD FUNDING_EXTREME_LONG short is still 11h open, below the 12h minimum hold. Note for next review: GOLD funding has round-tripped from +27.1% at entry to +3.55%, and spot has moved favorably 4480->4444, so once min hold is satisfied this may be a thesis_invalidated candidate. Several weekend reversion longs are deeply underwater (RKLB -11.8%, INTC -8.9%, COIN -7.7%) against very wide -100% stops; no action available here, but the adverse drift is worth monitoring.

---

### 2026-08-31 02:28 UTC

**Portfolio:** $103.66 total | Cash $92.66 | 11 open | P&L $6.8958 | 64% win rate (867 trades)

**Closed 3 trades:**
- ❌ LITE long via hyperliquid/hl_perp [HL LITE Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0743 (-7.4%, market -0.0752, funding 0.0008)
- ❌ RKLB long via hyperliquid/hl_perp [HL RKLB Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.1215 (-12.2%, market -0.1242, funding 0.0026)
- ✅ ZM long via hyperliquid/hl_perp [HL ZM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → signal_killed: +$0.0000 (0.0%, market 0.0000, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.42 is 2.6 std devs from mean (60.53 ± 10.37)
- [anomaly] btc_med_min = 67556 is 2.4 std devs from mean (53386.47 ± 5791.04)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.29 ± 14.59)
- [anomaly] hype_med_min = 63.3 is 2.1 std devs from mean (37.31 ± 12.64)
- [anomaly] hype_hl_oi = 1905005290 is 2.0 std devs from mean (1309980028.77 ± 296320941.98)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 1/12; next scheduled 2026-08-31T04:28:22.614Z). Mechanical cycle ran normally._

---

### 2026-08-31 03:28 UTC

**Portfolio:** $103.52 total | Cash $94.52 | 9 open | P&L $6.7586 | 64% win rate (869 trades)

**Closed 2 trades:**
- ❌ GME long via hyperliquid/hl_perp [HL GME Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0482 (-4.8%, market -0.0536, funding 0.0053)
- ❌ COIN long via hyperliquid/hl_perp [HL COIN Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0890 (-8.9%, market -0.0901, funding 0.0011)

**Signal weight changes:**
- ⚠ WEEKEND_HL_FUNDING_REVERSION_LONG trending unprofitable — mean $-0.00251/trade over 190 trades (p=0.158).

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.02 is 2.6 std devs from mean (60.54 ± 10.38)
- [anomaly] btc_med_min = 67609 is 2.5 std devs from mean (53391.81 ± 5796.51)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.30 ± 14.60)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.32 ± 12.65)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 1/12; next scheduled 2026-08-31T05:28:21.753Z). Mechanical cycle ran normally._

---

### 2026-08-31 04:29 UTC

**Portfolio:** $103.49 total | Cash $97.49 | 6 open | P&L $6.7260 | 64% win rate (872 trades)

**Closed 3 trades:**
- ❌ AMD long via hyperliquid/hl_perp [HL AMD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0520 (-5.2%, market -0.0526, funding 0.0006)
- ✅ BX long via hyperliquid/hl_perp [HL BX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0055 (0.5%, market 0.0042, funding 0.0012)
- ✅ GOLD short via hyperliquid/hl_perp [HL GOLD perp] (FUNDING_EXTREME_LONG) → llm_decision: +$0.0139 (1.4%, market 0.0138, funding 0.0000)

**Signal weight changes:**
- ⚠ WEEKEND_HL_FUNDING_REVERSION_LONG trending unprofitable — mean $-0.00276/trade over 191 trades (p=0.135).
- ⚠ WEEKEND_HL_FUNDING_REVERSION_LONG trending unprofitable — mean $-0.00272/trade over 192 trades (p=0.137).

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 86.73 is 2.5 std devs from mean (60.55 ± 10.39)
- [anomaly] btc_med_min = 67889 is 2.5 std devs from mean (53397.25 ± 5802.22)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.32 ± 14.61)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.33 ± 12.65)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
Closed the eligible GOLD FUNDING_EXTREME_LONG short on thesis invalidation: gold_hl_funding_ann normalized from 27.1% to 5.48%, below the +15% signal threshold, while PnL was +1.4%. Weekend HL funding reversion longs (AMZN, CBRS, INTC, AAPL, MRVL, EBAY) are mechanical-only and currently negative; no LLM closes permitted for them. Macro backdrop remains risk-off/hawkish but no hard portfolio risk breach was triggered.

---

### 2026-08-31 05:28 UTC

**Portfolio:** $103.55 total | Cash $99.55 | 4 open | P&L $6.7883 | 64% win rate (874 trades)

**Closed 2 trades:**
- ✅ CBRS long via hyperliquid/hl_perp [HL CBRS Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0169 (1.7%, market 0.0157, funding 0.0011)
- ✅ MRVL long via hyperliquid/hl_perp [HL MRVL Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0454 (4.5%, market 0.0455, funding -0.0001)

**Signal weight changes:**
- ⚠ WEEKEND_HL_FUNDING_REVERSION_LONG trending unprofitable — mean $-0.00262/trade over 193 trades (p=0.145).
- ⚠ WEEKEND_HL_FUNDING_REVERSION_LONG trending unprofitable — mean $-0.00237/trade over 194 trades (p=0.169).

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 86.87 is 2.5 std devs from mean (60.56 ± 10.41)
- [anomaly] btc_med_min = 67609 is 2.4 std devs from mean (53402.58 ± 5807.65)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.33 ± 14.61)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.34 ± 12.66)
- [anomaly] hype_hl_oi = 1908793955 is 2.0 std devs from mean (1310641168.46 ± 296808662.34)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 2/12; next scheduled 2026-08-31T07:28:22.521Z). Mechanical cycle ran normally._

---

### 2026-08-31 06:28 UTC

**Portfolio:** $103.55 total | Cash $99.55 | 4 open | P&L $6.7883 | 64% win rate (874 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 86.81 is 2.5 std devs from mean (60.57 ± 10.42)
- [anomaly] btc_med_min = 67609 is 2.4 std devs from mean (53407.91 ± 5813.07)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.34 ± 14.62)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.35 ± 12.67)
- [anomaly] hype_hl_oi = 1914304763 is 2.0 std devs from mean (1310867514.02 ± 296983056.32)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 2/12; next scheduled 2026-08-31T08:28:24.387Z). Mechanical cycle ran normally._

---


### Nightly research advice ingested (generatedAt=2026-08-31T07:11:04.481Z, model=deepseek-v4-pro)
- Hypotheses added: 4 (rejected 3); reviews applied: 7; invalidated assumptions learned: 5; param updates: none.
- Strategy review: What is working: contract-level premium fades remain the strongest edge — manual PM-IV rich NO live 2/3 +351.7% avg and 9/10 shadows, one-touch live 4/4 +18.4%, PM_IV_GT_OPT_IV clean 3/5 +9.8%, and monotonic arb 33/38. What is failing: many contract trades are still being scored as spot-direction bets, which turns a profitable premium fade into a 0-win spot family; proxy shorts are bleeding; weekend funding threshold-only reversions are unstable; and HYPE/rising-IV confirmation signals are firing late after large BTC rallies rather than before them.
- Nightly journal: Tonight's main lesson is re-framing: contract premium edges must be tested as contract P&L, not spot calls. H-534 and several one-touch families burned tests because the prediction was a >2% spot move rather than premium decay. Weekend funding thresholds need a weekend/turn/percentile filter; existing active refinements already encode that, so no new threshold variants were authored. Proxy shorts remain weak and should stay in shadow. The new hypotheses prioritize neutral NO/YES premium fades from outcome-panel findings and one-touch BTC/GOLD refinements, plus neutral absolute-move fixes for f
### 2026-08-31 07:28 UTC

**Portfolio:** $103.59 total | Cash $100.59 | 3 open | P&L $6.8249 | 64% win rate (875 trades)

**Closed 1 trades:**
- ✅ INTC long via hyperliquid/hl_perp [HL INTC Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → target: +$0.0366 (3.7%, market 0.0348, funding 0.0018)

**Signal weight changes:**
- ⚠ WEEKEND_HL_FUNDING_REVERSION_LONG trending unprofitable — mean $-0.00217/trade over 195 trades (p=0.190).

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 86.83 is 2.5 std devs from mean (60.58 ± 10.43)
- [anomaly] btc_med_min = 67667 is 2.4 std devs from mean (53413.25 ± 5818.53)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.35 ± 14.63)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.36 ± 12.68)
- [anomaly] hype_hl_oi = 1916636710 is 2.0 std devs from mean (1311094563.94 ± 297158822.80)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
No discretionary closes permitted this run. AMZN funding has normalized from -55.9% to +5.48% since entry, materially weakening that trade's carry thesis; however this is context-only and policy-gated mechanical exit remains in control. AAPL is the weakest open position at -2.07% but below min hold and has no LLM close eligibility; EBAY is early. Continue monitoring mechanical target/stop/expiry exits. Structural note: weekend HL funding reversion family remains positive in shadows but live avg PnL is slightly negative; review AMZN/AAPL/EBAY behavior if these current entries fail.

---

### 2026-08-31 08:28 UTC

**Portfolio:** $103.59 total | Cash $100.59 | 3 open | P&L $6.8249 | 64% win rate (875 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 86.9 is 2.5 std devs from mean (60.59 ± 10.44)
- [anomaly] btc_med_min = 67667 is 2.4 std devs from mean (53418.59 ± 5823.98)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.36 ± 14.64)
- [anomaly] hype_hl_oi = 1924813766 is 2.1 std devs from mean (1311324507.44 ± 297340459.78)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.37 ± 12.68)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 3/12; next scheduled 2026-08-31T10:28:22.808Z). Mechanical cycle ran normally._

---

### 2026-08-31 09:28 UTC

**Portfolio:** $103.59 total | Cash $101.59 | 2 open | P&L $6.8281 | 64% win rate (876 trades)

**Closed 1 trades:**
- ✅ EBAY long via hyperliquid/hl_perp [HL EBAY Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0032 (0.3%, market 0.0024, funding 0.0008)

**Signal weight changes:**
- ⚠ WEEKEND_HL_FUNDING_REVERSION_LONG trending unprofitable — mean $-0.00214/trade over 196 trades (p=0.192).

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 86.91 is 2.5 std devs from mean (60.60 ± 10.45)
- [anomaly] btc_med_min = 67667 is 2.4 std devs from mean (53423.93 ± 5829.41)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.37 ± 14.65)
- [anomaly] hype_hl_oi = 1927649736 is 2.1 std devs from mean (1311555340.86 ± 297523866.83)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.38 ± 12.69)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 3/12; next scheduled 2026-08-31T11:28:23.347Z). Mechanical cycle ran normally._

---

### 2026-08-31 10:28 UTC

**Portfolio:** $103.59 total | Cash $101.59 | 2 open | P&L $6.8281 | 64% win rate (876 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.61 is 2.6 std devs from mean (60.61 ± 10.46)
- [anomaly] btc_med_min = 67556 is 2.4 std devs from mean (53429.22 ± 5834.73)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.39 ± 14.66)
- [anomaly] hype_hl_oi = 1937760805 is 2.1 std devs from mean (1311789786.93 ± 297714740.09)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.39 ± 12.70)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
No discretionary closes this run: both open positions are WEEKEND_HL_FUNDING_REVERSION_LONG and LLM closes are policy-gated off, so mechanical target/stop/expiry owns exits. AMZN is -2.81% at 13h; its signal-family price evidence is only slightly lower, but HL funding has normalized from -55.9% to +5.22% and the perp has underperformed, so the original carry thesis appears spent. AAPL is -1.52% at 12h with no comparable evidence and no hard risk breach. Structural note for nightly review: when weekend funding reversion normalizes this early, the remaining edge may be limited, but this should be reviewed as a signal-family matter rather than closed here.

---

### 2026-08-31 12:28 UTC

**Portfolio:** $103.59 total | Cash $101.59 | 2 open | P&L $6.8281 | 64% win rate (876 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 28 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.72 is 2.6 std devs from mean (60.62 ± 10.47)
- [anomaly] btc_med_min = 67717 is 2.4 std devs from mean (53434.57 ± 5840.18)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.40 ± 14.67)
- [anomaly] hype_hl_oi = 1935741406 is 2.1 std devs from mean (1312023301.76 ± 297903579.13)
- [anomaly] hype_med_min = 63.2 is 2.0 std devs from mean (37.40 ± 12.71)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 4/12; next scheduled 2026-08-31T14:28:30.797Z). Mechanical cycle ran normally._

---

### 2026-08-31 13:28 UTC

**Portfolio:** $103.59 total | Cash $101.59 | 2 open | P&L $6.8281 | 64% win rate (876 trades)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 27 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] hype_pm_ev = 87.77 is 2.6 std devs from mean (60.63 ± 10.48)
- [anomaly] btc_med_min = 67660 is 2.4 std devs from mean (53439.89 ± 5845.56)
- [anomaly] hype_med_max = 112.3 is 2.1 std devs from mean (81.41 ± 14.68)
- [anomaly] hype_hl_oi = 1928900915 is 2.1 std devs from mean (1312254082.76 ± 298086651.38)
- [anomaly] hype_med_min = 63.1 is 2.0 std devs from mean (37.41 ± 12.71)

**Blocked signal learning:**
- Open blocked shadows: 27
- Resolved blocked shadows: 983 (501 wins / 482 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 9/10 shadows would have won, avg P&L 5.86%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- one-touch abs_edge_bin="abs_edge<15" n=438 (148W/233L/57flat, 38.8% win-rate, sum $-0.3151, avg -0.07%) — calibration weak; consider excluding this slice from the live opening gate or tightening edge requirement.
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have hit stop (-20.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have hit stop (-98.41%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-9.30%)
- ❌ Blocked: NO_BIAS_ADJUSTED_GAP_SHADOW GOLD short via polymarket would have edge compressed but trade lost money (-2.50%)

**LLM analysis:**
No discretionary closes are allowed this run: both AMZN and AAPL are policy-gated WEEKEND_HL_FUNDING_REVERSION_LONG positions with LLM close allowed=false, so rule-based exits own them. AMZN is -4.82% with 8h to expiry and spot making a fresh 24h low; its HL funding has normalized from -55.9% to +5.48% annualized, which is a material thesis/carry weakening, but this is context-only and no close may be emitted. AAPL is roughly flat at -0.24%. Structural note for nightly: AMZN is already disabled in FUNDING_EXTREME_LONG, and this weekend reversion instance is underperforming; worth revisiting whether AMZN belongs in the weekend funding reversion family given the current behavior.

---

