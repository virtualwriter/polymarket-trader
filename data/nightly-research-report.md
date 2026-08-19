# Nightly Research Report

_Generated 2026-08-19T07:10:17Z_

## 1. Summary
- FIND records: 61 total (open 11, strengthened 31, weakened 0, negative 6)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0043** opp=0.9924 conf=0.6553 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #5 **FIND-0030** opp=0.9775 conf=0.5632 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0055** opp=0.9595 conf=0.4683 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #7 **FIND-0054** opp=0.9488 conf=0.6471 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch
- #8 **FIND-0058** opp=0.9473 conf=0.5243 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s?,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #10 **FIND-0047** opp=0.9106 conf=0.4181 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 38 findings, avg opp 0.7071
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3986
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-539: only trade the CBRS deeply negative funding reversion when it is a weekend event and funding is already turning upward, instead of a standalone threshold that fires mid-cycle.
- `—` / —: Refinement of H-108: invert the failed risk-on confirmation into a crowded-long exhaustion flag. When BTC is near its 7d high and HYPE spot is above its 24h SMA, require BTC funding to be in the top decile of its 7-day range before fading.
- `—` / —: Refinement of H-647: do not fade rich OIL above-strike YES premium on IV richness alone. Require tracked smart wallets to be net short YES, so the fade is aligned with informed flow and avoids fighting a real OIL rally.
- `FIND-0020` / THEME-0003: Fade rich above-strike one-touch YES premiums when smart wallets are net short YES and sell edge is at least 3 points; high-YES flow is likely dumb money.
- `FIND-0053` / THEME-0005: Contrarian GOLD short when GLD put/call ratio is bottom-decile of its 7-day range while spot remains above its 24h SMA; the extreme call buying marks a local reversal/pinning setup.
- `FIND-0043` / THEME-0001: BTC-specific one-touch NO fade on above-strike contracts when sell-YES edge is between 3 and 8 points and the market spread is tight.
- `FIND-0030` / THEME-0001: Broad one-touch NO edge across major assets: sell YES on above-strike one-touch contracts when at least one has a 3-8 point sell edge and tight spread.
- `FIND-0025` / THEME-0004: PM-IV rich one-touch NO fade: on above-strike contracts, when PM IV is at least 10 vol points rich to listed options and sell-YES edge is between 3 and 8 points, sell YES.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0022** (negative): `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no`
- **FIND-0024** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-19T07:10:17Z
- Findings export: 2026-08-19T07:09:30Z
- Themes export: 2026-08-19T07:09:36Z
- LLM advice: 2026-08-19T07:09:30.425Z
