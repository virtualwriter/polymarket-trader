import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { MatchingEngine } from "./matching/MatchingEngine.js";
import { SettlementBatcher } from "./settlement/SettlementBatcher.js";
import { LMSRAMMProvider } from "./amm/LMSR.js";
import { BidJSClient } from "./auction/BidJSClient.js";
import { createServer } from "./api/server.js";
import { Market } from "./types.js";
import { FeeCalculator, VipTier } from "./fees/FeeCalculator.js";
import { RebatePool } from "./fees/RebatePool.js";
import { RiskManager } from "./mm/RiskManager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const port = parseInt(process.env.PORT || "8080");

  // Initialize fee system
  const feeCalculator = new FeeCalculator({
    feeRate: parseFloat(process.env.FEE_RATE || "0.0175"),
    exponent: parseInt(process.env.FEE_EXPONENT || "1"),
  });
  const rebatePool = new RebatePool(feeCalculator);

  // Register VIP dealers from env (comma-separated addresses)
  const vipDealers = (process.env.VIP_DEALERS || "").split(",").filter(Boolean);
  for (const addr of vipDealers) {
    feeCalculator.registerVip(addr.trim(), VipTier.DEALER);
    console.log(`[VIP] Registered dealer: ${addr.trim()}`);
  }

  // Initialize matching engine with fee system
  const engine = new MatchingEngine(feeCalculator, rebatePool);

  // Initialize settlement batcher
  const batcher = new SettlementBatcher(engine, {
    rpcUrl: process.env.RPC_URL || "https://sepolia.base.org",
    operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001",
    exchangeAddress: process.env.CTF_EXCHANGE_ADDRESS || "0x0000000000000000000000000000000000000000",
    batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS || "3000"),
    maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE || "20"),
  });

  // Phase 1: MM Risk Manager — survival mechanics
  const riskManager = new RiskManager({
    positionCapUsdc: BigInt(process.env.MM_POSITION_CAP_USDC || "5000000000"),    // $5k default
    maxFillSizeUsdc: BigInt(process.env.MM_MAX_FILL_USDC || "500000000"),          // $500 default
    withdrawalWindowSeconds: parseInt(process.env.MM_WITHDRAWAL_WINDOW || "10"),
    baseHalfSpread: parseFloat(process.env.MM_BASE_HALF_SPREAD || "0.01"),
    inventorySkewPerUnit: parseFloat(process.env.MM_SKEW_PER_UNIT || "0.005"),
    inventoryUnitUsdc: BigInt(process.env.MM_SKEW_UNIT_USDC || "500000000"),
  });

  // Load markets and hydrate on-chain IDs (conditionId, yesTokenId, noTokenId)
  const markets = loadMarkets();
  await hydrateMarketsFromChain(markets);
  const ammProviders: LMSRAMMProvider[] = [];

  for (const market of markets) {
    engine.registerMarket(market);

    // Set auction end time so the risk manager knows when to pull quotes
    riskManager.setAuctionEndTime(market.id, market.endDate);

    // Start AMM with shared risk manager
    const amm = new LMSRAMMProvider(engine, market.id, {
      liquidityParameter: 100,
      maxExposureUsdc: 10_000_000_000n,
      initialYesPrice: 0.5,
      riskManager,
    });

    // Register the AMM fill handler so trades update the risk manager
    engine.registerAmmFillHandler(amm.getAmmAddress(), (trade) => amm.onFill(trade));

    amm.start(5000);
    ammProviders.push(amm);
  }

  // Start BidJS live auction feed (if configured)
  let bidJsClient: BidJSClient | null = null;
  const bidJsAuctionUuid = process.env.BIDJS_AUCTION_UUID;

  if (bidJsAuctionUuid) {
    const highEstimates = new Map<number, number>();
    for (const market of markets) {
      highEstimates.set(market.lotNumber, Number(market.highEstimate));
    }

    bidJsClient = new BidJSClient({
      auctionUuid: bidJsAuctionUuid,
      region: process.env.BIDJS_REGION || "eu-west-2",
      lotMapping: new Map(),
      highEstimates,
      engine,
      autoResolve: process.env.BIDJS_AUTO_RESOLVE === "true",
    });
    bidJsClient.start();
  }

  // Start settlement and rebate distribution
  batcher.start();
  rebatePool.startAutoDistribution();

  // Start API server
  const server = createServer(engine);

  try {
    await server.listen({ port, host: "0.0.0.0" });
    const rc = riskManager.getConfig();
    console.log(`\nChristie's Markets Engine running on port ${port}`);
    console.log(`Markets loaded: ${markets.length}`);
    console.log(`Settlement batcher: active`);
    console.log(`AMM providers: ${ammProviders.length}`);
    console.log(`Fee model: dynamic taker-only (max ~1.56% at 50/50, 0% for makers)`);
    console.log(`Rebate pool: active (daily distribution at 00:00 UTC)`);
    console.log(`VIP dealers: ${vipDealers.length}`);
    console.log(`BidJS live feed: ${bidJsClient ? "active" : "not configured (set BIDJS_AUCTION_UUID)"}`);
    console.log(`[Phase 1] Position cap: $${Number(rc.positionCapUsdc) / 1e6} per market`);
    console.log(`[Phase 1] Max fill: $${Number(rc.maxFillSizeUsdc) / 1e6} per trade`);
    console.log(`[Phase 1] Quote withdrawal: ${rc.withdrawalWindowSeconds}s before resolution`);
    console.log(`[Phase 1] Base half-spread: ${(rc.baseHalfSpread * 100).toFixed(1)}¢ + ${(rc.inventorySkewPerUnit * 100).toFixed(1)}¢ per $${Number(rc.inventoryUnitUsdc) / 1e6} exposure`);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    bidJsClient?.stop();
    batcher.stop();
    rebatePool.stop();
    for (const amm of ammProviders) amm.stop();
    await batcher.flush();
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

const UMA_ADAPTER_ABI = [
  "function getMarket(bytes32 questionId) external view returns (tuple(bytes32 conditionId, bytes32 questionId, bool resolved, bool outcome, bytes32 assertionId, bytes ancillaryData, uint256 rewardAmount))",
];

const CONDITIONAL_TOKENS_ABI = [
  "function getPositionId(address collateralToken, bytes32 conditionId, uint256 outcomeIndex) external pure returns (uint256)",
];

async function hydrateMarketsFromChain(markets: Market[]): Promise<void> {
  const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";
  const adapterAddress = process.env.UMA_ADAPTER_ADDRESS;
  const ctAddress = process.env.CT_ADDRESS;
  const usdcAddress = process.env.USDC_ADDRESS;

  if (!adapterAddress || !ctAddress || !usdcAddress) {
    console.warn("[Hydrate] UMA_ADAPTER_ADDRESS, CT_ADDRESS, or USDC_ADDRESS not set — skipping on-chain hydration");
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const adapter = new ethers.Contract(adapterAddress, UMA_ADAPTER_ABI, provider);
  const ct = new ethers.Contract(ctAddress, CONDITIONAL_TOKENS_ABI, provider);

  console.log(`[Hydrate] Fetching on-chain IDs for ${markets.length} markets...`);

  for (const market of markets) {
    try {
      const onChain = await adapter.getMarket(market.questionId);
      const conditionId: string = onChain.conditionId;

      if (conditionId === ethers.ZeroHash) {
        console.warn(`[Hydrate] Lot ${market.lotNumber}: not initialized on-chain`);
        continue;
      }

      const yesTokenId: bigint = await ct.getPositionId(usdcAddress, conditionId, 0);
      const noTokenId: bigint = await ct.getPositionId(usdcAddress, conditionId, 1);

      market.conditionId = conditionId;
      market.yesTokenId = yesTokenId.toString();
      market.noTokenId = noTokenId.toString();

      console.log(`[Hydrate] Lot ${market.lotNumber}: conditionId=${conditionId.slice(0, 10)}… yes=${yesTokenId} no=${noTokenId}`);
    } catch (err) {
      console.error(`[Hydrate] Lot ${market.lotNumber} failed:`, err);
    }
  }
}

/**
 * Load Christie's auction markets from scripts/markets.json — the single source of truth
 * for lot metadata including estimates. This file can be refreshed by the scraper.
 */
function loadMarkets(): Market[] {
  const jsonPath = resolve(__dirname, "../../../scripts/markets.json");
  const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
    auction: { id: string; name: string; date: string };
    lots: Array<{
      lotNumber: number; artist: string; title: string; year: string;
      medium: string; lowEstimate: string; highEstimate: string;
      currency: string; guaranteed: boolean; notes: string;
    }>;
  };

  const markets: Market[] = raw.lots.map((lot) => {
    const id = `lot-${lot.lotNumber}`;
    const questionId = ethers.keccak256(ethers.toUtf8Bytes(`christies-24181-CKS-lot-${lot.lotNumber}`));
    return {
      id,
      questionId,
      conditionId: "",
      yesTokenId: "",
      noTokenId: "",
      question: `Will Lot ${lot.lotNumber} — ${lot.artist}, "${lot.title}" (${lot.year}) — sell for over its high estimate of £${Number(lot.highEstimate).toLocaleString()}?`,
      description: `Binary market on whether Lot ${lot.lotNumber} in Christie's "The Art of the Surreal Evening Sale" (Sale 24181-CKS, 5 March 2026, London) will achieve a hammer price at or above £${Number(lot.highEstimate).toLocaleString()}.`,
      resolutionSource: "Official Christie's auction results at christies.com",
      endDate: new Date("2026-03-05T19:00:00Z").getTime(),
      resolved: false,
      createdAt: Date.now(),
      lotNumber: lot.lotNumber,
      artist: lot.artist,
      title: lot.title,
      year: lot.year,
      lowEstimate: lot.lowEstimate,
      highEstimate: lot.highEstimate,
      currency: lot.currency,
      auctionId: "24181-CKS",
    };
  });

  // Total-value aggregate market
  const totalHigh = raw.lots.reduce((s, l) => s + Number(l.highEstimate), 0);
  const totalLow = raw.lots.reduce((s, l) => s + Number(l.lowEstimate), 0);
  const totalQid = ethers.keccak256(ethers.toUtf8Bytes("christies-24181-CKS-total-value"));
  markets.push({
    id: "total-value",
    questionId: totalQid,
    conditionId: "",
    yesTokenId: "",
    noTokenId: "",
    question: `Will the total auction value exceed £${totalHigh.toLocaleString()}?`,
    description: `Binary market on whether the sum of all hammer prices in Christie's "The Art of the Surreal Evening Sale" (Sale 24181-CKS, 5 March 2026, London) will equal or exceed £${totalHigh.toLocaleString()}.`,
    resolutionSource: "Official Christie's auction results at christies.com",
    endDate: new Date("2026-03-05T19:00:00Z").getTime(),
    resolved: false,
    createdAt: Date.now(),
    lotNumber: 0,
    artist: "Entire Sale",
    title: "Total Auction Value",
    year: "2026",
    lowEstimate: String(totalLow),
    highEstimate: String(totalHigh),
    currency: "GBP",
    auctionId: "24181-CKS",
  });

  console.log(`[Markets] Loaded ${markets.length} markets from markets.json`);
  return markets;
}

main().catch(console.error);
