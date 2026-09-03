# Nightly Research Report

_Generated 2026-09-03T07:13:22Z_

## 1. Summary
- FIND records: 71 total (open 10, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=0.9999 conf=0.6122 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=0.9999 conf=0.6122 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=0.9999 conf=0.6052 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #4 **FIND-0070** opp=0.9998 conf=0.7032 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #5 **FIND-0069** opp=0.9998 conf=0.6565 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0066** opp=0.9998 conf=0.5587 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #7 **FIND-0068** opp=0.9997 conf=0.538 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9961 conf=0.681 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0054** opp=0.9434 conf=0.6482 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6252
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9998
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-539: instead of any CBRS funding reading below -10%, require true weekend timing, bottom-decile funding over the last 7 days, still deeply negative, and a 24h turn higher. This targets actual capitulation that has started t…
- `—` / —: Refinement of H-537: AAPL funding below -10% on any day was not predictive. Require weekend observation, 7-day funding percentile in the bottom decile, still below -20, and funding already turning higher. This changes the mechanism from a…
- `—` / —: Refinement of H-535: the single MU funding < -10 condition captured many non-events. Require weekend timing, bottom-decile 7-day funding percentile, still below -20, and a 24h turn higher before entering long.
- `—` / —: Refinement of H-538: the single COIN funding < -10 condition was weak. Require weekend timing, bottom-decile 7-day funding percentile, still below -20, and a 24h turn higher. This aims to buy actual weekend capitulation that is already rev…
- `—` / —: Refinement of H-534: re-author the gold one-touch cap-edge signal as a contract premium fade rather than a spot-decline prediction. Require above-strike contracts, moderate 3-8pt underlying-cap edge, near-dated expiry, and tight spread; se…

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
- Opportunities export: 2026-09-03T07:13:22Z
- Findings export: 2026-09-03T07:10:56Z
- Themes export: 2026-09-03T07:11:04Z
- LLM advice: 2026-09-03T07:10:55.823Z
