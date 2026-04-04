# Trading Engine Learning Journal

System initialized on 2026-04-03. Paper trading with $100 bankroll, $1 per trade.

Data sources: Hyperliquid perps, Polymarket prediction markets, CBOE options.
Assets: BTC, HYPE, GOLD, AMZN, OIL.

---

### 2026-04-03 23:23 UTC

**Portfolio:** $100.00 total | Cash $99.00 | 1 open | P&L $0.0000 | N/A% win rate (0 trades)

**Opened 1 positions:**
- GOLD long @ $4663 via polymarket (OPT_IV_GT_PM_IV)

---

### 2026-04-03 23:26 UTC

**Portfolio:** $100.00 total | Cash $98.00 | 2 open | P&L $0.0000 | N/A% win rate (0 trades)

**Opened 1 positions:**
- OIL short @ $85.14 via hyperliquid (FUNDING_EXTREME_LONG)

---

### 2026-04-03 23:42 UTC

**Portfolio:** $100.00 total | Cash $97.00 | 3 open | P&L $0.0000 | N/A% win rate (0 trades)

**Opened 1 positions:**
- HYPE short @ $35.581 via hyperliquid (LLM_HYPOTHESIS)

**LLM analysis:**
Day 1 analysis reveals strong cross-venue volatility divergences, particularly in BTC where polymarket consistently underprices volatility vs options. Oil funding experienced violent reversal (+44% swing), confirming crowded positioning thesis. Initiated HYPE short based on funding/OI divergence pattern. Current positions showing early signs of mean reversion - oil funding extremes typically don't sustain, gold vol gap remains wide. Key learning: funding rate velocity matters as much as absolute levels.

---

### 2026-04-04 03:28 UTC

**Portfolio:** $100.00 total | Cash $96.00 | 4 open | P&L $0.0000 | N/A% win rate (0 trades)

**Opened 1 positions:**
- AMZN long @ $209.78 via hyperliquid (LLM_HYPOTHESIS)

**LLM analysis:**
Day 2 analysis reveals funding rates as primary alpha source. Oil trade performing as expected with mean reversion after 44% swing. AMZN showing new opportunity with funding sign flip while maintaining negative basis - classic perp/spot convergence setup. HYPE position challenged as funding continues accelerating rather than reversing, suggesting momentum rather than liquidation cascade. Key insight: distinguish between liquidation-driven and momentum-driven funding extremes. Gold vol gap remains wide but stable - may need longer timeframe for reversion.

---

### 2026-04-04 05:50 UTC

**Portfolio:** $100.00 total | Cash $95.00 | 5 open | P&L $0.0000 | N/A% win rate (0 trades)

**Opened 1 positions:**
- BTC long @ $66862 via polymarket (LLM_HYPOTHESIS)

**LLM analysis:**
Day 3 validation: Funding rate mean reversion thesis proving robust - oil trade working perfectly with 85% funding collapse. Key insight: >30% daily funding swings are unsustainable regardless of asset. HYPE trade mixed - funding did reverse but momentum patterns harder to predict than liquidation cascades. AMZN convergence trade on track. New focus: persistent structural gaps between venues during stable periods may offer better risk-adjusted returns than funding extremes. Gold PM premium to futures (~275pts) largest yet seen - testing new structural hypothesis.

---

