# Nightly Research Report

_Generated 2026-08-08T07:08:59Z_

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
- **THEME-0001** (heatmap_one_touch): 34 findings, avg opp 0.6496
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3033
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Informed‑flow fade: when smart wallets are net short YES (smart_flow_stance ≤ -1) on above‑strike one‑touch contracts with a positive sell‑YES edge, short the asset’s spot. The smart‑money selling on dips and high‑side YES is a reliable co…
- `FIND-0053` / THEME-0005: GOLD put/call extreme low short: when GOLD’s GLD put/call ratio falls into the bottom 10% of its 7‑day range (indicative of excessive call buying), short GOLD despite the positive trend. Previous positive‑trend filters incorrectly blocked…
- `FIND-0021` / THEME-0004: PM‑IV rich NO fade: when Polymarket IV exceeds listed‑option IV by ≥10 vol points on an above‑strike one‑touch NO contract with a positive sell‑YES edge, short the asset. The rich premium on NO contracts points to overpriced downside prote…
- `FIND-0043` / THEME-0001: BTC one‑touch NO edge with moderate strength: when a BTC upside one‑touch NO contract offers a sell‑YES edge between 3 and 8 percentage points and the contract expires within 30 days, short BTC. This captures the cluster where the edge is…
- `—` / —: Refinement of H‑534: Only take the gold one‑touch NO edge when the underlying spot is in a downtrend (below its 7‑day SMA) to avoid fading strong rallies. The cap edge alone is insufficient; a bearish regime context is needed for the mispr…
- `—` / —: Refinement of H‑539: Restrict CBRS funding reversion to true weekend days (Saturday and Sunday) and require funding deeper than ‑10% to isolate overshoots that rapidly normalise. This aligns with the strong weekend‑only performance seen in…
- `—` / —: Refinement of H‑537: Apply the same weekend‑only filter and a deeper threshold (<‑15%) to AAPL funding reversion. The evidence shows AAPL funding snap‑backs are concentrated on weekends; weekday signals are false reversals that continue th…
- `—` / —: Refinement of H‑001: Shift from absolute PM‑IV thresholds to regime‑relative compression (PM IV below its 20th percentile of 30‑day range) and add an oversold filter (spot below 7‑day SMA) to time the expansion move. This captures genuine…
- `—` / —: Refinement of the cross‑asset IV compression long: add a Bitcoin funding extreme short condition (funding < ‑50%) to identify crowded shorts and require HYPE OI growth >3% to confirm genuine risk‑on capital inflow. This raises the bar for…

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-08T07:08:59Z
- Findings export: 2026-08-08T07:07:28Z
- Themes export: 2026-08-08T07:07:31Z
- LLM advice: 2026-08-08T07:07:27.717Z
