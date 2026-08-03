# Nightly Research Report

_Generated 2026-08-03T07:09:05Z_

## 1. Summary
- FIND records: 52 total (open 14, strengthened 22, weakened 0, negative 3)
- Research themes: 4
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0030** opp=0.9946 conf=0.5473 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #3 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #4 **FIND-0043** opp=0.9868 conf=0.567 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #7 **FIND-0022** opp=0.9698 conf=0.4945 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #8 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #9 **FIND-0047** opp=0.8968 conf=0.4255 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0046** opp=0.8564 conf=0.3926 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 31 findings, avg opp 0.7072
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `FIND-0030` / THEME-0001: Sell YES on any upside one-touch NO contract when the sell-YES edge is between 3 and 8 probability points, expecting the edge to close via YES price decline.
- `FIND-0021` / THEME-0004: Sell YES on any upside one-touch NO contract when PM IV is at least 10 volatility points rich to listed options IV, expecting the IV mispricing to mean-revert.
- `FIND-0024` / THEME-0004: Refinement of the PM IV rich NO signal: only act on contracts expiring within 30 days, where the edge decays faster and spreads tighten.
- `FIND-0043` / THEME-0001: On BTC only, sell YES on upside one-touch NO contracts when the sell-YES edge is between 3 and 8 points, as BTC-specific liquidity and mean-reversion dynamics amplify edge closure.
- `FIND-0036` / THEME-0001: On GOLD upside one-touch NO contracts expiring within 30 days, take a short position (sell YES) when there is any positive sell-YES edge, targeting quick edge decay near expiry.
- `—` / —: Refinement of AMZN convergence: instead of going long when funding is positive, go long when funding is deeply negative (< -20%) and basis is also deeply negative (< -0.5%), expecting a strong reversion as the extreme mispricing normalizes.
- `—` / —: Refinement of gold one-touch NO heatmap: after a large underlying-cap edge (≥10 pts) appears, only short gold if spot is also below its 24h SMA, adding a bearish momentum filter to avoid fading strength.
- `—` / —: Refinement of BTC PM IV expansion: replace absolute IV thresholds with regime-relative extreme compression (PM IV z-score < -2 over 30d), which historically precedes larger breakouts, and expect a >2% absolute move in 5 days.
- `—` / —: Refinement of cross-asset BTC momentum: require BTC itself to have a 24h gain >1% and HYPE OI to surge by >5% (strong risk-on confirmation) before going long, filtering out false starts.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-03T07:09:05Z
- Findings export: 2026-08-03T07:07:43Z
- Themes export: 2026-08-03T07:07:47Z
- LLM advice: 2026-08-03T07:07:42.794Z
