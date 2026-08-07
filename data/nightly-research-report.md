# Nightly Research Report

_Generated 2026-08-07T07:09:23Z_

## 1. Summary
- FIND records: 57 total (open 15, strengthened 26, weakened 0, negative 3)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #4 **FIND-0043** opp=0.9877 conf=0.5851 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0030** opp=0.986 conf=0.4443 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #8 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.965 conf=0.3945 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 34 findings, avg opp 0.6518
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3033
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H‑534: Add a bearish trend filter to the gold one‑touch NO edge short. Only sell‑YES when the underlying‑cap edge is large AND gold spot is below its 24h SMA, confirming that the edge aligns with a weak trend. This should pre…
- `—` / —: Refinement of H‑539: Restrict CBRS weekend funding reversion to true weekends and require extreme funding (<‑20% annualized). This addresses the failure where non‑weekend and mildly negative funding triggers did not normalize.
- `—` / —: Refinement of H‑537: Apply weekend‑only filter and deeper funding‑extremity threshold (<‑20%) to AAPL funding reversion. Previous losses came from weekday triggers where funding did not revert quickly.
- `—` / —: Refinement of H‑535: Limit MU weekend funding reversion to weekends and raise the funding threshold to <‑20%. Losses occurred when funding was only moderately negative on weekdays and failed to mean‑revert.
- `FIND-0020` / THEME-0003: Fade dumb money highs: sell‑YES on upside one‑touch NO contracts when smart wallets are net short (stance ≤ -1) and a sell‑YES edge ≥2 pts exists. The FIND‑0020 study shows smart‑flow disagreement predicts reversion.
- `FIND-0053` / THEME-0005: GOLD extreme low put/call ratio short signal. When the 7‑day percentile of gold_gld_pc_ratio falls to the bottom 10%, the contrarian short hypothesis wins 100% in the shadow cluster (FIND‑0053).
- `FIND-0021` / THEME-0004: Rich PM IV touch NO fade: when Polymarket IV exceeds the listed‑option IV by ≥10 vol points on an upside one‑touch contract with a positive sell‑YES edge, sell‑YES to short the underlying. The FIND‑0021 cluster shows 90% win rate and +0.98…
- `FIND-0043` / THEME-0001: BTC‑specific one‑touch NO edge with moderate strength: sell‑YES on BTC upside touch contracts when the sell‑YES edge is between 3 and 8 pts. The FIND‑0043 cluster returned 75% win rate, +1.97 total PnL in shadow.
- `FIND-0030` / THEME-0001: Broad one‑touch NO edge across all assets with above‑strike direction and edge 3‑8 pts. The FIND‑0030 shadow has 55% win rate but positive sum PnL after incorporating tight spread constraints (default).

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-07T07:09:23Z
- Findings export: 2026-08-07T07:07:52Z
- Themes export: 2026-08-07T07:07:57Z
- LLM advice: 2026-08-07T07:07:52.395Z
