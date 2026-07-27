# Nightly Research Report

_Generated 2026-07-27T07:08:38Z_

## 1. Summary
- FIND records: 42 total (open 17, strengthened 10, weakened 0, negative 1)
- Research themes: 4
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0035** opp=0.9998 conf=0.6955 | `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…` | theme weekend_hl_funding
- #3 **FIND-0022** opp=0.9906 conf=0.6523 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #4 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #5 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #7 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #8 **FIND-0030** opp=0.9306 conf=0.4552 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0026** opp=0.7776 conf=0.5036 | `NO_BIAS_ADJUSTED_GAP_SHADOW|ALL|strat:dir=below,d<30|no` | theme heatmap_one_touch
- #10 **FIND-0001** opp=0.7757 conf=0.348 | `NO_BIAS_ADJUSTED_GAP_SHADOW|GOLD|short-rich-tail|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 21 findings, avg opp 0.5457
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Fade dumb money highs: when the share of dumb-wallet YES volume on upside one-touch high contracts exceeds 15% and the smart-wallet share on dip-YES flow is above 5%, sell YES on the high one-touch NO contracts to exploit predictable dumb-…
- `FIND-0022` / THEME-0001: OIL one-touch NO edge 1-3pt: when the sell-YES edge on OIL upside one-touch NO contracts is between 1 and 3 percentage points, short OIL by selling YES with a defined exit when edge disappears.
- `FIND-0021` / THEME-0004: Rich PM IV one-touch NO: when the prediction market IV exceeds the 30d options IV by at least 10 percentage points and the one-touch strike is above the current spot price, sell YES on the one-touch NO contract, capturing the IV overpricin…
- `FIND-0024` / THEME-0004: Rich PM IV near-expiry one-touch NO: refine the rich IV signal to contracts expiring within 30 days, where time decay is strongest; when pm_iv > opt_iv_30d + 10 and days to expiry < 30, sell YES on the one-touch NO.
- `FIND-0025` / THEME-0004: Rich PM IV with edge 3-8 pts: on rich-IV NO contracts where the sell-YES edge is between 3 and 8 percentage points, the signal is especially robust; enter short when pm_iv > opt_iv_30d + 10 and sell_yes_edge_pts ∈ [3,8].
- `FIND-0026` / THEME-0001: No-bias gap short with direction below and near expiry: when the no-bias adjusted gap is positive (sell edge) and the one-touch direction is below current spot (i.e. the contract is an above-strike one-touch) AND days to expiry < 30, short…
- `FIND-0030` / THEME-0001: ONE_TOUCH_HIGH_EDGE_NO on ALL with above direction and edge 3-8 pts: for any asset, when the one-touch strike is above spot and the sell-YES edge is between 3 and 8 percentage points, enter a short via selling YES.
- `FIND-0036` / THEME-0001: GOLD one-touch NO with above direction and near expiry: narrow the GOLD one-touch heatmap signal to contracts with days to expiry < 30 and direction above, where the signal has shown promise in shadow mining (FIND-0036).

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-07-27T07:08:38Z
- Findings export: 2026-07-27T07:07:46Z
- Themes export: 2026-07-27T07:07:49Z
- LLM advice: 2026-07-26T07:07:24.788Z
