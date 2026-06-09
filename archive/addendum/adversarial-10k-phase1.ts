/**
 * 10,000 Auction Monte Carlo — Phase 1 Defenses Active
 *
 * Same simulation as before, but the MM now has:
 *  1a. Position cap: $5,000 max net directional exposure per market
 *  1b. Inventory-skewed spread: widens with accumulated exposure
 *  1c. Time withdrawal: pulls quotes in final 10 seconds
 *  1d. Per-trade size limit: $500 max per fill
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const marketsJson = JSON.parse(readFileSync(resolve(__dirname, "markets.json"), "utf-8"));
const LOT_NUM = parseInt(process.argv[2] || "101", 10);
const lotData = marketsJson.lots.find((l: any) => l.lotNumber === LOT_NUM);
if (!lotData) { console.error(`Lot ${LOT_NUM} not found in markets.json`); process.exit(1); }

let seed = 1;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function randFloat(min: number, max: number): number {
  return min + rand() * (max - min);
}

const RUNS = 10_000;
const LOW_ESTIMATE = Number(lotData.lowEstimate);
const HIGH_ESTIMATE = Number(lotData.highEstimate);
const FEE_RATE = 0.0175;
const FEE_EXPONENT = 1;
const PRE_AUCTION_BASE = 0.35;

// Phase 1 parameters
const POSITION_CAP = 5_000;     // $5k max net directional exposure
const MAX_FILL_SIZE = 500;       // $500 max per fill
const WITHDRAWAL_WINDOW = 10;    // pull quotes final 10s
const BASE_HALF_SPREAD = 0.01;   // 1¢ base half-spread
const SKEW_PER_UNIT = 0.005;     // 0.5¢ per $500 exposure
const SKEW_UNIT = 500;           // $500 units

function calcFee(cost: number, price: number): number {
  const p = Math.max(0.01, Math.min(0.99, price));
  return cost * p * FEE_RATE * Math.pow(p * (1 - p), FEE_EXPONENT);
}

function liveImpliedProb(ap: number, s: number, total: number): number {
  const climb = (ap - LOW_ESTIMATE) / (HIGH_ESTIMATE - LOW_ESTIMATE);
  const timeLeft = 1 - (s / total);
  if (ap >= HIGH_ESTIMATE) return 0.92 + climb * 0.05;
  const paceNeeded = (HIGH_ESTIMATE - ap) / Math.max(1, HIGH_ESTIMATE - LOW_ESTIMATE);
  const paceScore = Math.max(0, 1 - paceNeeded / Math.max(0.05, timeLeft));
  return Math.max(0.05, Math.min(0.95, 0.10 + 0.85 * Math.pow(climb, 1.5) * (0.5 + 0.5 * paceScore)));
}

// MM risk state per run
interface MMRisk {
  netYesExposure: number;
  netNoExposure: number;
}

function getInventorySpread(risk: MMRisk): {
  bidHalf: number; askHalf: number; bidCapped: boolean; askCapped: boolean;
} {
  const exposureUnits = risk.netYesExposure / SKEW_UNIT;
  const skew = exposureUnits * SKEW_PER_UNIT;
  const bidHalf = Math.max(0.005, BASE_HALF_SPREAD + Math.max(0, skew));
  const askHalf = Math.max(0.005, BASE_HALF_SPREAD + Math.max(0, -skew));
  const bidCapped = risk.netYesExposure >= POSITION_CAP;
  const askCapped = risk.netNoExposure >= POSITION_CAP;
  return { bidHalf, askHalf, bidCapped, askCapped };
}

function getAllowedFill(risk: MMRisk, requestedCost: number, isBuyYes: boolean): number {
  let allowed = Math.min(requestedCost, MAX_FILL_SIZE);
  const exposure = isBuyYes ? risk.netYesExposure : risk.netNoExposure;
  const headroom = POSITION_CAP - Math.abs(exposure);
  if (headroom <= 0) return 0;
  return Math.min(allowed, headroom);
}

// Aggregates
let mmWins = 0;
let mmTotalPnl = 0;
let mmTotalPnlFees = 0;
const mmPnls: number[] = [];

interface TierStats { totalPnl: number; count: number; wins: number; }
const tierStats: Record<string, TierStats> = {
  insider: { totalPnl: 0, count: 0, wins: 0 },
  semi: { totalPnl: 0, count: 0, wins: 0 },
  retail: { totalPnl: 0, count: 0, wins: 0 },
  degen: { totalPnl: 0, count: 0, wins: 0 },
};

let totalYesOutcomes = 0;
let totalTrades = 0;
let totalVolume = 0;
let totalFees = 0;
let totalP2P = 0;
let totalTraderPnl = 0;
let totalCapHits = 0;
let totalWithdrawals = 0;
let totalSizeClips = 0;

const startTime = Date.now();

for (let run = 0; run < RUNS; run++) {
  const AUCTION_SECONDS = randInt(60, 120);
  const PRE_TICKS = randInt(60, 120);
  const OUTCOME_PRICE = randInt(LOW_ESTIMATE, Math.round(HIGH_ESTIMATE * 1.25));
  const IS_YES = OUTCOME_PRICE >= HIGH_ESTIMATE;
  if (IS_YES) totalYesOutcomes++;

  // Auction path
  const auctionPath: number[] = [];
  let aPrice = LOW_ESTIMATE;
  const totalClimb = OUTCOME_PRICE - LOW_ESTIMATE;
  const hammerSec = randInt(Math.round(AUCTION_SECONDS * 0.4), AUCTION_SECONDS - 5);
  for (let s = 0; s < AUCTION_SECONDS; s++) {
    if (s <= hammerSec && totalClimb > 0) {
      const prog = s / hammerSec;
      const target = LOW_ESTIMATE + totalClimb * Math.pow(prog, 0.8);
      if (rand() < 0.6 || s === hammerSec) {
        aPrice = Math.max(aPrice, Math.round(target + randFloat(-50000, 100000)));
        aPrice = Math.min(aPrice, OUTCOME_PRICE);
      }
      if (s === hammerSec) aPrice = OUTCOME_PRICE;
    }
    auctionPath.push(aPrice);
  }

  // Traders
  const NUM_TRADERS = randInt(8, 20);
  interface Trader {
    info: number; bias: "yes" | "no"; budget: number; aggression: number;
    yesShares: number; noShares: number; cashSpent: number; cashReceived: number;
    fees: number;
  }
  const traders: Trader[] = [];
  for (let i = 0; i < NUM_TRADERS; i++) {
    const info = randFloat(0, 1);
    let bias: "yes" | "no";
    if (info > 0.65) bias = IS_YES ? "yes" : "no";
    else if (info > 0.35) bias = rand() < (0.45 + info * 0.3) ? (IS_YES ? "yes" : "no") : (IS_YES ? "no" : "yes");
    else bias = rand() < 0.5 ? "yes" : "no";
    traders.push({
      info, bias, budget: randInt(200, 5000), aggression: randFloat(0.15, 0.85),
      yesShares: 0, noShares: 0, cashSpent: 0, cashReceived: 0, fees: 0,
    });
  }

  // MM with risk controls
  const mm = { yesShares: 0, noShares: 0, cashSpent: 0, cashReceived: 0, fills: 0 };
  const risk: MMRisk = { netYesExposure: 0, netNoExposure: 0 };
  let runFees = 0, runP2P = 0, runTrades = 0, runVolume = 0;

  // Resting orders
  interface Resting { traderIdx: number; side: "sell_yes" | "sell_no"; price: number; shares: number; tick: number; }
  const resting: Resting[] = [];

  function doTrade(buyerIdx: number, sellerIdx: number, side: "YES" | "NO", cost: number, shares: number, price: number, isP2P: boolean) {
    const fee = calcFee(cost, price);
    runFees += fee; runTrades++; runVolume += cost;
    if (isP2P) runP2P++;

    if (buyerIdx >= 0) {
      const b = traders[buyerIdx];
      if (side === "YES") b.yesShares += shares; else b.noShares += shares;
      b.cashSpent += cost + fee; b.fees += fee; b.budget -= cost + fee;
    }
    if (sellerIdx >= 0) {
      const s = traders[sellerIdx];
      if (side === "YES") s.yesShares -= shares; else s.noShares -= shares;
      s.cashReceived += cost;
    }
    if (!isP2P) {
      if (buyerIdx < 0) { // MM buying
        if (side === "YES") { mm.yesShares += shares; risk.netYesExposure += cost; }
        else { mm.noShares += shares; risk.netNoExposure += cost; }
        mm.cashSpent += cost;
      } else { // MM selling
        if (side === "YES") { mm.yesShares -= shares; risk.netYesExposure -= cost; }
        else { mm.noShares -= shares; risk.netNoExposure -= cost; }
        mm.cashReceived += cost;
      }
      mm.fills++;
    }
  }

  // PHASE 1: Pre-auction
  for (let tick = 0; tick < PRE_TICKS; tick++) {
    const mmFairYes = PRE_AUCTION_BASE + randFloat(-0.03, 0.03);
    const mmFairNo = 1 - mmFairYes;

    // Phase 1b: Get inventory-adjusted spread for this tick
    const { bidHalf, askHalf, bidCapped, askCapped } = getInventorySpread(risk);

    for (let ri = resting.length - 1; ri >= 0; ri--) {
      if (resting[ri].tick < tick - 20) resting.splice(ri, 1);
    }

    for (let ti = 0; ti < traders.length; ti++) {
      const tr = traders[ti];
      if (rand() > tr.aggression * 0.25) continue;
      if (tr.budget < 5 && tr.yesShares < 10 && tr.noShares < 10) continue;

      const trueProb = IS_YES ? 0.85 : 0.15;
      const belief = tr.info * trueProb + (1 - tr.info) * (tr.bias === "yes" ? 0.55 : 0.25);
      const edge = belief - mmFairYes;

      let action = 0;
      if (edge > 0.04 && tr.budget > 10) action = 1;
      else if (edge < -0.04 && tr.budget > 10) action = 2;
      if (tick > PRE_TICKS * 0.5 && rand() < 0.08) {
        if (tr.yesShares > 30 && tr.bias === "no") action = 3;
        else if (tr.noShares > 30 && tr.bias === "yes") action = 4;
      }
      if (action === 0) continue;

      if (action === 1 || action === 2) {
        const isBuyYes = action === 1;

        // Phase 1b: Trader sees the wider spread (MM's adjusted price)
        const mmBidPrice = mmFairYes - bidHalf;
        const mmAskPrice = mmFairYes + askHalf;
        const price = isBuyYes ? mmAskPrice : (1 - mmBidPrice);

        const fraction = 0.04 + rand() * 0.15;
        const targetCost = Math.min(tr.budget * fraction, tr.budget);
        if (targetCost < 3) continue;
        const shares = Math.max(5, Math.round(targetCost / price));
        const cost = shares * price;
        const side: "YES" | "NO" = isBuyYes ? "YES" : "NO";
        const sellSide = isBuyYes ? "sell_yes" : "sell_no";

        // Try P2P
        let remaining = cost;
        let remainingShares = shares;
        for (let ri = 0; ri < resting.length && remainingShares > 0; ri++) {
          const ro = resting[ri];
          if (ro.side !== sellSide || ro.shares <= 0 || ro.traderIdx === ti) continue;
          if (ro.price > price + 0.03) continue;
          const fill = Math.min(remainingShares, ro.shares);
          const fillCost = fill * ro.price;
          doTrade(ti, ro.traderIdx, side, fillCost, fill, ro.price, true);
          ro.shares -= fill;
          remainingShares -= fill;
          remaining -= fillCost;
        }
        for (let ri = resting.length - 1; ri >= 0; ri--) { if (resting[ri].shares <= 0) resting.splice(ri, 1); }

        // MM fills remainder with Phase 1 checks
        if (remainingShares > 0) {
          // Phase 1a: Check position cap
          if ((isBuyYes && bidCapped) || (!isBuyYes && askCapped)) {
            totalCapHits++;
            continue; // MM refuses — capped out
          }

          // Phase 1d: Clip to max fill size
          const fillCost = remainingShares * price;
          const allowed = getAllowedFill(risk, fillCost, isBuyYes);
          if (allowed <= 0) { totalCapHits++; continue; }
          if (allowed < fillCost) totalSizeClips++;
          const actualShares = Math.max(1, Math.round(allowed / price));
          doTrade(ti, -1, side, allowed, actualShares, price, false);
        }

        if (rand() < 0.25 && tr.budget > 20) {
          const restSide = isBuyYes ? "sell_no" : "sell_yes";
          const restPrice = isBuyYes ? mmFairYes + 0.02 : mmFairNo + 0.02;
          const restShares = Math.max(5, Math.round((tr.budget * 0.05) / price));
          resting.push({ traderIdx: ti, side: restSide as any, price: restPrice, shares: restShares, tick });
        }
      }

      if (action === 3 && tr.yesShares > 10) {
        const amt = Math.min(tr.yesShares, Math.max(5, Math.round(tr.yesShares * (0.3 + rand() * 0.4))));
        const cost = amt * mmFairYes;
        if (rand() < 0.5) resting.push({ traderIdx: ti, side: "sell_yes", price: mmFairYes - 0.01, shares: amt, tick });
        else {
          const allowed = getAllowedFill(risk, cost, true);
          if (allowed > 0) {
            const actualShares = Math.max(1, Math.round(allowed / mmFairYes));
            doTrade(-1, ti, "YES", allowed, actualShares, mmFairYes, false);
          }
        }
      }
      if (action === 4 && tr.noShares > 10) {
        const amt = Math.min(tr.noShares, Math.max(5, Math.round(tr.noShares * (0.3 + rand() * 0.4))));
        const mmFairNo2 = 1 - mmFairYes;
        const cost = amt * mmFairNo2;
        if (rand() < 0.5) resting.push({ traderIdx: ti, side: "sell_no", price: mmFairNo2 - 0.01, shares: amt, tick });
        else {
          const allowed = getAllowedFill(risk, cost, false);
          if (allowed > 0) {
            const actualShares = Math.max(1, Math.round(allowed / mmFairNo2));
            doTrade(-1, ti, "NO", allowed, actualShares, mmFairNo2, false);
          }
        }
      }
    }
  }

  // PHASE 2: Live auction
  let stallStart = -1;
  for (let s = 0; s < AUCTION_SECONDS; s++) {
    const tick = PRE_TICKS + s;
    const ap = auctionPath[s];
    const prevAP = s > 0 ? auctionPath[s - 1] : LOW_ESTIMATE;
    const moved = ap > prevAP;
    if (!moved) { if (stallStart < 0) stallStart = s; } else stallStart = -1;
    const stallDur = stallStart >= 0 ? s - stallStart : 0;
    const stalled = stallDur > 5;

    // Phase 1c: Withdraw in final seconds
    const timeRemaining = AUCTION_SECONDS - s;
    if (timeRemaining <= WITHDRAWAL_WINDOW) {
      totalWithdrawals++;
      continue; // MM pulls all quotes — no fills this second
    }

    const fairYes = liveImpliedProb(ap, s, AUCTION_SECONDS);
    const fairNo = 1 - fairYes;
    const { bidHalf, askHalf, bidCapped, askCapped } = getInventorySpread(risk);

    for (let ri = resting.length - 1; ri >= 0; ri--) { if (resting[ri].tick < tick - 10) resting.splice(ri, 1); }

    for (let ti = 0; ti < traders.length; ti++) {
      const tr = traders[ti];
      if (rand() > tr.aggression * 0.12) continue;
      if (tr.budget < 3 && tr.yesShares < 5 && tr.noShares < 5) continue;

      const trueProb = IS_YES ? 0.90 : 0.10;
      const belief = tr.info * trueProb + (1 - tr.info) * fairYes;
      const edge = belief - fairYes;

      let action = 0;
      if (stalled && tr.info > 0.5 && !IS_YES) {
        action = tr.yesShares > 10 ? 3 : (tr.budget > 10 ? 2 : 0);
      } else if (moved && tr.info > 0.5 && IS_YES) {
        action = tr.budget > 10 ? 1 : 0;
      } else if (edge > 0.06 && tr.budget > 10) action = 1;
      else if (edge < -0.06 && tr.budget > 10) action = 2;

      if (tr.info > 0.6 && s > AUCTION_SECONDS * 0.3) {
        if (!IS_YES && tr.yesShares > 20) action = 3;
        if (IS_YES && tr.noShares > 20) action = 4;
      }
      if (tr.info < 0.2 && stalled && rand() < 0.2) {
        if (tr.bias === "yes") action = 1;
      }
      if (action === 0) continue;

      if (action === 1 || action === 2) {
        const isBuyYes = action === 1;
        const mmAskPrice = Math.min(0.99, fairYes + askHalf);
        const mmBidPrice = Math.max(0.01, fairYes - bidHalf);
        const price = isBuyYes ? mmAskPrice : (1 - mmBidPrice);
        if (price < 0.01 || price > 0.99) continue;
        const fraction = 0.05 + rand() * 0.20;
        const targetCost = Math.min(tr.budget * fraction, tr.budget);
        if (targetCost < 3) continue;
        const shares = Math.max(5, Math.round(targetCost / price));
        const cost = shares * price;
        const side: "YES" | "NO" = isBuyYes ? "YES" : "NO";
        const sellSide = isBuyYes ? "sell_yes" : "sell_no";

        let remainingShares = shares;
        for (let ri = 0; ri < resting.length && remainingShares > 0; ri++) {
          const ro = resting[ri];
          if (ro.side !== sellSide || ro.shares <= 0 || ro.traderIdx === ti || ro.price > price + 0.03) continue;
          const fill = Math.min(remainingShares, ro.shares);
          const fillCost = fill * ro.price;
          doTrade(ti, ro.traderIdx, side, fillCost, fill, ro.price, true);
          ro.shares -= fill;
          remainingShares -= fill;
        }
        for (let ri = resting.length - 1; ri >= 0; ri--) { if (resting[ri].shares <= 0) resting.splice(ri, 1); }

        if (remainingShares > 0) {
          if ((isBuyYes && bidCapped) || (!isBuyYes && askCapped)) { totalCapHits++; continue; }
          const fillCost = remainingShares * price;
          const allowed = getAllowedFill(risk, fillCost, isBuyYes);
          if (allowed <= 0) { totalCapHits++; continue; }
          if (allowed < fillCost) totalSizeClips++;
          const actualShares = Math.max(1, Math.round(allowed / price));
          doTrade(ti, -1, side, allowed, actualShares, price, false);
        }
      }
      if (action === 3 && tr.yesShares > 5) {
        const amt = Math.min(tr.yesShares, Math.max(5, Math.round(tr.yesShares * (0.3 + rand() * 0.5))));
        const cost = amt * fairYes;
        if (rand() < 0.4) resting.push({ traderIdx: ti, side: "sell_yes", price: fairYes - 0.01, shares: amt, tick });
        else {
          const allowed = getAllowedFill(risk, cost, true);
          if (allowed > 0) doTrade(-1, ti, "YES", allowed, Math.max(1, Math.round(allowed / fairYes)), fairYes, false);
        }
      }
      if (action === 4 && tr.noShares > 5) {
        const amt = Math.min(tr.noShares, Math.max(5, Math.round(tr.noShares * (0.3 + rand() * 0.5))));
        const cost = amt * fairNo;
        if (rand() < 0.4) resting.push({ traderIdx: ti, side: "sell_no", price: fairNo - 0.01, shares: amt, tick });
        else {
          const allowed = getAllowedFill(risk, cost, false);
          if (allowed > 0) doTrade(-1, ti, "NO", allowed, Math.max(1, Math.round(allowed / fairNo)), fairNo, false);
        }
      }
    }
  }

  // Resolution
  const mmLiab = IS_YES ? (mm.yesShares < 0 ? Math.abs(mm.yesShares) : 0) : (mm.noShares < 0 ? Math.abs(mm.noShares) : 0);
  const mmWin = IS_YES ? Math.max(0, mm.yesShares) : Math.max(0, mm.noShares);
  const mmPnl = mm.cashReceived - mm.cashSpent + mmWin - mmLiab;

  mmPnls.push(mmPnl);
  mmTotalPnl += mmPnl;
  mmTotalPnlFees += mmPnl + runFees;
  if (mmPnl > 0) mmWins++;
  totalTrades += runTrades;
  totalVolume += runVolume;
  totalFees += runFees;
  totalP2P += runP2P;

  for (const tr of traders) {
    const payout = IS_YES ? Math.max(0, tr.yesShares) : Math.max(0, tr.noShares);
    const net = payout + tr.cashReceived - tr.cashSpent;
    totalTraderPnl += net;
    let tier: string;
    if (tr.info > 0.7) tier = "insider";
    else if (tr.info > 0.4) tier = "semi";
    else if (tr.info > 0.2) tier = "retail";
    else tier = "degen";
    tierStats[tier].totalPnl += net;
    tierStats[tier].count++;
    if (net > 0) tierStats[tier].wins++;
  }

  if ((run + 1) % 1000 === 0) {
    console.log(`  Run ${run + 1}/10000 (${((Date.now() - startTime) / 1000).toFixed(1)}s) — MM avg: $${(mmTotalPnl / (run + 1)).toFixed(2)}`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// Stats
mmPnls.sort((a, b) => a - b);
const avgPnl = mmTotalPnl / RUNS;
const avgPnlFees = mmTotalPnlFees / RUNS;
const median = mmPnls[Math.floor(RUNS / 2)];
const p5 = mmPnls[Math.floor(RUNS * 0.05)];
const p25 = mmPnls[Math.floor(RUNS * 0.25)];
const p75 = mmPnls[Math.floor(RUNS * 0.75)];
const p95 = mmPnls[Math.floor(RUNS * 0.95)];
const worst = mmPnls[0];
const best = mmPnls[RUNS - 1];
const stdDev = Math.sqrt(mmPnls.reduce((s, p) => s + (p - avgPnl) ** 2, 0) / RUNS);
const sharpe = stdDev > 0 ? avgPnl / stdDev : 0;

// Output
const log: string[] = [];
const fmt = (n: number) => n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
const fmtB = (n: number) => n >= 0 ? `**+$${n.toFixed(2)}**` : `**-$${Math.abs(n).toFixed(2)}**`;

log.push("# Monte Carlo: 10,000 Auctions — Phase 1 Defenses Active");
log.push("");
log.push(`*Completed in ${elapsed}s*`);
log.push("");
log.push("## Phase 1 Risk Controls");
log.push("");
log.push("| Defense | Setting |");
log.push("|---------|---------|");
log.push(`| 1a. Position cap | $${POSITION_CAP.toLocaleString()} max net directional per market |`);
log.push(`| 1b. Inventory skew | ${(BASE_HALF_SPREAD*100).toFixed(0)}¢ base + ${(SKEW_PER_UNIT*100).toFixed(1)}¢ per $${SKEW_UNIT} exposure |`);
log.push(`| 1c. Time withdrawal | Pull quotes final ${WITHDRAWAL_WINDOW}s |`);
log.push(`| 1d. Max fill size | $${MAX_FILL_SIZE} per trade |`);

log.push("");
log.push("## Defense Activation Stats");
log.push("");
log.push("| Event | Count | Avg per Auction |");
log.push("|-------|-------|-----------------|");
log.push(`| Position cap blocks | ${totalCapHits.toLocaleString()} | ${(totalCapHits / RUNS).toFixed(1)} |`);
log.push(`| Size clips (reduced fill) | ${totalSizeClips.toLocaleString()} | ${(totalSizeClips / RUNS).toFixed(1)} |`);
log.push(`| Withdrawal seconds | ${totalWithdrawals.toLocaleString()} | ${(totalWithdrawals / RUNS).toFixed(1)} |`);

log.push("");
log.push("---");
log.push("");
log.push("## Market Maker P&L — Phase 1 vs. Blind");
log.push("");
log.push("| Statistic | **Phase 1 (defended)** | Blind (baseline) | Improvement |");
log.push("|-----------|----------------------|-----------------|-------------|");

const blindAvg = -18921.36;
const blindMedian = -11214.70;
const blindWorst = -79145.90;
const blindBest = 4773.80;
const blindStdDev = 23236.58;
const blindSharpe = -0.814;
const blindWR = 17.6;

const pctImprove = (a: number, b: number) => {
  if (b === 0) return "N/A";
  const pct = ((a - b) / Math.abs(b)) * 100;
  return pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
};

log.push(`| **Mean P&L** | ${fmtB(avgPnl)} | ${fmt(blindAvg)} | ${pctImprove(avgPnl, blindAvg)} |`);
log.push(`| **Mean + fees** | ${fmtB(avgPnlFees)} | ${fmt(blindAvg + 52.23)} | ${pctImprove(avgPnlFees, blindAvg + 52.23)} |`);
log.push(`| Median | ${fmt(median)} | ${fmt(blindMedian)} | ${pctImprove(median, blindMedian)} |`);
log.push(`| Std Dev | $${stdDev.toFixed(2)} | $${blindStdDev.toFixed(2)} | ${pctImprove(-stdDev, -blindStdDev)} |`);
log.push(`| Sharpe | ${sharpe.toFixed(3)} | ${blindSharpe.toFixed(3)} | ${(sharpe - blindSharpe).toFixed(3)} |`);
log.push(`| Win Rate | **${((mmWins / RUNS) * 100).toFixed(1)}%** | ${blindWR}% | ${((mmWins / RUNS) * 100 - blindWR).toFixed(1)}pp |`);
log.push(`| 5th pctile | ${fmt(p5)} | ${fmt(-75870.49)} | |`);
log.push(`| 95th pctile | ${fmt(p95)} | ${fmt(1878.49)} | |`);
log.push(`| Worst | ${fmt(worst)} | ${fmt(blindWorst)} | ${pctImprove(-Math.abs(worst), -Math.abs(blindWorst))} |`);
log.push(`| Best | ${fmt(best)} | ${fmt(blindBest)} | |`);

log.push("");
log.push("---");
log.push("");
log.push("## Trader Tier Performance");
log.push("");
log.push("| Tier | Count | Total P&L | Avg/Trader | Win Rate |");
log.push("|------|-------|-----------|-----------|----------|");
for (const [key, label] of [["insider", "Insiders (>70%)"], ["semi", "Semi-informed (40-70%)"], ["retail", "Retail (20-40%)"], ["degen", "Degens (<20%)"]] as const) {
  const t = tierStats[key];
  const avg = t.count > 0 ? t.totalPnl / t.count : 0;
  const wr = t.count > 0 ? (t.wins / t.count * 100).toFixed(1) : "0";
  log.push(`| ${label} | ${t.count.toLocaleString()} | ${fmtB(t.totalPnl)} | ${fmt(avg)} | ${wr}% |`);
}
log.push(`| **Market Maker** | ${RUNS.toLocaleString()} | ${fmtB(mmTotalPnl)} | ${fmt(avgPnl)} | ${((mmWins / RUNS) * 100).toFixed(1)}% |`);

log.push("");
log.push("---");
log.push("");
log.push("## Volume & Fees");
log.push("");
log.push("| Metric | Phase 1 | Blind | Change |");
log.push("|--------|---------|-------|--------|");
log.push(`| Avg trades/auction | ${(totalTrades / RUNS).toFixed(0)} | 185 | |`);
log.push(`| Avg volume/auction | $${(totalVolume / RUNS).toFixed(2)} | $26,462.98 | |`);
log.push(`| Avg fees/auction | $${(totalFees / RUNS).toFixed(2)} | $52.23 | |`);
log.push(`| P2P fill rate | ${((totalP2P / totalTrades) * 100).toFixed(1)}% | 9.6% | |`);

log.push("");
log.push("---");
log.push("");
log.push("## Conclusion");
log.push("");
if (avgPnl > blindAvg) {
  const improvement = avgPnl - blindAvg;
  log.push(`Phase 1 defenses improved average MM P&L by **$${improvement.toFixed(2)}** per auction (${pctImprove(avgPnl, blindAvg)} reduction in losses).`);
} else {
  log.push(`Phase 1 defenses did not improve average MM P&L.`);
}
log.push("");
if (Math.abs(worst) < Math.abs(blindWorst)) {
  log.push(`Tail risk cut from ${fmt(blindWorst)} to ${fmt(worst)} worst case (${pctImprove(-Math.abs(worst), -Math.abs(blindWorst))} improvement).`);
}
log.push("");
log.push(`Position cap blocked ${totalCapHits.toLocaleString()} fills that would have increased exposure beyond $${POSITION_CAP.toLocaleString()}.`);
log.push("");
log.push(`Next step: Phase 2 (insider detection + toxicity scoring) to further reduce adverse selection losses.`);

const output = log.join("\n");
writeFileSync("marketmodel-phase1.md", output);
console.log(output);
console.log("\n✅ Written to marketmodel-phase1.md");
