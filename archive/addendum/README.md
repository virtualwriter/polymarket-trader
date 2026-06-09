# Addendum: Missing Context for the Sports MM

**Legacy note:** This directory is auction-simulation context from a separate project. It is not loaded by the USA production hourly trader, exit scanner, heatmap generation, or Hyperliquid hybrid bot.

This folder contains code and results from the auction project that the main `sports MM` repo doesn't include. An AI agent reviewing only `engine-src/` and `scripts/` will miss that these defenses **already exist** — they just weren't ported into `RiskManager.ts`.

---

## What the agent is right about

The `RiskManager` class (`engine-src/mm/RiskManager.ts`) is purely mechanical:
- Hard position caps
- Linear inventory-skewed spreads
- Timer-based quote withdrawal
- Per-trade size limits

It has **zero external signals** — no counterparty identification, no VPIN, no Betfair delta, no game state awareness. The agent's critique is correct on that point.

## What the agent is missing

Three additional defense layers were built and validated in the auction project. They live in the **sim layer**, not in `RiskManager`:

### 1. VPIN-Based Spread Widening (Implemented)

**File**: `monte-carlo-tier1.ts`, lines 470-473

Tracks the last 20 fills per market. If >75% are one-sided (all buys or all sells), the spread multiplier jumps to 2.5x. This fires ~3,051 times per auction on average across 10,000 Monte Carlo runs.

```typescript
const rs = recentSides.get(mktId);
if (rs && rs.length >= 8) {
  const yesFrac = rs.filter(s => s === 0).length / rs.length;
  if (yesFrac > 0.75 || yesFrac < 0.25) { mult *= 2.5; }
}
```

### 2. Per-Wallet Toxicity Scoring (Implemented)

**File**: `monte-carlo-tier1.ts`, lines 475-479 (blanket) and 487-515 (inventory-aware)

Tracks each wallet's correct-side rate across resolved markets:
- 3+ markets at >70% accuracy → 3x spread multiplier
- 5+ markets at >80% accuracy → refuse fill entirely (P2P only)

The inventory-aware variant only activates when the toxic wallet's trade **increases** the MM's existing exposure. Trades that reduce exposure are welcomed at a mild 1.3x premium.

```typescript
// Blanket mode
if (acct.totalResolvedLots >= 3 && acct.correctSideCount / acct.totalResolvedLots > 0.7) { mult *= 3.0; }
const refuse = acct.totalResolvedLots >= 5 && acct.correctSideCount / acct.totalResolvedLots > 0.8;

// Inventory-aware mode (surgical)
const isToxic = acct.totalResolvedLots >= 3 && acct.correctSideCount / acct.totalResolvedLots > 0.65;
const tradesIntoExposure = (mmNetYes > 0 && tradeIncreasesMMYes) || (mmNetYes < 0 && tradeIncreasesMMNo);
if (!tradesIntoExposure) return { spreadMult: 1.3, refuse: false }; // reducing exposure = ok
if (isVeryToxic && exposurePct > 0.25) return { spreadMult: 4.0, refuse: true }; // P2P only
```

### 3. Bayesian Prior Shifting (Implemented)

**File**: `monte-carlo-tier1.ts`, lines 518-548

Two variants:
- **Blanket**: If >65% of recent fills are one-sided, shift the MM's quoted midpoint 0.5¢ toward flow direction each tick.
- **Inventory-aware**: Only shifts when the MM is heavily exposed (>35% of position is directional).

```typescript
// Blanket: shift midpoint toward detected flow
if (yf > 0.65) mkt.baseBias = Math.min(0.95, mkt.baseBias + 0.005);
else if (yf < 0.35) mkt.baseBias = Math.max(0.05, mkt.baseBias - 0.005);

// Inventory-aware: only when heavily exposed
if (exposurePct < 0.35) continue; // not exposed enough to bother
const shift = 0.001 * exposurePct;
```

---

## 10,000 Monte Carlo Results (3 modes compared)

From `monte-carlo-tier1-results.md`:

| Metric | Blind | Blanket T1 | Inventory T1 |
|--------|-------|------------|--------------|
| **Mean P&L** | **$3,575,681** | **$780,136** | **$2,554,341** |
| **Win Rate** | **100.0%** | **83.2%** | **91.2%** |
| Worst | $401,936 | -$2,271,967 | -$6,019,880 |
| Defense activations | — | 25,634 | 3,478 |

On this specific auction (17/26 lots NO), Blind won because the structural edge dominated. But the inventory-aware mode preserved 71% of the structural edge while providing downside protection.

## Phase 1 Defenses (in RiskManager) — Separate 10K Run

From `marketmodel-phase1.md`:

| Metric | Phase 1 (defended) | Blind (baseline) | Improvement |
|--------|-------------------|-----------------|-------------|
| **Mean P&L** | **-$2,730** | -$18,921 | +86% |
| **Win Rate** | **39.1%** | 17.6% | +21.5pp |
| **Worst** | -$8,510 | -$79,146 | +89% |
| Cap blocks | 135.4/auction | — | — |

## Engine-Backed CLOB (Real Auction)

From `MM-IMPROVEMENT-PLAN.md`:

| Entity | P&L | Trades |
|--------|-----|--------|
| **LMSR MARKET MAKER** | **+$1,063** | 49,783 |
| Trade routing: 48.3% P2P / 51.7% AMM | | 96,372 total |

---

## What still needs to be built for sports

The existing defenses handle **internal risk** (inventory, flow patterns, wallet history). For sports, you also need **external risk signals**:

| Signal | What it does | Where it plugs in |
|--------|-------------|-------------------|
| Betfair delta | Compare MM's price to Betfair exchange. If diverged >2%, widen or withdraw. | `RiskManager.shouldWithdraw()` or new `shouldWiden()` |
| Fill velocity | Track fills/second. If spike detected, widen spreads. | New method on `RiskManager` |
| Size clustering | Detect when fills cluster near `maxFillSizeUsdc` (order splitting). | `RiskManager.recordFill()` |
| Game state | Score changes, quarter transitions → immediate spread widening. | `sports-bridge.ts` → `RiskManager` |

The VPIN, toxicity scoring, and Bayesian logic from `monte-carlo-tier1.ts` need to be ported INTO `RiskManager.ts` as a first step. The external signals (Betfair delta, game state) are the new additions.

---

## Files in this folder

| File | What it contains |
|------|-----------------|
| `monte-carlo-tier1.ts` | Full 10K Monte Carlo with VPIN, toxicity scoring, Bayesian — 3 mode comparison |
| `adversarial-10k-phase1.ts` | 10K Monte Carlo with Phase 1 mechanical defenses (position caps, skew, etc.) |
| `pre-auction-sim-server.ts` | The engine-backed sim server (real MatchingEngine + LMSR + RiskManager) that produced the +$1,063 result |
| `MM-IMPROVEMENT-PLAN.md` | Full improvement plan with all results, scenario analysis, and the engine-backed CLOB section |
| `monte-carlo-tier1-results.md` | 10K results: Blind vs Blanket T1 vs Inventory-Aware T1 |
| `marketmodel-phase1.md` | 10K results: Phase 1 mechanical defenses vs Blind |
| `marketmodel-compare.md` | Head-to-head: Blind vs Phase 1 on 10K fresh auctions |
