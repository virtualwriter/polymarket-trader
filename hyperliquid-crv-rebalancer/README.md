# Hyperliquid CRV Delta-Neutral Rebalancer + PURR Trend Bot

Automated hedge management for yCRV/CRV positions using Hyperliquid perpetual futures,
plus backtesting infrastructure and live trading bots.

---

## Multi-Coin Hybrid Bot (Live Trading)

Runs the hybrid strategy (Short 3h 0.5% normally → Long 5h 1% on bull signal)
across up to 13 coins simultaneously on Hyperliquid perp. $1 per trade by default.

**Strategy (from backtest):**
- Base: short each coin using 3h EMA with 0.5% entry/exit thresholds
- When at least 10 out of 13 coins have price above 50h EMA for 24 consecutive hours:
  switch all open positions to long (5h EMA, 1%/1% thresholds)
- When signal clears: switch back to short

### Setup

```bash
# Either set your private key:
export HYPERLIQUID_PRIVATE_KEY=0x...
# OR your 12/24-word secret recovery phrase:
export HYPERLIQUID_MNEMONIC="word1 word2 word3 ... word12"
```

### Usage

```bash
# Dry run first (no real trades)
python multi_coin_hybrid_bot.py --dry-run

# Single coin
python multi_coin_hybrid_bot.py --coins PURR --dry-run

# Live with $1/trade (default)
python multi_coin_hybrid_bot.py

# Live with $10/trade
python multi_coin_hybrid_bot.py --trade-size 10

# Live with specific coins
python multi_coin_hybrid_bot.py --coins PURR,FARTCOIN,ADA
```

## PURR Trend Bot (Legacy)

A **5h EMA crossover** trend-following bot for **PURR/USDC spot** on Hyperliquid.

### Strategy
- **5-hour EMA** with **1% entry threshold** (price > EMA × 1.01) and **1% exit threshold** (price < EMA × 0.99)
- Checks every 15 minutes
- Market IOC orders on PURR/USDC spot
- Zero leverage — no margin, no liquidations

### Setup

```bash
# Either set your private key:
export HYPERLIQUID_PRIVATE_KEY=0x...
# OR your 12/24-word secret recovery phrase:
export HYPERLIQUID_MNEMONIC="word1 word2 word3 ... word12"
```

### Usage

```bash
# Dry run (no real trades)
python purr_trend_bot.py --dry-run --capital 1000

# Live with $1,000
python purr_trend_bot.py --capital 1000
```

State persists across restarts via `purr_bot_state.json` (auto-generated).

---

## Backtesting

### Quick comparison (all strategies, all coins)

```bash
python monthly_breakdown.py                    # Per-coin monthly tables
python monthly_breakdown.py --coin fartcoin    # Single coin
python monthly_breakdown.py --csv              # Export combined CSV
```

### Hybrid strategy (Short → Long on bull signal)

```bash
python hybrid_breakdown.py                          # All coins summary
python hybrid_breakdown.py --coin fartcoin           # Single coin
python hybrid_breakdown.py --csv                     # Export CSV
```

### Multi-coin backtest with grid search

```bash
python multi_coin_backtest.py                        # All coins, all modes
python multi_coin_backtest.py --coin purr --mode short
python multi_coin_backtest.py --mode hybrid          # Short → Long on bull signal
python multi_coin_backtest.py --mode regime --grid   # Grid search params
```

### Fetch new coin data

```bash
python fetch_cg_range.py --tickers INJ,CRV,ARB
```

---

## CRV Delta-Neutral Hedge

### Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your private key
```

### Usage

```bash
# Set your yCRV holdings
python crv_delta_neutral.py set-holdings 1000

# Check status (prices, position, hedge gap)
python crv_delta_neutral.py status

# Dry-run rebalance
python crv_delta_neutral.py rebalance

# Execute rebalance
python crv_delta_neutral.py rebalance --execute

# Run daily auto-rebalance loop
python crv_delta_neutral.py loop --execute
```

### SOL Hedge

```bash
python hyperliquid_hedge.py status
python hyperliquid_hedge.py short 10
python hyperliquid_hedge.py long 10
python hyperliquid_hedge.py close
```

### Deposit USDC

```bash
python deposit_to_hyperliquid.py        # Deposit full Arbitrum USDC balance
python deposit_to_hyperliquid.py 100    # Deposit $100 USDC
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TARGET_LEVERAGE` | 2 | Perp leverage (cross margin) |
| `HEDGE_RATIO` | 0.50 | Fraction of yCRV exposure to hedge (1.0 = full) |
| `REBALANCE_THRESHOLD_PCT` | 5.0 | Min % deviation to trigger rebalance |
| `LOOP_INTERVAL_SECONDS` | 86400 | Seconds between auto-rebalance checks |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HYPERLIQUID_PRIVATE_KEY` | Yes | Wallet private key (0x... format) |
| `HYPERLIQUID_ADDRESS` | No | Account address (derived from key if omitted) |
| `HYPERLIQUID_MAINNET` | No | `true` (default) or `false` for testnet |

## Disclaimer

This is experimental trading software. Cryptocurrency trading carries significant risk.
Past backtest performance does not guarantee future results. Use at your own risk.
