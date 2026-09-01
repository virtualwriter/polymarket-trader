# Nightly Research Report

_Generated 2026-09-01T07:13:21Z_

## 1. Summary
- FIND records: 71 total (open 10, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=0.9999 conf=0.6025 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=0.9999 conf=0.6025 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=0.9999 conf=0.5929 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #4 **FIND-0070** opp=0.9998 conf=0.6982 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #5 **FIND-0069** opp=0.9998 conf=0.6448 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0066** opp=0.9998 conf=0.5475 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #7 **FIND-0068** opp=0.9997 conf=0.5203 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9958 conf=0.6748 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6239
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9998
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-534: replace the spot-decline prediction with a contract-premium fade. Enter GOLD above-strike one-touch NO through selling YES when cap edge is >=10 pts, near-dated, and tight-spread; exit as edge decays.
- `—` / —: Refinement of H-539: replace the absolute CBRS funding < -10 trigger with a relative 30-day funding extreme that is already turning up, avoiding stale or already-neutral 5.5% triggers.
- `—` / —: Refinement of H-537: use AAPL funding relative extreme plus an upward 24h turn instead of a raw sub -10 absolute level.
- `—` / —: Refinement of H-535: same relative-extreme and turning mechanism for MU funding, avoiding the stale 5.5% or only mildly negative readings.
- `FIND-0070` / THEME-0007: Panel-derived NO edge, sharpest cut plus liquidity and tight-spread guard: sub-point sell-YES edge, mid-priced YES ask, near-dated, tight spread and liquid.
- `FIND-0068` / THEME-0007: Panel-derived NO edge, above-strike variant: require touch_direction >=1, mid-priced YES ask, near-dated and tight spread.

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
- Opportunities export: 2026-09-01T07:13:20Z
- Findings export: 2026-09-01T07:10:58Z
- Themes export: 2026-09-01T07:11:06Z
- LLM advice: 2026-09-01T07:10:58.107Z
