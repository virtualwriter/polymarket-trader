# Trading Engine Learning Journal
<!-- compacted 2026-07-27: older entries archived to data/journal-archive/ -->

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 5/12; next scheduled 2026-07-26T19:28:14.868Z). Mechanical cycle ran normally._

---

### 2026-07-26 18:28 UTC

**Portfolio:** $99.02 total | Cash $97.02 | 2 open | P&L $2.2547 | 64% win rate (547 trades)

**Closed 2 trades:**
- ✅ BX long via hyperliquid/hl_perp [HL BX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0193 (1.9%, market 0.0193, funding -0.0001)
- ✅ ZM long via hyperliquid/hl_perp [HL ZM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0069 (0.7%, market 0.0069, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Blocked signal learning:**
- Open blocked shadows: 46
- Resolved blocked shadows: 658 (361 wins / 297 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.23%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+14.29%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-2.13%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
No discretionary closes are permitted—both EBAY and TSLA positions are rule-based WEEKEND_HL_FUNDING_REVERSION_LONG trades with LLM closes disabled. EBAY's funding has moved from -61.6% to -19.2% in five hours, a substantial normalization that weakens the immediate carry thesis, but the mechanical exit parameters (target/stop/breakeven/expiry) remain in control. TSLA funding eased from -88.6% to -83.6% and is still firmly negative, so thesis is intact. Continue monitoring; if EBAY funding flips positive or price stalls near breakeven, flag for post-close review of the funding mean-reversion decay assumptions.

---

### 2026-07-26 19:28 UTC

**Portfolio:** $99.02 total | Cash $95.02 | 4 open | P&L $2.2547 | 64% win rate (547 trades)

**Opened 1 positions:**
- AMZN long @ $233.17 via hyperliquid/hl_perp [HL AMZN perp] (FUNDING_EXTREME_SHORT)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 19 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_hl_funding_ann = 212.89 is 3.2 std devs from mean since 2026-04-28 (-7.51 ± 69.49)

**Blocked signal learning:**
- Open blocked shadows: 46
- Resolved blocked shadows: 658 (361 wins / 297 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.23%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+14.29%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-2.13%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
All three open positions (EBAY, TSLA, DKNG) are WEEKEND_HL_FUNDING_REVERSION_LONG rule-based trades and not eligible for discretionary closes. Funding conditions have partially normalized for TSLA (flipped neutral/positive) but the broader thesis of extreme negative funding reverting is still intact. The TSLA move could be early mean reversion; I'll let the mechanical scanner manage exits. No structural concerns about the signal family—the setup family truth table shows positive expectancy with 73% win rate on 242 live trades. No action taken.

---

### 2026-07-26 20:28 UTC

**Portfolio:** $99.02 total | Cash $89.02 | 10 open | P&L $2.2547 | 64% win rate (547 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Blocked signal learning:**
- Open blocked shadows: 46
- Resolved blocked shadows: 658 (361 wins / 297 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.23%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+14.29%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-2.13%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 7/12; next scheduled 2026-07-26T22:28:10.588Z). Mechanical cycle ran normally._

---

### 2026-07-26 21:28 UTC

**Portfolio:** $99.02 total | Cash $90.02 | 9 open | P&L $2.2588 | 64% win rate (548 trades)

**Closed 1 trades:**
- ✅ DKNG long via hyperliquid/hl_perp [HL DKNG Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0041 (0.4%, market 0.0037, funding 0.0004)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Blocked signal learning:**
- Open blocked shadows: 47
- Resolved blocked shadows: 658 (361 wins / 297 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have closed with thesis validated profitably (+1.23%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+14.29%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-2.13%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 7/12; next scheduled 2026-07-26T23:28:14.654Z). Mechanical cycle ran normally._

---

### 2026-07-26 22:28 UTC

**Portfolio:** $99.40 total | Cash $97.40 | 2 open | P&L $2.6378 | 64% win rate (555 trades)

**Closed 7 trades:**
- ✅ TSLA long via hyperliquid/hl_perp [HL TSLA Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0048 (0.5%, market 0.0041, funding 0.0007)
- ✅ AMD long via hyperliquid/hl_perp [HL AMD Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0424 (4.2%, market 0.0425, funding -0.0000)
- ✅ ARM long via hyperliquid/hl_perp [HL ARM Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0504 (5.0%, market 0.0504, funding -0.0000)
- ✅ CBRS long via hyperliquid/hl_perp [HL CBRS Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0695 (7.0%, market 0.0696, funding -0.0000)
- ✅ INTC long via hyperliquid/hl_perp [HL INTC Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0703 (7.0%, market 0.0703, funding -0.0000)
- ✅ MU long via hyperliquid/hl_perp [HL MU Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0597 (6.0%, market 0.0598, funding -0.0000)
- ✅ SKHX long via hyperliquid/hl_perp [HL SKHX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_validated_profitable: +$0.0818 (8.2%, market 0.0818, funding -0.0000)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 19 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] OIL PM-Options IV gap moved wider by 9.9pp (was -37.0, now -27.1)
- [anomaly] btc_opt_iv_term_spread = -19.58 is -2.1 std devs from mean (-2.86 ± 7.98)
- [anomaly] amzn_hl_basis_pct = 1.02 is 2.1 std devs from mean (0.11 ± 0.44)

**Blocked signal learning:**
- Open blocked shadows: 46
- Resolved blocked shadows: 659 (361 wins / 298 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+14.29%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-2.13%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-6.56%)

**LLM analysis:**
No discretionary closes allowed: EBAY is a rule-based weekend funding reversion signal (LLM closes policy-gated), and AMZN is only 3h into a 168h planned hold (min 12h). AMZN FUNDING_EXTREME_SHORT entry was predicated on extremely negative funding (-25.8%); funding has now violently reversed to +46%, indicating the short crowding dissolved entirely and the squeeze likely happened. This is a textbook thesis-invalidation signal, but the trade is too young to close. If funding remains positive and price stalls through the 12h mark, a thesis_invalidated close may be warranted. The broad funding spike across Builder DEX perps (AMD, ARM, INTC, etc.) suggests a systemic unwind — potentially linked to an end-of-session funding rate recalculation or a venue-level event. EBAY funding remains deeply negative (-72%) and the trade is underwater (-2%), but thesis intact; no action required. Nightly research should consider dynamic thesis-invalidation thresholds for FUNDING_EXTREME_SHORT when funding normalizes beyond a certain level before target/stop.

---

### 2026-07-26 23:28 UTC

**Portfolio:** $99.40 total | Cash $96.40 | 3 open | P&L $2.6377 | 64% win rate (555 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 Opened 1 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_funding_ann = -48.65 is -3.1 std devs from mean (11.00 ± 19.14)
- [anomaly] btc_opt_iv_term_spread = -20.51 is -2.2 std devs from mean (-2.86 ± 7.99)

**Blocked signal learning:**
- Open blocked shadows: 47
- Resolved blocked shadows: 659 (361 wins / 298 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+14.29%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-2.13%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-6.56%)

**LLM analysis:**
_LLM call skipped (duplicate-signals (1 recurring signal seen within 6h); 1.0h since last call; daily budget 8/12; next scheduled 2026-07-27T01:28:11.859Z). Mechanical cycle ran normally._

---

### 2026-07-27 00:28 UTC

**Portfolio:** $99.44 total | Cash $97.44 | 2 open | P&L $2.6748 | 64% win rate (556 trades)

**Closed 1 trades:**
- ✅ AAPL long via hyperliquid/hl_perp [HL AAPL Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → target: +$0.0371 (3.7%, market 0.0371, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 19 active families did not trigger; 0 later families waiting.
- 🧪 Opened 1 shadow_mined setup-family shadow tests (active cap 80, maxPending/family 4).
- 🧪 shadow_mined retest queue: 6 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] gold_opt_iv_90d = 29.2 is 3.1 std devs from mean (23.13 ± 1.94)
- [anomaly] amzn_hl_basis_pct = 1.39 is 2.9 std devs from mean (0.11 ± 0.44)
- [anomaly] btc_opt_iv_term_spread = -19.26 is -2.0 std devs from mean (-2.87 ± 8.00)

**Blocked signal learning:**
- Open blocked shadows: 49
- Resolved blocked shadows: 660 (362 wins / 298 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-2.13%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+0.00%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-6.56%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 0/12; next scheduled 2026-07-27T02:28:19.003Z). Mechanical cycle ran normally._

---

### 2026-07-27 02:28 UTC

**Portfolio:** $99.42 total | Cash $98.42 | 1 open | P&L $2.6628 | 64% win rate (557 trades)

**Closed 1 trades:**
- ❌ EBAY long via hyperliquid/hl_perp [HL EBAY Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0120 (-1.2%, market -0.0154, funding 0.0034)

**Hypothesis lifecycle:**
- 🧪 Opened 1 LLM setup-family shadow tests (active cap 200, maxPending/family 8).
- 🧪 LLM retest queue: 19 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] OIL PM-Options IV gap moved wider by 11.7pp (was -27.6, now -15.9)
- [anomaly] amzn_hl_basis_pct = 1.36 is 2.8 std devs from mean (0.11 ± 0.44)
- [anomaly] btc_opt_iv_term_spread = -19.49 is -2.1 std devs from mean (-2.88 ± 8.00)

**Blocked signal learning:**
- Open blocked shadows: 47
- Resolved blocked shadows: 662 (363 wins / 299 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-6.56%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)

**LLM analysis:**
AMZN FUNDING_EXTREME_SHORT long (7h open) has seen funding flip from -25.8% to +5.5% annualized—a full thesis invalidation. The 12h minimum hold blocks a discretionary close now; if funding stays positive/near zero after 12h, a thesis_invalidated exit should be taken. Price drift small (+0.65%) but signal condition evaporated.

---

### 2026-07-27 03:28 UTC

**Portfolio:** $99.42 total | Cash $98.42 | 1 open | P&L $2.6628 | 64% win rate (557 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_basis_pct = 1.39 is 2.9 std devs from mean (0.11 ± 0.44)
- [anomaly] oil_opt_fwd_90d = 5.8 is -2.8 std devs from mean since 2026-04-28 (79.21 ± 26.07)
- [anomaly] btc_opt_iv_term_spread = -19.88 is -2.1 std devs from mean (-2.89 ± 8.01)

**Blocked signal learning:**
- Open blocked shadows: 47
- Resolved blocked shadows: 662 (363 wins / 299 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-6.56%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 1/12; next scheduled 2026-07-27T05:28:23.867Z). Mechanical cycle ran normally._

---

### 2026-07-27 04:28 UTC

**Portfolio:** $99.42 total | Cash $98.42 | 1 open | P&L $2.6628 | 64% win rate (557 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_basis_pct = 1.34 is 2.8 std devs from mean (0.11 ± 0.44)
- [anomaly] btc_opt_iv_term_spread = -21.12 is -2.3 std devs from mean (-2.90 ± 8.02)

**Blocked signal learning:**
- Open blocked shadows: 47
- Resolved blocked shadows: 662 (363 wins / 299 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-6.56%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 1/12; next scheduled 2026-07-27T06:28:25.636Z). Mechanical cycle ran normally._

---

### 2026-07-27 05:28 UTC

**Portfolio:** $99.42 total | Cash $98.42 | 1 open | P&L $2.6628 | 64% win rate (557 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_basis_pct = 1.47 is 3.1 std devs from mean (0.11 ± 0.44)
- [anomaly] btc_opt_iv_term_spread = -20.03 is -2.1 std devs from mean (-2.91 ± 8.03)

**Blocked signal learning:**
- Open blocked shadows: 48
- Resolved blocked shadows: 662 (363 wins / 299 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have edge compressed but trade lost money (-6.56%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)

**LLM analysis:**
AMZN FUNDING_EXTREME_SHORT long (T-1785094109817-2xu5) is under immediate thesis pressure: funding has normalized through the entry threshold and turned positive, meaning longs now pay shorts—a full invalidation signal. However, the position is only 10 hours old, below the 12‑hour minimum hold for discretionary LLM closes, so no action can be taken. We will reassess after 12h; if funding remains positive or continues to rise, a thesis_invalidated close will be warranted. The perp is still +0.76%, but the carry advantage is gone. Also note that AMZN-specific FUNDING_EXTREME_SHORT trades have been profitable historically (73% win rate), which gives some patience, but the signal family as a whole is barely breakeven. No other positions to review.

---

### 2026-07-27 06:28 UTC

**Portfolio:** $99.42 total | Cash $97.42 | 2 open | P&L $2.6628 | 64% win rate (557 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_basis_pct = 1.6 is 3.4 std devs from mean (0.12 ± 0.44)
- [anomaly] btc_opt_iv_term_spread = -21.13 is -2.3 std devs from mean (-2.92 ± 8.03)

**Blocked signal learning:**
- Open blocked shadows: 47
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 2/12; next scheduled 2026-07-27T08:28:12.595Z). Mechanical cycle ran normally._

---

### 2026-07-27 07:28 UTC

**Portfolio:** $99.42 total | Cash $97.42 | 2 open | P&L $2.6628 | 64% win rate (557 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [divergence] OIL PM-Options IV gap moved narrower by 12.0pp (was -13.6, now -25.6)
- [anomaly] amzn_hl_basis_pct = 1.63 is 3.4 std devs from mean (0.12 ± 0.44)
- [anomaly] btc_opt_iv_term_spread = -20.47 is -2.2 std devs from mean (-2.93 ± 8.04)

**Blocked signal learning:**
- Open blocked shadows: 48
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 2/12; next scheduled 2026-07-27T09:28:17.693Z). Mechanical cycle ran normally._

---

### 2026-07-27 08:28 UTC

**Portfolio:** $99.43 total | Cash $98.43 | 1 open | P&L $2.6733 | 64% win rate (558 trades)

**Closed 1 trades:**
- ✅ AMZN long via hyperliquid/hl_perp [HL AMZN perp] (FUNDING_EXTREME_SHORT) → llm_decision: +$0.0105 (1.0%, market 0.0106, funding -0.0001)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] amzn_hl_basis_pct = 1.76 is 3.7 std devs from mean (0.12 ± 0.45)

**Blocked signal learning:**
- Open blocked shadows: 48
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
AMZN FUNDING_EXTREME_SHORT long closed after funding rate swung from -25.8% to +15.86%, destroying the crowded-short premise. The trade was up +1.05% at exit. CBRS weekend funding reversion long remains under mechanical-only management; no concerns at this stage.

---

### 2026-07-27 09:28 UTC

**Portfolio:** $99.43 total | Cash $98.43 | 1 open | P&L $2.6733 | 64% win rate (558 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] btc_opt_iv_term_spread = -19.07 is -2.0 std devs from mean (-2.94 ± 8.05)

**Blocked signal learning:**
- Open blocked shadows: 48
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 3/12; next scheduled 2026-07-27T11:28:19.842Z). Mechanical cycle ran normally._

---

### 2026-07-27 10:28 UTC

**Portfolio:** $99.43 total | Cash $97.43 | 2 open | P&L $2.6733 | 64% win rate (558 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] btc_opt_iv_term_spread = -19.6 is -2.1 std devs from mean (-2.95 ± 8.06)

**Blocked signal learning:**
- Open blocked shadows: 48
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 3/12; next scheduled 2026-07-27T12:28:21.778Z). Mechanical cycle ran normally._

---

### 2026-07-27 11:28 UTC

**Portfolio:** $99.43 total | Cash $96.43 | 3 open | P&L $2.6733 | 64% win rate (558 trades)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] btc_opt_iv_term_spread = -19.2 is -2.0 std devs from mean (-2.96 ± 8.07)

**Blocked signal learning:**
- Open blocked shadows: 48
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
All three open positions (CBRS, SKHX, RIVN) are WEEKEND_HL_FUNDING_REVERSION_LONG trades, and LLM discretionary closes are not permitted per the allowed action surface. CBRS is down -7.1% after 5h, and its funding has flipped from deeply negative to slightly positive (+1.84%), which could be a thesis-weakening signal, though mechanical exits remain in control. SKHX funding has intensified to -214.5%, deepening the carry incentive but also flash risk; P&L is -4.0% early. RIVN just entered at -52% funding and is flat. Overall portfolio risk is contained with $96 cash and 3 small positions. Continue to monitor funding reversals and price action, but no manual action allowed at this time.

---

### 2026-07-27 12:28 UTC

**Portfolio:** $99.47 total | Cash $97.47 | 2 open | P&L $2.7137 | 64% win rate (559 trades)

**Closed 1 trades:**
- ✅ RIVN long via hyperliquid/hl_perp [HL RIVN Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → target: +$0.0404 (4.0%, market 0.0404, funding 0.0000)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Blocked signal learning:**
- Open blocked shadows: 49
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 1.0h since last call; daily budget 4/12; next scheduled 2026-07-27T14:28:24.076Z). Mechanical cycle ran normally._

---

### 2026-07-27 13:28 UTC

**Portfolio:** $99.43 total | Cash $98.43 | 1 open | P&L $2.6692 | 64% win rate (560 trades)

**Closed 1 trades:**
- ❌ SKHX long via hyperliquid/hl_perp [HL SKHX Builder DEX stock perp] (WEEKEND_HL_FUNDING_REVERSION_LONG) → thesis_compressed_loss: $-0.0445 (-4.5%, market -0.0465, funding 0.0020)

**Hypothesis lifecycle:**
- 🧪 LLM retest queue: 20 active families did not trigger; 0 later families waiting.
- 🧪 shadow_mined retest queue: 7 active families did not trigger; 0 later families waiting.
- 🧪 informed_flow retest queue: 1 active families did not trigger; 0 later families waiting.

**Statistical observations:**
- [anomaly] oil_opt_fwd_90d = 6.4 is -2.8 std devs from mean since 2026-04-28 (79.14 ± 26.09)

**Blocked signal learning:**
- Open blocked shadows: 49
- Resolved blocked shadows: 663 (363 wins / 300 losses)
- WEEKEND_HL_FUNDING_REVERSION_LONG trend filter may be too strict: 188/253 blocked trades would have won.
- USER_PM_IV_TOUCH_RICH_NO manual shadow signal is promising: 15/19 shadows would have won, avg P&L 11.78%.
- USER_PM_APR_XAU_TAIL_NO manual shadow signal is promising: 8/11 shadows would have won, avg P&L 0.70%.
- FUNDING_EXTREME_LONG trend filter may be too strict: 10/16 blocked trades would have won.
- PM_IV_GT_OPT_IV missing downside leg is inconclusive (2W/1L across 3 resolved shadows, avg P&L 8.41%).
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO GOLD short via polymarket would have closed with thesis validated profitably (+0.00%)
- ✅ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO ETH short via polymarket would have closed with thesis validated profitably (+1.27%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO OIL short via polymarket would have edge compressed but trade lost money (-0.43%)
- ❌ One-touch high-edge: ONE_TOUCH_HIGH_EDGE_NO BTC short via polymarket would have edge compressed but trade lost money (-1.11%)

**LLM analysis:**
_LLM call skipped (no trigger fired; 2.0h since last call; daily budget 4/12; next scheduled 2026-07-27T15:28:24.615Z). Mechanical cycle ran normally._

---

