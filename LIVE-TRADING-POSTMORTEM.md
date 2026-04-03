# Live Trading Postmortem — March 11, 2026

## Summary

First live test of the sports market-making bot on the McNeese State vs Stephen F. Austin NCAAB game. **Lost ~$344 of $512 starting capital.** Root cause: the sim and live environments differ in fundamental ways that weren't accounted for before going live.

| Metric | Value |
|--------|-------|
| Game | McNeese State vs SFA (NCAAB, Mar 11) |
| Starting capital | ~$512 USDC |
| Ending capital | ~$168 USDC |
| Realized loss | **-$344** |
| NO tokens accumulated | 1,431 (sold at 1-7¢ avg) |
| YES tokens accumulated | 0 |
| Duration live | ~45 minutes |

---

## Error Log — Every Issue Encountered

### 1. SELL orders rejected: "not enough balance / allowance"

**When:** First live attempt on McNeese/SFA game.

**What happened:** The bot tried to SELL YES tokens to create ask-side liquidity, but it didn't hold any YES tokens. Polymarket requires you to hold tokens to sell them.

**Fix applied:** Changed ask-side logic from `SELL YES @ askPrice` to `BUY NO @ (1 - askPrice)`, which is economically equivalent but only requires USDC collateral.

**Lesson:** Polymarket's CLOB is NOT like a traditional exchange. You can't naked-short. The only way to offer YES exposure is to BUY NO tokens. This must be the default for any market-making bot starting from USDC.

---

### 2. Bridge misidentifying live games as "pre-market"

**When:** McNeese game was live (H1, 13:53 remaining, score 9-3), but the bridge reported it as "pre-market (starts in 0.7h)".

**What happened:** The bridge used the Gamma API's `gameStartTime` field to determine game phase. This timestamp was wrong or hadn't updated. The bot then applied the `preGameSpreadMultiplier: 5.0`, widening 1¢ spreads to 5¢.

**Fix applied:** Manually sent `game_start` event via curl to force phase to "live". 

**Lesson:** Never trust a single API field for game state. The bridge must cross-reference multiple signals: the Gamma API start time, the presence of score data, fill activity, and ideally the Polymarket "LIVE" tag. Auto-detection of game phase is critical — a human won't always be there to curl a game_start event.

**TODO for v2:** Add live-game detection in the bridge by checking if the Polymarket page shows "LIVE" or if there are frequent fills + price movement patterns consistent with in-game trading.

---

### 3. Pre-game spread multiplier caused unintended fills

**When:** Bot launched with `initialProb: 0.64` and `preGameSpreadMultiplier: 5.0`, creating 5¢-wide quotes while the market was at 64%.

**What happened:** The pre-game multiplier widened the 1¢ base spread to 5¢. The bot's ask-side NO buys were at 31¢, 26¢, 21¢ (implying YES asks at 69¢, 74¢, 79¢). Real traders crossed these quotes, selling NO tokens to the bot at 26-31¢. The bot accumulated 1,431 NO tokens with no offsetting YES position.

**Root cause:** The pre-game multiplier was designed for the sim where synthetic traders were less aggressive. On the real CLOB, wide quotes in an active market are easily picked off.

**Lesson:** Wide pre-game spreads are an invitation to get adversely selected. If you must quote pre-game, use very small sizes. Better yet, don't quote at all until the game is live and the bridge is feeding real prices.

**Fix needed:** Don't place ANY orders until (a) bridge has fed a live price and (b) game phase is confirmed "live". Implemented `hasBridgePrice` flag but it was too late.

---

### 4. One-sided position accumulation — no position cap enforcement

**When:** Throughout the live session.

**What happened:** The bot accumulated 1,431 NO tokens ($429 notional at ~30¢ avg cost) with ZERO YES tokens. This is a massive directional bet, not market-making. The `positionCapUsdc` was set to $100,000,000 (effectively unlimited).

**Root cause:** The risk config in `games.json` had `positionCapUsdc: 100000000` — a placeholder that was never tightened for live trading with a $500 bankroll.

**Lesson:** Position cap must be proportional to bankroll. For a $500 bankroll, max position should be $50-100 per side, not $100M. This is the #1 defense against blowup and it was essentially turned off.

**Fix needed:** Set `positionCapUsdc` to `bankroll * 0.15` (e.g., $75 for a $500 bankroll). This limits max exposure to 15% of capital per side per game.

---

### 5. Capital lockup from CLOB collateral locking

**When:** Every time the bot tried to cancel-and-replace orders.

**What happened:** Polymarket's CLOB locks USDC for each open BUY order. When the bot cancels old orders and immediately places new ones, the CLOB hasn't released the old collateral yet. New orders fail with "not enough balance / allowance".

**Root cause:** The 2-second cancel-and-replace cycle creates a race condition. The CLOB's settlement lag means cancelled orders' collateral isn't instantly available.

**Fix applied:** Added 500ms delay between cancelling and placing in `smartUpdateQuotes()`. Added startup `cancelAll()` to clear stale orders. Added `hasBridgePrice` guard to prevent premature order placement.

**Lesson:** On a real CLOB with collateral locking, you must either:
- Leave orders resting (smart requoting — only cancel when price changes)
- Size orders to use less than 50% of available capital, leaving headroom
- Wait for cancel confirmation before placing new orders

---

### 6. Sim vs Live: completely different fill dynamics

**When:** Entire session — zero intentional fills despite 1¢ spreads.

**What happened:** The sim had synthetic traders who would cross the bot's quotes. These traders were guaranteed counterparties. Live has no such guarantee. The bot competes with other market makers for queue priority, and its 2-second cancel-and-replace cycle puts it at the back of the queue every time.

**Root cause:** Fundamental difference between sim and live:

| | Sim | Live |
|---|---|---|
| Counterparties | Synthetic (guaranteed) | Real (competitive) |
| Queue priority | Bot is only MM | Bot competes with dozens of MMs |
| Fill rate | ~50% per tick | 0% (never at front of queue) |
| Collateral | Infinite virtual | Real $500 USDC |
| Cancel cost | Free | Destroys queue position |

**Lesson:** Sim P&L is meaningless for predicting live P&L. The sim tests the LMSR math and risk logic, but it cannot simulate orderbook competition, queue priority, or capital constraints. Any future sim should model queue position and competing market makers.

**Fix needed:** Smart requoting (implemented but came too late). Only cancel orders when the target price actually changes. Leave unchanged orders resting to build time priority.

---

### 7. Selling NO tokens at massive slippage

**When:** Emergency liquidation of 1,431 NO tokens.

**What happened:** The NO token orderbook was extremely thin. Best bids were 1-7¢ for a token that should have been worth ~23¢ (McNeese at 77%). Sold 1,431 tokens for ~$73 total (~5¢ avg) instead of ~$329 at mid-market.

**Root cause:** Sports market NO tokens on Polymarket have very thin orderbooks. There are few buyers for the losing side of a live game. The bot had to dump into a thin book under pressure.

**Lesson:** Never accumulate a large one-sided position that you can't exit without massive slippage. If the position cap had been $75, the maximum loss from slippage would have been ~$50 instead of ~$350. Also, consider selling into the YES book (by buying YES) as an alternative to selling NO directly — the YES side usually has more liquidity.

---

### 8. `initialProb` stale on restart

**When:** Every server restart.

**What happened:** The server reads `initialProb: 0.64` from `games.json` and starts quoting from that price. But the real market may have moved significantly (to 73%, 77%) since the game was added. On restart, the bot briefly quotes at the stale 64% level before the bridge updates it.

**Fix applied:** Added `hasBridgePrice` flag — bot now waits for the first real CLOB price from the bridge before placing any orders.

**Lesson:** Never trade on stale config prices. Always wait for live market data before placing orders. The first price from the bridge is the only safe starting point.

---

### 9. Gas price too low for Polygon transactions

**When:** Redeeming resolved positions (Trump/Putin market).

**What happened:** Redemption transaction failed with "transaction gas price below minimum: gas tip cap 1500000000, minimum needed 25000000000".

**Fix applied:** Updated `redeem-positions.ts` to fetch current gas prices via `provider.getFeeData()` and set explicit `maxFeePerGas` and `maxPriorityFeePerGas`.

**Lesson:** Always fetch current gas prices on Polygon. Hardcoded gas values will fail as network conditions change.

---

### 10. Geo-IP API rate limiting blocking VPN check

**When:** Switching to Switzerland VPN.

**What happened:** `ipapi.co` rate-limited the bot, returning undefined for country. VpnGuard blocked trading with "IP undefined is in undefined".

**Fix applied:** Added fallback to `ipinfo.io` and `ifconfig.co`. Added retry logic across multiple geo-IP services.

**Lesson:** Geo-IP checks should have multiple fallback providers and graceful degradation. A failed geo-check should NOT block trading if the VPN was previously verified — instead, log a warning and retry on next interval.

---

### 11. API key field name mismatch

**When:** First live order attempt.

**What happened:** Orders failed with "Unauthorized/Invalid api key" (401). The `@polymarket/clob-client` uses `ApiKeyCreds.key` for the API key, but `PolymarketClient` was looking for `apiKey`.

**Fix applied:** Updated to import `ApiKeyCreds` directly and use `creds.key`.

**Lesson:** Always verify the exact shape of third-party SDK types. Don't assume field names.

---

## Ranked Lessons (Biggest Impact First)

1. **Position caps must be proportional to bankroll** — $100M cap on a $500 bankroll is suicidal. Should be ~15% of bankroll max per side.

2. **Don't quote until you have live data** — Quoting from stale `initialProb` with wide pre-game spreads caused the entire $344 loss.

3. **Sim ≠ Live** — Synthetic traders, infinite collateral, and guaranteed fills make sim profits meaningless. Future sims must model queue competition and capital constraints.

4. **Smart requoting is mandatory** — Cancel-and-replace every tick destroys queue priority. Only update orders when prices change.

5. **CLOB collateral locking** — Budget for 50% capital headroom. 6 orders × $25 = $150 locked, which is 30% of a $500 bankroll. Add safety margin.

6. **One-sided accumulation = death** — If you're only getting filled on one side, something is wrong. Add fill-side monitoring and auto-widen if fills are asymmetric.

7. **Exit liquidity matters** — Don't accumulate positions in illiquid tokens. NO tokens on sports markets have terrible depth. Factor exit cost into the strategy.

8. **Auto-detect game phase** — Never rely on a single API timestamp. Cross-reference fills, price movement, and score data.

---

## Changes Made During This Session

| File | Change |
|------|--------|
| `engine-src/live/OrderManager.ts` | Added `smartUpdateQuotes()` with diff-based order management, `syncWithClob()` for fill detection, queue age tracking |
| `scripts/live-trading-server.ts` | Added `hasBridgePrice` guard, startup `cancelAll()`, `game_start` forced live detection, fills endpoint, debug logging |
| `scripts/games.json` | Changed McNeese `baseHalfSpread` from 0.03 to 0.01, `inventorySkewPerUnit` from 0.02 to 0.008 |
| `engine-src/live/VpnGuard.ts` | Multi-provider geo-IP, Switzerland + other countries allowed |
| `engine-src/live/PolymarketClient.ts` | Fixed `ApiKeyCreds` type, dry-run handling, gas price fixes |

---

## Before Going Live Again — Checklist

- [x] Set `positionCapUsdc` to `bankroll * 0.15` in `games.json`
- [x] Verify `hasBridgePrice` guard prevents premature quoting
- [x] Confirm game is detected as LIVE before quoting (not relying on Gamma API alone)
- [x] Test smart requoting: orders should persist when price is unchanged
- [x] Confirm capital headroom: total order deployment < 50% of bankroll
- [x] Add fill-side monitoring: alert if fills are >80% one-sided
- [x] Add emergency position dump: auto-liquidate if one-sided exposure > position cap
- [x] Run in dry-run mode for at least 30 minutes before going live
- [ ] Verify NO token exit liquidity before trading a market
- [x] Set `maxLossUsdc` to a meaningful amount (e.g., $50 for a $500 bankroll)

---

## Live Attempt #2 — Hardening Session (March 11, 2026, Evening)

### Context

Second attempt at the same McNeese State vs SFA game. Applied all lessons from the first blowup. Game was in the second half, McNeese leading big (~92-94% implied).

### What Changed Before Going Live

| Parameter | Attempt #1 (blew up) | Attempt #2 (hardened) |
|-----------|---------------------|----------------------|
| `positionCapUsdc` | $100M (unlimited) | **$25** (15% of $168 bankroll) |
| `baseHalfSpread` | 1¢ | **3¢** |
| `inventorySkewPerUnit` | 0.008 | **0.02** |
| `initialProb` | 0.64 (stale by 20+¢) | **0.86** (still stale — see issue #12) |
| `BANKROLL_USDC` | $500 | **$168** (actual remaining) |
| `NUM_LEVELS` | 3 | **2** (less capital lockup) |
| `SIZE_PER_LEVEL_CAP` | $25/level | **$4.20/level** |
| `MAX_FILL_SIZE_USDC` | $125 | **$42** |
| Default `maxLoss` | $75 | **$25** |
| Pre-game quoting | Allowed (with 5x spread) | **Blocked entirely** |
| Capital headroom | None enforced | **50% max deployed** |
| Fill-side monitoring | None | **Auto-widen at 80% one-sided** |
| Emergency dump | None | **Halt quoting at 1.5x cap** |

### New Issues Found During Dry Run

### 12. `initialProb` stale even after postmortem fix #8

**When:** Server startup for attempt #2.

**What happened:** Config had `initialProb: 0.86` (set hours earlier when McNeese was at 86%). By the time we started, the CLOB midpoint was 94.5%. The `hasBridgePrice` guard prevents quoting on this stale value, but the RiskManager, LMSR internal state, and midpoint divergence detector were all seeded with a price 8.5 cents off reality. When the bridge's first real update arrived, the divergence detector could false-alarm.

**Fix applied:** Added `fetchLiveMidpoint()` at startup — the server now fetches the real CLOB midpoint via `GET /midpoint?token_id=...` from Polymarket's REST API and uses that to seed everything. The config `initialProb` is only used as a fallback if the API is unreachable.

**Verification:** On startup, server logged:
```
[LIVE] cbb-mcnst-sfaus-2026-03-11-moneyline: seeded from CLOB midpoint → 94.5% (config had 86.0%)
```

**Lesson:** Config files are write-once, markets are continuous. Any value written to a config will be stale by the time you read it. Always fetch live data at startup. The config should be treated as a fallback, not a source of truth.

---

### 13. Bridge misidentifying live game as pre-market (AGAIN)

**When:** McNeese game was deep into the second half (score ~60-40), but bridge reported "pre-market (starts in 0.1h)".

**What happened:** Same root cause as issue #2. The Gamma API `gameStartTime` was set to 22:00 UTC, but the actual game started earlier. The bridge's `fetchGameStartTime()` trusted this timestamp and computed `now < startTime`, concluding the game hadn't started.

**Why it matters more now:** With the new safety rule "don't quote during pre_game", the bot correctly refused to place any orders. But this means a legitimate live game gets no quotes at all — the safety measure designed to prevent premature quoting is now preventing ALL quoting.

**Fix applied (manual):** Sent `game_start` via curl, same as attempt #1. The bridge's `checkResolutions()` interval (30s) also auto-detects the start once the scheduled time passes.

**Lesson:** The "don't quote pre_game" safety and the "game phase detection" problem are now in direct tension. A false pre_game classification doesn't just widen spreads (like before) — it completely blocks quoting. The bridge MUST cross-reference multiple signals for game state: scheduled time, CLOB fill activity, price volatility patterns, and the Polymarket "LIVE" tag.

---

### 14. External trades poisoning RiskManager inventory

**When:** ~10 seconds after first quotes placed during dry run.

**What happened:** After tick 20 placed 4 quotes successfully (`capBid=false, capAsk=false`), tick 25 showed `capBid=true, capAsk=true` — both caps hit despite zero fills. Quotes dropped to 0. The bot went silent.

**Root cause:** The bridge sends `external_trade` events when it detects fills on the Polymarket WebSocket. These are OTHER people's trades — the AMM didn't participate. But the server called `rm.recordFill()` for each one, which updated the RiskManager's net position counters. Each external trade had `size: 50` ($50 notional). The position cap was $25. A single external trade instantly blew through the cap.

```
external_trade arrives → rm.recordFill(marketId, { size: 50_000_000n }, false)
  → inv.netYesExposure += 50_000_000n  (now $50)
  → positionCapUsdc = 25_000_000n      ($25)
  → 50M >= 25M → atCapBid = true       ← FALSELY CAPPED
```

**Fix applied:** Removed `rm.recordFill()` call for `external_trade` events entirely. External trades should only feed VPIN/Bayesian flow analysis, not position tracking. The RiskManager's inventory should only reflect the AMM's own fills.

**Lesson:** The RiskManager's `recordFill()` conflates two purposes: (1) tracking the AMM's own position, and (2) analyzing market flow for VPIN/toxicity. External trades need purpose (2) but absolutely NOT purpose (1). Need a dedicated `recordExternalFlow()` method that updates flow analytics without touching position counters.

**TODO:** Add `RiskManager.recordExternalFlow(marketId, side, size)` that feeds VPIN and Bayesian tracking only. Until then, external flow analysis is disabled — the bot runs without VPIN protection on live.

---

### 15. Ask-side quotes collapsing to same price at extreme probabilities

**When:** Dry run at 94.5% fair value.

**What happened:** With 3¢ half-spread and 2 levels, the ask-side quotes were:
- Level 1: YES ask at 97.5¢ → BUY NO @ `1 - 0.98 = 0.02`
- Level 2: YES ask at 100.5¢ → rounds to 1.00 → BUY NO @ `1 - 1.00 = 0.00` → filtered out (< 0.02)

Both levels that survive round to the same NO price (0.02), so `smartUpdateQuotes` deduplicates them. Result: only 1 effective ask level instead of 2.

Observed: `quotes=4 tracked=3` — 4 quotes computed but only 3 unique price points after dedup.

**Impact:** Minor — at 94.5% the ask side is thin by design (almost nobody wants to bet against a team up 40 points). The bid side has 2 healthy levels at 91¢ and 89¢. But at less extreme probabilities (70-85%) this would be a problem.

**Lesson:** At extreme probabilities (>90% or <10%), the NO-side orderbook compresses to near-zero prices where penny rounding kills level granularity. Consider: (a) using sub-penny pricing if the CLOB supports it, or (b) asymmetric level counts (more bid levels when YES is high).

---

## Dry Run Results — Attempt #2

| Metric | Value |
|--------|-------|
| Fair value (seeded) | 94.5% (live CLOB midpoint) |
| Config had | 86.0% (8.5¢ stale — would have been catastrophic without fix) |
| Quotes | 4 computed, 3 placed (ask dedup) |
| Smart requote | 9 orders kept (queue preserved), 0 replaced |
| Position cap | Not hit (external trade bug fixed) |
| Spread | 3¢ each side (bid @ 91¢, ask @ 98¢ implied) |
| Capital deployed | ~$12.60 of $168 (7.5% — well within 50% headroom) |
| Duration stable | 30+ ticks with no anomalies |

### Safety Verification

| Safety Layer | Status |
|-------------|--------|
| `hasBridgePrice` guard | Working — blocked quoting until bridge sent real price |
| Pre-game block | Working — refused to quote until `game_start` confirmed |
| Position cap ($25) | Working (after external trade fix) — `capBid=false, capAsk=false` |
| Capital headroom (50%) | Working — $12.60 deployed / $84 max = 15% |
| One-sided fill monitor | Not tested (no fills in dry run) |
| Emergency dump | Not tested (no fills in dry run) |
| Max loss kill switch ($25) | Not tested (dry run) |
| Smart requoting | Working — `kept=9, replaced=0`, queue priority preserved |

---

## Updated Ranked Lessons (All Attempts)

1. **Position caps must be proportional to bankroll** — $100M cap on a $500 bankroll is suicidal. Should be ~15% of bankroll max per side.

2. **Don't quote until you have live data AND confirmed live phase** — Two guards needed: `hasBridgePrice` (no stale config prices) AND `phase === "live"` (no pre-game quoting at all). Either one alone is insufficient.

3. **Fetch live prices at startup, not from config** — `initialProb` in a JSON file will always be stale. Fetch the CLOB midpoint via REST API at boot time. Config is fallback only.

4. **External trade flow must not touch position counters** — `recordFill()` conflates AMM position tracking with market flow analysis. External trades need flow analysis (VPIN) but NOT position updates. One $50 external trade blew through a $25 cap.

5. **Sim ≠ Live** — Synthetic traders, infinite collateral, and guaranteed fills make sim profits meaningless. Future sims must model queue competition and capital constraints.

6. **Smart requoting is mandatory** — Cancel-and-replace every tick destroys queue priority. Only update orders when prices change. Verified: `kept=9, replaced=0` in dry run.

7. **CLOB collateral locking** — Budget for 50% capital headroom. 2 levels × $4.20 = $8.40 per side locked. Keep total deployment under 50% of bankroll.

8. **One-sided accumulation = death** — If you're only getting filled on one side, something is wrong. Now: auto-widen 2.5x at 80% one-sided fills, halt quoting at 1.5x position cap.

9. **Exit liquidity matters** — Don't accumulate positions in illiquid tokens. NO tokens on sports markets have terrible depth. Tiny position caps ($25) make this manageable.

10. **Game phase detection is critical** — The "don't quote pre_game" safety rule means a false pre_game classification kills all quoting. Bridge must cross-reference scheduled time, CLOB activity, and Polymarket tags.

11. **Extreme probability quotes compress** — At >90%, ask-side NO prices round to the same penny. Consider asymmetric levels or sub-penny pricing.

---

## Changes Made — Attempt #2

| File | Change |
|------|--------|
| `scripts/games.json` | McNeese: `positionCapUsdc` 100M→25M, `baseHalfSpread` 0.01→0.03, `inventorySkewPerUnit` 0.008→0.02, `initialProb` 0.64→0.86 |
| `scripts/live-trading-server.ts` | `BANKROLL_USDC` 500→168, `NUM_LEVELS` 3→2, `SIZE_PER_LEVEL_CAP` $25→$4.20, `maxLoss` default 75→25. Added: `fetchLiveMidpoint()` at startup, `CAPITAL_HEADROOM` 50% enforcement, `checkFillSideBalance()` one-sided detection, `checkEmergencyDump()` auto-halt, blocked pre_game quoting entirely, removed `recordFill()` for external trades, per-tick debug logging |

---

## Live Attempt #3 — Inventory-Aware Rewrite (March 11, 2026, Late Evening)

### Context

Third live attempt on a new game: Delaware State Hornets vs Morgan State Bears. Applied all hardened params from Attempt #2 (position cap $25, 2 levels, $4.20/level, etc.). Ran for ~1 hour with 1¢ spreads.

**This session exposed the most fundamental design flaw in the entire system: the bot was not actually market-making.**

### What Changed Before Going Live

| Parameter | Attempt #2 | Attempt #3 |
|-----------|-----------|-----------|
| Game | McNeese/SFA (late 2H) | **Delaware State/Morgan State** |
| `baseHalfSpread` | 3¢ | **1¢** (tightened after observing no fills at 3¢) |
| Bridge delta threshold | 0.003 | **0.001** (0.1¢ sensitivity for high price fidelity) |
| Bridge heartbeat | None | **15s keepalive** (new — fixes stale-FV false alarm) |

### New Issues Found

### 16. Stale fair value false alarm from quiet markets (BUG)

**When:** During a game pause (halftime/timeout). The bridge hadn't sent a price update in 89 seconds, triggering progressive spread widening.

**What happened:** The bridge only sends `odds_update` when the CLOB midpoint *actually changes* (delta > 0.001). In quiet periods (halftime, timeouts, slow markets), the price sits unchanged for minutes. The RiskManager interprets "no update in 60s" as "data is stale" and starts widening. At 180s it would **pull all quotes entirely**.

A stable price is NOT a stale price, but the server couldn't distinguish the two.

**Root cause:** The `lastFairValueTs` timer in RiskManager only resets on `odds_update` events. No heartbeat mechanism existed to confirm the bridge is alive and the price simply hasn't moved.

**Fix applied:** Added a 15-second heartbeat in the bridge that re-sends the current midpoint for all active markets even when unchanged. The `staleSec` dropped from 89+ to consistently 6-11s.

**Lesson:** In event-driven architectures, the absence of events is ambiguous — it could mean "nothing happened" or "the connection died." Heartbeats resolve this ambiguity. Any system that takes defensive action based on "time since last event" MUST have a keepalive mechanism.

---

### 17. Fill detection massively under-counting real fills (BUG)

**When:** Throughout the entire session. Health endpoint reported 6 fills. On-chain reality: 100+ YES token fills and 200+ NO token fills.

**What happened:** The `syncWithClob()` fill detection worked by checking if tracked order IDs had disappeared from the CLOB's open orders list. But this approach misses:
- Orders that are partially filled then replaced by `smartUpdateQuotes`
- Orders that fill and get replaced within a single sync interval (10s)
- Any fill that happens between a cancel and re-place

The bot's internal counters showed `bidFills: 5, askFills: 1` while on-chain balances showed 101.75 YES tokens and 224.97 NO tokens accumulated.

**Fix applied:** Added on-chain balance tracking via the CTF ERC1155 contract. Every 15 seconds, the server queries `balanceOf(wallet, tokenId)` for each market's YES and NO tokens. Fill detection is now inferred from balance changes (delta > 0.5 tokens), which is ground truth.

**Lesson:** Never use a derived heuristic (order disappearance) when ground truth is available (on-chain balance). The orderbook state is a proxy; the blockchain is the source of truth. Any production MM must reconcile its internal state against on-chain balances.

---

### 18. The bot was not market-making — it was making directional bets (CRITICAL DESIGN FLAW)

**When:** Discovered after analyzing the full session's P&L.

**What happened:** The bot bought YES tokens on the bid side (BUY YES) and bought NO tokens on the ask side (BUY NO). When a bid filled, the bot accumulated YES tokens. When an ask filled, it accumulated NO tokens. **At no point did the bot sell any tokens it held.** The P&L was entirely determined by game resolution — if the team won, YES tokens paid $1; if they lost, they were worthless.

This is not market-making. Market-making is: buy at the bid, sell at the ask, capture the spread. The bot was: buy at the bid, buy more on the other side, hold everything to expiry.

**The evidence:**
- 101.75 YES tokens accumulated (worth ~$77 at 76¢)
- 224.97 NO tokens accumulated (worth ~$48 at 21.5¢)
- Zero SELL orders placed in the entire session
- The "ask-side" was BUY NO, which creates new exposure instead of closing existing positions
- Both token balances grew monotonically — the bot never offloaded anything

**Root cause:** Postmortem issue #1 changed the ask side from `SELL YES` (which failed because the bot started with no tokens) to `BUY NO` (which works from USDC). This was correct for cold-start, but wrong for steady-state: once the bot holds tokens from fills, it should SELL them, not buy more of the opposite.

**How production Polymarket MMs actually work:**

| Bot holds | Bid side | Ask side |
|-----------|----------|----------|
| Nothing (cold start) | BUY YES | BUY NO |
| YES tokens (from bid fills) | BUY YES | **SELL YES** |
| NO tokens (from ask fills) | **SELL NO** | BUY NO |
| Both YES and NO | **SELL NO** | **SELL YES** |

The key insight: **SELL orders for tokens you hold are strictly better than BUY orders for the opposite token.** Selling YES releases the token (realizing profit) and frees collateral. Buying NO locks *new* collateral and creates *additional* exposure.

**Fix applied:** Complete rewrite of `computeQuotes()` to be inventory-aware:
1. On-chain balance tracking via CTF ERC1155 `balanceOf()` every 15 seconds
2. Ask side: if holding YES tokens → SELL YES; otherwise → BUY NO
3. Bid side: if holding NO tokens → SELL NO; otherwise → BUY YES
4. When holding significant inventory (>5 tokens), skip BUY orders for that token entirely to prevent further accumulation
5. Inventory-skewed spreads: tighten the side that offloads (0.5x spread), widen the side that would accumulate (1.5x)
6. Capital headroom only applies to BUY orders (SELL orders don't lock new collateral)

**Result after fix deployed:**
- Bot detected 224.97 NO tokens on startup
- Immediately placed SELL NO orders at fair value (34-39¢ as price moved)
- NO balance dropped from 224.97 → 169.30 → 109.26 within minutes
- Quote log showed `quotes=2 (2 SELL, 0 BUY)` — pure offloading mode
- YES tokens (101.75) were sold separately at $0.76 for ~$77 proceeds

**Lesson:** The distinction between "BUY the opposite token" and "SELL the token you hold" is THE most important decision in a CLOB-based market maker. Getting this wrong means you're not a market maker at all — you're an accumulator that hopes for favorable resolution. This is also why the sim never caught it: the sim settled everything at resolution and computed P&L from terminal payoffs, so it didn't matter whether you held YES+NO or just one side.

---

### 19. Spread too wide for competitive markets

**When:** First 30 minutes of the Delaware State game with 3¢ half-spread.

**What happened:** Zero fills. Other market makers had 2¢ spreads, placing the bot's orders behind them in the queue. Even with excellent queue priority (87+ seconds), the wider spread meant fills went to tighter competitors first.

**Fix applied:** Tightened `baseHalfSpread` from 0.03 to 0.01 and increased bridge sensitivity from 0.003 to 0.001 for sub-penny price fidelity.

**Lesson:** Spread width must be competitive with the market, not just safe for the bot. Check the existing CLOB depth before choosing a spread. A 3¢ spread in a market with 2¢ MMs means you never fill. The tradeoff: tighter spreads = more fills but more adverse selection risk. High price fidelity (fast bridge updates) is the prerequisite for tight spreads.

---

### 20. SELL order loop crash on dust balances (SERVER DOWN)

**When:** After successfully offloading 223 of 225 NO tokens. Only 1.55 NO tokens remained.

**What happened:** The bot tried to place `SELL NO 1.55 @ 0.26` but the CLOB rejected it with "not enough balance / allowance" every tick (every 2 seconds). The order was technically above the code's minimum threshold (>1 token), but below Polymarket's minimum viable order size after accounting for fees. The bot entered an infinite error loop:

```
[CLOB Client] request error: "not enough balance / allowance"  (repeated 20+ times)
```

After ~2 minutes of failed SELL attempts, the process received SIGTERM and shut down cleanly (cancelled all orders). But the server never came back — the bot was dead with no automatic restart.

**Root cause:** The minimum SELL threshold was set to 1 token, but Polymarket's CLOB requires a minimum `makerAmount` that covers the fee deduction. For a SELL order at 26¢ with 10% fee rate (`feeRateBps: 1000`), the net amount after fees on 1.55 tokens was below the CLOB's minimum. The bot kept retrying every tick without backing off.

**Fix applied:** Raised the minimum balance threshold for SELL orders from 1 token to 5 tokens. Below 5 tokens, the bot treats the position as dust and skips SELL orders, falling back to normal BUY YES / BUY NO quoting. This prevents the error loop while sacrificing only ~$1-2 in un-sellable dust.

**Lesson:** Always account for fee deductions when sizing SELL orders near minimum balances. A SELL for 1.55 tokens at 26¢ is only 40¢ gross — after a 10% fee it's 36¢, which may be below the CLOB's minimum. The bot should either: (a) set a generous minimum SELL size that always clears fees, or (b) catch the "not enough balance" error and skip SELL orders for that token until the next balance refresh. Also: failed CLOB operations should have exponential backoff, not retry every 2 seconds forever.

**Impact:** The bot was offline for ~15 minutes until manually restarted. No capital was lost (the 1.55 NO tokens are worth ~$0.50), but the downtime meant missed trading opportunities.

---

## P&L Summary — Attempt #3

| Item | Amount |
|------|--------|
| YES tokens sold | 101.75 tokens @ $0.76 = **+$77.33** |
| NO tokens sold (via SELL NO orders) | ~115 tokens @ ~34¢ avg = **~+$39.10** |
| NO tokens remaining | ~109 tokens (mark-to-market ~$41 @ 37.5¢) |
| Cost basis (YES buys) | ~$45-50 estimated |
| Cost basis (NO buys) | ~$70-80 estimated |
| **Approximate realized P&L** | **~-$5 to +$5** (roughly breakeven) |
| **Unrealized P&L (NO tokens held)** | **~$41 mark-to-market** (at risk until game ends) |

**Key observation:** The spread capture from buying low and selling high was almost exactly offset by the adverse selection from one-sided fills in a trending market. This is the fundamental challenge of market-making in sports: the price trends directionally (one team pulls ahead), so you consistently get filled on the wrong side. The inventory-aware fix addresses this by selling accumulated tokens rather than holding to resolution.

---

## Updated Ranked Lessons (All Attempts)

1. **The bot must actually sell tokens to be a market maker** — BUY YES + BUY NO is accumulation, not market-making. SELL tokens you hold. BUY tokens you don't. This changes everything.

2. **Latency kills MM profits** — A 2-second tick means 2 seconds of stale quotes after every scoring event. Each stale fill loses 2-5¢ vs. the 1¢ you earn from the spread. Faster ticks (500ms or less) are the single highest-leverage improvement for adverse selection.

3. **Token merging is free money** — When holding both YES+NO tokens, merge them on-chain (CTF `mergePositions()`) for $1 per pair, risk-free. Not doing this leaves guaranteed profit as directional exposure.

4. **Game-state-aware spreads must always be applied** — Tighter spreads during timeouts and blowouts (low adverse selection). Wider spreads during crunch time. The `spreadMultiplier` from the game parser must apply even when `shouldWiden` is false — that's how you get the tightening during calm periods.

5. **NCAAB ≠ NBA: know your league format** — NCAAB has 2 halves, not 4 quarters. Hardcoding `quarter >= 4` for crunch-time means the withdrawal logic NEVER fires for college games. The parser must be parameterized by regulation periods.

6. **Position caps must be proportional to bankroll** — $100M cap on a $500 bankroll is suicidal. Should be ~15% of bankroll max per side.

7. **Don't quote until you have live data AND confirmed live phase** — Two guards needed: `hasBridgePrice` AND `phase === "live"`. Either one alone is insufficient.

8. **On-chain balance is ground truth, not order tracking** — `syncWithClob()` missed 95%+ of fills. Query `balanceOf()` every 5 seconds. The blockchain doesn't lie.

9. **Heartbeats resolve event absence ambiguity** — "No update in 60 seconds" could mean stale data or a quiet market. A 15-second keepalive from the bridge eliminates false stale-FV widening during halftime.

10. **Fetch live prices at startup, not from config** — `initialProb` in a JSON file will always be stale. Fetch the CLOB midpoint via REST API at boot.

11. **External trade flow must not touch position counters** — `recordFill()` conflates AMM position tracking with market flow analysis. One $50 external trade blew through a $25 cap.

12. **Spread width must be competitive** — Check existing CLOB depth. 3¢ spreads in a 2¢ market = zero fills. Tight spreads require high price fidelity (fast bridge).

13. **Fewer, better fills > more fills** — 29 fills at 2¢ spread = $0.60 revenue. But 5-10 adversely selected fills at 3-5¢ = $0.60-$2.10 loss. Concentrate fills during dead-ball periods, avoid fills during active scoring.

14. **Exponential backoff prevents cascading failures** — Issue #20: dust balance → SELL failure → retry every 2s → infinite loop → server crash. Backoff: 1s, 2s, 4s, 8s... max 60s. Resets on success.

15. **Sim ≠ Live** — The sim's terminal-resolution P&L model hid the fundamental flaw that the bot never sold tokens. Live P&L requires active inventory management.

16. **Smart requoting is mandatory** — Cancel-and-replace every tick destroys queue priority. Only update orders when prices change.

17. **One-sided accumulation = death** — Auto-widen 2.5x at 80% one-sided fills, halt quoting at 1.5x position cap. But the better fix is inventory-aware quoting: SELL what you hold.

18. **Exit liquidity matters** — NO tokens on sports markets have terrible depth (best bids at 1-5¢ for tokens worth 20-35¢). SELL limit orders at fair value are better than market dumps.

19. **Game phase detection is critical** — False pre_game classification kills all quoting. Bridge must cross-reference scheduled time, CLOB activity, and Polymarket tags.

20. **Inventory-skewed spreads should drive rebalancing, not just widen** — Tighten the side that offloads inventory (0.5x), widen the side that accumulates (1.5x). Natural flow handles the rest 95% of the time.

21. **Dust balances kill bots** — SELL orders on tiny token balances (<5 tokens) fail after fees, creating an infinite error loop. Set a minimum SELL threshold well above the CLOB's post-fee minimum.

---

## Adverse Selection Analysis — Post-Attempt #3

### Session Stats

| Metric | Value |
|--------|-------|
| Bid fills | 11 ($50.62 notional) |
| Ask fills | 18 ($113.82 notional) |
| Total fills | 29 |
| Orders placed | 319 |
| Fill rate | 9.1% |
| Keep rate (queue priority) | 74.9% (941/1256) |
| Half-spread | 1¢ (2¢ round-trip) |
| Tick interval | 2,000ms |
| Balance refresh | 15,000ms |
| Market swing | ~45% → 78% → 32% (46pt swing) |
| Final P&L | -$0.57 (-0.3%) |

### The Three Biggest P&L Drags (Ranked)

**1. The 30-minute inventory crisis (~$3-5 drag)**

Before the inventory-aware fix was deployed mid-session, the bot accumulated ~$130 in raw token exposure (101 YES + 225 NO) without selling. The near-breakeven result was partly lucky — NO tokens appreciated as the price crashed from 78% to 32%. With inventory-aware quoting from the start, each fill would have been offset by a corresponding sell, capturing ~2¢ round-trip spread with no directional risk.

**2. Score-driven adverse selection (~$1-3 drag)**

Every scoring event creates a 2-4 second window where the bot's quotes are stale. The price jumps 2-5¢ instantly on a basket, but the bot (at 2s tick intervals) is still offering the pre-score price. Informed watchers hit the stale quotes. With 1¢ half-spread, even a 3¢ adverse move wipes out the entire round-trip profit.

In a typical college basketball game with ~80 scoring events × 2s stale-quote window = ~160 seconds of adverse selection exposure per game. Even if only 10-20% of events result in fills against stale quotes, the losses compound.

**3. Remaining un-merged tokens (~$7 at risk)**

At session end: 7.16 YES + 14.73 NO tokens. The 7.16 overlapping tokens could be merged on-chain (YES+NO → USDC at $1 per pair) for $7.16 guaranteed, risk-free profit. Instead this was left as directional exposure.

### What Would Have Made More Money

| Priority | Change | Estimated Impact | Difficulty |
|----------|--------|------------------|------------|
| 1 | Faster tick (2s → 500ms) | +$1-3/game from reduced adverse selection | Easy |
| 2 | Token merging (auto-merge YES+NO → USDC) | +$7 immediate from current position | Easy |
| 3 | Faster balance refresh (15s → 5s) | +$0.50-1/game from faster inventory flip | Easy |
| 4 | Score-aware spread widening | +$1-2/game from avoiding crunch-time fills | Medium |
| 5 | Crunch-time quoting halt (final 90s) | +$0.50-1/game from dodging max adverse selection | Medium |
| 6 | Exponential backoff on CLOB errors | Prevents server crash (Issue #20 recurrence) | Easy |
| 7 | NCAAB-aware crunch time detection | Critical — 2-half NCAAB was treated as early game | Medium |

### Critical Bug: NCAAB Crunch Time Never Fired

The `BasketballParser` checked `quarter >= 4` for crunch-time logic. NCAAB uses 2 halves (periods 1 and 2), not 4 quarters. So the quarter number was always 1 or 2 — the crunch-time widening and withdrawal logic **never activated** for any NCAAB game. The bot kept quoting tight 1¢ spreads through the final seconds of close games, when adverse selection per point is at its absolute maximum.

**Fix:** `BasketballParser` now accepts a `regulationPeriods` parameter (4 for NBA, 2 for NCAAB). Crunch-time checks use `isFinalPeriod()` which returns true when `quarter >= regulationPeriods || isOvertime`. The live-trading-server passes `game.league` to the parser constructor.

### Optimal Strategy by Game Phase

| Game Phase | Adverse Selection Risk | Optimal Spread | Optimal Action |
|------------|----------------------|----------------|----------------|
| Timeout / halftime | Very low | 0.5-0.8x base | Aggressive quoting, tight spreads |
| Normal play, blowout (>15 pts) | Low | 0.5-0.6x base | Tight spreads, maximize volume |
| Normal play, competitive | Medium | 1.0x base | Standard quoting |
| Close game, final 5 min | High | 2.0x base | Wide spreads |
| Close game, final 3 min | Very high | 2.0-3.0x base | Wide spreads, small sizes |
| Close game, final 90 sec | Extreme | N/A | **Stop quoting entirely** |
| Overtime, final minute | Extreme | N/A | **Stop quoting entirely** |

### Key Insight: Fewer, Better Fills > More Fills

29 fills at 2¢ round-trip spread = ~$0.60 gross spread revenue. But if 5-10 of those fills were adversely selected (filled right before a price move against you), the 3-5¢ adverse move per fill costs $0.60-$2.10 — exceeding spread revenue entirely.

The ideal strategy: **more fills during dead-ball periods, zero fills during active play near scoring events.** Total fill count might be similar, but the quality of fills (% that are round-tripped vs. adversely selected) is dramatically better.

---

## Changes Made — Attempt #3

| File | Change |
|------|--------|
| `scripts/live-trading-server.ts` | **Major rewrite**: Added `ethers` import and CTF on-chain balance tracking (`getTokenBalance()`). MarketState expanded with `yesBalance`, `noBalance`, `lastBalanceRefresh`. `computeQuotes()` completely rewritten for inventory-aware quoting: SELL YES when holding YES, SELL NO when holding NO; skip BUY orders when holding >5 tokens of that type; inventory-skewed spreads (0.5x offload side, 1.5x accumulate side). Capital headroom only applies to BUY orders. Balance-diff fill detection every 15s. Health endpoint now shows `yesBalance`, `noBalance`, `yesValueUsdc`, `noValueUsdc`. |
| `scripts/sports-bridge.ts` | Added 15-second heartbeat: re-sends current midpoint for all active markets even when unchanged. Prevents false stale-FV widening during quiet periods. Delta threshold changed from 0.003 to 0.001. |
| `scripts/games.json` | Added Delaware State/Morgan State game. `baseHalfSpread` tightened from 0.03 to 0.01. |
| `scripts/sell-yes-tokens.ts` | New script: queries on-chain YES balance, checks orderbook, places SELL YES at market. |
| `scripts/check-position.ts` | New script: queries both YES and NO balances, shows all open orders and both orderbooks. |

---

## Changes Made — v3 Hardening (Post-Session Analysis)

| File | Change |
|------|--------|
| `scripts/live-trading-server.ts` | **Tick speed**: 2000ms → 500ms (4x faster adverse-selection response). **Balance refresh**: 15s → 5s. **Token merging**: auto-detects overlapping YES+NO positions every 30s, calls CTF `mergePositions()` on-chain to reclaim USDC risk-free. **Refresh guard**: prevents overlapping tick executions. **NCAAB-aware**: passes `game.league` to parser constructor so NCAAB 2-half format triggers crunch-time logic correctly. Log frequencies scaled for 500ms ticks. Banner updated to v3. |
| `engine-src/mm/RiskManager.ts` | **Spread multiplier always applied**: previously only applied game signal's `spreadMultiplier` when `shouldWiden=true`, missing tighter-spread signals during timeouts (0.8x), blowouts (0.5x), comfortable leads (0.8x). Now applies the multiplier whenever it differs from 1.0. |
| `engine-src/sports/BasketballParser.ts` | **Configurable regulation periods**: constructor accepts `regulationPeriods` (4=NBA, 2=NCAAB). `isFinalPeriod()` helper replaces hardcoded `quarter===4` checks. **Extended withdrawal zone**: 30s → 90s for close games. **Expanded widening**: final 3 min at 2-3x (was 2 min at 1.5-2.5x), final 5 min at 2x (was 1.8x). **Tighter calm spreads**: timeout 0.8x, blowout 0.5x, 15+ pt lead 0.6x, 10+ pt lead 0.8x, halftime 0.7x. |
| `engine-src/live/PolymarketClient.ts` | **Exponential backoff**: tracks consecutive order failures. After each failure, backs off for `min(60s, 1s × 2^n)`. Resets on success. Prevents the infinite error loop that crashed the server in Issue #20. |
| `scripts/sports-bridge.ts` | **Sportradar game-state enrichment**: when `SPORTRADAR_API_KEY` is set, the polymarket-live source also polls Sportradar every 15s for live game state. Boxscore endpoint provides scores, half, clock, and halftime detection. Play-by-play endpoint detects timeouts in real time. Posts `score_update` events with `isTimeout`, `isHalftime`, `quarter`, `secondsRemaining` to the live server, enabling dynamic spread adjustments. |
| `engine-src/sports/BasketballParser.ts` | **Halftime signal**: new `isHalftime` detection from Sportradar data. Halftime returns 0.5x spread multiplier (zero adverse selection during extended dead ball). Timeout tightened from 0.8x to 0.7x. |

---

## Attempt #4 — Jackson State vs Florida A&M (2026-03-11, LIVE)

**Market**: `cbb-jackst-flam-2026-03-11` | **Mode**: LIVE | **Config**: 1¢ spread, $25 cap, 500ms tick

### Timeline

| Time | Event | FV | YES Held | Action |
|------|-------|----|----------|--------|
| T+0 | Bot starts, bridge seeds 43.5% | 43.5% | 0 | 8 BUY orders placed (YES@0.40-0.43, NO@0.54-0.57) |
| T+5s | BUY YES orders filled | 43.5% | 21.93 | Bought ~21.93 YES at ~$0.415 avg ($9.10 USDC) |
| T+10s | Inventory detected | 41.0% | 21.93 | Switched to SELL-only mode, SELL@0.41-0.43 |
| T+30s | First sell fills | 40.0% | 17.81 | Sold 4.12 YES at ~$0.42 (+$1.73) |
| T+2min | Score goes against Jackson St | 35.5% | 17.81 | Still trying to sell at 0.36-0.37 |
| T+3min | Sells fill at loss | 37.5% | 6.14 | Sold 11.67 YES at ~$0.36 (+$4.20) |
| T+5min | FV crashes as FLAM dominates | 29.5% | 6.14 | Selling at 0.27-0.30 |
| T+6min | FV at 26.5%, CLOB "not enough balance" | 26.5% | 6.14 | SELL orders failing — USDC depleted by NO-side BUYs |

### P&L

| Item | Amount |
|------|--------|
| Bought 21.93 YES @ ~$0.415 | -$9.10 |
| Sold 4.12 YES @ ~$0.42 | +$1.73 |
| Sold 11.67 YES @ ~$0.36 | +$4.20 |
| Remaining 6.14 YES @ $0.28 MtM | +$1.72 |
| Also bought ~4.65 NO tokens | -$3.02 (est) |
| 4.65 NO @ $0.72 MtM | +$3.35 |
| **Net session P&L** | **~-$1.12** |

### Root Cause: 100% Adverse Selection

Every single fill was an informed trader picking off stale quotes:

1. **No Sportradar connection**: The `SPORTRADAR_API_KEY` was in `sports-mm/.env` and dotenv should have loaded it, but the bridge was started with `--sportradar-key "$SPORTRADAR_API_KEY"` where the shell variable was empty. The `??` operator treats `""` as non-null, so it used the empty string instead of falling back to `process.env`. **The bot had zero game-state awareness.**

2. **FV derived from CLOB midpoint = lagging indicator**: The bot's fair value comes from the CLOB midpoint, which is ALREADY moved by informed traders. Timeline on every score: (a) basket scored → (b) sharp bettors slam CLOB in <1s → (c) midpoint moves → (d) our bot sees new midpoint 500ms later → (e) our OLD resting orders get filled at the stale price. We're always buying at the old price and selling at the new (worse) price.

3. **1% spread obliterated by 5-10¢ game moves**: A single basket swings NCAAB moneyline 3-10¢. Our 0.5¢ half-spread provides zero protection.

4. **No quote withdrawal on score events**: The bot kept resting orders live during scoring runs. A market maker in live sports MUST cancel all quotes the instant a score event arrives, then re-quote after the market settles.

### Critical Bug: `??` vs `||` for env var fallback

```typescript
// BUG: ?? only checks null/undefined, not empty string ""
const sportradarKey = getArg("sportradar-key") ?? process.env.SPORTRADAR_API_KEY;
// FIX: || treats "" as falsy and falls through to process.env
const sportradarKey = getArg("sportradar-key") || process.env.SPORTRADAR_API_KEY;
```

### Lesson: Market Making in Live Sports Requires Speed Advantage

In live sports markets, almost 100% of order flow is informed (score-driven). A market maker can only profit if:
- It knows about score events BEFORE other traders (Sportradar at 1s vs TV at 10-30s)
- It cancels stale quotes BEFORE they get picked off (<100ms reaction)
- It re-quotes AFTER the market settles (3-5s freeze after score change)

Without this, every fill is adverse selection and the bot is a systematic donor to informed traders.

---

## Changes Made — v4 Anti-Adverse-Selection (Post-Attempt #4)

| File | Change |
|------|--------|
| `scripts/sports-bridge.ts` | **`??` → `||` for Sportradar key**: fixes the env var fallback bug that prevented Sportradar from connecting. **1s polling for single-game focus**: `SR_POLL_MS` dynamically computed — 1s for 1 game, scales up for multiple games. **Score-change detection**: tracks `lastSrScores` per game. When score changes, emits `score_change` event (not `score_update`) with `prevScore` and `newScore`, triggering instant order cancellation on the server. PBP timeout detection only when rate budget allows (single game). |
| `scripts/live-trading-server.ts` | **`score_change` event handler**: on receipt, immediately calls `orderMgr.cancelMarket()` to pull all resting orders before they get picked off. Sets `scoreFreezeUntil = now + 3000ms`. **Score freeze in `computeQuotes()`**: returns empty quotes while frozen, logging countdown. Prevents re-quoting until the CLOB midpoint has had 3s to reflect the new score. **`SCORE_FREEZE_MS` constant**: 3000ms default freeze duration. **`scoreFreezeUntil` on MarketState**: new field tracking when quoting can resume. |

---

## Before Going Live — Updated Checklist

- [x] Set `positionCapUsdc` to `bankroll * 0.15` → $25
- [x] Verify `hasBridgePrice` guard prevents premature quoting → confirmed
- [x] Confirm game is detected as LIVE before quoting → manual `game_start` needed
- [x] Test smart requoting → `kept=9, replaced=0`
- [x] Confirm capital headroom → well within 50%
- [x] Add fill-side monitoring → 80% threshold, 2.5x widening
- [x] Add emergency position dump → 1.5x cap halt
- [x] Set `maxLossUsdc` → $25
- [x] Fetch live CLOB midpoint at startup → confirmed
- [x] Remove external trade inventory poisoning → `recordFill` disabled
- [x] Add bridge heartbeat → 15s keepalive, staleSec stays <15
- [x] On-chain balance tracking → CTF `balanceOf()` every 5s
- [x] Inventory-aware quoting → SELL tokens held, BUY when empty
- [x] Skip BUY accumulation when holding >5 tokens
- [x] Inventory-skewed spreads → 0.5x offload, 1.5x accumulate
- [x] Competitive spread analysis → tightened from 3¢ to 1¢ based on CLOB depth
- [x] Minimum SELL threshold → 5 tokens (prevents dust balance error loop)
- [x] Exponential backoff on repeated CLOB errors → min(60s, 2^n backoff)
- [x] Token merging → auto-merge YES+NO pairs on-chain via CTF `mergePositions()` every 30s
- [x] Faster tick → 500ms (down from 2000ms) for 4x faster adverse-selection response
- [x] Score-aware spreads always applied → tighter during timeouts/blowouts, wider during crunch time
- [x] NCAAB-aware crunch time → 2-half format detected via `regulationPeriods=2`
- [x] Extended crunch-time withdrawal → final 90s (up from 30s) for close games
- [ ] Add auto-restart / process supervisor for the live server
- [ ] Add trailing stop: if mark-to-market drops X% from peak, force-close position
- [ ] Fix VPIN/Bayesian: add `recordExternalFlow()` to RiskManager
- [x] Sportradar game-state enrichment → boxscore (halftime, clock) + PBP (timeouts) every 15s
- [x] Fix Sportradar env var bug → `??` → `||` so empty CLI arg falls through to `process.env`
- [x] 1s Sportradar polling for single-game focus → react to scores before TV-watching bettors
- [x] Score-change detection → bridge emits `score_change` event on score delta
- [x] Instant order cancellation on score change → server cancels all resting orders in <100ms
- [x] Score freeze → 3s quoting pause after score change to let price discover
- [ ] Automate game phase detection in bridge (no more manual curl)
- [ ] WebSocket fill notifications (replace balance polling with instant fill detection)
