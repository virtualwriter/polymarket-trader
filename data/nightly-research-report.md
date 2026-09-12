# Nightly Research Report

_Generated 2026-09-12T07:15:50Z_

## 1. Summary
- FIND records: 73 total (open 10, strengthened 42, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0070** opp=0.9998 conf=0.657 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #3 **FIND-0068** opp=0.9998 conf=0.5116 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #4 **FIND-0066** opp=0.9997 conf=0.5627 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #5 **FIND-0065** opp=0.9995 conf=0.6021 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #6 **FIND-0069** opp=0.9987 conf=0.6421 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #7 **FIND-0072** opp=0.9982 conf=0.6918 | `PANEL_NO_7D|ALL|strat:d<30|no` | theme outcome_panel
- #8 **FIND-0073** opp=0.9978 conf=0.6632 | `PANEL_NO_7D|ALL|strat:e<1,d<30|no` | theme outcome_panel
- #9 **FIND-0067** opp=0.9978 conf=0.5925 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #10 **FIND-0043** opp=0.9965 conf=0.6671 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6655
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 8 findings, avg opp 0.9989
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-539: the failing trigger was a static CBRS funding reading below -10% on any day. This version requires a true weekend, a recent relative funding extreme, and confirmation that funding has already begun turning higher.
- `—` / —: Refinement of H-537: the failing trigger was a static AAPL funding reading below -10% on any weekday. This version requires weekend scope, a relative extreme, and a current 24h turn higher.
- `—` / —: Refinement of H-535: the failing trigger was a static MU funding reading below -10% without weekend or turning confirmation. This version requires weekend scope, a relative extreme, and a 24h turn higher.
- `—` / —: Refinement of H-532: the failed variant predicted a GOLD spot decline when its actual wins were NO contract price appreciation. This version re-authors the signal as an above-strike GOLD one-touch NO premium fade.
- `—` / —: Refinement of H-534: the failed variant predicted a GOLD spot decline when the trade was actually a rich-YES one-touch NO premium fade. This version restricts to above-strike contracts and re-authors the outcome as contract P&L.
- `FIND-0070` / THEME-0007: Panel NO edge sharpest cut with a liquidity guard: sub-point sell-YES model edge, mid-priced YES ask, near expiry, and at least one liquid market.
- `FIND-0068` / THEME-0007: Panel NO edge above-strike variant with tight spread: above-strike one-touch contracts, mid-priced YES ask, and a tight bid-ask spread.
- `FIND-0066` / THEME-0007: Panel NO edge broad mid-price variant with liquidity guard: mid-priced YES contracts with at least one liquid market.
- `FIND-0069` / THEME-0007: Panel NO edge near-dated mid-price variant with a tighter spread guard than the parent finding.

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
- Opportunities export: 2026-09-12T07:15:50Z
- Findings export: 2026-09-12T07:13:02Z
- Themes export: 2026-09-12T07:13:12Z
- LLM advice: 2026-09-12T07:09:57.787Z
