# Nightly Research Report

_Generated 2026-08-17T07:12:15Z_

## 1. Summary
- FIND records: 61 total (open 12, strengthened 32, weakened 0, negative 4)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0043** opp=0.9909 conf=0.6467 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0030** opp=0.9874 conf=0.5375 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0058** opp=0.9838 conf=0.4862 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s?,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #8 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9528 conf=0.4524 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0054** opp=0.9488 conf=0.6471 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 38 findings, avg opp 0.7028
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3986
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0053` / THEME-0005: Short GOLD spot when GLD put/call ratio is in the bottom 10% of its 7-day range while spot is still above its 24h SMA. This captures extremely crowded call-buying versus a still-positive short-term trend, a setup that was previously blocke…
- `FIND-0043` / THEME-0001: Short BTC upside one-touch NO premium by selling YES when at least one BTC above-strike contract offers 3-8 points of sell-YES edge, with tight spread and sufficient liquidity. This isolates the high-conviction edge band and avoids wide/de…
- `FIND-0020` / THEME-0003: Sell overpriced above-strike YES touch premium on BTC when tracked smart wallets are net short YES and at least one contract offers at least 3 points of sell-YES edge. Requiring tight spread reduces quote noise.
- `FIND-0024` / THEME-0004: Sell YES on above-strike rich PM-IV one-touch contracts expiring within 30 days when PM IV is at least 10 vol points above listed option IV and spread is tight.
- `—` / —: Refinement of H-539: only enter after extreme negative CBRS funding has already started reverting over the prior 24h, and restrict to true weekends. This avoids entries that caught funding deepening further or staying pinned.
- `—` / —: Refinement of H-534: do not short rich gold upside NO edge unless gold spot is below its 24h SMA and 24h spot change is negative. This directly fixes the failure mechanism where the rich edge reflected a bullish trend rather than a fadeabl…
- `—` / —: Refinement of H-532: only short the large no-bias adjusted gap on GOLD tail NO when spot is below its 24h SMA and 24h spot change is negative. This changes the mechanism from unconditional fade to trend-aligned fade.
- `—` / —: Refinement of H-567: only take the near-expiry GOLD upside one-touch NO short when gold spot is below its 24h SMA and 24h spot change is negative. This prevents the repeated failure of shorting rich upside YES premium into strong gold up-m…
- `—` / —: Refinement of H-108: keep HYPE risk-on confirmation but also require BTC itself to have positive 24h price change and be close to the 7-day high. This avoids the failure where HYPE conditions held while BTC was already rolling over.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-17T07:12:15Z
- Findings export: 2026-08-17T07:09:40Z
- Themes export: 2026-08-17T07:09:45Z
- LLM advice: 2026-08-17T07:09:40.187Z
