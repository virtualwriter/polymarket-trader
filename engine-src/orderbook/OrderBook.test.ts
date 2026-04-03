import { describe, it, expect } from "vitest";
import { OrderBook } from "./OrderBook.js";
import { Order, Side, OrderType } from "../types.js";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: `order-${Math.random().toString(36).slice(2)}`,
    maker: "0x1234567890abcdef1234567890abcdef12345678",
    tokenId: "1",
    makerAmount: 100_000_000n, // 100 USDC
    takerAmount: 65_000_000n,  // 65 USDC (price = 0.65)
    nonce: 0,
    expiration: 0,
    side: Side.BUY,
    signature: "0x",
    orderType: OrderType.GTC,
    postOnly: false,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("OrderBook", () => {
  it("should accept a resting buy order", () => {
    const book = new OrderBook("test-market");
    const order = makeOrder({ side: Side.BUY });
    const result = book.submitOrder(order);

    expect(result.trades).toHaveLength(0);
    expect(result.restingOrder).toBeDefined();
    expect(book.getBestBid()).toBeCloseTo(0.65, 2);
  });

  it("should accept a resting sell order", () => {
    const book = new OrderBook("test-market");
    const order = makeOrder({
      side: Side.SELL,
      makerAmount: 100_000_000n,
      takerAmount: 70_000_000n, // asking 0.70
    });
    const result = book.submitOrder(order);

    expect(result.trades).toHaveLength(0);
    expect(result.restingOrder).toBeDefined();
    expect(book.getBestAsk()).toBeCloseTo(0.70, 2);
  });

  it("should match crossing orders", () => {
    const book = new OrderBook("test-market");

    // Resting ask at 0.60
    book.submitOrder(
      makeOrder({
        side: Side.SELL,
        makerAmount: 100_000_000n,
        takerAmount: 60_000_000n,
      }),
    );

    // Incoming buy at 0.65 should match with the 0.60 ask
    const result = book.submitOrder(
      makeOrder({
        side: Side.BUY,
        makerAmount: 100_000_000n,
        takerAmount: 65_000_000n,
      }),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].price).toBeCloseTo(0.60, 2); // executes at resting price
    expect(result.trades[0].size).toBe(100_000_000n);
  });

  it("should not match non-crossing orders", () => {
    const book = new OrderBook("test-market");

    // Ask at 0.70
    book.submitOrder(
      makeOrder({
        side: Side.SELL,
        makerAmount: 100_000_000n,
        takerAmount: 70_000_000n,
      }),
    );

    // Bid at 0.65 should not match
    const result = book.submitOrder(
      makeOrder({
        side: Side.BUY,
        makerAmount: 100_000_000n,
        takerAmount: 65_000_000n,
      }),
    );

    expect(result.trades).toHaveLength(0);
    expect(result.restingOrder).toBeDefined();
    expect(book.getSpread()).toBeCloseTo(0.05, 2);
  });

  it("should partially fill orders", () => {
    const book = new OrderBook("test-market");

    // Resting ask for 50 USDC at 0.60
    book.submitOrder(
      makeOrder({
        side: Side.SELL,
        makerAmount: 50_000_000n,
        takerAmount: 30_000_000n,
      }),
    );

    // Incoming buy for 100 USDC at 0.65
    const result = book.submitOrder(
      makeOrder({
        side: Side.BUY,
        makerAmount: 100_000_000n,
        takerAmount: 65_000_000n,
      }),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].size).toBe(50_000_000n);
    expect(result.restingOrder).toBeDefined(); // remainder rests
  });

  it("should cancel orders", () => {
    const book = new OrderBook("test-market");
    const order = makeOrder({ id: "cancel-me" });
    book.submitOrder(order);

    expect(book.getOrderCount()).toBe(1);
    expect(book.cancelOrder("cancel-me")).toBe(true);
    expect(book.getOrderCount()).toBe(0);
    expect(book.cancelOrder("cancel-me")).toBe(false);
  });

  it("should reject FOK when insufficient liquidity", () => {
    const book = new OrderBook("test-market");

    // Small resting ask
    book.submitOrder(
      makeOrder({
        side: Side.SELL,
        makerAmount: 10_000_000n,
        takerAmount: 6_000_000n,
      }),
    );

    // Large FOK buy
    const result = book.submitOrder(
      makeOrder({
        side: Side.BUY,
        makerAmount: 100_000_000n,
        takerAmount: 65_000_000n,
        orderType: OrderType.FOK,
      }),
    );

    expect(result.trades).toHaveLength(0);
    expect(book.getOrderCount()).toBe(1); // ask still resting
  });

  it("should execute FAK with partial fill and no resting", () => {
    const book = new OrderBook("test-market");

    book.submitOrder(
      makeOrder({
        side: Side.SELL,
        makerAmount: 50_000_000n,
        takerAmount: 30_000_000n,
      }),
    );

    const result = book.submitOrder(
      makeOrder({
        side: Side.BUY,
        makerAmount: 100_000_000n,
        takerAmount: 65_000_000n,
        orderType: OrderType.FAK,
      }),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.restingOrder).toBeUndefined(); // remainder killed
    expect(book.getOrderCount()).toBe(0); // no resting orders
  });

  it("should maintain price-time priority", () => {
    const book = new OrderBook("test-market");

    // Two bids at same price, first one should match first
    const first = makeOrder({ id: "first", side: Side.BUY, timestamp: 1000 });
    const second = makeOrder({ id: "second", side: Side.BUY, timestamp: 2000 });
    book.submitOrder(first);
    book.submitOrder(second);

    // Ask that crosses
    const result = book.submitOrder(
      makeOrder({
        side: Side.SELL,
        makerAmount: 100_000_000n,
        takerAmount: 60_000_000n,
      }),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].makerOrderId).toBe("first");
  });

  it("should calculate midpoint correctly", () => {
    const book = new OrderBook("test-market");

    book.submitOrder(makeOrder({ side: Side.BUY, makerAmount: 100_000_000n, takerAmount: 60_000_000n }));
    book.submitOrder(makeOrder({ side: Side.SELL, makerAmount: 100_000_000n, takerAmount: 70_000_000n }));

    expect(book.getMidpoint()).toBeCloseTo(0.65, 2);
  });

  it("should generate correct snapshot", () => {
    const book = new OrderBook("test-market");

    book.submitOrder(makeOrder({ side: Side.BUY, makerAmount: 100_000_000n, takerAmount: 60_000_000n }));
    book.submitOrder(makeOrder({ side: Side.BUY, makerAmount: 200_000_000n, takerAmount: 120_000_000n }));
    book.submitOrder(makeOrder({ side: Side.SELL, makerAmount: 100_000_000n, takerAmount: 70_000_000n }));

    const snapshot = book.getSnapshot();
    expect(snapshot.bids).toHaveLength(1); // both at 0.60, aggregated
    expect(snapshot.bids[0].numOrders).toBe(2);
    expect(snapshot.bids[0].size).toBe(300_000_000n);
    expect(snapshot.asks).toHaveLength(1);
  });
});
