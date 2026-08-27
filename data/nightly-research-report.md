# Nightly Research Report

_Generated 2026-08-27T07:15:29Z_

## 1. Summary
- FIND records: 70 total (open 9, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=1.0 conf=0.5852 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=1.0 conf=0.5852 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=0.9999 conf=0.5798 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #4 **FIND-0066** opp=0.9999 conf=0.5365 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #5 **FIND-0070** opp=0.9998 conf=0.6878 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0069** opp=0.9998 conf=0.6365 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #7 **FIND-0068** opp=0.9997 conf=0.5012 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9975 conf=0.673 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9889 conf=0.5109 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 41 findings, avg opp 0.6309
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9999
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-534: treat GOLD above-strike one-touch NO as a contract premium fade, not a spot decline call. Require moderate underlying-cap edge, above-strike contracts, mid-priced YES ask, and near-dated expiry so the contract has room…
- `—` / —: Refinement of H-539: require true weekend timing, a deeper CBRS funding low, and a rising 24h funding change to avoid flat or worsening funding readings.
- `—` / —: Refinement of H-108: remove the HYPE confirmation that was echoing late-stage BTC risk-on. Instead require BTC trend strength plus a non-extended PM IV regime and non-extreme funding.
- `FIND-0020` / THEME-0003: Informed-flow asymmetry faded on near-dated mid-priced above-strike BTC one-touch contracts: when tracked smart wallets are net short YES, the dumb-money YES premium is overpriced and should decay.
- `FIND-0043` / THEME-0001: BTC-specific one-touch NO premium fade with moderate sell-YES edge, above-strike contracts, tight spread, and meaningful liquidity to avoid stale or wide quotes.

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
- Opportunities export: 2026-08-27T07:15:29Z
- Findings export: 2026-08-27T07:13:20Z
- Themes export: 2026-08-27T07:13:28Z
- LLM advice: 2026-08-27T07:13:20.494Z
