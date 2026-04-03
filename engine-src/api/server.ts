import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { MatchingEngine } from "../matching/MatchingEngine.js";
import { verifyL1Auth, verifyL2Auth, createApiKey } from "../auth/eip712.js";
import { Side, OrderType, WSMessage } from "../types.js";
import { z } from "zod";

const OrderSchema = z.object({
  marketId: z.string(),
  tokenId: z.string(),
  makerAmount: z.string().transform((v) => BigInt(v)),
  takerAmount: z.string().transform((v) => BigInt(v)),
  nonce: z.number(),
  expiration: z.number().default(0),
  side: z.nativeEnum(Side),
  signature: z.string(),
  orderType: z.nativeEnum(OrderType).default(OrderType.GTC),
  postOnly: z.boolean().default(false),
});

const L1AuthSchema = z.object({
  address: z.string(),
  timestamp: z.string(),
  nonce: z.number(),
  message: z.string(),
  signature: z.string(),
});

export function createServer(engine: MatchingEngine) {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(websocket);

  // --- Health ---

  app.get("/health", async () => ({ status: "ok", timestamp: Date.now() }));

  // --- Markets ---

  app.get("/markets", async () => {
    const markets = engine.getAllMarkets();
    return {
      markets: markets.map((m) => ({
        ...m,
        ...engine.getMarketSummary(m.id),
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/markets/:id", async (req) => {
    const market = engine.getMarket(req.params.id);
    if (!market) return { error: "Market not found" };
    return { ...market, ...engine.getMarketSummary(market.id) };
  });

  app.get<{ Params: { id: string } }>("/markets/:id/orderbook", async (req) => {
    const book = engine.getOrderBook(req.params.id);
    if (!book) return { error: "Market not found" };
    return {
      ...book,
      bids: book.bids.map((l) => ({ ...l, size: l.size.toString() })),
      asks: book.asks.map((l) => ({ ...l, size: l.size.toString() })),
    };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/markets/:id/trades",
    async (req) => {
      const limit = parseInt(req.query.limit || "50");
      const trades = engine.getRecentTrades(req.params.id, limit);
      return {
        trades: trades.map((t) => ({
          ...t,
          size: t.size.toString(),
          fee: t.fee.toString(),
        })),
      };
    },
  );

  // --- Portfolio ---

  app.get<{ Params: { address: string } }>("/portfolio/:address", async (req) => {
    const portfolio = engine.getPortfolio(req.params.address);
    return {
      positions: portfolio.positions.map((p) => ({
        ...p,
        yesShares: p.yesShares.toString(),
        noShares: p.noShares.toString(),
      })),
      openOrders: portfolio.openOrders.map((o) => ({
        ...o,
        makerAmount: o.makerAmount.toString(),
        takerAmount: o.takerAmount.toString(),
      })),
      tradeHistory: portfolio.tradeHistory.map((t) => ({
        ...t,
        size: t.size.toString(),
        fee: t.fee.toString(),
      })),
    };
  });

  // --- Authentication ---

  app.post("/auth/derive-api-key", async (req, reply) => {
    const body = L1AuthSchema.parse(req.body);
    const valid = verifyL1Auth(body.address, body.timestamp, body.nonce, body.message, body.signature);
    if (!valid) {
      reply.code(401);
      return { error: "Invalid signature" };
    }
    const apiKey = createApiKey(body.address);
    return apiKey;
  });

  // --- Orders (authenticated) ---

  app.post("/orders", async (req, reply) => {
    const auth = authenticateRequest(req);
    if (!auth) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const body = OrderSchema.parse(req.body);

    try {
      const result = engine.submitOrder(body.marketId, {
        maker: auth.address,
        tokenId: body.tokenId,
        makerAmount: body.makerAmount,
        takerAmount: body.takerAmount,
        nonce: body.nonce,
        expiration: body.expiration,
        side: body.side,
        signature: body.signature,
        orderType: body.orderType,
        postOnly: body.postOnly,
      });

      return {
        orderId: result.orderId,
        status: result.status,
        trades: result.trades.map((t) => ({
          ...t,
          size: t.size.toString(),
          fee: t.fee.toString(),
        })),
      };
    } catch (err: any) {
      reply.code(400);
      return { error: err.message };
    }
  });

  app.delete<{ Params: { marketId: string; orderId: string } }>(
    "/orders/:marketId/:orderId",
    async (req, reply) => {
      const auth = authenticateRequest(req);
      if (!auth) {
        reply.code(401);
        return { error: "Unauthorized" };
      }

      const success = engine.cancelOrder(req.params.marketId, req.params.orderId);
      return { success };
    },
  );

  app.delete<{ Params: { marketId: string } }>("/orders/:marketId", async (req, reply) => {
    const auth = authenticateRequest(req);
    if (!auth) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const count = engine.cancelAllOrders(req.params.marketId, auth.address);
    return { cancelled: count };
  });

  app.get<{ Params: { marketId: string } }>("/orders/:marketId/open", async (req, reply) => {
    const auth = authenticateRequest(req);
    if (!auth) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const orders = engine.getOpenOrders(req.params.marketId, auth.address);
    return {
      orders: orders.map((o) => ({
        ...o,
        makerAmount: o.makerAmount.toString(),
        takerAmount: o.takerAmount.toString(),
      })),
    };
  });

  // --- Fees & Rebates ---

  app.get("/fees/schedule", async () => {
    return {
      feeModel: "dynamic_taker_only",
      makerFee: "0%",
      maxTakerFee: "~1.56% at 50/50",
      formula: "fee = C * p * feeRate * (p * (1 - p))^exponent",
      params: { feeRate: 0.0175, exponent: 1 },
      schedule: engine.feeCalculator.getFeeSchedule(100),
    };
  });

  app.get("/fees/pool", async () => {
    const stats = engine.rebatePool.getStats();
    return {
      ...stats,
      currentPoolBalance: stats.currentPoolBalance.toString(),
      takerFeesAccumulated: stats.takerFeesAccumulated.toString(),
      depositFeesAccumulated: stats.depositFeesAccumulated.toString(),
      totalDistributed: stats.totalDistributed.toString(),
    };
  });

  app.get("/fees/leaderboard", async () => {
    const leaders = engine.rebatePool.getMakerLeaderboard(20);
    return {
      leaderboard: leaders.map((l) => ({
        address: l.address,
        filledVolume: l.filledVolume.toString(),
        thinSideFills: l.thinSideFills.toString(),
        score: l.score,
        estimatedRebate: l.estimatedRebate.toString(),
      })),
    };
  });

  app.get<{ Params: { address: string } }>("/fees/rebates/:address", async (req) => {
    const addr = req.params.address;
    const estimate = engine.rebatePool.estimateRebate(addr);
    const history = engine.rebatePool.getRebateHistory(addr);
    const tier = engine.feeCalculator.getTier(addr);

    return {
      tier,
      currentEstimate: {
        estimated: estimate.estimated.toString(),
        shareOfPool: estimate.shareOfPool,
        rank: estimate.rank,
      },
      history: history.map((r) => ({
        ...r,
        amount: r.amount.toString(),
      })),
    };
  });

  // --- MM Risk Status ---

  app.get("/mm/risk/:marketId", async (req) => {
    const { marketId } = req.params as { marketId: string };
    const market = engine.getMarket(marketId);
    if (!market) return { error: "Market not found" };

    // Access the risk manager through the AMM providers
    // For now, return a placeholder — the actual stats are available via the AMM status endpoint
    return { marketId, message: "Use /markets/:id/amm for risk stats" };
  });

  // --- WebSocket ---

  app.register(async function (fastify) {
    fastify.get("/ws", { websocket: true }, (socket, req) => {
      const subscriptions = new Set<string>();

      const unsubscribe = engine.subscribe((msg: WSMessage) => {
        // Only send messages for subscribed markets
        if ("data" in msg && "marketId" in (msg.data as any)) {
          const marketId = (msg.data as any).marketId;
          if (!subscriptions.has(marketId) && subscriptions.size > 0) return;
        }

        try {
          socket.send(
            JSON.stringify(msg, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
          );
        } catch {
          // Connection closed
        }
      });

      socket.on("message", (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "subscribe" && msg.marketId) {
            subscriptions.add(msg.marketId);
            // Send initial snapshot
            const book = engine.getOrderBook(msg.marketId);
            if (book) {
              socket.send(
                JSON.stringify(
                  { type: "orderbook_snapshot", data: book },
                  (_, v) => (typeof v === "bigint" ? v.toString() : v),
                ),
              );
            }
          }
          if (msg.type === "unsubscribe" && msg.marketId) {
            subscriptions.delete(msg.marketId);
          }
        } catch {
          // Invalid message, ignore
        }
      });

      socket.on("close", () => {
        unsubscribe();
      });
    });
  });

  return app;
}

function authenticateRequest(req: any): { address: string } | null {
  const apiKey = req.headers["x-api-key"] as string;
  const timestamp = req.headers["x-timestamp"] as string;
  const signature = req.headers["x-signature"] as string;

  if (!apiKey || !timestamp || !signature) return null;

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || "");
  const result = verifyL2Auth(apiKey, timestamp, req.method, req.url, body, signature);

  if (!result.valid || !result.address) return null;
  return { address: result.address };
}
