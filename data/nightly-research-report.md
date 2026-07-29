# Nightly Research Report

_Generated 2026-07-29T07:08:28Z_

## 1. Summary
- FIND records: 45 total (open 14, strengthened 16, weakened 0, negative 1)
- Research themes: 4
- Top opportunity: #1 FIND-0020 opp=0.9999 conf=0.5715 (INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no)

## 2. Top opportunities
- #1 **FIND-0020** opp=0.9999 conf=0.5715 | `INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no` | theme other_informed_flow
- #2 **FIND-0035** opp=0.9998 conf=0.6955 | `WEEKEND_HL_FUNDING_REVERSION_LONG|ALL|weekend_hl_funding_shadow…` | theme weekend_hl_funding
- #3 **FIND-0022** opp=0.9936 conf=0.6772 | `ONE_TOUCH_HIGH_EDGE_NO|OIL|strat:s?,e1-3|no` | theme heatmap_one_touch
- #4 **FIND-0021** opp=0.99 conf=0.6523 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above|no` | theme other_user_pm_iv_touch_rich_no
- #5 **FIND-0024** opp=0.9803 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:dir=above,d<30|no` | theme other_user_pm_iv_touch_rich_no
- #6 **FIND-0036** opp=0.9788 conf=0.4602 | `ONE_TOUCH_HIGH_EDGE_NO|GOLD|strat:dir=above,d<30|no` | theme heatmap_one_touch
- #7 **FIND-0030** opp=0.971 conf=0.4873 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #8 **FIND-0025** opp=0.9361 conf=0.6232 | `USER_PM_IV_TOUCH_RICH_NO|ALL|strat:s?,e3-8|no` | theme other_user_pm_iv_touch_rich_no
- #9 **FIND-0043** opp=0.9338 conf=0.4417 | `ONE_TOUCH_HIGH_EDGE_NO|BTC|strat:dir=above,e3-8|no` | theme heatmap_one_touch
- #10 **FIND-0023** opp=0.8151 conf=0.554 | `ONE_TOUCH_HIGH_EDGE_NO|ALL|strat:dir=above,d<30|no` | theme heatmap_one_touch

## 3. Themes overview
- **THEME-0001** (heatmap_one_touch): 24 findings, avg opp 0.6605
- **THEME-0002** (weekend_hl_funding): 15 findings, avg opp 0.7675
- **THEME-0004** (other_user_pm_iv_touch_rich_no): 5 findings, avg opp 0.8626
- **THEME-0003** (other_informed_flow): 1 findings, avg opp 0.9999

## 4. Newly authored hypotheses
- `FIND-0020` / THEME-0003: Fade dumb money on upside one-touch NO contracts: when the share of YES volume from dumb wallets on high-strike NO contracts exceeds 0.15, short by selling YES.
- `FIND-0035` / THEME-0002: Weekend Hyperliquid funding reversion long on any asset: when hl_funding_ann is in the bottom 5th percentile of its 30-day range (extremely negative), go long the perp.
- `FIND-0022` / THEME-0001: OIL one-touch NO edge with tight edge band: when sell-YES edge on OIL upside one-touch NO contracts is between 1 and 3 percentage points, sell YES.
- `FIND-0021` / THEME-0004: Rich PM IV NO fade: when PM IV exceeds 30-day options IV by more than 10 percentage points on any asset's one-touch NO contract with sell-YES edge, sell YES.
- `FIND-0024` / THEME-0004: Rich PM IV near-expiry NO fade: narrow the IV-rich signal to contracts expiring within 30 days to capture faster mean reversion.
- `FIND-0036` / THEME-0001: GOLD one-touch NO edge near expiry: on GOLD upside one-touch NO contracts with positive sell-YES edge and expiry within 30 days, sell YES.
- `FIND-0030` / THEME-0001: Broad one-touch NO edge with moderate edge strength: for any asset, when sell-YES edge on upside one-touch NO contracts is between 3 and 8 points, sell YES.
- `FIND-0025` / THEME-0004: Rich PM IV NO fade with edge 3-8 pts: combine rich PM IV (>10% above options IV) with sell-YES edge between 3 and 8 points, short the one-touch NO.
- `FIND-0043` / THEME-0001: BTC one-touch NO edge with above direction and edge 3-8 pts: when sell-YES edge on BTC upside one-touch NO contracts is between 3 and 8 points, sell YES.
- `FIND-0023` / THEME-0001: One-touch NO edge near expiry across all assets: for any asset with upside one-touch NO contracts expiring within 30 days and positive sell-YES edge, sell YES.

## 5. Negative / suppressed findings
- **FIND-0003** (negative): `ONE_TOUCH_HIGH_EDGE_NO|GOLD|heatmap|no`

## 6. Provenance
- Scoring version: research_score_v3
- Miner model: shadow_miner_v1
- Opportunities export: 2026-07-29T07:08:28Z
- Findings export: 2026-07-29T07:07:35Z
- Themes export: 2026-07-29T07:07:38Z
- LLM advice: 2026-07-29T07:07:34.954Z
