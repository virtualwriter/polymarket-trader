# Nightly Research Report

_Generated 2026-08-11T07:09:16Z_

## 1. Summary
- FIND records: 59 total (open 14, strengthened 28, weakened 0, negative 4)
- Research themes: 6
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0053** opp=0.9986 conf=0.7473 | `PC_RATIO_EXTREME_LOW|GOLD|short_blocked_by_positive_trend|short` | theme other_pc_ratio_extreme_low
- #3 **FIND-0043** opp=0.9895 conf=0.601 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #4 **FIND-0030** opp=0.9887 conf=0.4618 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #5 **FIND-0058** opp=0.9837 conf=0.4447 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:s?,e3-8|no` | theme heatmap_one_touch
- #6 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #7 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #8 **FIND-0055** opp=0.9703 conf=0.4186 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0022** opp=0.9653 conf=0.4198 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #10 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 36 findings, avg opp 0.6664
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.2299
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Smart‑money fade: when tracked smart wallets are net short YES (smart_flow_stance ≤ -1) on upside one‑touch NO contracts and a sell‑YES edge of at least 3 points exists, enter short (sell YES) expecting spot to decline. In‑sample discovery…
- `FIND-0053` / THEME-0005: GOLD extreme low put/call ratio short: when gold’s GLD put/call ratio is in the bottom 10% of its 7‑day range (extreme call buying/exhausted puts), short spot regardless of the prevailing trend. Shadow evidence shows +$0.13 PnL on 8 resolv…
- `—` / —: Refinement of H‑534: only take the gold one‑touch NO short when spot is below the 24h SMA, plus the underlying‑cap edge ≥10 pts. This avoids fading strong uptrends where the cap edge reflects bullish momentum.
- `—` / —: Refinement of H‑539: restrict CBRS funding reversion to weekends (Sat/Sun) and require funding to be in the extreme low end of its 7‑day distribution (percentile <10). This ensures we only act on true weekend‑driven overshoots that reliabl…
- `—` / —: Refinement of H‑537: apply the same weekend‑only filter and deeper extremity condition (funding percentile <10) to AAPL funding reversion. This lifts the win rate from 50% by eliminating weekday triggers where the reversion pattern is unre…
- `—` / —: Refinement of H‑535: limit MU funding reversion to weekends and require funding to be in its 7‑day bottom decile. This captures the true overshoots that historically produced sharp reversals.
- `—` / —: Refinement of H‑108: tighten BTC momentum requirements – demand spot be within 2% of its 7‑day high and show a positive 24h change, in addition to HYPE staying above its SMA with stable OI. This ensures we only bet on sustained, strong BTC…
- `—` / —: Refinement of H‑001: replace absolute PM‑IV thresholds with a regime‑relative condition – PM IV z‑score below –1.5 on a 30‑day window, indicating extreme compression versus its own recent history. This should capture dislocations regardles…

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`
- **FIND-0004** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|MU|weekend_hl_funding_shadow|…`
- **FIND-0021** (negative): `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no`
- **FIND-0035** (negative): `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-08-11T07:09:16Z
- Findings export: 2026-08-11T07:07:36Z
- Themes export: 2026-08-11T07:07:40Z
- LLM advice: 2026-08-11T07:07:35.758Z
