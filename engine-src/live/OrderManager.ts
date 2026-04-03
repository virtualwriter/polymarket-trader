/**
 * Order lifecycle manager.
 *
 * Translates LMSR quote intentions into real CLOB orders.
 * Tracks live order IDs, handles cancel-and-replace, and
 * ensures stale quotes are always cleaned up.
 *
 * Smart requoting: only cancels orders whose price has actually changed,
 * preserving queue (time) priority on unchanged levels.
 */

import { PolymarketClient, LiveOrderRequest } from "./PolymarketClient.js";

export interface QuoteLevel {
  price: number;
  size: number;
  side: "BUY" | "SELL";
  tokenId: string;
}

interface TrackedOrder {
  orderId: string;
  marketId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  placedAt: number;
}

export interface FillEvent {
  orderId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  queueAgeMs: number;
}

export class OrderManager {
  private client: PolymarketClient;
  private liveOrders = new Map<string, TrackedOrder>(); // orderId → TrackedOrder
  private marketOrders = new Map<string, Set<string>>(); // marketId → Set<orderId>

  // Rate limiting: max orders per second
  private lastOrderTs = 0;
  private minOrderIntervalMs = 200;

  // Fill tracking
  private fills: FillEvent[] = [];
  private lastSyncTs = 0;
  private syncIntervalMs = 10_000; // reconcile with CLOB every 10s

  // Stats
  private ordersKept = 0;   // orders preserved (queue priority saved)
  private ordersReplaced = 0; // orders cancelled+replaced (price changed)

  constructor(client: PolymarketClient) {
    this.client = client;
  }

  /**
   * Smart update: diff new quotes against resting orders.
   * Only cancel orders whose price changed; leave unchanged orders to
   * preserve queue (time) priority.
   */
  async smartUpdateQuotes(marketId: string, quotes: QuoteLevel[]): Promise<void> {
    if (this.client.isKilled) return;

    // Build desired quote map: key = "tokenId:price" → QuoteLevel
    const desired = new Map<string, QuoteLevel>();
    for (const q of quotes) {
      if (q.size <= 0 || q.price <= 0.01 || q.price >= 0.99) continue;
      const key = `${q.tokenId}:${q.price.toFixed(2)}`;
      desired.set(key, q);
    }

    // Build resting order map: key = "tokenId:price" → TrackedOrder
    const resting = new Map<string, TrackedOrder>();
    const orderIds = this.marketOrders.get(marketId);
    if (orderIds) {
      for (const oid of orderIds) {
        const tracked = this.liveOrders.get(oid);
        if (tracked) {
          const key = `${tracked.tokenId}:${tracked.price.toFixed(2)}`;
          resting.set(key, tracked);
        }
      }
    }

    // 1. Cancel resting orders that are NOT in the desired set (price moved or level removed)
    const toCancel: TrackedOrder[] = [];
    for (const [key, tracked] of resting) {
      if (!desired.has(key)) {
        toCancel.push(tracked);
      }
    }

    for (const tracked of toCancel) {
      if (tracked.orderId.startsWith("dry-")) {
        this.liveOrders.delete(tracked.orderId);
        this.marketOrders.get(marketId)?.delete(tracked.orderId);
        continue;
      }
      const ok = await this.client.cancelOrder(tracked.orderId);
      if (ok) {
        this.liveOrders.delete(tracked.orderId);
        this.marketOrders.get(marketId)?.delete(tracked.orderId);
        this.ordersReplaced++;
      }
    }

    // If we cancelled orders, wait briefly for CLOB to release locked USDC
    if (toCancel.length > 0) {
      await new Promise(r => setTimeout(r, 500));
    }

    // 2. Place new orders that are NOT already resting (new price levels)
    let kept = 0;
    for (const [key, q] of desired) {
      if (resting.has(key)) {
        kept++;
        continue; // Order already resting at this price — preserve queue priority
      }

      await this.rateLimit();

      const orderId = await this.client.placeOrder({
        tokenId: q.tokenId,
        price: q.price,
        size: q.size,
        side: q.side,
      });

      if (orderId) {
        const tracked: TrackedOrder = {
          orderId,
          marketId,
          tokenId: q.tokenId,
          side: q.side,
          price: q.price,
          size: q.size,
          placedAt: Date.now(),
        };
        this.liveOrders.set(orderId, tracked);

        if (!this.marketOrders.has(marketId)) {
          this.marketOrders.set(marketId, new Set());
        }
        this.marketOrders.get(marketId)!.add(orderId);
      }
    }

    this.ordersKept += kept;
  }

  /**
   * Old method: cancel all existing orders, place new ones.
   * Still used for defensive scenarios (shouldWithdraw, game_end).
   */
  async updateQuotes(marketId: string, quotes: QuoteLevel[]): Promise<void> {
    if (this.client.isKilled) return;

    await this.cancelMarket(marketId);

    for (const q of quotes) {
      if (q.size <= 0 || q.price <= 0.01 || q.price >= 0.99) continue;

      await this.rateLimit();

      const orderId = await this.client.placeOrder({
        tokenId: q.tokenId,
        price: q.price,
        size: q.size,
        side: q.side,
      });

      if (orderId) {
        const tracked: TrackedOrder = {
          orderId,
          marketId,
          tokenId: q.tokenId,
          side: q.side,
          price: q.price,
          size: q.size,
          placedAt: Date.now(),
        };
        this.liveOrders.set(orderId, tracked);

        if (!this.marketOrders.has(marketId)) {
          this.marketOrders.set(marketId, new Set());
        }
        this.marketOrders.get(marketId)!.add(orderId);
      }
    }
  }

  /**
   * Cancel all orders for a specific market.
   */
  async cancelMarket(marketId: string): Promise<void> {
    const orderIds = this.marketOrders.get(marketId);
    if (!orderIds || orderIds.size === 0) return;

    const ids = [...orderIds];
    for (const id of ids) {
      if (id.startsWith("dry-")) {
        this.liveOrders.delete(id);
        orderIds.delete(id);
        continue;
      }
      const ok = await this.client.cancelOrder(id);
      if (ok) {
        this.liveOrders.delete(id);
        orderIds.delete(id);
      }
    }
  }

  /**
   * Reconcile tracked orders with the actual CLOB state.
   * Detects fills: any tracked order not present on the CLOB was filled.
   */
  async syncWithClob(): Promise<FillEvent[]> {
    const now = Date.now();
    if (now - this.lastSyncTs < this.syncIntervalMs) return [];
    this.lastSyncTs = now;

    try {
      const openOrders = await this.client.getOpenOrders();
      const clobOrderIds = new Set(openOrders.map((o: any) => o.id ?? o.orderID ?? o.order_id));

      const detectedFills: FillEvent[] = [];

      for (const [oid, tracked] of this.liveOrders) {
        if (oid.startsWith("dry-")) continue;

        if (!clobOrderIds.has(oid)) {
          // Ignore orders younger than 15s — they may not have propagated yet
          if (now - tracked.placedAt < 15_000) continue;

          const fill: FillEvent = {
            orderId: oid,
            tokenId: tracked.tokenId,
            side: tracked.side,
            price: tracked.price,
            size: tracked.size,
            queueAgeMs: now - tracked.placedAt,
          };
          detectedFills.push(fill);
          this.fills.push(fill);

          // Clean up tracking
          this.liveOrders.delete(oid);
          this.marketOrders.get(tracked.marketId)?.delete(oid);
        }
      }

      return detectedFills;
    } catch (err: any) {
      // Non-fatal — we'll try again next interval
      return [];
    }
  }

  /**
   * Withdraw from all markets — cancel everything.
   */
  async withdrawAll(): Promise<void> {
    if (this.liveOrders.size > 0) {
      console.log(`[OrderMgr] Cancelling ${this.liveOrders.size} tracked orders`);
    }
    await this.client.cancelAll();
    this.liveOrders.clear();
    this.marketOrders.clear();
  }

  getOrderCount(marketId: string): number {
    return this.marketOrders.get(marketId)?.size ?? 0;
  }

  getAllOrders(): TrackedOrder[] {
    return [...this.liveOrders.values()];
  }

  getFills(): FillEvent[] {
    return [...this.fills];
  }

  getStats() {
    const oldestOrder = [...this.liveOrders.values()].reduce(
      (oldest, o) => o.placedAt < oldest ? o.placedAt : oldest,
      Date.now(),
    );
    const maxQueueMs = this.liveOrders.size > 0 ? Date.now() - oldestOrder : 0;

    return {
      totalTracked: this.liveOrders.size,
      ordersKept: this.ordersKept,
      ordersReplaced: this.ordersReplaced,
      fillsDetected: this.fills.length,
      maxQueueAgeMs: maxQueueMs,
      byMarket: Object.fromEntries(
        [...this.marketOrders.entries()].map(([m, ids]) => [m, ids.size])
      ),
    };
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastOrderTs;
    if (elapsed < this.minOrderIntervalMs) {
      await new Promise(r => setTimeout(r, this.minOrderIntervalMs - elapsed));
    }
    this.lastOrderTs = Date.now();
  }
}
