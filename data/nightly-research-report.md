# Nightly Research Report

_Generated 2026-08-25T07:12:44Z_

## 1. Summary
- FIND records: 66 total (open 12, strengthened 33, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=1.0 conf=0.5741 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=1.0 conf=0.5741 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #3 **FIND-0066** opp=0.9998 conf=0.5297 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #4 **FIND-0043** opp=0.991 conf=0.651 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0055** opp=0.9611 conf=0.4833 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0054** opp=0.9323 conf=0.6121 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #8 **FIND-0047** opp=0.9057 conf=0.4574 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0048** opp=0.8626 conf=0.5287 | `ONE_TOUCH_HIGH_EDGE_NO|ETH|strat:dir=above,s-1|no` | theme heatmap_one_touch
- #10 **FIND-0046** opp=0.8564 conf=0.3926 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 41 findings, avg opp 0.6237
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0007** (outcome_panel): 2 findings, avg opp 0.9999
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0065` / THEME-0007: Outcome-panel NO edge: when any listed contract offers a sell-YES edge below 1pt and the cheapest YES ask is in the 35-65c band, buy NO / sell YES across all assets for 7 days. The panel shows the premium is systematically too high and dec…
- `FIND-0066` / THEME-0007: Outcome-panel NO edge: when the cheapest YES ask is in the 35-65c band across all assets, buy NO / sell YES for 7 days. This is the broader panel condition behind FIND-0066 and has a positive holdout.
- `—` / —: Refinement of H-539: require the CBRS funding stress to occur on a genuine weekend and be extreme relative to the recent 7d range, and require funding to already be rising off its low. This avoids the whipsaw 2.3% -> -13.4% and 5.5% pinned…
- `—` / —: Re-author the gold one-touch cap-edge signal as a contract-premium fade rather than a spot-decline call. The prior H-534 demanded GOLD spot fall >2% in 2 days, but the tradeable edge was in the NO contract price, which moved only a few cen…
- `—` / —: Refinement of H-537: restrict AAPL funding reversion to true weekend days and require the funding print to be in the bottom 15% of the recent 7d range, not merely below -10. This removes the any-day 10.4% -> 5.5% and 11.2% -> 5.5% non-stre…

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0022** (negative): `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no`
- **FIND-0024** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`
- **FIND-0036** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no`
- **FIND-0053** (negative): `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-25T07:12:43Z
- Findings export: 2026-08-25T07:10:54Z
- Themes export: 2026-08-25T07:11:01Z
- LLM advice: 2026-08-25T07:10:54.292Z
