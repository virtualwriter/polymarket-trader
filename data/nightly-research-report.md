# Nightly Research Report

_Generated 2026-08-04T07:11:02Z_

## 1. Summary
- FIND records: 53 total (open 15, strengthened 22, weakened 0, negative 3)
- Research themes: 5
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0030** opp=0.9938 conf=0.5094 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #5 **FIND-0043** opp=0.99 conf=0.5869 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #8 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #9 **FIND-0022** opp=0.9316 conf=0.3934 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #10 **FIND-0047** opp=0.8968 conf=0.4255 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 31 findings, avg opp 0.6579
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Smart‑money fade: when tracked smart wallets are net short YES (smart_flow_stance ≤ -1) on above‑strike one‑touch contracts, the smart flow expects spot weakness. Tests the dip‑YES smart / high‑YES dumb asymmetry from FIND-0020.
- `FIND-0030` / THEME-0001: Broad one‑touch NO edge with moderate mispricing: for any asset with upside touch contracts, enter short (sell YES) when the sell‑YES edge is between 3 and 8 probability points, per FIND-0030 cluster.
- `FIND-0021` / THEME-0004: Rich PM IV NO fade: when Polymarket implied volatility exceeds listed‑option IV by ≥10 vol points on upside touch contracts, sell YES to fade the fear premium, per FIND-0021 cluster.
- `FIND-0043` / THEME-0001: BTC‑only one‑touch NO edge with moderate strength: sell YES on BTC upside touch contracts when edge between 3‑8 pts, per FIND-0043’s 76% win cluster.
- `—` / —: Refinement of H‑005: require AMZN funding rate to have already started declining (24h change < 0) while basis remains near zero. This ensures the convergence process is underway, not merely assumed.
- `FIND-0036` / THEME-0001: Refinement of H‑534: narrow the gold one‑touch edge to moderate levels (3‑8 pts) and require expiry within 30 days, per FIND-0036’s 75% win cluster on near‑expiry gold NO contracts.
- `—` / —: Refinement of H‑539: capture only extreme CBRS funding overshoots — bottom 5th percentile of the last 7 days and below -20% — with evidence of reversal (positive 24h change). Avoids mid‑range noise.
- `—` / —: Refinement of H‑537: apply the same extreme‑overshoot logic to AAPL — bottom 5th percentile funding and below -20% with a positive 24h change to confirm reversal.
- `—` / —: Refinement of H‑001: convert the IV‑expansion thesis to a bearish directional play — only activate when BTC is already near its 7‑day high, indicating the compression precedes a reversal down rather than a random jump.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-04T07:11:02Z
- Findings export: 2026-08-04T07:09:36Z
- Themes export: 2026-08-04T07:09:40Z
- LLM advice: 2026-08-04T07:09:36.218Z
