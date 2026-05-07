# Runtime State and New Machine Handoff

GitHub is the source of truth for code plus the small auditable data files that the trader uses for reports, learning, and recovery. Secrets, build output, large generated history, and live process state stay outside GitHub.

## Files that stay out of GitHub

- `config.env` and `.env`: local credentials and machine-specific config. Copy from a secure source, never commit.
- `.runtime/`: repo-local fallback runtime state. Used when `POLYMARKET_TRADER_STATE_DIR` is not set.
- `/var/lib/polymarket-trader/portfolio-live.json`: production live portfolio state used by the VPS trader and minute exit scanner.
- `/var/lib/polymarket-trader/pending-closed-trades.jsonl`: handoff queue for positions closed by the minute scanner and imported by the hourly trader.
- `data/instrument-snapshots.jsonl`: large generated historical snapshot stream. Useful for analysis, too large for GitHub.
- `data/daily-email-reports/` and `data/instrument-snapshot-archives/`: generated artifacts.
- `node_modules/`, `dist/`, Python caches, and logs: reproducible build/cache output.

## Files tracked in GitHub

- `data/portfolio.json`: canonical auditable portfolio state.
- `data/trades-detailed.csv`: realized trade ledger and P&L source of truth.
- `data/daily-macro.csv`: macro score history and macro-momentum input.
- `data/daily-valuations.csv`: valuation history used by signals and analysis.
- `data/signal-weights.json`: signal performance, weights, demotions, and disables.
- `data/hypotheses.json`: LLM/promoted hypothesis definitions and statuses.
- `data/blocked-signals.json`: blocked/shadow trade history used for learning and reporting.
- `data/processed-closed-trades.json`: import guard that prevents already-closed positions from being processed twice.

## Development on another computer

For normal development, clone GitHub, install dependencies, copy `config.env` if you need authenticated local commands, and optionally sync large generated data for analysis.

```bash
git clone git@github.com:virtualwriter/polymarket-trader.git
cd polymarket-trader
npm install
cp config.env.example config.env
```

Then fill `config.env` from your secure credential source or sync it from the VPS over SSH.

## Sync ignored files from the VPS

Use the helper script from the local clone:

```bash
scripts/sync-runtime-state.sh root@YOUR_VPS:/opt/polymarket-trader .
```

That copies `config.env` and large generated analysis/report files into the local clone without adding them to Git.

To copy the live production portfolio state too, pass `--include-live-state`:

```bash
scripts/sync-runtime-state.sh root@YOUR_VPS:/opt/polymarket-trader . --include-live-state
```

Only use `--include-live-state` when you need an exact production runtime snapshot. Do not run the live trader from two machines at once.

## Moving production to another machine

Before running the live trader somewhere else:

1. Stop the VPS trader and exit-scanner timers/services.
2. Sync the latest `/var/lib/polymarket-trader/portfolio-live.json` and `pending-closed-trades.jsonl` to the new runner's state directory.
3. Confirm `data/portfolio.json`, `data/trades-detailed.csv`, and `data/processed-closed-trades.json` are current.
4. Start services on only one machine.
5. Verify the trader and minute scanner are reading the same `POLYMARKET_TRADER_STATE_DIR`.

This avoids split-brain trading, duplicate closes, or stale stop-loss state.
