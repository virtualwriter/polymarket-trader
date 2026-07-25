# Nightly Research Report

_Generated 2026-07-25T07:08:11Z_

## 1. Summary
- FIND records: 39 total (open 21, strengthened 3, weakened 0, negative 1)
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
- #8 **FIND-0030** opp=0.8874 conf=0.3926 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0026** opp=0.7776 conf=0.5036 | `NO_BIAS_ADJUSTED_GAP_SHADOW|ALL|strat:dir=below,d<30|no` | theme heatmap_one_touch
- #10 **FIND-0001** opp=0.7757 conf=0.348 | `NO_BIAS_ADJUSTED_GAP_SHADOW|GOLD|short-rich-tail|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 18 findings, avg opp 0.6058
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Smart-dip vs dumb-highs flow: When smart-wallet share on dip-YES flow exceeds 0.05 and dumb-wallet share on high-YES flow exceeds 0.15, expect the underlying spot to rise within 7 days as informed dip-buying dominates.
- `FIND-0022` / THEME-0001: Oil one-touch NO edge buy: When sell-YES edge on OIL upside one-touch NO contract is between 1 and 3 points, enter a short position (selling YES on the NO contract) expecting edge to close within 3 days.
- `FIND-0021` / THEME-0004: PM IV rich NO fade: When PM IV exceeds options IV by at least 10 percentage points (regime-relative) and the market environment indicates rich PM IV (pm_iv_zscore > 1.5), sell the overpriced NO contracts and short the underlying spot.
- `FIND-0024` / THEME-0004: PM IV rich NO short with near expiry: When PM IV is rich (>10% over options IV) and the contract expires within 30 days, sell NO contracts on the underlying upside touch.
- `FIND-0025` / THEME-0004: PM IV rich NO short with edge 3-8 pts: When sell-YES edge is between 3 and 8 points on rich PM IV instruments, enter short via selling NO, expecting edge decay.
- `FIND-0026` / THEME-0001: No-bias gap short with direction below: When the no-bias adjusted gap is positive (sell edge) and the strike is below spot (dir=below) with contract expiry under 30 days, enter short via selling NO.
- `FIND-0030` / THEME-0001: One-touch NO edge on ALL above strike: When sell-YES edge is positive and direction is above (touch strike above spot) with edge between 3-8 pts, enter short.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-07-25T07:08:10Z
- Findings export: 2026-07-25T07:07:26Z
- Themes export: 2026-07-25T07:07:28Z
- LLM advice: 2026-07-25T07:07:25.673Z
