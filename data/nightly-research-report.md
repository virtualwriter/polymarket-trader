# Nightly Research Report

_Generated 2026-08-29T07:12:56Z_

## 1. Summary
- FIND records: 70 total (open 9, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=1.0 conf=0.5888 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=1.0 conf=0.5888 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=0.9999 conf=0.5831 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #4 **FIND-0066** opp=0.9999 conf=0.5389 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #5 **FIND-0070** opp=0.9998 conf=0.6931 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0069** opp=0.9998 conf=0.6407 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #7 **FIND-0068** opp=0.9997 conf=0.5012 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9958 conf=0.6748 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 41 findings, avg opp 0.6146
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9999
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0065` / THEME-0007: Outcome-panel NO edge: buy NO/sell YES across all assets when the best sell-YES model edge is below 1 point and the lowest YES ask is in the mid-price 35-65c band.
- `FIND-0070` / THEME-0007: Sharpest outcome-panel NO cut: buy NO/sell YES across all assets when sell-YES edge is below 1 point, the lowest YES ask is 35-65c, and the nearest contract expires within 30 days.
- `FIND-0067` / THEME-0007: Outcome-panel NO edge with tight-spread filter: buy NO/sell YES across all assets when the lowest YES ask is 35-65c and the tightest YES spread is below 2c.
- `FIND-0069` / THEME-0007: Outcome-panel NO edge with near-dated filter: buy NO/sell YES across all assets when the lowest YES ask is 35-65c and the nearest contract expires within 30 days.
- `FIND-0068` / THEME-0007: Outcome-panel NO edge on above-strike contracts: buy NO/sell YES when one-touch direction is above-strike and the lowest YES ask is in the 35-65c mid-price band.
- `—` / —: Refinement of H-539: replace any-day static CBRS funding < -10 with a true-weekend lower-tail trigger. The original failed on pinned +5.5% and already-normalized funding rows; this enters only when weekend funding is both deeply negative a…
- `—` / —: Refinement of H-108: drop HYPE risk-on confirmation and replace it with BTC-owned PM IV compression. HYPE is a coincident BTC beta echo, not an independent signal; compressed BTC PM IV gives a cleaner volatility-expansion setup for continu…
- `—` / —: Refinement of H-537: restrict AAPL funding reversion to true weekends and require a lower-tail percentile. The original failed on stale funding rows after normalization had already occurred; this enters only when weekend funding is deeply…
- `—` / —: Refinement of H-534: re-author the gold one-touch cap-edge signal as a contract premium fade instead of a spot-decline prediction. The original burned 7 unscorable tests because the engine grades contract P&L, not GOLD spot movement; keep…
- `—` / —: Refinement of H-170: convert the rising-listed-IV momentum setup from a directional long thesis to a neutral absolute-move thesis. The family failed because rising IV did not confirm further BTC gains; the same conditions did, however, oft…

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
- Opportunities export: 2026-08-29T07:12:56Z
- Findings export: 2026-08-29T07:10:41Z
- Themes export: 2026-08-29T07:10:47Z
- LLM advice: 2026-08-29T07:10:40.698Z
