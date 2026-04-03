/**
 * Mean-Reversion Live Trading Server.
 *
 * Identical infrastructure to live-trading-server.ts, but with ONE key change:
 * the fair value is FIXED at a configurable target (default 50%) instead of
 * tracking the CLOB midpoint. The LMSR + RiskManager pipeline then naturally
 * quotes around 50%, buying the underdog when one team is heavily favored and
 * selling as price reverts toward the target.
 *
 * Usage:
 *   npx tsx scripts/live-trading-server-meanrevert.ts --game cbb-pur-ucla-2026-03-14 --live --max-loss 15
 *   npx tsx scripts/live-trading-server-meanrevert.ts --game cbb-pur-ucla-2026-03-14 --live --target 0.50
 */

import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
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
const targetIdx = args.indexOf("--target");
const TARGET_FV = targetIdx !== -1 ? parseFloat(args[targetIdx + 1] || "0.50") : 0.50;

// Auto-exit: sell everything and shut down before game ends
// --exit-before-end 5   → exit 5 minutes before estimated game end
// --game-duration 120   → estimated real-time game length in minutes (default 120 for CBB)
// --exit-after 115      → exit 115 minutes after bot start (overrides exit-before-end)
const exitBeforeEndIdx = args.indexOf("--exit-before-end");
const EXIT_BEFORE_END_MIN = exitBeforeEndIdx !== -1 ? parseFloat(args[exitBeforeEndIdx + 1] || "5") : 0;
const gameDurationIdx = args.indexOf("--game-duration");
const GAME_DURATION_MIN = gameDurationIdx !== -1 ? parseFloat(args[gameDurationIdx + 1] || "120") : 120;
const exitAfterIdx = args.indexOf("--exit-after");
const EXIT_AFTER_MIN = exitAfterIdx !== -1 ? parseFloat(args[exitAfterIdx + 1] || "0") : 0;

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
  // Cost basis tracking for profit-taking
  yesCostBasis: number;    // weighted avg price paid per YES token
  noCostBasis: number;     // weighted avg price paid per NO token
  yesTotalSpent: number;   // total USDC spent buying YES
  noTotalSpent: number;    // total USDC spent buying NO
  yesTotalBought: number;  // total YES tokens acquired
  noTotalBought: number;   // total NO tokens acquired
  lastMarketYesPrice: number; // latest CLOB YES price (for profit calc)
  // Optimistic balance: tracks expected tokens from crossing-spread BUYs
  // before the on-chain balance refresh confirms them.
  pendingYesBuys: number;
  pendingNoBuys: number;
  // Cooldown: after profit-taking, pause buying for N seconds
  profitCooldownUntil: number;
}

// Global pause flag — settable via /stop endpoint
let meanReversionPaused = false;

// Directional bet mode — overrides mean-reversion with a one-sided position
interface DirectionalBet {
  team: "yes" | "no";   // "yes" = teamA, "no" = teamB
  teamName: string;
  price: number;         // max price to buy at
  size: number;          // tokens to buy (0 = use bankroll)
  active: boolean;
}
let directionalBet: DirectionalBet | null = null;

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

// ── Cost basis persistence ──
// Saves/loads cost basis to a JSON file so restarts don't lose track of actual purchase prices.
const COST_BASIS_DIR = resolve(__dirname, "../data");
function costBasisPath(gameId: string): string {
  return resolve(COST_BASIS_DIR, `cost-basis-${gameId}.json`);
}

interface PersistedCostBasis {
  yesCostBasis: number;
  noCostBasis: number;
  yesTotalSpent: number;
  noTotalSpent: number;
  yesTotalBought: number;
  noTotalBought: number;
  savedAt: string;
}

function saveCostBasis(gameId: string, state: MarketState): void {
  try {
    if (!existsSync(COST_BASIS_DIR)) {
      const { mkdirSync } = require("fs");
      mkdirSync(COST_BASIS_DIR, { recursive: true });
    }
    const data: PersistedCostBasis = {
      yesCostBasis: state.yesCostBasis,
      noCostBasis: state.noCostBasis,
      yesTotalSpent: state.yesTotalSpent,
      noTotalSpent: state.noTotalSpent,
      yesTotalBought: state.yesTotalBought,
      noTotalBought: state.noTotalBought,
      savedAt: new Date().toISOString(),
    };
    writeFileSync(costBasisPath(gameId), JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error(`[COST] Failed to save cost basis: ${err.message}`);
  }
}

function loadCostBasis(gameId: string): PersistedCostBasis | null {
  try {
    const p = costBasisPath(gameId);
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as PersistedCostBasis;
    if (data.yesCostBasis > 0 || data.noCostBasis > 0) {
      console.log(`[COST] Loaded persisted cost basis for ${gameId}: YES=${(data.yesCostBasis*100).toFixed(1)}¢ NO=${(data.noCostBasis*100).toFixed(1)}¢ (saved ${data.savedAt})`);
      return data;
    }
    return null;
  } catch {
    return null;
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

  // MEAN-REVERSION: always seed LMSR at TARGET_FV, not the live midpoint.
  // We still fetch the live mid for logging, but the bot quotes around TARGET_FV.
  const liveMid = await fetchLiveMidpoint(tokenIds[0]);
  const seedProb = TARGET_FV;
  console.log(`[MR] ${game.id}: LMSR seeded at TARGET ${(TARGET_FV * 100).toFixed(0)}% (live market is ${liveMid ? (liveMid * 100).toFixed(1) + "%" : "unknown"})`);

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

  // Load persisted cost basis first — this is the real purchase price from prior sessions.
  const persisted = loadCostBasis(game.id);
  let seedYesCost: number;
  let seedNoCost: number;
  let seedYesTotalSpent: number;
  let seedNoTotalSpent: number;
  let seedYesTotalBought: number;
  let seedNoTotalBought: number;

  if (persisted) {
    seedYesCost = persisted.yesCostBasis;
    seedNoCost = persisted.noCostBasis;
    seedYesTotalSpent = persisted.yesTotalSpent;
    seedNoTotalSpent = persisted.noTotalSpent;
    seedYesTotalBought = persisted.yesTotalBought;
    seedNoTotalBought = persisted.noTotalBought;
  } else {
    const currentNoPrice = liveMid !== null ? (1 - liveMid) : (1 - game.initialProb);
    const currentYesPrice = liveMid ?? game.initialProb;
    seedYesCost = initYesBal > 0 ? currentYesPrice : 0;
    seedNoCost = initNoBal > 0 ? currentNoPrice : 0;
    seedYesTotalSpent = initYesBal * seedYesCost;
    seedNoTotalSpent = initNoBal * seedNoCost;
    seedYesTotalBought = initYesBal;
    seedNoTotalBought = initNoBal;
  }

  if (initYesBal > 0 || initNoBal > 0) {
    const src = persisted ? "PERSISTED" : "ESTIMATED";
    console.log(`[MR] ${game.id}: EXISTING POSITION — YES=${initYesBal.toFixed(2)} (${src} basis ${(seedYesCost*100).toFixed(1)}¢) NO=${initNoBal.toFixed(2)} (${src} basis ${(seedNoCost*100).toFixed(1)}¢)`);
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
    yesCostBasis: seedYesCost,
    noCostBasis: seedNoCost,
    yesTotalSpent: seedYesTotalSpent,
    noTotalSpent: seedNoTotalSpent,
    yesTotalBought: seedYesTotalBought,
    noTotalBought: seedNoTotalBought,
    lastMarketYesPrice: liveMid ?? game.initialProb,
    pendingYesBuys: 0,
    pendingNoBuys: 0,
    profitCooldownUntil: 0,
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

  if (tick % 120 === 0) {
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

  // ── PROFIT-TAKING: sell at market when holdings are up 10% from cost basis ──
  const PROFIT_TARGET = 0.10;
  const profitQuotes: QuoteLevel[] = [];

  const MIN_SELL_SIZE = 5;
  if (state.yesBalance >= MIN_SELL_SIZE && state.yesCostBasis > 0) {
    const mktYes = state.lastMarketYesPrice;
    const gain = (mktYes - state.yesCostBasis) / state.yesCostBasis;
    if (gain >= PROFIT_TARGET) {
      const sellPrice = Math.round(Math.max(mktYes - 0.01, state.yesCostBasis * (1 + PROFIT_TARGET)) * 100) / 100;
      const sellQty = Math.max(MIN_SELL_SIZE, Math.round(state.yesBalance * 100) / 100);
      if (sellPrice > 0.01 && sellPrice < 0.99) {
        profitQuotes.push({
          price: sellPrice,
          size: sellQty,
          side: "SELL",
          tokenId: state.yesTokenId,
        });
        if (tick % 10 === 0) console.log(`  [TAKE-PROFIT] YES up ${(gain*100).toFixed(1)}% (basis ${(state.yesCostBasis*100).toFixed(0)}¢ → mkt ${(mktYes*100).toFixed(0)}¢) — SELL ${sellQty} @ ${sellPrice}`);
      }
    }
  }

  if (state.noBalance >= MIN_SELL_SIZE && state.noCostBasis > 0) {
    const mktNo = 1 - state.lastMarketYesPrice;
    const gain = (mktNo - state.noCostBasis) / state.noCostBasis;
    if (gain >= PROFIT_TARGET) {
      const sellPrice = Math.round(Math.max(mktNo - 0.01, state.noCostBasis * (1 + PROFIT_TARGET)) * 100) / 100;
      const sellQty = Math.max(MIN_SELL_SIZE, Math.round(state.noBalance * 100) / 100);
      if (sellPrice > 0.01 && sellPrice < 0.99) {
        profitQuotes.push({
          price: sellPrice,
          size: sellQty,
          side: "SELL",
          tokenId: state.noTokenId,
        });
        if (tick % 10 === 0) console.log(`  [TAKE-PROFIT] NO up ${(gain*100).toFixed(1)}% (basis ${(state.noCostBasis*100).toFixed(0)}¢ → mkt ${(mktNo*100).toFixed(0)}¢) — SELL ${sellQty} @ ${sellPrice}`);
      }
    }
  }

  // If profit-taking is active, ONLY do that — don't place new accumulation orders.
  // Also start a cooldown so the bot doesn't immediately rebuy at worse prices.
  if (profitQuotes.length > 0) {
    state.profitCooldownUntil = Date.now() + 120_000; // 2-minute cooldown after profit-taking
    return profitQuotes;
  }

  // Don't place BUY orders during profit cooldown or when manually paused
  const buysPaused = meanReversionPaused || Date.now() < state.profitCooldownUntil;
  if (buysPaused && tick % 30 === 0) {
    const reason = meanReversionPaused ? "MANUAL PAUSE" : `COOLDOWN (${Math.round((state.profitCooldownUntil - Date.now()) / 1000)}s left)`;
    console.log(`  [PAUSED] ${state.gameId}: ${reason} — only SELL orders allowed`);
  }

  const rmConfig = rm.getConfig();
  const sizePerLevel = rmConfig.maxFillSizeUsdc < SIZE_PER_LEVEL_CAP
    ? rmConfig.maxFillSizeUsdc
    : SIZE_PER_LEVEL_CAP;

  // Effective balance = on-chain + pending (optimistic) buys not yet confirmed
  const effectiveYesBal = state.yesBalance + state.pendingYesBuys;
  const effectiveNoBal = state.noBalance + state.pendingNoBuys;

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
        } else if (!buysPaused && effectiveYesBal <= 5) {
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
        } else if (!buysPaused && effectiveNoBal <= 5) {
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
    // EXCEPTION: if we already hold tokens, auto-bootstrap from CLOB midpoint
    // so profit-taking can work even without the bridge.
    if (!state.hasBridgePrice) {
      const liveMid = await fetchLiveMidpoint(state.yesTokenId);
      if (liveMid !== null) {
        console.log(`[MR] ${marketId}: auto-bootstrap from CLOB midpoint ${(liveMid * 100).toFixed(1)}% — starting mean-reversion`);
        state.hasBridgePrice = true;
        state.lastMarketYesPrice = liveMid;
        state.fairValue = TARGET_FV;
        state.phase = "live";
        lmsrRecenter(state, TARGET_FV);
        state.riskManager.notifyFairValue(marketId, TARGET_FV);
        state.riskManager.notifyMidpoint(marketId, TARGET_FV);
      }
      if (!state.hasBridgePrice) {
        if (tick % 60 === 0) console.log(`  [WAIT] ${marketId}: waiting for CLOB midpoint...`);
        continue;
      }
    }
    if (state.phase === "pre_game") {
      if (tick % 60 === 0) console.log(`  [WAIT] ${marketId}: game not live yet (phase=${state.phase}) — not quoting`);
      continue;
    }

    const rm = state.riskManager;

    // MEAN-REVERSION FIX: fetch live CLOB midpoint every tick so profit-taking
    // sees the real market price, not the stale bridge value (which is pinned at TARGET_FV).
    const liveMid = await fetchLiveMidpoint(state.yesTokenId);
    if (liveMid !== null) {
      state.lastMarketYesPrice = liveMid;
      // Keep lastUpdate fresh so the RiskManager doesn't think data is stale.
      // Without the bridge, CLOB REST midpoint is our price source.
      state.lastUpdate = Date.now();
      rm.notifyFairValue(marketId, TARGET_FV);
      rm.notifyMidpoint(marketId, TARGET_FV);
    }

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
      // Compare against last CONFIRMED balance (before pending), not the optimistic one
      const yDelta = yBal - (state.yesBalance - state.pendingYesBuys);
      const nDelta = nBal - (state.noBalance - state.pendingNoBuys);
      // On-chain is ground truth — reset pending tracking
      state.pendingYesBuys = 0;
      state.pendingNoBuys = 0;
      if (Math.abs(yDelta) > 0.01 || Math.abs(nDelta) > 0.01) {
        console.log(`  [BALANCE] ${marketId}: YES ${state.yesBalance.toFixed(2)}→${yBal.toFixed(2)} (Δ${yDelta > 0 ? "+" : ""}${yDelta.toFixed(2)}) | NO ${state.noBalance.toFixed(2)}→${nBal.toFixed(2)} (Δ${nDelta > 0 ? "+" : ""}${nDelta.toFixed(2)})`);
        // Infer fills from balance changes + track cost basis
        if (yDelta > 0.5) {
          state.bidFills++;
          const fillPrice = state.lastMarketYesPrice;
          state.bidNotional += yDelta * fillPrice;
          state.yesTotalSpent += yDelta * fillPrice;
          state.yesTotalBought += yDelta;
          state.yesCostBasis = state.yesTotalBought > 0 ? state.yesTotalSpent / state.yesTotalBought : 0;
          console.log(`  [COST] Bought ${yDelta.toFixed(1)} YES @ ~${(fillPrice*100).toFixed(0)}¢ → avg basis ${(state.yesCostBasis*100).toFixed(1)}¢`);
          saveCostBasis(marketId, state);
        }
        if (nDelta > 0.5) {
          state.askFills++;
          const fillPrice = 1 - state.lastMarketYesPrice;
          state.askNotional += nDelta * fillPrice;
          state.noTotalSpent += nDelta * fillPrice;
          state.noTotalBought += nDelta;
          state.noCostBasis = state.noTotalBought > 0 ? state.noTotalSpent / state.noTotalBought : 0;
          console.log(`  [COST] Bought ${nDelta.toFixed(1)} NO @ ~${(fillPrice*100).toFixed(0)}¢ → avg basis ${(state.noCostBasis*100).toFixed(1)}¢`);
          saveCostBasis(marketId, state);
        }
        if (yDelta < -0.5) {
          const sellPrice = state.lastMarketYesPrice;
          const pnl = Math.abs(yDelta) * (sellPrice - state.yesCostBasis);
          console.log(`  [PROFIT] Sold ${Math.abs(yDelta).toFixed(2)} YES @ ~${(sellPrice*100).toFixed(0)}¢ (basis ${(state.yesCostBasis*100).toFixed(1)}¢) → P&L $${pnl.toFixed(2)}`);
        }
        if (nDelta < -0.5) {
          const sellPrice = 1 - state.lastMarketYesPrice;
          const pnl = Math.abs(nDelta) * (sellPrice - state.noCostBasis);
          console.log(`  [PROFIT] Sold ${Math.abs(nDelta).toFixed(2)} NO @ ~${(sellPrice*100).toFixed(0)}¢ (basis ${(state.noCostBasis*100).toFixed(1)}¢) → P&L $${pnl.toFixed(2)}`);
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

    const mkt = (state.lastMarketYesPrice * 100).toFixed(1);
    const basis = state.yesCostBasis > 0 ? (state.yesCostBasis * 100).toFixed(1) : "-";
    const gain = state.yesCostBasis > 0 ? (((state.lastMarketYesPrice - state.yesCostBasis) / state.yesCostBasis) * 100).toFixed(1) : "-";
    const profitAt = state.yesCostBasis > 0 ? (state.yesCostBasis * 1.10 * 100).toFixed(1) : "-";

    if (tick % 20 === 0) {
      const pendingTag = (state.pendingYesBuys > 0 || state.pendingNoBuys > 0) ? ` pend:Y${state.pendingYesBuys.toFixed(0)}/N${state.pendingNoBuys.toFixed(0)}` : "";
      const pauseTag = directionalBet?.active ? ` [BET ${directionalBet.teamName}]` : meanReversionPaused ? " [PAUSED]" : (Date.now() < state.profitCooldownUntil ? " [COOLDOWN]" : "");
      const quotePrices = quotes.map(q => `${q.side === "SELL" ? "S" : "B"}${(q.price * 100).toFixed(0)}¢×${q.size.toFixed(1)}`).join(" ");
      console.log(`  [TICK ${tick}] mkt=${mkt}¢ basis=${basis}¢ gain=${gain}% (take@${profitAt}¢) | ${quotePrices} | YES=${state.yesBalance.toFixed(1)} NO=${state.noBalance.toFixed(1)}${pendingTag}${pauseTag} tracked=${orderMgr.getOrderCount(marketId)}`);
    } else if (tick % 60 === 30) {
      console.log(`  [MKT] ${mkt}¢ | YES=${state.yesBalance.toFixed(1)} NO=${state.noBalance.toFixed(1)} | basis=${basis}¢ gain=${gain}% take@${profitAt}¢`);
    }

    if (quotes.length === 0) {
      await orderMgr.cancelMarket(marketId);
      continue;
    }

    if (tick % 240 === 0) {
      const stats = orderMgr.getStats();
      console.log(`  [STATS] kept=${stats.ordersKept} replaced=${stats.ordersReplaced} fills=${stats.fillsDetected} queue=${Math.round(stats.maxQueueAgeMs / 1000)}s`);
    }

    // Detect profit-taking: computeQuotes sets profitCooldownUntil when it returns profit sells.
    const isProfitTaking = state.profitCooldownUntil > Date.now() &&
      quotes.length > 0 && quotes.every(q => q.side === "SELL");

    if (isProfitTaking) {
      if (tick % 10 !== 0) continue;
      if (orderMgr.getOrderCount(marketId) > 0) {
        await orderMgr.withdrawAll();
      }
      await polyClient.cancelAll(true);
      await new Promise(r => setTimeout(r, 5000));

      const MIN_ORDER = 5;
      for (const q of quotes) {
        // If total size fits in one order, just place it; otherwise split into two
        if (q.size < MIN_ORDER * 2) {
          // Single order — don't split below minimum
          try {
            const size = Math.max(MIN_ORDER, Math.round(q.size * 100) / 100);
            const id = await polyClient.placeOrder({ tokenId: q.tokenId, price: q.price, size, side: "SELL" });
            if (id) console.log(`  [TAKE-PROFIT] ✓ SELL ${size} @ ${q.price} → ${id}`);
          } catch {
            await new Promise(r => setTimeout(r, 2000));
            await orderMgr.updateQuotes(marketId, [q]);
          }
        } else {
          const chunk = Math.max(MIN_ORDER, Math.round((q.size / 2) * 100) / 100);
          const remainder = Math.max(MIN_ORDER, Math.round((q.size - chunk) * 100) / 100);
          try {
            const id1 = await polyClient.placeOrder({ tokenId: q.tokenId, price: q.price, size: chunk, side: "SELL" });
            if (id1) console.log(`  [TAKE-PROFIT] ✓ SELL ${chunk} @ ${q.price} → ${id1}`);
            await new Promise(r => setTimeout(r, 1500));
            const id2 = await polyClient.placeOrder({ tokenId: q.tokenId, price: q.price, size: remainder, side: "SELL" });
            if (id2) console.log(`  [TAKE-PROFIT] ✓ SELL ${remainder} @ ${q.price} → ${id2}`);
          } catch {
            await new Promise(r => setTimeout(r, 3000));
            await orderMgr.updateQuotes(marketId, [q]);
          }
        }
      }
    } else {
      await orderMgr.smartUpdateQuotes(marketId, quotes);
    }

    // Optimistic balance: when BUY orders cross the spread (priced well above market),
    // assume they'll fill immediately and add to pending balance.
    // This prevents the rapid-fire BUY loop that caused the 128-token fill.
    for (const q of quotes) {
      if (q.side !== "BUY") continue;
      const isYesBuy = q.tokenId === state.yesTokenId;
      const marketPrice = isYesBuy ? state.lastMarketYesPrice : (1 - state.lastMarketYesPrice);
      if (q.price > marketPrice + 0.05) {
        if (isYesBuy) {
          state.pendingYesBuys += q.size;
          state.yesBalance += q.size;
        } else {
          state.pendingNoBuys += q.size;
          state.noBalance += q.size;
        }
        if (tick % 20 === 0) {
          console.log(`  [OPTIMISTIC] ${isYesBuy ? "YES" : "NO"} +${q.size.toFixed(1)} pending (price ${(q.price * 100).toFixed(0)}¢ >> market ${(marketPrice * 100).toFixed(0)}¢)`);
        }
      }
    }

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

const PORT = 8082;

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

  if (req.method === "POST" && url.pathname === "/stop") {
    meanReversionPaused = true;
    await orderMgr.withdrawAll();
    console.log(`\n  *** [STOP] Mean-reversion PAUSED — all orders cancelled, no new BUYs ***`);
    console.log(`  *** To resume: curl -X POST http://localhost:${PORT}/resume ***\n`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ paused: true, message: "Mean-reversion stopped. SELL-only mode. POST /resume to restart." }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/resume") {
    meanReversionPaused = false;
    directionalBet = null;
    for (const [, state] of markets) {
      state.profitCooldownUntil = 0;
    }
    console.log(`\n  *** [RESUME] Mean-reversion RESUMED — normal quoting restored ***\n`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ paused: false, message: "Mean-reversion resumed." }));
    return;
  }

  // POST /bet — stop mean-reversion and place a directional bet
  // Body: { "team": "sdst" | "utahst" | "yes" | "no", "price": 0.96, "size": 0 }
  // size=0 means use all available bankroll at given price
  if (req.method === "POST" && url.pathname === "/bet") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const params = JSON.parse(body);
      const teamInput = (params.team || "").toString().toLowerCase().trim();
      const price = parseFloat(params.price) || 0;
      const size = parseFloat(params.size) || 0;

      if (!teamInput || price <= 0 || price >= 1) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Need { team, price (0-1), size (optional) }" }));
        return;
      }

      // Find the market (use first active market)
      const marketEntry = [...markets.entries()][0];
      if (!marketEntry) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No active market" }));
        return;
      }
      const [marketId, state] = marketEntry;
      const gameConf = games.find(g => g.id === marketId);
      const teamAName = gameConf?.teamA?.toLowerCase() ?? "yes";
      const teamBName = gameConf?.teamB?.toLowerCase() ?? "no";

      // Resolve which side to buy
      let side: "yes" | "no";
      let teamName: string;
      if (teamInput === "yes" || teamInput === teamAName || teamInput.includes(teamAName.slice(0, 4))) {
        side = "yes";
        teamName = gameConf?.teamA ?? "YES";
      } else if (teamInput === "no" || teamInput === teamBName || teamInput.includes(teamBName.slice(0, 4))) {
        side = "no";
        teamName = gameConf?.teamB ?? "NO";
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Unknown team '${teamInput}'. Use '${teamAName}' or '${teamBName}'` }));
        return;
      }

      // Stop mean-reversion
      meanReversionPaused = true;
      await orderMgr.withdrawAll();
      await polyClient.cancelAll();
      await new Promise(r => setTimeout(r, 2000));

      // Calculate size from bankroll if not specified
      const tokenId = side === "yes" ? state.yesTokenId : state.noTokenId;
      const buySize = size > 0 ? size : Math.floor(MAX_DEPLOYED_USDC / price);

      // Place the directional buy
      const orderId = await polyClient.placeOrder({
        tokenId,
        price,
        size: buySize,
        side: "BUY",
      });

      directionalBet = { team: side, teamName, price, size: buySize, active: true };

      console.log(`\n  *** [BET] Betting on ${teamName} — BUY ${buySize} ${side.toUpperCase()} @ ${(price * 100).toFixed(0)}¢ ***`);
      console.log(`  *** Mean-reversion STOPPED. curl -X POST http://localhost:${PORT}/resume to go back to MR ***\n`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        team: teamName,
        side,
        price,
        size: buySize,
        orderId,
        message: `Betting on ${teamName}. Mean-reversion stopped. POST /resume to return to MR.`,
      }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/kill") {
    await polyClient.kill("Manual kill switch");
    await orderMgr.withdrawAll();
    res.writeHead(200);
    res.end(JSON.stringify({ killed: true }));
    return;
  }

  // POST /exit — liquidate all positions at market and shut down
  if (req.method === "POST" && url.pathname === "/exit") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ exiting: true, message: "Liquidating all positions and shutting down..." }));
    exitAndLiquidate("Manual /exit triggered");
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
          console.log(`[MR] ${marketId}: first bridge price → ${(newFv * 100).toFixed(1)}% | TARGET FV pinned at ${(TARGET_FV * 100).toFixed(0)}%`);
          state.hasBridgePrice = true;
          // MEAN-REVERSION: pin LMSR to TARGET_FV on first price, not CLOB midpoint
          lmsrRecenter(state, TARGET_FV);
          rm.notifyFairValue(marketId, TARGET_FV);
        }
        // MEAN-REVERSION: pin FV at target, NOT the CLOB midpoint.
        state.fairValue = TARGET_FV;
        state.lastMarketYesPrice = newFv; // track real market price for cost basis / profit calc
        state.lastUpdate = Date.now();
        rm.notifyFairValue(marketId, TARGET_FV);

        // Feed RM our target as the "midpoint" so divergence check doesn't withdraw us.
        rm.notifyMidpoint(marketId, TARGET_FV);
      }
      break;
    }
    case "score_change": {
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
      // MEAN-REVERSION: keep FV pinned at target, don't track score-driven price
      state.fairValue = TARGET_FV;
      state.lastUpdate = Date.now();
      rm.notifyFairValue(marketId, TARGET_FV);
      break;
    }
    case "score_update": {
      if (state.phase !== "live") {
        state.phase = "live";
        rm.setGamePhase(marketId, "live");
        console.log(`[MR] ${marketId}: → LIVE`);
      }
      // MEAN-REVERSION: keep FV pinned at target
      state.fairValue = TARGET_FV;
      state.lastUpdate = Date.now();
      rm.notifyFairValue(marketId, TARGET_FV);
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

// ───────────────────── Auto-Exit / Liquidation ─────────────────────

let exitTriggered = false;

async function exitAndLiquidate(reason: string) {
  if (exitTriggered) return;
  exitTriggered = true;

  console.log(`\n${"!".repeat(60)}`);
  console.log(`  [EXIT] ${reason}`);
  console.log(`  [EXIT] Cancelling all orders and liquidating positions...`);
  console.log(`${"!".repeat(60)}\n`);

  meanReversionPaused = true;
  await orderMgr.withdrawAll();
  await polyClient.cancelAll();
  await new Promise(r => setTimeout(r, 5000));

  const MIN_ORDER = 5;
  for (const [marketId, state] of markets) {
    // Sell YES tokens at market
    if (state.yesBalance >= MIN_ORDER) {
      const mid = state.lastMarketYesPrice || 0.50;
      const sellPrice = Math.max(0.01, Math.round((mid - 0.02) * 100) / 100);
      const size = Math.round(state.yesBalance * 100) / 100;
      console.log(`  [EXIT] Selling ${size} YES @ ${sellPrice} (market ~${(mid * 100).toFixed(0)}¢)`);
      try {
        const id = await polyClient.placeOrder({ tokenId: state.yesTokenId, price: sellPrice, size, side: "SELL" });
        if (id) console.log(`  [EXIT] ✓ YES SELL placed → ${id}`);
      } catch (e: any) {
        console.log(`  [EXIT] YES SELL failed: ${e.message}`);
        // Try smaller chunks
        const half = Math.max(MIN_ORDER, Math.round(size / 2 * 100) / 100);
        try {
          await polyClient.placeOrder({ tokenId: state.yesTokenId, price: sellPrice, size: half, side: "SELL" });
          await new Promise(r => setTimeout(r, 2000));
          await polyClient.placeOrder({ tokenId: state.yesTokenId, price: sellPrice, size: half, side: "SELL" });
        } catch {}
      }
    }

    // Sell NO tokens at market
    if (state.noBalance >= MIN_ORDER) {
      const noMid = 1 - (state.lastMarketYesPrice || 0.50);
      const sellPrice = Math.max(0.01, Math.round((noMid - 0.02) * 100) / 100);
      const size = Math.round(state.noBalance * 100) / 100;
      console.log(`  [EXIT] Selling ${size} NO @ ${sellPrice} (market ~${(noMid * 100).toFixed(0)}¢)`);
      try {
        const id = await polyClient.placeOrder({ tokenId: state.noTokenId, price: sellPrice, size, side: "SELL" });
        if (id) console.log(`  [EXIT] ✓ NO SELL placed → ${id}`);
      } catch (e: any) {
        console.log(`  [EXIT] NO SELL failed: ${e.message}`);
        const half = Math.max(MIN_ORDER, Math.round(size / 2 * 100) / 100);
        try {
          await polyClient.placeOrder({ tokenId: state.noTokenId, price: sellPrice, size: half, side: "SELL" });
          await new Promise(r => setTimeout(r, 2000));
          await polyClient.placeOrder({ tokenId: state.noTokenId, price: sellPrice, size: half, side: "SELL" });
        } catch {}
      }
    }

    const yesVal = state.yesBalance * (state.lastMarketYesPrice || 0);
    const noVal = state.noBalance * (1 - (state.lastMarketYesPrice || 0));
    console.log(`  [EXIT] ${marketId}: YES=${state.yesBalance.toFixed(1)} (~$${yesVal.toFixed(2)}) NO=${state.noBalance.toFixed(1)} (~$${noVal.toFixed(2)})`);
  }

  console.log(`\n  [EXIT] Liquidation orders placed. Waiting 30s for fills before shutdown...`);
  await new Promise(r => setTimeout(r, 30_000));

  // Final cancel of any unfilled orders
  await orderMgr.withdrawAll();
  await polyClient.cancelAll();
  console.log(`  [EXIT] Shutdown complete.`);
  process.exit(0);
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
console.log(` MEAN-REVERSION BOT — TARGET ${(TARGET_FV * 100).toFixed(0)}%`);
console.log(` Mode: ${isLive ? "*** LIVE — REAL MONEY ***" : "DRY RUN (safe)"}`);
console.log(` Strategy: LMSR pinned at ${(TARGET_FV * 100).toFixed(0)}% — buy underdog, sell on reversion`);
console.log(` VPN: ${skipVpn ? "SKIPPED" : SOCKS_PROXY ? "SOCKS5 proxy" : "system VPN (NordVPN)"}`);
console.log(` Max loss: $${maxLoss}`);
console.log(` Markets: ${games.length}`);
console.log(` Tick interval: ${TICK_MS}ms`);
console.log(` Levels: ${NUM_LEVELS}`);
console.log(` Bankroll: $${BANKROLL_USDC}`);
console.log(` Max fill size: $${(Number(MAX_FILL_SIZE_USDC) / 1_000_000).toFixed(1)}`);
console.log(` Size/level: $${(Number(SIZE_PER_LEVEL_CAP) / 1_000_000).toFixed(1)}`);
console.log(` Capital headroom: ${(CAPITAL_HEADROOM * 100).toFixed(0)}% (max $${MAX_DEPLOYED_USDC} deployed)`);
if (EXIT_BEFORE_END_MIN > 0) {
  console.log(` Auto-exit: ${EXIT_BEFORE_END_MIN}min before estimated end (game ~${GAME_DURATION_MIN}min)`);
} else if (EXIT_AFTER_MIN > 0) {
  console.log(` Auto-exit: ${EXIT_AFTER_MIN}min after bot start`);
} else {
  console.log(` Auto-exit: DISABLED (use --exit-before-end 5 to enable)`);
}
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

// Skip startup cancel to preserve manually placed orders (e.g. limit sells)
if (!polyClient.isDryRun) {
  console.log(`[LIVE] Preserving existing orders on CLOB (no startup cancel)`);
}

vpnGuard.startMonitoring();

server.listen(PORT, () => {
  console.log(`[LIVE] Server listening on :${PORT}`);
  console.log(`[LIVE] Start the bridge: SIM_SERVER_URL=http://localhost:${PORT} npx tsx scripts/sports-bridge.ts --source polymarket-live`);
  console.log();
});

// ───────────────────── Auto-Exit Timer ─────────────────────

const botStartTime = Date.now();
let autoExitMs = 0;

if (EXIT_AFTER_MIN > 0) {
  autoExitMs = EXIT_AFTER_MIN * 60_000;
} else if (EXIT_BEFORE_END_MIN > 0) {
  autoExitMs = (GAME_DURATION_MIN - EXIT_BEFORE_END_MIN) * 60_000;
}

if (autoExitMs > 0) {
  const exitAt = new Date(botStartTime + autoExitMs);
  console.log(`[EXIT-TIMER] Auto-exit scheduled in ${(autoExitMs / 60_000).toFixed(0)} minutes at ${exitAt.toLocaleTimeString()}`);
  console.log(`[EXIT-TIMER] Will liquidate all positions and shut down.`);
  console.log(`[EXIT-TIMER] Manual override: curl -X POST http://localhost:${PORT}/exit\n`);

  setTimeout(() => {
    exitAndLiquidate(`Auto-exit timer fired (${(autoExitMs / 60_000).toFixed(0)} min from start)`);
  }, autoExitMs);

  // Warning 5 minutes before exit
  if (autoExitMs > 5 * 60_000) {
    setTimeout(() => {
      console.log(`\n  *** [EXIT-TIMER] WARNING: Auto-exit in 5 minutes! ***\n`);
    }, autoExitMs - 5 * 60_000);
  }
  // Warning 1 minute before exit
  if (autoExitMs > 60_000) {
    setTimeout(() => {
      console.log(`\n  *** [EXIT-TIMER] WARNING: Auto-exit in 1 minute! ***\n`);
    }, autoExitMs - 60_000);
  }
}

// Start tick loop — 500ms for fast adverse-selection response
setInterval(refreshAllQuotes, TICK_MS);

// Initial quote after short delay for bridge to connect
setTimeout(refreshAllQuotes, 1000);
