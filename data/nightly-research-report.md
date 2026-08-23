# Nightly Research Report

_Generated 2026-08-23T07:11:42Z_

## 1. Summary
- FIND records: 64 total (open 11, strengthened 32, weakened 0, negative 8)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0043** opp=0.9926 conf=0.6711 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #3 **FIND-0055** opp=0.9611 conf=0.4833 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0054** opp=0.9489 conf=0.6664 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0047** opp=0.9101 conf=0.4721 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #7 **FIND-0030** opp=0.8675 conf=0.571 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #8 **FIND-0048** opp=0.8598 conf=0.5452 | `ONE_TOUCH_HIGH_EDGE_NO|ETH|strat:dir=above,s-1|no` | theme heatmap_one_touch
- #9 **FIND-0046** opp=0.8564 conf=0.3926 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:dir=above,s?|no` | theme heatmap_one_touch
- #10 **FIND-0018** opp=0.8554 conf=0.4338 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|heatmap|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 41 findings, avg opp 0.6378
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3986
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Fade dumb-money high-YES flow: on above-strike one-touch contracts, when smart wallets are net short YES and the contract offers a positive sell-YES edge, sell the rich YES side because high-barrier flow is dumb-money chasing premium, not…
- `FIND-0053` / THEME-0005: When GOLD's GLD put/call ratio is in the bottom 15% of its 7-day range while GOLD spot remains above its 24h SMA, extreme call-buying/put-selling marks an exhaustion high rather than durable upside demand. Short the spot/perp high.
- `FIND-0043` / THEME-0001: On BTC above-strike one-touch contracts, sell YES when at least one scoped contract offers a 3-8 point sell-YES edge. This is a contract premium fade, not a spot-move call: overpriced YES premium decays as the high barrier stays unchalleng…
- `FIND-0025` / THEME-0004: Sell YES on PM-IV-rich above-strike one-touch contracts when PM IV is at least 10 vol points above listed options IV and a 3-8 point sell-YES edge exists. The richness is a PM premium error, not compensation for strong spot drift.
- `FIND-0030` / THEME-0001: Broad one-touch premium fade: on any above-strike one-touch contract with a 3-8 point sell-YES edge, tight spread, and liquidity, sell YES. This is the broadest version of the above-strike edge family and must be graded on contract premium…
- `—` / —: Refinement of H-108: replace HYPE risk-on confirmation, which fires late after the BTC move, with a filter that BTC perp funding is not already in the top quintile of its 7-day range. This avoids chasing late-stage overextended momentum.
- `—` / —: Refinement of H-170: instead of longing momentum when options IV rises, lean short when BTC is only above its 24h SMA but more than 4% below its 7d high with options IV still rising. The IV bid is hedging/distribution, not breakout confirm…
- `—` / —: Refinement of H-539: require CBRS funding below -10% on true weekend days AND in the bottom 10% of its 7-day range. The original failed because standalone < -10% included stale/default 5.5 and weekday noise; this isolates genuine weekend f…
- `—` / —: Refinement of H-535: restrict to weekend days and extreme current funding vs its own 7-day range, not just below -10%. The original fired on stale 5.5 readings and weekday noise; this isolates true weekend funding dislocations.
- `—` / —: Refinement of H-538: require COIN funding below -20% on true weekend days and in the bottom 10% of its 7-day range. The original's < -10% threshold captured default 5.5 and non-weekend readings that never normalized.

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
- Opportunities export: 2026-08-23T07:11:41Z
- Findings export: 2026-08-23T07:09:51Z
- Themes export: 2026-08-23T07:09:57Z
- LLM advice: 2026-08-23T07:09:50.930Z
