# Nightly Research Report

_Generated 2026-08-14T07:11:46Z_

## 1. Summary
- FIND records: 61 total (open 13, strengthened 31, weakened 0, negative 4)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0043** opp=0.9909 conf=0.5976 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0058** opp=0.9851 conf=0.4444 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s?,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0030** opp=0.9827 conf=0.4827 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #8 **FIND-0055** opp=0.971 conf=0.4177 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 38 findings, avg opp 0.6918
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3986
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0053` / THEME-0005: Short GOLD when GLD put/call ratio is in the bottom 10% of its 7-day range AND spot remains above its 24h SMA, matching the FIND-0053 shadow cluster where the positive-trend block was short. This is a fade of call crowding in a still-uptre…
- `FIND-0024` / THEME-0004: Sell YES on rich PM-IV upside touch contracts expiring within 30 days, when PM IV is at least 10 vol points above listed option IV and there is at least 3 points of sell-YES edge. This is the near-expiry, above-strike richness cluster from…
- `—` / —: Refinement of H-539: only go long CBRS on weekend days when CBRS funding is in the bottom 10% of its 7-day distribution. This fixes the failing trigger that also fired after funding had already normalized to +5.5% or was in a non-extreme s…
- `—` / —: Refinement of H-537: only go long AAPL on weekend days when AAPL funding is in the bottom 10% of its 7-day distribution, instead of a flat < -10% that caught post-normalization states around +5.5% and +10.4%.
- `—` / —: Refinement of H-108: replace HYPE spot/OI cross-asset confirmation with BTC PM IV compression. This tests the same trend continuation without relying on the coincident HYPE risk-on signal that failed out-of-sample.
- `—` / —: Refinement of H-170: buy BTC on a modest 24h pullback rather than after a 24h gain, while keeping the 24h SMA/7d high context and rising listed IV confirmation. This addresses the extension-chasing mechanism behind the 25% win rate.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-14T07:11:46Z
- Findings export: 2026-08-14T07:10:12Z
- Themes export: 2026-08-14T07:10:16Z
- LLM advice: 2026-08-13T07:09:21.014Z
