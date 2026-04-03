import { OrderBook } from "../orderbook/OrderBook.js";
import { Order, Trade, Market, Side, OrderType, WSMessage, OrderBookSnapshot, UserPosition } from "../types.js";
import { randomUUID } from "crypto";
import { FeeCalculator } from "../fees/FeeCalculator.js";
import { RebatePool } from "../fees/RebatePool.js";

export type EventHandler = (msg: WSMessage) => void;
export type AmmFillHandler = (trade: Trade) => void;

/**
 * Central matching engine that manages order books for all active markets.
 * Coordinates order routing, trade execution, and event broadcasting.
 */
export class MatchingEngine {
  private books: Map<string, OrderBook> = new Map();
  private markets: Map<string, Market> = new Map();
  private pendingTrades: Trade[] = [];
  private subscribers: Set<EventHandler> = new Set();
  private storedOrders: Map<string, Order> = new Map();
  private positions: Map<string, UserPosition> = new Map();
  private userTrades: Map<string, Trade[]> = new Map();
  private ammFillHandlers: Map<string, AmmFillHandler> = new Map();

  readonly feeCalculator: FeeCalculator;
  readonly rebatePool: RebatePool;

  constructor(feeCalculator?: FeeCalculator, rebatePool?: RebatePool) {
    this.feeCalculator = feeCalculator ?? new FeeCalculator();
    this.rebatePool = rebatePool ?? new RebatePool(this.feeCalculator);
  }

  /**
   * Register a callback for when an AMM address is involved in a fill.
   * The LMSR uses this to feed trades into the RiskManager.
   */
  registerAmmFillHandler(ammAddress: string, handler: AmmFillHandler): void {
    this.ammFillHandlers.set(ammAddress.toLowerCase(), handler);
  }

  registerMarket(market: Market): void {
    if (this.books.has(market.id)) throw new Error(`Market ${market.id} already registered`);

    const book = new OrderBook(market.id, {
      onTrade: (trade) => this.handleTrade(trade),
      onBookUpdate: () => this.broadcastBookUpdate(market.id),
      feeCalculator: this.feeCalculator,
    });

    this.books.set(market.id, book);
    this.markets.set(market.id, market);
  }

  submitOrder(marketId: string, order: Omit<Order, "id" | "timestamp">): {
    orderId: string;
    trades: Trade[];
    status: "filled" | "partial" | "resting" | "rejected";
  } {
    const book = this.books.get(marketId);
    if (!book) throw new Error(`Market ${marketId} not found`);

    const market = this.markets.get(marketId)!;
    if (market.resolved) throw new Error(`Market ${marketId} is resolved`);

    const fullOrder: Order = {
      ...order,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    // Validate expiration
    if (fullOrder.expiration > 0 && fullOrder.expiration < Date.now() / 1000) {
      return { orderId: fullOrder.id, trades: [], status: "rejected" };
    }

    this.storedOrders.set(fullOrder.id, fullOrder);

    const result = book.submitOrder(fullOrder);

    let status: "filled" | "partial" | "resting" | "rejected";
    if (result.trades.length > 0 && !result.restingOrder) {
      status = "filled";
    } else if (result.trades.length > 0 && result.restingOrder) {
      status = "partial";
    } else if (result.restingOrder) {
      status = "resting";
    } else {
      status = "rejected";
    }

    // Notify order owner
    this.broadcast({
      type: "order_update",
      data: {
        orderId: fullOrder.id,
        status,
        filled: result.trades.reduce((sum, t) => sum + t.size, 0n),
      },
    });

    return { orderId: fullOrder.id, trades: result.trades, status };
  }

  cancelOrder(marketId: string, orderId: string): boolean {
    const book = this.books.get(marketId);
    if (!book) return false;
    return book.cancelOrder(orderId);
  }

  cancelAllOrders(marketId: string, maker: string): number {
    const book = this.books.get(marketId);
    if (!book) return 0;
    return book.cancelAllForMaker(maker);
  }

  // --- Queries ---

  getOrderBook(marketId: string): OrderBookSnapshot | null {
    const book = this.books.get(marketId);
    if (!book) return null;

    const { bids, asks } = book.getSnapshot();
    return {
      marketId,
      bids,
      asks,
      lastTradePrice: book.getLastTradePrice(),
      spread: book.getSpread(),
      hash: book.getHash(),
      timestamp: Date.now(),
    };
  }

  getMarket(marketId: string): Market | undefined {
    return this.markets.get(marketId);
  }

  getAllMarkets(): Market[] {
    return Array.from(this.markets.values());
  }

  getOpenOrders(marketId: string, maker: string): Order[] {
    const book = this.books.get(marketId);
    if (!book) return [];
    return book.getOpenOrders(maker);
  }

  getRecentTrades(marketId: string, limit = 50): Trade[] {
    const book = this.books.get(marketId);
    if (!book) return [];
    return book.getRecentTrades(limit);
  }

  getPendingSettlements(): Trade[] {
    return [...this.pendingTrades];
  }

  markSettled(tradeIds: string[]): void {
    const idSet = new Set(tradeIds);
    this.pendingTrades = this.pendingTrades.filter((t) => !idSet.has(t.id));
  }

  getMarketMidpoint(marketId: string): number | undefined {
    const book = this.books.get(marketId);
    if (!book) return undefined;
    return book.getMidpoint() ?? book.getLastTradePrice();
  }

  getMarketSummary(marketId: string): {
    bestBid?: number;
    bestAsk?: number;
    midpoint?: number;
    spread?: number;
    lastPrice?: number;
    orderCount: number;
    volume: string;
  } | null {
    const book = this.books.get(marketId);
    if (!book) return null;
    return {
      bestBid: book.getBestBid(),
      bestAsk: book.getBestAsk(),
      midpoint: book.getMidpoint(),
      spread: book.getSpread(),
      lastPrice: book.getLastTradePrice(),
      orderCount: book.getOrderCount(),
      volume: book.getVolume().toString(),
    };
  }

  getPortfolio(address: string): {
    positions: UserPosition[];
    openOrders: (Order & { marketId: string })[];
    tradeHistory: Trade[];
  } {
    const addr = address.toLowerCase();
    const positions: UserPosition[] = [];

    for (const pos of this.positions.values()) {
      if (pos.address === addr && (pos.yesShares > 0n || pos.noShares > 0n)) {
        const book = this.books.get(pos.marketId);
        const midpoint = book?.getMidpoint() ?? 0.5;
        const yesVal = (Number(pos.yesShares) / 1e6) * midpoint;
        const noVal = (Number(pos.noShares) / 1e6) * (1 - midpoint);
        const yesCost = (Number(pos.yesShares) / 1e6) * pos.avgBuyPrice;
        pos.unrealizedPnl = (yesVal + noVal) - yesCost;
        positions.push(pos);
      }
    }

    const openOrders: (Order & { marketId: string })[] = [];
    for (const [marketId, book] of this.books) {
      for (const order of book.getOpenOrders(addr)) {
        openOrders.push({ ...order, marketId });
      }
    }

    const tradeHistory = (this.userTrades.get(addr) ?? []).slice(-100);

    return { positions, openOrders, tradeHistory };
  }

  getStoredOrder(orderId: string): Order | undefined {
    return this.storedOrders.get(orderId);
  }

  resolveMarket(marketId: string, outcome: boolean): void {
    const market = this.markets.get(marketId);
    if (!market) throw new Error(`Market ${marketId} not found`);

    market.resolved = true;
    market.outcome = outcome;

    // Cancel all open orders
    const book = this.books.get(marketId);
    if (book) {
      // Get all makers and cancel their orders
      const orders = [...this.books.get(marketId)!.getOpenOrders("")];
      // Just delete the book
      this.books.delete(marketId);
    }

    this.broadcast({
      type: "market_update",
      data: { id: marketId, resolved: true, outcome },
    });
  }

  // --- Events ---

  subscribe(handler: EventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  emitEvent(msg: WSMessage): void {
    this.broadcast(msg);
  }

  private broadcast(msg: WSMessage): void {
    for (const handler of this.subscribers) {
      try {
        handler(msg);
      } catch {
        // Don't let a bad subscriber crash the engine
      }
    }
  }

  private handleTrade(trade: Trade): void {
    this.pendingTrades.push(trade);
    this.updatePositions(trade);
    this.trackUserTrade(trade);

    // Feed the rebate pool
    if (trade.fee > 0n) {
      this.rebatePool.addTakerFee(trade.fee);
    }

    const midpoint = this.getMarketMidpoint(trade.marketId);
    const makerSide = trade.side === Side.BUY ? "sell" : "buy";
    const isThinSide = this.rebatePool.isThinSide(midpoint, makerSide);

    this.rebatePool.recordMakerFill(
      trade.maker,
      trade.size,
      trade.makerOrderAge ?? 0,
      isThinSide,
    );

    // Notify AMM risk manager if the AMM was involved in this fill
    const makerHandler = this.ammFillHandlers.get(trade.maker.toLowerCase());
    const takerHandler = this.ammFillHandlers.get(trade.taker.toLowerCase());
    if (makerHandler) makerHandler(trade);
    else if (takerHandler) takerHandler(trade);

    this.broadcast({ type: "trade", data: trade });
  }

  private positionKey(address: string, marketId: string): string {
    return `${address.toLowerCase()}:${marketId}`;
  }

  private getOrCreatePosition(address: string, marketId: string): UserPosition {
    const key = this.positionKey(address, marketId);
    let pos = this.positions.get(key);
    if (!pos) {
      pos = {
        address: address.toLowerCase(),
        marketId,
        yesShares: 0n,
        noShares: 0n,
        avgBuyPrice: 0,
        unrealizedPnl: 0,
      };
      this.positions.set(key, pos);
    }
    return pos;
  }

  private updatePositions(trade: Trade): void {
    const buyerPos = this.getOrCreatePosition(
      trade.side === Side.BUY ? trade.taker : trade.maker,
      trade.marketId,
    );
    const sellerPos = this.getOrCreatePosition(
      trade.side === Side.BUY ? trade.maker : trade.taker,
      trade.marketId,
    );

    // Buyer gains YES shares, seller gains USDC (reduces YES shares or gains NO)
    buyerPos.yesShares += trade.size;
    if (sellerPos.yesShares >= trade.size) {
      sellerPos.yesShares -= trade.size;
    } else {
      sellerPos.noShares += trade.size;
    }

    // Update avg buy price for buyer
    const totalCost =
      buyerPos.avgBuyPrice * Number(buyerPos.yesShares - trade.size) +
      trade.price * Number(trade.size);
    buyerPos.avgBuyPrice =
      Number(buyerPos.yesShares) > 0
        ? totalCost / Number(buyerPos.yesShares)
        : 0;
  }

  private trackUserTrade(trade: Trade): void {
    const makerAddr = trade.maker.toLowerCase();
    const takerAddr = trade.taker.toLowerCase();

    if (!this.userTrades.has(makerAddr)) this.userTrades.set(makerAddr, []);
    this.userTrades.get(makerAddr)!.push(trade);

    if (takerAddr !== makerAddr) {
      if (!this.userTrades.has(takerAddr)) this.userTrades.set(takerAddr, []);
      this.userTrades.get(takerAddr)!.push(trade);
    }
  }

  private broadcastBookUpdate(marketId: string): void {
    const snapshot = this.getOrderBook(marketId);
    if (!snapshot) return;
    this.broadcast({ type: "orderbook_snapshot", data: snapshot });
  }
}
