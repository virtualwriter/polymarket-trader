/**
 * Sports Market Making Simulation Server — Engine-Backed CLOB
 *
 * Uses the real MatchingEngine with CLOB order book, LMSR AMM, and
 * enhanced RiskManager with Tier 1 defenses (VPIN, toxicity, Bayesian).
 *
 * Each game has a sport-specific GameStateParser that drives spread
 * adjustments and withdrawal decisions based on live game events.
 *
 * Live odds updates arrive via POST /game-event from the sports bridge,
 * which streams from Sportradar / Betfair / The Odds API / ESPN / Polymarket.
 *
 * Usage: npx tsx scripts/sports-sim-server.ts [--config <games.json>]
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { MatchingEngine } from "../engine-src/matching/MatchingEngine.js";
import { LMSRAMMProvider } from "../engine-src/amm/LMSR.js";
import { RiskManager, type RiskConfig } from "../engine-src/mm/RiskManager.js";
import { FeeCalculator } from "../engine-src/fees/FeeCalculator.js";
import { RebatePool } from "../engine-src/fees/RebatePool.js";
import { Side, OrderType, Trade } from "../engine-src/types.js";
import type { Market } from "../engine-src/types.js";
import { FairValueAggregator } from "../engine-src/pricing/FairValueAggregator.js";
import { TennisParser } from "../engine-src/sports/TennisParser.js";
import { SoccerParser } from "../engine-src/sports/SoccerParser.js";
import { BaseballParser } from "../engine-src/sports/BaseballParser.js";
import { BasketballParser } from "../engine-src/sports/BasketballParser.js";
import type { GameStateParser, GameState as ParserGameState } from "../engine-src/sports/GameStateParser.js";
import { createGameState } from "../engine-src/sports/GameStateParser.js";
import type { Sport } from "../engine-src/sports/GameStateParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ───────────────────── Structured Data Logger ─────────────────────

const logsDir = resolve(__dirname, "../logs");
try { mkdirSync(logsDir, { recursive: true }); } catch {}
const sessionId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const eventLogPath = resolve(logsDir, `events-${sessionId}.jsonl`);
const snapshotLogPath = resolve(logsDir, `snapshots-${sessionId}.jsonl`);

function logEvent(type: string, data: Record<string, unknown>) {
  const line = JSON.stringify({ ts: Date.now(), type, ...data }) + "\n";
  try { appendFileSync(eventLogPath, line); } catch {}
}

function logSnapshot() {
  const snap: Record<string, unknown> = { ts: Date.now() };
  const games: Record<string, unknown>[] = [];
  for (const [id, state] of gameStates) {
    const summary = engine.getMarketSummary(id);
    const rm = riskManagers.get(id);
    const ds = rm?.getDefenseStats();
    const ammPos = traderAccounts.get(AMM_ADDRESS)?.positions.get(id);
    games.push({
      id, phase: state.phase, sport: state.sport,
      fairValue: state.fairValue,
      midpoint: summary?.midpoint ?? null,
      bestBid: summary?.bestBid ?? null,
      bestAsk: summary?.bestAsk ?? null,
      spread: summary ? (summary.bestAsk ?? 0) - (summary.bestBid ?? 0) : null,
      score: state.score,
      ammYesShares: ammPos?.yesShares ?? 0,
      ammNoShares: ammPos?.noShares ?? 0,
      ammFills: ammPos?.tradeCount ?? 0,
      ammRealizedPnl: ammPos?.realizedPnl ?? 0,
      vpinTriggers: ds?.vpinTriggers ?? 0,
      bayesianShifts: ds?.bayesianShifts ?? 0,
      toxicityBlocks: ds?.toxicityBlocks ?? 0,
    });
  }
  snap.games = games;
  snap.totalVolume = totalGlobalVolume;
  snap.ammTrades = ammTradeCount;
  snap.p2pTrades = p2pTradeCount;
  snap.externalTrades = externalTradeCount;
  const line = JSON.stringify(snap) + "\n";
  try { appendFileSync(snapshotLogPath, line); } catch {}
}

// ───────────────────── CLI + Config Loading ─────────────────────

const configArg = (() => {
  const idx = process.argv.indexOf("--config");
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
})();

const configPath = resolve(__dirname, configArg ?? "games.json");

interface GameConfig {
  id: string;
  question: string;
  teamA: string;
  teamB: string;
  sport: string;
  league: string;
  startTime: string;
  initialProb: number;
  betfairMarketId?: string;
  sportradarEventId?: string;
  polymarketSlug?: string;
  riskConfig?: Partial<{
    baseHalfSpread: number;
    inventorySkewPerUnit: number;
    withdrawalWindowSeconds: number;
    positionCapUsdc: number;
  }>;
}

interface GamesFile {
  games: GameConfig[];
  traders?: TraderConfig[];
}

interface TraderConfig {
  name: string;
  bias: "yes" | "no";
  smartness: number;
  budget: number;
  aggression: number;
}

let gamesConfig: GamesFile;
try {
  gamesConfig = JSON.parse(readFileSync(configPath, "utf-8"));
} catch {
  console.log(`[init] No config file found at ${configPath} — using default 4-sport demo`);
  gamesConfig = {
    games: [
      {
        id: "tennis-demo",
        question: "Will Player A beat Player B?",
        teamA: "Player A",
        teamB: "Player B",
        sport: "tennis",
        league: "ATP",
        startTime: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
        initialProb: 0.55,
        riskConfig: { baseHalfSpread: 0.015, inventorySkewPerUnit: 0.015, withdrawalWindowSeconds: 30 },
      },
      {
        id: "soccer-demo",
        question: "Will Home beat Away?",
        teamA: "Home FC",
        teamB: "Away FC",
        sport: "soccer",
        league: "EPL",
        startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        initialProb: 0.48,
        riskConfig: { baseHalfSpread: 0.02, inventorySkewPerUnit: 0.02, withdrawalWindowSeconds: 120 },
      },
      {
        id: "baseball-demo",
        question: "Will Team A beat Team B?",
        teamA: "Team A",
        teamB: "Team B",
        sport: "baseball",
        league: "MLB",
        startTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        initialProb: 0.52,
        riskConfig: { baseHalfSpread: 0.015, inventorySkewPerUnit: 0.01, withdrawalWindowSeconds: 60 },
      },
      {
        id: "basketball-demo",
        question: "Will Home beat Away?",
        teamA: "Home",
        teamB: "Away",
        sport: "basketball",
        league: "NBA",
        startTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        initialProb: 0.42,
        riskConfig: { baseHalfSpread: 0.01, inventorySkewPerUnit: 0.005, withdrawalWindowSeconds: 120 },
      },
    ],
  };
}

const TICK_MS = 2000;
const AMM_ADDRESS = "0x0000000000000000000000000000000000000AMM";
const PORT = parseInt(process.env.PORT || "8080");

// ───────────────────── Engine Setup ─────────────────────

const feeCalculator = new FeeCalculator({
  feeRate: parseFloat(process.env.FEE_RATE || "0.0175"),
  exponent: 1,
});
const rebatePool = new RebatePool(feeCalculator);
const engine = new MatchingEngine(feeCalculator, rebatePool);
const fairValueAggregator = new FairValueAggregator();

// Per-game risk managers (each game can have sport-specific tuning)
const riskManagers = new Map<string, RiskManager>();

function buildRiskManager(gameConfig: GameConfig): RiskManager {
  const rc = gameConfig.riskConfig ?? {};
  return new RiskManager({
    positionCapUsdc: BigInt(rc.positionCapUsdc ?? 5_000_000_000),
    maxFillSizeUsdc: BigInt(process.env.MM_MAX_FILL_USDC || "500000000"),
    withdrawalWindowSeconds: rc.withdrawalWindowSeconds ?? 60,
    baseHalfSpread: rc.baseHalfSpread ?? 0.02,
    inventorySkewPerUnit: rc.inventorySkewPerUnit ?? 0.01,
    inventoryUnitUsdc: BigInt(process.env.MM_SKEW_UNIT_USDC || "500000000"),
  });
}

// ───────────────────── Sport Parsers ─────────────────────

const parsers = new Map<string, GameStateParser>();
const parserStates = new Map<string, ParserGameState>();

function createSportParser(sport: string): GameStateParser {
  switch (sport.toLowerCase()) {
    case "tennis": return new TennisParser();
    case "soccer": return new SoccerParser();
    case "baseball": return new BaseballParser();
    case "basketball":
    case "hockey": return new BasketballParser();
    default: return new BasketballParser(); // Fallback
  }
}

// ───────────────────── Per-Game State ─────────────────────

type GamePhase = "pre_game" | "live" | "resolved";

interface GameState {
  marketId: string;
  phase: GamePhase;
  fairValue: number;
  score: { teamA: number; teamB: number };
  quarter: string;
  clock: string;
  lastOddsUpdate: number;
  outcome: boolean | null;
  sport: string;
  teamA: string;
  teamB: string;
}

const gameStates = new Map<string, GameState>();
const amms = new Map<string, LMSRAMMProvider>();

for (const game of gamesConfig.games) {
  const marketId = game.id;
  const endDate = new Date(game.startTime).getTime() + 4 * 60 * 60 * 1000;

  engine.registerMarket({
    id: marketId,
    questionId: "",
    conditionId: "",
    yesTokenId: `yes-${marketId}`,
    noTokenId: `no-${marketId}`,
    question: game.question,
    description: `${game.teamA} vs ${game.teamB} — ${game.league}`,
    resolutionSource: "Official game result",
    endDate,
    resolved: false,
    createdAt: Date.now(),
    lotNumber: 0,
    artist: game.teamA,
    title: `${game.teamA} vs ${game.teamB}`,
    year: game.league,
    lowEstimate: "0",
    highEstimate: "1",
    currency: "USD",
    auctionId: game.league,
  } as Market);

  // Per-game risk manager with sport-specific tuning
  const rm = buildRiskManager(game);
  rm.setAuctionEndTime(marketId, endDate);
  riskManagers.set(marketId, rm);

  // Sport parser
  const parser = createSportParser(game.sport);
  parsers.set(marketId, parser);
  parserStates.set(marketId, createGameState(game.sport.toLowerCase() as Sport, game.initialProb));

  gameStates.set(marketId, {
    marketId,
    phase: "pre_game",
    fairValue: game.initialProb,
    score: { teamA: 0, teamB: 0 },
    quarter: "Pre-Game",
    clock: "",
    lastOddsUpdate: Date.now(),
    outcome: null,
    sport: game.sport.toLowerCase(),
    teamA: game.teamA,
    teamB: game.teamB,
  });

  rm.notifyFairValue(marketId, game.initialProb);
  rm.notifyMidpoint(marketId, game.initialProb);
  rm.setGamePhase(marketId, "pre_game");

  const amm = new LMSRAMMProvider(engine, marketId, {
    liquidityParameter: 100,
    maxExposureUsdc: 10_000_000_000n,
    initialYesPrice: game.initialProb,
    riskManager: rm,
  });
  amms.set(marketId, amm);
}

engine.registerAmmFillHandler(
  "0x0000000000000000000000000000000000000AMM",
  (trade: Trade) => {
    const amm = amms.get(trade.marketId);
    if (amm) amm.onFill(trade);
  },
);

// ───────────────────── Traders ─────────────────────

interface Trader {
  name: string;
  address: string;
  bias: "yes" | "no";
  smartness: number;
  budget: number;
  aggression: number;
}

const defaultTraders: TraderConfig[] = [
  { name: "Sharp-Bettor-A",   bias: "yes", smartness: 9,  budget: 500,  aggression: 0.45 },
  { name: "Sharp-Bettor-B",   bias: "no",  smartness: 8,  budget: 400,  aggression: 0.4 },
  { name: "Model-Trader",     bias: "yes", smartness: 7,  budget: 300,  aggression: 0.35 },
  { name: "Semi-Pro-A",       bias: "no",  smartness: 5,  budget: 200,  aggression: 0.3 },
  { name: "Semi-Pro-B",       bias: "yes", smartness: 5,  budget: 150,  aggression: 0.3 },
  { name: "Retail-A",         bias: "no",  smartness: 3,  budget: 80,   aggression: 0.2 },
  { name: "Retail-B",         bias: "yes", smartness: 3,  budget: 60,   aggression: 0.2 },
  { name: "Degen-A",          bias: "no",  smartness: 1,  budget: 40,   aggression: 0.5 },
  { name: "Degen-B",          bias: "yes", smartness: 2,  budget: 35,   aggression: 0.4 },
  { name: "Whale-Sharp",      bias: "yes", smartness: 10, budget: 1000, aggression: 0.35 },
];

const traders: Trader[] = (gamesConfig.traders ?? defaultTraders).map((t) => ({
  name: t.name,
  address: t.name.toLowerCase().replace(/\s+/g, "-"),
  bias: t.bias,
  smartness: t.smartness / 10,
  budget: t.budget,
  aggression: t.aggression,
}));

// ───────────────────── P&L + Position Tracking ─────────────────────

interface OpenPosition {
  yesShares: number;
  yesCost: number;
  noShares: number;
  noCost: number;
  realizedPnl: number;
  tradeCount: number;
}

interface TraderAccount {
  realizedPnl: number;
  totalVolume: number;
  totalFees: number;
  tradeCount: number;
  preGameTrades: number;
  liveGameTrades: number;
  positions: Map<string, OpenPosition>;
}

const traderAccounts = new Map<string, TraderAccount>();

function getAccount(address: string): TraderAccount {
  if (!traderAccounts.has(address)) {
    traderAccounts.set(address, {
      realizedPnl: 0, totalVolume: 0, totalFees: 0,
      tradeCount: 0, preGameTrades: 0, liveGameTrades: 0,
      positions: new Map(),
    });
  }
  return traderAccounts.get(address)!;
}

function getPosition(account: TraderAccount, marketId: string): OpenPosition {
  if (!account.positions.has(marketId)) {
    account.positions.set(marketId, { yesShares: 0, yesCost: 0, noShares: 0, noCost: 0, realizedPnl: 0, tradeCount: 0 });
  }
  return account.positions.get(marketId)!;
}

let totalGlobalVolume = 0;
let p2pTradeCount = 0;
let ammTradeCount = 0;
let externalTradeCount = 0;
const recentTrades: any[] = [];
const wsClients = new Set<WebSocket>();

engine.subscribe((msg) => {
  if (msg.type !== "trade") return;
  const trade = msg.data as Trade;
  const sizeUsd = Number(trade.size) / 1e6;
  const feeUsd = Number(trade.fee) / 1e6;
  const state = gameStates.get(trade.marketId);
  const phase = state?.phase ?? "pre_game";

  const ammLower = AMM_ADDRESS.toLowerCase();
  const isAmm = trade.maker.toLowerCase() === ammLower || trade.taker.toLowerCase() === ammLower;
  if (isAmm) ammTradeCount++;
  else p2pTradeCount++;

  const buyerAddr = trade.side === Side.BUY ? trade.taker : trade.maker;
  const sellerAddr = trade.side === Side.BUY ? trade.maker : trade.taker;

  const buyerPos = getPosition(getAccount(buyerAddr), trade.marketId);
  const sellerPos = getPosition(getAccount(sellerAddr), trade.marketId);

  buyerPos.yesShares += sizeUsd;
  buyerPos.yesCost += sizeUsd * trade.price;
  buyerPos.tradeCount++;
  sellerPos.noShares += sizeUsd;
  sellerPos.noCost += sizeUsd * (1 - trade.price);
  sellerPos.tradeCount++;

  for (const addr of [trade.taker, trade.maker]) {
    const acct = getAccount(addr);
    acct.totalVolume += sizeUsd;
    acct.tradeCount++;
    if (phase === "live") acct.liveGameTrades++;
    else acct.preGameTrades++;
  }
  getAccount(trade.taker).totalFees += feeUsd;

  totalGlobalVolume += sizeUsd;

  logEvent("fill", {
    marketId: trade.marketId, side: trade.side === Side.BUY ? "buy" : "sell",
    price: trade.price, sizeUsd, isAmm,
    buyer: buyerAddr.slice(0, 10), seller: sellerAddr.slice(0, 10),
  });

  recentTrades.unshift({
    id: trade.id, marketId: trade.marketId,
    maker: trade.maker, taker: trade.taker,
    side: trade.side, price: trade.price,
    size: trade.size.toString(), fee: trade.fee.toString(),
    timestamp: trade.timestamp,
    matchType: isAmm ? "amm" : "p2p",
  });
  if (recentTrades.length > 500) recentTrades.length = 500;

  broadcastTrade(recentTrades[0]);
});

// ───────────────────── Settlement ─────────────────────

function settleMarket(marketId: string, resolvedYes: boolean) {
  const amm = amms.get(marketId);
  if (amm) amm.stop();

  // Record wallet positions for toxicity scoring
  const rm = riskManagers.get(marketId);
  if (rm) {
    const walletPositions = new Map<string, { netYes: number }>();
    for (const [addr, acct] of traderAccounts) {
      const pos = acct.positions.get(marketId);
      if (pos) {
        walletPositions.set(addr, { netYes: pos.yesShares - pos.noShares });
      }
    }
    rm.recordResolution(marketId, resolvedYes, walletPositions);
  }

  for (const [, acct] of traderAccounts) {
    const pos = acct.positions.get(marketId);
    if (!pos) continue;
    const pnl = resolvedYes
      ? (pos.yesShares * 1 - pos.yesCost) + (pos.noShares * 0 - pos.noCost)
      : (pos.yesShares * 0 - pos.yesCost) + (pos.noShares * 1 - pos.noCost);
    pos.realizedPnl += pnl;
    acct.realizedPnl += pnl;
  }

  try { engine.resolveMarket(marketId, resolvedYes); } catch { /* already resolved */ }

  for (const key of openMakerOrders.keys()) {
    if (key.endsWith(`:${marketId}`)) openMakerOrders.delete(key);
  }
}

// ───────────────────── Order Helpers ─────────────────────

function toUsdc(dollars: number): bigint {
  return BigInt(Math.max(1, Math.round(dollars * 1e6)));
}

function submitOrder(
  marketId: string, address: string, side: Side,
  sizeUsd: number, price: number, type: OrderType,
) {
  const clampedPrice = Math.max(0.02, Math.min(0.98, Math.round(price * 1000) / 1000));
  const sizeUsdc = toUsdc(sizeUsd);

  // Tier 1: evaluate fill for per-taker risk
  const rm = riskManagers.get(marketId);
  if (rm) {
    const evaluation = rm.evaluateFill(marketId, address, side, sizeUsdc);
    if (evaluation.refuse) return null;
  }

  try {
    return engine.submitOrder(marketId, {
      maker: address,
      tokenId: "0",
      makerAmount: sizeUsdc,
      takerAmount: BigInt(Math.round(Number(sizeUsdc) * clampedPrice)),
      nonce: Date.now() + Math.floor(Math.random() * 100000),
      expiration: 0,
      side,
      signature: "0x",
      orderType: type,
      postOnly: false,
    });
  } catch {
    return null;
  }
}

function submitMakerOrder(
  marketId: string, address: string, side: Side,
  sizeUsd: number, price: number,
) {
  const clampedPrice = Math.max(0.02, Math.min(0.98, Math.round(price * 1000) / 1000));
  const sizeUsdc = toUsdc(sizeUsd);
  try {
    return engine.submitOrder(marketId, {
      maker: address,
      tokenId: "0",
      makerAmount: sizeUsdc,
      takerAmount: BigInt(Math.round(Number(sizeUsdc) * clampedPrice)),
      nonce: Date.now() + Math.floor(Math.random() * 100000),
      expiration: 0,
      side,
      signature: "0x",
      orderType: OrderType.GTC,
      postOnly: true,
    });
  } catch {
    return null;
  }
}

const openMakerOrders = new Map<string, string>();

// ───────────────────── Simulate Tick ─────────────────────

let tick = 0;

function simulateTick() {
  tick++;

  for (const [marketId, state] of gameStates) {
    if (state.phase === "resolved") continue;

    const engineMarket = engine.getMarket(marketId);
    if (!engineMarket || engineMarket.resolved) continue;

    const isLive = state.phase === "live";
    const summary = engine.getMarketSummary(marketId);

    // Single source of truth: state.fairValue is set by the bridge on every
    // odds update and pushed to the AMM via recenter() and risk manager via
    // notifyFairValue(). No aggregator in the pricing path.
    const midpoint = state.fairValue;

    // Feed the engine's CLOB midpoint to the risk manager for divergence detection.
    // After recenter(), the CLOB midpoint matches fairValue (within the spread).
    const rm = riskManagers.get(marketId);
    if (rm && summary?.midpoint !== undefined) {
      rm.notifyMidpoint(marketId, summary.midpoint);
    }

    // Log defense activations periodically
    if (rm && tick % 10 === 0) {
      const staleMs = rm.getFairValueStalenessMs(marketId);
      const div = rm.getMidpointDivergence(marketId);
      const withdrawn = rm.shouldWithdraw(marketId);
      if (withdrawn && (staleMs > 60000 || div > 0.10)) {
        const reason = staleMs > 180000 ? `stale-fv:${Math.round(staleMs/1000)}s` : `divergence:${(div*100).toFixed(0)}%`;
        logEvent("defense_withdrawal", { marketId, reason, staleSec: Math.round(staleMs/1000), divergence: div });
        if (tick % 30 === 0) {
          console.log(`  [DEFENSE] ${marketId}: QUOTES PULLED — ${reason}`);
        }
      }
    }

    for (const tr of traders) {
      // Realistic trade frequency: real Polymarket sports flow is ~50-200 trades/hr
      // during live games, ~5-20/hr pre-game. With 6 traders and 2s ticks,
      // a 0.03 probability per trader/tick ≈ 320 trades/hr across all markets.
      const extremeBoost = isLive && (state.fairValue > 0.90 || state.fairValue < 0.10) ? 0.04 : 0;
      const tradeProb = isLive
        ? Math.min(0.08, tr.aggression * 0.04 + extremeBoost)
        : Math.min(0.05, tr.aggression * 0.03);
      if (Math.random() > tradeProb) continue;

      // Traders observe the AMM's midpoint, NOT the true fair value.
      const smartFactor = tr.smartness / 10;
      const noiseScale = isLive ? 0.08 * (1 - smartFactor * 0.6) : 0.12 * (1 - smartFactor * 0.5);
      const noise = (Math.random() - 0.5) * noiseScale;
      const biasPull = tr.bias === "yes" ? 0.02 : -0.02;
      const belief = midpoint + noise + biasPull * (1 - smartFactor);

      const edge = belief - midpoint;
      const minEdge = isLive ? 0.008 : 0.012;
      if (Math.abs(edge) < minEdge) continue;

      const side = edge > 0 ? Side.BUY : Side.SELL;
      // Real Polymarket fills average $10-50 per fill
      const sizeDollars = (5 + Math.random() * 40) * (tr.budget / 5000);

      const bestBid = summary?.bestBid ?? (midpoint - 0.01);
      const bestAsk = summary?.bestAsk ?? (midpoint + 0.01);
      const isMaker = tr.aggression <= 0.35 && Math.abs(edge) < 0.05 && !isLive;

      if (isMaker) {
        let limitPrice: number;
        if (side === Side.BUY) {
          limitPrice = Math.max(0.02, bestBid + 0.001 + Math.random() * 0.003);
          if (limitPrice >= bestAsk) limitPrice = bestBid;
        } else {
          limitPrice = Math.min(0.98, bestAsk - 0.001 - Math.random() * 0.003);
          if (limitPrice <= bestBid) limitPrice = bestAsk;
        }

        const key = `${tr.address}:${marketId}`;
        const oldId = openMakerOrders.get(key);
        if (oldId) {
          engine.cancelOrder(marketId, oldId);
          openMakerOrders.delete(key);
        }

        const result = submitMakerOrder(marketId, tr.address, side, sizeDollars, limitPrice);
        if (result && (result.status === "resting" || result.status === "partial")) {
          openMakerOrders.set(key, result.orderId);
        }
      } else {
        const limitPrice = side === Side.BUY
          ? Math.min(0.98, bestAsk + Math.abs(edge) * 0.5)
          : Math.max(0.02, bestBid - Math.abs(edge) * 0.5);
        submitOrder(marketId, tr.address, side, sizeDollars, limitPrice, OrderType.FAK);
      }
    }

    broadcastMarketUpdate(marketId);
  }

  // Periodic snapshot every 6 ticks (~30s at 5s tick) for training data
  if (tick % 6 === 0) {
    logSnapshot();
  }

  if (tick % 5 === 0) {
    const allStates = [...gameStates.values()];
    const preGames = allStates.filter(s => s.phase === "pre_game").length;
    const liveGames = allStates.filter(s => s.phase === "live").length;
    const resolved = allStates.filter(s => s.phase === "resolved").length;
    const totalTrades = p2pTradeCount + ammTradeCount;
    const p2pPct = totalTrades > 0 ? ((p2pTradeCount / totalTrades) * 100).toFixed(0) : "0";
    console.log(
      `[${String(tick * TICK_MS / 1000).padStart(5)}s] ` +
      `pre:${preGames} live:${liveGames} done:${resolved} | ` +
      `vol: $${Math.round(totalGlobalVolume).toLocaleString()} | ` +
      `trades: ${totalTrades} (${p2pPct}% P2P)`,
    );
  }
}

// ───────────────────── Game Event Handler ─────────────────────

function handleGameEvent(event: any): void {
  const marketId = event.marketId || event.gameId;
  if (!marketId) return;

  const state = gameStates.get(marketId);
  if (!state || state.phase === "resolved") return;

  // Feed the FairValueAggregator
  if (event.eventType === "odds_update" && event.data?.fairValue) {
    fairValueAggregator.update(marketId, {
      source: event.data.source ?? "unknown",
      fairValue: event.data.fairValue,
      timestamp: Date.now(),
    });
  }

  // Feed the sport-specific parser
  const parser = parsers.get(marketId);
  const parserState = parserStates.get(marketId);
  const rm = riskManagers.get(marketId);

  if (parser && parserState && rm) {
    const signal = parser.parseEvent(event, parserState);
    rm.setGameRiskSignal(marketId, signal);

    // Sync parser state back to game state
    state.score.teamA = parserState.scoreA;
    state.score.teamB = parserState.scoreB;
    if (parserState.period) state.quarter = parserState.period;
    if (parserState.clock) state.clock = parserState.clock;
    if (parserState.phase === "live" && state.phase === "pre_game") {
      state.phase = "live";
      const rmPhase = riskManagers.get(marketId);
      if (rmPhase) rmPhase.setGamePhase(marketId, "live");
    }
  }

  switch (event.eventType) {
    case "odds_update": {
      const newFairValue = event.data?.fairValue ?? event.data?.probability;
      if (typeof newFairValue === "number" && newFairValue > 0 && newFairValue < 1) {
        // One price, one path. Every consumer reads the same value.
        state.fairValue = newFairValue;
        state.lastOddsUpdate = Date.now();

        const amm = amms.get(marketId);
        if (amm) amm.recenter(state.fairValue);
        if (rm) rm.notifyFairValue(marketId, state.fairValue);

        // Aggregator is for risk divergence detection only, not pricing
        if (rm && fairValueAggregator.isHighDivergence(marketId)) {
          const div = fairValueAggregator.getDivergence(marketId);
          logEvent("risk_divergence", { marketId, maxSpread: div.maxSpread });
          console.log(`  [RISK] ${marketId}: Source divergence ${(div.maxSpread * 100).toFixed(1)}% — widening spreads`);
        }

        logEvent("odds", { marketId, fairValue: state.fairValue, source: event.data?.source });

        const sportTag = state.sport ? ` [${state.sport}]` : "";
        console.log(`  ${marketId}${sportTag}: odds → ${(state.fairValue * 100).toFixed(1)}%`);
        triggerLiveTrading(marketId, state.fairValue);
      }
      break;
    }
    case "score_update": {
      if (event.data?.scoreA !== undefined) state.score.teamA = event.data.scoreA;
      if (event.data?.scoreB !== undefined) state.score.teamB = event.data.scoreB;
      if (event.data?.quarter) state.quarter = event.data.quarter;
      if (event.data?.clock) state.clock = event.data.clock;

      if (event.data?.fairValue) {
        state.fairValue = event.data.fairValue;
        const amm = amms.get(marketId);
        if (amm) amm.recenter(state.fairValue);
        if (rm) rm.notifyFairValue(marketId, state.fairValue);
        triggerLiveTrading(marketId, state.fairValue);
      }

      const sportTag = state.sport ? ` [${state.sport}]` : "";
      console.log(`  ${marketId}${sportTag}: ${state.score.teamA}-${state.score.teamB} (${state.quarter} ${state.clock})`);

      // Log parser risk signal
      if (rm) {
        const signal = rm.getStats(marketId).gameSignal;
        if (signal && (signal.shouldWiden || signal.shouldWithdraw)) {
          console.log(`    → Risk: ${signal.reason} (${signal.shouldWithdraw ? "WITHDRAW" : `widen ${signal.spreadMultiplier.toFixed(1)}x`})`);
        }
      }
      break;
    }
    case "external_trade": {
      // A real Polymarket trade was detected — route it through our AMM
      const tradeSide = event.data?.side === "buy" ? Side.BUY : Side.SELL;
      const tradePrice = event.data?.price ?? state.fairValue;
      const tradeSize = Math.min(event.data?.size ?? 50, 500);

      // Use a special address for external Polymarket flow
      const externalAddr = `pm-taker-${Date.now()}`;
      const result = submitOrder(
        marketId, externalAddr, tradeSide, tradeSize, tradePrice, OrderType.FAK
      );

      if (result && result.trades && result.trades.length > 0) {
        externalTradeCount++;
        logEvent("external_fill", {
          marketId, side: event.data?.side, price: tradePrice,
          size: tradeSize, fills: result.trades.length, source: event.data?.source,
        });
        const sportTag = state.sport ? ` [${state.sport}]` : "";
        if (tick % 3 === 0) {
          console.log(
            `  ${marketId}${sportTag}: PM trade ${event.data?.side} $${tradeSize} @ ${(tradePrice * 100).toFixed(1)}¢ → ${result.trades.length} fill(s)`
          );
        }
      }
      break;
    }
    case "game_start": {
      state.phase = "live";
      state.quarter = event.data?.quarter ?? "1Q";
      if (rm) rm.setGamePhase(marketId, "live");
      logEvent("game_start", { marketId, sport: state.sport, fairValue: state.fairValue });
      console.log(`\n>>> GAME ${marketId} (${state.sport}) STARTED <<<\n`);
      break;
    }
    case "game_end": {
      if (state.phase === "pre_game") {
        break;
      }
      const outcome = event.data?.teamAWins ?? (state.score.teamA > state.score.teamB);
      state.phase = "resolved";
      state.outcome = outcome;
      if (rm) rm.setGamePhase(marketId, "resolved");

      logEvent("game_end", {
        marketId, sport: state.sport, outcome: outcome ? state.teamA : state.teamB,
        score: `${state.score.teamA}-${state.score.teamB}`, fairValue: state.fairValue,
      });
      logSnapshot();

      console.log(
        `\n>>> GAME ${marketId} (${state.sport}): ${outcome ? state.teamA + " WINS" : state.teamB + " WINS"} ` +
        `(${state.score.teamA}-${state.score.teamB}) <<<\n`,
      );

      settleMarket(marketId, outcome);
      broadcastMarketUpdate(marketId);
      printPnlSummary();
      break;
    }
  }

  broadcastMarketUpdate(marketId);
}

function triggerLiveTrading(marketId: string, _fairValue: number) {
  const state = gameStates.get(marketId);
  if (!state || state.phase === "resolved") return;

  const summary = engine.getMarketSummary(marketId);
  const midpoint = summary?.midpoint ?? 0.5;

  // Burst trading triggered by odds change — 1-3 traders react (not all 6)
  for (const tr of traders) {
    const tradeProb = Math.min(0.15, tr.aggression * 0.08);
    if (Math.random() > tradeProb) continue;

    const smartFactor = tr.smartness / 10;
    const noiseScale = 0.06 * (1 - smartFactor * 0.5);
    const noise = (Math.random() - 0.5) * noiseScale;
    const biasPull = tr.bias === "yes" ? 0.015 : -0.015;
    const belief = midpoint + noise + biasPull * (1 - smartFactor);

    const edge = belief - midpoint;
    if (Math.abs(edge) < 0.01) continue;

    const side = edge > 0 ? Side.BUY : Side.SELL;
    const sizeDollars = (5 + Math.random() * 40) * (tr.budget / 5000);
    const limitPrice = side === Side.BUY
      ? Math.min(0.98, midpoint + Math.abs(edge) * 0.9)
      : Math.max(0.02, midpoint - Math.abs(edge) * 0.9);

    submitOrder(marketId, tr.address, side, sizeDollars, limitPrice, OrderType.FAK);
  }

  broadcastMarketUpdate(marketId);
}

// ───────────────────── P&L Summary ─────────────────────

function printPnlSummary() {
  console.log("\n╔═══════════════════════════════════════════════════════════════════════════╗");
  console.log("║                  SPORTS MM TRADER P&L (ENHANCED DEFENSES)                 ║");
  console.log("╠═══════════════════════════════════════════════════════════════════════════╣");

  const sorted = [...traderAccounts.entries()].sort((a, b) => b[1].realizedPnl - a[1].realizedPnl);
  for (const [addr, acct] of sorted) {
    const pnlStr = (acct.realizedPnl >= 0 ? "+" : "") + acct.realizedPnl.toFixed(0);
    const volStr = Math.round(acct.totalVolume).toLocaleString();
    const isAmm = addr.toLowerCase() === AMM_ADDRESS.toLowerCase();
    const label = isAmm ? "LMSR MARKET MAKER" : addr;
    console.log(
      `║ ${label.padEnd(21)} │ P&L: ${pnlStr.padStart(8)} │ Trades: ${String(acct.tradeCount).padStart(7)} │ Vol: $${volStr.padStart(10)} ║`,
    );
  }
  console.log("╚═══════════════════════════════════════════════════════════════════════════╝");

  // Defense stats
  console.log("\n  Defense Activations:");
  for (const [id, rm] of riskManagers) {
    const ds = rm.getDefenseStats();
    console.log(
      `    ${id}: VPIN=${ds.vpinTriggers} Toxic=${ds.toxicityWidens}/${ds.toxicityBlocks} Bayes=${ds.bayesianShifts} Game=${ds.gameSignals} ` +
      `StaleFV=${ds.staleFvWithdrawals} Divergence=${ds.divergenceWithdrawals} ` +
      `Wallets: ${ds.trackedWallets} tracked, ${ds.toxicWallets} toxic, ${ds.veryToxicWallets} very toxic`
    );
  }

  const total = p2pTradeCount + ammTradeCount;
  console.log(
    `\n  Trade Routing: ${p2pTradeCount} P2P (${total > 0 ? ((p2pTradeCount / total) * 100).toFixed(1) : 0}%) | ` +
    `${ammTradeCount} AMM (${total > 0 ? ((ammTradeCount / total) * 100).toFixed(1) : 0}%)`,
  );
}

// ───────────────────── WebSocket Broadcast ─────────────────────

function getMarketDisplayData(marketId: string) {
  const summary = engine.getMarketSummary(marketId);
  const state = gameStates.get(marketId);
  const engineMarket = engine.getMarket(marketId);

  let midpoint: number, bestBid: number, bestAsk: number, spread: number, lastPrice: number;
  let volume: string;

  if (summary) {
    midpoint = summary.midpoint ?? state?.fairValue ?? 0.5;
    bestBid = summary.bestBid ?? Math.max(0.01, midpoint - 0.01);
    bestAsk = summary.bestAsk ?? Math.min(0.99, midpoint + 0.01);
    spread = summary.spread ?? 0.02;
    lastPrice = summary.lastPrice ?? midpoint;
    volume = summary.volume ?? "0";
  } else {
    midpoint = state?.fairValue ?? 0.5;
    bestBid = midpoint - 0.01;
    bestAsk = midpoint + 0.01;
    spread = 0.02;
    lastPrice = midpoint;
    volume = "0";
  }

  if (state?.phase === "resolved") {
    const outcome = engineMarket?.outcome;
    midpoint = outcome ? 0.99 : 0.01;
    bestBid = outcome ? 0.98 : 0.01;
    bestAsk = outcome ? 0.99 : 0.02;
    spread = 0.01;
    lastPrice = midpoint;
  }

  return {
    midpoint, bestBid, bestAsk, spread, lastPrice, volume,
    resolved: engineMarket?.resolved ?? false, outcome: engineMarket?.outcome,
    score: state?.score, quarter: state?.quarter, clock: state?.clock,
    sport: state?.sport,
  };
}

function broadcastMarketUpdate(marketId: string) {
  const data = getMarketDisplayData(marketId);
  const msg = JSON.stringify({ type: "market_update", data: { id: marketId, ...data } });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function broadcastTrade(trade: any) {
  const msg = JSON.stringify({ type: "trade", data: trade });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ───────────────────── HTTP Server ─────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const url = req.url || "/";

  if (url === "/game-event" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        handleGameEvent(JSON.parse(body));
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === "/health") {
    const allStates = [...gameStates.values()];
    res.end(JSON.stringify({
      status: "ok",
      engine: "clob+lmsr+tier1-defenses",
      mode: allStates.some(s => s.phase === "live") ? "live-game" : "pre-game",
      liveGames: allStates.filter(s => s.phase === "live").length,
      resolvedGames: allStates.filter(s => s.phase === "resolved").length,
      p2pTrades: p2pTradeCount,
      ammTrades: ammTradeCount,
      timestamp: Date.now(),
    }));
    return;
  }

  if (url === "/markets") {
    const markets = [...gameStates.keys()].map((id) => {
      const engineMarket = engine.getMarket(id);
      const display = getMarketDisplayData(id);
      const state = gameStates.get(id);
      return {
        id, question: engineMarket?.question, description: engineMarket?.description,
        ...display,
        resolved: engineMarket?.resolved, outcome: engineMarket?.outcome,
        phase: state?.phase,
      };
    });
    res.end(JSON.stringify({ markets }));
    return;
  }

  if (url === "/game-status") {
    const games = [...gameStates.values()].map((s) => {
      const game = gamesConfig.games.find(g => g.id === s.marketId);
      return {
        marketId: s.marketId,
        phase: s.phase,
        fairValue: s.fairValue,
        score: s.score,
        quarter: s.quarter,
        clock: s.clock,
        outcome: s.outcome,
        sport: s.sport,
        teamA: s.teamA,
        teamB: s.teamB,
        sportradarEventId: game?.sportradarEventId ?? "",
        polymarketSlug: game?.polymarketSlug ?? "",
      };
    });
    res.end(JSON.stringify({ games, timestamp: Date.now() }));
    return;
  }

  if (url === "/trader-pnl") {
    const results: any[] = [];
    for (const [addr, acct] of traderAccounts) {
      let unrealizedPnl = 0;
      const perMarket: Record<string, { realized: number; unrealized: number; total: number; fills?: number; volume?: number }> = {};
      for (const [mktId, pos] of acct.positions) {
        const mState = gameStates.get(mktId);
        let mktUnrealized = 0;
        if (mState?.phase !== "resolved") {
          const s = engine.getMarketSummary(mktId);
          const mid = s?.midpoint ?? 0.5;
          mktUnrealized = (pos.yesShares * mid - pos.yesCost) + (pos.noShares * (1 - mid) - pos.noCost);
          unrealizedPnl += mktUnrealized;
        }
        const mktRealized = pos.realizedPnl ?? 0;
        perMarket[mktId] = {
          realized: Math.round(mktRealized * 100) / 100,
          unrealized: Math.round(mktUnrealized * 100) / 100,
          total: Math.round((mktRealized + mktUnrealized) * 100) / 100,
          fills: pos.tradeCount,
          volume: Math.round((pos.yesCost + pos.noCost) * 100) / 100,
        };
      }
      const entry: any = {
        name: addr,
        realizedPnl: Math.round(acct.realizedPnl * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        totalPnl: Math.round((acct.realizedPnl + unrealizedPnl) * 100) / 100,
        totalVolume: Math.round(acct.totalVolume * 100) / 100,
        tradeCount: acct.tradeCount,
      };
      if (addr.toLowerCase() === AMM_ADDRESS.toLowerCase()) {
        entry.perMarket = perMarket;
      }
      results.push(entry);
    }
    results.sort((a, b) => b.totalPnl - a.totalPnl);
    res.end(JSON.stringify({ traders: results }, null, 2));
    return;
  }

  if (url === "/amm-status") {
    const status: any[] = [];
    for (const [mktId, amm] of amms) {
      const s = amm.getStatus();
      const rm = riskManagers.get(mktId);
      const defenseStats = rm ? rm.getDefenseStats() : null;
      status.push({
        marketId: mktId,
        fairValue: s.yesPrice,
        noPrice: s.noPrice,
        exposure: s.exposure.toString(),
        activeOrders: s.activeOrders,
        risk: { ...s.risk },
        defenses: defenseStats,
      });
    }
    res.end(JSON.stringify({ amms: status }, null, 2));
    return;
  }

  if (url === "/defense-stats") {
    const stats: any[] = [];
    for (const [mktId, rm] of riskManagers) {
      stats.push({ marketId: mktId, ...rm.getDefenseStats() });
    }
    res.end(JSON.stringify({ defenses: stats }, null, 2));
    return;
  }

  if (url === "/fair-values") {
    const values: any[] = [];
    for (const [mktId] of gameStates) {
      const fv = fairValueAggregator.getFairValue(mktId);
      const div = fairValueAggregator.getDivergence(mktId);
      values.push({
        marketId: mktId,
        aggregatedFairValue: fv,
        divergence: div.maxSpread,
        sourceCount: div.sourceCount,
        sources: div.sources,
      });
    }
    res.end(JSON.stringify({ fairValues: values }, null, 2));
    return;
  }

  const obMatch = url.match(/^\/markets\/([^/]+)\/orderbook$/);
  if (obMatch) {
    const snapshot = engine.getOrderBook(obMatch[1]);
    if (snapshot) {
      res.end(JSON.stringify({
        marketId: snapshot.marketId,
        bids: snapshot.bids.map(l => ({ price: l.price, size: l.size.toString(), numOrders: l.numOrders })),
        asks: snapshot.asks.map(l => ({ price: l.price, size: l.size.toString(), numOrders: l.numOrders })),
        lastTradePrice: snapshot.lastTradePrice,
        spread: snapshot.spread,
        timestamp: snapshot.timestamp,
      }));
      return;
    }
    res.end(JSON.stringify({ marketId: obMatch[1], bids: [], asks: [] }));
    return;
  }

  const trMatch = url.match(/^\/markets\/([^/]+)\/trades/);
  if (trMatch) {
    const mt = recentTrades.filter(t => t.marketId === trMatch[1]).slice(0, 50);
    res.end(JSON.stringify({ trades: mt }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

// ───────────────────── Start ─────────────────────

for (const amm of amms.values()) amm.start(5000);

server.listen(PORT, () => {
  console.log("\n=== SPORTS MM SIMULATION SERVER (ENHANCED DEFENSES) ===");
  console.log(`Engine: MatchingEngine + LMSR AMM + Tier 1 Risk Controls`);
  console.log(`Defenses: VPIN + Per-Wallet Toxicity + Bayesian Prior Shifting`);
  console.log(`Matching: P2P order crossing + AMM passive liquidity`);
  console.log(`Games: ${gameStates.size}`);
  console.log(`Traders: ${traders.length}`);
  console.log(`\nPer-game risk configs:`);

  for (const [mktId, rm] of riskManagers) {
    const rc = rm.getConfig();
    const state = gameStates.get(mktId)!;
    console.log(
      `  ${mktId} [${state.sport}]: spread=${(rc.baseHalfSpread * 100).toFixed(1)}¢ | ` +
      `cap=$${(Number(rc.positionCapUsdc) / 1e6).toFixed(0)} | ` +
      `withdraw=${rc.withdrawalWindowSeconds}s | skew=${(rc.inventorySkewPerUnit * 100).toFixed(1)}¢`
    );
  }

  console.log(`\nServer: http://localhost:${PORT} | WebSocket: ws://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /game-event       — push live odds/score updates`);
  console.log(`  GET  /game-status      — game phases, scores, sport info`);
  console.log(`  GET  /markets          — market data`);
  console.log(`  GET  /amm-status       — AMM status + defense metrics`);
  console.log(`  GET  /defense-stats    — per-market defense activation counts`);
  console.log(`  GET  /fair-values      — aggregated fair values + source divergence`);
  console.log(`  GET  /trader-pnl       — trader P&L breakdown`);
  console.log(`  GET  /health           — server health`);
  console.log(`\nGames:\n`);
  for (const [marketId, state] of gameStates) {
    console.log(`  ${marketId} [${state.sport}]: ${state.teamA} vs ${state.teamB} — initial: ${(state.fairValue * 100).toFixed(1)}%`);
  }
  console.log(`\nPre-game trading starting in 2 seconds...\n`);

  setTimeout(() => {
    setInterval(simulateTick, TICK_MS);
  }, 2000);
});

const shutdown = () => {
  console.log("\nShutting down...");
  for (const amm of amms.values()) amm.stop();
  printPnlSummary();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
