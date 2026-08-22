# Nightly Research Report

_Generated 2026-08-22T07:12:02Z_

## 1. Summary
- FIND records: 62 total (open 11, strengthened 31, weakened 0, negative 7)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0043** opp=0.9926 conf=0.6711 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0055** opp=0.9611 conf=0.4833 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0054** opp=0.9489 conf=0.6664 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0047** opp=0.909 conf=0.447 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #8 **FIND-0048** opp=0.8573 conf=0.4945 | `ONE_TOUCH_HIGH_EDGE_NO|ETH|strat:dir=above,s-1|no` | theme heatmap_one_touch
- #9 **FIND-0046** opp=0.8564 conf=0.3926 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch
- #10 **FIND-0030** opp=0.8554 conf=0.5622 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 39 findings, avg opp 0.6232
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3986
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-539: Restrict CBRS long to true weekend days and require funding in an extreme negative 7d z-score tail (< -2), so the signal fires on genuine weekend funding stress rather than routine negative oscillation.
- `—` / —: Refinement of H-024: Do not fade gold P/C collapse/rich settlement EV as a standalone overbought signal. Take the short only when gold spot is already below its 24h SMA and settlement EV is rolling over, so the trade aligns with actual nea…
- `—` / —: Refinement of H-108: Preserve the BTC trend confirmation idea but require HYPE to be below the top of its 7d range and expanding OI, so HYPE is a fresh risk-on signal rather than late-stage FOMO confirmation.
- `—` / —: Refinement of H-551: Require short-dated OIL one-touch contracts, a stronger sell-YES edge, and OIL spot below the 24h SMA, so the NO premium fade is powered by expiry decay and not fighting persistent upside drift.
- `FIND-0054` / THEME-0001: BTC one-touch NO premium fade: sell YES on above-strike BTC contracts when sell-YES edge is 3-8 points, spread is tight, liquidity is large, and nearest expiry is within 14 days.
- `FIND-0020` / THEME-0003: Smart-money dip-YES asymmetry: on BTC downside one-touch contracts only, when smart flow is net long YES and the YES ask is still cheap, go long spot/perp because smart money is positioning against overpriced downside.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0022** (negative): `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no`
- **FIND-0024** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`
- **FIND-0036** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-22T07:12:01Z
- Findings export: 2026-08-22T07:10:26Z
- Themes export: 2026-08-22T07:10:32Z
- LLM advice: 2026-08-22T07:10:25.782Z
