# Nightly Research Report

_Generated 2026-09-11T07:19:12Z_

## 1. Summary
- FIND records: 73 total (open 11, strengthened 41, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0070** opp=0.9998 conf=0.657 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #3 **FIND-0068** opp=0.9998 conf=0.5116 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #4 **FIND-0066** opp=0.9996 conf=0.5627 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #5 **FIND-0065** opp=0.9994 conf=0.6021 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #6 **FIND-0072** opp=0.9985 conf=0.6919 | `PANEL_NO_7D|ALL|strat:d<30|no` | theme outcome_panel
- #7 **FIND-0069** opp=0.9983 conf=0.6421 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #8 **FIND-0073** opp=0.9978 conf=0.6632 | `PANEL_NO_7D|ALL|strat:e<1,d<30|no` | theme outcome_panel
- #9 **FIND-0043** opp=0.9974 conf=0.6982 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0067** opp=0.9966 conf=0.5925 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6761
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 8 findings, avg opp 0.9987
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0072` / THEME-0007: Panel NO edge, broad near-dated with tight spread and liquidity guard: buy NO/sell YES across all assets when the nearest contract expires within 30 days, at least one scoped contract has YES spread <= 2c, and liquidity >= 10k USD.
- `FIND-0065` / THEME-0007: Panel NO edge, sub-point model edge in the mid-price band with a tight spread guard.
- `FIND-0068` / THEME-0007: Panel NO edge on above-strike one-touch contracts, mid-price, near-dated, and tight-spread.
- `FIND-0043` / THEME-0001: BTC-specific one-touch NO edge from shadow FIND-0043, tightened to liquid tight-spread above-strike contracts with 3-8pt sell-YES edge.
- `—` / —: Refinement of H-539: replace the static CBRS funding < -10 trigger with a weekend-only regime-relative panic plus confirmation that funding has started to normalize.
- `—` / —: Refinement of H-537: replace the static AAPL funding < -10 trigger with a weekend-only regime-relative panic plus confirmation that funding has started to normalize.
- `—` / —: Refinement of H-535: replace the static MU funding < -10 trigger with a weekend-only regime-relative panic plus confirmation that funding has started to normalize.
- `—` / —: Refinement of H-534: re-author the GOLD one-touch cap-edge as a contract-premium fade instead of a spot-decline bet. Sell YES/buy NO on near-dated above-strike GOLD one-touch contracts when the max underlying-cap edge is >=10pt.
- `—` / —: Refinement of H-638: require PM IV to begin rebounding from extreme compression before betting on a volatility snapback, instead of treating z-score alone as a trigger.

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
- Opportunities export: 2026-09-11T07:19:11Z
- Findings export: 2026-09-11T07:16:27Z
- Themes export: 2026-09-11T07:16:36Z
- LLM advice: 2026-09-11T07:11:08.262Z
