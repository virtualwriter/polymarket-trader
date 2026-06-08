// Standalone 5m Up/Down maker-guess test.
//
// This is intentionally not imported by the arb daemon or the 5m collector.
// Default mode is dry-run. Use --live only for a tiny, explicitly requested
// live experiment.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import WebSocket from "ws";
import { OrderType, Side, type TickSize } from "@polymarket/clob-client-v2";
import {
  assertOrderResponse,
  clobClient,
  orderId,
  POLYMARKET_FUNDER_ADDRESS,
  reconcileTokenBalance,
  roundShares,
} from "./polymarket-real-monotonic-executor.js";

config({ path: "config.env" });
config({ path: ".env" });

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

type GammaMarket = {
  id?: string | number;
  conditionId?: string;
  question?: string;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  outcomes?: string;
  clobTokenIds?: string;
  endDate?: string | null;
};

type GammaEvent = {
  slug?: string;
  title?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string | null;
  markets?: GammaMarket[];
};

type BookLevel = { price?: string; size?: string };
type BookResponse = { bids?: BookLevel[]; asks?: BookLevel[]; min_order_size?: string };
type ParsedLevel = { price: number; size: number };
type Top = { bid: number; bidSize: number; ask: number; askSize: number; bids: ParsedLevel[]; asks: ParsedLevel[]; minOrderSize: number };
type TrackedMarket = {
  slug: string;
  title: string;
  marketId: string;
  conditionId: string;
  endDate: string | null;
  upTokenId: string;
  downTokenId: string;
};

const LOOP_LIVE = process.argv.includes("--loop-live") || process.env.UPDOWN_MAKER_GUESS_LOOP_LIVE === "1";
const LOOP_DRY_RUN = process.argv.includes("--loop-dry-run") || process.env.UPDOWN_MAKER_GUESS_LOOP_DRY_RUN === "1";
const LOOP_MODE = LOOP_LIVE || LOOP_DRY_RUN;
const LIVE = process.argv.includes("--live") || LOOP_LIVE || process.env.UPDOWN_MAKER_GUESS_LIVE === "1";
const GAMMA_API = process.env.GAMMA_API ?? "https://gamma-api.polymarket.com";
const CLOB_HOST = process.env.POLYMARKET_CLOB_HOST ?? "https://clob.polymarket.com";
const USER_WS_URL = process.env.POLYMARKET_USER_WS_URL ?? "wss://ws-subscriptions-clob.polymarket.com/ws/user";
const MARKET_WS_URL = process.env.POLYMARKET_MARKET_WS_URL ?? "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const DATA_DIR = process.env.UPDOWN_MAKER_GUESS_DATA_DIR ?? "data";
const ATTEMPTS_PATH = process.env.UPDOWN_MAKER_GUESS_ATTEMPTS_PATH ?? join(DATA_DIR, "updown-5m-maker-guess-tests.jsonl");
const DISCOVERY_LIMIT = Number(process.env.UPDOWN_MAKER_GUESS_DISCOVERY_LIMIT ?? 100);
const FETCH_TIMEOUT_MS = Number(process.env.UPDOWN_MAKER_GUESS_FETCH_TIMEOUT_MS ?? 8_000);
const PRICE_OVERRIDE = process.env.UPDOWN_MAKER_GUESS_PRICE ?? argValue("--price") ?? "";
const TICK = Number(process.env.UPDOWN_MAKER_GUESS_TICK ?? 0.001);
const IMPROVE_BY = Number(process.env.UPDOWN_MAKER_GUESS_IMPROVE_BY ?? TICK);
const MAX_PAIR_COST = Number(process.env.UPDOWN_MAKER_GUESS_MAX_PAIR_COST ?? 0.999);
const HOLD_MS = Number(process.env.UPDOWN_MAKER_GUESS_HOLD_MS ?? argValue("--hold-ms") ?? 5_000);
const FILL_POLL_MS = Number(process.env.UPDOWN_MAKER_GUESS_FILL_POLL_MS ?? 250);
const COMPLETION_WINDOW_MS = Number(process.env.UPDOWN_MAKER_GUESS_COMPLETION_WINDOW_MS ?? 3_000);
const IMBALANCE_DUST_SHARES = Number(process.env.UPDOWN_MAKER_GUESS_DUST_SHARES ?? 0.01);
const COMPLEMENT_CROSS_BUFFER = Number(process.env.UPDOWN_MAKER_GUESS_COMPLEMENT_CROSS_BUFFER ?? 0.01);
const NUCLEAR_STOP_CENTS = Number(process.env.UPDOWN_MAKER_GUESS_NUCLEAR_STOP_CENTS ?? 0.01);
const NUCLEAR_EXIT_RETRIES = Number(process.env.UPDOWN_MAKER_GUESS_NUCLEAR_EXIT_RETRIES ?? 8);
const REACTIVE_DEPTH_LEVELS = Number(process.env.UPDOWN_MAKER_GUESS_REACTIVE_DEPTH_LEVELS ?? 3);
const USER_WS_READY_MS = Number(process.env.UPDOWN_MAKER_GUESS_USER_WS_READY_MS ?? 2_000);
const MARKET_WS_READY_MS = Number(process.env.UPDOWN_MAKER_GUESS_MARKET_WS_READY_MS ?? 2_000);
const MARKET_WS_CACHE_MAX_AGE_MS = Number(process.env.UPDOWN_MAKER_GUESS_MARKET_WS_CACHE_MAX_AGE_MS ?? 50);
const USE_MARKET_WS_CACHE = process.env.UPDOWN_MAKER_GUESS_USE_MARKET_WS_CACHE !== "0";
const LOOP_REFRESH_MS = Number(process.env.UPDOWN_MAKER_GUESS_LOOP_REFRESH_MS ?? 200);
const LOOP_MAX_MS = Number(process.env.UPDOWN_MAKER_GUESS_LOOP_MAX_MS ?? 5 * 60_000);
const LOOP_REPLACE_TICKS = Number(process.env.UPDOWN_MAKER_GUESS_LOOP_REPLACE_TICKS ?? 1);
const LOOP_MIN_SECONDS_TO_END = Number(process.env.UPDOWN_MAKER_GUESS_LOOP_MIN_SECONDS_TO_END ?? 20);
const LOOP_MAX_IDLE_MS = Number(process.env.UPDOWN_MAKER_GUESS_LOOP_MAX_IDLE_MS ?? 0);
const POLY_BUILDER_CODE = process.env.POLY_BUILDER_CODE?.trim();
const MIN_MARKETABLE_BUY_USD = Number(process.env.UPDOWN_MAKER_GUESS_MIN_MARKETABLE_BUY_USD ?? 1);
const MAX_TEST_PAIR_NOTIONAL_USD = Number(process.env.UPDOWN_MAKER_GUESS_MAX_TEST_PAIR_NOTIONAL_USD ?? 20);
const MIN_SECONDS_TO_END = Number(process.env.UPDOWN_MAKER_GUESS_MIN_SECONDS_TO_END ?? 60);
const MAX_SECONDS_TO_END = Number(process.env.UPDOWN_MAKER_GUESS_MAX_SECONDS_TO_END ?? 4 * 60);
const TAGS = (process.env.UPDOWN_MAKER_GUESS_TAGS ?? "bitcoin,ethereum,solana,xrp,dogecoin,bnb,hyperliquid,crypto")
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean);
const TARGET_SLUG = argValue("--slug") ?? process.env.UPDOWN_MAKER_GUESS_SLUG ?? "";
const TARGET_CONTAINS = (argValue("--contains") ?? process.env.UPDOWN_MAKER_GUESS_CONTAINS ?? "bitcoin").toLowerCase();

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function log(...args: unknown[]) {
  console.log(`[updown-maker-guess ${new Date().toISOString()}]`, ...args);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendJsonl(path: string, row: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(row) + "\n");
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

type ClobBundle = Awaited<ReturnType<typeof clobClient>>;
type Clob = ClobBundle["client"];
type FillSignal = { tokenId: string; status: string; receivedAt: string; raw: any };
type PriceLevels = { bids: Map<number, number>; asks: Map<number, number>; minOrderSize: number; updatedAtMs: number };

const tickSizeCache = new Map<string, Promise<TickSize>>();
const fillSignals: FillSignal[] = [];
const fillWaiters = new Map<string, Set<() => void>>();
const marketBookCache = new Map<string, PriceLevels>();

async function tickSize(client: Clob, tokenId: string): Promise<TickSize> {
  let cached = tickSizeCache.get(tokenId);
  if (!cached) {
    cached = client.getTickSize(tokenId) as Promise<TickSize>;
    tickSizeCache.set(tokenId, cached);
  }
  return cached;
}

async function signedBuy(client: Clob, tokenId: string, price: number, shares: number) {
  return client.createOrder(
    { tokenID: tokenId, price, size: Number(shares.toFixed(6)), side: Side.BUY, ...(POLY_BUILDER_CODE ? { builderCode: POLY_BUILDER_CODE } : {}) },
    { tickSize: await tickSize(client, tokenId), negRisk: false },
  );
}

async function signedSell(client: Clob, tokenId: string, price: number, shares: number) {
  return client.createOrder(
    { tokenID: tokenId, price, size: Number(shares.toFixed(6)), side: Side.SELL, ...(POLY_BUILDER_CODE ? { builderCode: POLY_BUILDER_CODE } : {}) },
    { tickSize: await tickSize(client, tokenId), negRisk: false },
  );
}

async function postLimitBuyCached(client: Clob, tokenId: string, price: number, shares: number): Promise<any> {
  return client.postOrder(await signedBuy(client, tokenId, price, shares), OrderType.GTC);
}

async function postFakBuyCached(client: Clob, tokenId: string, price: number, shares: number): Promise<any> {
  return client.postOrder(await signedBuy(client, tokenId, price, shares), OrderType.FAK);
}

async function postFakSellCached(client: Clob, tokenId: string, price: number, shares: number): Promise<any> {
  return client.postOrder(await signedSell(client, tokenId, price, shares), OrderType.FAK);
}

async function postLimitBuyPair(client: Clob, legs: Array<{ tokenId: string; price: number; shares: number }>): Promise<any[]> {
  const signed = await Promise.all(legs.map(async (leg) => ({
    order: await signedBuy(client, leg.tokenId, leg.price, leg.shares),
    orderType: OrderType.GTC,
  })));
  try {
    const response = await client.postOrders(signed);
    return Array.isArray(response) ? response : [response];
  } catch (err: any) {
    log(`batch GTC post failed; falling back to parallel postOrder: ${err?.message ?? String(err)}`);
    return Promise.all(legs.map((leg) => postLimitBuyCached(client, leg.tokenId, leg.price, leg.shares)));
  }
}

function signalFill(tokenId: string, raw: any) {
  const status = String(raw?.status ?? "").toUpperCase();
  fillSignals.push({ tokenId, status, receivedAt: new Date().toISOString(), raw });
  const waiters = fillWaiters.get(tokenId);
  if (!waiters) return;
  for (const resolveFn of waiters) resolveFn();
  waiters.clear();
}

function waitForAnyFill(tokenIds: string[], timeoutMs: number): Promise<FillSignal | null> {
  const existing = fillSignals.find((signal) => tokenIds.includes(signal.tokenId));
  if (existing) return Promise.resolve(existing);
  return new Promise((resolveFn) => {
    const done = () => {
      clearTimeout(timer);
      for (const tokenId of tokenIds) fillWaiters.get(tokenId)?.delete(done);
      const signal = fillSignals.find((row) => tokenIds.includes(row.tokenId)) ?? null;
      resolveFn(signal);
    };
    const timer = setTimeout(done, timeoutMs);
    for (const tokenId of tokenIds) {
      let waiters = fillWaiters.get(tokenId);
      if (!waiters) {
        waiters = new Set();
        fillWaiters.set(tokenId, waiters);
      }
      waiters.add(done);
    }
  });
}

function signalOrderIds(signal: FillSignal): string[] {
  const raw = signal.raw ?? {};
  const ids = [
    raw.order_id,
    raw.orderID,
    raw.taker_order_id,
    raw.maker_order_id,
    ...(Array.isArray(raw.maker_orders) ? raw.maker_orders.map((row: any) => row?.order_id ?? row?.orderID) : []),
  ];
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function waitForOwnFill(tokenIds: string[], orderIds: string[], timeoutMs: number): Promise<FillSignal | null> {
  const orderIdSet = new Set(orderIds.filter(Boolean));
  const matches = (signal: FillSignal) => (
    tokenIds.includes(signal.tokenId)
    && signalOrderIds(signal).some((id) => orderIdSet.has(id))
  );
  const existing = fillSignals.find(matches);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolveFn) => {
    const done = () => {
      clearTimeout(timer);
      for (const tokenId of tokenIds) fillWaiters.get(tokenId)?.delete(done);
      resolveFn(fillSignals.find(matches) ?? null);
    };
    const timer = setTimeout(done, timeoutMs);
    for (const tokenId of tokenIds) {
      let waiters = fillWaiters.get(tokenId);
      if (!waiters) {
        waiters = new Set();
        fillWaiters.set(tokenId, waiters);
      }
      waiters.add(done);
    }
  });
}

function findOwnFill(tokenIds: string[], orderIds: string[]): FillSignal | null {
  const orderIdSet = new Set(orderIds.filter(Boolean));
  return fillSignals.find((signal) => (
    tokenIds.includes(signal.tokenId)
    && signalOrderIds(signal).some((id) => orderIdSet.has(id))
  )) ?? null;
}

function handleUserMessage(raw: WebSocket.RawData) {
  let data: any;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const messages: any[] = Array.isArray(data) ? data : [data];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const eventType = msg.event_type ?? msg.type;
    if (eventType !== "trade") continue;
    const tokenId = msg.asset_id;
    const status = String(msg.status ?? "").toUpperCase();
    if (tokenId && (status === "MATCHED" || status === "CONFIRMED" || !status)) {
      signalFill(tokenId, msg);
    }
  }
}

async function connectUserWs(clob: ClobBundle, conditionId: string): Promise<WebSocket | null> {
  if (!conditionId) return null;
  const ws = new WebSocket(USER_WS_URL);
  return new Promise((resolveFn) => {
    let settled = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    const settle = (value: WebSocket | null) => {
      if (settled) return;
      settled = true;
      resolveFn(value);
    };
    const timer = setTimeout(() => {
      log(`user WS not ready after ${USER_WS_READY_MS}ms; continuing with balance fallback`);
      settle(ws.readyState === WebSocket.OPEN ? ws : null);
    }, USER_WS_READY_MS);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        auth: { apiKey: clob.creds.key, secret: clob.creds.secret, passphrase: clob.creds.passphrase },
        markets: [conditionId],
        type: "user",
      }));
      ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("PING");
      }, 10_000);
      clearTimeout(timer);
      log(`user WS connected for ${conditionId}`);
      settle(ws);
    });
    ws.on("message", (msg) => handleUserMessage(msg));
    ws.on("error", (err) => log(`user WS error: ${err.message}`));
    ws.on("close", () => {
      if (ping) clearInterval(ping);
    });
  });
}

function handleMarketMessage(raw: WebSocket.RawData, tokenIds: Set<string>) {
  let data: any;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const messages: any[] = Array.isArray(data) ? data : [data];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const eventType = msg.event_type ?? msg.type;
    if (eventType === "book" || (msg.asset_id && (msg.bids || msg.asks || msg.buys || msg.sells))) {
      const tokenId = String(msg.asset_id ?? "");
      if (!tokenIds.has(tokenId)) continue;
      applyMarketSnapshot(tokenId, rawLevels(msg.bids ?? msg.buys), rawLevels(msg.asks ?? msg.sells));
      continue;
    }
    const changes: any[] = msg.price_changes ?? msg.changes ?? [];
    for (const change of changes) {
      const tokenId = String(change.asset_id ?? msg.asset_id ?? "");
      if (!tokenIds.has(tokenId)) continue;
      applyMarketLevelChange(tokenId, String(change.side ?? ""), parseNumber(change.price), parseNumber(change.size));
    }
  }
}

async function connectMarketWs(market: TrackedMarket): Promise<WebSocket | null> {
  if (!USE_MARKET_WS_CACHE) return null;
  const tokens = [market.upTokenId, market.downTokenId];
  await Promise.all(tokens.map((tokenId) => seedMarketBook(tokenId)));
  const tokenIds = new Set(tokens);
  const ws = new WebSocket(MARKET_WS_URL);
  return new Promise((resolveFn) => {
    let settled = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    const settle = (value: WebSocket | null) => {
      if (settled) return;
      settled = true;
      resolveFn(value);
    };
    const timer = setTimeout(() => {
      log(`market WS not ready after ${MARKET_WS_READY_MS}ms; continuing with REST fallback`);
      settle(ws.readyState === WebSocket.OPEN ? ws : null);
    }, MARKET_WS_READY_MS);
    ws.on("open", () => {
      ws.send(JSON.stringify({ assets_ids: tokens, type: "market" }));
      ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("PING");
      }, 10_000);
      clearTimeout(timer);
      log(`market WS connected for ${market.slug}`);
      settle(ws);
    });
    ws.on("message", (msg) => handleMarketMessage(msg, tokenIds));
    ws.on("error", (err) => log(`market WS error: ${err.message}`));
    ws.on("close", () => {
      if (ping) clearInterval(ping);
    });
  });
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "updown-5m-maker-guess-test/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function parsedLevels(levels: BookLevel[] | undefined, side: "bid" | "ask", limit = 3): ParsedLevel[] {
  return (levels ?? [])
    .map((level) => ({ price: parseNumber(level.price), size: parseNumber(level.size) }))
    .filter((level) => level.price > 0 && level.size > 0)
    .sort((a, b) => side === "bid" ? b.price - a.price : a.price - b.price)
    .slice(0, limit);
}

function topLevel(levels: BookLevel[] | undefined, side: "bid" | "ask"): ParsedLevel {
  const parsed = parsedLevels(levels, side, 1);
  if (!parsed.length) return { price: 0, size: 0 };
  return parsed[0];
}

function topFromBook(book: BookResponse): Top {
  const bids = parsedLevels(book.bids, "bid", 3);
  const asks = parsedLevels(book.asks, "ask", 3);
  const bid = topLevel(book.bids, "bid");
  const ask = topLevel(book.asks, "ask");
  return {
    bid: bid.price,
    bidSize: bid.size,
    ask: ask.price,
    askSize: ask.size,
    bids,
    asks,
    minOrderSize: parseNumber(book.min_order_size) || 5,
  };
}

function emptyLevels(minOrderSize = 5): PriceLevels {
  return { bids: new Map(), asks: new Map(), minOrderSize, updatedAtMs: 0 };
}

function getCachedBook(tokenId: string): PriceLevels {
  let book = marketBookCache.get(tokenId);
  if (!book) {
    book = emptyLevels();
    marketBookCache.set(tokenId, book);
  }
  return book;
}

function rawLevels(rows: unknown): ParsedLevel[] {
  return (Array.isArray(rows) ? rows : [])
    .map((level: any) => ({ price: parseNumber(level.price), size: parseNumber(level.size) }))
    .filter((level) => level.price > 0 && level.size > 0);
}

function applyMarketSnapshot(tokenId: string, bids: ParsedLevel[], asks: ParsedLevel[], minOrderSize?: number) {
  const current = marketBookCache.get(tokenId);
  const book = emptyLevels(minOrderSize ?? current?.minOrderSize ?? 5);
  for (const level of bids) book.bids.set(level.price, level.size);
  for (const level of asks) book.asks.set(level.price, level.size);
  book.updatedAtMs = Date.now();
  marketBookCache.set(tokenId, book);
}

function applyMarketLevelChange(tokenId: string, side: string, price: number, size: number) {
  if (!(price > 0)) return;
  const book = getCachedBook(tokenId);
  const lower = side.toLowerCase();
  const levels = lower === "buy" || lower === "bid" || lower === "bids" ? book.bids : book.asks;
  if (size > 0) levels.set(price, size);
  else levels.delete(price);
  book.updatedAtMs = Date.now();
}

function topFromCachedBook(tokenId: string): Top | null {
  const book = marketBookCache.get(tokenId);
  if (!book || !book.updatedAtMs) return null;
  const bids = [...book.bids.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);
  const asks = [...book.asks.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);
  return {
    bid: bids[0]?.price ?? 0,
    bidSize: bids[0]?.size ?? 0,
    ask: asks[0]?.price ?? 0,
    askSize: asks[0]?.size ?? 0,
    bids,
    asks,
    minOrderSize: book.minOrderSize,
  };
}

function cacheAgeMs(tokenId: string): number {
  const book = marketBookCache.get(tokenId);
  return book?.updatedAtMs ? Date.now() - book.updatedAtMs : Number.POSITIVE_INFINITY;
}

async function seedMarketBook(tokenId: string) {
  const raw = await fetchJson<BookResponse>(`${CLOB_HOST}/book?${new URLSearchParams({ token_id: tokenId })}`);
  applyMarketSnapshot(tokenId, rawLevels(raw.bids), rawLevels(raw.asks), parseNumber(raw.min_order_size) || 5);
}

async function fetchTop(tokenId: string): Promise<Top> {
  if (USE_MARKET_WS_CACHE) {
    const cached = topFromCachedBook(tokenId);
    if (cached && cacheAgeMs(tokenId) <= MARKET_WS_CACHE_MAX_AGE_MS) return cached;
  }
  return topFromBook(await fetchJson<BookResponse>(`${CLOB_HOST}/book?${new URLSearchParams({ token_id: tokenId })}`));
}

function isUpDown5mSlug(slug: string): boolean {
  return /^[a-z0-9-]+-updown-5m-\d+$/.test(slug);
}

function secondsToEnd(endDate: string | null): number | null {
  if (!endDate) return null;
  const ms = Date.parse(endDate);
  return Number.isFinite(ms) ? (ms - Date.now()) / 1000 : null;
}

function trackedMarketFromEvent(event: GammaEvent): TrackedMarket | null {
  const slug = event.slug ?? "";
  if (!slug || !isUpDown5mSlug(slug) || event.closed || event.active === false) return null;
  const market = (event.markets ?? []).find((candidate) => {
    if (candidate.closed || candidate.active === false || candidate.acceptingOrders === false) return false;
    const outcomes = parseJsonArray(candidate.outcomes).map(String);
    return outcomes.includes("Up") && outcomes.includes("Down");
  });
  if (!market) return null;
  const outcomes = parseJsonArray(market.outcomes).map(String);
  const tokenIds = parseJsonArray(market.clobTokenIds).map(String);
  const upIndex = outcomes.findIndex((outcome) => outcome === "Up");
  const downIndex = outcomes.findIndex((outcome) => outcome === "Down");
  if (upIndex < 0 || downIndex < 0 || !tokenIds[upIndex] || !tokenIds[downIndex]) return null;
  const endDate = market.endDate ?? event.endDate ?? null;
  const seconds = secondsToEnd(endDate);
  if (seconds !== null && (seconds < MIN_SECONDS_TO_END || seconds > MAX_SECONDS_TO_END)) return null;
  return {
    slug,
    title: event.title ?? market.question ?? slug,
    marketId: String(market.id ?? ""),
    conditionId: market.conditionId ?? "",
    endDate,
    upTokenId: tokenIds[upIndex],
    downTokenId: tokenIds[downIndex],
  };
}

async function discoverMarkets(): Promise<TrackedMarket[]> {
  const bySlug = new Map<string, TrackedMarket>();
  for (const tag of TAGS) {
    for (let offset = 0; offset < DISCOVERY_LIMIT; offset += 100) {
      const url = `${GAMMA_API}/events?${new URLSearchParams({
        active: "true",
        closed: "false",
        limit: "100",
        offset: String(offset),
        tag_slug: tag,
      })}`;
      const events = await fetchJson<GammaEvent[]>(url).catch((err) => {
        log(`discovery tag=${tag} offset=${offset} failed: ${err?.message ?? String(err)}`);
        return [];
      });
      if (!Array.isArray(events) || events.length === 0) break;
      for (const event of events) {
        const tracked = trackedMarketFromEvent(event);
        if (tracked) bySlug.set(tracked.slug, tracked);
      }
      if (events.length < 100) break;
    }
  }
  return [...bySlug.values()].sort((a, b) => {
    const aEnd = secondsToEnd(a.endDate) ?? Number.POSITIVE_INFINITY;
    const bEnd = secondsToEnd(b.endDate) ?? Number.POSITIVE_INFINITY;
    return aEnd - bEnd;
  });
}

async function discoverBtcMarket(): Promise<TrackedMarket | null> {
  const markets = await discoverMarkets();
  return markets.find((market) => market.slug.startsWith("btc-updown-5m-")) ?? null;
}

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scale = 10 ** decimals;
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-7;
}

function clobBuyAmountValid(price: number, shares: number): boolean {
  return hasAtMostDecimals(price * shares, 2) && hasAtMostDecimals(shares, 5);
}

function floorToTick(value: number): number {
  return Math.floor((value + 1e-12) / TICK) * TICK;
}

function normalizePrice(value: number): number {
  return Number(floorToTick(value).toFixed(4));
}

function dynamicBid(top: Top, label: string): number {
  if (PRICE_OVERRIDE) {
    const price = Number(PRICE_OVERRIDE);
    if (!(price > 0 && price < 1)) throw new Error(`invalid --price ${PRICE_OVERRIDE}`);
    return normalizePrice(price);
  }
  if (!(top.bid > 0) || !(top.ask > 0)) {
    throw new Error(`${label} missing live bid/ask bid=${top.bid} ask=${top.ask}`);
  }
  const improvedBid = top.bid + IMPROVE_BY;
  const makerCap = top.ask - TICK;
  const bid = normalizePrice(Math.min(improvedBid, makerCap));
  if (!(bid > 0) || bid + 1e-12 >= top.ask) {
    throw new Error(`${label} no safe maker bid bid=${top.bid} ask=${top.ask} computed=${bid}`);
  }
  return bid;
}

function complementCrossBlock(upPrice: number, downPrice: number, upTop: Top, downTop: Top): string | null {
  const maxCrossable = 1 - COMPLEMENT_CROSS_BUFFER;
  if (upTop.bid > 0 && downPrice + upTop.bid > maxCrossable + 1e-12) {
    return `down_bid_crossable down=${downPrice.toFixed(4)} + upBestBid=${upTop.bid.toFixed(4)} > ${(maxCrossable).toFixed(4)}`;
  }
  if (downTop.bid > 0 && upPrice + downTop.bid > maxCrossable + 1e-12) {
    return `up_bid_crossable up=${upPrice.toFixed(4)} + downBestBid=${downTop.bid.toFixed(4)} > ${(maxCrossable).toFixed(4)}`;
  }
  return null;
}

function minValidShares(price: number, minOrderSize: number): number {
  const minNotionalShares = price > 0
    ? Math.ceil((MIN_MARKETABLE_BUY_USD / price) * 100) / 100
    : Number.POSITIVE_INFINITY;
  const start = Math.ceil(Math.max(minOrderSize, minNotionalShares) * 100) / 100;
  for (let units = Math.round(start * 100); units <= 100_000; units += 1) {
    const shares = units / 100;
    if (clobBuyAmountValid(price, shares)) return shares;
  }
  throw new Error(`no cent-valid size found for price=${price}`);
}

type QuotePlan = {
  upTop: Top;
  downTop: Top;
  upPrice: number;
  downPrice: number;
  pairCost: number;
  shares: number;
  notional: { up: number; down: number; total: number };
  theoreticalPairEdge: number;
};

async function quotePlanForMarket(market: TrackedMarket): Promise<QuotePlan> {
  const [upTop, downTop] = await Promise.all([
    fetchTop(market.upTokenId),
    fetchTop(market.downTokenId),
  ]);
  const upPrice = dynamicBid(upTop, "up_loop");
  const downPrice = dynamicBid(downTop, "down_loop");
  const pairCost = upPrice + downPrice;
  if (pairCost >= MAX_PAIR_COST) {
    throw new Error(`loop_edge_gone sum=${pairCost.toFixed(4)} >= ${MAX_PAIR_COST.toFixed(4)}`);
  }
  const crossBlock = complementCrossBlock(upPrice, downPrice, upTop, downTop);
  if (crossBlock) throw new Error(`loop_cross_block ${crossBlock}`);
  const shares = Math.max(
    minValidShares(upPrice, upTop.minOrderSize),
    minValidShares(downPrice, downTop.minOrderSize),
  );
  const total = shares * pairCost;
  if (total > MAX_TEST_PAIR_NOTIONAL_USD + 1e-12) {
    throw new Error(`loop_minPairNotional=$${total.toFixed(2)} > maxTest=$${MAX_TEST_PAIR_NOTIONAL_USD.toFixed(2)}`);
  }
  return {
    upTop,
    downTop,
    upPrice,
    downPrice,
    pairCost,
    shares,
    notional: {
      up: Number((upPrice * shares).toFixed(4)),
      down: Number((downPrice * shares).toFixed(4)),
      total: Number(total.toFixed(4)),
    },
    theoreticalPairEdge: Number(((1 - pairCost) * shares).toFixed(4)),
  };
}

function quoteChanged(a: QuotePlan, b: QuotePlan): boolean {
  const threshold = TICK * LOOP_REPLACE_TICKS;
  return Math.abs(a.upPrice - b.upPrice) >= threshold - 1e-12
    || Math.abs(a.downPrice - b.downPrice) >= threshold - 1e-12
    || Math.abs(a.shares - b.shares) >= 0.01;
}

function averageBuyPrice(response: unknown, fallbackPrice: number): number {
  const row = response as any;
  const cost = Number(row?.makingAmount);
  const shares = Number(row?.takingAmount);
  if (Number.isFinite(cost) && cost > 0 && Number.isFinite(shares) && shares > 0) {
    return cost / shares;
  }
  return fallbackPrice;
}

function responseBuyShares(response: unknown): number {
  const shares = Number((response as any)?.takingAmount);
  return Number.isFinite(shares) && shares > 0 ? shares : 0;
}

function fillSignalDetails(signal: FillSignal | null, market: TrackedMarket, orderIds?: { up?: string; down?: string }): null | {
  sideFilled: "up" | "down";
  complementSide: "up" | "down";
  complementToken: string;
  fillPrice: number;
  shares: number;
} {
  if (!signal) return null;
  const tokenId = String(signal.tokenId);
  const ids = signalOrderIds(signal);
  const sideFilled = orderIds?.up && ids.includes(orderIds.up)
    ? "up"
    : orderIds?.down && ids.includes(orderIds.down)
      ? "down"
      : tokenId === market.upTokenId
        ? "up"
        : tokenId === market.downTokenId
          ? "down"
          : null;
  if (!sideFilled) return null;
  const fillPrice = Number(signal.raw?.price);
  const shares = Number(signal.raw?.size);
  if (!(fillPrice > 0) || !(shares > 0)) return null;
  const complementSide = sideFilled === "up" ? "down" : "up";
  return {
    sideFilled,
    complementSide,
    complementToken: complementSide === "up" ? market.upTokenId : market.downTokenId,
    fillPrice,
    shares,
  };
}

function averageSellPrice(response: unknown, fallbackPrice: number): number {
  const row = response as any;
  const shares = Number(row?.makingAmount);
  const proceeds = Number(row?.takingAmount);
  if (Number.isFinite(proceeds) && proceeds > 0 && Number.isFinite(shares) && shares > 0) {
    return proceeds / shares;
  }
  return fallbackPrice;
}

function aggressiveSafeComplementPrice(top: Top, maxComplementPrice: number): { price: number; reason: string; levels: ParsedLevel[] } {
  const safeMax = normalizePrice(maxComplementPrice);
  const levels = top.asks.slice(0, Math.max(1, REACTIVE_DEPTH_LEVELS));
  const safeLevels = levels.filter((level) => level.price <= safeMax + 1e-12);
  if (safeLevels.length) {
    return {
      price: safeLevels[safeLevels.length - 1].price,
      reason: `top_${safeLevels.length}_safe_level`,
      levels,
    };
  }
  if (top.ask > 0 && top.ask <= safeMax + 1e-12) {
    return { price: top.ask, reason: "best_ask_safe", levels };
  }
  return { price: 0, reason: "no_safe_ask_level", levels };
}

async function cancelOrderTimed(client: Awaited<ReturnType<typeof clobClient>>["client"], orderID: string) {
  const startedMs = Date.now();
  let ok = false;
  let error = "";
  try {
    await client.cancelOrder({ orderID });
    ok = true;
  } catch (err: any) {
    error = err?.message ?? String(err);
  }
  return { orderID, ok, error, elapsedMs: Date.now() - startedMs };
}

async function currentFilled(address: string, market: TrackedMarket, before: { up: number; down: number }) {
  const [up, down] = await Promise.all([
    reconcileTokenBalance(address, market.upTokenId),
    reconcileTokenBalance(address, market.downTokenId),
  ]);
  return {
    balances: { up, down },
    filled: {
      up: roundShares(up - before.up),
      down: roundShares(down - before.down),
    },
  };
}

async function waitForSettledFilled(
  address: string,
  market: TrackedMarket,
  before: { up: number; down: number },
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let latest = await currentFilled(address, market, before);
  let lastKey = JSON.stringify(latest.filled);
  let stableCount = 0;
  while (Date.now() < deadline) {
    await sleep(300);
    latest = await currentFilled(address, market, before);
    const key = JSON.stringify(latest.filled);
    if (key === lastKey) {
      stableCount += 1;
      const anyFill = latest.filled.up > 0 || latest.filled.down > 0;
      if (anyFill && stableCount >= 2) return latest;
    } else {
      stableCount = 0;
      lastKey = key;
    }
  }
  return latest;
}

async function tryCompleteImbalance(
  client: Awaited<ReturnType<typeof clobClient>>["client"],
  address: string,
  market: TrackedMarket,
  sideFilled: "up" | "down",
  fillPrice: number,
  shares: number,
) {
  const complementSide = sideFilled === "up" ? "down" : "up";
  const complementToken = complementSide === "up" ? market.upTokenId : market.downTokenId;
  const maxComplementPrice = MAX_PAIR_COST - fillPrice;
  const attempts: any[] = [];
  const deadline = Date.now() + COMPLETION_WINDOW_MS;
  let totalBought = 0;
  let totalCost = 0;

  while (Date.now() < deadline && totalBought + IMBALANCE_DUST_SHARES < shares) {
    const top = await fetchTop(complementToken);
    const remaining = roundShares(shares - totalBought);
    const pick = aggressiveSafeComplementPrice(top, maxComplementPrice);
    const attempt: any = {
      at: new Date().toISOString(),
      complementSide,
      ask: top.ask,
      askSize: top.askSize,
      topAskLevels: pick.levels,
      pickedComplementPrice: pick.price,
      pickReason: pick.reason,
      maxComplementPrice,
      remaining,
      action: "skip",
    };
    if (pick.price > 0 && top.askSize >= Math.min(remaining, 1)) {
      const before = await reconcileTokenBalance(address, complementToken);
      const startedMs = Date.now();
      let response: unknown;
      try {
        response = await postFakBuyCached(client, complementToken, pick.price, remaining);
        assertOrderResponse(response, "maker_guess_completion");
        attempt.action = "fak_buy";
      } catch (err: any) {
        response = { error: err?.message ?? String(err) };
        attempt.action = "error";
      }
      await sleep(250);
      const after = await reconcileTokenBalance(address, complementToken);
      const responseShares = responseBuyShares(response);
      const balanceShares = roundShares(after - before);
      const bought = responseShares > 0 ? responseShares : Math.min(remaining, balanceShares);
      const buyPrice = averageBuyPrice(response, pick.price);
      totalBought = roundShares(totalBought + bought);
      totalCost += bought * buyPrice;
      Object.assign(attempt, {
        response,
        elapsedMs: Date.now() - startedMs,
        bought,
        responseShares,
        balanceShares,
        buyPrice,
        totalBought,
      });
      attempts.push(attempt);
      if (bought <= 0) await sleep(FILL_POLL_MS);
      continue;
    }
    attempts.push(attempt);
    await sleep(FILL_POLL_MS);
  }

  return {
    complementSide,
    maxComplementPrice,
    windowMs: COMPLETION_WINDOW_MS,
    bought: totalBought,
    averagePrice: totalBought > 0 ? totalCost / totalBought : 0,
    attempts,
  };
}

async function tryReactiveCompletion(
  client: Awaited<ReturnType<typeof clobClient>>["client"],
  market: TrackedMarket,
  signal: FillSignal | null,
  orderIds: { up?: string; down?: string },
) {
  const details = fillSignalDetails(signal, market, orderIds);
  const startedMs = Date.now();
  if (!details) {
    return { action: "skip", reason: "no_fill_signal_details", elapsedMs: 0 };
  }
  const maxComplementPrice = MAX_PAIR_COST - details.fillPrice;
  const top = await fetchTop(details.complementToken);
  const pick = aggressiveSafeComplementPrice(top, maxComplementPrice);
  const result: any = {
    action: "skip",
    startedAt: new Date(startedMs).toISOString(),
    sideFilled: details.sideFilled,
    complementSide: details.complementSide,
    fillPrice: details.fillPrice,
    shares: details.shares,
    maxComplementPrice,
    complementAsk: top.ask,
    complementAskSize: top.askSize,
    topAskLevels: pick.levels,
    pickedComplementPrice: pick.price,
    pickReason: pick.reason,
  };
  if (!(pick.price > 0) || top.askSize < Math.min(details.shares, 1)) {
    return { ...result, reason: "unsafe_or_missing_complement", elapsedMs: Date.now() - startedMs };
  }
  try {
    const response = await postFakBuyCached(client, details.complementToken, pick.price, details.shares);
    assertOrderResponse(response, "maker_guess_reactive_completion");
    const bought = responseBuyShares(response);
    return {
      ...result,
      action: "fak_buy",
      response,
      bought,
      buyPrice: averageBuyPrice(response, pick.price),
      elapsedMs: Date.now() - startedMs,
    };
  } catch (err: any) {
    return {
      ...result,
      action: "error",
      response: { error: err?.message ?? String(err) },
      elapsedMs: Date.now() - startedMs,
    };
  }
}

async function flatten(client: Awaited<ReturnType<typeof clobClient>>["client"], address: string, tokenId: string, fillPrice: number, shares: number) {
  const top = await fetchTop(tokenId);
  if (!(top.bid > 0)) {
    return { status: "stranded", bid: top.bid, soldShares: 0, realizedEstimate: 0, response: { error: "no bid" } };
  }
  const before = await reconcileTokenBalance(address, tokenId);
  let response: unknown;
  try {
    response = await postFakSellCached(client, tokenId, top.bid, shares);
    assertOrderResponse(response, "updown_maker_guess_flatten");
  } catch (err: any) {
    response = { error: err?.message ?? String(err) };
  }
  await sleep(2_500);
  const after = await reconcileTokenBalance(address, tokenId);
  const soldShares = Math.min(shares, roundShares(before - after));
  const sellPrice = averageSellPrice(response, top.bid);
  return {
    status: soldShares > 0 ? "sold" : "stranded",
    bid: top.bid,
    sellPrice,
    soldShares,
    realizedEstimate: soldShares * (sellPrice - fillPrice),
    response,
  };
}

async function nuclearStopExit(
  client: Awaited<ReturnType<typeof clobClient>>["client"],
  address: string,
  tokenId: string,
  fillPrice: number,
  shares: number,
) {
  const stopBid = normalizePrice(fillPrice - NUCLEAR_STOP_CENTS);
  const attempts: any[] = [];
  const before = await reconcileTokenBalance(address, tokenId);
  let totalSold = 0;
  let totalProceeds = 0;

  for (let idx = 0; idx < NUCLEAR_EXIT_RETRIES && totalSold + IMBALANCE_DUST_SHARES < shares; idx += 1) {
    const remaining = roundShares(shares - totalSold);
    const top = await fetchTop(tokenId);
    const attempt: any = {
      at: new Date().toISOString(),
      bid: top.bid,
      bidSize: top.bidSize,
      stopBid,
      remaining,
      withinStop: top.bid >= stopBid - 1e-12,
      action: "wait",
    };
    if (top.bid > 0) {
      const startedMs = Date.now();
      let response: unknown;
      try {
        response = await postFakSellCached(client, tokenId, top.bid, remaining);
        assertOrderResponse(response, "updown_maker_guess_nuclear_stop");
        attempt.action = "fak_sell";
      } catch (err: any) {
        response = { error: err?.message ?? String(err) };
        attempt.action = "error";
      }
      await sleep(250);
      const after = await reconcileTokenBalance(address, tokenId);
      const balanceSold = Math.max(0, roundShares(before - after - totalSold));
      const responseSold = Number((response as any)?.makingAmount);
      const sold = Number.isFinite(responseSold) && responseSold > 0 ? Math.min(remaining, responseSold) : Math.min(remaining, balanceSold);
      const sellPrice = averageSellPrice(response, top.bid);
      totalSold = roundShares(totalSold + sold);
      totalProceeds += sold * sellPrice;
      Object.assign(attempt, {
        response,
        elapsedMs: Date.now() - startedMs,
        sold,
        responseSold,
        balanceSold,
        sellPrice,
        totalSold,
      });
    }
    attempts.push(attempt);
    if (totalSold + IMBALANCE_DUST_SHARES >= shares) break;
    await sleep(FILL_POLL_MS);
  }

  return {
    stopBid,
    stopCents: NUCLEAR_STOP_CENTS,
    soldShares: totalSold,
    averagePrice: totalSold > 0 ? totalProceeds / totalSold : 0,
    realizedEstimate: totalSold > 0 ? totalProceeds - totalSold * fillPrice : 0,
    status: totalSold + IMBALANCE_DUST_SHARES >= shares ? "sold" : "stranded",
    attempts,
  };
}

type LoopPair = {
  market: TrackedMarket;
  quote: QuotePlan;
  orderIds: { up?: string; down?: string };
  responses: { up: unknown; down: unknown };
  before: { up: number; down: number };
  postedAt: string;
  postedAtMs: number;
  attempt: any;
};

async function cancelLoopPair(client: Clob, pair: LoopPair): Promise<any[]> {
  return Promise.all(
    [pair.orderIds.up, pair.orderIds.down]
      .filter(isString)
      .map((id: string) => cancelOrderTimed(client, id)),
  );
}

async function postLoopPair(client: Clob, address: string, market: TrackedMarket, quote: QuotePlan): Promise<LoopPair> {
  const [beforeUp, beforeDown] = await Promise.all([
    reconcileTokenBalance(address, market.upTokenId),
    reconcileTokenBalance(address, market.downTokenId),
  ]);
  if (beforeUp >= IMBALANCE_DUST_SHARES || beforeDown >= IMBALANCE_DUST_SHARES) {
    throw new Error(`pre_existing_5m_position up=${beforeUp} down=${beforeDown}`);
  }
  fillSignals.length = 0;
  const submitStartedMs = Date.now();
  const [upResp, downResp] = await postLimitBuyPair(client, [
    { tokenId: market.upTokenId, price: quote.upPrice, shares: quote.shares },
    { tokenId: market.downTokenId, price: quote.downPrice, shares: quote.shares },
  ]);
  const orderIds = { up: orderId(upResp), down: orderId(downResp) };
  const attempt: any = {
    id: `UPDOWN-MAKER-LOOP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    mode: "LOOP_LIVE",
    market,
    pricingMode: PRICE_OVERRIDE ? "fixed" : "dynamic_book",
    prices: { up: quote.upPrice, down: quote.downPrice, pairCost: quote.pairCost },
    shares: quote.shares,
    notional: quote.notional,
    theoreticalPairEdge: quote.theoreticalPairEdge,
    secondsToEnd: secondsToEnd(market.endDate),
    beforeBook: { up: quote.upTop, down: quote.downTop },
    before: { up: beforeUp, down: beforeDown },
    responses: { up: upResp, down: downResp },
    orderIds,
    latency: { submitPairMs: Date.now() - submitStartedMs },
  };
  try {
    assertOrderResponse(upResp, "loop_maker_guess_up");
    assertOrderResponse(downResp, "loop_maker_guess_down");
  } catch (err: any) {
    attempt.submitError = err?.message ?? String(err);
    attempt.submitCleanup = await Promise.all(
      [orderIds.up, orderIds.down]
        .filter(isString)
        .map((id: string) => cancelOrderTimed(client, id)),
    );
    appendJsonl(ATTEMPTS_PATH, attempt);
    throw err;
  }
  log(`loop posted ${market.slug} up=${quote.upPrice.toFixed(4)} down=${quote.downPrice.toFixed(4)} sum=${quote.pairCost.toFixed(4)} shares=${quote.shares.toFixed(2)} ids=${orderIds.up ?? "?"}/${orderIds.down ?? "?"}`);
  return {
    market,
    quote,
    orderIds,
    responses: { up: upResp, down: downResp },
    before: { up: beforeUp, down: beforeDown },
    postedAt: attempt.createdAt,
    postedAtMs: Date.now(),
    attempt,
  };
}

async function finalizeLoopPair(
  client: Clob,
  address: string,
  pair: LoopPair,
  firstFill: FillSignal | null,
  userWs: WebSocket | null,
): Promise<"REAL_ARB_FILL" | "NUCLEAR_EXIT" | "NO_FILL" | "UNACCEPTABLE"> {
  const attempt = pair.attempt;
  attempt.firstFillSignal = firstFill;
  if (firstFill) {
    const reactiveStartedMs = Date.now();
    const reactiveCompletion: any = await tryReactiveCompletion(client, pair.market, firstFill, pair.orderIds);
    attempt.reactiveCompletion = reactiveCompletion;
    attempt.latency.reactiveCompletionMs = Date.now() - reactiveStartedMs;
    if (reactiveCompletion.action === "fak_buy") {
      const price = typeof reactiveCompletion.buyPrice === "number" ? reactiveCompletion.buyPrice.toFixed(4) : reactiveCompletion.complementAsk;
      log(`loop reactive completion ${reactiveCompletion.complementSide} bought=${reactiveCompletion.bought ?? "?"} price=${price}`);
    }
  }

  const cancelStartedMs = Date.now();
  attempt.cancels = await cancelLoopPair(client, pair);
  attempt.latency.cancelAllMs = Date.now() - cancelStartedMs;

  let latest = await waitForSettledFilled(address, pair.market, pair.before, firstFill ? 6_000 : 1_000);
  let upFilled = latest.filled.up;
  let downFilled = latest.filled.down;
  let imbalance = roundShares(Math.abs(upFilled - downFilled));
  const actualFillPrices = {
    up: upFilled > 0 ? averageBuyPrice(pair.responses.up, pair.quote.upPrice) : 0,
    down: downFilled > 0 ? averageBuyPrice(pair.responses.down, pair.quote.downPrice) : 0,
  };
  attempt.after = latest.balances;
  attempt.filled = {
    up: upFilled,
    down: downFilled,
    matched: Math.min(upFilled, downFilled),
    imbalance,
    imbalanceSide: upFilled > downFilled ? "up" : downFilled > upFilled ? "down" : null,
    actualFillPrices,
  };
  if (attempt.filled.matched > 0) {
    const actualPairCost = actualFillPrices.up + actualFillPrices.down;
    attempt.actualMatchedPair = {
      pairCost: actualPairCost,
      lockedProfitEstimate: attempt.filled.matched * (1 - actualPairCost),
    };
  }

  if (imbalance >= IMBALANCE_DUST_SHARES) {
    const side = upFilled > downFilled ? "up" : "down";
    const tokenId = side === "up" ? pair.market.upTokenId : pair.market.downTokenId;
    const fillPrice = side === "up" ? (actualFillPrices.up || pair.quote.upPrice) : (actualFillPrices.down || pair.quote.downPrice);
    const completion = await tryCompleteImbalance(client, address, pair.market, side, fillPrice, imbalance);
    attempt.completion = completion;
    latest = await currentFilled(address, pair.market, pair.before);
    upFilled = latest.filled.up;
    downFilled = latest.filled.down;
    imbalance = roundShares(Math.abs(upFilled - downFilled));
    attempt.afterCompletion = latest.balances;
    attempt.filledAfterCompletion = {
      up: upFilled,
      down: downFilled,
      matched: Math.min(upFilled, downFilled),
      imbalance,
      imbalanceSide: upFilled > downFilled ? "up" : downFilled > upFilled ? "down" : null,
    };
  }

  if (imbalance >= IMBALANCE_DUST_SHARES) {
    const side = upFilled > downFilled ? "up" : "down";
    const tokenId = side === "up" ? pair.market.upTokenId : pair.market.downTokenId;
    const fillPrice = side === "up" ? (actualFillPrices.up || pair.quote.upPrice) : (actualFillPrices.down || pair.quote.downPrice);
    log(`loop imbalance ${side}=${imbalance}; exiting naked side`);
    attempt.nuclearStop = {
      side,
      tokenId,
      fillPrice,
      attemptedShares: imbalance,
      ...(await nuclearStopExit(client, address, tokenId, fillPrice, imbalance)),
    };
    latest = await waitForSettledFilled(address, pair.market, pair.before, 6_000);
    upFilled = latest.filled.up;
    downFilled = latest.filled.down;
    imbalance = roundShares(Math.abs(upFilled - downFilled));
    attempt.afterNuclearStop = latest.balances;
    attempt.filledAfterNuclearStop = {
      up: upFilled,
      down: downFilled,
      matched: Math.min(upFilled, downFilled),
      imbalance,
      imbalanceSide: upFilled > downFilled ? "up" : downFilled > upFilled ? "down" : null,
    };
  }

  const openOrders = await client.getOpenOrders() as any[];
  attempt.finalOpenOrders = openOrders.filter((o: any) => (
    o.market === pair.market.conditionId
    || o.asset_id === pair.market.upTokenId
    || o.asset_id === pair.market.downTokenId
  ));
  appendJsonl(ATTEMPTS_PATH, attempt);
  const finalMatched = Math.min(upFilled, downFilled);
  log(`loop result filled up=${upFilled} down=${downFilled} matched=${finalMatched} imbalance=${imbalance}`);
  if (finalMatched < IMBALANCE_DUST_SHARES && imbalance < IMBALANCE_DUST_SHARES) return "NO_FILL";
  if (finalMatched > 0 && imbalance < IMBALANCE_DUST_SHARES && (attempt.actualMatchedPair?.lockedProfitEstimate ?? 0) > 0) {
    return "REAL_ARB_FILL";
  }
  if (attempt.nuclearStop?.status === "sold") return "NUCLEAR_EXIT";
  return "UNACCEPTABLE";
}

async function loopLiveMain() {
  const clob = await clobClient();
  const client = clob.client;
  const address = POLYMARKET_FUNDER_ADDRESS ?? clob.signer.address;
  const startedMs = Date.now();
  let idleStartedMs = Date.now();
  let market: TrackedMarket | null = null;
  let userWs: WebSocket | null = null;
  let marketWs: WebSocket | null = null;
  let activePair: LoopPair | null = null;

  const shutdown = async () => {
    if (activePair) {
      try { await cancelLoopPair(client, activePair); }
      catch (err: any) { log(`loop shutdown cancel warning: ${err?.message ?? String(err)}`); }
    }
    userWs?.close();
    marketWs?.close();
  };
  process.once("SIGINT", () => { shutdown().finally(() => process.exit(130)); });
  process.once("SIGTERM", () => { shutdown().finally(() => process.exit(143)); });

  log(`${LOOP_LIVE ? "loop-live" : "loop-dry-run"} starting BTC-only refreshMs=${LOOP_REFRESH_MS} maxMs=${LOOP_MAX_MS} maxNotional=$${MAX_TEST_PAIR_NOTIONAL_USD}`);

  while (Date.now() - startedMs < LOOP_MAX_MS) {
    if (LOOP_MAX_IDLE_MS > 0 && Date.now() - idleStartedMs > LOOP_MAX_IDLE_MS) {
      log(`loop idle timeout ${LOOP_MAX_IDLE_MS}ms`);
      break;
    }
    if (!market || (secondsToEnd(market.endDate) ?? 0) < LOOP_MIN_SECONDS_TO_END) {
      if (activePair) {
        await cancelLoopPair(client, activePair);
        activePair = null;
      }
      userWs?.close();
      userWs = null;
      marketWs?.close();
      marketWs = null;
      market = await discoverBtcMarket();
      if (!market) {
        await sleep(LOOP_REFRESH_MS);
        continue;
      }
      marketWs = await connectMarketWs(market);
      userWs = await connectUserWs(clob, market.conditionId);
      await Promise.all([tickSize(client, market.upTokenId), tickSize(client, market.downTokenId)]);
      log(`loop tracking ${market.slug} secondsToEnd=${secondsToEnd(market.endDate)?.toFixed(1) ?? "?"} marketWs=${marketWs?.readyState === WebSocket.OPEN} cacheAges=${Math.round(cacheAgeMs(market.upTokenId))}/${Math.round(cacheAgeMs(market.downTokenId))}ms`);
    }

    const firstFill = activePair
      ? findOwnFill([market.upTokenId, market.downTokenId], [activePair.orderIds.up, activePair.orderIds.down].filter(isString))
      : null;
    if (activePair && firstFill) {
      const classification = await finalizeLoopPair(client, address, activePair, firstFill, userWs);
      log(`loop terminal classification=${classification}`);
      userWs?.close();
      marketWs?.close();
      return;
    }

    let quote: QuotePlan;
    try {
      quote = await quotePlanForMarket(market);
    } catch (err: any) {
      if (activePair) {
        const firstFill = findOwnFill([market.upTokenId, market.downTokenId], [activePair.orderIds.up, activePair.orderIds.down].filter(isString));
        const classification = await finalizeLoopPair(client, address, activePair, firstFill, userWs);
        if (classification !== "NO_FILL") {
          log(`loop terminal classification=${classification}`);
          userWs?.close();
          marketWs?.close();
          return;
        }
        activePair = null;
      }
      log(`loop skip ${market.slug}: ${err?.message ?? String(err)}`);
      await sleep(LOOP_REFRESH_MS);
      continue;
    }

    if (!activePair) {
      if (!LOOP_LIVE) {
        log(`loop dry quote ${market.slug} up=${quote.upPrice.toFixed(4)} down=${quote.downPrice.toFixed(4)} sum=${quote.pairCost.toFixed(4)} shares=${quote.shares.toFixed(2)}`);
        await sleep(LOOP_REFRESH_MS);
        continue;
      }
      try {
        activePair = await postLoopPair(client, address, market, quote);
        idleStartedMs = Date.now();
      } catch (err: any) {
        log(`loop post skipped: ${err?.message ?? String(err)}`);
        await sleep(LOOP_REFRESH_MS);
      }
      continue;
    }

    if (quoteChanged(activePair.quote, quote)) {
      const firstFill = findOwnFill([market.upTokenId, market.downTokenId], [activePair.orderIds.up, activePair.orderIds.down].filter(isString));
      const classification = await finalizeLoopPair(client, address, activePair, firstFill, userWs);
      if (classification !== "NO_FILL") {
        log(`loop terminal classification=${classification}`);
        userWs?.close();
        marketWs?.close();
        return;
      }
      activePair = null;
      if (!LOOP_LIVE) {
        await sleep(LOOP_REFRESH_MS);
        continue;
      }
      try {
        activePair = await postLoopPair(client, address, market, quote);
        idleStartedMs = Date.now();
      } catch (err: any) {
        log(`loop replace skipped: ${err?.message ?? String(err)}`);
        await sleep(LOOP_REFRESH_MS);
      }
      continue;
    }

    await sleep(LOOP_REFRESH_MS);
  }

  await shutdown();
  log("loop-live ended without terminal fill");
}

async function main() {
  const markets = await discoverMarkets();
  const candidateMarkets = TARGET_SLUG
    ? markets.filter((row) => row.slug === TARGET_SLUG)
    : markets.filter((row) => !TARGET_CONTAINS || row.slug.includes(TARGET_CONTAINS));
  if (!candidateMarkets.length) {
    throw new Error(`no active 5m market found targetSlug=${TARGET_SLUG || "none"} contains=${TARGET_CONTAINS}`);
  }

  let selected: { market: TrackedMarket; upTop: Top; downTop: Top; upPrice: number; downPrice: number; pairCost: number } | null = null;
  const skips: string[] = [];
  for (const candidateMarket of candidateMarkets) {
    try {
      const [candidateUpTop, candidateDownTop] = await Promise.all([
        fetchTop(candidateMarket.upTokenId),
        fetchTop(candidateMarket.downTokenId),
      ]);
      const candidateUpPrice = dynamicBid(candidateUpTop, "up");
      const candidateDownPrice = dynamicBid(candidateDownTop, "down");
      const candidatePairCost = candidateUpPrice + candidateDownPrice;
      if (candidatePairCost >= MAX_PAIR_COST) {
        skips.push(`${candidateMarket.slug}: sum=${candidatePairCost.toFixed(4)} >= ${MAX_PAIR_COST.toFixed(4)}`);
        continue;
      }
      const crossBlock = complementCrossBlock(candidateUpPrice, candidateDownPrice, candidateUpTop, candidateDownTop);
      if (crossBlock) {
        skips.push(`${candidateMarket.slug}: ${crossBlock}`);
        continue;
      }
      const candidateShares = Math.max(
        minValidShares(candidateUpPrice, candidateUpTop.minOrderSize),
        minValidShares(candidateDownPrice, candidateDownTop.minOrderSize),
      );
      const candidateNotional = candidateShares * candidatePairCost;
      if (candidateNotional > MAX_TEST_PAIR_NOTIONAL_USD + 1e-12) {
        skips.push(`${candidateMarket.slug}: minPairNotional=$${candidateNotional.toFixed(2)} > maxTest=$${MAX_TEST_PAIR_NOTIONAL_USD.toFixed(2)}`);
        continue;
      }
      selected = {
        market: candidateMarket,
        upTop: candidateUpTop,
        downTop: candidateDownTop,
        upPrice: candidateUpPrice,
        downPrice: candidateDownPrice,
        pairCost: candidatePairCost,
      };
      break;
    } catch (err: any) {
      skips.push(`${candidateMarket.slug}: ${err?.message ?? String(err)}`);
    }
  }
  if (!selected) {
    throw new Error(`no safe maker-guess market found: ${skips.slice(0, 5).join(" | ")}`);
  }
  let { market, upTop, downTop, upPrice, downPrice, pairCost } = selected;
  let shares = Math.max(
    minValidShares(upPrice, upTop.minOrderSize),
    minValidShares(downPrice, downTop.minOrderSize),
  );
  const attempt: any = {
    id: `UPDOWN-MAKER-GUESS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    mode: LIVE ? "LIVE" : "DRY_RUN",
    market,
    pricingMode: PRICE_OVERRIDE ? "fixed" : "dynamic_book",
    prices: { up: upPrice, down: downPrice, pairCost },
    shares,
    notional: {
      up: Number((upPrice * shares).toFixed(4)),
      down: Number((downPrice * shares).toFixed(4)),
      total: Number((pairCost * shares).toFixed(4)),
    },
    theoreticalPairEdge: Number(((1 - pairCost) * shares).toFixed(4)),
    secondsToEnd: secondsToEnd(market.endDate),
    beforeBook: { up: upTop, down: downTop },
  };
  log(`${attempt.mode} ${market.slug} bid up=${upPrice.toFixed(4)} down=${downPrice.toFixed(4)} sum=${pairCost.toFixed(4)} x ${shares.toFixed(2)} shares holdMs=${HOLD_MS}`);
  log(`notional up=$${attempt.notional.up.toFixed(2)} down=$${attempt.notional.down.toFixed(2)} total=$${attempt.notional.total.toFixed(2)} theoretical pair edge=$${attempt.theoreticalPairEdge.toFixed(4)}`);

  if (!LIVE) {
    appendJsonl(ATTEMPTS_PATH, attempt);
    log(`dry-run only. Re-run with --live to place/cancel the minimum-size GTC test.`);
    return;
  }

  const clob = await clobClient();
  const address = POLYMARKET_FUNDER_ADDRESS ?? clob.signer.address;
  attempt.walletAddress = address;
  const userWs = await connectUserWs(clob, market.conditionId);
  attempt.userWs = { connected: userWs?.readyState === WebSocket.OPEN, conditionId: market.conditionId };
  const tickWarmStartedMs = Date.now();
  await Promise.all([tickSize(clob.client, market.upTokenId), tickSize(clob.client, market.downTokenId)]);
  attempt.tickWarmMs = Date.now() - tickWarmStartedMs;
  const [beforeUp, beforeDown] = await Promise.all([
    reconcileTokenBalance(address, market.upTokenId),
    reconcileTokenBalance(address, market.downTokenId),
  ]);
  attempt.before = { up: beforeUp, down: beforeDown };
  if (beforeUp >= IMBALANCE_DUST_SHARES || beforeDown >= IMBALANCE_DUST_SHARES) {
    attempt.preExistingPositionBlock = {
      up: beforeUp,
      down: beforeDown,
      matched: Math.min(beforeUp, beforeDown),
      imbalance: Math.abs(beforeUp - beforeDown),
    };
    appendJsonl(ATTEMPTS_PATH, attempt);
    userWs?.close();
    throw new Error(`pre_existing_5m_position up=${beforeUp} down=${beforeDown}`);
  }

  const [preSubmitUpTop, preSubmitDownTop] = await Promise.all([
    fetchTop(market.upTokenId),
    fetchTop(market.downTokenId),
  ]);
  const preSubmitUpPrice = dynamicBid(preSubmitUpTop, "up_pre_submit");
  const preSubmitDownPrice = dynamicBid(preSubmitDownTop, "down_pre_submit");
  const preSubmitPairCost = preSubmitUpPrice + preSubmitDownPrice;
  const preSubmitCrossBlock = complementCrossBlock(preSubmitUpPrice, preSubmitDownPrice, preSubmitUpTop, preSubmitDownTop);
  if (preSubmitPairCost >= MAX_PAIR_COST) {
    throw new Error(`pre_submit_edge_gone sum=${preSubmitPairCost.toFixed(4)} >= ${MAX_PAIR_COST.toFixed(4)}`);
  }
  if (preSubmitCrossBlock) {
    throw new Error(`pre_submit_cross_block ${preSubmitCrossBlock}`);
  }
  const preSubmitShares = Math.max(
    minValidShares(preSubmitUpPrice, preSubmitUpTop.minOrderSize),
    minValidShares(preSubmitDownPrice, preSubmitDownTop.minOrderSize),
  );
  const preSubmitNotional = preSubmitShares * preSubmitPairCost;
  if (preSubmitNotional > MAX_TEST_PAIR_NOTIONAL_USD + 1e-12) {
    throw new Error(`pre_submit_minPairNotional=$${preSubmitNotional.toFixed(2)} > maxTest=$${MAX_TEST_PAIR_NOTIONAL_USD.toFixed(2)}`);
  }
  attempt.initialSelection = {
    prices: attempt.prices,
    shares: attempt.shares,
    notional: attempt.notional,
    beforeBook: attempt.beforeBook,
  };
  upTop = preSubmitUpTop;
  downTop = preSubmitDownTop;
  upPrice = preSubmitUpPrice;
  downPrice = preSubmitDownPrice;
  pairCost = preSubmitPairCost;
  shares = preSubmitShares;
  attempt.beforeBook = { up: upTop, down: downTop };
  attempt.prices = { up: upPrice, down: downPrice, pairCost };
  attempt.shares = shares;
  attempt.notional = {
    up: Number((upPrice * shares).toFixed(4)),
    down: Number((downPrice * shares).toFixed(4)),
    total: Number((pairCost * shares).toFixed(4)),
  };
  attempt.theoreticalPairEdge = Number(((1 - pairCost) * shares).toFixed(4));
  log(`pre-submit ${market.slug} bid up=${upPrice.toFixed(4)} down=${downPrice.toFixed(4)} sum=${pairCost.toFixed(4)} x ${shares.toFixed(2)} shares`);

  fillSignals.length = 0;
  const submitStartedMs = Date.now();
  const [upResp, downResp] = await postLimitBuyPair(clob.client, [
    { tokenId: market.upTokenId, price: upPrice, shares },
    { tokenId: market.downTokenId, price: downPrice, shares },
  ]);
  attempt.latency = { submitPairMs: Date.now() - submitStartedMs };
  attempt.responses = { up: upResp, down: downResp };
  attempt.orderIds = { up: orderId(upResp), down: orderId(downResp) };
  try {
    assertOrderResponse(upResp, "maker_guess_up");
    assertOrderResponse(downResp, "maker_guess_down");
  } catch (err: any) {
    attempt.submitError = err?.message ?? String(err);
    attempt.submitCleanup = await Promise.all(
      [attempt.orderIds.up, attempt.orderIds.down]
        .filter(Boolean)
        .map((id: string) => cancelOrderTimed(clob.client, id)),
    );
    appendJsonl(ATTEMPTS_PATH, attempt);
    userWs?.close();
    throw err;
  }
  log(`posted orderIds up=${attempt.orderIds.up ?? "?"} down=${attempt.orderIds.down ?? "?"}`);

  const fillWaitStartedMs = Date.now();
  const firstFill = await waitForOwnFill(
    [market.upTokenId, market.downTokenId],
    [attempt.orderIds.up, attempt.orderIds.down].filter(Boolean),
    HOLD_MS,
  );
  attempt.firstFillSignal = firstFill;
  attempt.latency.firstFillWaitMs = Date.now() - fillWaitStartedMs;
  if (firstFill) {
    const reactiveStartedMs = Date.now();
    const reactiveCompletion: any = await tryReactiveCompletion(clob.client, market, firstFill, attempt.orderIds);
    attempt.reactiveCompletion = reactiveCompletion;
    attempt.latency.reactiveCompletionMs = Date.now() - reactiveStartedMs;
    if (reactiveCompletion.action === "fak_buy") {
      const price = typeof reactiveCompletion.buyPrice === "number" ? reactiveCompletion.buyPrice.toFixed(4) : reactiveCompletion.complementAsk;
      log(`reactive completion ${reactiveCompletion.complementSide} bought=${reactiveCompletion.bought ?? "?"} price=${price}`);
    } else {
      log(`reactive completion skipped action=${reactiveCompletion.action} reason=${reactiveCompletion.reason ?? "none"} ask=${reactiveCompletion.complementAsk ?? "?"} max=${reactiveCompletion.maxComplementPrice ?? "?"}`);
    }
  }
  let latest = await currentFilled(address, market, { up: beforeUp, down: beforeDown });
  const matchedNow = Math.min(latest.filled.up, latest.filled.down);
  const imbalanceNow = roundShares(Math.abs(latest.filled.up - latest.filled.down));
  attempt.fillCheck = {
    at: new Date().toISOString(),
    filled: latest.filled,
    matched: matchedNow,
    imbalance: imbalanceNow,
    signalCount: fillSignals.length,
  };
  if (imbalanceNow >= IMBALANCE_DUST_SHARES) {
    log(`detected one-sided fill up=${latest.filled.up} down=${latest.filled.down}; cancelling and attempting completion`);
  }

  const cancelStartedMs = Date.now();
  const cancelResults = await Promise.all(
    [attempt.orderIds.up, attempt.orderIds.down]
      .filter(Boolean)
      .map((id: string) => cancelOrderTimed(clob.client, id)),
  );
  attempt.cancels = cancelResults;
  attempt.latency.cancelAllMs = Date.now() - cancelStartedMs;
  for (const result of cancelResults) {
    log(`${result.ok ? "cancelled" : "cancel warning"} ${result.orderID}${result.error ? `: ${result.error}` : ""}`);
  }

  latest = await waitForSettledFilled(
    address,
    market,
    { up: beforeUp, down: beforeDown },
    firstFill ? 6_000 : 1_000,
  );
  let upFilled = latest.filled.up;
  let downFilled = latest.filled.down;
  const matched = Math.min(upFilled, downFilled);
  let imbalance = roundShares(Math.abs(upFilled - downFilled));
  const actualFillPrices = {
    up: upFilled > 0 ? averageBuyPrice(upResp, upPrice) : 0,
    down: downFilled > 0 ? averageBuyPrice(downResp, downPrice) : 0,
  };
  attempt.after = latest.balances;
  attempt.filled = {
    up: upFilled,
    down: downFilled,
    matched,
    imbalance,
    imbalanceSide: upFilled > downFilled ? "up" : downFilled > upFilled ? "down" : null,
    actualFillPrices,
  };
  if (matched > 0) {
    const actualPairCost = actualFillPrices.up + actualFillPrices.down;
    attempt.actualMatchedPair = {
      pairCost: actualPairCost,
      lockedProfitEstimate: matched * (1 - actualPairCost),
    };
  }

  if (imbalance >= IMBALANCE_DUST_SHARES) {
    const side = upFilled > downFilled ? "up" : "down";
    const tokenId = side === "up" ? market.upTokenId : market.downTokenId;
    const fillPrice = side === "up" ? actualFillPrices.up : actualFillPrices.down;
    const completion = await tryCompleteImbalance(clob.client, address, market, side, fillPrice, imbalance);
    attempt.completion = completion;
    latest = await currentFilled(address, market, { up: beforeUp, down: beforeDown });
    upFilled = latest.filled.up;
    downFilled = latest.filled.down;
    imbalance = roundShares(Math.abs(upFilled - downFilled));
    attempt.afterCompletion = latest.balances;
    attempt.filledAfterCompletion = {
      up: upFilled,
      down: downFilled,
      matched: Math.min(upFilled, downFilled),
      imbalance,
      imbalanceSide: upFilled > downFilled ? "up" : downFilled > upFilled ? "down" : null,
    };
  }

  if (imbalance >= IMBALANCE_DUST_SHARES) {
    const side = upFilled > downFilled ? "up" : "down";
    const tokenId = side === "up" ? market.upTokenId : market.downTokenId;
    const fillPrice = side === "up" ? (actualFillPrices.up || upPrice) : (actualFillPrices.down || downPrice);
    log(`imbalance ${side}=${imbalance}; arming nuclear stop at ${(fillPrice - NUCLEAR_STOP_CENTS).toFixed(4)}`);
    attempt.nuclearStop = {
      side,
      tokenId,
      fillPrice,
      attemptedShares: imbalance,
      ...(await nuclearStopExit(clob.client, address, tokenId, fillPrice, imbalance)),
    };
    latest = await currentFilled(address, market, { up: beforeUp, down: beforeDown });
    upFilled = latest.filled.up;
    downFilled = latest.filled.down;
    imbalance = roundShares(Math.abs(upFilled - downFilled));
    attempt.afterNuclearStop = latest.balances;
    attempt.filledAfterNuclearStop = {
      up: upFilled,
      down: downFilled,
      matched: Math.min(upFilled, downFilled),
      imbalance,
      imbalanceSide: upFilled > downFilled ? "up" : downFilled > upFilled ? "down" : null,
    };
  }

  appendJsonl(ATTEMPTS_PATH, attempt);
  const finalMatched = Math.min(upFilled, downFilled);
  log(`result filled up=${upFilled} down=${downFilled} matched=${finalMatched} imbalance=${imbalance}`);
  if (finalMatched > 0) log(`matched pair theoretical floor profit=${(finalMatched * (1 - pairCost)).toFixed(4)}`);
  userWs?.close();
}

(LOOP_MODE ? loopLiveMain() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
