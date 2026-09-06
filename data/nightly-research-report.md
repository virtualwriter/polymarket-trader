# Nightly Research Report

_Generated 2026-09-06T07:13:27Z_

## 1. Summary
- FIND records: 71 total (open 10, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=1.0 conf=0.6096 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=1.0 conf=0.6096 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=1.0 conf=0.5999 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #4 **FIND-0066** opp=0.9999 conf=0.563 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #5 **FIND-0070** opp=0.9998 conf=0.7032 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0069** opp=0.9998 conf=0.6565 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #7 **FIND-0068** opp=0.9998 conf=0.5364 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9962 conf=0.6927 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0054** opp=0.946 conf=0.6782 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6247
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9999
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0065` / THEME-0007: Panel NO edge: buy NO / sell YES across all assets when the sell-YES edge is sub-point and the cheapest YES ask is mid-priced 35-65c.
- `FIND-0067` / THEME-0007: Panel NO edge, tight-spread mid-price variant: buy NO / sell YES when the cheapest YES ask is 35-65c and at least one contract has YES spread below 2c.
- `FIND-0068` / THEME-0007: Panel NO edge, above-strike variant: buy NO / sell YES when at least one above-strike one-touch contract has YES ask in the 35-65c band.
- `FIND-0069` / THEME-0007: Panel NO edge, near-dated mid-price variant: buy NO / sell YES when the cheapest YES ask is 35-65c and the nearest scoped contract expires within 30 days.
- `FIND-0070` / THEME-0007: Panel NO edge, sharpest cut: buy NO / sell YES when sell-YES edge is below 1pt, YES ask is 35-65c, and nearest expiry is under 30 days.
- `—` / —: Refinement of H-539: replace raw CBRS < -10 with relative funding distress in the bottom 15% of the 7-day range and require still-negative funding. This avoids entering on merely mild negative readings that continue decaying.
- `—` / —: Refinement of H-537: require AAPL funding to be in relative distress as well as negative, rather than using a single raw < -10 trigger.
- `—` / —: Refinement of H-535: require MU funding to be in relative distress as well as negative, rather than using a single raw < -10 trigger.
- `—` / —: Refinement of H-534: re-author the GOLD one-touch cap-edge trade as a contract premium fade, not a spot-decline bet. Require the rich upside one-touch edge with tight spread and sell YES/NO premium.
- `—` / —: Refinement of H-108: flip the HYPE-confirmed BTC continuation long into a short exhaustion signal. The original conditions near the 7d high with HYPE above its SMA are treated as late-stage risk-on overextension.

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
- Opportunities export: 2026-09-06T07:13:26Z
- Findings export: 2026-09-06T07:11:19Z
- Themes export: 2026-09-06T07:11:28Z
- LLM advice: 2026-09-06T07:11:19.303Z
