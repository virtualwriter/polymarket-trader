import { ethers } from "ethers";
import { Trade, MatchType } from "../types.js";
import { MatchingEngine } from "../matching/MatchingEngine.js";

const CTF_EXCHANGE_ABI = [
  "function fillOrder(tuple(address maker, uint256 tokenId, uint256 makerAmount, uint256 takerAmount, uint256 nonce, uint256 expiration, uint8 side, bytes signature) makerOrder, tuple(address maker, uint256 tokenId, uint256 makerAmount, uint256 takerAmount, uint256 nonce, uint256 expiration, uint8 side, bytes signature) takerOrder, uint256 fillAmount, uint8 matchType) external",
];

export interface SettlementConfig {
  rpcUrl: string;
  operatorPrivateKey: string;
  exchangeAddress: string;
  batchIntervalMs: number;  // how often to flush pending trades
  maxBatchSize: number;     // max trades per batch
}

/**
 * Batches matched trades and submits them to the on-chain CTF Exchange.
 * Runs on a timer, collecting trades from the matching engine and
 * sending settlement transactions.
 */
export class SettlementBatcher {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private exchange: ethers.Contract;
  private engine: MatchingEngine;
  private config: SettlementConfig;
  private timer?: ReturnType<typeof setInterval>;
  private processing = false;

  constructor(engine: MatchingEngine, config: SettlementConfig) {
    this.engine = engine;
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.operatorPrivateKey, this.provider);
    this.exchange = new ethers.Contract(config.exchangeAddress, CTF_EXCHANGE_ABI, this.wallet);
  }

  start(): void {
    if (this.timer) return;
    console.log(`[Settlement] Starting batcher, interval=${this.config.batchIntervalMs}ms`);
    this.timer = setInterval(() => this.flush(), this.config.batchIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async flush(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const pending = this.engine.getPendingSettlements();
      if (pending.length === 0) return;

      const batch = pending.slice(0, this.config.maxBatchSize);
      console.log(`[Settlement] Settling ${batch.length} trades`);

      const settled: string[] = [];
      const AMM_ADDR = "0x0000000000000000000000000000000000000amm";

      for (const trade of batch) {
        if (trade.maker.toLowerCase() === AMM_ADDR || trade.taker.toLowerCase() === AMM_ADDR) {
          trade.settled = true;
          settled.push(trade.id);
          continue;
        }
        try {
          const txHash = await this.settleTrade(trade);
          trade.settled = true;
          trade.txHash = txHash;
          settled.push(trade.id);
          console.log(`[Settlement] Trade ${trade.id} settled: ${txHash}`);
        } catch (err) {
          console.error(`[Settlement] Failed to settle trade ${trade.id}:`, err);
        }
      }

      if (settled.length > 0) {
        this.engine.markSettled(settled);
      }
    } finally {
      this.processing = false;
    }
  }

  private async settleTrade(trade: Trade): Promise<string> {
    const storedMaker = this.engine.getStoredOrder(trade.makerOrderId);
    const storedTaker = this.engine.getStoredOrder(trade.takerOrderId);

    if (!storedMaker || !storedTaker) {
      throw new Error(
        `Missing stored orders for trade ${trade.id}: ` +
        `maker=${trade.makerOrderId} (${storedMaker ? "found" : "missing"}), ` +
        `taker=${trade.takerOrderId} (${storedTaker ? "found" : "missing"})`,
      );
    }

    const toOnChainOrder = (order: import("../types.js").Order) => ({
      maker: ethers.getAddress(order.maker),
      tokenId: BigInt(order.tokenId || "0"),
      makerAmount: order.makerAmount,
      takerAmount: order.takerAmount,
      nonce: order.nonce,
      expiration: order.expiration,
      side: order.side,
      signature: order.signature,
    });

    const tx = await this.exchange.fillOrder(
      toOnChainOrder(storedMaker),
      toOnChainOrder(storedTaker),
      trade.size,
      trade.matchType,
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  getStats(): { pending: number; settled: number } {
    return {
      pending: this.engine.getPendingSettlements().length,
      settled: 0, // would track cumulative
    };
  }
}
