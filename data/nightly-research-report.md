# Nightly Research Report

_Generated 2026-08-05T07:11:06Z_

## 1. Summary
- FIND records: 54 total (open 14, strengthened 24, weakened 0, negative 3)
- Research themes: 5
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #4 **FIND-0030** opp=0.989 conf=0.4557 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0043** opp=0.9856 conf=0.5491 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #8 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #9 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #10 **FIND-0047** opp=0.8968 conf=0.4255 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 32 findings, avg opp 0.6567
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Fade dumb money on upside one‑touch contracts: when tracked smart wallets are net short YES (smart_flow_stance <= -1) and the market offers at least 1pt of sell‑YES edge on an above‑strike touch contract, the non‑smart selling reflects ove…
- `FIND-0053` / THEME-0005: When GOLD's GLD put/call ratio drops into the bottom 10% of its 7‑day range (extreme call buying/put selling), the crowded bullish positioning exhausts and a corrective sell‑off follows, contrary to the usual bullish interpretation.
- `FIND-0030` / THEME-0001: Broad one‑touch NO edge with moderate strength: when the sell‑YES edge on upside one‑touch contracts is between 3 and 8 points, the market is pricing in a directional premium that will not be realized, leading to spot weakness.
- `FIND-0021` / THEME-0004: When Polymarket implied volatility exceeds the 30‑day listed options IV by ≥10 vol points on an above‑strike one‑touch contract and there is sell‑YES edge present, the prediction‑market premium signals overpricing of the upside barrier, wa…
- `—` / —: Refinement of H‑005: Instead of going long AMZN stock when funding is positive and basis near zero (expecting convergence via funding increase), we go short perp when funding is extremely high (>20%) and basis still near zero, betting that…
- `—` / —: Refinement of H‑534: Add a bearish trend filter to the gold one‑touch cap‑edge short, requiring gold spot to be below its 24‑hour SMA. This prevents shorting into a persistent uptrend, which caused all past losses.
- `—` / —: Refinement of H‑539: For CBRS, only go long when funding is deeply negative (< -10%) AND has already begun to rise over the last 24h, indicating the reversal has started rather than hoping for a turn.
- `—` / —: Refinement of H‑537: Restrict AAPL weekend funding reversion to weekend days only (Sat/Sun) and require funding to already be improving (positive 24h change). This aligns with the original weekend‑specific thesis and avoids false signals d…
- `—` / —: Refinement of H‑001: Replace absolute IV thresholds with regime‑relative compression. Enter when BTC PM IV is in the bottom 15% of its 30‑day range and the 90‑day options IV remains elevated (>50), signaling a tension between compressed ma…
- `—` / —: Refinement of H‑108: Strengthen the BTC‑specific momentum condition by requiring BTC to have already gained >2% over the past 24h, while keeping the HYPE confirmation as a supporting filter. This ensures the trade only fires when BTC itsel…

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-05T07:11:06Z
- Findings export: 2026-08-05T07:09:44Z
- Themes export: 2026-08-05T07:09:47Z
- LLM advice: 2026-08-05T07:09:43.792Z
