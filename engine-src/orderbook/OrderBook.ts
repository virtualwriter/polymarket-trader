import { Order, OrderBookEntry, PriceLevel, Side, Trade, OrderType, MatchType } from "../types.js";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { FeeCalculator } from "../fees/FeeCalculator.js";

/**
 * Price-time priority order book for a single binary market.
 *
 * Bids are sorted highest-price-first (buyers offering the most get matched first).
 * Asks are sorted lowest-price-first (sellers asking the least get matched first).
 *
 * Price is expressed as a probability 0.01 to 0.99 (1 cent to 99 cents per share).
 * A YES share at price P implies the buyer pays P cents per share of potential $1 payout.
 */
export class OrderBook {
  readonly marketId: string;

  private bids: OrderBookEntry[] = [];
  private asks: OrderBookEntry[] = [];
  private orderIndex: Map<string, OrderBookEntry> = new Map();

  private trades: Trade[] = [];
  private lastTradePrice?: number;
  private totalVolume = 0n;

  private onTrade?: (trade: Trade) => void;
  private onBookUpdate?: () => void;
  private feeCalculator?: FeeCalculator;

  constructor(
    marketId: string,
    options?: {
      onTrade?: (t: Trade) => void;
      onBookUpdate?: () => void;
      feeCalculator?: FeeCalculator;
    },
  ) {
    this.marketId = marketId;
    this.onTrade = options?.onTrade;
    this.onBookUpdate = options?.onBookUpdate;
    this.feeCalculator = options?.feeCalculator;
  }

  /**
   * Submit an order to the book. Returns any resulting trades.
   */
  submitOrder(order: Order): { trades: Trade[]; restingOrder?: Order } {
    const price = this.getPrice(order);
    if (price < 0.005 || price > 0.995) {
      throw new Error(`Price ${price.toFixed(4)} out of range [0.005, 0.995]`);
    }
    const entry: OrderBookEntry = { price, size: order.makerAmount, order };

    if (order.orderType === OrderType.FOK) {
      return this.fillOrKill(entry);
    }
    if (order.orderType === OrderType.FAK) {
      return this.fillAndKill(entry);
    }

    // GTC / GTD: try to match, then rest remainder
    const trades = this.matchOrder(entry);

    if (entry.size > 0n) {
      if (order.postOnly && trades.length > 0) {
        // Post-only order would have taken liquidity, reject it
        return { trades: [] };
      }
      this.insertResting(entry);
      return { trades, restingOrder: entry.order };
    }

    return { trades };
  }

  cancelOrder(orderId: string): boolean {
    const entry = this.orderIndex.get(orderId);
    if (!entry) return false;

    this.orderIndex.delete(orderId);

    if (entry.order.side === Side.BUY) {
      const idx = this.bids.indexOf(entry);
      if (idx >= 0) this.bids.splice(idx, 1);
    } else {
      const idx = this.asks.indexOf(entry);
      if (idx >= 0) this.asks.splice(idx, 1);
    }

    this.onBookUpdate?.();
    return true;
  }

  cancelAllForMaker(maker: string): number {
    let count = 0;
    for (const [id, entry] of this.orderIndex) {
      if (entry.order.maker === maker) {
        this.cancelOrder(id);
        count++;
      }
    }
    return count;
  }

  // --- Matching ---

  private matchOrder(incoming: OrderBookEntry): Trade[] {
    const trades: Trade[] = [];
    const book = incoming.order.side === Side.BUY ? this.asks : this.bids;

    while (incoming.size > 0n && book.length > 0) {
      const best = book[0];
      if (!this.pricesCross(incoming, best)) break;

      const fillSize = incoming.size < best.size ? incoming.size : best.size;
      const fillPrice = best.price; // maker (resting) gets their price

      const trade = this.createTrade(incoming, best, fillSize, fillPrice);
      trades.push(trade);
      this.trades.push(trade);
      this.lastTradePrice = fillPrice;
      this.totalVolume += fillSize;

      incoming.size -= fillSize;
      best.size -= fillSize;

      if (best.size === 0n) {
        book.shift();
        this.orderIndex.delete(best.order.id);
      }

      this.onTrade?.(trade);
    }

    if (trades.length > 0) this.onBookUpdate?.();
    return trades;
  }

  private fillOrKill(entry: OrderBookEntry): { trades: Trade[] } {
    const totalAvailable = this.availableLiquidity(entry);
    if (totalAvailable < entry.size) return { trades: [] };
    return { trades: this.matchOrder(entry) };
  }

  private fillAndKill(entry: OrderBookEntry): { trades: Trade[] } {
    const trades = this.matchOrder(entry);
    // Kill any unfilled remainder (don't rest)
    return { trades };
  }

  private pricesCross(incoming: OrderBookEntry, resting: OrderBookEntry): boolean {
    if (incoming.order.side === Side.BUY) {
      return incoming.price >= resting.price;
    }
    return incoming.price <= resting.price;
  }

  private availableLiquidity(entry: OrderBookEntry): bigint {
    const book = entry.order.side === Side.BUY ? this.asks : this.bids;
    let total = 0n;
    for (const level of book) {
      if (!this.pricesCross(entry, level)) break;
      total += level.size;
    }
    return total;
  }

  private insertResting(entry: OrderBookEntry): void {
    this.orderIndex.set(entry.order.id, entry);

    if (entry.order.side === Side.BUY) {
      this.insertSorted(this.bids, entry, (a, b) => {
        if (b.price !== a.price) return b.price - a.price; // highest first
        return a.order.timestamp - b.order.timestamp; // earliest first
      });
    } else {
      this.insertSorted(this.asks, entry, (a, b) => {
        if (a.price !== b.price) return a.price - b.price; // lowest first
        return a.order.timestamp - b.order.timestamp; // earliest first
      });
    }

    this.onBookUpdate?.();
  }

  private insertSorted(
    arr: OrderBookEntry[],
    entry: OrderBookEntry,
    comparator: (a: OrderBookEntry, b: OrderBookEntry) => number,
  ): void {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (comparator(arr[mid], entry) <= 0) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, entry);
  }

  private createTrade(
    incoming: OrderBookEntry,
    resting: OrderBookEntry,
    size: bigint,
    price: number,
  ): Trade {
    const takerAddress = incoming.order.maker;
    const fee = this.feeCalculator
      ? this.feeCalculator.calculateTakerFee(size, price, takerAddress)
      : (size * 20n) / 10000n; // fallback flat 0.2%

    const isBuy = incoming.order.side === Side.BUY;
    let matchType = MatchType.NORMAL;
    if (isBuy && resting.order.side === Side.BUY) matchType = MatchType.MINT;
    else if (!isBuy && resting.order.side === Side.SELL) matchType = MatchType.MERGE;

    const makerOrderAge = Math.max(0, Math.floor((Date.now() - resting.order.timestamp) / 1000));

    return {
      id: randomUUID(),
      marketId: this.marketId,
      makerOrderId: resting.order.id,
      takerOrderId: incoming.order.id,
      maker: resting.order.maker,
      taker: takerAddress,
      side: incoming.order.side,
      price,
      size,
      fee,
      matchType,
      makerOrderAge,
      timestamp: Date.now(),
      settled: false,
    };
  }

  // --- Price helpers ---

  private getPrice(order: Order): number {
    // Price is always takerAmount / makerAmount, representing the probability.
    // BUY: I provide makerAmount collateral, want takerAmount shares → price per share
    // SELL: I provide makerAmount shares, want takerAmount collateral → price per share
    return Number(order.takerAmount) / Number(order.makerAmount);
  }

  // --- Snapshots ---

  getSnapshot(): { bids: PriceLevel[]; asks: PriceLevel[] } {
    return {
      bids: this.aggregateLevels(this.bids),
      asks: this.aggregateLevels(this.asks),
    };
  }

  getHash(): string {
    const snapshot = this.getSnapshot();
    const data = JSON.stringify(snapshot, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    return createHash("sha256").update(data).digest("hex").slice(0, 16);
  }

  getBestBid(): number | undefined {
    return this.bids[0]?.price;
  }

  getBestAsk(): number | undefined {
    return this.asks[0]?.price;
  }

  getSpread(): number | undefined {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid === undefined || ask === undefined) return undefined;
    return ask - bid;
  }

  getMidpoint(): number | undefined {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid === undefined || ask === undefined) return this.lastTradePrice;
    return Math.min(0.99, Math.max(0.01, (bid + ask) / 2));
  }

  getLastTradePrice(): number | undefined {
    return this.lastTradePrice;
  }

  getOpenOrders(maker: string): Order[] {
    const orders: Order[] = [];
    for (const entry of this.orderIndex.values()) {
      if (entry.order.maker === maker) orders.push(entry.order);
    }
    return orders;
  }

  getRecentTrades(limit = 50): Trade[] {
    return this.trades.slice(-limit);
  }

  getOrderCount(): number {
    return this.orderIndex.size;
  }

  getVolume(): bigint {
    return this.totalVolume;
  }

  private aggregateLevels(entries: OrderBookEntry[]): PriceLevel[] {
    const levels = new Map<number, { size: bigint; count: number }>();
    for (const entry of entries) {
      const rounded = Math.round(entry.price * 100) / 100;
      const existing = levels.get(rounded);
      if (existing) {
        existing.size += entry.size;
        existing.count++;
      } else {
        levels.set(rounded, { size: entry.size, count: 1 });
      }
    }

    return Array.from(levels.entries()).map(([price, { size, count }]) => ({
      price,
      size,
      numOrders: count,
    }));
  }
}
