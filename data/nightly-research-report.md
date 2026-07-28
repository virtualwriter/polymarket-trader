# Nightly Research Report

_Generated 2026-07-28T07:08:07Z_

## 1. Summary
- FIND records: 45 total (open 18, strengthened 12, weakened 0, negative 1)
- Research themes: 4
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0035** opp=0.9998 conf=0.6955 | `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…` | theme weekend_hl_funding
- #3 **FIND-0022** opp=0.9906 conf=0.6523 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #4 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #5 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #7 **FIND-0030** opp=0.9674 conf=0.4731 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #8 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #9 **FIND-0043** opp=0.9256 conf=0.3983 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0023** opp=0.7962 conf=0.5405 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,d<30|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 24 findings, avg opp 0.6569
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Fade dumb-money highs: when the dumb-wallet share of YES volume on upside one-touch NO contracts exceeds 0.15 while smart-wallet share on dip-YES contracts remains below 0.05, sell the YES side of that upside NO contract as a directional s…
- `FIND-0022` / THEME-0001: OIL one-touch NO edge with moderate edge strength and near-expiry refinement: when the sell-YES edge on an OIL upside one-touch NO contract is between 1 and 3 points and the contract expires within 30 days, short OIL by selling YES on that…
- `FIND-0021` / THEME-0004: Rich PM IV NO fade on upside touch: when PM IV exceeds the 30-day options IV by at least 10 percentage points on an asset, and an upside one-touch NO contract exists with a positive sell-YES edge, short the asset by selling YES on that con…
- `FIND-0024` / THEME-0004: Rich PM IV NO fade on upside touch, near-expiry filter: extend the PM IV rich signal (PM IV > opt_iv_30d + 10pp) to contracts expiring within 30 days, selling YES on upside one-touch NO contracts.
- `FIND-0036` / THEME-0001: GOLD one-touch NO edge with near expiry: on GOLD upside one-touch NO contracts expiring within 30 days, when the sell-YES edge is positive (regardless of size), short GOLD by selling YES.
- `FIND-0025` / THEME-0004: Rich PM IV with edge 3–8 points: when PM IV exceeds options IV by >10pp and the sell-YES edge on an upside one-touch NO contract is between 3 and 8 points, short the asset by selling YES.
- `FIND-0030` / THEME-0001: Broad one-touch NO edge on all assets with above-direction and edge 3–8 points: for any asset, when the sell-YES edge on an upside one-touch NO contract is between 3 and 8 points, short the asset by selling YES.
- `FIND-0026` / THEME-0001: No-bias gap long signal on downside touch: when the no-bias adjusted gap is positive (sell edge) on a downside one-touch NO contract expiring within 30 days, go long the underlying asset (spot or perp), as the market is overestimating the…
- `FIND-0001` / THEME-0001: GOLD short on extreme negative funding with no-bias gap: when gold funding is deeply negative (< -50% annualized) and the no-bias adjusted gap on a GOLD upside one-touch NO contract is positive, go short GOLD by selling YES on that contrac…

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-07-28T07:08:06Z
- Findings export: 2026-07-28T07:07:13Z
- Themes export: 2026-07-28T07:07:17Z
- LLM advice: 2026-07-28T07:07:13.277Z
