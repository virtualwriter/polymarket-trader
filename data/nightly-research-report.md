# Nightly Research Report

_Generated 2026-09-08T07:12:02Z_

## 1. Summary
- FIND records: 71 total (open 10, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=1.0 conf=0.6052 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=1.0 conf=0.6052 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=1.0 conf=0.5985 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0066** opp=1.0 conf=0.5623 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #4 **FIND-0070** opp=0.9999 conf=0.6797 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #5 **FIND-0069** opp=0.9999 conf=0.6433 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #7 **FIND-0068** opp=0.9998 conf=0.524 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9962 conf=0.6927 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0054** opp=0.946 conf=0.6782 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.6236
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9999
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0065` / THEME-0007: Panel NO edge: buy NO / sell YES across all assets when the best sell-YES edge is below 1 point and the cheapest YES ask is in the mid-priced band. This is the FIND-0065 panel cut and isolates sub-point model edge in 35-65c contracts.
- `FIND-0070` / THEME-0007: Panel NO edge sharpest near-dated cut: buy NO / sell YES when the best sell-YES edge is below 1 point, the cheapest YES ask is 35-65c, and the nearest expiry is under 30 days. This formalizes the strongest FIND-0070 panel bucket.
- `FIND-0067` / THEME-0007: Panel NO edge tight-spread variant: buy NO / sell YES when the cheapest YES ask is 35-65c and the tightest YES bid-ask spread is under 2c. This is the FIND-0067 panel bucket and guards against paying wide spreads on the fade.
- `FIND-0069` / THEME-0007: Panel NO edge near-dated mid-price band: buy NO / sell YES when the cheapest YES ask is 35-65c and the nearest expiry is under 30 days. This is the FIND-0069 panel bucket.
- `FIND-0043` / THEME-0001: Shadow FIND sibling from FIND-0043: BTC-specific one-touch NO premium fade on above-strike contracts with moderate 3-8pt sell-YES edge and tight spread. This narrows the broad one-touch NO family to the best BTC shadow bucket.
- `—` / —: Refinement of H-539: require CBRS funding to be a true lower-tail event, not just below -10. Adds a 48h percentile cap and a deeper absolute floor so the signal avoids noisy near-zero prints that continue lower.
- `—` / —: Refinement of H-537: require AAPL funding to be in the lower tail of its recent range, not merely below -10. Uses a 48h percentile cap plus a deeper absolute threshold to isolate genuine funding capitulation.
- `—` / —: Refinement of H-535: require MU funding to be a true lower-tail event rather than a single reading below -10. Adds a 48h percentile cap and deeper absolute floor so the signal fires only on extreme lows.
- `—` / —: Refinement of H-532: re-author the no-bias GOLD tail signal as a contract NO premium decay instead of a GOLD spot decline. Keeps the rich cap-edge trigger but adds tight-spread and liquidity guards.
- `—` / —: Refinement of H-534: re-author the GOLD one-touch high-edge as a contract premium fade on moderate 3-8pt edge, near-dated contracts, with tight spreads. The original spot-decline prediction burned 7 unscorable tests and misrepresented the…

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
- Opportunities export: 2026-09-08T07:12:01Z
- Findings export: 2026-09-08T07:09:47Z
- Themes export: 2026-09-08T07:09:56Z
- LLM advice: 2026-09-08T07:09:47.248Z
