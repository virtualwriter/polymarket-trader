/**
 * Live Trading Server.
 *
 * Uses the EXACT same LMSR + RiskManager pipeline as the sim.
 * The only difference: orders go to the real Polymarket CLOB via OrderManager
 * instead of the local MatchingEngine.
 *
 * Architecture:
 *   Polymarket CLOB WS → bridge → state.fairValue → LMSR.recenter()
 *                                                  → RiskManager.notify()
 *   Timer tick → LMSR-style refreshQuotes() → OrderManager → PolymarketClient → CLOB
 *
 * Safety:
 *   - Starts in DRY RUN mode by default (--live flag to go real)
 *   - Kill switch on max loss
 *   - All orders cancelled on shutdown (SIGINT/SIGTERM)
 *   - Position cap enforcement via RiskManager.getAllowedSize()
 *   - VPIN + toxicity scoring via RiskManager.recordFill()
 *   - Midpoint divergence detection via RiskManager.notifyMidpoint()
 *
 * Usage:
 *   npx tsx scripts/live-trading-server.ts --game cbb-wyom-unlv     # dry run, one game
 *   npx tsx scripts/live-trading-server.ts --live                    # real money, all games
 *   npx tsx scripts/live-trading-server.ts --live --max-loss 75 --game cbb-wyom-unlv
 */

import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { ethers } from "ethers";

import { PolymarketClient } from "../engine-src/live/PolymarketClient.js";
import { OrderManager, QuoteLevel, FillEvent } from "../engine-src/live/OrderManager.js";
import { VpnGuard } from "../engine-src/live/VpnGuard.js";
import { RiskManager } from "../engine-src/mm/RiskManager.js";
import { BasketballParser } from "../engine-src/sports/BasketballParser.js";
import { TennisParser } from "../engine-src/sports/TennisParser.js";
import { SoccerParser } from "../engine-src/sports/SoccerParser.js";
import { BaseballParser } from "../engine-src/sports/BaseballParser.js";
import { createGameState } from "../engine-src/sports/GameStateParser.js";
import type { GameStateParser, GameState as ParserGameState, GameEvent, Sport } from "../engine-src/sports/GameStateParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

// ───────────────────── CLI Args ─────────────────────

const args = process.argv.slice(2);
const isLive = args.includes("--live");
const skipVpn = args.includes("--skip-vpn");
const maxLossArg = args.find(a => a.startsWith("--max-loss"));
const maxLoss = maxLossArg ? parseInt(args[args.indexOf(maxLossArg) + 1] || "25") : 25;
const gameFilterIdx = args.indexOf("--game");
const gameFilter = gameFilterIdx !== -1 ? args[gameFilterIdx + 1] : null;

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY in .env or config.env");
  process.exit(1);
}

const SOCKS_PROXY = process.env.SOCKS_PROXY || process.env.ALL_PROXY || undefined;

// ───────────────────── Load Games ─────────────────────

interface GameConfig {
  id: string;
  question: string;
  teamA: string;
  teamB: string;
  sport: string;
  league: string;
  initialProb: number;
  conditionId: string;
  clobTokenIds: string;
  polymarketSlug?: string;
  sportradarEventId?: string;
  riskConfig: {
    baseHalfSpread: number;
    inventorySkewPerUnit: number;
    withdrawalWindowSeconds: number;
    positionCapUsdc: number;
  };
}

const gamesPath = resolve(__dirname, "games.json");
const gamesJson = JSON.parse(readFileSync(gamesPath, "utf-8"));
const allGames: GameConfig[] = gamesJson.games;
const games: GameConfig[] = gameFilter
  ? allGames.filter(g => g.id.includes(gameFilter))
  : allGames;

if (games.length === 0) {
  console.error(`No games matched filter "${gameFilter}". Available: ${allGames.map(g => g.id).join(", ")}`);
  process.exit(1);
}

// ───────────────────── Constants — MATCH THE SIM, SCALED FOR BANKROLL ─────────────────────

const TICK_MS = 500;               // 500ms tick — 4x faster to reduce adverse selection window
const SCORE_FREEZE_MS = 3_000;     // After a score change, freeze quoting for 3s to let price discover
const NUM_LEVELS = 2;              // 2 levels only — less locked capital, more headroom

// Post-mortem: $168 remaining after $344 loss on $512 bankroll.
// Conservative sizing: 15% position cap, 10% per-level max, 50% capital headroom.
const BANKROLL_USDC = 168;
const SIM_BANKROLL_MID = 2000;
const BANKROLL_SCALE = BANKROLL_USDC / SIM_BANKROLL_MID;  // 0.084
const MAX_FILL_SIZE_USDC = BigInt(Math.round(500_000_000 * BANKROLL_SCALE));   // ~$42
const SIZE_PER_LEVEL_CAP = BigInt(Math.round(50_000_000 * BANKROLL_SCALE));    // ~$4.2 per level
const CAPITAL_HEADROOM = 0.50;     // Never deploy more than 50% of bankroll in open orders
const MAX_DEPLOYED_USDC = BANKROLL_USDC * CAPITAL_HEADROOM; // $84 max locked in orders

// ───────────────────── Initialize Components ─────────────────────

const polyClient = new PolymarketClient({
  privateKey: PRIVATE_KEY,
  dryRun: !isLive,
  maxLossUsdc: maxLoss,
});

const orderMgr = new OrderManager(polyClient);

// ───────────────────── On-Chain Balance Tracking (CTF ERC1155) ─────────────────────

const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const CTF_ABI = ["function balanceOf(address account, uint256 id) view returns (uint256)"];
const rpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
const ctfContract = new ethers.Contract(CTF_ADDRESS, CTF_ABI, rpcProvider);
const walletAddress = new ethers.Wallet(PRIVATE_KEY).address;

async function getTokenBalance(tokenId: string): Promise<number> {
  try {
    const bal = await ctfContract.balanceOf(walletAddress, tokenId);
    return parseFloat(ethers.utils.formatUnits(bal, 6));
  } catch (err: any) {
    console.error(`[BALANCE] Failed to fetch balance for ${tokenId.slice(0, 12)}...: ${err.message}`);
    return 0;
  }
}

const BALANCE_REFRESH_MS = 5_000;

// Token merge: when holding both YES+NO, merge on-chain to reclaim USDC risk-free.
const MERGE_CHECK_MS = 30_000;
const MIN_MERGE_TOKENS = 5;
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e on Polygon
const ZERO_PARENT = "0x" + "0".repeat(64);
const CTF_FULL_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata partition, uint256 amount) external",
];
const walletSigner = new ethers.Wallet(PRIVATE_KEY, rpcProvider);
const ctfMergeContract = new ethers.Contract(CTF_ADDRESS, CTF_FULL_ABI, walletSigner);

async function mergeTokens(state: MarketState): Promise<number> {
  const minBalance = Math.min(state.yesBalance, state.noBalance);
  if (minBalance < MIN_MERGE_TOKENS) return 0;

  const game = games.find(g => g.id === state.gameId);
  if (!game?.conditionId) return 0;

  const mergeAmount = Math.floor(minBalance);
  const rawAmount = ethers.utils.parseUnits(mergeAmount.toString(), 6);

  try {
    const tx = await ctfMergeContract.mergePositions(
      USDC_ADDRESS,
      ZERO_PARENT,
      game.conditionId,
      [1, 2],
      rawAmount,
    );
    const receipt = await tx.wait();
    console.log(`  *** [MERGE] ${state.gameId}: merged ${mergeAmount} YES+NO pairs → $${mergeAmount.toFixed(2)} USDC (tx: ${receipt.transactionHash}) ***`);
    state.yesBalance -= mergeAmount;
    state.noBalance -= mergeAmount;
    return mergeAmount;
  } catch (err: any) {
    console.error(`  [MERGE] ${state.gameId}: failed — ${err.message?.slice(0, 120)}`);
    return 0;
  }
}

// Per-market state — mirrors the sim's gameStates map
interface MarketState {
  gameId: string;
  yesTokenId: string;
  noTokenId: string;
  fairValue: number;
  lastUpdate: number;
  riskManager: RiskManager;
  phase: "pre_game" | "live" | "ended";
  hasBridgePrice: boolean;  // true once the bridge has fed us a real CLOB price
  // LMSR internal state (mirrors LMSRAMMProvider)
  b: number;           // liquidity parameter
  qYes: number;
  qNo: number;
  // On-chain token balances — drives inventory-aware quoting
  yesBalance: number;  // YES tokens held (from on-chain)
  noBalance: number;   // NO tokens held (from on-chain)
  lastBalanceRefresh: number;
  // Post-mortem: fill-side monitoring to detect one-sided accumulation
  bidFills: number;    // fills on bid side (bought YES)
  askFills: number;    // fills on ask side (bought NO)
  bidNotional: number; // total USDC notional on bid fills
  askNotional: number; // total USDC notional on ask fills
  oneSidedWideningActive: boolean; // true if spreads auto-widened due to one-sided fills
  emergencyDumpTriggered: boolean; // true if emergency liquidation fired
  lastMergeCheck: number;
  scoreFreezeUntil: number; // timestamp — don't quote until price settles after score change
}

const markets = new Map<string, MarketState>();
const sportParsers = new Map<string, GameStateParser>();
const parserStates = new Map<string, ParserGameState>();

function createSportParser(sport: string, league?: string): GameStateParser {
  switch (sport.toLowerCase()) {
    case "tennis": return new TennisParser();
    case "soccer": return new SoccerParser();
    case "baseball": return new BaseballParser();
    case "basketball":
    case "hockey": {
      const periods = league?.toUpperCase() === "NCAAB" ? 2 : 4;
      return new BasketballParser(periods);
    }
    default: return new BasketballParser();
  }
}

// Fetch live midpoint from Polymarket CLOB REST API so we never seed with a stale config value.
const CLOB_REST_URL = "https://clob.polymarket.com";

async function fetchLiveMidpoint(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${CLOB_REST_URL}/midpoint?token_id=${tokenId}`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const mid = parseFloat(data.mid ?? "0");
    return (mid > 0.01 && mid < 0.99) ? mid : null;
  } catch {
    return null;
  }
}

for (const game of games) {
  const tokenIds = JSON.parse(game.clobTokenIds) as string[];

  // Fetch the real midpoint — fall back to config's initialProb only if the API is unreachable
  const liveMid = await fetchLiveMidpoint(tokenIds[0]);
  const seedProb = liveMid ?? game.initialProb;
  if (liveMid !== null) {
    console.log(`[LIVE] ${game.id}: seeded from CLOB midpoint → ${(liveMid * 100).toFixed(1)}% (config had ${(game.initialProb * 100).toFixed(1)}%)`);
  } else {
    console.warn(`[LIVE] ${game.id}: CLOB midpoint unavailable — falling back to config ${(game.initialProb * 100).toFixed(1)}%`);
  }

  const rc = game.riskConfig;
  const rm = new RiskManager({
    positionCapUsdc: BigInt(rc.positionCapUsdc),
    maxFillSizeUsdc: MAX_FILL_SIZE_USDC,
    baseHalfSpread: rc.baseHalfSpread,
    inventorySkewPerUnit: rc.inventorySkewPerUnit,
    withdrawalWindowSeconds: rc.withdrawalWindowSeconds,
    inventoryUnitUsdc: BigInt(Math.round(500_000_000 * BANKROLL_SCALE)),
  });

  rm.notifyFairValue(game.id, seedProb);
  rm.notifyMidpoint(game.id, seedProb);
  rm.setGamePhase(game.id, "pre_game");

  const parser = createSportParser(game.sport, game.league);
  sportParsers.set(game.id, parser);
  parserStates.set(game.id, createGameState(game.sport.toLowerCase() as Sport, seedProb));

  const b = 100;
  const p = Math.max(0.02, Math.min(0.98, seedProb));
  const qYes = b * Math.log(p / (1 - p));

  const initYesBal = await getTokenBalance(tokenIds[0]);
  const initNoBal = await getTokenBalance(tokenIds[1]);
  if (initYesBal > 0 || initNoBal > 0) {
    console.log(`[LIVE] ${game.id}: EXISTING POSITION — YES=${initYesBal.toFixed(2)} NO=${initNoBal.toFixed(2)}`);
  }

  markets.set(game.id, {
    gameId: game.id,
    yesTokenId: tokenIds[0],
    noTokenId: tokenIds[1],
    fairValue: seedProb,
    lastUpdate: Date.now(),
    riskManager: rm,
    phase: "pre_game",
    hasBridgePrice: false,
    b,
    qYes,
    qNo: 0,
    yesBalance: initYesBal,
    noBalance: initNoBal,
    lastBalanceRefresh: Date.now(),
    bidFills: 0,
    askFills: 0,
    bidNotional: 0,
    askNotional: 0,
    oneSidedWideningActive: false,
    emergencyDumpTriggered: false,
    lastMergeCheck: Date.now(),
    scoreFreezeUntil: 0,
  });

  console.log(`[LIVE] ${game.id}: YES=${tokenIds[0].slice(0, 12)}... seed=${seedProb.toFixed(3)}`);
}

// ───────────────────── LMSR Helpers (ported from engine-src/amm/LMSR.ts) ─────────────────────

function lmsrGetYesPrice(state: MarketState): number {
  const expYes = Math.exp(state.qYes / state.b);
  const expNo = Math.exp(state.qNo / state.b);
  return expYes / (expYes + expNo);
}

function lmsrRecenter(state: MarketState, newPrice: number): boolean {
  const p = Math.max(0.02, Math.min(0.98, newPrice));
  const oldPrice = lmsrGetYesPrice(state);
  state.qYes = state.b * Math.log(p / (1 - p));
  state.qNo = 0;
  return Math.abs(p - oldPrice) > 0.03;
}

// ───────────────────── Post-Mortem Safety: Fill-Side Monitoring + Emergency Dump ─────────────────────

const ONE_SIDED_THRESHOLD = 0.80;      // >80% fills on one side → widen
const ONE_SIDED_MIN_FILLS = 3;         // need at least 3 fills to trigger
const ONE_SIDED_SPREAD_MULT = 2.5;     // 2.5x wider when one-sided detected
const EMERGENCY_DUMP_MULT = 1.5;       // dump if notional > 1.5x positionCap

function checkFillSideBalance(state: MarketState): { oneSided: boolean; dominantSide: string; ratio: number } {
  const total = state.bidFills + state.askFills;
  if (total < ONE_SIDED_MIN_FILLS) return { oneSided: false, dominantSide: "none", ratio: 0.5 };

  const bidRatio = state.bidFills / total;
  const askRatio = state.askFills / total;

  if (bidRatio > ONE_SIDED_THRESHOLD) {
    return { oneSided: true, dominantSide: "bid", ratio: bidRatio };
  }
  if (askRatio > ONE_SIDED_THRESHOLD) {
    return { oneSided: true, dominantSide: "ask", ratio: askRatio };
  }
  return { oneSided: false, dominantSide: "balanced", ratio: Math.max(bidRatio, askRatio) };
}

function checkEmergencyDump(state: MarketState): boolean {
  const rc = games.find(g => g.id === state.gameId)?.riskConfig;
  if (!rc) return false;
  const capUsdc = rc.positionCapUsdc / 1_000_000; // convert from micro-USDC
  const maxExposure = Math.max(state.bidNotional, state.askNotional);
  return maxExposure > capUsdc * EMERGENCY_DUMP_MULT;
}

function getDeployedCapital(state: MarketState, quotes: QuoteLevel[]): number {
  let totalLocked = 0;
  for (const q of quotes) {
    totalLocked += q.price * q.size;
  }
  return totalLocked;
}

// ───────────────────── Quoting Logic — INVENTORY-AWARE ─────────────────────
//
// Key insight: when holding tokens from fills, SELL them instead of buying the
// opposite side. SELL YES captures profit directly. BUY NO creates new exposure.
//
// | Holdings     | Bid side        | Ask side        |
// |-------------|-----------------|-----------------|
// | Nothing     | BUY YES         | BUY NO          |
// | YES tokens  | BUY YES         | SELL YES        |
// | NO tokens   | SELL NO         | BUY NO          |
// | Both        | SELL NO         | SELL YES        |

function computeQuotes(state: MarketState): QuoteLevel[] {
  const rm = state.riskManager;

  if (state.emergencyDumpTriggered) {
    if (tick % 40 === 0) console.log(`  [EMERGENCY] ${state.gameId}: quotes halted — emergency dump active`);
    return [];
  }

  // Score freeze: after a score change, stay flat until the market finds the new price.
  // This is the #1 anti-adverse-selection defense — don't quote at stale prices.
  if (Date.now() < state.scoreFreezeUntil) {
    const remaining = Math.round((state.scoreFreezeUntil - Date.now()) / 1000 * 10) / 10;
    if (tick % 4 === 0) console.log(`  [FREEZE] ${state.gameId}: score changed — no quotes for ${remaining}s (letting price discover)`);
    return [];
  }

  if (rm.shouldWithdraw(state.gameId)) {
    if (tick % 20 === 0) {
      const staleMs = rm.getFairValueStalenessMs(state.gameId);
      const div = rm.getMidpointDivergence(state.gameId);
      console.log(`  [DEBUG] ${state.gameId}: WITHDRAWN — stale=${Math.round(staleMs/1000)}s div=${(div*100).toFixed(1)}% phase=${state.phase}`);
    }
    return [];
  }

  let yesPrice = lmsrGetYesPrice(state);

  const biasShift = rm.getBaseBiasShift(state.gameId);
  yesPrice = Math.max(0.02, Math.min(0.98, yesPrice + biasShift));

  let { bidHalfSpread, askHalfSpread, atCapBid, atCapAsk } =
    rm.getAdjustedSpread(state.gameId);

  // Inventory-aware spread adjustment: tighten the side that offloads inventory,
  // widen the side that accumulates more.
  const hasYes = state.yesBalance > 1;
  const hasNo = state.noBalance > 1;

  if (hasYes && !hasNo) {
    askHalfSpread *= 0.5;  // tighten ask to encourage YES selling
    bidHalfSpread *= 1.5;  // widen bid to discourage more YES buying
  } else if (hasNo && !hasYes) {
    bidHalfSpread *= 0.5;  // tighten bid to encourage NO selling
    askHalfSpread *= 1.5;  // widen ask to discourage more NO buying
  }

  if (tick % 20 === 0) {
    console.log(`  [QUOTE-DBG] yesP=${yesPrice.toFixed(3)} bias=${biasShift.toFixed(4)} bidHS=${bidHalfSpread.toFixed(3)} askHS=${askHalfSpread.toFixed(3)} yesBal=${state.yesBalance.toFixed(1)} noBal=${state.noBalance.toFixed(1)}`);
  }

  // One-sided fill detection still applies as a safety net
  const fillCheck = checkFillSideBalance(state);
  if (fillCheck.oneSided) {
    if (!state.oneSidedWideningActive) {
      console.log(`  [SAFETY] ${state.gameId}: ONE-SIDED FILLS detected (${fillCheck.dominantSide} ${(fillCheck.ratio * 100).toFixed(0)}%) — widening ${ONE_SIDED_SPREAD_MULT}x`);
      state.oneSidedWideningActive = true;
    }
    if (fillCheck.dominantSide === "bid") {
      bidHalfSpread *= ONE_SIDED_SPREAD_MULT;
    } else {
      askHalfSpread *= ONE_SIDED_SPREAD_MULT;
    }
  } else if (state.oneSidedWideningActive) {
    console.log(`  [SAFETY] ${state.gameId}: fills rebalanced — removing one-sided widening`);
    state.oneSidedWideningActive = false;
  }

  const rmConfig = rm.getConfig();
  const sizePerLevel = rmConfig.maxFillSizeUsdc < SIZE_PER_LEVEL_CAP
    ? rmConfig.maxFillSizeUsdc
    : SIZE_PER_LEVEL_CAP;

  const quotes: QuoteLevel[] = [];
  let remainingYesToSell = state.yesBalance;
  let remainingNoToSell = state.noBalance;

  for (let i = 0; i < NUM_LEVELS; i++) {
    const levelMultiplier = i + 1;

    // ── BID SIDE: prefer SELL NO (offloads inventory) over BUY YES ──
    if (!atCapBid) {
      const bidPrice = Math.max(0.02, yesPrice - bidHalfSpread * levelMultiplier);
      const bidPriceRounded = Math.round(bidPrice * 100) / 100;
      const noEquivPrice = Math.round((1 - bidPriceRounded) * 100) / 100;

      const allowedBidSize = rm.getAllowedSize(state.gameId, sizePerLevel, true);
      if (allowedBidSize > 0n && bidPriceRounded >= 0.02) {
        const usdcSize = Number(allowedBidSize) / 1_000_000;

        if (remainingNoToSell > 5 && noEquivPrice >= 0.02 && noEquivPrice <= 0.98) {
          const sellSize = Math.min(remainingNoToSell, usdcSize / noEquivPrice);
          quotes.push({
            price: noEquivPrice,
            size: Math.max(1, Math.round(sellSize * 100) / 100),
            side: "SELL",
            tokenId: state.noTokenId,
          });
          remainingNoToSell -= sellSize;
          if (tick % 60 === 0) {
            console.log(`  [INV] BID via SELL NO ${sellSize.toFixed(1)} @ ${noEquivPrice} (offloading NO inventory)`);
          }
        } else if (state.yesBalance <= 5) {
          // Only buy MORE YES tokens if we don't already hold a significant amount
          const sizeInTokens = usdcSize / bidPriceRounded;
          quotes.push({
            price: bidPriceRounded,
            size: sizeInTokens,
            side: "BUY",
            tokenId: state.yesTokenId,
          });
        }
      }
    }

    // ── ASK SIDE: prefer SELL YES (offloads inventory) over BUY NO ──
    if (!atCapAsk) {
      const askPrice = Math.min(0.98, yesPrice + askHalfSpread * levelMultiplier);
      const askPriceRounded = Math.round(askPrice * 100) / 100;

      const allowedAskSize = rm.getAllowedSize(state.gameId, sizePerLevel, false);
      if (allowedAskSize > 0n && askPriceRounded <= 0.98) {
        const usdcSize = Number(allowedAskSize) / 1_000_000;

        if (remainingYesToSell > 5 && askPriceRounded >= 0.02) {
          const sellSize = Math.min(remainingYesToSell, usdcSize / askPriceRounded);
          quotes.push({
            price: askPriceRounded,
            size: Math.max(1, Math.round(sellSize * 100) / 100),
            side: "SELL",
            tokenId: state.yesTokenId,
          });
          remainingYesToSell -= sellSize;
          if (tick % 60 === 0) {
            console.log(`  [INV] ASK via SELL YES ${sellSize.toFixed(1)} @ ${askPriceRounded} (offloading YES inventory)`);
          }
        } else if (state.noBalance <= 5) {
          // Only buy MORE NO tokens if we don't already hold a significant amount
          const noPrice = Math.round((1 - askPriceRounded) * 100) / 100;
          const sizeInTokens = usdcSize / noPrice;
          if (noPrice >= 0.02 && noPrice <= 0.98) {
            quotes.push({
              price: noPrice,
              size: sizeInTokens,
              side: "BUY",
              tokenId: state.noTokenId,
            });
          }
        }
      }
    }
  }

  // Capital headroom — trim quotes if total deployment > 50% of bankroll
  // Only applies to BUY orders (SELL orders don't lock new collateral)
  const buyQuotes = quotes.filter(q => q.side === "BUY");
  const deployed = getDeployedCapital(state, buyQuotes);
  if (deployed > MAX_DEPLOYED_USDC) {
    const scaleFactor = MAX_DEPLOYED_USDC / deployed;
    for (const q of quotes) {
      if (q.side === "BUY") {
        q.size = Math.max(1, Math.floor(q.size * scaleFactor));
      }
    }
    if (tick % 60 === 0) {
      console.log(`  [HEADROOM] ${state.gameId}: scaled BUY sizes by ${(scaleFactor * 100).toFixed(0)}% to stay within $${MAX_DEPLOYED_USDC} cap`);
    }
  }

  return quotes;
}

// ───────────────────── Tick Loop — MATCHES SIM'S simulateTick() ─────────────────────

let tick = 0;
let refreshInProgress = false;

async function refreshAllQuotes() {
  if (polyClient.isKilled) return;
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    await _refreshAllQuotesInner();
  } finally {
    refreshInProgress = false;
  }
}

async function _refreshAllQuotesInner() {
  tick++;

  for (const [marketId, state] of markets) {
    if (state.phase === "ended") continue;

    // Post-mortem #2 + #3: NEVER quote until BOTH conditions are met:
    // (a) bridge has fed a real CLOB price, and (b) game is confirmed live.
    // Pre-game wide-spread quoting caused the entire $344 loss last time.
    if (!state.hasBridgePrice) {
      if (tick % 60 === 0) console.log(`  [WAIT] ${marketId}: waiting for bridge price...`);
      continue;
    }
    if (state.phase === "pre_game") {
      if (tick % 60 === 0) console.log(`  [WAIT] ${marketId}: game not live yet (phase=${state.phase}) — not quoting`);
      continue;
    }

    const rm = state.riskManager;

    if (tick % 40 === 0) {
      const staleMs = rm.getFairValueStalenessMs(marketId);
      const div = rm.getMidpointDivergence(marketId);
      const withdrawn = rm.shouldWithdraw(marketId);
      if (withdrawn && (staleMs > 60000 || div > 0.10)) {
        const reason = staleMs > 180000 ? `stale-fv:${Math.round(staleMs / 1000)}s` : `divergence:${(div * 100).toFixed(0)}%`;
        if (tick % 120 === 0) {
          console.log(`  [DEFENSE] ${marketId}: QUOTES PULLED — ${reason}`);
        }
      }
    }

    // Refresh on-chain balances periodically
    if (Date.now() - state.lastBalanceRefresh > BALANCE_REFRESH_MS) {
      const [yBal, nBal] = await Promise.all([
        getTokenBalance(state.yesTokenId),
        getTokenBalance(state.noTokenId),
      ]);
      const yDelta = yBal - state.yesBalance;
      const nDelta = nBal - state.noBalance;
      if (Math.abs(yDelta) > 0.01 || Math.abs(nDelta) > 0.01) {
        console.log(`  [BALANCE] ${marketId}: YES ${state.yesBalance.toFixed(2)}→${yBal.toFixed(2)} (Δ${yDelta > 0 ? "+" : ""}${yDelta.toFixed(2)}) | NO ${state.noBalance.toFixed(2)}→${nBal.toFixed(2)} (Δ${nDelta > 0 ? "+" : ""}${nDelta.toFixed(2)})`);
        // Infer fills from balance changes
        if (yDelta > 0.5) {
          state.bidFills++;
          state.bidNotional += yDelta * state.fairValue;
        }
        if (nDelta > 0.5) {
          state.askFills++;
          state.askNotional += nDelta * (1 - state.fairValue);
        }
        if (yDelta < -0.5) {
          console.log(`  [PROFIT] Sold ${Math.abs(yDelta).toFixed(2)} YES tokens`);
        }
        if (nDelta < -0.5) {
          console.log(`  [PROFIT] Sold ${Math.abs(nDelta).toFixed(2)} NO tokens`);
        }
      }
      state.yesBalance = yBal;
      state.noBalance = nBal;
      state.lastBalanceRefresh = Date.now();

      // Token merge: if holding both YES+NO, merge on-chain for guaranteed USDC
      if (Date.now() - state.lastMergeCheck > MERGE_CHECK_MS) {
        state.lastMergeCheck = Date.now();
        const minOverlap = Math.min(state.yesBalance, state.noBalance);
        if (minOverlap >= MIN_MERGE_TOKENS) {
          console.log(`  [MERGE] ${marketId}: detected ${minOverlap.toFixed(1)} overlapping YES+NO — attempting on-chain merge...`);
          const merged = await mergeTokens(state);
          if (merged > 0) {
            state.lastBalanceRefresh = 0; // force immediate balance refresh next tick
          }
        }
      }
    }

    const quotes = computeQuotes(state);

    if (tick % 20 === 0) {
      const sellCount = quotes.filter(q => q.side === "SELL").length;
      const buyCount = quotes.filter(q => q.side === "BUY").length;
      console.log(`  [TICK ${tick}] ${marketId}: phase=${state.phase} fv=${state.fairValue.toFixed(3)} quotes=${quotes.length} (${sellCount} SELL, ${buyCount} BUY) YES=${state.yesBalance.toFixed(1)} NO=${state.noBalance.toFixed(1)} tracked=${orderMgr.getOrderCount(marketId)}`);
    }

    if (quotes.length === 0) {
      await orderMgr.cancelMarket(marketId);
      continue;
    }

    if (tick % 60 === 0) {
      const prices = quotes.map(q => {
        const isBidSide = (q.side === "BUY" && q.tokenId === state.yesTokenId) ||
                          (q.side === "SELL" && q.tokenId === state.noTokenId);
        const label = isBidSide ? "BID" : "ASK";
        return `${label} ${q.side} ${q.price.toFixed(2)}`;
      }).join(", ");
      const stats = orderMgr.getStats();
      console.log(`  [QUOTES] FV=${state.fairValue.toFixed(3)} LMSR=${lmsrGetYesPrice(state).toFixed(3)} → ${quotes.length} lvls: ${prices} | queue=${Math.round(stats.maxQueueAgeMs / 1000)}s kept=${stats.ordersKept} replaced=${stats.ordersReplaced} fills=${stats.fillsDetected}`);
    }

    // Smart requoting: only cancel orders whose price has changed
    await orderMgr.smartUpdateQuotes(marketId, quotes);

    // Periodic fill detection: reconcile tracked orders with CLOB state
    const detectedFills = await orderMgr.syncWithClob();
    for (const fill of detectedFills) {
      const isBid = fill.tokenId === state.yesTokenId;
      const sideLabel = isBid ? "BID FILLED" : "ASK FILLED";
      const impliedYesPrice = isBid ? fill.price : (1 - fill.price);
      const notional = fill.price * fill.size;
      console.log(`  *** [FILL] ${sideLabel} @ ${impliedYesPrice.toFixed(2)} | $${notional.toFixed(2)} notional | queue age: ${Math.round(fill.queueAgeMs / 1000)}s ***`);

      // Post-mortem #6: track fill sides for one-sided detection
      if (isBid) {
        state.bidFills++;
        state.bidNotional += notional;
      } else {
        state.askFills++;
        state.askNotional += notional;
      }

      // Post-mortem #4: emergency dump if one-sided exposure blows through cap
      if (checkEmergencyDump(state)) {
        console.error(`  *** [EMERGENCY] ${marketId}: ONE-SIDED EXPOSURE EXCEEDED CAP ***`);
        console.error(`  *** Bid notional: $${state.bidNotional.toFixed(2)} | Ask notional: $${state.askNotional.toFixed(2)} ***`);
        console.error(`  *** HALTING all quoting for this market ***`);
        state.emergencyDumpTriggered = true;
        await orderMgr.cancelMarket(marketId);
      }
    }

    // Periodic fill balance report
    if (tick % 120 === 0 && (state.bidFills + state.askFills) > 0) {
      const total = state.bidFills + state.askFills;
      const bidPct = ((state.bidFills / total) * 100).toFixed(0);
      console.log(`  [FILLS] ${marketId}: ${state.bidFills} bid / ${state.askFills} ask (${bidPct}% bid) | $${state.bidNotional.toFixed(2)} bid / $${state.askNotional.toFixed(2)} ask`);
    }
  }
}

// ───────────────────── Price Update Handler ─────────────────────

const PORT = 8081;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "POST" && url.pathname === "/game-event") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const event = JSON.parse(body);
      handleGameEvent(event);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err: any) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: polyClient.isKilled ? "KILLED" : "ok",
      mode: polyClient.isDryRun ? "dry-run" : "LIVE",
      markets: markets.size,
      liveGames: [...markets.values()].filter(m => m.phase === "live").length,
      resolvedGames: [...markets.values()].filter(m => m.phase === "ended").length,
      tickMs: TICK_MS,
      numLevels: NUM_LEVELS,
      bankrollUsdc: BANKROLL_USDC,
      bankrollScale: BANKROLL_SCALE,
      maxFillSizeUsdc: Number(MAX_FILL_SIZE_USDC) / 1_000_000,
      sizePerLevelUsdc: Number(SIZE_PER_LEVEL_CAP) / 1_000_000,
      orders: orderMgr.getStats(),
      client: polyClient.getStats(),
      marketState: Object.fromEntries(
        [...markets.entries()].map(([id, s]) => [id, {
          fairValue: s.fairValue,
          lmsrPrice: lmsrGetYesPrice(s),
          phase: s.phase,
          hasBridgePrice: s.hasBridgePrice,
          lastUpdate: s.lastUpdate,
          staleSec: Math.round((Date.now() - s.lastUpdate) / 1000),
          yesBalance: Math.round(s.yesBalance * 100) / 100,
          noBalance: Math.round(s.noBalance * 100) / 100,
          yesValueUsdc: Math.round(s.yesBalance * s.fairValue * 100) / 100,
          noValueUsdc: Math.round(s.noBalance * (1 - s.fairValue) * 100) / 100,
          bidFills: s.bidFills,
          askFills: s.askFills,
          bidNotional: Math.round(s.bidNotional * 100) / 100,
          askNotional: Math.round(s.askNotional * 100) / 100,
          oneSidedWideningActive: s.oneSidedWideningActive,
          emergencyDumpTriggered: s.emergencyDumpTriggered,
        }])
      ),
    }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/game-status") {
    const gamesList = [...markets.entries()].map(([id, s]) => {
      const gameConf = games.find(g => g.id === id);
      return {
        marketId: id,
        fairValue: s.fairValue,
        phase: s.phase,
        sport: gameConf?.sport ?? "unknown",
        league: gameConf?.league ?? "",
        teamA: gameConf?.teamA ?? "",
        teamB: gameConf?.teamB ?? "",
        polymarketSlug: gameConf?.polymarketSlug ?? "",
        sportradarEventId: gameConf?.sportradarEventId ?? "",
      };
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ games: gamesList }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/fills") {
    const fills = orderMgr.getFills();
    const totalNotional = fills.reduce((sum, f) => sum + f.price * f.size, 0);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      totalFills: fills.length,
      totalNotionalUsdc: Math.round(totalNotional * 100) / 100,
      fills: fills.map(f => ({
        side: f.side,
        price: f.price,
        size: Math.round(f.size * 100) / 100,
        notional: Math.round(f.price * f.size * 100) / 100,
        queueAgeSec: Math.round(f.queueAgeMs / 1000),
      })),
    }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/kill") {
    await polyClient.kill("Manual kill switch");
    await orderMgr.withdrawAll();
    res.writeHead(200);
    res.end(JSON.stringify({ killed: true }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

function handleGameEvent(event: any) {
  const { marketId, eventType, data } = event;
  const state = markets.get(marketId);
  if (!state) return;

  const rm = state.riskManager;

  // Sport parser — MATCHES SIM (line 704-718)
  const parser = sportParsers.get(marketId);
  const parserState = parserStates.get(marketId);
  if (parser && parserState && rm) {
    const signal = parser.parseEvent(event as GameEvent, parserState);
    rm.setGameRiskSignal(marketId, signal);

    if (parserState.phase === "live" && state.phase === "pre_game") {
      state.phase = "live";
      rm.setGamePhase(marketId, "live");
    }

    if (signal.shouldWithdraw || signal.shouldWiden) {
      if (tick % 60 === 0) {
        console.log(`  [SPORT] ${marketId}: ${signal.reason} (${signal.shouldWithdraw ? "WITHDRAW" : `widen ${signal.spreadMultiplier.toFixed(1)}x`})`);
      }
    }
  }

  switch (eventType) {
    case "odds_update": {
      const newFv = data?.fairValue ?? data?.probability;
      if (typeof newFv === "number" && newFv > 0.01 && newFv < 0.99) {
        if (!state.hasBridgePrice) {
          console.log(`[LIVE] ${marketId}: first bridge price → ${(newFv * 100).toFixed(1)}% (was ${(state.fairValue * 100).toFixed(1)}% from config)`);
          state.hasBridgePrice = true;
        }
        state.fairValue = newFv;
        state.lastUpdate = Date.now();

        // LMSR recenter — same as sim's amm.recenter(state.fairValue)
        const bigJump = lmsrRecenter(state, newFv);
        rm.notifyFairValue(marketId, newFv);

        // Midpoint divergence tracking — same as sim's rm.notifyMidpoint()
        if (data?.bestBid !== undefined && data?.bestAsk !== undefined) {
          const clobMid = (data.bestBid + data.bestAsk) / 2;
          rm.notifyMidpoint(marketId, clobMid);
        }

        // On big jumps (>3¢), immediately cancel stale quotes (same as LMSR.recenter)
        if (bigJump) {
          orderMgr.cancelMarket(marketId).then(() => {
            refreshAllQuotes();
          });
        }
      }
      break;
    }
    case "score_change": {
      // URGENT: score just changed — cancel all resting orders IMMEDIATELY to prevent
      // stale quotes from being picked off by informed traders. This is the #1 defense
      // against adverse selection in live sports.
      if (state.phase !== "live") {
        state.phase = "live";
        rm.setGamePhase(marketId, "live");
      }
      const prev = data?.prevScore ?? "?";
      const now = data?.newScore ?? "?";
      console.log(`  [SCORE] ${marketId}: ${prev} → ${now} — CANCELLING ALL ORDERS`);
      state.scoreFreezeUntil = Date.now() + SCORE_FREEZE_MS;
      orderMgr.cancelMarket(marketId).then(() => {
        console.log(`  [SCORE] ${marketId}: orders cancelled — frozen for ${SCORE_FREEZE_MS}ms waiting for price discovery`);
      });
      // Update parser state with score data
      if (data?.fairValue) {
        state.fairValue = data.fairValue;
        state.lastUpdate = Date.now();
        lmsrRecenter(state, data.fairValue);
        rm.notifyFairValue(marketId, data.fairValue);
      }
      break;
    }
    case "score_update": {
      if (state.phase !== "live") {
        state.phase = "live";
        rm.setGamePhase(marketId, "live");
        console.log(`[LIVE] ${marketId}: → LIVE`);
      }
      if (data?.fairValue) {
        state.fairValue = data.fairValue;
        state.lastUpdate = Date.now();
        lmsrRecenter(state, data.fairValue);
        rm.notifyFairValue(marketId, data.fairValue);
      }
      break;
    }
    case "game_start": {
      if (state.phase === "pre_game") {
        state.phase = "live";
        rm.setGamePhase(marketId, "live");
        console.log(`[LIVE] ${marketId}: → LIVE (game_start)`);
      }
      break;
    }
    case "external_trade": {
      // External trades are OTHER people's trades on the CLOB — the AMM didn't participate.
      // Don't call recordFill() which would falsely inflate our position counters and
      // blow through the $25 cap after a single $50 external trade.
      // TODO: Add a dedicated recordExternalFlow() to RiskManager that updates VPIN/Bayesian
      // tracking without touching inventory counters.
      break;
    }
    case "game_end": {
      state.phase = "ended";
      rm.setGamePhase(marketId, "ended");
      console.log(`[LIVE] ${marketId}: → ENDED`);
      orderMgr.cancelMarket(marketId);
      break;
    }
  }
}

// ───────────────────── Graceful Shutdown ─────────────────────

async function shutdown(signal: string) {
  console.log(`\n[LIVE] ${signal} received — cancelling all orders...`);
  await orderMgr.withdrawAll();
  console.log(`[LIVE] All orders cancelled. Exiting.`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", async (err) => {
  console.error(`[LIVE] Uncaught exception:`, err);
  await orderMgr.withdrawAll();
  process.exit(1);
});

// ───────────────────── VPN Guard ─────────────────────

const vpnGuard = new VpnGuard({
  socksProxy: SOCKS_PROXY,
  skipChecks: skipVpn || !isLive,
  onVpnDrop: async (reason) => {
    console.error(`\n[VPN] *** VPN DROPPED *** ${reason}`);
    console.error(`[VPN] Killing all orders immediately!`);
    await polyClient.kill(`VPN dropped: ${reason}`);
    await orderMgr.withdrawAll();
  },
});

// ───────────────────── Start ─────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(` SPORTS MM — LIVE TRADING SERVER (v3: FAST TICK + MERGE + SCORE-AWARE)`);
console.log(` Mode: ${isLive ? "*** LIVE — REAL MONEY ***" : "DRY RUN (safe)"}`);
console.log(` Inventory: SELL tokens when held, BUY opposite when empty`);
console.log(` VPN: ${skipVpn ? "SKIPPED" : SOCKS_PROXY ? "SOCKS5 proxy" : "system VPN (NordVPN)"}`);
console.log(` Max loss: $${maxLoss}`);
console.log(` Markets: ${games.length}`);
console.log(` Tick interval: ${TICK_MS}ms`);
console.log(` Levels: ${NUM_LEVELS}`);
console.log(` Bankroll: $${BANKROLL_USDC}`);
console.log(` Max fill size: $${(Number(MAX_FILL_SIZE_USDC) / 1_000_000).toFixed(1)}`);
console.log(` Size/level: $${(Number(SIZE_PER_LEVEL_CAP) / 1_000_000).toFixed(1)}`);
console.log(` Capital headroom: ${(CAPITAL_HEADROOM * 100).toFixed(0)}% (max $${MAX_DEPLOYED_USDC} deployed)`);
console.log(` One-sided fill threshold: ${(ONE_SIDED_THRESHOLD * 100).toFixed(0)}% → ${ONE_SIDED_SPREAD_MULT}x spread`);
console.log(` Emergency dump: ${EMERGENCY_DUMP_MULT}x position cap`);
console.log(` Bridge port: ${PORT}`);
console.log(`${"=".repeat(60)}\n`);

// Log per-game risk config for verification
for (const game of games) {
  const rc = game.riskConfig;
  console.log(`  ${game.id}:`);
  console.log(`    spread=${(rc.baseHalfSpread * 100).toFixed(0)}¢ | cap=$${rc.positionCapUsdc / 1_000_000} | skew=${rc.inventorySkewPerUnit}`);
}
console.log();

vpnGuard.activateProxy();

if (isLive) {
  try {
    await vpnGuard.verifyLocation();
  } catch (err: any) {
    console.error(`\n[VPN] *** BLOCKED *** ${err.message}`);
    console.error(`[VPN] Cannot start live trading without VPN to an allowed country.`);
    console.error(`[VPN] Allowed: CH, DE, AT, PT, SG, JP, KR, HK, AE`);
    process.exit(1);
  }
}

await polyClient.init();

// Clean slate: cancel any stale orders from previous runs
if (!polyClient.isDryRun) {
  console.log(`[LIVE] Cancelling any stale orders from previous session...`);
  await polyClient.cancelAll();
  await new Promise(r => setTimeout(r, 2000)); // let CLOB settle
}

vpnGuard.startMonitoring();

server.listen(PORT, () => {
  console.log(`[LIVE] Server listening on :${PORT}`);
  console.log(`[LIVE] Start the bridge: SIM_SERVER_URL=http://localhost:${PORT} npx tsx scripts/sports-bridge.ts --source polymarket-live`);
  console.log();
});

// Start tick loop — 500ms for fast adverse-selection response
setInterval(refreshAllQuotes, TICK_MS);

// Initial quote after short delay for bridge to connect
setTimeout(refreshAllQuotes, 1000);
