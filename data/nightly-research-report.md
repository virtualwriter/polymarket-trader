# Nightly Research Report

_Generated 2026-08-01T07:10:41Z_

## 1. Summary
- FIND records: 50 total (open 15, strengthened 19, weakened 0, negative 3)
- Research themes: 4
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #3 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #4 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #5 **FIND-0022** opp=0.9698 conf=0.4945 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #6 **FIND-0030** opp=0.966 conf=0.4368 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #7 **FIND-0046** opp=0.9383 conf=0.3983 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch
- #8 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #9 **FIND-0043** opp=0.9326 conf=0.4315 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0047** opp=0.8779 conf=0.3983 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 29 findings, avg opp 0.6661
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `—` / —: Refinement of AMZN funding convergence: instead of waiting for near-zero basis after a flip, short AMZN perp when funding is elevated (≥15%) and basis is deeply negative (≤ -0.5%), expecting funding to decline and perp to depreciate.
- `—` / —: Refinement of CBRS weekend funding reversion shadow: require extreme weekend funding (< -20%) on Saturday or Sunday, isolating the genuine weekend funding crash episodes.
- `—` / —: Refinement of AAPL weekend funding reversion shadow: apply weekend-only filter and deeper funding threshold (< -20%) to capture true weekend funding squeezes.
- `—` / —: Refinement of BTC PM IV expansion: replace absolute IV thresholds with regime-relative compression (PM IV z-score ≤ -1.5) while options IV remains elevated (>40), retaining the thesis that compression leads to spot expansion but adding a r…
- `FIND-0021` / THEME-0004: Fade rich PM IV on upside one-touch NO contracts: when PM IV exceeds options IV by ≥10 vol points, short spot via selling YES on those touch-high contracts.
- `FIND-0024` / THEME-0004: Rich PM IV near-expiry NO fade: tighten the rich-IV signal to contracts expiring within 30 days, capturing faster mean reversion.
- `FIND-0020` / THEME-0003: Smart-flow fade on upside touch: when smart wallets show a short- or flat-stance on YES contracts and there is at least 3pt sell-YES edge, short the spot.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-01T07:10:40Z
- Findings export: 2026-08-01T07:09:23Z
- Themes export: 2026-08-01T07:09:27Z
- LLM advice: 2026-08-01T07:09:23.332Z
