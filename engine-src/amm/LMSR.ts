import { Order, Side, OrderType, Trade } from "../types.js";
import { MatchingEngine } from "../matching/MatchingEngine.js";
import { RiskManager } from "../mm/RiskManager.js";
import { randomUUID } from "crypto";

/**
 * Logarithmic Market Scoring Rule (LMSR) AMM for bootstrapping liquidity.
 *
 * Provides passive quotes that are injected into the CLOB as limit orders.
 * Integrates with the enhanced RiskManager for:
 *  - Phase 1 mechanical defenses (caps, skew, withdrawal, size limits)
 *  - Tier 1 flow defenses (VPIN spread widening, Bayesian fair value shift)
 *  - Sport-specific game state signals (parser-driven spread/withdrawal)
 *
 * Price updates: call recenter(newPrice) whenever the external fair value
 * changes. This updates the internal LMSR state so getYesPrice() always
 * returns the current market price. No separate "external" price field.
 */
export class LMSRAMMProvider {
  private engine: MatchingEngine;
  private marketId: string;
  private b: number;
  private qYes: number = 0;
  private qNo: number = 0;
  private maxExposure: bigint;
  private currentExposure: bigint = 0n;
  private activeOrderIds: string[] = [];
  private refreshInterval?: ReturnType<typeof setInterval>;
  readonly riskManager: RiskManager;

  private readonly ammAddress = "0x0000000000000000000000000000000000000AMM";

  constructor(
    engine: MatchingEngine,
    marketId: string,
    options: {
      liquidityParameter?: number;
      maxExposureUsdc?: bigint;
      initialYesPrice?: number;
      riskManager?: RiskManager;
    } = {},
  ) {
    this.engine = engine;
    this.marketId = marketId;
    this.b = options.liquidityParameter ?? 100;
    this.maxExposure = options.maxExposureUsdc ?? 10_000_000_000n;
    this.riskManager = options.riskManager ?? new RiskManager();

    if (options.initialYesPrice) {
      this.recenter(options.initialYesPrice);
    }
  }

  /**
   * Set the LMSR internal price to match the real market.
   * Updates qYes so getYesPrice() returns the new value.
   * On large jumps (>3¢), immediately cancels stale quotes and re-posts.
   */
  recenter(newPrice: number): void {
    const p = Math.max(0.02, Math.min(0.98, newPrice));
    const oldPrice = this.getYesPrice();

    this.qYes = this.b * Math.log(p / (1 - p));
    this.qNo = 0;

    if (Math.abs(p - oldPrice) > 0.03 && this.activeOrderIds.length > 0) {
      this.cancelAllQuotes();
      this.refreshQuotes();
    }
  }

  onFill(trade: Trade): void {
    const ammIsMaker = trade.maker === this.ammAddress;
    this.riskManager.recordFill(this.marketId, trade, ammIsMaker);
  }

  getAmmAddress(): string {
    return this.ammAddress;
  }

  getYesPrice(): number {
    const expYes = Math.exp(this.qYes / this.b);
    const expNo = Math.exp(this.qNo / this.b);
    return expYes / (expYes + expNo);
  }

  getCostForYes(amount: number): number {
    const before = this.b * Math.log(Math.exp(this.qYes / this.b) + Math.exp(this.qNo / this.b));
    const after = this.b * Math.log(Math.exp((this.qYes + amount) / this.b) + Math.exp(this.qNo / this.b));
    return after - before;
  }

  getCostForNo(amount: number): number {
    const before = this.b * Math.log(Math.exp(this.qYes / this.b) + Math.exp(this.qNo / this.b));
    const after = this.b * Math.log(Math.exp(this.qYes / this.b) + Math.exp((this.qNo + amount) / this.b));
    return after - before;
  }

  start(intervalMs = 5000): void {
    this.refreshQuotes();
    this.refreshInterval = setInterval(() => this.refreshQuotes(), intervalMs);
    console.log(`[AMM] Started for market ${this.marketId}, b=${this.b}, price=${this.getYesPrice().toFixed(4)}`);
  }

  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
    this.cancelAllQuotes();
  }

  private refreshQuotes(): void {
    if (this.currentExposure >= this.maxExposure) return;

    this.cancelAllQuotes();

    if (this.riskManager.shouldWithdraw(this.marketId)) {
      return;
    }

    // getYesPrice() IS the correct fair value — kept in sync by recenter().
    let yesPrice = this.getYesPrice();

    // Tier 1: Apply Bayesian prior shift to fair value
    const biasShift = this.riskManager.getBaseBiasShift(this.marketId);
    yesPrice = Math.max(0.02, Math.min(0.98, yesPrice + biasShift));

    const { bidHalfSpread, askHalfSpread, atCapBid, atCapAsk } =
      this.riskManager.getAdjustedSpread(this.marketId);

    const numLevels = 5;

    const config = this.riskManager.getConfig();
    const sizePerLevel = config.maxFillSizeUsdc < 100_000_000n
      ? config.maxFillSizeUsdc
      : 100_000_000n;

    for (let i = 0; i < numLevels; i++) {
      const levelMultiplier = i + 1;

      if (!atCapBid) {
        const bidPrice = Math.max(0.02, yesPrice - bidHalfSpread * levelMultiplier);

        const allowedBidSize = this.riskManager.getAllowedSize(this.marketId, sizePerLevel, true);
        if (allowedBidSize > 0n) {
          const bidTakerAmount = BigInt(Math.round(Number(allowedBidSize) * bidPrice));
          const bidResult = this.engine.submitOrder(this.marketId, {
            maker: this.ammAddress,
            tokenId: "0",
            makerAmount: allowedBidSize,
            takerAmount: bidTakerAmount,
            nonce: Date.now() + i,
            expiration: 0,
            side: Side.BUY,
            signature: "0xAMM",
            orderType: OrderType.GTC,
            postOnly: true,
          });
          if (bidResult.status === "resting") {
            this.activeOrderIds.push(bidResult.orderId);
          }
        }
      }

      if (!atCapAsk) {
        const askPrice = Math.min(0.98, yesPrice + askHalfSpread * levelMultiplier);

        const allowedAskSize = this.riskManager.getAllowedSize(this.marketId, sizePerLevel, false);
        if (allowedAskSize > 0n) {
          const askTakerAmount = BigInt(Math.round(Number(allowedAskSize) * askPrice));
          const askResult = this.engine.submitOrder(this.marketId, {
            maker: this.ammAddress,
            tokenId: "0",
            makerAmount: allowedAskSize,
            takerAmount: askTakerAmount,
            nonce: Date.now() + i + 1000,
            expiration: 0,
            side: Side.SELL,
            signature: "0xAMM",
            orderType: OrderType.GTC,
            postOnly: true,
          });
          if (askResult.status === "resting") {
            this.activeOrderIds.push(askResult.orderId);
          }
        }
      }
    }
  }

  private cancelAllQuotes(): void {
    for (const id of this.activeOrderIds) {
      this.engine.cancelOrder(this.marketId, id);
    }
    this.activeOrderIds = [];
  }

  getStatus(): {
    yesPrice: number;
    noPrice: number;
    exposure: bigint;
    maxExposure: bigint;
    activeOrders: number;
    risk: ReturnType<RiskManager["getStats"]>;
  } {
    return {
      yesPrice: this.getYesPrice(),
      noPrice: 1 - this.getYesPrice(),
      exposure: this.currentExposure,
      maxExposure: this.maxExposure,
      activeOrders: this.activeOrderIds.length,
      risk: this.riskManager.getStats(this.marketId),
    };
  }
}
