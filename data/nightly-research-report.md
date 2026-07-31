# Nightly Research Report

_Generated 2026-07-31T07:08:26Z_

## 1. Summary
- FIND records: 50 total (open 16, strengthened 18, weakened 0, negative 3)
- Research themes: 4
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #3 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #4 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #5 **FIND-0022** opp=0.9783 conf=0.5419 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #6 **FIND-0030** opp=0.966 conf=0.4368 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #7 **FIND-0046** opp=0.9383 conf=0.3983 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch
- #8 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #9 **FIND-0043** opp=0.9326 conf=0.4315 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0047** opp=0.8779 conf=0.3983 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 29 findings, avg opp 0.6731
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `—` / —: Refinement of AMZN perp convergence: only enter when AMZN basis is near zero ( > -0.05 ), funding is positive AND funding has just started to decline (change_pct_24h < -5), signaling that the period of persistent flat funding is ending.
- `—` / —: Refinement of gold one-touch heatmap: only short when the underlying-cap edge is ≥10 pts AND there is an explicit sell-yes edge (sell_yes_edge_pts ≥1) on contracts expiring within 30 days, ensuring the edge is tradeable and near enough to…
- `—` / —: Refinement of BTC PM IV expansion reversion: replace absolute IV thresholds with extreme compression percentiles – PM IV in bottom 10% of 30-day range and 90-day options IV in top 10% of its range, signaling a rare cross-market IV crush th…
- `—` / —: Refinement of weekend CBRS funding reversion: only go long when CBRS funding is < -10% ON A WEEKEND AND the funding has already begun to rise (change_pct_24h > 0), confirming that the reversion process is underway.
- `—` / —: Refinement of weekend AAPL funding reversion: same pattern – AAPL funding < -10% on a weekend with funding already rising (change_pct_24h > 0), signalling the start of the normalization that should lift spot.
- `—` / —: Refinement of BTC listed-IV momentum confirmation: tighten momentum thresholds. Require spot gain >1.5% in 24h, spot above 0.5% vs 24h SMA, within 3% of 7d high, and 30d IV change >1% (double the original 0.75% and 0% thresholds) to filter…
- `FIND-0020` / THEME-0003: Short BTC by selling YES on upside one-touch contracts when smart-money stance is short YES (smart_flow_stance <= -1) and there is at least 1pt of sell-yes edge, following the informed-flow asymmetry FIND (smart selling YES on highs indica…
- `FIND-0022` / THEME-0001: Short OIL by selling YES on upside one-touch NO contracts when sell-yes edge is between 1 and 3 points and the contract expires within 3 days, capturing a tight edge on near-expiry contracts (FIND-0022: 91% WR in discovery).
- `FIND-0021` / THEME-0004: Short BTC by selling YES on upside one-touch NO contracts when PM IV exceeds options IV by ≥10 vol points (pm_iv_minus_opt_iv_pts >=10), following the rich PM IV fade cluster (FIND-0021).
- `FIND-0036` / THEME-0001: Short GOLD by selling YES on upside one-touch NO contracts when they expire within 30 days, have a visible sell-yes edge, and the direction is above strike, narrowing the profitable gold heatmap (FIND-0036).

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-07-31T07:08:26Z
- Findings export: 2026-07-31T07:07:12Z
- Themes export: 2026-07-31T07:07:16Z
- LLM advice: 2026-07-30T07:08:44.779Z
