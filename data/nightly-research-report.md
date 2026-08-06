# Nightly Research Report

_Generated 2026-08-06T07:11:31Z_

## 1. Summary
- FIND records: 56 total (open 16, strengthened 24, weakened 0, negative 3)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #4 **FIND-0043** opp=0.9867 conf=0.5678 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0030** opp=0.9858 conf=0.4345 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #8 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9619 conf=0.3685 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 33 findings, avg opp 0.6608
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3033
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-534: Instead of entering short on gold one-touch NO edge alone, add a bearish backdrop — gold spot below 7d SMA and funding negative — to confirm downside momentum. Only trigger when gold_pm_underlying_cap_edge_pts_max >= 1…
- `—` / —: Refinement of H-539: Restrict CBRS weekend funding reversion to true weekend days (Sat/Sun) and require deeper negative funding (< -20%) to capture genuine overshoots that rapidly revert.
- `—` / —: Refinement of H-537: Limit AAPL funding reversion to weekends only and raise the threshold to < -20% so that only deep overshoots are played, avoiding mild negative readings that fail to revert.
- `—` / —: Refinement of H-001: Replace absolute IV thresholds with regime-relative compression. Enter when BTC PM IV is in the bottom 20% of its 30d range while option IV remains above 49, implying extreme relative cheapness likely to drive a large…
- `FIND-0020` / THEME-0003: Fade dumb-money highs: When smart wallets are net short YES (smart_flow_stance <= -1) on upside one-touch contracts and a sell-YES edge exists, short the underlying. This exploits informed flow asymmetry where rich high-strike YES pricing…
- `FIND-0053` / THEME-0005: GOLD PC ratio extreme low short despite positive trend: When GOLD's GLD put/call ratio falls into the bottom 10% of its 7-day range (extreme call buying) while spot is above the 7-day SMA, short GOLD. The positive-trend filter keeps you ou…
- `FIND-0021` / THEME-0004: Rich PM IV fade on upside one-touch NO: When Polymarket IV exceeds listed options IV by at least 10 vol points and there is an above-strike contract with a sell-YES edge, short the underlying. This bets that rich PM IV overprices YES and t…
- `FIND-0030` / THEME-0001: Broad one-touch NO edge with moderate edge strength: For any asset with above-strike contracts, when the sell-YES edge is between 3 and 8 points, short the underlying. The moderate edge bucket avoids tiny noisy edges and overly extreme rea…
- `FIND-0043` / THEME-0001: BTC-specific one-touch NO edge with moderate strength: Narrow the one-touch NO edge signal to BTC only with sell-YES edge 3–8 points on above-strike contracts. The mining shows BTC delivered 74% win rate in this bucket, providing a high-co…

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-06T07:11:30Z
- Findings export: 2026-08-06T07:09:58Z
- Themes export: 2026-08-06T07:10:03Z
- LLM advice: 2026-08-06T07:09:58.170Z
