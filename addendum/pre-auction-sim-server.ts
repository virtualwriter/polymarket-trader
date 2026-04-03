/**
 * Auction Simulation Server — Engine-Backed CLOB
 *
 * Uses the real MatchingEngine with CLOB order book, LMSR AMM, and Phase 1
 * risk controls. Traders submit real limit orders; the engine handles P2P
 * matching and AMM liquidity provision.
 *
 *   PRE-AUCTION: Traders speculate via limit/market orders. P2P matching
 *                happens when orders cross; the LMSR AMM provides passive
 *                liquidity for the remainder.
 *   LIVE AUCTION: Real bid data arrives via POST /auction-event. Informed
 *                 traders react aggressively, pushing the market.
 *
 * Usage: npx tsx scripts/pre-auction-sim-server.ts [--sale <saleId>]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { MatchingEngine } from "../engine/src/matching/MatchingEngine.js";
import { LMSRAMMProvider } from "../engine/src/amm/LMSR.js";
import { RiskManager } from "../engine/src/mm/RiskManager.js";
import { FeeCalculator } from "../engine/src/fees/FeeCalculator.js";
import { RebatePool } from "../engine/src/fees/RebatePool.js";
import { Side, OrderType, Trade } from "../engine/src/types.js";
import type { Market } from "../engine/src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ───────────────────── CLI + File Loading ─────────────────────

const saleArg = (() => {
  const idx = process.argv.indexOf("--sale");
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
})();

const marketsFile = saleArg ? `markets-${saleArg}.json` : "markets.json";
const marketsPath = resolve(__dirname, marketsFile);
let marketsJson: any;
try {
  marketsJson = JSON.parse(readFileSync(marketsPath, "utf-8"));
} catch {
  console.error(`Markets file not found: ${marketsPath}`);
  process.exit(1);
}

const scenarioPath = saleArg
  ? resolve(__dirname, "scenarios", `sale-${saleArg}.json`)
  : resolve(__dirname, "scenarios", "all-lots.json");

let scenarioJson: any;
try {
  scenarioJson = JSON.parse(readFileSync(scenarioPath, "utf-8"));
} catch {
  console.log(`[init] No scenario file for sale ${saleArg ?? "default"} — generating uncertain pre-auction scenarios`);
  scenarioJson = {
    mmMode: "engine",
    runs: 1,
    sharedTraders: [
      { name: "Insider Alice",     bias: "yes", smartness: 9,  budget: 200, aggression: 0.45 },
      { name: "Insider Bob",       bias: "yes", smartness: 8,  budget: 150, aggression: 0.4 },
      { name: "Semi-Pro Carol",    bias: "yes", smartness: 6,  budget: 100, aggression: 0.3 },
      { name: "Semi-Pro Dave",     bias: "no",  smartness: 5,  budget: 80,  aggression: 0.3 },
      { name: "Retail Eve",        bias: "no",  smartness: 3,  budget: 50,  aggression: 0.2 },
      { name: "Retail Frank",      bias: "yes", smartness: 3,  budget: 40,  aggression: 0.2 },
      { name: "Degen Greg",        bias: "no",  smartness: 1,  budget: 30,  aggression: 0.5 },
      { name: "Degen Helen",       bias: "yes", smartness: 2,  budget: 25,  aggression: 0.4 },
      { name: "Whale Insider Ian", bias: "yes", smartness: 10, budget: 300, aggression: 0.35 },
      { name: "Noise Trader Jan",  bias: "no",  smartness: 1,  budget: 20,  aggression: 0.5 },
    ],
    lots: marketsJson.lots.map((lot: any) => {
      const low = Number(lot.lowEstimate);
      const high = Number(lot.highEstimate);
      const hammerPrice = Math.round(low * 0.7 + Math.random() * (high * 1.5 - low * 0.7));
      return {
        lotNumber: lot.lotNumber, artist: lot.artist,
        lowEstimate: low, highEstimate: high,
        currency: lot.currency ?? "GBP", hammerPrice,
        auctionLengthSeconds: 45 + Math.floor(Math.random() * 60),
        hammerTimePercent: 0.6 + Math.random() * 0.2,
        bidIncrementGrowth: 1.0,
        totalPreAuctionVolume: 3000 + Math.floor(Math.random() * 7000),
        totalLiveAuctionVolume: 2000 + Math.floor(Math.random() * 8000),
      };
    }),
  };
}

const SALE_ID = saleArg ?? marketsJson.auction?.id ?? "30992";
const TICK_MS = 2000;
const AMM_ADDRESS = "0x0000000000000000000000000000000000000amm";

const avgHighEstimate = marketsJson.lots.reduce(
  (s: number, l: any) => s + Number(l.highEstimate), 0,
) / marketsJson.lots.length;
const VOLUME_SCALE = Math.min(1.0, Math.max(0.01, avgHighEstimate / 500_000));
console.log(`[init] Avg high estimate: £${Math.round(avgHighEstimate).toLocaleString()} → volume scale: ${(VOLUME_SCALE * 100).toFixed(1)}%`);

// ───────────────────── Engine Setup ─────────────────────

const feeCalculator = new FeeCalculator({ feeRate: 0.0175, exponent: 1 });
const rebatePool = new RebatePool(feeCalculator);
const engine = new MatchingEngine(feeCalculator, rebatePool);

const riskManager = new RiskManager({
  positionCapUsdc: BigInt(Math.max(100_000_000, Math.round(5_000_000_000 * VOLUME_SCALE))),
  maxFillSizeUsdc: BigInt(Math.max(20_000_000, Math.round(500_000_000 * VOLUME_SCALE))),
  withdrawalWindowSeconds: 10,
  baseHalfSpread: 0.01,
  inventorySkewPerUnit: 0.005,
  inventoryUnitUsdc: BigInt(Math.max(50_000_000, Math.round(500_000_000 * VOLUME_SCALE))),
});

// ───────────────────── Per-Lot Sim State ─────────────────────

type LotPhase = "pre_auction" | "live" | "resolved";

interface SimState {
  marketId: string;
  lotNumber: number;
  phase: LotPhase;
  baseBias: number;
  auctionPrice: number;
  liveStartedAt: number | null;
  hammerPrice: number | null;
  finalStatus: "pending" | "sold" | "passed" | "withdrawn";
}

const simStates = new Map<string, SimState>();
const amms = new Map<string, LMSRAMMProvider>();
const endDate = new Date(marketsJson.auction?.date ?? "2026-03-10").getTime();

for (const lot of marketsJson.lots) {
  const marketId = `lot-${lot.lotNumber}`;
  const initialBias = 0.47 + Math.random() * 0.06;

  engine.registerMarket({
    id: marketId, questionId: "", conditionId: "",
    yesTokenId: `yes-${marketId}`, noTokenId: `no-${marketId}`,
    question: `Will Lot ${lot.lotNumber} sell for over £${Number(lot.highEstimate).toLocaleString()}?`,
    description: "", resolutionSource: "Christie's official results",
    endDate, resolved: false, createdAt: Date.now(),
    lotNumber: lot.lotNumber, artist: lot.artist, title: lot.title,
    year: lot.year, lowEstimate: lot.lowEstimate, highEstimate: lot.highEstimate,
    currency: lot.currency, auctionId: SALE_ID,
  } as Market);

  riskManager.setAuctionEndTime(marketId, endDate);

  simStates.set(marketId, {
    marketId, lotNumber: lot.lotNumber, phase: "pre_auction",
    baseBias: initialBias, auctionPrice: 0, liveStartedAt: null,
    hammerPrice: null, finalStatus: "pending",
  });

  const lmsrB = Math.max(10, Math.round(100 * VOLUME_SCALE));
  const amm = new LMSRAMMProvider(engine, marketId, {
    liquidityParameter: lmsrB,
    maxExposureUsdc: BigInt(Math.max(200_000_000, Math.round(10_000_000_000 * VOLUME_SCALE))),
    initialYesPrice: initialBias,
    riskManager,
  });
  amms.set(marketId, amm);
}

// Total-value market (no AMM — derived from lot markets)
const totalHigh = marketsJson.lots.reduce((s: number, l: any) => s + Number(l.highEstimate), 0);
const totalLow = marketsJson.lots.reduce((s: number, l: any) => s + Number(l.lowEstimate), 0);
engine.registerMarket({
  id: "total-value", questionId: "", conditionId: "",
  yesTokenId: "yes-total", noTokenId: "no-total",
  question: `Will the total auction value exceed £${totalHigh.toLocaleString()}?`,
  description: "", resolutionSource: "Christie's official results",
  endDate, resolved: false, createdAt: Date.now(),
  lotNumber: 0, artist: "Entire Sale", title: "Total Auction Value",
  year: "2026", lowEstimate: String(totalLow), highEstimate: String(totalHigh),
  currency: "GBP", auctionId: SALE_ID,
} as Market);
simStates.set("total-value", {
  marketId: "total-value", lotNumber: 0, phase: "pre_auction",
  baseBias: 0.50, auctionPrice: 0, liveStartedAt: null,
  hammerPrice: null, finalStatus: "pending",
});

// Shared AMM fill handler — routes trades to the correct LMSR by marketId
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

const traders: Trader[] = scenarioJson.sharedTraders.map((t: any) => ({
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
}

interface TraderAccount {
  realizedPnl: number;
  totalVolume: number;
  totalFees: number;
  tradeCount: number;
  preAuctionTrades: number;
  liveAuctionTrades: number;
  preAuctionPnl: number;
  liveAuctionPnl: number;
  positions: Map<string, OpenPosition>;
}

const traderAccounts = new Map<string, TraderAccount>();

function getAccount(address: string): TraderAccount {
  if (!traderAccounts.has(address)) {
    traderAccounts.set(address, {
      realizedPnl: 0, totalVolume: 0, totalFees: 0,
      tradeCount: 0, preAuctionTrades: 0, liveAuctionTrades: 0,
      preAuctionPnl: 0, liveAuctionPnl: 0,
      positions: new Map(),
    });
  }
  return traderAccounts.get(address)!;
}

function getPosition(account: TraderAccount, marketId: string): OpenPosition {
  if (!account.positions.has(marketId)) {
    account.positions.set(marketId, { yesShares: 0, yesCost: 0, noShares: 0, noCost: 0 });
  }
  return account.positions.get(marketId)!;
}

let totalGlobalVolume = 0;
let p2pTradeCount = 0;
let ammTradeCount = 0;
const recentTrades: any[] = [];
const wsClients = new Set<WebSocket>();

// Engine event subscription — tracks every fill for P&L and broadcasting
engine.subscribe((msg) => {
  if (msg.type !== "trade") return;
  const trade = msg.data as Trade;
  const sizeUsd = Number(trade.size) / 1e6;
  const feeUsd = Number(trade.fee) / 1e6;
  const sim = simStates.get(trade.marketId);
  const phase = sim?.phase ?? "pre_auction";

  const isAmm = trade.maker.toLowerCase() === AMM_ADDRESS || trade.taker.toLowerCase() === AMM_ADDRESS;
  if (isAmm) ammTradeCount++;
  else p2pTradeCount++;

  // Buyer gets YES shares at trade.price, seller gets NO shares at (1 - trade.price)
  const buyerAddr = trade.side === Side.BUY ? trade.taker : trade.maker;
  const sellerAddr = trade.side === Side.BUY ? trade.maker : trade.taker;

  const buyerPos = getPosition(getAccount(buyerAddr), trade.marketId);
  const sellerPos = getPosition(getAccount(sellerAddr), trade.marketId);

  buyerPos.yesShares += sizeUsd;
  buyerPos.yesCost += sizeUsd * trade.price;
  sellerPos.noShares += sizeUsd;
  sellerPos.noCost += sizeUsd * (1 - trade.price);

  for (const addr of [trade.taker, trade.maker]) {
    const acct = getAccount(addr);
    acct.totalVolume += sizeUsd;
    acct.tradeCount++;
    if (phase === "live") acct.liveAuctionTrades++;
    else acct.preAuctionTrades++;
  }
  getAccount(trade.taker).totalFees += feeUsd;

  totalGlobalVolume += sizeUsd;

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
  // Stop AMM before resolving (avoids race with periodic refresh)
  const amm = amms.get(marketId);
  if (amm) amm.stop();

  // Compute P&L for every account with a position in this market
  for (const [, acct] of traderAccounts) {
    const pos = acct.positions.get(marketId);
    if (!pos) continue;

    const pnl = resolvedYes
      ? (pos.yesShares * 1 - pos.yesCost) + (pos.noShares * 0 - pos.noCost)
      : (pos.yesShares * 0 - pos.yesCost) + (pos.noShares * 1 - pos.noCost);

    acct.realizedPnl += pnl;
    const sim = simStates.get(marketId);
    if (sim?.liveStartedAt) acct.liveAuctionPnl += pnl;
    else acct.preAuctionPnl += pnl;
  }

  try { engine.resolveMarket(marketId, resolvedYes); } catch { /* already resolved */ }

  // Clean up stale maker order tracking
  for (const key of openMakerOrders.keys()) {
    if (key.endsWith(`:${marketId}`)) openMakerOrders.delete(key);
  }
}

// ───────────────────── Informed Fair Values ─────────────────────

const informedFairValues = new Map<number, number>();
for (const sl of scenarioJson.lots) {
  const ratio = sl.hammerPrice / sl.highEstimate;
  let fairYes: number;
  if (ratio >= 1.5) fairYes = 0.78 + Math.random() * 0.07;
  else if (ratio >= 1.1) fairYes = 0.65 + Math.random() * 0.08;
  else if (ratio >= 1.0) fairYes = 0.55 + Math.random() * 0.08;
  else if (ratio >= 0.85) fairYes = 0.35 + Math.random() * 0.10;
  else if (ratio >= 0.7) fairYes = 0.22 + Math.random() * 0.08;
  else fairYes = 0.12 + Math.random() * 0.08;
  informedFairValues.set(sl.lotNumber, fairYes);
}

const scenarioLots = new Map<number, any>();
for (const sl of scenarioJson.lots) scenarioLots.set(sl.lotNumber, sl);

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

// ───────────────────── Live Implied Probability ─────────────────────

function liveImpliedProb(auctionPrice: number, lowEst: number, highEst: number): number {
  if (auctionPrice >= highEst) return 0.99;
  const climb = Math.max(0, (auctionPrice - lowEst) / (highEst - lowEst));
  return Math.max(0.05, Math.min(0.97, 0.10 + 0.87 * Math.pow(climb, 1.2)));
}

// ───────────────────── Simulate Tick ─────────────────────

let tick = 0;

function simulateTick() {
  tick++;

  for (const [marketId, sim] of simStates) {
    if (sim.phase === "resolved" || sim.lotNumber === 0) continue;

    const engineMarket = engine.getMarket(marketId);
    if (!engineMarket || engineMarket.resolved) continue;

    const isLive = sim.phase === "live";
    const scenario = scenarioLots.get(sim.lotNumber);
    const preVol = scenario?.totalPreAuctionVolume ?? 5000;
    const liveVol = scenario?.totalLiveAuctionVolume ?? 10000;

    const activityRate = isLive
      ? Math.min(1.0, liveVol / 15000) * 1.2
      : Math.min(1.0, preVol / 12000) * 1.0;

    let fairYes: number;
    if (isLive && sim.auctionPrice > 0) {
      fairYes = liveImpliedProb(sim.auctionPrice, Number(engineMarket.lowEstimate), Number(engineMarket.highEstimate));
    } else {
      fairYes = sim.baseBias + (Math.random() - 0.5) * 0.008;
    }

    const informedFair = informedFairValues.get(sim.lotNumber) ?? 0.5;
    const summary = engine.getMarketSummary(marketId);
    const midpoint = summary?.midpoint ?? sim.baseBias;

    for (const tr of traders) {
      const extremeBoost = isLive && (fairYes > 0.90 || fairYes < 0.10) ? 0.15 : 0;
      const tradeProb = isLive
        ? Math.min(0.75, tr.aggression * 0.22 * activityRate + extremeBoost)
        : Math.min(0.6, tr.aggression * 0.22 * activityRate);
      if (Math.random() > tradeProb) continue;

      let belief: number;
      if (isLive) {
        if (fairYes >= 0.99) {
          belief = tr.smartness * 0.99 + (1 - tr.smartness) * (0.85 + Math.random() * 0.14);
        } else if (fairYes <= 0.05) {
          belief = tr.smartness * 0.01 + (1 - tr.smartness) * (Math.random() * 0.15);
        } else {
          belief = tr.smartness * fairYes + (1 - tr.smartness) * (tr.bias === "yes" ? 0.60 : 0.35);
        }
      } else {
        const noise = (Math.random() - 0.5) * 0.12;
        belief = tr.smartness * (informedFair + noise) + (1 - tr.smartness) * (tr.bias === "yes" ? 0.58 : 0.38);
      }

      const edge = belief - midpoint;
      const minEdge = isLive ? 0.008 : 0.012;
      if (Math.abs(edge) < minEdge) continue;

      const side = edge > 0 ? Side.BUY : Side.SELL;
      const sizeMult = isLive ? 1.3 : 1.6;
      const sizeDollars = (30 + Math.random() * 250) * (tr.budget / 5000) * sizeMult * VOLUME_SCALE;

      // Patient traders with moderate edge post GTC limit orders inside the spread
      // (become makers, enabling P2P matching). Aggressive traders take with FAK.
      const bestBid = summary?.bestBid ?? (midpoint - 0.01);
      const bestAsk = summary?.bestAsk ?? (midpoint + 0.01);
      const isMaker = tr.aggression <= 0.35 && Math.abs(edge) < 0.05 && !isLive;

      if (isMaker) {
        let limitPrice: number;
        if (side === Side.BUY) {
          // Improve the best bid (tighten the spread from below)
          limitPrice = Math.max(0.02, bestBid + 0.001 + Math.random() * 0.003);
          if (limitPrice >= bestAsk) limitPrice = bestBid;
        } else {
          // Improve the best ask (tighten the spread from above)
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
        // Cross the spread aggressively
        const limitPrice = side === Side.BUY
          ? Math.min(0.98, bestAsk + Math.abs(edge) * 0.5)
          : Math.max(0.02, bestBid - Math.abs(edge) * 0.5);

        submitOrder(marketId, tr.address, side, sizeDollars, limitPrice, OrderType.FAK);
      }
    }

    if (!isLive && sim.phase !== "resolved") {
      sim.baseBias += (informedFair - sim.baseBias) * 0.008;
    }

    broadcastEngineMarketUpdate(marketId);
  }

  syncTotalValueMarket();

  if (tick % 5 === 0) {
    const allSims = [...simStates.values()].filter(s => s.lotNumber > 0);
    const preLots = allSims.filter(s => s.phase === "pre_auction").length;
    const liveLots = allSims.filter(s => s.phase === "live").length;
    const resolvedLots = allSims.filter(s => s.phase === "resolved").length;
    const volStr = `$${Math.round(totalGlobalVolume).toLocaleString()}`;
    const totalTrades = p2pTradeCount + ammTradeCount;
    const phase = liveLots > 0 ? "LIVE" : "PRE ";
    const p2pPct = totalTrades > 0 ? ((p2pTradeCount / totalTrades) * 100).toFixed(0) : "0";
    console.log(
      `[${String(tick * TICK_MS / 1000).padStart(5)}s] ${phase} | ` +
      `pre:${preLots} live:${liveLots} done:${resolvedLots} | ` +
      `vol: ${volStr.padStart(10)} | ` +
      `trades: ${totalTrades} (${p2pPct}% P2P)`,
    );
  }
}

// ───────────────────── Live Bid Reactions ─────────────────────

function runLiveBidTrading(marketId: string, impliedYes: number) {
  const sim = simStates.get(marketId);
  if (!sim || sim.phase === "resolved") return;

  const engineMarket = engine.getMarket(marketId);
  if (!engineMarket) return;

  const summary = engine.getMarketSummary(marketId);
  const midpoint = summary?.midpoint ?? 0.5;

  for (const tr of traders) {
    const tradeProb = Math.min(0.7, tr.aggression * 0.35 + (impliedYes > 0.95 || impliedYes < 0.05 ? 0.15 : 0));
    if (Math.random() > tradeProb) continue;

    let belief: number;
    if (impliedYes >= 0.99) {
      belief = tr.smartness * 0.99 + (1 - tr.smartness) * (0.85 + Math.random() * 0.14);
    } else if (impliedYes <= 0.05) {
      belief = tr.smartness * 0.01 + (1 - tr.smartness) * (Math.random() * 0.15);
    } else {
      belief = tr.smartness * impliedYes + (1 - tr.smartness) * (tr.bias === "yes" ? 0.60 : 0.35);
    }

    const edge = belief - midpoint;
    if (Math.abs(edge) < 0.01) continue;

    const side = edge > 0 ? Side.BUY : Side.SELL;
    const sizeDollars = (25 + Math.random() * 220) * (tr.budget / 5000) * 1.2 * VOLUME_SCALE;

    const limitPrice = side === Side.BUY
      ? Math.min(0.98, midpoint + Math.abs(edge) * 0.9)
      : Math.max(0.02, midpoint - Math.abs(edge) * 0.9);

    submitOrder(marketId, tr.address, side, sizeDollars, limitPrice, OrderType.FAK);
  }

  broadcastEngineMarketUpdate(marketId);
}

// ───────────────────── Auction Event Handler ─────────────────────

function handleAuctionEvent(event: any): void {
  const lotNumber = event.lotNumber;
  if (!lotNumber) return;

  const marketId = `lot-${lotNumber}`;
  const sim = simStates.get(marketId);
  const engineMarket = engine.getMarket(marketId);
  if (!sim || !engineMarket || sim.phase === "resolved") return;

  switch (event.eventType) {
    case "lot_started": {
      if (sim.phase === "pre_auction") {
        sim.phase = "live";
        sim.liveStartedAt = Date.now();
        console.log(`\n>>> LOT ${lotNumber} GOING LIVE — switching to real auction data <<<\n`);
      }
      break;
    }
    case "bid": {
      const amount = event.data?.amount ?? event.bid?.amount;
      if (!amount) break;

      if (sim.phase === "pre_auction") {
        sim.phase = "live";
        sim.liveStartedAt = Date.now();
        console.log(`\n>>> LOT ${lotNumber} GOING LIVE (first bid) <<<\n`);
      }

      sim.auctionPrice = amount;
      const lowEst = Number(engineMarket.lowEstimate);
      const highEst = Number(engineMarket.highEstimate);
      const impliedYes = liveImpliedProb(amount, lowEst, highEst);
      sim.baseBias = impliedYes;

      console.log(
        `  Lot ${lotNumber}: BID £${amount.toLocaleString()} → implied YES ${(impliedYes * 100).toFixed(1)}%`,
      );

      broadcastAuctionUpdate(sim, amount, "bid");
      runLiveBidTrading(marketId, impliedYes);
      break;
    }
    case "hammer": {
      const hammerPrice = event.data?.hammerPrice ?? event.data?.amount;
      if (hammerPrice) sim.auctionPrice = hammerPrice;

      const highEst = Number(engineMarket.highEstimate);
      const isYes = hammerPrice !== undefined && hammerPrice >= highEst;

      sim.phase = "resolved";
      sim.hammerPrice = hammerPrice ?? null;
      sim.finalStatus = "sold";

      console.log(
        `\n>>> LOT ${lotNumber}: SOLD £${(hammerPrice ?? 0).toLocaleString()} → ${isYes ? "YES" : "NO"} (high est £${highEst.toLocaleString()}) <<<\n`,
      );

      settleMarket(marketId, isYes);
      broadcastEngineMarketUpdate(marketId);
      broadcastAuctionUpdate(sim, hammerPrice, "sold");
      break;
    }
    case "passed":
    case "withdrawn": {
      sim.phase = "resolved";
      sim.hammerPrice = null;
      sim.finalStatus = event.eventType;

      console.log(`\n>>> LOT ${lotNumber}: ${event.eventType.toUpperCase()} → NO <<<\n`);

      settleMarket(marketId, false);
      broadcastEngineMarketUpdate(marketId);
      broadcastAuctionUpdate(sim, 0, event.eventType);
      break;
    }
  }

  syncTotalValueMarket();
}

// ───────────────────── Total-Value Market Sync ─────────────────────

function syncTotalValueMarket(forceResolve = false) {
  const totalSim = simStates.get("total-value");
  if (!totalSim) return;

  const lotSims = [...simStates.values()].filter(s => s.lotNumber > 0);
  const totalHammer = lotSims.reduce(
    (sum, s) => sum + (s.finalStatus === "sold" ? (s.hammerPrice ?? 0) : 0), 0,
  );
  const allResolved = lotSims.every(s => s.phase === "resolved");

  if (allResolved || forceResolve) {
    const threshold = totalHigh;
    const outcome = totalHammer >= threshold;

    if (totalSim.phase !== "resolved" || totalSim.hammerPrice !== totalHammer) {
      totalSim.phase = "resolved";
      totalSim.auctionPrice = totalHammer;
      totalSim.hammerPrice = totalHammer;
      totalSim.finalStatus = "sold";

      settleMarket("total-value", outcome);
      console.log(
        `[TOTAL] Resolved ${outcome ? "YES" : "NO"} — hammer sum £${totalHammer.toLocaleString()} vs threshold £${threshold.toLocaleString()}`,
      );
      printPnlSummary();
    }
  }

  broadcastEngineMarketUpdate("total-value");
}

// ───────────────────── P&L Summary ─────────────────────

function printPnlSummary() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                    TRADER P&L SUMMARY (ENGINE-BACKED CLOB)                  ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════════╣");
  console.log("║ Name                  │  P&L ($) │  Trades │  Volume ($) │  Fees ($)        ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════════╣");

  const sorted = [...traderAccounts.entries()].sort((a, b) => b[1].realizedPnl - a[1].realizedPnl);
  for (const [addr, acct] of sorted) {
    const pnlStr = (acct.realizedPnl >= 0 ? "+" : "") + acct.realizedPnl.toFixed(0);
    const volStr = Math.round(acct.totalVolume).toLocaleString();
    const feeStr = acct.totalFees.toFixed(0);
    const isAmm = addr.toLowerCase() === AMM_ADDRESS;
    const label = isAmm ? "LMSR MARKET MAKER" : addr;
    console.log(
      `║ ${label.padEnd(21)} │ ${pnlStr.padStart(8)} │ ${String(acct.tradeCount).padStart(7)} │ ${volStr.padStart(11)} │ ${feeStr.padStart(8)}        ║`,
    );
  }
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  const total = p2pTradeCount + ammTradeCount;
  console.log(`\n  Trade Routing: ${p2pTradeCount} P2P (${total > 0 ? ((p2pTradeCount / total) * 100).toFixed(1) : 0}%) | ${ammTradeCount} AMM (${total > 0 ? ((ammTradeCount / total) * 100).toFixed(1) : 0}%)`);

  const traderInfo = traders.map(t => {
    const acct = traderAccounts.get(t.address);
    return {
      name: t.name, smartness: t.smartness, bias: t.bias, budget: t.budget,
      pnl: acct?.realizedPnl ?? 0, trades: acct?.tradeCount ?? 0,
      preAuctionTrades: acct?.preAuctionTrades ?? 0,
      liveAuctionTrades: acct?.liveAuctionTrades ?? 0,
    };
  });
  console.log("\n  Trader Details:");
  for (const t of traderInfo.sort((a, b) => b.pnl - a.pnl)) {
    const pnlStr = (t.pnl >= 0 ? "+" : "") + t.pnl.toFixed(0);
    console.log(
      `    ${t.name.padEnd(22)} smart:${(t.smartness * 10).toFixed(0).padStart(2)}/10  bias:${t.bias.padEnd(3)}  budget:$${t.budget}  P&L: ${pnlStr}  trades: ${t.preAuctionTrades} pre + ${t.liveAuctionTrades} live`,
    );
  }

  const mmAcct = traderAccounts.get(AMM_ADDRESS);
  if (mmAcct) {
    console.log(`\n  LMSR Market Maker P&L: $${mmAcct.realizedPnl.toFixed(0)}  (fees collected: $${mmAcct.totalFees.toFixed(0)}, ${mmAcct.tradeCount} trades)`);
    console.log(`  MM net after fees: $${(mmAcct.realizedPnl + mmAcct.totalFees).toFixed(0)}`);
  }
}

// ───────────────────── WebSocket Broadcast ─────────────────────

function getMarketDisplayData(marketId: string) {
  const summary = engine.getMarketSummary(marketId);
  const sim = simStates.get(marketId);
  const engineMarket = engine.getMarket(marketId);

  let midpoint: number, bestBid: number, bestAsk: number, spread: number, lastPrice: number;
  let volume: string;

  if (marketId === "total-value") {
    const lotSims = [...simStates.values()].filter(s => s.lotNumber > 0);
    const lotMids = lotSims.map(ls => {
      const s = engine.getMarketSummary(ls.marketId);
      return s?.midpoint ?? 0.5;
    });
    const avgMid = lotMids.length > 0 ? lotMids.reduce((a, b) => a + b, 0) / lotMids.length : 0.5;
    midpoint = Math.round(avgMid * 1000) / 1000;
    bestBid = Math.max(0.01, midpoint - 0.008);
    bestAsk = Math.min(0.99, midpoint + 0.008);
    spread = Math.round((bestAsk - bestBid) * 1000) / 1000;
    lastPrice = midpoint;
    volume = String(Math.round(totalGlobalVolume * 1e6));
  } else if (summary) {
    midpoint = summary.midpoint ?? sim?.baseBias ?? 0.5;
    bestBid = summary.bestBid ?? Math.max(0.01, midpoint - 0.01);
    bestAsk = summary.bestAsk ?? Math.min(0.99, midpoint + 0.01);
    spread = summary.spread ?? 0.02;
    lastPrice = summary.lastPrice ?? midpoint;
    volume = summary.volume ?? "0";
  } else {
    midpoint = sim?.baseBias ?? 0.5;
    bestBid = midpoint - 0.01;
    bestAsk = midpoint + 0.01;
    spread = 0.02;
    lastPrice = midpoint;
    volume = "0";
  }

  if (sim?.phase === "resolved") {
    const outcome = engineMarket?.outcome;
    midpoint = outcome ? 0.99 : 0.01;
    bestBid = outcome ? 0.98 : 0.01;
    bestAsk = outcome ? 0.99 : 0.02;
    spread = 0.01;
    lastPrice = midpoint;
  }

  return { midpoint, bestBid, bestAsk, spread, lastPrice, volume,
           resolved: engineMarket?.resolved ?? false, outcome: engineMarket?.outcome };
}

function broadcastEngineMarketUpdate(marketId: string) {
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

function broadcastAuctionUpdate(sim: SimState, currentBid: number | undefined, status: string) {
  const engineMarket = engine.getMarket(sim.marketId);
  const msg = JSON.stringify({
    type: "auction_update",
    data: {
      lotNumber: sim.lotNumber, status, currentBid,
      hammerPrice: sim.phase === "resolved" ? currentBid : undefined,
      sold: sim.phase === "resolved" ? engineMarket?.outcome : undefined,
      currency: engineMarket?.currency,
    },
  });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ───────────────────── HTTP Server ─────────────────────

function serializeMarket(marketId: string) {
  const engineMarket = engine.getMarket(marketId);
  const sim = simStates.get(marketId);
  const summary = engine.getMarketSummary(marketId);
  if (!engineMarket) return null;

  const display = getMarketDisplayData(marketId);

  return {
    id: engineMarket.id,
    questionId: engineMarket.questionId,
    conditionId: engineMarket.conditionId,
    yesTokenId: engineMarket.yesTokenId,
    noTokenId: engineMarket.noTokenId,
    question: engineMarket.question,
    description: engineMarket.description,
    resolutionSource: engineMarket.resolutionSource,
    endDate: engineMarket.endDate,
    resolved: engineMarket.resolved,
    outcome: engineMarket.outcome,
    createdAt: engineMarket.createdAt,
    lotNumber: engineMarket.lotNumber,
    artist: engineMarket.artist,
    title: engineMarket.title,
    year: engineMarket.year,
    highEstimate: engineMarket.highEstimate,
    lowEstimate: engineMarket.lowEstimate,
    currency: engineMarket.currency,
    auctionId: engineMarket.auctionId,
    bestBid: display.bestBid,
    bestAsk: display.bestAsk,
    midpoint: display.midpoint,
    spread: display.spread,
    lastPrice: display.lastPrice,
    volume: display.volume,
    orderCount: summary?.orderCount ?? 0,
  };
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const url = req.url || "/";

  if (url === "/auction-event" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        handleAuctionEvent(JSON.parse(body));
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === "/health") {
    const allSims = [...simStates.values()].filter(s => s.lotNumber > 0);
    res.end(JSON.stringify({
      status: "ok",
      engine: "clob+lmsr",
      mode: allSims.some(s => s.phase === "live") ? "live-auction" : "pre-auction-sim",
      liveLots: allSims.filter(s => s.phase === "live").length,
      resolvedLots: allSims.filter(s => s.phase === "resolved").length,
      p2pTrades: p2pTradeCount,
      ammTrades: ammTradeCount,
      timestamp: Date.now(),
    }));
    return;
  }

  if (url === "/trader-pnl") {
    const results: any[] = [];
    for (const [addr, acct] of traderAccounts) {
      let unrealizedPnl = 0;
      for (const [mktId, pos] of acct.positions) {
        const mSim = simStates.get(mktId);
        if (mSim?.phase !== "resolved") {
          const s = engine.getMarketSummary(mktId);
          const mid = s?.midpoint ?? 0.5;
          unrealizedPnl += (pos.yesShares * mid - pos.yesCost) + (pos.noShares * (1 - mid) - pos.noCost);
        }
      }
      results.push({
        name: addr,
        realizedPnl: Math.round(acct.realizedPnl * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        totalPnl: Math.round((acct.realizedPnl + unrealizedPnl) * 100) / 100,
        totalVolume: Math.round(acct.totalVolume * 100) / 100,
        totalFees: Math.round(acct.totalFees * 100) / 100,
        tradeCount: acct.tradeCount,
        preAuctionTrades: acct.preAuctionTrades,
        liveAuctionTrades: acct.liveAuctionTrades,
      });
    }
    results.sort((a, b) => b.totalPnl - a.totalPnl);
    res.end(JSON.stringify({ traders: results, timestamp: Date.now() }, null, 2));
    return;
  }

  if (url === "/auction-status") {
    const lots = [...simStates.values()]
      .filter(s => s.lotNumber > 0)
      .map(s => {
        const summary = engine.getMarketSummary(s.marketId);
        return {
          lotNumber: s.lotNumber,
          artist: engine.getMarket(s.marketId)?.artist,
          phase: s.phase,
          auctionPrice: s.auctionPrice,
          midpoint: summary?.midpoint ?? s.baseBias,
          resolved: engine.getMarket(s.marketId)?.resolved ?? false,
          outcome: engine.getMarket(s.marketId)?.outcome,
        };
      });
    res.end(JSON.stringify({ lots, timestamp: Date.now() }));
    return;
  }

  if (url === "/markets") {
    const serialized = [...simStates.keys()].map(id => serializeMarket(id)).filter(Boolean);
    res.end(JSON.stringify({ markets: serialized }));
    return;
  }

  const marketMatch = url.match(/^\/markets\/(lot-\d+|total-value)$/);
  if (marketMatch) {
    const m = serializeMarket(marketMatch[1]);
    if (m) { res.end(JSON.stringify(m)); return; }
  }

  const obMatch = url.match(/^\/markets\/(lot-\d+|total-value)\/orderbook$/);
  if (obMatch) {
    const snapshot = engine.getOrderBook(obMatch[1]);
    if (snapshot) {
      res.end(JSON.stringify({
        marketId: snapshot.marketId,
        bids: snapshot.bids.map(l => ({ price: l.price, size: l.size.toString(), numOrders: l.numOrders })),
        asks: snapshot.asks.map(l => ({ price: l.price, size: l.size.toString(), numOrders: l.numOrders })),
        lastTradePrice: snapshot.lastTradePrice,
        spread: snapshot.spread,
        hash: snapshot.hash,
        timestamp: snapshot.timestamp,
      }));
      return;
    }
    res.end(JSON.stringify({ marketId: obMatch[1], bids: [], asks: [], timestamp: Date.now() }));
    return;
  }

  const trMatch = url.match(/^\/markets\/(lot-\d+|total-value)\/trades/);
  if (trMatch) {
    const mt = recentTrades.filter(t => t.marketId === trMatch[1]).slice(0, 50);
    res.end(JSON.stringify({ trades: mt }));
    return;
  }

  if (url.startsWith("/fees/")) {
    res.end(JSON.stringify({
      feeModel: "dynamic-taker-only",
      schedule: feeCalculator.getFeeSchedule(),
    }));
    return;
  }

  if (url.startsWith("/portfolio/")) {
    const addr = url.split("/portfolio/")[1];
    if (addr) {
      const portfolio = engine.getPortfolio(addr);
      res.end(JSON.stringify({
        positions: portfolio.positions.map(p => ({
          ...p, yesShares: p.yesShares.toString(), noShares: p.noShares.toString(),
        })),
        openOrders: portfolio.openOrders.map(o => ({
          ...o, makerAmount: o.makerAmount.toString(), takerAmount: o.takerAmount.toString(),
        })),
        tradeHistory: portfolio.tradeHistory.map(t => ({
          ...t, size: t.size.toString(), fee: t.fee.toString(),
        })),
      }));
      return;
    }
  }

  if (url === "/amm-status") {
    const status: any[] = [];
    for (const [mktId, amm] of amms) {
      const s = amm.getStatus();
      status.push({
        marketId: mktId,
        yesPrice: s.yesPrice,
        noPrice: s.noPrice,
        exposure: s.exposure.toString(),
        activeOrders: s.activeOrders,
        risk: {
          ...s.risk,
          netYesExposure: s.risk.netYesExposure,
          netNoExposure: s.risk.netNoExposure,
        },
      });
    }
    res.end(JSON.stringify({ amms: status, timestamp: Date.now() }, null, 2));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
  ws.on("message", () => {});
});

// ───────────────────── Start ─────────────────────

for (const amm of amms.values()) amm.start(5000);

server.listen(8080, () => {
  const rc = riskManager.getConfig();
  const makerCount = traders.filter(t => t.aggression <= 0.35).length;
  const takerCount = traders.filter(t => t.aggression > 0.35).length;

  console.log("\n=== AUCTION SIMULATION SERVER (ENGINE-BACKED CLOB) ===");
  console.log(`Engine: MatchingEngine + LMSR AMM + Phase 1 Risk Controls`);
  console.log(`Matching: P2P order crossing + AMM passive liquidity`);
  console.log(`Phase: PRE-AUCTION (awaiting live events on POST /auction-event)`);
  console.log(`Markets: ${simStates.size - 1} lots + 1 total-value`);
  console.log(`Traders: ${traders.length} (${makerCount} makers, ${takerCount} takers)`);
  console.log(`LMSR b: ${Math.max(10, Math.round(100 * VOLUME_SCALE))} | Position cap: $${(Number(rc.positionCapUsdc) / 1e6).toFixed(0)} | Max fill: $${(Number(rc.maxFillSizeUsdc) / 1e6).toFixed(0)}`);
  console.log(`Fee model: dynamic taker-only (max ~1.56% at 50/50, 0% for makers)`);
  console.log(`Tick: ${TICK_MS}ms | Volume scale: ${(VOLUME_SCALE * 100).toFixed(1)}%`);
  console.log(`Server: http://localhost:8080 | WebSocket: ws://localhost:8080`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /auction-event   — live tracker pushes real bids here`);
  console.log(`  GET  /auction-status   — check which lots are live/resolved`);
  console.log(`  GET  /markets          — market data for frontend`);
  console.log(`  GET  /amm-status       — LMSR AMM status + risk metrics`);
  console.log(`  GET  /trader-pnl       — trader P&L breakdown`);
  console.log(`  GET  /health           — server health + P2P/AMM trade stats`);
  console.log(`\nStarting lots:\n`);
  for (const [marketId, sim] of simStates) {
    if (sim.lotNumber === 0) continue;
    const market = engine.getMarket(marketId);
    console.log(`  Lot ${sim.lotNumber}: ${market?.artist} — initial: ${(sim.baseBias * 100).toFixed(1)}%`);
  }
  console.log(`\nPre-auction trading starting in 2 seconds...\n`);
  console.log("When the live tracker sends events, lots will switch to LIVE mode.\n");

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
