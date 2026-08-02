# Nightly Research Report

_Generated 2026-08-02T07:09:02Z_

## 1. Summary
- FIND records: 50 total (open 14, strengthened 20, weakened 0, negative 3)
- Research themes: 4
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0030** opp=0.9925 conf=0.5109 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #3 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #4 **FIND-0043** opp=0.9868 conf=0.567 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #7 **FIND-0022** opp=0.9698 conf=0.4945 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #8 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #9 **FIND-0047** opp=0.8964 conf=0.3926 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0046** opp=0.8558 conf=0.3604 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 29 findings, avg opp 0.6818
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `FIND-0021` / THEME-0004: Fade rich PM IV on upside one-touch NO contracts: sell YES when PM IV exceeds options IV by ≥10 vol pts across assets.
- `FIND-0036` / THEME-0001: GOLD one-touch NO edge near expiry: when GOLD upside one-touch NO contracts have sell-YES edge 3‑8 pts and expire within 30 days, sell YES.
- `FIND-0022` / THEME-0001: OIL one-touch NO edge with moderate edge: sell YES on OIL upside one-touch NO contracts when sell-yes edge is between 1 and 3 pts.
- `FIND-0030` / THEME-0001: Broad one-touch NO edge with moderate strength: for any asset, sell YES when sell-yes edge is 3‑8 pts on upside one-touch NO contracts.
- `—` / —: AMZN funding convergence entry on extreme discount: enter long AMZN stock when funding is deeply negative and basis wide, expecting normalization.
- `—` / —: GOLD one-touch heatmap with momentum filter: sell YES when underlying-cap edge ≥5 pts, spot is below 24h SMA, and expiry ≤30 days.
- `—` / —: BTC PM IV compression reversion via z-score: replace absolute IV thresholds with extreme compression (z-score ≤ -2) while options IV remains elevated.
- `—` / —: CBRS weekend funding reversion: only go long CBRS perp when funding is deeply negative (< -20%) on a Saturday or Sunday.
- `—` / —: AAPL weekend funding reversion: only go long AAPL perp when funding is deeply negative (< -20%) on a Saturday or Sunday.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-02T07:09:02Z
- Findings export: 2026-08-02T07:07:44Z
- Themes export: 2026-08-02T07:07:48Z
- LLM advice: 2026-08-02T07:07:43.980Z
