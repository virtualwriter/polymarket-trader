# Trader Performance Since Inception

Generated: 2026-06-08T18:00:00.000Z
Portfolio last updated: 2026-06-08T17:00:00.000Z

## Summary

- Realized P&L, de-duped counted ledger: +$0.1000 (2 counted trades, 1W/1L, 50.0% win rate)
- Portfolio audit/reference: +$0.1000 (2 total trades, 1W/1L)
- Raw detailed trade ledger audit: +$0.2000 (3 closed trade rows, 2W/1L, 66.7% win rate)
- Ledger note: 1 duplicate trade IDs found in trades-detailed.csv; grouped tables below use the de-duped counted ledger.
- Operationally tainted trades labeled separately: tainted-1 (manual data correction)
- Current cash: $10.0000
- Open positions: 1
- Resolved shadow P&L: +$0.2500 (1 resolved shadows, 1W/0L, 100.0% win rate)
- Hyperliquid hybrid bot (separate; LLM does not own): +$0.1500 shadow realized over 2 closed trades (1W/1L, 50.0% win rate), 1 open, fees +$0.0100

## Win/Loss By Trade Setup Type

| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |
|---|---:|---:|---:|---:|---:|---:|---:|
| LLM_HYPOTHESIS | 1 | 1 | 0 | 100.0% | +$0.1000 | +$0.1000 | +4.00% |

## Win/Loss By Asset

| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |
|---|---:|---:|---:|---:|---:|---:|---:|
| BTC | 2 | 1 | 1 | 50.0% | +$0.1000 | +$0.0500 | +2.00% |

## P&L By Trade Type And Asset

| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |
|---|---:|---:|---:|---:|---:|---:|---:|
| LLM_HYPOTHESIS / BTC | 2 | 1 | 1 | 50.0% | +$0.1000 | +$0.0500 | +2.00% |

## P&L By Venue And Asset

| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |
|---|---:|---:|---:|---:|---:|---:|---:|
| polymarket / BTC | 2 | 1 | 1 | 50.0% | +$0.1000 | +$0.0500 | +2.00% |

## Shadow P&L By Shadow Trade Type

| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |
|---|---:|---:|---:|---:|---:|---:|---:|
| risk_gate / NO_BIAS_ADJUSTED_GAP_SHADOW | 1 | 1 | 0 | 100.0% | +$0.2500 | +$0.2500 | +25.00% |

## Shadow P&L By Shadow Type And Asset

| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |
|---|---:|---:|---:|---:|---:|---:|---:|
| risk_gate / NO_BIAS_ADJUSTED_GAP_SHADOW / BTC | 1 | 1 | 0 | 100.0% | +$0.2500 | +$0.2500 | +25.00% |

## LLM Setup-Family Test Win/Loss

| Group | Trades | Wins | Losses | Win Rate | P&L | Avg P&L | Avg P&L % |
|---|---:|---:|---:|---:|---:|---:|---:|
| Breakout \| test | 1 | 1 | 0 | 100.0% | +$0.0000 | +$0.0000 | +0.00% |

## Currently Tested LLM Hypotheses

| Hypothesis | Setup | Status | Pending Tests | Completed W/L | Win Rate | Description |
|---|---|---|---:|---:|---:|---|
| hyp-1 | Breakout \| test | active | 1 | 1/0 | 100.0% | Watch breakout continuation |

## Currently Open Shadow Trades

| Shadow | Type | Asset | Venue | Direction | Unrealized P&L | Opened | Thesis |
|---|---|---|---|---|---:|---|---|
| shadow-open-1 | risk_gate / NO_BIAS_ADJUSTED_GAP_SHADOW | BTC | polymarket | long | +$0.5000 | 2026-06-01T12:30:00.000Z | market=Will Bitcoin hit $100,000 in June?; instrument_type=pm_yes; instrument_id=btc-hit-jun-2026::123; entry=0.4; current=0.5; Shadow thesis \| escaped |

## Open Positions

| Position | Signal | Asset | Venue | Direction | Unrealized P&L | Entry | Current | Opened | Model Context | Thesis |
|---|---|---|---|---|---:|---:|---:|---|---|---|
| pos-btc-1 | LLM_HYPOTHESIS / Breakout \| test | BTC | polymarket | long | +$0.5000 | 0.4000 | 0.5000 | 2026-06-01T12:30:00.000Z | entry_model=0.420000; current_model=0.550000; current_bid=0.4400; current_ask=0.4600; strike=$100,000; expiry=June; entry_row_source=history_exact; entry_row_ts=2026-06-01T12:30:00.000Z; entry_row_distance_hours=0.00; current_row_source=current; current_row_ts=2026-06-08T17:00:00.000Z; current_row_age_hours=1.00 | market=Will Bitcoin hit $100,000 in June?; instrument_type=pm_yes; instrument_id=btc-hit-jun-2026::123; entry=0.4; current=0.5; Golden fixture thesis |
