# Nightly Research Report

_Generated 2026-08-09T07:09:00Z_

## 1. Summary
- FIND records: 57 total (open 14, strengthened 26, weakened 0, negative 4)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0043** opp=0.9877 conf=0.5851 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0030** opp=0.986 conf=0.4443 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #7 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #8 **FIND-0055** opp=0.965 conf=0.3945 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #10 **FIND-0047** opp=0.8968 conf=0.4255 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 34 findings, avg opp 0.6496
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3033
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Fade dumb‑money highs on upside one‑touch contracts. When tracked smart wallets are net short YES (smart_flow_stance ≤ -1) on above‑strike contracts, sell YES (short) because the crowd is overpaying for upside protection.
- `FIND-0053` / THEME-0005: GOLD put/call ratio extreme low short, ignoring positive trend. When GOLD's GLD put/call ratio falls into the bottom 10% of its 7‑day range (extreme call buying), short the spot.
- `FIND-0021` / THEME-0004: Rich PM IV NO fade on upside touch. When Polymarket IV exceeds listed‑option IV by ≥ 10 vol points on any asset's above‑strike one‑touch contracts, sell YES (short).
- `FIND-0043` / THEME-0001: BTC one‑touch NO edge with moderate strength. On BTC above‑strike contracts only, sell YES when the sell‑YES edge is between 3 and 8 pts.
- `FIND-0024` / THEME-0004: Rich PM IV NO fade near expiry. Combine rich PM IV (≥10 vol pts above options) with contracts expiring within 30 days on upside touch contracts.
- `FIND-0036` / THEME-0001: GOLD one‑touch NO edge near expiry. On GOLD above‑strike contracts expiring within 30 days, sell YES when the edge is ≥ 1 pt.
- `FIND-0022` / THEME-0001: OIL one‑touch NO edge with tight edge band. When the sell‑YES edge on OIL upside one‑touch contracts is between 1 and 3 pts, sell YES (short).
- `—` / —: Refinement of H‑534: Add a bearish trend filter. Only take the gold cap‑edge short when spot is below its 24h SMA, avoiding strong uptrends where high cap‑edge reflects genuine bullish demand.
- `—` / —: Refinement of H‑539: Require funding to have already bounced off its 24h low and be in the bottom 5% of the 30d range. This avoids entries while funding is still free‑falling and only captures true reversal starts.
- `—` / —: Refinement of H‑537: Add deep extreme percentile and oversold spot filter. Only long AAPL when funding is in the bottom 5% of 30d range and the stock is below its 7d SMA, providing a reversion‑friendly context.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-09T07:08:59Z
- Findings export: 2026-08-09T07:07:29Z
- Themes export: 2026-08-09T07:07:32Z
- LLM advice: 2026-08-09T07:07:28.817Z
