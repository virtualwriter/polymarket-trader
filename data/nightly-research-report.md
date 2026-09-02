# Nightly Research Report

_Generated 2026-09-02T07:14:22Z_

## 1. Summary
- FIND records: 71 total (open 10, strengthened 40, weakened 0, negative 8)
- Research themes: 7
- Top opportunity: #1 FIND-0065 opp=0.9999 conf=0.609 (PANEL_NO_7D|ALL|strat:e<1,p35-65|no)

## 2. Top opportunities
- #1 **FIND-0065** opp=0.9999 conf=0.609 | `PANEL_NO_7D|ALL|strat:e<1,p35-65|no` | theme outcome_panel
- #2 **FIND-0067** opp=0.9999 conf=0.596 | `PANEL_NO_7D|ALL|strat:p35-65,sp<2|no` | theme outcome_panel
- #3 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #4 **FIND-0070** opp=0.9998 conf=0.7032 | `PANEL_NO_7D|ALL|strat:e<1,p35-65,d<30|no` | theme outcome_panel
- #5 **FIND-0069** opp=0.9998 conf=0.6488 | `PANEL_NO_7D|ALL|strat:p35-65,d<30|no` | theme outcome_panel
- #6 **FIND-0066** opp=0.9998 conf=0.552 | `PANEL_NO_7D|ALL|strat:p35-65|no` | theme outcome_panel
- #7 **FIND-0068** opp=0.9997 conf=0.5248 | `PANEL_NO_7D|ALL|strat:dir=above,p35-65|no` | theme outcome_panel
- #8 **FIND-0043** opp=0.9961 conf=0.681 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #9 **FIND-0055** opp=0.9831 conf=0.5298 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s?,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0054** opp=0.9434 conf=0.6482 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:s-1,e3-8|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 42 findings, avg opp 0.626
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0007** (outcome_panel): 6 findings, avg opp 0.9998
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0006** (funding_extreme): 1 findings, avg opp 0.3306
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999
- **THEME-0005** (other_pc_ratio_extreme_low): 1 findings, avg opp 0.9986

## 4. Newly authored hypotheses
- `—` / —: Refinement of H-534: convert the gold cap-edge trade from a spot-decline call to a contract-premium fade. Require a high underlying-cap edge on GOLD, near-dated expiry, and tight spread; take the NO/SELL YES side and let premium decay.
- `—` / —: Refinement of H-539: replace the bare absolute funding threshold with a regime-relative extreme and a turn. The original entered before the actual bottom; requiring the 7d percentile in the low tail and a positive 1-day change should only…
- `—` / —: Refinement of H-537: same mechanical change as CBRS — use AAPL funding's low 7d percentile and a positive 1-day turn instead of a single `aapl_hl_funding_ann < -10` reading.
- `—` / —: Refinement of H-535: use a z-score-based extreme and require a positive 1-day turn. The old `mu_hl_funding_ann < -10` fired too early and too frequently; this variant requires a genuine lower-tail reading already reversing.
- `—` / —: Refinement of H-108: sharpen the HYPE confirmation from near-stable OI to actually expanding OI and tighten the BTC breakout proximity. The original OI filter `> -2` admitted flat/declining OI and produced no genuine confirmation.
- `FIND-0055` / THEME-0001: Shadow FIND sibling for the one-touch NO edge on BTC: moderate 3-8pt sell-YES edge plus tight spread. The family has strong in-sample BTC premium fade but existing variants often mix assets/expiry; this isolates BTC and a practical spread…

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
- Opportunities export: 2026-09-02T07:14:21Z
- Findings export: 2026-09-02T07:12:00Z
- Themes export: 2026-09-02T07:12:09Z
- LLM advice: 2026-09-02T07:12:00.206Z
