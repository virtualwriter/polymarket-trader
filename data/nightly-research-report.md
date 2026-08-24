# Nightly Research Report

_Generated 2026-08-24T07:12:52Z_

## 1. Summary
- FIND records: 64 total (open 10, strengthened 33, weakened 0, negative 8)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0043** opp=0.9926 conf=0.6711 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #3 **FIND-0055** opp=0.9611 conf=0.4833 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0054** opp=0.9489 conf=0.6664 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0047** opp=0.9116 conf=0.4702 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #7 **FIND-0030** opp=0.8689 conf=0.5691 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #8 **FIND-0048** opp=0.8626 conf=0.5287 | `ONE_TOUCH_HIGH_EDGE_NO|ETH|strat:dir=above,s-1|no` | theme heatmap_one_touch
- #9 **FIND-0046** opp=0.8564 conf=0.3926 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch
- #10 **FIND-0018** opp=0.8554 conf=0.4338 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|heatmap|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 41 findings, avg opp 0.6384
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3986
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement: restrict CBRS funding reversion to true weekends and require the funding rate to be in the bottom percentile of its own 7d range, rather than using a fixed -10% threshold that fires after normalization has already occurred.
- `—` / —: Refinement: restrict AAPL funding reversion to weekends and use a regime-relative funding percentile instead of the fixed -10% threshold, avoiding the many triggers where funding was already positive or barely dislocated.
- `—` / —: Refinement: restrict MU funding reversion to true weekend hours and require funding in the bottom percentile of its 7d range. The original -10% condition fired on flat or positive funding readings and gave no normalization edge.
- `—` / —: Refinement: re-author GOLD one-touch rich-NO as a contract premium fade instead of a spot-decline prediction. Grade on selling YES / holding NO when the GOLD above-strike underlying-cap edge is at least 10pts and spreads are tight.
- `—` / —: Refinement: change the BTC/HYPE confirmation from near-high chase to pullback reset. Require BTC below its 24h SMA and at least 4% off the 7d high while HYPE remains above its 24h SMA with stable OI, so HYPE strength is relative leadership…
- `FIND-0043` / THEME-0001: Fade BTC one-touch YES premium on above-strike contracts with moderate 3-8pt sell-YES edge and tight quoted spread.
- `FIND-0054` / THEME-0001: Near-expiry refinement of the BTC one-touch NO edge: same 3-8pt moderate sell-YES edge and tight spread, but only on contracts expiring within 7 days.
- `FIND-0025` / THEME-0004: PM-IV rich one-touch NO fade: on above-strike contracts where Polymarket IV is at least 10 vol points above listed-option IV and the sell-YES edge is moderate (3-8pts), sell YES / hold NO with a tight spread gate.

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
- Opportunities export: 2026-08-24T07:12:52Z
- Findings export: 2026-08-24T07:11:15Z
- Themes export: 2026-08-24T07:11:22Z
- LLM advice: 2026-08-24T07:11:15.195Z
