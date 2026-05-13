# Agent A Round 2 Derived Checks

## Signal weights
- FUNDING_EXTREME_LONG: trades=13, wins=7, avgPnlPct=-0.499021, weight=0.649036
  - AMZN: trades=6, wins=2, avgPnlPct=-1.4673752111741232, disabled=True
  - GOLD: trades=3, wins=3, avgPnlPct=1.1706074579066554, disabled=False
  - OIL: trades=4, wins=2, avgPnlPct=-0.2987110807204145, disabled=False
- FUNDING_EXTREME_SHORT: trades=17, wins=8, avgPnlPct=-0.395117, weight=0.499925
  - AMZN: trades=2, wins=2, avgPnlPct=3.1064096951942255, disabled=False
  - HYPE: trades=4, wins=1, avgPnlPct=-2.831201633730238, disabled=False
  - OIL: trades=11, wins=5, avgPnlPct=-0.14590918705923986, disabled=False

## Closed CSV funding summary
- FUNDING_EXTREME_LONG: n=13, wins_pnl_gt_0=6, avg_pnl_pct=-0.851538, avg_market=-0.008608, avg_funding=+0.000092
  close_reasons={'target': 3, 'stop': 7, 'expiry': 3}
  - AMZN: n=7, wins=2, avg=-1.617143, close_reasons={'expiry': 1, 'target': 1, 'stop': 5}
  - GOLD: n=3, wins=3, avg=+1.170000, close_reasons={'expiry': 2, 'target': 1}
  - OIL: n=3, wins=1, avg=-1.086667, close_reasons={'target': 1, 'stop': 2}
- FUNDING_EXTREME_SHORT: n=16, wins_pnl_gt_0=9, avg_pnl_pct=+0.262500, avg_market=+0.000931, avg_funding=+0.001681
  close_reasons={'target': 9, 'stop': 5, 'llm_decision': 2}
  - AMZN: n=3, wins=3, avg=+3.526667, close_reasons={'target': 3}
  - HYPE: n=3, wins=1, avg=-2.110000, close_reasons={'target': 1, 'stop': 2}
  - OIL: n=10, wins=5, avg=-0.005000, close_reasons={'target': 5, 'stop': 3, 'llm_decision': 2}

## Hold horizon aggregate at T=15 current target/stop
- FUNDING_EXTREME_LONG hold=12: n=47, avg_total=-0.08%, trade_weighted_wr=46.81%
- FUNDING_EXTREME_LONG hold=24: n=47, avg_total=-0.03%, trade_weighted_wr=48.94%
- FUNDING_EXTREME_LONG hold=48: n=47, avg_total=-0.35%, trade_weighted_wr=48.94%
- FUNDING_EXTREME_LONG hold=72: n=47, avg_total=-1.08%, trade_weighted_wr=38.30%
- FUNDING_EXTREME_LONG hold=168: n=47, avg_total=-1.53%, trade_weighted_wr=29.79%
- FUNDING_EXTREME_SHORT hold=12: n=55, avg_total=-0.02%, trade_weighted_wr=52.73%
- FUNDING_EXTREME_SHORT hold=24: n=56, avg_total=+0.43%, trade_weighted_wr=51.79%
- FUNDING_EXTREME_SHORT hold=48: n=56, avg_total=+0.68%, trade_weighted_wr=53.57%
- FUNDING_EXTREME_SHORT hold=72: n=56, avg_total=+1.43%, trade_weighted_wr=58.93%
- FUNDING_EXTREME_SHORT hold=168: n=57, avg_total=+2.65%, trade_weighted_wr=63.16%

## Current config aggregate T=15 production hold=72
- FUNDING_EXTREME_LONG: n=47, avg_total=-1.08%, wr=38.30%
- FUNDING_EXTREME_SHORT: n=56, avg_total=+1.43%, wr=58.93%

## Conservative best cells from regenerated summary
- AMZN FUNDING_EXTREME_LONG: T=25, target=3, stop=4, hold=12, raw=70, n=13, wr=38.46%, avg_total=+0.0498, maxDD=-3.9942, sharpe=+0.0386
- AMZN FUNDING_EXTREME_SHORT: T=5, target=4, stop=2.5, hold=168, raw=28, n=11, wr=100.00%, avg_total=+4.7392, maxDD=+0.0000, sharpe=+4.8303
- BTC FUNDING_EXTREME_LONG: T=8, target=3, stop=4, hold=12, raw=62, n=19, wr=47.37%, avg_total=-0.1925, maxDD=-4.2035, sharpe=-0.1884
- BTC FUNDING_EXTREME_SHORT: T=12, target=3, stop=4, hold=168, raw=33, n=11, wr=100.00%, avg_total=+3.1227, maxDD=+0.0000, sharpe=+3.1803
- GOLD FUNDING_EXTREME_LONG: T=20, target=3, stop=1.5, hold=168, raw=20, n=10, wr=70.00%, avg_total=+1.5874, maxDD=-2.9658, sharpe=+0.8617
- HYPE FUNDING_EXTREME_LONG: T=10, target=5, stop=1.5, hold=168, raw=232, n=32, wr=28.12%, avg_total=+0.1104, maxDD=-20.4007, sharpe=+0.0290
- HYPE FUNDING_EXTREME_SHORT: T=10, target=4, stop=2.5, hold=168, raw=32, n=13, wr=61.54%, avg_total=+1.8645, maxDD=-8.5813, sharpe=+0.4844
- OIL FUNDING_EXTREME_LONG: T=25, target=4, stop=1.5, hold=24, raw=35, n=13, wr=84.62%, avg_total=+0.5460, maxDD=-0.5062, sharpe=+0.6645
- OIL FUNDING_EXTREME_SHORT: T=25, target=5, stop=4, hold=168, raw=104, n=23, wr=65.22%, avg_total=+4.8789, maxDD=-5.3695, sharpe=+0.6192

## OIL SHORT regime-block dedup
- best_round1: T=25, target=5, stop=4, hold=168, raw_hits=104, regime_entries=22, closed_trades=22, wins=15, avg_total=+5.3987%, entries=['2026-04-04T13:00:00+00:00', '2026-04-05T21:00:00+00:00', '2026-04-11T09:00:00+00:00', '2026-04-11T17:00:00+00:00', '2026-04-13T04:00:00+00:00', '2026-04-16T21:00:00+00:00', '2026-04-18T17:00:00+00:00', '2026-04-19T13:00:00+00:00', '2026-04-22T21:00:00+00:00', '2026-04-23T21:00:00+00:00', '2026-04-24T21:00:00+00:00', '2026-04-25T21:00:00+00:00', '2026-04-26T13:00:00+00:00', '2026-04-27T21:00:00+00:00', '2026-04-29T14:00:00+00:00', '2026-04-30T21:00:00+00:00', '2026-05-01T08:00:00+00:00', '2026-05-03T15:00:00+00:00', '2026-05-03T21:00:00+00:00', '2026-05-04T03:00:00+00:00', '2026-05-04T06:00:00+00:00', '2026-05-06T02:00:00+00:00']
- current_config: T=15, target=4, stop=2.5, hold=72, raw_hits=130, regime_entries=24, closed_trades=24, wins=14, avg_total=+2.6814%, entries=['2026-04-04T13:00:00+00:00', '2026-04-05T21:00:00+00:00', '2026-04-11T09:00:00+00:00', '2026-04-11T17:00:00+00:00', '2026-04-13T04:00:00+00:00', '2026-04-16T21:00:00+00:00', '2026-04-18T17:00:00+00:00', '2026-04-19T13:00:00+00:00', '2026-04-22T21:00:00+00:00', '2026-04-23T21:00:00+00:00', '2026-04-24T21:00:00+00:00', '2026-04-25T09:00:00+00:00', '2026-04-25T21:00:00+00:00', '2026-04-26T13:00:00+00:00', '2026-04-27T21:00:00+00:00', '2026-04-29T08:00:00+00:00', '2026-04-30T21:00:00+00:00', '2026-05-01T08:00:00+00:00', '2026-05-02T17:00:00+00:00', '2026-05-03T15:00:00+00:00', '2026-05-03T21:00:00+00:00', '2026-05-04T02:00:00+00:00', '2026-05-04T06:00:00+00:00', '2026-05-06T02:00:00+00:00']
- hold_extension: T=15, target=4, stop=2.5, hold=168, raw_hits=130, regime_entries=24, closed_trades=24, wins=17, avg_total=+5.3321%, entries=['2026-04-04T13:00:00+00:00', '2026-04-05T21:00:00+00:00', '2026-04-11T09:00:00+00:00', '2026-04-11T17:00:00+00:00', '2026-04-13T04:00:00+00:00', '2026-04-16T21:00:00+00:00', '2026-04-18T17:00:00+00:00', '2026-04-19T13:00:00+00:00', '2026-04-22T21:00:00+00:00', '2026-04-23T21:00:00+00:00', '2026-04-24T21:00:00+00:00', '2026-04-25T09:00:00+00:00', '2026-04-25T21:00:00+00:00', '2026-04-26T13:00:00+00:00', '2026-04-27T21:00:00+00:00', '2026-04-29T08:00:00+00:00', '2026-04-30T21:00:00+00:00', '2026-05-01T08:00:00+00:00', '2026-05-02T17:00:00+00:00', '2026-05-03T15:00:00+00:00', '2026-05-03T21:00:00+00:00', '2026-05-04T02:00:00+00:00', '2026-05-04T06:00:00+00:00', '2026-05-06T02:00:00+00:00']

## OIL/HYPE/AMZN SHORT selected cells
- OIL SHORT T=25/target=5/stop=4/hold=168: raw=104, n=23, wr=65.22%, avg_total=+4.8789, maxDD=-5.3695, sharpe=0.6192239292423533
- HYPE SHORT T=10/target=4/stop=2.5/hold=168: raw=32, n=13, wr=61.54%, avg_total=+1.8645, maxDD=-8.5813, sharpe=0.48441644315970245
- HYPE SHORT T=10/target=10/stop=4/hold=168: raw=32, n=13, wr=53.85%, avg_total=+2.9833, maxDD=-21.4122, sharpe=0.38712093043337714
- AMZN SHORT T=5/target=4/stop=2.5/hold=168: raw=28, n=11, wr=100.00%, avg_total=+4.7392, maxDD=+0.0000, sharpe=4.830328643777093
- AMZN SHORT T=10/target=10/stop=2.5/hold=168: raw=19, n=8, wr=100.00%, avg_total=+7.0652, maxDD=+0.0000, sharpe=2.228198040965032
- AMZN SHORT T=15/target=4/stop=2.5/hold=72: raw=15, n=8, wr=87.50%, avg_total=+2.7671, maxDD=-0.7233, sharpe=1.288689286352527
- OIL SHORT T=15/target=4/stop=2.5/hold=72: raw=130, n=24, wr=54.17%, avg_total=+1.8105, maxDD=-9.2622, sharpe=0.3208277213158945

## Funding trend-blocked resolved shadows
- ('FUNDING_EXTREME_LONG', 'AMZN'): n=4, wins=3, avg=+2.1900, ids=['B-1777472860457-p2ru', 'B-1777520872842-5wqo', 'B-1777652879515-5z9l', 'B-1777940881329-w5t2']
- ('FUNDING_EXTREME_LONG', 'GOLD'): n=2, wins=2, avg=+0.4850, ids=['B-1777552073146-emi4', 'B-1778102878473-5rnc']
- ('FUNDING_EXTREME_LONG', 'HYPE'): n=1, wins=0, avg=-2.5900, ids=['B-1777710483835-2w45']
- total: n=7, wins=5, avg=+1.0200

## Position snapshots coverage
- rows=38, unique_ids=9, first=2026-04-06T17:39:18.084Z, last=2026-04-07T14:27:00.440Z, peakPnlPct_column=False
- stopped funding trades in CSV=12, stopped IDs with snapshots=0
