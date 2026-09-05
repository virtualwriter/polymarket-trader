# Nightly Research Report

_Generated 2026-09-05T07:14:51Z_

## 1. Summary
- FIND records: 71 total (open 10, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=0.9999 conf=0.6154 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=0.9999 conf=0.6154 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=0.9999 conf=0.6052 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #4 **FIND-0070** opp=0.9998 conf=0.7032 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #5 **FIND-0069** opp=0.9998 conf=0.6565 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0066** opp=0.9998 conf=0.5662 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #7 **FIND-0068** opp=0.9997 conf=0.5422 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9961 conf=0.681 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0054** opp=0.9434 conf=0.6482 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6256
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9998
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0070` / THEME-0007: Panel NO edge sibling: sub-point sell-YES model edge, mid-priced YES ask, and very near expiry (<=14 days), targeting the strongest YES-premium decay window.
- `FIND-0065` / THEME-0007: Panel NO edge sibling: sub-point sell-YES model edge and mid-priced YES ask, with a high order-book liquidity guard to avoid thin Polymarket quotes.
- `FIND-0069` / THEME-0007: Panel NO edge sibling: mid-priced YES ask and near expiry, tightened further by a sub-1c YES spread quality guard.
- `FIND-0068` / THEME-0007: Panel NO edge sibling on above-strike one-touch contracts: mid-priced YES ask plus sub-point sell-YES model edge, localizing the NO edge to touch-high contracts.
- `FIND-0067` / THEME-0007: Panel NO edge sibling: tight-spread mid-priced YES ask with an additional minimum order-book liquidity guard, sharpening the quote-quality cut from FIND-0067.
- `—` / —: Refinement of H-534: re-author the GOLD one-touch cap-edge as a moderate 3-8pt above-strike contract premium fade with near expiry and tight spread, explicitly avoiding the spot-decline formulation.
- `—` / —: Refinement of H-539: replace any raw CBRS funding reading below -10% with a two-part mechanism — funding in an extreme 30d z-score tail and already inflecting higher over the prior 24h.
- `—` / —: Refinement of H-537: require AAPL funding to be in an extreme 30d z-score tail and already rising off the extreme, rather than merely below -10%.
- `—` / —: Refinement of H-535: require MU funding to be in an extreme 30d z-score tail and already inflecting higher, rather than entering on the first sub -10% print.

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
- Opportunities export: 2026-09-05T07:14:51Z
- Findings export: 2026-09-05T07:12:21Z
- Themes export: 2026-09-05T07:12:30Z
- LLM advice: 2026-09-05T07:12:21.582Z
