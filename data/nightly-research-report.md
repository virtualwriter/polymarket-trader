# Nightly Research Report

_Generated 2026-09-09T07:14:22Z_

## 1. Summary
- FIND records: 71 total (open 10, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=1.0 conf=0.5935 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=1.0 conf=0.5935 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=1.0 conf=0.5867 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0066** opp=1.0 conf=0.5567 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #4 **FIND-0070** opp=0.9999 conf=0.6689 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #5 **FIND-0069** opp=0.9999 conf=0.6385 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #7 **FIND-0068** opp=0.9999 conf=0.5084 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9962 conf=0.6927 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0054** opp=0.946 conf=0.6782 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6252
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 1.0
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-539: replace the any-day -10% CBRS funding trigger with a true-weekend relative extreme. This avoids noisy weekday readings and only fires when CBRS funding is in the tail of its own recent range.
- `—` / —: Refinement of H-537: shift AAPL funding reversion to true weekends and require a relative 30-day tail reading rather than any day below -10%.
- `—` / —: Refinement of H-534: re-author the gold one-touch cap-edge signal as a contract premium fade instead of a spot-decline call. Use a moderate 3-8pt edge on near-dated liquid above-strike contracts.
- `—` / —: Refinement of H-638: require PM IV to be both deeply compressed and already turning higher before betting on a vol snapback. This avoids entries where cheap IV stays cheap.
- `—` / —: Refinement of H-535: restrict MU funding reversion to weekends and replace the absolute -10% trigger with a relative 30-day tail reading.
- `FIND-0070` / THEME-0007: Panel-derived NO edge sibling from FIND-0070: sub-point sell-YES edge, mid-priced YES ask, near-dated and tight spread. This tests whether the strongest cut survives a tight executable market filter.
- `FIND-0065` / THEME-0007: Panel-derived NO edge sibling from FIND-0065: sub-point sell-YES edge and mid-priced YES ask with an order-book liquidity floor. If the edge survives liquid markets, it is more executable than the raw panel cut.
- `FIND-0069` / THEME-0007: Panel-derived NO edge sibling from FIND-0069: mid-priced band and near expiry restricted to above-strike one-touch contracts.
- `FIND-0067` / THEME-0007: Panel-derived NO edge sibling from FIND-0067: tight-spread mid-priced YES ask with a liquidity floor.

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
- Opportunities export: 2026-09-09T07:14:22Z
- Findings export: 2026-09-09T07:11:37Z
- Themes export: 2026-09-09T07:11:47Z
- LLM advice: 2026-09-09T07:11:36.682Z
