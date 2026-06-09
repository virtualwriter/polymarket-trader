// Always-on, websocket-driven monotonic-arb daemon (Japan host).
//
// Design goals (see plan "Japan Always-On Websocket Arb Daemon"):
//   - React to order-book changes in real time on a fixed watchlist, evaluating
//     the arb gate many times per second purely in memory (no REST on the hot
//     path).
//   - Keep Polygon RPC off the hot path: balance/allowance checked at startup
//     and periodically via the multi-RPC failover provider; fills sized from the
//     User websocket (with an on-chain reconcile as the authority/fallback).
//   - Reuse the proven execution primitives from the hourly executor so order
//     signing, sizing, ledgering and reconciliation stay a single source of
//     truth.
//
// This is the SINGLE real-PM executor on Japan: the hourly
// polymarket-real-executor.timer must be disabled so packages are not double
// submitted.

import { webcrypto } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { OrderType, Side, type TickSize } from "@polymarket/clob-client-v2";
import { VpnGuard } from "../engine-src/live/VpnGuard.js";
import {
  type Candidate,
  type Direction,
  type GammaEvent,
  type MarketQuote,
  EPSILON,
  evaluatePair,
  fetchBook,
  fetchEvent,
  fetchJson,
  findCandidates,
  marketQuote,
  polymarketAssetForSlug,
} from "./lib/monotonic-arb-core.js";
import {
  arbConfig,
  appendJsonArray,
  assertOrderResponse,
  clobClient,
  eventSlugs,
  type LiveOrder,
  type LivePackage,
  ENABLED,
  HARD_DISABLED,
  FILL_WAIT_MS,
  MAX_DAILY_USD,
  MAX_OPEN_PACKAGES,
  MAX_PACKAGE_USD,
  MIN_AVAILABLE_SHARES,
  MIN_EDGE,
  MIN_ORDER_SHARES,
  MAX_SPREAD,
  ORDERS_PATH,
  PACKAGES_PATH,
  POLYMARKET_FUNDER_ADDRESS,
  SKIP_VPN,
  SOCKS_PROXY,
  orderId,
  packageRecord,
  postFakBuy,
  postLimitBuy,
  postLimitSell,
  postFakSell,
  proxyCollateralProbe,
  readJsonArray,
  reconcileTokenBalance,
  roundShares,
  sizeForCandidate,
  writeJsonArray,
} from "./polymarket-real-monotonic-executor.js";

// clob-client signs L2 requests via globalThis.crypto.subtle; Node 18 needs the
// polyfill before any CLOB call (same as the hourly executor).
if (!globalThis.crypto) (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });
const require = createRequire(import.meta.url);

const HOST = process.env.POLYMARKET_CLOB_HOST ?? "https://clob.polymarket.com";
const GAMMA_API = process.env.GAMMA_API ?? "https://gamma-api.polymarket.com";
const MARKET_WS_URL = process.env.POLYMARKET_MARKET_WS_URL ?? "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const USER_WS_URL = process.env.POLYMARKET_USER_WS_URL ?? "wss://ws-subscriptions-clob.polymarket.com/ws/user";

const DRY_RUN = process.argv.includes("--dry-run")
  || process.env.MONOTONIC_ARB_REAL_PM_DRY_RUN === "1"
  || !ENABLED
  || HARD_DISABLED;

// Daemon-specific tunables (safe defaults; all overridable via env).
const WATCHLIST_REFRESH_MS = Number(process.env.ARB_DAEMON_WATCHLIST_REFRESH_MS ?? 300_000);
const BALANCE_REFRESH_MS = Number(process.env.ARB_DAEMON_BALANCE_REFRESH_MS ?? 300_000);
const LEDGER_FLUSH_MS = Number(process.env.ARB_DAEMON_LEDGER_FLUSH_MS ?? 120_000);
const PING_MS = Number(process.env.ARB_DAEMON_PING_MS ?? 10_000);
const FILL_WAIT_DAEMON_MS = Number(process.env.ARB_DAEMON_FILL_WAIT_MS ?? FILL_WAIT_MS);
const MAX_PER_MIN = Number(process.env.ARB_DAEMON_MAX_PER_MIN ?? 6);
const RECONNECT_BASE_MS = Number(process.env.ARB_DAEMON_RECONNECT_BASE_MS ?? 1_000);
const RECONNECT_MAX_MS = Number(process.env.ARB_DAEMON_RECONNECT_MAX_MS ?? 30_000);
const BOOK_FETCH_TIMEOUT_MS = Number(process.env.ARB_DAEMON_BOOK_FETCH_TIMEOUT_MS ?? 8_000);
const GIT_PUSH = process.env.ARB_DAEMON_GIT_PUSH === "1";
const HTTP_KEEP_ALIVE = process.env.ARB_DAEMON_HTTP_KEEP_ALIVE !== "0";
const MONOTONIC_POST_MODE = (process.env.ARB_DAEMON_POST_MODE ?? "batch").toLowerCase();
const RESPONSE_FILL_FIRST = process.env.ARB_DAEMON_RESPONSE_FILL_FIRST !== "0";
// NBA live markets use a single CLOB batch request for the two FAK BUY legs.
// This is the tightest API-supported coupling available; the exchange still
// reports per-order fills, so orphan/no-loss handling remains the final guard.
const ENABLE_NBA_BATCH_EXECUTION = process.env.ARB_DAEMON_ENABLE_NBA_BATCH_EXECUTION !== "0";
const ALLOW_NBA_NON_ATOMIC_EXECUTION = process.env.ARB_DAEMON_ALLOW_NBA_NON_ATOMIC_EXECUTION === "1";
const NBA_LEDGER_ARCHIVE_GRACE_MS = Number(process.env.ARB_DAEMON_NBA_LEDGER_ARCHIVE_GRACE_MS ?? 30 * 60_000);
const DISCOVER_NBA_GAMES = process.env.ARB_DAEMON_DISCOVER_NBA_GAMES !== "0";
const DISCOVER_MLB_GAMES = process.env.ARB_DAEMON_DISCOVER_MLB_GAMES !== "0";
const SPORTS_DISCOVERY_LIMIT = Number(process.env.ARB_DAEMON_SPORTS_DISCOVERY_LIMIT ?? process.env.ARB_DAEMON_MLB_DISCOVERY_LIMIT ?? 500);
const LEDGER_ARCHIVE_DIR = join(dirname(PACKAGES_PATH), "archive");

// Near-miss telemetry: proves whether the daemon is barely missing executable
// arbs or the ladder is simply not offering them. This is telemetry only; entry
// still flows exclusively through the normal execution gate below.
const NEAR_MISS_LOG_MS = Number(process.env.ARB_DAEMON_NEAR_MISS_LOG_MS ?? 60_000);
const NEAR_MISS_TOP_N = Number(process.env.ARB_DAEMON_NEAR_MISS_TOP_N ?? 5);
const MIN_MARKETABLE_BUY_USD = Number(process.env.MONOTONIC_ARB_REAL_PM_MIN_MARKETABLE_BUY_USD ?? 1);
// Live sports books move far faster than the macro/crypto ladders. Keep the
// base monotonic arb behavior unchanged for non-sports, but require sports
// packages to survive a fresh book pull, deeper displayed depth, and worse
// limit prices before sending separate FAK legs.
const SPORTS_MIN_EDGE = Number(process.env.ARB_DAEMON_SPORTS_MIN_EDGE ?? 0);
const SPORTS_MIN_AVAILABLE_SHARES = Number(process.env.ARB_DAEMON_SPORTS_MIN_AVAILABLE_SHARES ?? 50);
const SPORTS_MAX_SPREAD = Number(process.env.ARB_DAEMON_SPORTS_MAX_SPREAD ?? 0.02);
const SPORTS_PRICE_SLIPPAGE = Number(process.env.ARB_DAEMON_SPORTS_PRICE_SLIPPAGE ?? 0);
const SPORTS_BALANCE_HEADROOM_USD = Number(process.env.ARB_DAEMON_SPORTS_BALANCE_HEADROOM_USD ?? 0.5);
const SPORTS_BALANCE_HEADROOM_MULTIPLIER = Number(process.env.ARB_DAEMON_SPORTS_BALANCE_HEADROOM_MULTIPLIER ?? 1.03);
// 0 means live sports are allowed after the scheduled start/endDate. Set a
// positive value to block entries within that many ms before start.
const SPORTS_ENTRY_CUTOFF_MS = Number(process.env.ARB_DAEMON_SPORTS_ENTRY_CUTOFF_MS ?? 0);
// Do not consume the full displayed sports touch. We require reserve depth so
// fast-moving live books are less likely to produce one-sided partial fills.
const SPORTS_DEPTH_RESERVE_MULTIPLIER = Number(process.env.ARB_DAEMON_SPORTS_DEPTH_RESERVE_MULTIPLIER ?? 3);
const NON_SPORTS_EXCHANGE_MIN_BUFFER_SHARES = Number(process.env.ARB_DAEMON_NON_SPORTS_EXCHANGE_MIN_BUFFER_SHARES ?? 25);
const STALE_SUBMITTED_MS = Number(process.env.ARB_DAEMON_STALE_SUBMITTED_MS ?? 600_000);
const HL_API = process.env.HYPERLIQUID_INFO_API ?? "https://api.hyperliquid.xyz/info";
const SPOT_REFRESH_MS = Number(process.env.ARB_DAEMON_SPOT_REFRESH_MS ?? 60_000);
const JUNE_BREAKEVEN_EPSILON = Number(process.env.ARB_DAEMON_JUNE_BREAKEVEN_EPSILON ?? 0.00001);
const JUNE_BREAKEVEN_COMMODITY_MAX_DISTANCE = Number(process.env.ARB_DAEMON_JUNE_BREAKEVEN_COMMODITY_MAX_DISTANCE ?? 0.10);
const JUNE_BREAKEVEN_CRYPTO_MAX_DISTANCE = Number(process.env.ARB_DAEMON_JUNE_BREAKEVEN_CRYPTO_MAX_DISTANCE ?? 0.15);
const NEAR_MISS_BUCKETS = [
  { label: "cost<=0.9995", cost: 0.9995 },
  { label: "cost<=1.0000", cost: 1.0000 },
  { label: "cost<=1.0010", cost: 1.0010 },
  { label: "cost<=1.0020", cost: 1.0020 },
  { label: "cost<=1.0050", cost: 1.0050 },
] as const;

// ─── Orphan completion / unwind tunables ───
// A naked leg (one FAK fills, the other is killed) is NOT held to a directional
// resolution. We try to RE-PAIR it across the same event's live ladder into a
// positive-EV monotonic package; if that is impossible (ladder shrank, price ran
// away, or we hit the deadline) we FAK-sell the orphan to flatten.
// Cadence of the orphan completion/unwind sweep.
const ORPHAN_POLL_MS = Number(process.env.ARB_DAEMON_ORPHAN_POLL_MS ?? 1_000);
// Tight price stop: unwind the instant the orphan's best bid drops this many
// cents below our fill (the dominant guard — bounds directional bleed hard).
const ORPHAN_STOP_CENTS = Number(process.env.ARB_DAEMON_ORPHAN_STOP_CENTS ?? 0.01);
// Default to zero tolerated orphan unwind loss. Set explicitly only if the
// operator decides a small loss is better than carrying directional risk.
const ORPHAN_MAX_UNWIND_LOSS_CENTS = Number(process.env.ARB_DAEMON_ORPHAN_MAX_UNWIND_LOSS_CENTS ?? 0);
// Completion is positive-EV (a real arb) only if fillPrice + complementAsk is
// below 1 by at least this margin (survives slippage).
const ORPHAN_COMPLETION_MARGIN = Number(process.env.ARB_DAEMON_ORPHAN_COMPLETION_MARGIN ?? 0.01);
const NON_SPORTS_ORPHAN_COMPLETION_MARGIN = Number(process.env.ARB_DAEMON_NON_SPORTS_ORPHAN_COMPLETION_MARGIN ?? 0);
// Force-unwind this long before the orphan market's own expiry (so we never
// roll into a directional settlement). Default 10 min.
const ORPHAN_EXPIRY_BUFFER_MS = Number(process.env.ARB_DAEMON_ORPHAN_EXPIRY_BUFFER_MS ?? 600_000);
// Throttle the live event re-fetch per orphan (the completion ladder source).
const ORPHAN_LADDER_REFRESH_MS = Number(process.env.ARB_DAEMON_ORPHAN_LADDER_REFRESH_MS ?? 5_000);
// Smallest residual orphan we bother completing/holding; below this we just
// unwind the dust.
const ORPHAN_MIN_SHARES = Number(process.env.ARB_DAEMON_ORPHAN_MIN_SHARES ?? MIN_ORDER_SHARES);
// Sports imbalances should be dust-only. Anything larger is flattened immediately
// instead of entering the normal orphan completion loop.
const SPORTS_ORPHAN_DUST_SHARES = Number(process.env.ARB_DAEMON_SPORTS_ORPHAN_DUST_SHARES ?? 0.01);
const MAX_NAKED_SHARES_BEFORE_PAUSE = Number(process.env.ARB_DAEMON_MAX_NAKED_SHARES_BEFORE_PAUSE ?? SPORTS_ORPHAN_DUST_SHARES);
const DUST_EXIT_LIMIT_WAIT_MS = Number(process.env.ARB_DAEMON_DUST_EXIT_LIMIT_WAIT_MS ?? 5_000);
const DUST_EXIT_RETRY_MS = Number(process.env.ARB_DAEMON_DUST_EXIT_RETRY_MS ?? 60_000);
const ORPHANS_PATH = join(dirname(PACKAGES_PATH), "polymarket-live-orphans.json");
const PAUSE_PATH = join(dirname(PACKAGES_PATH), "polymarket-arb-daemon-paused.json");
const QUARANTINE_PATH = join(dirname(PACKAGES_PATH), "polymarket-arb-daemon-quarantine.json");

type PriceLevels = { bids: Map<number, number>; asks: Map<number, number> };
type TopOfBook = { ask: number; askSize: number; bid: number; bidSize: number; spread: number };

interface WatchPackage {
  key: string;
  base: Candidate;
  broadYesToken: string;
  narrowNoToken: string;
  narrowYesToken: string;
}

interface LiveLegs {
  broadYesAsk: number;
  broadYesAskSize: number;
  broadSpread: number;
  narrowNoAsk: number;
  narrowNoAskSize: number;
  narrowSpread: number;
}

interface NearMissSample {
  packageId: string;
  eventSlug: string;
  asset: string;
  broadStrike: number;
  narrowStrike: number;
  cost: number;
  edge: number;
  availableSize: number;
  maxSpread: number;
  minShares: number;
  rangeBlock: string | null;
  edgeOk: boolean;
  spreadOk: boolean;
  sizeOk: boolean;
  executableGate: boolean;
}

// A naked leg awaiting re-pair or unwind. `role` is which leg of the original
// package actually filled (and is therefore the position we now hold):
//   broad_yes -> we hold YES(strike); complement is a NO at a more-extreme strike
//   narrow_no -> we hold NO(strike);  complement is a YES at a less-extreme strike
type OrphanStatus = "completing" | "completed" | "unwound" | "stranded";
interface Orphan {
  id: string;
  packageId: string;        // original package this leg came from
  eventSlug: string;
  asset: string;
  direction: Direction;
  role: "broad_yes" | "narrow_no";
  marketId: string;         // the orphan leg's own market
  tokenId: string;          // the token we are actually holding
  strike: number;
  fillPrice: number;        // p1 — sunk cost per share
  shares: number;           // remaining naked shares to cover
  endDate: string | null;   // orphan market expiry T
  resolutionSource: string;
  createdAt: string;
  updatedAt: string;
  status: OrphanStatus;
  attempts: number;
  note?: string;
}

interface QuarantineEntry {
  quarantinedAt: string;
  reason: string;
  packageId: string;
  eventSlug: string;
  asset: string;
  tokenIds: string[];
  details?: Record<string, unknown>;
}

// ─── In-memory order books, keyed by token id ───
const books = new Map<string, PriceLevels>();
// token id -> packages that reference it (for targeted re-evaluation)
const tokenToPackages = new Map<string, Set<string>>();
const packages = new Map<string, WatchPackage>();

// Idempotency / caps
const inFlight = new Set<string>();
const tokensInFlight = new Set<string>();
const evaluatingPackages = new Set<string>();
let alreadyOpen = new Set<string>();
const submitTimestamps: number[] = [];
const quarantinedPackages = new Set<string>();
const quarantinedTokens = new Set<string>();
const spotPrices = new Map<string, number>();
let lastSpotRefreshAt = 0;

// Cached on-chain state (refreshed off the hot path)
let cachedFunderBalance = 0;
let cachedFunderAllowance = 0;
let balanceKnown = false;
let pausedForLowBalanceLogged = false;
let reservedSpendUsd = 0;

// Fill-signal waiters keyed by token id (resolved by the User websocket)
const fillWaiters = new Map<string, Set<() => void>>();

// ─── Orphan inventory (naked legs awaiting re-pair or unwind) ───
const orphans = new Map<string, Orphan>();
// orphan id -> in-flight guard so the poll loop and the reactive stop never
// double-fire a completion/unwind on the same orphan.
const orphanInFlight = new Set<string>();
// orphan id -> last live-ladder refresh timestamp (throttles event re-fetch).
const orphanLadderAt = new Map<string, number>();
const dustExitAttemptAt = new Map<string, number>();
// eventSlug -> cached freshly-fetched event ladder + quotes (shared across
// orphans in the same event within ORPHAN_LADDER_REFRESH_MS).
const orphanEventCache = new Map<string, { at: number; quotes: MarketQuote[] }>();

// Throttle repeated skip logs so a single near-miss package (passes the dynamic
// gate but always sizes below the min order) cannot flood the journal on every
// book delta.
const lastSkipLogAt = new Map<string, number>();
const SKIP_LOG_THROTTLE_MS = 60_000;

// Per-interval near-miss state. The map stores the best (lowest-cost) observation
// per package so logs answer "how many packages got close?" rather than "how
// many websocket ticks fired?"
let nearMissStartedAt = Date.now();
let nearMissObservations = 0;
const nearMissBestByPackage = new Map<string, NearMissSample>();

let clob: Awaited<ReturnType<typeof clobClient>> | null = null;
let reconcileAddress = "";
let marketWs: WebSocket | null = null;
let userWs: WebSocket | null = null;
let shuttingDown = false;
let tradingPausedReason: string | null = null;
const tickSizeCache = new Map<string, TickSize>();

function log(...args: unknown[]) {
  console.log(`[arb-daemon ${new Date().toISOString()}]`, ...args);
}

function installHttpKeepAlive() {
  if (!HTTP_KEEP_ALIVE) return;
  try {
    const undici = require("undici") as any;
    if (typeof undici?.setGlobalDispatcher !== "function" || typeof undici?.Agent !== "function") return;
    undici.setGlobalDispatcher(new undici.Agent({
      connections: Number(process.env.ARB_DAEMON_HTTP_CONNECTIONS ?? 16),
      keepAliveTimeout: Number(process.env.ARB_DAEMON_HTTP_KEEP_ALIVE_TIMEOUT_MS ?? 30_000),
      keepAliveMaxTimeout: Number(process.env.ARB_DAEMON_HTTP_KEEP_ALIVE_MAX_TIMEOUT_MS ?? 120_000),
    }));
    log("HTTP keep-alive dispatcher installed");
  } catch (err: any) {
    log(`HTTP keep-alive dispatcher unavailable: ${err?.message ?? String(err)}`);
  }
}

type Clob = Awaited<ReturnType<typeof clobClient>>["client"];
type PreparedFakBuy = {
  role: "broad_yes" | "narrow_no";
  tokenId: string;
  price: number;
  shares: number;
  order: Awaited<ReturnType<Clob["createOrder"]>>;
  orderType: OrderType;
};

async function tickSize(client: Clob, tokenId: string): Promise<TickSize> {
  const cached = tickSizeCache.get(tokenId);
  if (cached) return cached;
  const size = await client.getTickSize(tokenId) as TickSize;
  tickSizeCache.set(tokenId, size);
  return size;
}

async function prepareFakBuy(client: Clob, leg: { role: "broad_yes" | "narrow_no"; tokenId: string; price: number; shares: number }): Promise<PreparedFakBuy> {
  const size = await tickSize(client, leg.tokenId);
  const order = await client.createOrder(
    { tokenID: leg.tokenId, price: leg.price, size: Number(leg.shares.toFixed(6)), side: Side.BUY, ...(process.env.POLY_BUILDER_CODE?.trim() ? { builderCode: process.env.POLY_BUILDER_CODE.trim() } : {}) },
    { tickSize: size, negRisk: false },
  );
  return { ...leg, order, orderType: OrderType.FAK };
}

async function postPreparedFakBuys(client: Clob, prepared: PreparedFakBuy[], forceBatch: boolean) {
  const postStartedMs = Date.now();
  if (forceBatch || MONOTONIC_POST_MODE === "batch") {
    const response = await client.postOrders(prepared.map((row) => ({ order: row.order, orderType: row.orderType })));
    return {
      responses: Array.isArray(response) ? response : [response],
      postOrdersMs: Date.now() - postStartedMs,
      postMode: "batch",
    };
  }
  const responses = await Promise.all(prepared.map((row) => client.postOrder(row.order, row.orderType)));
  return {
    responses,
    postOrdersMs: Date.now() - postStartedMs,
    postMode: "parallel",
  };
}

function responseBuyShares(response: unknown): number {
  const shares = Number((response as any)?.takingAmount);
  return Number.isFinite(shares) && shares > 0 ? shares : 0;
}

function averageBuyPrice(response: unknown, fallbackPrice: number): number {
  const row = response as any;
  const cost = Number(row?.makingAmount);
  const shares = Number(row?.takingAmount);
  if (Number.isFinite(cost) && cost > 0 && Number.isFinite(shares) && shares > 0) return cost / shares;
  const price = Number(row?.price);
  if (Number.isFinite(price) && price > 0) return price;
  return fallbackPrice;
}

function emptyLevels(): PriceLevels {
  return { bids: new Map(), asks: new Map() };
}

function getBook(tokenId: string): PriceLevels {
  let b = books.get(tokenId);
  if (!b) {
    b = emptyLevels();
    books.set(tokenId, b);
  }
  return b;
}

function applySnapshot(tokenId: string, bids: Array<{ price: number; size: number }>, asks: Array<{ price: number; size: number }>) {
  const b = emptyLevels();
  for (const level of bids) if (level.price > 0 && level.size > 0) b.bids.set(level.price, level.size);
  for (const level of asks) if (level.price > 0 && level.size > 0) b.asks.set(level.price, level.size);
  books.set(tokenId, b);
}

function applyLevelChange(tokenId: string, side: string, price: number, size: number) {
  if (!(price > 0)) return;
  const b = getBook(tokenId);
  const map = side.toUpperCase() === "SELL" || side.toUpperCase() === "ASK" ? b.asks : b.bids;
  if (size > 0) map.set(price, size);
  else map.delete(price);
}

function topOfBook(tokenId: string): TopOfBook {
  const b = books.get(tokenId);
  if (!b) return { ask: 0, askSize: 0, bid: 0, bidSize: 0, spread: 0 };
  let ask = 0;
  let askSize = 0;
  for (const [price, size] of b.asks) {
    if (size <= 0) continue;
    if (ask === 0 || price < ask) {
      ask = price;
      askSize = size;
    }
  }
  let bid = 0;
  let bidSize = 0;
  for (const [price, size] of b.bids) {
    if (size <= 0) continue;
    if (price > bid) {
      bid = price;
      bidSize = size;
    }
  }
  const spread = bid > 0 && ask > 0 ? Math.max(0, ask - bid) : 0;
  return { ask, askSize, bid, bidSize, spread };
}

async function postHyperliquidInfo(payload: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BOOK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "polymarket-arb-daemon/1.0" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`POST ${HL_API} ${JSON.stringify(payload)} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function setSpot(asset: string, raw: unknown) {
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) spotPrices.set(asset, value);
}

async function refreshSpotPrices() {
  try {
    const metaAndCtx = await postHyperliquidInfo({ type: "metaAndAssetCtxs" });
    const universe: Array<{ name?: string }> = metaAndCtx?.[0]?.universe ?? [];
    const ctxs: Array<{ markPx?: string; oraclePx?: string }> = metaAndCtx?.[1] ?? [];
    for (const asset of ["BTC", "ETH", "SOL", "HYPE"]) {
      const idx = universe.findIndex((row) => row.name === asset);
      if (idx >= 0) setSpot(asset, ctxs[idx]?.markPx ?? ctxs[idx]?.oraclePx);
    }

    const dexMeta = await postHyperliquidInfo({ type: "metaAndAssetCtxs", dex: "xyz" });
    const dexUniverse: Array<{ name?: string }> = dexMeta?.[0]?.universe ?? [];
    const dexCtxs: Array<{ markPx?: string; oraclePx?: string }> = dexMeta?.[1] ?? [];
    for (const [asset, coin] of [["GOLD", "xyz:GOLD"], ["SILVER", "xyz:SILVER"]] as const) {
      const idx = dexUniverse.findIndex((row) => row.name === coin);
      if (idx >= 0) setSpot(asset, dexCtxs[idx]?.markPx ?? dexCtxs[idx]?.oraclePx);
    }

    lastSpotRefreshAt = Date.now();
    log(`spot refresh: ${["BTC", "ETH", "SOL", "HYPE", "GOLD", "SILVER"].map((asset) => `${asset}=${spotPrices.get(asset)?.toFixed(2) ?? "na"}`).join(" ")}`);
  } catch (err: any) {
    log(`spot refresh failed: ${err?.message ?? String(err)}`);
  }
}

async function fetchRawBook(tokenId: string): Promise<{ bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BOOK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HOST}/book?${new URLSearchParams({ token_id: tokenId })}`, {
      headers: { Accept: "application/json", "User-Agent": "polymarket-arb-daemon/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GET /book ${tokenId} -> ${res.status}`);
    const data = await res.json() as { bids?: Array<{ price?: string; size?: string }>; asks?: Array<{ price?: string; size?: string }> };
    const toLevels = (rows?: Array<{ price?: string; size?: string }>) => (rows ?? [])
      .map((r) => ({ price: Number(r.price), size: Number(r.size) }))
      .filter((r) => Number.isFinite(r.price) && Number.isFinite(r.size));
    return { bids: toLevels(data.bids), asks: toLevels(data.asks) };
  } finally {
    clearTimeout(timeout);
  }
}

function watchedTokens(): string[] {
  return [...books.keys()];
}

// ─── Watchlist construction ───

function registerToken(tokenId: string, key: string) {
  if (!tokenId) return;
  getBook(tokenId);
  let set = tokenToPackages.get(tokenId);
  if (!set) {
    set = new Set();
    tokenToPackages.set(tokenId, set);
  }
  set.add(key);
}

function isSportsGameSlug(slug: string): boolean {
  return /^(?:nba|mlb)-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}$/.test(slug);
}

function sportsGameDate(slug: string): string | null {
  const match = slug.match(/-(\d{4}-\d{2}-\d{2})$/);
  return match?.[1] ?? null;
}

function todayInNewYork(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isCurrentOrFutureSportsGameSlug(slug: string, today = todayInNewYork()): boolean {
  const gameDate = sportsGameDate(slug);
  return !!gameDate && gameDate >= today;
}

async function configuredEventSlugs(): Promise<string[]> {
  const today = todayInNewYork();
  const out: string[] = [];
  for (const slug of eventSlugs()) {
    if (!isSportsGameSlug(slug)) {
      out.push(slug);
      continue;
    }
    if (!isCurrentOrFutureSportsGameSlug(slug, today)) {
      log(`sports lifecycle: dropping past configured slug ${slug}`);
      continue;
    }
    try {
      const event = await fetchEvent(arbConfig, slug);
      if ((event as { closed?: boolean } | null)?.closed) {
        log(`sports lifecycle: dropping resolved configured slug ${slug}`);
        continue;
      }
    } catch (err: any) {
      log(`sports lifecycle: keeping configured slug ${slug}; status check failed: ${err?.message ?? String(err)}`);
    }
    out.push(slug);
  }
  return out;
}

async function discoverSportsGameSlugs(kind: "nba" | "mlb"): Promise<string[]> {
  if (kind === "nba" && !DISCOVER_NBA_GAMES) return [];
  if (kind === "mlb" && !DISCOVER_MLB_GAMES) return [];
  const out = new Set<string>();
  const today = todayInNewYork();
  const tags = kind === "nba" ? ["nba", "basketball"] : ["mlb", "baseball"];
  for (const tag of tags) {
    for (let offset = 0; offset < SPORTS_DISCOVERY_LIMIT; offset += 100) {
      const events = await fetchJson(`${GAMMA_API}/events?${new URLSearchParams({
        active: "true",
        closed: "false",
        limit: "100",
        offset: String(offset),
        tag_slug: tag,
      })}`, BOOK_FETCH_TIMEOUT_MS) as GammaEvent[];
      if (!Array.isArray(events) || events.length === 0) break;
      for (const event of events) {
        const slug = event.slug ?? "";
        if (!slug.startsWith(`${kind}-`) || !isSportsGameSlug(slug)) continue;
        if (!isCurrentOrFutureSportsGameSlug(slug, today)) continue;
        const hasLadder = (event.markets ?? []).some((market) => {
          const question = market.question ?? "";
          return /(^|:\s*)(?:1H\s+)?O\/U\s+[0-9]/i.test(question) || /^Spread:/i.test(question);
        });
        if (hasLadder) out.add(slug);
      }
      if (events.length < 100) break;
    }
  }
  return [...out].sort();
}

async function currentEventSlugs(): Promise<string[]> {
  const configured = await configuredEventSlugs();
  const [discoveredNba, discoveredMlb] = await Promise.all([
    discoverSportsGameSlugs("nba"),
    discoverSportsGameSlugs("mlb"),
  ]);
  if (discoveredNba.length) log(`nba discovery: ${discoveredNba.length} active game slugs`);
  if (discoveredMlb.length) log(`mlb discovery: ${discoveredMlb.length} active game slugs`);
  return [...configured, ...discoveredNba, ...discoveredMlb].filter((slug, idx, slugs) => slugs.indexOf(slug) === idx);
}

async function refreshWatchlist(): Promise<void> {
  const foundAt = new Date().toISOString();
  let candidates: Candidate[];
  try {
    const result = await findCandidates(arbConfig, await currentEventSlugs(), foundAt);
    candidates = result.candidates;
    if (result.errors.length) log(`watchlist scan errors=${result.errors.length} first=${result.errors[0]}`);
  } catch (err: any) {
    log(`watchlist refresh failed: ${err?.message ?? String(err)}`);
    return;
  }

  // Keep structurally-valid ladder packages even when they do NOT have a live
  // edge yet. The websocket daemon must subscribe before the arb appears; the
  // dynamic gate (edge/spread/top-of-book size) is re-checked on every delta.
  // Static deal-breakers (wrong asset, expiry/resolution mismatch, low market
  // liquidity) stay filtered out.
  const watch = candidates.filter((c) => !c.rejectionReasons.some((reason) =>
    ["asset_not_allowlisted", "expiry_mismatch", "resolution_mismatch", "low_liquidity"].includes(reason)
  ));
  const seen = new Set<string>();
  let added = 0;
  for (const base of watch) {
    const key = base.packageId;
    seen.add(key);
    if (!packages.has(key)) added += 1;
    packages.set(key, {
      key,
      base,
      broadYesToken: base.broad.yesTokenId,
      narrowNoToken: base.narrow.noTokenId,
      narrowYesToken: base.narrow.yesTokenId,
    });
    registerToken(base.broad.yesTokenId, key);
    registerToken(base.narrow.noTokenId, key);
    registerToken(base.narrow.yesTokenId, key);
  }
  // Drop packages that disappeared from discovery.
  for (const key of [...packages.keys()]) {
    if (!seen.has(key)) {
      const pkg = packages.get(key)!;
      packages.delete(key);
      for (const tok of [pkg.broadYesToken, pkg.narrowNoToken, pkg.narrowYesToken]) {
        tokenToPackages.get(tok)?.delete(key);
      }
    }
  }
  refreshAlreadyOpen();
  log(`watchlist: ${packages.size} packages / ${watchedTokens().length} tokens (added ${added})`);
}

function refreshAlreadyOpen() {
  const rows = readJsonArray<LivePackage>(PACKAGES_PATH);
  const open = new Set<string>();
  for (const row of rows) {
    if (isDaemonOpenPackage(row)) {
      open.add(row.packageId);
    }
  }
  for (const orphan of activeOrphans()) {
    open.add(orphan.packageId);
  }
  alreadyOpen = open;
}

function isStaleSubmittedNoFill(row: LivePackage): boolean {
  if (!["quoted", "leg1_submitted", "leg1_filled", "leg2_submitted"].includes(row.status)) return false;
  if ((row.filledShares ?? 0) > 0 || (row.actualCost ?? 0) > 0) return false;
  const updatedAt = Date.parse(row.updatedAt || row.createdAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_SUBMITTED_MS;
}

function isDaemonOpenPackage(row: LivePackage): boolean {
  if (isStaleSubmittedNoFill(row)) return false;
  if (["quoted", "leg1_submitted", "leg1_filled", "leg2_submitted"].includes(row.status)) return true;
  // A completed package is still live inventory until it is explicitly sold or
  // settled. Treating clean completions as closed allowed duplicate same-package
  // re-entry against shared tokens, which can strand one leg if balance is tight.
  if (row.status === "package_complete") return true;
  if (row.status !== "unwind_required") return false;
  return (row.actualCost ?? 0) > 0
    || (row.filledShares ?? 0) > 0
    || /orphan|sports_immediate_exit|naked_/i.test(row.failureReason ?? "");
}

function isCleanCompletedPackage(row: LivePackage): boolean {
  return row.status === "package_complete"
    && !row.failureReason
    && (row.actualCost ?? 0) > 0
    && (row.filledShares ?? 0) > 0;
}

function daemonOpenPackageCount(rows: LivePackage[]): number {
  return rows.filter(isDaemonOpenPackage).length;
}

// ─── Live candidate + evaluation ───

function liveLegs(pkg: WatchPackage): LiveLegs | null {
  const broad = topOfBook(pkg.broadYesToken);
  const narrowNo = topOfBook(pkg.narrowNoToken);
  const narrowYes = topOfBook(pkg.narrowYesToken);
  if (broad.ask <= 0 || narrowNo.ask <= 0) return null;
  return {
    broadYesAsk: broad.ask,
    broadYesAskSize: broad.askSize,
    broadSpread: broad.spread,
    narrowNoAsk: narrowNo.ask,
    narrowNoAskSize: narrowNo.askSize,
    // Mirror the hourly gate: liquidity quality is judged on the YES books, not
    // the (independently quoted) NO book.
    narrowSpread: narrowYes.spread,
  };
}

function liveCandidate(base: Candidate, legs: LiveLegs): Candidate {
  const c = structuredClone(base);
  c.broad.yesBook.ask = legs.broadYesAsk;
  c.broad.yesBook.askSize = legs.broadYesAskSize;
  c.broad.yesBook.spread = legs.broadSpread;
  c.narrow.noBook.ask = legs.narrowNoAsk;
  c.narrow.noBook.askSize = legs.narrowNoAskSize;
  c.narrow.yesBook.spread = legs.narrowSpread;
  c.packageCost = legs.broadYesAsk + legs.narrowNoAsk;
  c.lockedEdge = 1 - c.packageCost;
  c.availableSize = Math.min(legs.broadYesAskSize, legs.narrowNoAskSize);
  c.maxSpread = Math.max(legs.broadSpread, legs.narrowSpread);
  c.foundAt = new Date().toISOString();
  return c;
}

function isSportsCandidate(candidate: Candidate): boolean {
  return candidate.asset === "NBA"
    || candidate.asset === "SOCCER"
    || candidate.asset === "MLB"
    || candidate.eventSlug.startsWith("nba-")
    || candidate.eventSlug.startsWith("mlb-")
    || candidate.eventSlug.startsWith("fifwc-")
    || candidate.eventSlug.startsWith("mls-")
    || candidate.eventSlug.includes("soccer")
    || candidate.eventSlug.includes("world-cup")
    || candidate.eventSlug.includes("fifa")
    || candidate.eventSlug.includes("uefa");
}

function sportsEntryBlocked(candidate: Candidate): string | null {
  if (!isSportsCandidate(candidate)) return null;
  if (SPORTS_ENTRY_CUTOFF_MS <= 0) return null;
  const dates = [candidate.broad.endDate, candidate.narrow.endDate].filter(Boolean) as string[];
  const endTimes = dates.map((date) => Date.parse(date)).filter((time) => Number.isFinite(time));
  if (!endTimes.length) return "sports market missing endDate";
  const cutoff = Math.min(...endTimes) - SPORTS_ENTRY_CUTOFF_MS;
  if (Date.now() >= cutoff) {
    return `sports market start cutoff endDate=${new Date(Math.min(...endTimes)).toISOString()} cutoffMs=${SPORTS_ENTRY_CUTOFF_MS}`;
  }
  return null;
}

function sportsExecutionBlocked(candidate: Candidate): string | null {
  if (!isSportsCandidate(candidate)) return null;
  const entryBlock = sportsEntryBlocked(candidate);
  if (entryBlock) return entryBlock;
  if (ENABLE_NBA_BATCH_EXECUTION) return null;
  if (ALLOW_NBA_NON_ATOMIC_EXECUTION) return null;
  return "NBA requires batched/tightly-coupled two-leg execution; separate FAK legs can leave naked inventory";
}

function packageSlug(packageId: string | undefined): string | null {
  if (!packageId) return null;
  const marker = packageId.indexOf("::");
  return marker >= 0 ? packageId.slice(0, marker) : null;
}

function isNbaSlug(slug: string | null | undefined): boolean {
  return !!slug && (slug.startsWith("nba-") || slug.includes("-nba-"));
}

function isSportsSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return isNbaSlug(slug)
    || slug.startsWith("fifwc-")
    || slug.startsWith("mls-")
    || slug.startsWith("mlb-")
    || slug.includes("soccer")
    || slug.includes("world-cup")
    || slug.includes("fifa")
    || slug.includes("uefa");
}

function isSportsAsset(asset: string | undefined): boolean {
  return ["NBA", "SOCCER", "MLB"].includes((asset ?? "").toUpperCase());
}

function packageEndMs(row: LivePackage): number | null {
  const raw = row.settlementWindow?.endDate ?? null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function orphanEndMs(row: Orphan): number | null {
  if (!row.endDate) return null;
  const t = Date.parse(row.endDate);
  return Number.isFinite(t) ? t : null;
}

function archiveFileForNow(now: Date): string {
  return join(LEDGER_ARCHIVE_DIR, `polymarket-sports-${now.toISOString().slice(0, 10)}.json`);
}

function appendArchiveSnapshot(entry: unknown) {
  mkdirSync(LEDGER_ARCHIVE_DIR, { recursive: true });
  appendJsonArray(archiveFileForNow(new Date()), [entry]);
}

function archiveStaleNbaLedgers() {
  const nowMs = Date.now();
  const cutoffMs = nowMs - NBA_LEDGER_ARCHIVE_GRACE_MS;
  const packagesRows = readJsonArray<LivePackage>(PACKAGES_PATH);
  const ordersRows = readJsonArray<LiveOrder>(ORDERS_PATH);
  const orphanRows = readJsonArray<Orphan>(ORPHANS_PATH);

  const activeNbaOrphanSlugs = new Set<string>();
  for (const row of orphanRows) {
    if (row.status !== "completing") continue;
    const slug = row.eventSlug || packageSlug(row.packageId);
    if (slug && (isSportsAsset(row.asset) || isSportsSlug(slug))) activeNbaOrphanSlugs.add(slug);
  }

  const staleSlugs = new Set<string>();
  for (const row of packagesRows) {
    const slug = row.eventSlug || packageSlug(row.packageId);
    if (!slug || activeNbaOrphanSlugs.has(slug)) continue;
    if (!isSportsAsset(row.asset) && !isSportsSlug(slug)) continue;
    const endMs = packageEndMs(row);
    if (endMs !== null && endMs <= cutoffMs) staleSlugs.add(slug);
  }
  for (const row of orphanRows) {
    const slug = row.eventSlug || packageSlug(row.packageId);
    if (!slug || activeNbaOrphanSlugs.has(slug)) continue;
    if (!isSportsAsset(row.asset) && !isSportsSlug(slug)) continue;
    const endMs = orphanEndMs(row);
    if (endMs !== null && endMs <= cutoffMs) staleSlugs.add(slug);
  }
  if (staleSlugs.size === 0) return;

  const belongsToStaleSlug = (packageId: string | undefined, eventSlug?: string) => {
    const slug = eventSlug || packageSlug(packageId);
    return !!slug && staleSlugs.has(slug);
  };
  const archivedPackages = packagesRows.filter((row) => belongsToStaleSlug(row.packageId, row.eventSlug));
  const archivedOrders = ordersRows.filter((row) => belongsToStaleSlug(row.packageId));
  const archivedOrphans = orphanRows.filter((row) => belongsToStaleSlug(row.packageId, row.eventSlug));
  if (!archivedPackages.length && !archivedOrders.length && !archivedOrphans.length) return;

  appendArchiveSnapshot({
    archivedAt: new Date(nowMs).toISOString(),
    kind: "sports_resolved_event_live_ledger_archive",
    eventSlugs: [...staleSlugs].sort(),
    counts: {
      packages: archivedPackages.length,
      orders: archivedOrders.length,
      orphans: archivedOrphans.length,
    },
    packages: archivedPackages,
    orders: archivedOrders,
    orphans: archivedOrphans,
  });

  writeJsonArray(PACKAGES_PATH, packagesRows.filter((row) => !belongsToStaleSlug(row.packageId, row.eventSlug)));
  writeJsonArray(ORDERS_PATH, ordersRows.filter((row) => !belongsToStaleSlug(row.packageId)));
  const remainingOrphans = orphanRows.filter((row) => !belongsToStaleSlug(row.packageId, row.eventSlug));
  writeJsonArray(ORPHANS_PATH, remainingOrphans);
  for (const row of archivedOrphans) orphans.delete(row.id);
  log(`archived stale sports ledgers slugs=${[...staleSlugs].sort().join(",")} packages=${archivedPackages.length} orders=${archivedOrders.length} orphans=${archivedOrphans.length}`);
}

function isJuneExpiryCandidate(candidate: Candidate): boolean {
  const dates = [candidate.broad.endDate, candidate.narrow.endDate].filter(Boolean) as string[];
  return dates.some((date) => /^2026-06-/.test(date));
}

function juneBreakevenMaxDistance(asset: string): number | null {
  if (["GOLD", "SILVER"].includes(asset)) return JUNE_BREAKEVEN_COMMODITY_MAX_DISTANCE;
  if (["BTC", "ETH", "SOL", "HYPE"].includes(asset)) return JUNE_BREAKEVEN_CRYPTO_MAX_DISTANCE;
  return null;
}

function isJuneBreakevenCandidate(candidate: Candidate): boolean {
  return isJuneExpiryCandidate(candidate)
    && candidate.lockedEdge <= JUNE_BREAKEVEN_EPSILON
    && candidate.packageCost + EPSILON >= 1;
}

function juneBreakevenRangeBlock(candidate: Candidate): string | null {
  if (!isJuneBreakevenCandidate(candidate)) return null;
  const maxDistance = juneBreakevenMaxDistance(candidate.asset);
  if (maxDistance === null) return null;
  const spot = spotPrices.get(candidate.asset);
  if (!(spot && spot > 0)) return `june_breakeven_spot_unavailable asset=${candidate.asset}`;
  const broadDistance = Math.abs(candidate.broad.strike - spot) / spot;
  const narrowDistance = Math.abs(candidate.narrow.strike - spot) / spot;
  const worstDistance = Math.max(broadDistance, narrowDistance);
  if (worstDistance <= maxDistance + EPSILON) return null;
  return `june_breakeven_strike_too_far asset=${candidate.asset} spot=${spot.toFixed(2)} strikes=${candidate.broad.strike}/${candidate.narrow.strike} distance=${(worstDistance * 100).toFixed(1)}% max=${(maxDistance * 100).toFixed(1)}%`;
}

function minEdgeFor(candidate: Candidate): number {
  // June expiries are allowed at breakeven (cost <= 1.0000) to fish for middles.
  // Sizing/outlay rules remain exactly the normal daemon rules.
  if (isJuneExpiryCandidate(candidate)) return Number(process.env.ARB_DAEMON_JUNE_EXPIRY_MIN_EDGE ?? 0);
  return isSportsCandidate(candidate) ? SPORTS_MIN_EDGE : MIN_EDGE;
}

function minAvailableSharesFor(candidate: Candidate): number {
  return isSportsCandidate(candidate) ? SPORTS_MIN_AVAILABLE_SHARES : MIN_AVAILABLE_SHARES;
}

function maxSpreadFor(candidate: Candidate): number {
  return isSportsCandidate(candidate) ? SPORTS_MAX_SPREAD : MAX_SPREAD;
}

function requiredDisplayedTouch(candidate: Candidate): number {
  if (isSportsCandidate(candidate)) {
    return Math.max(minAvailableSharesFor(candidate), requiredLiveMinShares(candidate) * SPORTS_DEPTH_RESERVE_MULTIPLIER);
  }
  return minAvailableSharesFor(candidate);
}

function executionSizingCandidate(candidate: Candidate): Candidate {
  if (isSportsCandidate(candidate)) {
    const c = structuredClone(candidate);
    const reserveSize = Math.floor((candidate.availableSize / Math.max(1, SPORTS_DEPTH_RESERVE_MULTIPLIER)) * 100) / 100;
    c.availableSize = Math.max(0, reserveSize);
    return c;
  }
  const minShares = requiredLiveMinShares(candidate);
  if (candidate.availableSize + EPSILON >= minShares) return candidate;
  if (candidate.availableSize + EPSILON < minAvailableSharesFor(candidate)) return candidate;

  const c = structuredClone(candidate);
  // CLOB may require a >=$1 maker amount even when the displayed touch is just
  // under that share count. Send an exchange-min-sized FAK and let it partially
  // fill the profitable top-of-book amount that actually exists.
  c.availableSize = minShares + NON_SPORTS_EXCHANGE_MIN_BUFFER_SHARES;
  return c;
}

function withSportsExecutionPrices(candidate: Candidate, broadAsk: number, narrowNoAsk: number): Candidate {
  const c = structuredClone(candidate);
  c.broad.yesBook.ask = Math.min(0.99, Math.ceil((broadAsk + SPORTS_PRICE_SLIPPAGE) * 1000) / 1000);
  c.narrow.noBook.ask = Math.min(0.99, Math.ceil((narrowNoAsk + SPORTS_PRICE_SLIPPAGE) * 1000) / 1000);
  c.packageCost = c.broad.yesBook.ask + c.narrow.noBook.ask;
  c.lockedEdge = 1 - c.packageCost;
  c.availableSize = Math.min(c.broad.yesBook.askSize, c.narrow.noBook.askSize);
  c.maxSpread = Math.max(c.broad.yesBook.spread, c.narrow.yesBook.spread);
  c.foundAt = new Date().toISOString();
  return c;
}

async function freshSportsCandidate(candidate: Candidate): Promise<Candidate> {
  const [broadYes, narrowNo, narrowYes] = await Promise.all([
    fetchBook(arbConfig, candidate.broad.yesTokenId),
    fetchBook(arbConfig, candidate.narrow.noTokenId),
    fetchBook(arbConfig, candidate.narrow.yesTokenId),
  ]);
  const c = structuredClone(candidate);
  c.broad.yesBook = broadYes;
  c.narrow.noBook = narrowNo;
  c.narrow.yesBook = narrowYes;
  return withSportsExecutionPrices(c, broadYes.ask, narrowNo.ask);
}

function requiredLiveMinShares(candidate: Candidate): number {
  const broadNotionalShares = candidate.broad.yesBook.ask > 0
    ? Math.ceil((MIN_MARKETABLE_BUY_USD / candidate.broad.yesBook.ask) * 100) / 100
    : Number.POSITIVE_INFINITY;
  const narrowNotionalShares = candidate.narrow.noBook.ask > 0
    ? Math.ceil((MIN_MARKETABLE_BUY_USD / candidate.narrow.noBook.ask) * 100) / 100
    : Number.POSITIVE_INFINITY;
  return Math.max(
    MIN_ORDER_SHARES,
    candidate.broad.yesBook.minOrderSize,
    candidate.narrow.noBook.minOrderSize,
    broadNotionalShares,
    narrowNotionalShares,
  );
}

function passesDynamicGate(candidate: Candidate): boolean {
  if (candidate.lockedEdge + EPSILON < minEdgeFor(candidate)) return false;
  if (candidate.maxSpread - EPSILON > maxSpreadFor(candidate)) return false;
  if (candidate.availableSize + EPSILON < requiredDisplayedTouch(candidate)) return false;
  if (juneBreakevenRangeBlock(candidate)) return false;
  return true;
}

function recordNearMiss(candidate: Candidate) {
  nearMissObservations += 1;
  const minShares = requiredDisplayedTouch(candidate);
  const sample: NearMissSample = {
    packageId: candidate.packageId,
    eventSlug: candidate.eventSlug,
    asset: candidate.asset,
    broadStrike: candidate.broad.strike,
    narrowStrike: candidate.narrow.strike,
    cost: candidate.packageCost,
    edge: candidate.lockedEdge,
    availableSize: candidate.availableSize,
    maxSpread: candidate.maxSpread,
    minShares,
    rangeBlock: juneBreakevenRangeBlock(candidate),
    edgeOk: candidate.lockedEdge + EPSILON >= minEdgeFor(candidate),
    spreadOk: candidate.maxSpread - EPSILON <= maxSpreadFor(candidate),
    sizeOk: candidate.availableSize + EPSILON >= minShares,
    executableGate: candidate.lockedEdge + EPSILON >= minEdgeFor(candidate)
      && candidate.maxSpread - EPSILON <= maxSpreadFor(candidate)
      && candidate.availableSize + EPSILON >= minShares
      && !juneBreakevenRangeBlock(candidate),
  };
  const prev = nearMissBestByPackage.get(candidate.packageId);
  if (!prev || sample.cost < prev.cost) nearMissBestByPackage.set(candidate.packageId, sample);
}

function flushNearMissTelemetry() {
  const samples = [...nearMissBestByPackage.values()];
  if (nearMissObservations === 0 && samples.length === 0) return;

  const bucketParts = NEAR_MISS_BUCKETS.map((bucket) => {
    const count = samples.filter((sample) => sample.cost <= bucket.cost + EPSILON).length;
    return `${bucket.label}:${count}`;
  });
  const near = samples.filter((sample) => sample.cost <= NEAR_MISS_BUCKETS[NEAR_MISS_BUCKETS.length - 1].cost + EPSILON);
  const executable = samples.filter((sample) => sample.executableGate).length;
  const edgeOk = near.filter((sample) => sample.edgeOk).length;
  const spreadOk = near.filter((sample) => sample.spreadOk).length;
  const sizeOk = near.filter((sample) => sample.sizeOk).length;
  const best = samples
    .sort((a, b) => a.cost - b.cost)
    .slice(0, Math.max(1, NEAR_MISS_TOP_N))
    .map((sample) => {
      const blockers = [
        sample.edgeOk ? "" : "edge",
        sample.spreadOk ? "" : "spread",
        sample.sizeOk ? "" : "size",
        sample.rangeBlock ? "june_range" : "",
      ].filter(Boolean).join("+") || "none";
      return `${sample.asset} ${sample.eventSlug} YES ${sample.broadStrike}/NO ${sample.narrowStrike} cost=${sample.cost.toFixed(4)} edge=${(sample.edge * 100).toFixed(3)}c size=${sample.availableSize.toFixed(2)}/${sample.minShares.toFixed(2)} spread=${sample.maxSpread.toFixed(4)} block=${blockers}`;
    });

  log(`near-miss telemetry intervalMs=${Date.now() - nearMissStartedAt} observations=${nearMissObservations} unique=${samples.length} near<=1.005=${near.length} executableGate=${executable} ${bucketParts.join(" ")} nearPass edge=${edgeOk}/${near.length} spread=${spreadOk}/${near.length} size=${sizeOk}/${near.length} best=[${best.join(" | ")}]`);
  nearMissStartedAt = Date.now();
  nearMissObservations = 0;
  nearMissBestByPackage.clear();
}

// ─── Caps / safety ───

function perMinuteCapReached(): boolean {
  const cutoff = Date.now() - 60_000;
  while (submitTimestamps.length && submitTimestamps[0] < cutoff) submitTimestamps.shift();
  return submitTimestamps.length >= MAX_PER_MIN;
}

function lowBalance(): boolean {
  if (!balanceKnown) return false;
  return spendableUsdAfterReservations() < MIN_MARKETABLE_BUY_USD;
}

function spendableUsdAfterReservations(): number {
  if (!balanceKnown) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(cachedFunderBalance, cachedFunderAllowance) - reservedSpendUsd);
}

function sizingSpendableUsd(candidate: Candidate, spendableUsd: number): number {
  if (!isSportsCandidate(candidate) || !Number.isFinite(spendableUsd)) return spendableUsd;
  return Math.max(0, (spendableUsd - SPORTS_BALANCE_HEADROOM_USD) / Math.max(1, SPORTS_BALANCE_HEADROOM_MULTIPLIER));
}

function reservedUsdForSized(candidate: Candidate, nominalCost: number): number {
  if (!isSportsCandidate(candidate)) return nominalCost;
  return nominalCost * Math.max(1, SPORTS_BALANCE_HEADROOM_MULTIPLIER) + SPORTS_BALANCE_HEADROOM_USD;
}

function pauseNewEntries(reason: string, details: Record<string, unknown> = {}) {
  if (!tradingPausedReason) {
    tradingPausedReason = reason;
    writeFileSync(PAUSE_PATH, JSON.stringify({
      pausedAt: new Date().toISOString(),
      reason,
      details,
    }, null, 2) + "\n");
    log(`PAUSED new entries: ${reason}`);
    return;
  }
  log(`new entries already paused: ${tradingPausedReason}; additional reason=${reason}`);
}

function loadPersistentPause() {
  if (!existsSync(PAUSE_PATH)) return;
  try {
    const row = JSON.parse(readFileSync(PAUSE_PATH, "utf8")) as { reason?: string };
    tradingPausedReason = row.reason || "persistent_pause_file_present";
    log(`persistent pause loaded: ${tradingPausedReason}`);
  } catch (err: any) {
    tradingPausedReason = "persistent_pause_file_unreadable";
    log(`persistent pause loaded with unreadable file: ${err?.message ?? String(err)}`);
  }
}

function loadQuarantine() {
  if (!existsSync(QUARANTINE_PATH)) return;
  try {
    const entries = JSON.parse(readFileSync(QUARANTINE_PATH, "utf8")) as QuarantineEntry[];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry.packageId) quarantinedPackages.add(entry.packageId);
      for (const tokenId of entry.tokenIds ?? []) quarantinedTokens.add(tokenId);
    }
    log(`quarantine loaded: packages=${quarantinedPackages.size} tokens=${quarantinedTokens.size}`);
  } catch (err: any) {
    log(`quarantine load failed; ignoring quarantine file: ${err?.message ?? String(err)}`);
  }
}

function appendQuarantine(entry: QuarantineEntry) {
  const existing = existsSync(QUARANTINE_PATH)
    ? JSON.parse(readFileSync(QUARANTINE_PATH, "utf8")) as QuarantineEntry[]
    : [];
  const entries = Array.isArray(existing) ? existing : [];
  const already = entries.some((row) => row.packageId === entry.packageId);
  if (!already) {
    entries.push(entry);
    writeFileSync(QUARANTINE_PATH, JSON.stringify(entries, null, 2) + "\n");
  }
  quarantinedPackages.add(entry.packageId);
  for (const tokenId of entry.tokenIds) quarantinedTokens.add(tokenId);
  log(`QUARANTINED package=${entry.packageId} tokens=${entry.tokenIds.length} reason=${entry.reason}`);
}

function quarantinePackage(pkg: WatchPackage, c: Candidate, reason: string, details: Record<string, unknown> = {}) {
  appendQuarantine({
    quarantinedAt: new Date().toISOString(),
    reason,
    packageId: pkg.key,
    eventSlug: c.eventSlug,
    asset: c.asset,
    tokenIds: [pkg.broadYesToken, pkg.narrowNoToken].filter(Boolean),
    details,
  });
}

// ─── Fill signalling (User websocket) ───

function signalFill(tokenId: string) {
  const waiters = fillWaiters.get(tokenId);
  if (!waiters) return;
  for (const resolveFn of waiters) resolveFn();
  waiters.clear();
}

function waitForFill(tokenId: string, timeoutMs: number): Promise<void> {
  return new Promise((resolveFn) => {
    let set = fillWaiters.get(tokenId);
    if (!set) {
      set = new Set();
      fillWaiters.set(tokenId, set);
    }
    const done = () => {
      clearTimeout(timer);
      set!.delete(done);
      resolveFn();
    };
    const timer = setTimeout(done, timeoutMs);
    set.add(done);
  });
}

// ─── Execution ───

async function tryExecute(pkg: WatchPackage, legs: LiveLegs): Promise<void> {
  if (evaluatingPackages.has(pkg.key)) return;
  evaluatingPackages.add(pkg.key);
  try {
    await tryExecuteInner(pkg, legs);
  } finally {
    evaluatingPackages.delete(pkg.key);
  }
}

async function tryExecuteInner(pkg: WatchPackage, legs: LiveLegs): Promise<void> {
  if (tradingPausedReason) return;
  if (inFlight.has(pkg.key) || alreadyOpen.has(pkg.key)) return;
  const executionTokens = [pkg.broadYesToken, pkg.narrowNoToken].filter(Boolean);
  if (quarantinedPackages.has(pkg.key) || executionTokens.some((tokenId) => quarantinedTokens.has(tokenId))) {
    const now = Date.now();
    const last = lastSkipLogAt.get(pkg.key) ?? 0;
    if (now - last >= SKIP_LOG_THROTTLE_MS) {
      lastSkipLogAt.set(pkg.key, now);
      log(`skip ${pkg.key}: quarantined large-naked-leg market/package`);
    }
    return;
  }
  if (executionTokens.some((tokenId) => tokensInFlight.has(tokenId))) {
    const now = Date.now();
    const last = lastSkipLogAt.get(pkg.key) ?? 0;
    if (now - last >= SKIP_LOG_THROTTLE_MS) {
      lastSkipLogAt.set(pkg.key, now);
      log(`skip ${pkg.key}: shared token already executing`);
    }
    return;
  }
  const sportsBlock = sportsExecutionBlocked(pkg.base);
  if (sportsBlock) {
    const now = Date.now();
    const last = lastSkipLogAt.get(pkg.key) ?? 0;
    if (now - last >= SKIP_LOG_THROTTLE_MS) {
      lastSkipLogAt.set(pkg.key, now);
      log(`skip ${pkg.key}: ${sportsBlock}`);
    }
    return;
  }
  if (perMinuteCapReached()) return;
  if (lowBalance()) {
    if (!pausedForLowBalanceLogged) {
      log(`paused: cached funder balance=${cachedFunderBalance.toFixed(4)} allowance=${cachedFunderAllowance.toFixed(2)} < min marketable buy $${MIN_MARKETABLE_BUY_USD}; skipping new entries until refresh`);
      pausedForLowBalanceLogged = true;
    }
    return;
  }

  const packageRows = readJsonArray<LivePackage>(PACKAGES_PATH);
  if (daemonOpenPackageCount(packageRows) >= MAX_OPEN_PACKAGES) return;

  let c = liveCandidate(pkg.base, legs);
  if (isSportsCandidate(c)) {
    try {
      c = await freshSportsCandidate(c);
    } catch (err: any) {
      const now = Date.now();
      const last = lastSkipLogAt.get(pkg.key) ?? 0;
      if (now - last >= SKIP_LOG_THROTTLE_MS) {
        lastSkipLogAt.set(pkg.key, now);
        log(`skip ${pkg.key}: sports_preflight_failed ${err?.message ?? String(err)}`);
      }
      return;
    }
    if (!passesDynamicGate(c)) {
      const now = Date.now();
      const last = lastSkipLogAt.get(pkg.key) ?? 0;
      if (now - last >= SKIP_LOG_THROTTLE_MS) {
        lastSkipLogAt.set(pkg.key, now);
        const rangeBlock = juneBreakevenRangeBlock(c);
        log(`skip ${pkg.key}: sports_preflight_gate edge=${(c.lockedEdge * 100).toFixed(2)}c size=${c.availableSize.toFixed(2)} spread=${c.maxSpread.toFixed(4)} cost=${c.packageCost.toFixed(4)}${rangeBlock ? ` ${rangeBlock}` : ""}`);
      }
      return;
    }
  }
  const rangeBlock = juneBreakevenRangeBlock(c);
  if (rangeBlock) {
    const now = Date.now();
    const last = lastSkipLogAt.get(pkg.key) ?? 0;
    if (now - last >= SKIP_LOG_THROTTLE_MS) {
      lastSkipLogAt.set(pkg.key, now);
      log(`skip ${pkg.key}: ${rangeBlock} edge=${(c.lockedEdge * 100).toFixed(2)}c cost=${c.packageCost.toFixed(4)}`);
    }
    return;
  }
  const executionCandidate = executionSizingCandidate(c);
  const spendableUsd = spendableUsdAfterReservations();
  const sized = sizeForCandidate(executionCandidate, packageRows, sizingSpendableUsd(executionCandidate, spendableUsd));
  if (sized.reason) {
    const now = Date.now();
    const last = lastSkipLogAt.get(pkg.key) ?? 0;
    if (now - last >= SKIP_LOG_THROTTLE_MS) {
      lastSkipLogAt.set(pkg.key, now);
      log(`skip ${pkg.key}: ${sized.reason} shares=${sized.shares.toFixed(2)} cost=$${sized.cost.toFixed(4)}`);
    }
    return;
  }

  if (DRY_RUN) {
    log(`DRY_RUN arb ${pkg.key} edge=${(c.lockedEdge * 100).toFixed(2)}c size=${c.availableSize.toFixed(2)} shares=${sized.shares.toFixed(2)} cost=$${sized.cost.toFixed(4)}`);
    alreadyOpen.add(pkg.key); // avoid spamming the same package every tick in dry-run
    return;
  }

  if (alreadyOpen.has(pkg.key) || inFlight.has(pkg.key) || executionTokens.some((tokenId) => tokensInFlight.has(tokenId))) {
    log(`skip ${pkg.key}: execution lock acquired by another tick after preflight`);
    return;
  }
  await refreshBalance();
  const freshPackageRows = readJsonArray<LivePackage>(PACKAGES_PATH);
  refreshAlreadyOpen();
  if (alreadyOpen.has(pkg.key) || inFlight.has(pkg.key) || executionTokens.some((tokenId) => tokensInFlight.has(tokenId))) {
    log(`skip ${pkg.key}: blocked after fresh preflight (open package/orphan or shared token)`);
    return;
  }
  const freshSpendableUsd = spendableUsdAfterReservations();
  const freshSized = sizeForCandidate(executionCandidate, freshPackageRows, sizingSpendableUsd(executionCandidate, freshSpendableUsd));
  if (freshSized.reason) {
    const now = Date.now();
    const last = lastSkipLogAt.get(pkg.key) ?? 0;
    if (now - last >= SKIP_LOG_THROTTLE_MS) {
      lastSkipLogAt.set(pkg.key, now);
      log(`skip ${pkg.key}: fresh_${freshSized.reason} shares=${freshSized.shares.toFixed(2)} cost=$${freshSized.cost.toFixed(4)} reserved=$${reservedSpendUsd.toFixed(4)} spendable=$${spendableUsdAfterReservations().toFixed(4)}`);
    }
    return;
  }
  const freshReservedUsd = reservedUsdForSized(executionCandidate, freshSized.cost);
  if (Number.isFinite(freshSpendableUsd) && freshReservedUsd > freshSpendableUsd + EPSILON) {
    const now = Date.now();
    const last = lastSkipLogAt.get(pkg.key) ?? 0;
    if (now - last >= SKIP_LOG_THROTTLE_MS) {
      lastSkipLogAt.set(pkg.key, now);
      log(`skip ${pkg.key}: sports_balance_headroom nominal=$${freshSized.cost.toFixed(4)} reserved=$${freshReservedUsd.toFixed(4)} spendable=$${freshSpendableUsd.toFixed(4)} shares=${freshSized.shares.toFixed(2)}`);
    }
    return;
  }
  reservedSpendUsd += freshReservedUsd;
  alreadyOpen.add(pkg.key);
  inFlight.add(pkg.key);
  for (const tokenId of executionTokens) tokensInFlight.add(tokenId);
  submitTimestamps.push(Date.now());
  try {
    await executeLive(pkg, executionCandidate, freshSized.shares);
  } catch (err: any) {
    log(`execute ${pkg.key} failed: ${err?.message ?? String(err)}`);
  } finally {
    reservedSpendUsd = Math.max(0, reservedSpendUsd - freshReservedUsd);
    inFlight.delete(pkg.key);
    for (const tokenId of executionTokens) tokensInFlight.delete(tokenId);
    refreshAlreadyOpen();
  }
}

async function executeLive(pkg: WatchPackage, c: Candidate, shares: number): Promise<void> {
  if (!clob) throw new Error("CLOB client not initialized");
  const sportsBlock = sportsExecutionBlocked(c);
  if (sportsBlock) throw new Error(`blocked_sports_non_atomic_execution: ${sportsBlock}`);
  const client = clob.client;
  const record = packageRecord(c, reconcileAddress, shares, false);
  const orders: LiveOrder[] = [];

  log(`ARB ${pkg.key} edge=${(c.lockedEdge * 100).toFixed(2)}c cost=${c.packageCost.toFixed(4)} shares=${shares.toFixed(2)} size=${c.availableSize.toFixed(2)}${isSportsCandidate(c) ? " sports_preflight=1 nba_batch=1" : ""}`);

  record.status = "leg1_submitted";
  record.updatedAt = new Date().toISOString();
  appendJsonArray(PACKAGES_PATH, [record]);

  const submitStartedMs = Date.now();
  let legacyBalanceBefore: { leg1: number; leg2: number } | null = null;
  if (!RESPONSE_FILL_FIRST) {
    const balanceStartedMs = Date.now();
    const [leg1Before, leg2Before] = await Promise.all([
      reconcileTokenBalance(reconcileAddress, pkg.broadYesToken),
      reconcileTokenBalance(reconcileAddress, pkg.narrowNoToken),
    ]);
    legacyBalanceBefore = { leg1: leg1Before, leg2: leg2Before };
    (record as any).latency = { preSubmitBalanceMs: Date.now() - balanceStartedMs, balanceMode: "pre_submit_balance" };
  } else {
    (record as any).latency = { preSubmitBalanceMs: 0, balanceMode: "submit_response_first" };
  }

  const signStartedMs = Date.now();
  const prepared = await Promise.all([
    prepareFakBuy(client, { role: "broad_yes", tokenId: pkg.broadYesToken, price: c.broad.yesBook.ask, shares }),
    prepareFakBuy(client, { role: "narrow_no", tokenId: pkg.narrowNoToken, price: c.narrow.noBook.ask, shares }),
  ]);
  const signOrdersMs = Date.now() - signStartedMs;

  // Fire BOTH FAK legs in the tightest configured form. Batch mode is the
  // default because it is a single CLOB request; parallel mode remains available
  // for A/B latency tests.
  const submittedAt = new Date().toISOString();
  const forceBatch = isSportsCandidate(c) && ENABLE_NBA_BATCH_EXECUTION;
  let r1: PromiseSettledResult<unknown>;
  let r2: PromiseSettledResult<unknown>;
  let postMode = forceBatch || MONOTONIC_POST_MODE === "batch" ? "batch" : "parallel";
  let postOrdersMs = 0;
  try {
    const posted = await postPreparedFakBuys(client, prepared, forceBatch);
    postMode = posted.postMode;
    postOrdersMs = posted.postOrdersMs;
    r1 = { status: "fulfilled", value: posted.responses[0] };
    r2 = { status: "fulfilled", value: posted.responses[1] };
  } catch (err) {
    postOrdersMs = Date.now() - (submitStartedMs + signOrdersMs);
    r1 = { status: "rejected", reason: err };
    r2 = { status: "rejected", reason: err };
  }
  Object.assign((record as any).latency, {
    signOrdersMs,
    postOrdersMs,
    submitPairMs: Date.now() - submitStartedMs,
    postMode,
  });

  const legErrors: string[] = [];
  let leg1Resp: unknown;
  let leg2Resp: unknown;
  if (r1.status === "fulfilled") {
    leg1Resp = r1.value;
    try { assertOrderResponse(r1.value, "broad_yes"); record.legOrderIds.broadYes = orderId(r1.value); }
    catch (e: any) { legErrors.push(`broad_yes:${e?.message ?? String(e)}`); }
  } else {
    leg1Resp = { error: r1.reason?.message ?? String(r1.reason) };
    legErrors.push(`broad_yes:${r1.reason?.message ?? String(r1.reason)}`);
  }
  if (r2.status === "fulfilled") {
    leg2Resp = r2.value;
    try { assertOrderResponse(r2.value, "narrow_no"); record.legOrderIds.narrowNo = orderId(r2.value); }
    catch (e: any) { legErrors.push(`narrow_no:${e?.message ?? String(e)}`); }
  } else {
    leg2Resp = { error: r2.reason?.message ?? String(r2.reason) };
    legErrors.push(`narrow_no:${r2.reason?.message ?? String(r2.reason)}`);
  }
  record.status = "leg2_submitted";
  record.updatedAt = new Date().toISOString();

  let leg1Filled = roundShares(responseBuyShares(leg1Resp));
  let leg2Filled = roundShares(responseBuyShares(leg2Resp));
  let fillSource = "submit_response";
  if (!RESPONSE_FILL_FIRST && legacyBalanceBefore) {
    const fillWaitStartedMs = Date.now();
    await Promise.all([
      waitForFill(pkg.broadYesToken, FILL_WAIT_DAEMON_MS),
      waitForFill(pkg.narrowNoToken, FILL_WAIT_DAEMON_MS),
    ]);
    const reconcileStartedMs = Date.now();
    const [leg1After, leg2After] = await Promise.all([
      reconcileTokenBalance(reconcileAddress, pkg.broadYesToken),
      reconcileTokenBalance(reconcileAddress, pkg.narrowNoToken),
    ]);
    leg1Filled = roundShares(leg1After - legacyBalanceBefore.leg1);
    leg2Filled = roundShares(leg2After - legacyBalanceBefore.leg2);
    fillSource = "balance_delta";
    Object.assign((record as any).latency, {
      fillWaitMs: reconcileStartedMs - fillWaitStartedMs,
      reconcileMs: Date.now() - reconcileStartedMs,
    });
  } else {
    Object.assign((record as any).latency, { fillWaitMs: 0, reconcileMs: 0 });
  }
  (record as any).fillSource = fillSource;
  orders.push({ packageId: record.packageId, createdAt: submittedAt, role: "broad_yes", tokenId: pkg.broadYesToken, side: "BUY", price: c.broad.yesBook.ask, size: leg1Filled, orderType: "FAK", response: leg1Resp });
  orders.push({ packageId: record.packageId, createdAt: submittedAt, role: "narrow_no", tokenId: pkg.narrowNoToken, side: "BUY", price: c.narrow.noBook.ask, size: leg2Filled, orderType: "FAK", response: leg2Resp });

  const matched = roundShares(Math.min(leg1Filled, leg2Filled));
  record.filledShares = matched;
  record.actualCost = (leg1Filled * averageBuyPrice(leg1Resp, c.broad.yesBook.ask)) + (leg2Filled * averageBuyPrice(leg2Resp, c.narrow.noBook.ask));
  record.guaranteedFloor = matched;
  record.lockedFloorProfit = matched * c.lockedEdge;
  record.jackpotPayout = matched * c.jackpotPayoutPerShare;

  // The matched portion is a genuine risk-free package and is booked complete.
  // Any excess on the over-filled leg is a NAKED leg: instead of holding it to a
  // directional resolution, we spin it off as an orphan for the completion/
  // unwind engine to re-pair across the ladder (or flatten on the tight stop).
  const nakedShares = roundShares(Math.abs(leg1Filled - leg2Filled));
  const nakedRole: "broad_yes" | "narrow_no" | null =
    leg1Filled > leg2Filled ? "broad_yes" : leg2Filled > leg1Filled ? "narrow_no" : null;
  const errSuffix = legErrors.length ? ` errors=${legErrors.join("; ")}` : "";
  if (legErrors.some((error) => error.toLowerCase().includes("maker address not allowed"))) {
    pauseNewEntries("wallet_flow_rejected: maker address not allowed; configure deposit-wallet maker/funder before resuming", {
      packageId: record.packageId,
      errors: legErrors,
    });
  }

  const sportsCandidate = isSportsCandidate(c);
  if (matched > 0) {
    record.status = "package_complete";
    if (nakedRole) {
      record.failureReason = sportsCandidate
        ? `partial_fill matched=${matched} naked_${nakedRole}=${nakedShares} -> sports_immediate_exit${errSuffix}`
        : `partial_fill matched=${matched} naked_${nakedRole}=${nakedShares} -> orphan${errSuffix}`;
    }
  } else {
    record.status = "unwind_required";
    record.failureReason = nakedRole
      ? sportsCandidate
        ? `naked_${nakedRole}=${nakedShares} -> sports_immediate_exit (no matched fill)${errSuffix}`
        : `naked_${nakedRole}=${nakedShares} -> orphan (no matched fill)${errSuffix}`
      : `no_fill both FAK legs killed (arb gone); no position${errSuffix}`;
  }
  record.updatedAt = new Date().toISOString();
  persist(record, orders);

  if (nakedRole && nakedShares >= SPORTS_ORPHAN_DUST_SHARES) {
    const orphan = registerOrphanFromExecution(c, nakedRole, nakedShares, record.packageId);
    if (nakedShares > MAX_NAKED_SHARES_BEFORE_PAUSE) {
      quarantinePackage(pkg, c, `large_naked_leg_detected: ${nakedRole}=${nakedShares} > dust=${MAX_NAKED_SHARES_BEFORE_PAUSE}`, {
        packageId: record.packageId,
        eventSlug: c.eventSlug,
        asset: c.asset,
        role: nakedRole,
        nakedShares,
        matched,
        intendedShares: shares,
        sports: sportsCandidate,
        orphanId: orphan.id,
        legErrors,
      });
    }
    if (sportsCandidate) {
      orphanInFlight.add(orphan.id);
      try {
        await doSportsImmediateUnwind(orphan, `sports_imbalance matched=${matched} intended=${shares}`);
      } finally {
        orphanInFlight.delete(orphan.id);
      }
    }
  }
  log(`package ${record.packageId} status=${record.status} leg1=${leg1Filled} leg2=${leg2Filled} matched=${matched.toFixed(2)} naked=${nakedShares.toFixed(2)}${nakedRole ? `(${nakedRole})` : ""} intended=${shares.toFixed(2)}`);
}

function persist(record: LivePackage, orders: LiveOrder[]) {
  const rows = readJsonArray<LivePackage>(PACKAGES_PATH).filter((row) => row.id !== record.id);
  writeJsonArray(PACKAGES_PATH, [...rows, record]);
  if (orders.length) appendJsonArray(ORDERS_PATH, orders);
}

// ─── Orphan inventory: re-pair a naked leg or unwind it ───
//
// Policy (operator-locked): a naked leg is NEVER held to a directional
// resolution. On each sweep we (1) bail immediately if the orphan's best bid
// has dropped ORPHAN_STOP_CENTS below our fill (tight stop = the dominant
// guard), (2) bail if the event ladder no longer contains ANY structurally
// valid complement (stranded), or we are within ORPHAN_EXPIRY_BUFFER_MS of the
// orphan market's own expiry; otherwise (3) we hunt the live ladder for a
// positive-EV complement (fillPrice + complementAsk < 1 - margin) and complete
// into it. The tight stop bounds downside, which is what makes the long
// hunt-until-expiry leash safe.

function loadOrphans() {
  for (const o of readJsonArray<Orphan>(ORPHANS_PATH)) {
    orphans.set(o.id, o);
    if (o.status === "completing") getBook(o.tokenId); // keep it subscribed
  }
}

function saveOrphans() {
  writeJsonArray(ORPHANS_PATH, [...orphans.values()]);
}

function activeOrphans(): Orphan[] {
  return [...orphans.values()].filter((o) => o.status === "completing");
}

function registerOrphanFromExecution(c: Candidate, role: "broad_yes" | "narrow_no", shares: number, fromPackageId: string): Orphan {
  const now = new Date().toISOString();
  const leg = role === "broad_yes" ? c.broad : c.narrow;
  const tokenId = role === "broad_yes" ? c.broad.yesTokenId : c.narrow.noTokenId;
  const fillPrice = role === "broad_yes" ? c.broad.yesBook.ask : c.narrow.noBook.ask;
  const o: Orphan = {
    id: `ORPH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    packageId: fromPackageId,
    eventSlug: c.eventSlug,
    asset: c.asset,
    direction: c.direction,
    role,
    marketId: leg.marketId,
    tokenId,
    strike: leg.strike,
    fillPrice,
    shares: roundShares(shares),
    endDate: leg.endDate,
    resolutionSource: leg.resolutionSource,
    createdAt: now,
    updatedAt: now,
    status: "completing",
    attempts: 0,
  };
  orphans.set(o.id, o);
  getBook(o.tokenId);
  saveOrphans();
  log(`orphan ${o.id} OPEN role=${role} token=${tokenId.slice(0, 10)}… strike=${o.strike} shares=${o.shares} fill=${o.fillPrice.toFixed(4)} (re-pair target: complement on ${o.eventSlug})`);
  return o;
}

function orphanBestBid(o: Orphan): number {
  return topOfBook(o.tokenId).bid;
}

function orphanCompletionMargin(o: Orphan): number {
  return o.asset === "NBA" || o.eventSlug.startsWith("nba-")
    ? ORPHAN_COMPLETION_MARGIN
    : NON_SPORTS_ORPHAN_COMPLETION_MARGIN;
}

async function doSportsImmediateUnwind(o: Orphan, reason: string) {
  if (!clob || DRY_RUN) return;
  const client = clob.client;
  let bid = orphanBestBid(o);
  if (!(bid > 0)) {
    try {
      const raw = await fetchRawBook(o.tokenId);
      bid = raw.bids.reduce((b, l) => (l.price > b ? l.price : b), 0);
    } catch { /* keep 0 */ }
  }
  if (!(bid > 0)) {
    o.status = "stranded";
    o.note = `sports immediate exit failed: no bid (${reason})`;
    o.updatedAt = new Date().toISOString();
    saveOrphans();
    log(`orphan ${o.id} SPORTS_EXIT failed (${reason}): no bid`);
    return;
  }

  o.attempts += 1;
  log(`orphan ${o.id} SPORTS_EXIT (${reason}): FAK-sell ${o.shares} @ bid=${bid.toFixed(4)} fill=${o.fillPrice.toFixed(4)}`);
  const before = await reconcileTokenBalance(reconcileAddress, o.tokenId);
  let resp: unknown;
  try {
    resp = await postFakSell(client, o.tokenId, bid, o.shares);
    assertOrderResponse(resp, "sports_unwind");
  } catch (err: any) {
    resp = { error: err?.message ?? String(err) };
    log(`orphan ${o.id} sports exit order error: ${err?.message ?? String(err)}`);
  }
  await waitForFill(o.tokenId, FILL_WAIT_DAEMON_MS);
  const after = await reconcileTokenBalance(reconcileAddress, o.tokenId);
  const sold = roundShares(before - after);
  appendJsonArray(ORDERS_PATH, [{
    packageId: o.packageId,
    createdAt: new Date().toISOString(),
    role: "unwind",
    tokenId: o.tokenId,
    side: "SELL",
    price: bid,
    size: sold,
    orderType: "FAK",
    response: resp,
  }]);
  o.shares = roundShares(o.shares - sold);
  const realized = sold * (bid - o.fillPrice);
  o.note = `sports_immediate_exit sold=${sold} @ ${bid.toFixed(4)} realized=${realized.toFixed(4)} (${reason})`;
  o.status = o.shares + EPSILON < SPORTS_ORPHAN_DUST_SHARES ? "unwound" : "stranded";
  o.updatedAt = new Date().toISOString();
  saveOrphans();
  log(`orphan ${o.id} SPORTS_EXIT result sold=${sold} realized=${realized.toFixed(4)} residual=${o.shares}`);
}

// Reactive tight stop, fired off the market-WS hot path: the moment a held
// orphan's bid drops below fill - ORPHAN_STOP_CENTS, flatten it.
function maybeOrphanStop(tokenId: string) {
  if (DRY_RUN) return;
  for (const o of orphans.values()) {
    if (o.status !== "completing" || o.tokenId !== tokenId) continue;
    if (orphanInFlight.has(o.id)) continue;
    const bid = orphanBestBid(o);
    if (bid > 0 && bid + EPSILON <= o.fillPrice - ORPHAN_STOP_CENTS) {
      orphanInFlight.add(o.id);
      void doUnwind(o, `price_ran_away bid=${bid.toFixed(4)} fill=${o.fillPrice.toFixed(4)} stop=${ORPHAN_STOP_CENTS}`)
        .finally(() => orphanInFlight.delete(o.id));
    }
  }
}

// Fetch the orphan's event ladder live (throttled + shared per event) so the
// completion search runs against the CURRENT set of strikes, not a stale
// snapshot — a growing ladder helps, a shrunk one strands us.
async function orphanLadder(o: Orphan): Promise<MarketQuote[]> {
  const cached = orphanEventCache.get(o.eventSlug);
  if (cached && Date.now() - cached.at < ORPHAN_LADDER_REFRESH_MS) return cached.quotes;
  let event: GammaEvent | null = null;
  try {
    event = await fetchEvent(arbConfig, o.eventSlug);
  } catch (err: any) {
    log(`orphan ${o.id} ladder fetch failed: ${err?.message ?? String(err)}`);
    return cached?.quotes ?? [];
  }
  if (!event) return cached?.quotes ?? [];
  // Ensure the orphan carries an asset (older records / safety) for evaluatePair's allowlist gate.
  if (!o.asset) o.asset = polymarketAssetForSlug(event.slug ?? "") || o.asset;
  const quotes = (await Promise.all((event.markets ?? []).map(async (m) => {
    try { return await marketQuote(arbConfig, event!, m); } catch { return null; }
  }))).filter((q): q is MarketQuote => q !== null);
  orphanEventCache.set(o.eventSlug, { at: Date.now(), quotes });
  orphanLadderAt.set(o.id, Date.now());
  return quotes;
}

interface CompletionPick {
  candidate: Candidate;
  complementToken: string;
  complementAsk: number;
  completionShares: number;
  completionEdge: number;
}

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scale = 10 ** decimals;
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-7;
}

function clobBuyAmountValid(price: number, shares: number): boolean {
  return hasAtMostDecimals(price * shares, 2) && hasAtMostDecimals(shares, 5);
}

function precisionSafeCompletionShares(price: number, minShares: number, maxShares: number): number | null {
  const maxCents = Math.floor((maxShares * price + EPSILON) * 100);
  const minCents = Math.ceil((minShares * price - EPSILON) * 100);
  for (let cents = maxCents; cents >= minCents; cents -= 1) {
    const shares = Math.floor(((cents / 100) / price) * 100_000) / 100_000;
    if (shares + EPSILON < minShares || shares - EPSILON > maxShares) continue;
    if (clobBuyAmountValid(price, shares)) return shares;
  }
  return null;
}

// Build the structurally-valid complement set for an orphan over a live ladder
// and pick the best positive-EV completion. Returns the structural count so the
// caller can distinguish "no valid complement exists" (stranded -> unwind) from
// "complements exist but none is positive-EV right now" (keep hunting).
function findCompletion(o: Orphan, quotes: MarketQuote[]): { pick: CompletionPick | null; structuralCount: number } {
  const self = quotes.find((q) => q.marketId === o.marketId);
  if (!self) return { pick: null, structuralCount: 0 }; // orphan market itself gone from ladder
  const now = new Date().toISOString();
  let structuralCount = 0;
  let best: CompletionPick | null = null;
  for (const q of quotes) {
    if (q.marketId === o.marketId || q.direction !== o.direction) continue;
    const broad = o.role === "broad_yes" ? self : q;
    const narrow = o.role === "broad_yes" ? q : self;
    // Nesting must hold for the $1 floor: above -> narrow strike higher; below -> lower.
    const nested = o.direction === "above" ? narrow.strike > broad.strike : narrow.strike < broad.strike;
    if (!nested) continue;
    const pair = evaluatePair(arbConfig, o.asset, broad, narrow, now);
    // Only expiry/resolution mismatches break the guarantee; ignore the entry
    // gates (edge/spread/liquidity/size) — completion EV is judged on sunk cost.
    if (pair.rejectionReasons.includes("expiry_mismatch") || pair.rejectionReasons.includes("resolution_mismatch")) continue;
    structuralCount += 1;
    const compBook = o.role === "broad_yes" ? narrow.noBook : broad.yesBook;
    const complementAsk = compBook.ask;
    if (!(complementAsk > 0)) continue;
    const completionEdge = 1 - (o.fillPrice + complementAsk);
    if (completionEdge <= orphanCompletionMargin(o)) continue;
    const completionShares = precisionSafeCompletionShares(
      complementAsk,
      compBook.minOrderSize,
      Math.min(o.shares, compBook.askSize),
    );
    if (!completionShares) continue;
    if (!best || completionEdge > best.completionEdge) {
      best = {
        candidate: pair,
        complementToken: o.role === "broad_yes" ? narrow.noTokenId : broad.yesTokenId,
        complementAsk,
        completionShares,
        completionEdge,
      };
    }
  }
  return { pick: best, structuralCount };
}

async function processOrphan(o: Orphan) {
  if (orphanInFlight.has(o.id)) return;
  orphanInFlight.add(o.id);
  try {
    if (o.shares + EPSILON < ORPHAN_MIN_SHARES) { // dust — flatten it
      await doUnwind(o, `dust shares=${o.shares}`);
      return;
    }
    // Expiry guard: never roll into a directional settlement.
    if (o.endDate) {
      const t = Date.parse(o.endDate);
      if (Number.isFinite(t) && Date.now() >= t - ORPHAN_EXPIRY_BUFFER_MS) {
        await doUnwind(o, `near_expiry endDate=${o.endDate}`);
        return;
      }
    }
    // Tight price stop (also checked reactively on the WS hot path).
    const bid = orphanBestBid(o);
    if (bid > 0 && bid + EPSILON <= o.fillPrice - ORPHAN_STOP_CENTS) {
      await doUnwind(o, `price_ran_away bid=${bid.toFixed(4)} fill=${o.fillPrice.toFixed(4)}`);
      return;
    }
    const quotes = await orphanLadder(o);
    if (quotes.length === 0) return; // transient fetch failure; retry next sweep
    const { pick, structuralCount } = findCompletion(o, quotes);
    if (structuralCount === 0) {
      await doUnwind(o, "stranded no structurally-valid complement in ladder");
      return;
    }
    if (pick) await doCompletion(o, pick);
    else if (await maybeTopUpDustAndExit(o, "no_positive_completion")) return;
    else await maybePostNoLossExitLimit(o, "no_positive_completion");
    // else: complements exist but none positive-EV/no-loss exit — keep holding. Lossy exits require an explicit env allowance.
  } finally {
    orphanInFlight.delete(o.id);
  }
}

// Buy the chosen complement to re-pair the orphan into a positive-EV package.
// Caller owns the orphanInFlight guard.
async function doCompletion(o: Orphan, pick: CompletionPick) {
  if (!clob || DRY_RUN) return;
  const client = clob.client;
  {
    o.attempts += 1;
    log(`orphan ${o.id} COMPLETE attempt: buy complement ${pick.complementToken.slice(0, 10)}… ask=${pick.complementAsk.toFixed(4)} edge=${(pick.completionEdge * 100).toFixed(2)}c shares=${pick.completionShares} orphanShares=${o.shares}`);
    const before = await reconcileTokenBalance(reconcileAddress, pick.complementToken);
    let resp: unknown;
    try {
      resp = await postFakBuy(client, pick.complementToken, pick.complementAsk, pick.completionShares);
      assertOrderResponse(resp, "completion");
    } catch (err: any) {
      resp = { error: err?.message ?? String(err) };
      log(`orphan ${o.id} completion order error: ${err?.message ?? String(err)}`);
    }
    await waitForFill(pick.complementToken, FILL_WAIT_DAEMON_MS);
    const after = await reconcileTokenBalance(reconcileAddress, pick.complementToken);
    const filled = roundShares(after - before);
    const matched = roundShares(Math.min(o.shares, filled));

    const order: LiveOrder = {
      packageId: pick.candidate.packageId,
      createdAt: new Date().toISOString(),
      role: "completion",
      tokenId: pick.complementToken,
      side: "BUY",
      price: pick.complementAsk,
      size: filled,
      orderType: "FAK",
      response: resp,
    };

    if (matched >= 0.01) {
      const record = packageRecord(pick.candidate, reconcileAddress, matched, false);
      record.status = "package_complete";
      record.filledShares = matched;
      record.actualCost = matched * o.fillPrice + filled * pick.complementAsk;
      record.guaranteedFloor = matched;
      record.lockedFloorProfit = matched * pick.completionEdge;
      record.jackpotPayout = matched * pick.candidate.jackpotPayoutPerShare;
      record.failureReason = `completed_from_orphan ${o.id} (re-paired naked ${o.role})`;
      record.updatedAt = new Date().toISOString();
      persist(record, [order]);
      o.shares = roundShares(o.shares - matched);
      o.note = `completed ${matched} via ${pick.complementToken.slice(0, 10)}…`;
      log(`orphan ${o.id} COMPLETED ${matched} shares edge=${(pick.completionEdge * 100).toFixed(2)}c; residual=${o.shares}`);
    } else {
      appendJsonArray(ORDERS_PATH, [order]);
      log(`orphan ${o.id} completion filled 0 (complement ask moved); will retry`);
    }
    if (o.shares + EPSILON < ORPHAN_MIN_SHARES) o.status = "completed";
    o.updatedAt = new Date().toISOString();
    saveOrphans();
  }
}

// If residual orphan dust is below the market's minimum SELL size, it cannot be
// flattened directly. Top up the same token only when the top-up order is
// CLOB-valid and the combined position can immediately sell at breakeven or
// better. Otherwise we leave the dust under the normal stop/completion watch.
async function maybeTopUpDustAndExit(o: Orphan, reason: string): Promise<boolean> {
  if (!clob || DRY_RUN) return false;
  const last = dustExitAttemptAt.get(o.id) ?? 0;
  if (Date.now() - last < DUST_EXIT_RETRY_MS) return false;
  const client = clob.client;
  const book = await fetchBook(arbConfig, o.tokenId);
  if (o.shares + EPSILON >= book.minOrderSize) return false;
  if (!(book.ask > 0) || !(book.bid > 0)) return false;
  const deficit = Math.max(0, book.minOrderSize - o.shares);
  const topUpShares = Math.max(book.minOrderSize, Math.ceil((deficit - EPSILON) * 100_000) / 100_000);
  const maxTopUpPrice = Math.floor(((book.bid * (o.shares + topUpShares)) - (o.shares * o.fillPrice) + EPSILON) / topUpShares * 1000) / 1000;
  if (!(maxTopUpPrice > 0)) return false;
  const topUpPrice = Math.min(book.ask, maxTopUpPrice);
  if (!(topUpPrice > 0)) return false;

  const combinedShares = roundShares(o.shares + topUpShares);
  const avgCost = ((o.shares * o.fillPrice) + (topUpShares * topUpPrice)) / combinedShares;
  const noLossSellPrice = Math.ceil((avgCost - EPSILON) * 1000) / 1000;
  if (book.bid + EPSILON < noLossSellPrice || book.bidSize + EPSILON < combinedShares) return false;

  o.attempts += 1;
  dustExitAttemptAt.set(o.id, Date.now());
  log(`orphan ${o.id} DUST_EXIT (${reason}): limit top-up ${topUpShares} @ ${topUpPrice.toFixed(4)} then sell ${combinedShares} @ ${noLossSellPrice.toFixed(4)} avg=${avgCost.toFixed(6)}`);
  const before = await reconcileTokenBalance(reconcileAddress, o.tokenId);
  let buyResp: unknown;
  let topUpOrderId: string | undefined;
  try {
    buyResp = await postLimitBuy(client, o.tokenId, topUpPrice, topUpShares);
    assertOrderResponse(buyResp, "dust_topup");
    topUpOrderId = orderId(buyResp);
  } catch (err: any) {
    buyResp = { error: err?.message ?? String(err) };
    log(`orphan ${o.id} dust top-up error: ${err?.message ?? String(err)}`);
  }
  await waitForFill(o.tokenId, DUST_EXIT_LIMIT_WAIT_MS);
  if (topUpOrderId) {
    try { await client.cancelOrder({ orderID: topUpOrderId }); }
    catch (err: any) { log(`orphan ${o.id} dust top-up cancel warning: ${err?.message ?? String(err)}`); }
  }
  const afterBuy = await reconcileTokenBalance(reconcileAddress, o.tokenId);
  const bought = roundShares(afterBuy - before);
  const buyOrder: LiveOrder = {
    packageId: o.packageId,
    createdAt: new Date().toISOString(),
    role: "completion",
    tokenId: o.tokenId,
    side: "BUY",
    price: topUpPrice,
    size: bought,
    orderType: "GTC",
    response: buyResp,
  };
  appendJsonArray(ORDERS_PATH, [buyOrder]);
  if (bought <= 0) {
    o.note = `dust top-up filled 0 (${reason})`;
    o.updatedAt = new Date().toISOString();
    saveOrphans();
    return true;
  }

  const sellShares = roundShares(o.shares + bought);
  const realizedIfSold = sellShares * noLossSellPrice - (o.shares * o.fillPrice) - (bought * topUpPrice);
  if (realizedIfSold + EPSILON < 0) {
    o.shares = sellShares;
    o.note = `dust top-up bought=${bought}; no-loss sell no longer available`;
    o.updatedAt = new Date().toISOString();
    saveOrphans();
    log(`orphan ${o.id} DUST_EXIT deferred after top-up: sell would lose ${realizedIfSold.toFixed(4)} residual=${o.shares}`);
    return true;
  }
  let sellResp: unknown;
  try {
    sellResp = await postFakSell(client, o.tokenId, noLossSellPrice, sellShares);
    assertOrderResponse(sellResp, "dust_exit");
  } catch (err: any) {
    sellResp = { error: err?.message ?? String(err) };
    log(`orphan ${o.id} dust exit sell error: ${err?.message ?? String(err)}`);
  }
  await waitForFill(o.tokenId, FILL_WAIT_DAEMON_MS);
  const afterSell = await reconcileTokenBalance(reconcileAddress, o.tokenId);
  const sold = roundShares(afterBuy - afterSell);
  const sellOrder: LiveOrder = {
    packageId: o.packageId,
    createdAt: new Date().toISOString(),
    role: "unwind",
    tokenId: o.tokenId,
    side: "SELL",
    price: noLossSellPrice,
    size: sold,
    orderType: "FAK",
    response: sellResp,
  };
  appendJsonArray(ORDERS_PATH, [sellOrder]);

  const realized = sold * noLossSellPrice - Math.min(sold, o.shares) * o.fillPrice - Math.max(0, sold - o.shares) * topUpPrice;
  o.shares = roundShares(o.shares + bought - sold);
  o.note = `dust_exit bought=${bought} sold=${sold} realized=${realized.toFixed(4)} (${reason})`;
  if (o.shares + EPSILON < ORPHAN_MIN_SHARES) o.status = sold > 0 ? "unwound" : "stranded";
  o.updatedAt = new Date().toISOString();
  saveOrphans();
  log(`orphan ${o.id} DUST_EXIT result bought=${bought} sold=${sold} realized=${realized.toFixed(4)} residual=${o.shares}`);
  return true;
}


async function maybePostNoLossExitLimit(o: Orphan, reason: string): Promise<boolean> {
  if (!clob || DRY_RUN) return false;
  if ((o as any).noLossSellOrderId) return true;
  const last = dustExitAttemptAt.get(`${o.id}:no_loss_exit`) ?? 0;
  if (Date.now() - last < DUST_EXIT_RETRY_MS) return false;
  const book = await fetchBook(arbConfig, o.tokenId);
  if (o.shares + EPSILON < book.minOrderSize) return false;
  const minExitPrice = Math.max(0.001, Math.ceil((o.fillPrice - ORPHAN_MAX_UNWIND_LOSS_CENTS - EPSILON) * 1000) / 1000);
  dustExitAttemptAt.set(`${o.id}:no_loss_exit`, Date.now());
  o.attempts += 1;
  log(`orphan ${o.id} NO_LOSS_EXIT (${reason}): rest SELL ${o.shares} @ ${minExitPrice.toFixed(4)} fill=${o.fillPrice.toFixed(4)} maxLoss=${ORPHAN_MAX_UNWIND_LOSS_CENTS.toFixed(4)}`);
  let resp: unknown;
  try {
    resp = await postLimitSell(clob.client, o.tokenId, minExitPrice, o.shares);
    assertOrderResponse(resp, "no_loss_exit");
    (o as any).noLossSellOrderId = orderId(resp);
  } catch (err: any) {
    resp = { error: err?.message ?? String(err) };
    log(`orphan ${o.id} no-loss exit order error: ${err?.message ?? String(err)}`);
  }
  appendJsonArray(ORDERS_PATH, [{
    packageId: o.packageId,
    createdAt: new Date().toISOString(),
    role: "unwind",
    tokenId: o.tokenId,
    side: "SELL",
    price: minExitPrice,
    size: 0,
    orderType: "GTC",
    response: resp,
  }]);
  o.note = `no_loss_exit resting @ ${minExitPrice.toFixed(4)} (${reason})`;
  o.updatedAt = new Date().toISOString();
  saveOrphans();
  return true;
}

// FAK-sell the orphan to flatten it. Caller owns the orphanInFlight guard.
async function doUnwind(o: Orphan, reason: string) {
  if (!clob || DRY_RUN) return;
  const client = clob.client;
  {
    let bid = orphanBestBid(o);
    if (!(bid > 0)) {
      try {
        const raw = await fetchRawBook(o.tokenId);
        bid = raw.bids.reduce((b, l) => (l.price > b ? l.price : b), 0);
      } catch { /* keep 0 */ }
    }
    const minExitPrice = Math.max(0.001, Math.ceil((o.fillPrice - ORPHAN_MAX_UNWIND_LOSS_CENTS - EPSILON) * 1000) / 1000);
    if (!(bid > 0)) {
      log(`orphan ${o.id} unwind deferred (${reason}): no bid to sell into`);
      await maybePostNoLossExitLimit(o, reason);
      return; // stay "completing"; retry next sweep
    }
    if (bid + EPSILON < minExitPrice) {
      log(`orphan ${o.id} unwind blocked (${reason}): bid=${bid.toFixed(4)} minExit=${minExitPrice.toFixed(4)} fill=${o.fillPrice.toFixed(4)}`);
      await maybePostNoLossExitLimit(o, reason);
      return;
    }
    o.attempts += 1;
    log(`orphan ${o.id} UNWIND (${reason}): FAK-sell ${o.shares} @ bid=${bid.toFixed(4)} fill=${o.fillPrice.toFixed(4)} minExit=${minExitPrice.toFixed(4)}`);
    const before = await reconcileTokenBalance(reconcileAddress, o.tokenId);
    let resp: unknown;
    try {
      resp = await postFakSell(client, o.tokenId, bid, o.shares);
      assertOrderResponse(resp, "unwind");
    } catch (err: any) {
      resp = { error: err?.message ?? String(err) };
      log(`orphan ${o.id} unwind order error: ${err?.message ?? String(err)}`);
    }
    await waitForFill(o.tokenId, FILL_WAIT_DAEMON_MS);
    const after = await reconcileTokenBalance(reconcileAddress, o.tokenId);
    const sold = roundShares(before - after);
    const order: LiveOrder = {
      packageId: o.packageId,
      createdAt: new Date().toISOString(),
      role: "unwind",
      tokenId: o.tokenId,
      side: "SELL",
      price: bid,
      size: sold,
      orderType: "FAK",
      response: resp,
    };
    appendJsonArray(ORDERS_PATH, [order]);
    o.shares = roundShares(o.shares - sold);
    const realized = sold * (bid - o.fillPrice);
    o.note = `unwound ${sold} @ ${bid.toFixed(4)} realized=${realized.toFixed(4)} (${reason})`;
    if (o.shares + EPSILON < ORPHAN_MIN_SHARES) o.status = sold > 0 ? "unwound" : "stranded";
    o.updatedAt = new Date().toISOString();
    saveOrphans();
    log(`orphan ${o.id} ${o.status} sold=${sold} realized=${realized.toFixed(4)} residual=${o.shares}`);
  }
}

function orphanLoop() {
  if (DRY_RUN) return;
  for (const o of activeOrphans()) void processOrphan(o);
}

async function reconcileOrphansAtStartup() {
  if (DRY_RUN || !reconcileAddress) return;
  for (const o of activeOrphans()) {
    try {
      const bal = await reconcileTokenBalance(reconcileAddress, o.tokenId);
      if (bal + EPSILON < ORPHAN_MIN_SHARES) {
        o.status = "completed"; // position no longer held (settled/sold elsewhere)
        o.note = `closed at startup: on-chain balance=${bal}`;
      } else if (bal + EPSILON < o.shares) {
        o.shares = roundShares(bal); // trust on-chain as the authority
      }
      o.updatedAt = new Date().toISOString();
    } catch (err: any) {
      log(`orphan ${o.id} startup reconcile failed: ${err?.message ?? String(err)}`);
    }
  }
  saveOrphans();
  const active = activeOrphans().length;
  if (active) log(`orphans: ${active} active (completing) loaded`);
}

// ─── Evaluation entry point (called on every relevant book delta) ───

function evaluateToken(tokenId: string) {
  const keys = tokenToPackages.get(tokenId);
  if (!keys || keys.size === 0) return;
  for (const key of keys) {
    const pkg = packages.get(key);
    if (!pkg) continue;
    const legs = liveLegs(pkg);
    if (!legs) continue;
    const candidate = liveCandidate(pkg.base, legs);
    recordNearMiss(candidate);
    if (!passesDynamicGate(candidate)) continue;
    void tryExecute(pkg, legs);
  }
}

// ─── Market websocket ───

function handleMarketMessage(raw: WebSocket.RawData) {
  let data: any;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const messages: any[] = Array.isArray(data) ? data : [data];
  const touched = new Set<string>();
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const eventType = msg.event_type ?? msg.type;

    // Full book snapshot
    if (eventType === "book" || (msg.asset_id && (msg.bids || msg.asks || msg.buys || msg.sells))) {
      const tokenId = msg.asset_id;
      if (!tokenId) continue;
      const toLevels = (rows: any) => (Array.isArray(rows) ? rows : [])
        .map((r: any) => ({ price: Number(r.price), size: Number(r.size) }))
        .filter((r: any) => Number.isFinite(r.price) && Number.isFinite(r.size));
      applySnapshot(tokenId, toLevels(msg.bids ?? msg.buys), toLevels(msg.asks ?? msg.sells));
      touched.add(tokenId);
      continue;
    }

    // Incremental level changes (price_changes / changes)
    const changes: any[] = msg.price_changes ?? msg.changes ?? [];
    for (const ch of changes) {
      const tokenId = ch.asset_id ?? msg.asset_id;
      if (!tokenId) continue;
      applyLevelChange(tokenId, String(ch.side ?? ""), Number(ch.price), Number(ch.size));
      touched.add(tokenId);
    }
  }
  for (const tokenId of touched) {
    evaluateToken(tokenId);
    maybeOrphanStop(tokenId);
  }
}

function connectMarketWs(attempt = 0) {
  if (shuttingDown) return;
  const tokens = watchedTokens();
  if (tokens.length === 0) {
    setTimeout(() => connectMarketWs(0), 5_000);
    return;
  }
  const ws = new WebSocket(MARKET_WS_URL);
  marketWs = ws;
  let ping: ReturnType<typeof setInterval> | undefined;
  let healthy = false;

  ws.on("open", async () => {
    healthy = true;
    log(`market WS connected; subscribing ${tokens.length} tokens`);
    ws.send(JSON.stringify({ assets_ids: tokens, type: "market" }));
    ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("PING");
    }, PING_MS);
    // Re-seed every book over REST so depth (and thus ask size) is accurate
    // even before the first delta arrives.
    await seedBooks(tokens);
  });
  ws.on("message", (raw) => handleMarketMessage(raw));
  ws.on("error", (err) => log(`market WS error: ${err.message}`));
  ws.on("close", () => {
    if (ping) clearInterval(ping);
    if (shuttingDown) return;
    // A healthy connection that closed (e.g. our watchlist-refresh cycle or a
    // transient drop) reconnects immediately; only genuine connect failures use
    // exponential backoff.
    const nextAttempt = healthy ? 0 : attempt + 1;
    const delay = healthy ? RECONNECT_BASE_MS : Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
    log(`market WS closed; reconnecting in ${delay}ms`);
    setTimeout(() => connectMarketWs(nextAttempt), delay);
  });
}

async function seedBooks(tokens: string[]) {
  for (const tokenId of tokens) {
    try {
      const { bids, asks } = await fetchRawBook(tokenId);
      applySnapshot(tokenId, bids, asks);
      evaluateToken(tokenId);
    } catch {
      // ignore; the WS snapshot/deltas will populate it
    }
  }
}

// ─── User websocket (instant fills) ───

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
    // MATCHED / CONFIRMED both mean shares moved; signal the waiter so leg
    // sizing proceeds immediately instead of waiting the full fill window.
    if (tokenId && (status === "MATCHED" || status === "CONFIRMED" || !status)) {
      signalFill(tokenId);
    }
  }
}

async function fetchConditionIds(): Promise<string[]> {
  const marketIds = new Set<string>();
  for (const pkg of packages.values()) {
    marketIds.add(pkg.base.broad.marketId);
    marketIds.add(pkg.base.narrow.marketId);
  }
  const conditionIds = new Set<string>();
  for (const id of marketIds) {
    try {
      const res = await fetch(`${GAMMA_API}/markets/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json", "User-Agent": "polymarket-arb-daemon/1.0" },
      });
      if (!res.ok) continue;
      const market = await res.json() as { conditionId?: string };
      if (market?.conditionId) conditionIds.add(market.conditionId);
    } catch {
      // best effort; fills still reconcile via RPC
    }
  }
  return [...conditionIds];
}

async function connectUserWs(attempt = 0) {
  if (shuttingDown || DRY_RUN || !clob) return;
  const conditionIds = await fetchConditionIds();
  const ws = new WebSocket(USER_WS_URL);
  userWs = ws;
  let ping: ReturnType<typeof setInterval> | undefined;
  let healthy = false;

  ws.on("open", () => {
    healthy = true;
    log(`user WS connected; subscribing ${conditionIds.length} markets`);
    ws.send(JSON.stringify({
      auth: { apiKey: clob!.creds.key, secret: clob!.creds.secret, passphrase: clob!.creds.passphrase },
      markets: conditionIds,
      type: "user",
    }));
    ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("PING");
    }, PING_MS);
  });
  ws.on("message", (raw) => handleUserMessage(raw));
  ws.on("error", (err) => log(`user WS error: ${err.message}`));
  ws.on("close", () => {
    if (ping) clearInterval(ping);
    if (shuttingDown) return;
    const nextAttempt = healthy ? 0 : attempt + 1;
    const delay = healthy ? RECONNECT_BASE_MS : Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
    setTimeout(() => connectUserWs(nextAttempt), delay);
  });
}

// ─── Periodic off-hot-path work ───

async function refreshBalance() {
  const funder = POLYMARKET_FUNDER_ADDRESS ?? reconcileAddress;
  if (!funder) return;
  try {
    const probe = await proxyCollateralProbe(funder);
    cachedFunderBalance = probe.collateralBalance;
    cachedFunderAllowance = probe.exchangeV2Allowance;
    balanceKnown = true;
    if (!lowBalance()) pausedForLowBalanceLogged = false;
    log(`balance refresh: pUSD=${cachedFunderBalance.toFixed(6)} exchangeV2Allowance=${cachedFunderAllowance.toFixed(2)}`);
  } catch (err: any) {
    log(`balance refresh failed (keeping last known=${balanceKnown}): ${err?.message ?? String(err)}`);
  }
}

function flushLedger() {
  if (!GIT_PUSH) return;
  const child = spawn("bash", ["-lc", "git add data/polymarket-live-packages.json data/polymarket-live-orders.json data/polymarket-live-orphans.json data/archive 2>/dev/null && git diff --cached --quiet || git commit -m 'arb-daemon: ledger update' -q && git push -q"], {
    stdio: "ignore",
    detached: false,
  });
  child.on("error", (err) => log(`ledger git push failed: ${err.message}`));
}

// ─── Startup ───

async function main() {
  installHttpKeepAlive();
  log(`starting; mode=${DRY_RUN ? "DRY_RUN" : "REAL"} enabled=${ENABLED} hardDisabled=${HARD_DISABLED}`);
  log(`gates: maxPackage=$${MAX_PACKAGE_USD} maxDaily=$${MAX_DAILY_USD} maxOpen=${MAX_OPEN_PACKAGES} maxPerMin=${MAX_PER_MIN} minEdge=${(MIN_EDGE * 100).toFixed(2)}c minTouch=${MIN_AVAILABLE_SHARES} maxSpread=${MAX_SPREAD}`);
  log(`sports safety: NBA batch execution ${ENABLE_NBA_BATCH_EXECUTION ? "ENABLED (single postOrders request; orphan/no-loss fallback active)" : ALLOW_NBA_NON_ATOMIC_EXECUTION ? "ENABLED by non-atomic override" : "BLOCKED (batch disabled)"}`);
  log(`submit hot path: postMode=${MONOTONIC_POST_MODE} responseFillFirst=${RESPONSE_FILL_FIRST ? "1" : "0"} httpKeepAlive=${HTTP_KEEP_ALIVE ? "1" : "0"}`);
  log(`June breakeven filter: commodities<=${(JUNE_BREAKEVEN_COMMODITY_MAX_DISTANCE * 100).toFixed(1)}% crypto<=${(JUNE_BREAKEVEN_CRYPTO_MAX_DISTANCE * 100).toFixed(1)}% refreshMs=${SPOT_REFRESH_MS}`);
  log(`orphan policy: stop=${ORPHAN_STOP_CENTS} completionMargin=${ORPHAN_COMPLETION_MARGIN} expiryBufferMs=${ORPHAN_EXPIRY_BUFFER_MS} pollMs=${ORPHAN_POLL_MS} (re-pair naked legs across ladder, else unwind)`);
  log(`large-orphan quarantine: maxNakedShares=${MAX_NAKED_SHARES_BEFORE_PAUSE} quarantineFile=${QUARANTINE_PATH} globalPauseFile=${PAUSE_PATH}`);

  const vpnGuard = new VpnGuard({
    socksProxy: SOCKS_PROXY,
    skipChecks: DRY_RUN || SKIP_VPN,
    onVpnDrop: (reason) => {
      console.error(`\n[VPN] *** VPN DROPPED *** ${reason}`);
      console.error(`[VPN] Halting arb daemon immediately — no further orders.`);
      process.exit(1);
    },
  });
  vpnGuard.activateProxy();
  if (!DRY_RUN) {
    try {
      await vpnGuard.verifyLocation();
    } catch (err: any) {
      console.error(`\n[VPN] *** BLOCKED *** ${err.message}`);
      process.exit(1);
    }
    vpnGuard.startMonitoring();
  }

  if (!DRY_RUN) {
    clob = await clobClient();
    reconcileAddress = POLYMARKET_FUNDER_ADDRESS ?? clob.signer.address;
    log(`wallet signer=${clob.signer.address} funder/reconcile=${reconcileAddress}`);
    await refreshBalance();
    if (lowBalance()) {
      log(`WARNING: funder balance/allowance below min marketable buy at startup; entries paused until funded.`);
    }
  } else {
    log(`dry-run: skipping CLOB client + balance probe`);
  }

  loadPersistentPause();
  loadQuarantine();
  loadOrphans();
  await refreshSpotPrices();
  await reconcileOrphansAtStartup();
  archiveStaleNbaLedgers();

  await refreshWatchlist();
  connectMarketWs(0);
  await connectUserWs(0);

  setInterval(() => { void refreshWatchlist(); }, WATCHLIST_REFRESH_MS);
  setInterval(() => { void refreshBalance(); }, BALANCE_REFRESH_MS);
  setInterval(() => { void refreshSpotPrices(); }, SPOT_REFRESH_MS);
  setInterval(() => archiveStaleNbaLedgers(), WATCHLIST_REFRESH_MS);
  setInterval(() => flushLedger(), LEDGER_FLUSH_MS);
  setInterval(() => orphanLoop(), ORPHAN_POLL_MS);
  setInterval(() => flushNearMissTelemetry(), NEAR_MISS_LOG_MS);

  // Resubscribe the market WS to any newly discovered tokens after a watchlist
  // refresh by cycling the socket (cheap; books re-seed over REST on reconnect).
  setInterval(() => {
    if (marketWs && marketWs.readyState === WebSocket.OPEN) marketWs.close();
  }, WATCHLIST_REFRESH_MS + 5_000);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      shuttingDown = true;
      log(`received ${signal}; shutting down`);
      vpnGuard.stopMonitoring();
      marketWs?.close();
      userWs?.close();
      process.exit(0);
    });
  }

  log(`daemon running.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
