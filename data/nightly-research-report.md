# Nightly Research Report

_Generated 2026-08-12T07:09:53Z_

## 1. Summary
- FIND records: 59 total (open 13, strengthened 29, weakened 0, negative 4)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0043** opp=0.9935 conf=0.6295 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0030** opp=0.9926 conf=0.4783 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0058** opp=0.9892 conf=0.455 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s?,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0055** opp=0.9806 conf=0.4408 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #7 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #8 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #9 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 36 findings, avg opp 0.6673
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.2299
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Fade moderate underlying‑cap edge on gold one‑touch NO with near‑expiry contracts. Restrict to upside barriers, edge between 3 and 8 points, and expiry ≤30 days to avoid the model‑miscalibration problem that kills large-edge signals.
- `—` / —: CBRS funding reversion using regime‑relative extremity. Replace static < –10% with cbrs_hl_funding_ann in the bottom 5% of its trailing 7‑day distribution, capturing genuine panic overshoots instead of noisy negative periods.
- `—` / —: AAPL funding reversion using regime‑relative extremity. Switch from < –10% to aapl_hl_funding_ann_percentile_7d < 5, isolating true tail events where funding is extremely negative relative to recent history.
- `—` / —: MU funding reversion with extreme tail filter. Use mu_hl_funding_ann_percentile_7d < 5 instead of absolute < –10%, so the signal only triggers on the most oversold funding prints.
- `—` / —: BTC trend‑following without HYPE confirmation. Drop the HYPE overlap conditions; go long BTC when spot is above the 24h SMA and within 3% of the 7‑day high.
- `—` / —: BTC spot momentum without IV confirmation. Remove the rising options‑IV condition and keep pure momentum: spot above 24h SMA, near 7d high, and 24h gain >0.75%.
- `FIND-0053` / THEME-0005: Short GOLD when put/call ratio falls into the bottom 10% of its 7‑day range (extreme call buying). The finding suggests this works even when the engine’s positive‑trend block would normally prevent the short.
- `FIND-0043` / THEME-0001: BTC‑specific one‑touch NO edge: when a BTC upside one‑touch NO contract offers a sell‑YES edge of at least 3 points, short the YES side.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-12T07:09:53Z
- Findings export: 2026-08-12T07:08:07Z
- Themes export: 2026-08-12T07:08:11Z
- LLM advice: 2026-08-12T07:08:07.002Z
