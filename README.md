# Sports Market Maker

LMSR + CLOB engine adapted from the Christie's auction prediction market for sports market making on Polymarket.

## Quick Start

```bash
# Install dependencies
npm install

# Run the MM simulation server with demo games
npx tsx scripts/sports-sim-server.ts

# In another terminal, run the demo data bridge
npx tsx scripts/sports-bridge.ts --source demo
```

## Architecture

```
Data Source (Betfair / ESPN / Odds API)
    ↓
sports-bridge.ts → POST /game-event
    ↓
sports-sim-server.ts (MatchingEngine + LMSR AMM + RiskManager)
    ↓
HTTP API (localhost:8080) + WebSocket
```

## Components

| File | Description |
|------|-------------|
| `engine-src/` | Core engine: CLOB, LMSR AMM, RiskManager, FeeCalculator |
| `scripts/sports-sim-server.ts` | MM simulation server (adapted from auction sim) |
| `scripts/sports-bridge.ts` | Live data bridge (Betfair, ESPN, Odds API, demo) |
| `scripts/games.json` | Game configuration (markets, traders) |
| `SPORTS-MM-STRATEGY.md` | Full strategy document with research |

## Data Sources

```bash
# Demo (synthetic odds walk — no API key needed)
npx tsx scripts/sports-bridge.ts --source demo

# ESPN (free, ~15s delay, scores only)
npx tsx scripts/sports-bridge.ts --source espn

# The Odds API (aggregated odds from 40+ books)
npx tsx scripts/sports-bridge.ts --source odds-api --odds-api-key YOUR_KEY

# Betfair Exchange (best latency, requires account)
npx tsx scripts/sports-bridge.ts --source betfair --betfair-key YOUR_KEY
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/game-event` | Push live odds/score updates |
| GET | `/health` | Server status |
| GET | `/markets` | All markets with live data |
| GET | `/markets/:id/orderbook` | Full order book |
| GET | `/markets/:id/trades` | Recent trades |
| GET | `/game-status` | Game phases and scores |
| GET | `/trader-pnl` | Trader P&L breakdown |
| GET | `/amm-status` | LMSR AMM risk metrics |

## Environment Variables

```env
PORT=8080
FEE_RATE=0.0175
MM_POSITION_CAP_USDC=5000000000
MM_MAX_FILL_USDC=500000000
MM_WITHDRAWAL_WINDOW=60
MM_BASE_HALF_SPREAD=0.02
MM_SKEW_PER_UNIT=0.01
BETFAIR_API_KEY=
BETFAIR_SESSION_TOKEN=
ODDS_API_KEY=
```
