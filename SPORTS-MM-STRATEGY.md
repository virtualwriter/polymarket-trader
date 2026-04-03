# Sports Market Making on Polymarket

## Strategy Overview

Use our proven LMSR + CLOB engine (profitable at +$1,063 on the René Engel wine auction sim with Phase 1 risk controls) to provide liquidity on Polymarket sports markets. The engine's architecture maps 1:1 from auction prediction markets to sports.

---

## Auction → Sports Mapping

| Auction Concept | Sports Equivalent |
|----------------|-------------------|
| "Will lot sell above high estimate?" | "Will Team A win?" |
| Pre-auction trading (speculation) | Pre-game trading (odds-based) |
| Live auction bids arriving | Live game events (goals, touchdowns, etc.) |
| Bid crosses high estimate → 99% | Team up big late → 99% |
| Hammer falls → resolution | Final whistle → resolution |
| Each lot = separate market | Each game = separate market |
| Auction lasts 30-90s per lot | Game lasts 2-4 hours |
| Deepgram transcription → events | Sports API → events |
| sim-bridge → sim server | sports-bridge → MM server |

### Key Advantage: Longer Duration

Auction lots resolve in 30-90 seconds — barely enough time for the MM to adjust. A basketball game is 2.5 hours. Far more time to flatten inventory, adjust spreads, and recover between events.

---

## Where Pricing Edge Comes From

### 1. Faster Information Processing (Primary Edge)

React to the same public information faster than other Polymarket participants.

- **Betfair exchange** reprices in ~2-5s after a game event
- **Polymarket** reprices in ~10-30s (thin books, fewer participants)
- **The 5-25 second window** between Betfair moving and Polymarket catching up is the edge

### 2. Better Models (Aggregation Alpha)

Combine multiple sportsbook odds into a more accurate fair value than any single source.

- Aggregate odds from 20+ bookmakers
- Weight by historical accuracy
- Adjust for vig (overround)
- Your fair value is better than any single book

### 3. Structural/Mathematical Edge (No Prediction Needed)

- **Cross-market arbitrage**: Related markets on Polymarket that don't add up correctly
- **Vig extraction**: Quote 48 bid / 52 ask on a 50% market, earn 2¢ per trade
- **Correlated hedging**: Offset risk across related game markets

### 4. Market Microstructure Edge

- **Toxic flow detection**: RiskManager identifies informed counterparties
- **Queue priority**: First to rest at the right price gets filled first
- **Inventory management**: Skewed quotes flatten the book in both directions

---

## Live Sports Data APIs

### Free / Cheap Tier

| API | Data | Latency | Cost |
|-----|------|---------|------|
| [ESPN Hidden API](https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard) | Scores, game state, play-by-play | ~10-15s delay | Free (unofficial) |
| [The Odds API](https://the-odds-api.com/) | Aggregated sportsbook odds from 40+ books | ~5-10s | Free tier: 500 req/mo, $20/mo for 10K |
| [API-Football](https://www.api-football.com/) | Soccer scores, stats, odds | ~15-30s | Free tier available |
| [BallDontLie](https://www.balldontlie.io/) | NBA scores and stats | ~30s | Free |

### Professional Tier (Sub-Second)

| API | Data | Latency | Cost |
|-----|------|---------|------|
| [Sportradar](https://sportradar.com/) | Play-by-play, live odds, all major sports | ~1-2s via push | $500-5K/mo |
| [Betfair Exchange API](https://developer.betfair.com/) | Real-time exchange odds (true market prices) | ~200-500ms WebSocket | Free with Betfair account |
| [Pinnacle API](https://pinnacle.com/en/api) | Sharpest odds in the industry | ~1-3s | Free with funded account |
| [Genius Sports](https://geniussports.com/) | Official data partner for NFL, NCAA, EPL | ~500ms | Enterprise pricing |

### Recommended: Betfair Exchange API

Betfair is the deepest sports trading market in the world. Their streaming API pushes price updates via WebSocket at ~200ms intervals. This is the fair value oracle — no prediction model needed, just track where Betfair is trading and quote around it on Polymarket.

---

## The Latency Chain

```
Ball crosses goal line (reality)
    ↓ ~0ms
Stadium sensors (Hawk-Eye, VAR, NFL Next Gen Stats)
    ↓ ~500ms-2s
TV broadcast shows it (production delay + encoding)
    ↓ ~3-8s
Streaming services show it (additional buffer)
    ↓ ~5-15s
Betfair prices move ← traders watching fastest feeds
    ↓ ~0-2s after fastest watchers
Sportsbook odds update ← slower, manual review
    ↓ ~5-30s
Polymarket prices move ← thinnest, slowest to react
```

### Betfair Reaction Times by Sport

| Sport | Betfair Reaction | Notes |
|-------|-----------------|-------|
| Horse racing | ~1s | Betfair's core market, fastest traders |
| Soccer | ~2-5s | Goal → TV delay → traders react |
| Tennis | ~1-3s | Point-by-point, popular with algo traders |
| NFL/NBA | ~3-8s | US sports have longer broadcast delays |
| Cricket | ~2-4s | Huge Betfair market |

### Speed Hierarchy

```
Tier 1: Stadium data feeds (~0-1s)       $50K-500K/year, pro shops only
Tier 2: Low-latency TV decode (~1-3s)    Custom hardware, ~$5-20K
Tier 3: Betfair exchange prices (~2-5s)   Free with account  ← WE ARE HERE
Tier 4: Regular TV broadcast (~5-10s)     What most people watch
Tier 5: Streaming apps (~8-15s)           What most Polymarket traders use
Tier 6: Social media / score apps (~10-30s)
```

Being at Tier 3 while most Polymarket traders are at Tier 4-6 gives a consistent 5-20 second informational advantage.

---

## Engine Latency Analysis

### Current Engine Performance

| Component | Latency | Bottleneck? |
|-----------|---------|------------|
| OrderBook.submitOrder (in-memory arrays) | <1ms | No |
| LMSR.getYesPrice (pure math) | <0.1ms | No |
| RiskManager checks (pure math) | <0.1ms | No |
| Network: Betfair WebSocket → engine | ~200ms | Moderate |
| Network: Engine → Polymarket API | ~100-200ms | Yes |
| Network: Cancel stale orders on Polymarket | ~100-200ms | Yes |

### End-to-End Round Trip

```
Sports event happens
    ↓ ~200ms       Betfair WebSocket pushes new odds
    ↓ ~1ms         Engine computes new quotes
    ↓ ~100-200ms   Submit order to Polymarket CLOB API
    ↓ ~100-200ms   Cancel stale orders on Polymarket
────────────────
Total: ~300-600ms end-to-end
```

### Is Sub-Second Achievable?

**Yes, at ~300-600ms.** This is:

- **Too slow** to front-run HFT firms on marquee NFL/NBA games
- **Fast enough** for mid-tier markets (MLS, college sports, tennis, esports)
- **Fast enough** for pre-game quoting (speed irrelevant, only price accuracy matters)
- **Fast enough** during live games if spreads are widened to compensate

### Do We Need Rust/C++?

**No.** The dominant latency is network round-trips (~400ms), not compute (<1ms). Language doesn't matter until you're co-located and network drops to <5ms.

---

## Market Selection Strategy

### Best Markets for This Engine

1. **Pre-game markets** (all sports) — Speed irrelevant. Aggregate odds, provide tighter spreads than what's on Polymarket. Most volume lives here.

2. **Mid-tier live games** — MLS, college sports, tennis, cricket, esports. Less competition, 500ms response time is more than enough.

3. **Correlated market clusters** — When Polymarket has "Will X win Game 1?" and "Will X win the series?", arbitrage the relationship.

### Markets to Avoid (Initially)

- Sunday Night Football, NBA Finals — every quant shop is watching
- Markets with <$5K total volume — not worth the gas
- Non-sports event markets — need different pricing oracles

---

## Price Flow Architecture

The single most important property of the system: **one price, one path, every component reads the same value.** There is no "internal LMSR price" that diverges from the "external fair value." When the market moves, the LMSR moves with it instantly.

### The Price Path

```
Polymarket CLOB WebSocket               ← Source of truth
    │
    ↓
sports-bridge.ts                        ← Computes midpoint from best bid/ask
    │  POST /game-event { eventType: "odds_update", data: { fairValue: 0.115 } }
    ↓
sports-sim-server.ts handleGameEvent()
    │
    ├─→ state.fairValue = 0.115         ← Single canonical value
    │
    ├─→ amm.recenter(0.115)             ← LMSR updates qYes so getYesPrice() = 0.115
    │       │                               On jumps >3¢, cancels all stale quotes first
    │       └─→ refreshQuotes()          ← Posts bids/asks centered on 0.115
    │
    └─→ rm.notifyFairValue(0.115)       ← RiskManager knows the current price
            │
            ├─→ Staleness timer resets
            ├─→ Divergence check (midpoint vs fairValue)
            └─→ Spread adjustments react to correct price
```

### What `recenter()` Does

When the bridge delivers a new price, `LMSR.recenter(p)` updates the internal state:

```
qYes = b × ln(p / (1 - p))
qNo  = 0
```

After this, `getYesPrice()` returns the new price. `refreshQuotes()` reads `getYesPrice()` to set the quoting center. There is no separate "external fair value" field — the internal state IS the market price.

### Why This Matters — Before vs After

| Metric | Broken (old) | Fixed (current) | Improvement |
|--------|-------------|-----------------|-------------|
| Gojo P&L | -$29.20 | +$57.69 | +$86.89 |
| Gojo Edge | -517 bps | +266 bps | +783 bps |
| LMSR price vs market | 27% vs 9% (18¢ gap) | 11.5% vs 11.5% (0¢ gap) | 100% |
| Price components | 6 different values | 1 canonical value | 83% reduction |
| Adverse selection fills | 51 fills at wrong price | 0 fills at wrong price | Eliminated |

The old system had **six different price values** floating around: LMSR internal (stale), external fair value (patch), FairValueAggregator (corrupted by demo averaging), state.fairValue (source-dependent branching), RiskManager.lastFairValue, RiskManager.lastMidpoint. The LMSR was quoting at its initialization price (27%) while the market had moved to 9%.

---

## Risk Management

### Defense Layers

The `RiskManager` implements three tiers of defense, all reacting to the **single canonical price** from the price path above.

### Phase 1: Mechanical Defenses

**Net Position Cap** — Max net directional exposure per market. Once hit, the MM stops quoting that side entirely. Default: $5,000 per market.

**Gross Position Cap** — Max total volume on either side (buy or sell), regardless of net. Prevents massive balanced-but-risky inventory. Default: 3× the net cap.

**Inventory-Skewed Spreads** — When the MM accumulates a large YES position:
- Widens the bid (discourages more YES buying)
- Tightens the ask (encourages YES selling back)
- Formula: `halfSpread = baseHalfSpread + (exposureUnits × inventorySkewPerUnit)`

**Time-Based Quote Withdrawal** — Pulls all quotes in the final N seconds before resolution.

**Per-Trade Size Limits** — Caps individual fills at $500 to prevent a single large informed trade from blowing out the position.

### Tier 1: Flow-Based Defenses

**VPIN (Volume-synchronized Probability of Informed Trading)** — Tracks the last N fills per market. If flow is >75% one-sided (e.g., all buys), spreads widen by 2.5×. This detects informed order flow before it causes damage.

**Per-Wallet Toxicity Scoring** — Tracks wallets across resolved markets. Wallets that are consistently on the correct side get flagged as toxic. Very toxic wallets (>75% correct, 5+ markets) can be refused or face 3× spread widening. Direction-aware: if a toxic wallet's trade reduces MM exposure, the penalty is smaller (1.3×).

**Bayesian Prior Shifting** — Adjusts the quoting center slightly based on flow direction. If recent flow is heavily one-sided, the MM shifts its fair value estimate toward the flow (up to ±5¢). Also considers inventory: when heavily exposed, shifts to encourage offsetting flow.

### Tier 2: Market-Aware Defenses

**Stale Fair Value Detection** — If no odds update arrives for 60s, spreads progressively widen. If no update for 180s, all quotes are pulled. Prevents quoting at stale prices during data feed outages.

**Midpoint-vs-FairValue Divergence Circuit Breaker** — If the CLOB midpoint diverges from `state.fairValue` by >10%, spreads widen. At >20% divergence, all quotes are pulled. Catches cases where the orderbook state drifts from reality.

**Pre-Game Spread Multiplier** — Pre-game markets use 5× wider spreads than live markets. Pre-game flow is less informed, but price discovery is also slower.

**Sport-Specific Game State Signals** — Each sport has a `GameStateParser` that can trigger spread widening or withdrawal based on game events (e.g., overtime, penalty kicks, match point).

### How Defenses React to Price Updates

Every defense reads from the same price that the AMM uses. When `recenter()` is called:

```
Price update arrives (e.g., 60% → 55%)
    │
    ├─→ amm.recenter(0.55)
    │     └─→ getYesPrice() = 0.55
    │     └─→ Quotes re-posted at 0.55 center
    │
    ├─→ rm.notifyFairValue(marketId, 0.55)
    │     └─→ Staleness timer resets (no stale-FV withdrawal)
    │     └─→ Divergence = |CLOBmidpoint - 0.55| (should be near 0)
    │
    └─→ On next refreshQuotes():
          ├─→ shouldWithdraw() checks staleness + divergence
          ├─→ getAdjustedSpread() applies VPIN + inventory + phase multipliers
          └─→ Bayesian shift applied to quoting center
```

### Sports-Specific Tuning

| Parameter | Default | Tennis | Basketball | Soccer |
|-----------|---------|--------|------------|--------|
| `baseHalfSpread` | 2¢ | 2¢ | 2¢ | 2¢ |
| `positionCapUsdc` | $5,000 | $3,000 | $5,000 | $5,000 |
| `maxFillSizeUsdc` | $500 | $500 | $500 | $500 |
| `withdrawalWindowSeconds` | 30s | 30s | 30s | 120s |
| `preGameSpreadMultiplier` | 5.0× | 5.0× | 5.0× | 5.0× |
| `vpinSpreadMultiplier` | 2.5× | 2.5× | 2.5× | 2.5× |
| `grossCapMultiplier` | 3× | 3× | 3× | 3× |
| `staleFvWithdrawSeconds` | 180s | 180s | 180s | 180s |
| `divergenceWithdrawThreshold` | 20% | 20% | 20% | 20% |

---

## Architecture

### Live Pipeline

```
Polymarket CLOB WebSocket  ← Real-time bid/ask/trade stream
    ↓
sports-bridge.ts           ← Computes midpoint, detects game start/resolution
    ↓  POST /game-event
sports-sim-server.ts       ← Routes to: state + AMM + RiskManager + GameStateParser
    ↓
LMSR.recenter() + RiskManager + CLOB  ← Quotes posted at correct price
    ↓
Synthetic traders / External PM flow   ← Trades execute against AMM
```

### Components

- `MatchingEngine` — order routing, trade execution, event broadcasting
- `OrderBook` — price-time priority CLOB
- `LMSRAMMProvider` — LMSR quoting engine; `recenter(price)` keeps internal state in sync with market
- `RiskManager` — Phase 1 mechanical + Tier 1 flow + Tier 2 market-aware defenses
- `FairValueAggregator` — Multi-source divergence detection (risk signal only, NOT in pricing path)
- `GameStateParser` — Sport-specific event parsing (Tennis, Soccer, Baseball, Basketball)
- `FeeCalculator` — probability-weighted dynamic fees
- `RebatePool` — maker incentive distribution

---

## Auction MM Proof of Concept — Engine-Backed CLOB Results

### Context

The MM went through multiple iterations on the auction sim:
1. **Old fake sim** (constant-spread AMM, 100% flow through MM): **-$4,243 net loss**
2. **Engine-backed CLOB** (real `MatchingEngine` + `LMSRAMMProvider` + `RiskManager`): **+$1,063 profit**

The rewrite to the actual engine flipped the MM from a net loser to profitable. This is the architecture that carries forward to sports.

### Full Results: René Engel Wine Collection (Sale 31341)

**Auction**: 30 lots, actual hammer prices from Christie's
**Outcomes**: 18 of 30 lots resolved NO (below high estimate)

| Name | Bias | P&L | Trades | Volume |
|------|------|-----|--------|--------|
| **LMSR MARKET MAKER** | — | **+$1,063** | 49,783 | $7,015 |
| Semi-Pro Dave | NO | +$247 | 14,444 | $1,039 |
| Degen Greg | NO | +$155 | 16,276 | $580 |
| Noise Trader Jan | NO | +$107 | 15,846 | $395 |
| Retail Eve | NO | +$77 | 6,694 | $328 |
| Degen Helen | YES | +$26 | 13,318 | $417 |
| Retail Frank | YES | -$18 | 11,989 | $455 |
| Semi-Pro Carol | YES | -$126 | 18,108 | $1,122 |
| Insider Bob | YES | -$326 | 11,259 | $1,804 |
| Insider Alice | YES | -$533 | 13,275 | $2,775 |
| Whale Insider Ian | YES | -$671 | 21,752 | $3,061 |

**Trade routing**: 48.3% P2P / 51.7% AMM across 96,372 total trades.

### Why the MM Was Profitable

1. **Real CLOB enabled P2P matching** — 48.3% of trades bypassed the MM entirely. The old fake sim routed 100% through the MM, giving it far more adverse selection exposure.

2. **Phase 1 risk controls prevented blowups**:
   - Position caps ($5,000 max) stopped dangerous directional accumulation
   - Inventory-skewed spreads widened on the overexposed side
   - Per-trade size limits ($500 max) blocked large informed fills
   - Time-based withdrawal pulled quotes in the final 10s

3. **YES-biased insiders lost money** — With 18/30 lots resolving NO, the informed traders who bought YES at elevated prices saw those shares expire worthless. Alice (-$533), Bob (-$326), and Ian (-$671) all took directional losses.

4. **LMSR pricing was more accurate** than the constant-spread model, producing tighter spreads that earned more per round-trip.

### The Key Lesson for Sports

The inversion from -$4,243 to +$1,063 came from three things:
- **Real P2P matching** reduces adverse selection (MM doesn't take every trade)
- **Risk controls** are integrated natively, not bolted on as heuristics
- **Accurate pricing** (LMSR) means the MM isn't systematically selling underpriced shares

All three carry directly to sports markets.

### Projected Sports ROI

Wine auction: +$1,063 on $9,495 volume = **11.2% return on volume**

Conservative sports estimate at 1-2% return on volume:
- $50K game volume → $500–1,000 per game
- $200K game volume → $2,000–4,000 per game
- 5 games/day → $2,500–20,000/day

---

## Pragmatic Rollout Plan

### Phase 1: Pre-Game Spread Capture
- Connect Betfair/Pinnacle odds feed
- Wire up Polymarket API for order submission
- Quote pre-game markets with LMSR, 2-3% half-spread
- No live game trading, no speed requirements
- **Goal**: Validate profitability on spread capture alone

### Phase 2: Live Game MM (Mid-Tier Markets)
- Add Betfair streaming for real-time fair value
- Implement game state parser for probability updates
- Target tennis, soccer, college sports
- Widen spreads during high-volatility moments
- **Goal**: Validate live event adaptation

### Phase 3: Scale + Optimize
- Add multi-market portfolio risk management
- Cross-market hedging (game vs. series, player vs. team)
- Tune RiskManager parameters per sport/market type
- Consider co-location for marquee games
- **Goal**: Consistent daily profitability

---

## Engine Source Code

```
engine-src/
├── types.ts                — Core data structures (Order, Trade, Market, Side, OrderType)
├── orderbook/
│   └── OrderBook.ts        — Price-time priority CLOB for a single binary market
├── matching/
│   └── MatchingEngine.ts   — Central matching engine, manages all order books
├── amm/
│   └── LMSR.ts             — LMSR AMM with recenter() for real-time price tracking
├── mm/
│   └── RiskManager.ts      — Phase 1 + Tier 1 + Tier 2 defense stack
├── pricing/
│   └── FairValueAggregator.ts — Multi-source divergence detection (risk only)
├── sports/
│   ├── GameStateParser.ts  — Sport-agnostic game state interface
│   ├── TennisParser.ts     — Tennis-specific event parsing
│   ├── SoccerParser.ts     — Soccer-specific event parsing
│   ├── BaseballParser.ts   — Baseball-specific event parsing
│   └── BasketballParser.ts — Basketball/hockey event parsing
├── fees/
│   ├── FeeCalculator.ts    — Polymarket-style dynamic probability-weighted fees
│   └── RebatePool.ts       — Maker rebate distribution system
└── index.ts                — Main entry point

scripts/
├── sports-sim-server.ts    — Simulation server (engine + AMM + risk + HTTP API)
├── sports-bridge.ts        — Data bridge (Polymarket WS → sim server)
├── games.json              — Active market configuration
├── discover-games.ts       — Polymarket market discovery + selection
├── performance-tracker.ts  — Real-time P&L and edge dashboard
└── run-persistent.sh       — Background runner with sleep prevention
```

### Key Classes

**`MatchingEngine`** — Manages order books for all markets. Submit orders, cancel orders, query state. Broadcasts trade events to subscribers.

**`OrderBook`** — In-memory price-time priority book. Supports GTC, GTD, FOK, FAK order types. Post-only flag for makers.

**`LMSRAMMProvider`** — Injects passive bid/ask orders into the CLOB. The critical method is `recenter(price)` which updates the internal LMSR state (`qYes = b × ln(p/(1-p))`) so that `getYesPrice()` returns the current market price. On large price jumps (>3¢), all stale quotes are cancelled before new ones are posted. Refreshes every 5s via interval and immediately on price jumps.

**`RiskManager`** — Three-tier defense stack:
- Phase 1: net caps, gross caps, inventory skew, time withdrawal, size limits
- Tier 1: VPIN spread widening, per-wallet toxicity scoring, Bayesian prior shifting
- Tier 2: stale FV detection, midpoint divergence circuit breaker, pre-game spread multiplier, sport-specific game signals

**`FairValueAggregator`** — Tracks odds from multiple sources, detects divergence as a risk signal. Explicitly NOT in the pricing path — the AMM and RiskManager get their price directly from `state.fairValue`, not from the aggregator.

**`FeeCalculator`** — Dynamic fees: `fee = C × p × feeRate × (p × (1-p))^exp`. Bell curve — max ~1.56% at 50/50, near-zero at extremes.

---

## Running the Engine Locally

```bash
cd "sports MM"
npm install
npx tsx engine-src/index.ts
```

The engine starts on port 8080 with:
- HTTP API: `GET /markets`, `GET /markets/:id/orderbook`, `GET /markets/:id/trades`
- WebSocket: Real-time trade and book updates
- LMSR AMM: Auto-quoting on all registered markets
- RiskManager: Phase 1 defenses active

### Environment Variables

```env
PORT=8080
FEE_RATE=0.0175
MM_POSITION_CAP_USDC=5000000000      # $5,000 per market
MM_MAX_FILL_USDC=500000000            # $500 per trade
MM_WITHDRAWAL_WINDOW=60               # Pull quotes 60s before resolution
MM_BASE_HALF_SPREAD=0.02              # 2¢ base half-spread
MM_SKEW_PER_UNIT=0.01                 # 1¢ additional per $500 exposure
```

---

## Live Simulation Results (March 2026)

### Sim Architecture

The simulation runs against **real Polymarket CLOB data** via WebSocket. The bridge streams live bid/ask prices and detected fills from Polymarket into the sim server, which runs the full engine (MatchingEngine + LMSR + RiskManager). Synthetic traders provide additional flow. External Polymarket trades are routed through the AMM as FAK orders.

### Quoting Engine Efficiency — Before vs After Fix

The critical bug was that the LMSR's internal price never updated after initialization. When Blancaneaux crashed from 27% to 6% on the real Polymarket CLOB, the AMM continued quoting around 27%. Every external trade adversely selected the AMM at massively wrong prices.

| Metric | Broken | Fixed | Delta |
|--------|--------|-------|-------|
| Gojo match P&L | -$29.20 | +$57.69 | **+$86.89** |
| Gojo edge (bps) | -517 | +266 | **+783 bps** |
| Price gap (LMSR vs market) | 18¢ | 0¢ | **Eliminated** |
| Number of "price" values in system | 6 | 1 | **83% reduction** |
| Fills at stale prices | 51 | 0 | **100% eliminated** |
| Defense activations (useful) | 305 divergence (too late) | 89 VPIN, 47 Bayesian (proactive) | Defenses now prevent, not react |

### Per-Market Performance (Latest Session)

| Market | Sport | Phase | P&L | Volume | Fills | Edge (bps) |
|--------|-------|-------|-----|--------|-------|------------|
| Blancaneaux vs Gojo | Tennis | Live | +$57.69 | $2,173 | 102 | +266 |
| Cavaliers vs Magic | Basketball | Pre-game | +$0.52 | $1 | 3 | +5,977 |
| Medvedev vs Michelsen | Tennis | Pre-game | -$42.17 | $181 | 11 | -2,329 |
| **Total** | | | **+$16.04** | **$3,999** | **116** | **+40** |

### Defense Activation Summary

| Defense | Gojo (Live) | Cavaliers (Pre) | Medvedev (Pre) |
|---------|-------------|------------------|----------------|
| VPIN triggers | 89 | 0 | 20 |
| Bayesian shifts | 47 | 0 | 6 |
| Stale FV withdrawals | 0 | 3 | 0 |
| Divergence withdrawals | 0 | 0 | 17 |

The Gojo market (live tennis) shows healthy defense activation: VPIN fired 89 times to widen spreads during one-sided flow, Bayesian shifting adjusted the quoting center 47 times. Zero stale-FV or divergence withdrawals because the price feed was working correctly.

The Cavaliers market (pre-game, no live data flowing yet) correctly pulled quotes via stale-FV withdrawal after 180s without an update — the defense worked as designed.

---

## Live Trading Architecture

### Production Pipeline

```
Polymarket CLOB WS ──→ sports-bridge.ts ──→ live-trading-server.ts
     (prices)               (POST /game-event)     │
                                                    ├─ state.fairValue (single source of truth)
                                                    ├─ RiskManager.notifyFairValue()
                                                    ├─ computeQuotes() (LMSR logic + risk spreads)
                                                    └─ OrderManager.updateQuotes()
                                                         └─ PolymarketClient.placeOrder()
                                                              └─ @polymarket/clob-client
                                                                   └─ Polymarket CLOB REST API
```

### Components

| File | Role |
|------|------|
| `engine-src/live/PolymarketClient.ts` | Wraps `@polymarket/clob-client`. Handles wallet setup, EIP-712 signing, L1→L2 auth, order submission, cancellation, kill switch. |
| `engine-src/live/OrderManager.ts` | Tracks live order IDs per market. Handles cancel-and-replace on every quote refresh. Rate limits order flow. |
| `scripts/live-trading-server.ts` | Main entry point. Loads games, initializes risk managers, runs the quote loop, receives price updates from bridge. |
| `scripts/setup-approvals.ts` | One-time on-chain setup: approves USDC and CTF tokens for the Polymarket exchange contract on Polygon. |
| `scripts/sports-bridge.ts` | Read-only bridge: streams Polymarket CLOB WebSocket data and POSTs odds/score updates to the live server. |

### Safety Layers

| Layer | Mechanism |
|-------|-----------|
| Dry-run default | Server starts in DRY RUN mode. Must pass `--live` flag for real orders. |
| Kill switch | `POST /kill` or automatic on max loss. Cancels all orders, refuses new ones. |
| Max loss limit | Configurable via `--max-loss`. Default $500. |
| Graceful shutdown | SIGINT/SIGTERM → cancel all orders before exit. |
| Uncaught exception | Cancel all orders, then exit. |
| Rate limiting | 200ms minimum between order submissions. |
| Position caps | RiskManager enforces gross position limits per market. |
| Stale FV withdrawal | Pulls all quotes if no price update in 180s. |

### Going Live Checklist

1. Fund wallet with USDC on Polygon and small amount of POL for gas
2. Run `npx tsx scripts/setup-approvals.ts` (one-time USDC + CTF approval)
3. Start bridge: `npx tsx scripts/sports-bridge.ts`
4. Start dry run: `npx tsx scripts/live-trading-server.ts`
5. Verify quotes via `curl http://localhost:8081/health`
6. When ready: `npx tsx scripts/live-trading-server.ts --live --max-loss 200`
