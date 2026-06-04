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
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { VpnGuard } from "../engine-src/live/VpnGuard.js";
import {
  type Candidate,
  type Direction,
  type GammaEvent,
  type MarketQuote,
  EPSILON,
  evaluatePair,
  fetchEvent,
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
  openPackageCount,
  orderId,
  packageRecord,
  postFakBuy,
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
// Completion is positive-EV (a real arb) only if fillPrice + complementAsk is
// below 1 by at least this margin (survives slippage).
const ORPHAN_COMPLETION_MARGIN = Number(process.env.ARB_DAEMON_ORPHAN_COMPLETION_MARGIN ?? 0.01);
// Force-unwind this long before the orphan market's own expiry (so we never
// roll into a directional settlement). Default 10 min.
const ORPHAN_EXPIRY_BUFFER_MS = Number(process.env.ARB_DAEMON_ORPHAN_EXPIRY_BUFFER_MS ?? 600_000);
// Throttle the live event re-fetch per orphan (the completion ladder source).
const ORPHAN_LADDER_REFRESH_MS = Number(process.env.ARB_DAEMON_ORPHAN_LADDER_REFRESH_MS ?? 5_000);
// Smallest residual orphan we bother completing/holding; below this we just
// unwind the dust.
const ORPHAN_MIN_SHARES = Number(process.env.ARB_DAEMON_ORPHAN_MIN_SHARES ?? MIN_ORDER_SHARES);
const ORPHANS_PATH = join(dirname(PACKAGES_PATH), "polymarket-live-orphans.json");

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

// ─── In-memory order books, keyed by token id ───
const books = new Map<string, PriceLevels>();
// token id -> packages that reference it (for targeted re-evaluation)
const tokenToPackages = new Map<string, Set<string>>();
const packages = new Map<string, WatchPackage>();

// Idempotency / caps
const inFlight = new Set<string>();
let alreadyOpen = new Set<string>();
const submitTimestamps: number[] = [];

// Cached on-chain state (refreshed off the hot path)
let cachedFunderBalance = 0;
let cachedFunderAllowance = 0;
let balanceKnown = false;
let pausedForLowBalanceLogged = false;

// Fill-signal waiters keyed by token id (resolved by the User websocket)
const fillWaiters = new Map<string, Set<() => void>>();

// ─── Orphan inventory (naked legs awaiting re-pair or unwind) ───
const orphans = new Map<string, Orphan>();
// orphan id -> in-flight guard so the poll loop and the reactive stop never
// double-fire a completion/unwind on the same orphan.
const orphanInFlight = new Set<string>();
// orphan id -> last live-ladder refresh timestamp (throttles event re-fetch).
const orphanLadderAt = new Map<string, number>();
// eventSlug -> cached freshly-fetched event ladder + quotes (shared across
// orphans in the same event within ORPHAN_LADDER_REFRESH_MS).
const orphanEventCache = new Map<string, { at: number; quotes: MarketQuote[] }>();

// Throttle repeated skip logs so a single near-miss package (passes the dynamic
// gate but always sizes below the min order) cannot flood the journal on every
// book delta.
const lastSkipLogAt = new Map<string, number>();
const SKIP_LOG_THROTTLE_MS = 60_000;

let clob: Awaited<ReturnType<typeof clobClient>> | null = null;
let reconcileAddress = "";
let marketWs: WebSocket | null = null;
let userWs: WebSocket | null = null;
let shuttingDown = false;

function log(...args: unknown[]) {
  console.log(`[arb-daemon ${new Date().toISOString()}]`, ...args);
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

async function refreshWatchlist(): Promise<void> {
  const foundAt = new Date().toISOString();
  let candidates: Candidate[];
  try {
    const result = await findCandidates(arbConfig, eventSlugs(), foundAt);
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
    if (["quoted", "leg1_submitted", "leg1_filled", "leg2_submitted", "package_complete"].includes(row.status)) {
      open.add(row.packageId);
    }
  }
  alreadyOpen = open;
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

function passesDynamicGate(legs: LiveLegs): boolean {
  const packageCost = legs.broadYesAsk + legs.narrowNoAsk;
  const lockedEdge = 1 - packageCost;
  const availableSize = Math.min(legs.broadYesAskSize, legs.narrowNoAskSize);
  const maxSpread = Math.max(legs.broadSpread, legs.narrowSpread);
  if (lockedEdge + EPSILON < MIN_EDGE) return false;
  if (maxSpread - EPSILON > MAX_SPREAD) return false;
  if (availableSize + EPSILON < MIN_AVAILABLE_SHARES) return false;
  return true;
}

// ─── Caps / safety ───

function perMinuteCapReached(): boolean {
  const cutoff = Date.now() - 60_000;
  while (submitTimestamps.length && submitTimestamps[0] < cutoff) submitTimestamps.shift();
  return submitTimestamps.length >= MAX_PER_MIN;
}

function lowBalance(): boolean {
  if (!balanceKnown) return false;
  return cachedFunderBalance < MAX_PACKAGE_USD || cachedFunderAllowance < MAX_PACKAGE_USD;
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
  if (inFlight.has(pkg.key) || alreadyOpen.has(pkg.key)) return;
  if (perMinuteCapReached()) return;
  if (lowBalance()) {
    if (!pausedForLowBalanceLogged) {
      log(`paused: cached funder balance=${cachedFunderBalance.toFixed(4)} allowance=${cachedFunderAllowance.toFixed(2)} < cap $${MAX_PACKAGE_USD}; skipping new entries until refresh`);
      pausedForLowBalanceLogged = true;
    }
    return;
  }

  const packageRows = readJsonArray<LivePackage>(PACKAGES_PATH);
  if (openPackageCount(packageRows) >= MAX_OPEN_PACKAGES) return;

  const c = liveCandidate(pkg.base, legs);
  const sized = sizeForCandidate(c, packageRows);
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

  inFlight.add(pkg.key);
  submitTimestamps.push(Date.now());
  try {
    await executeLive(pkg, c);
  } catch (err: any) {
    log(`execute ${pkg.key} failed: ${err?.message ?? String(err)}`);
  } finally {
    inFlight.delete(pkg.key);
    alreadyOpen.add(pkg.key);
  }
}

async function executeLive(pkg: WatchPackage, c: Candidate): Promise<void> {
  if (!clob) throw new Error("CLOB client not initialized");
  const client = clob.client;
  const shares = sizeForCandidate(c, readJsonArray<LivePackage>(PACKAGES_PATH)).shares;
  const record = packageRecord(c, reconcileAddress, shares, false);
  const orders: LiveOrder[] = [];

  log(`ARB ${pkg.key} edge=${(c.lockedEdge * 100).toFixed(2)}c cost=${c.packageCost.toFixed(4)} shares=${shares.toFixed(2)} size=${c.availableSize.toFixed(2)}`);

  record.status = "leg1_submitted";
  record.updatedAt = new Date().toISOString();
  appendJsonArray(PACKAGES_PATH, [record]);

  // Snapshot both balances before firing (parallel) so fills are measured
  // against a clean baseline.
  const [leg1Before, leg2Before] = await Promise.all([
    reconcileTokenBalance(reconcileAddress, pkg.broadYesToken),
    reconcileTokenBalance(reconcileAddress, pkg.narrowNoToken),
  ]);

  // Fire BOTH FAK legs concurrently. This is the whole point of parallel taker
  // fills: both orders hit the book in the same burst, so neither ask can drift
  // relative to the other (eliminates the sequential leg-price-move window).
  // allSettled so a rejection on one leg does not abort submission of the other.
  const submittedAt = new Date().toISOString();
  const [r1, r2] = await Promise.allSettled([
    postFakBuy(client, pkg.broadYesToken, c.broad.yesBook.ask, shares),
    postFakBuy(client, pkg.narrowNoToken, c.narrow.noBook.ask, shares),
  ]);

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

  // Wait for both fills (parallel), then reconcile both balances (parallel).
  // The on-chain balance delta is the authority for what actually filled.
  await Promise.all([
    waitForFill(pkg.broadYesToken, FILL_WAIT_DAEMON_MS),
    waitForFill(pkg.narrowNoToken, FILL_WAIT_DAEMON_MS),
  ]);
  const [leg1After, leg2After] = await Promise.all([
    reconcileTokenBalance(reconcileAddress, pkg.broadYesToken),
    reconcileTokenBalance(reconcileAddress, pkg.narrowNoToken),
  ]);
  const leg1Filled = roundShares(leg1After - leg1Before);
  const leg2Filled = roundShares(leg2After - leg2Before);
  orders.push({ packageId: record.packageId, createdAt: submittedAt, role: "broad_yes", tokenId: pkg.broadYesToken, side: "BUY", price: c.broad.yesBook.ask, size: leg1Filled, orderType: "FAK", response: leg1Resp });
  orders.push({ packageId: record.packageId, createdAt: submittedAt, role: "narrow_no", tokenId: pkg.narrowNoToken, side: "BUY", price: c.narrow.noBook.ask, size: leg2Filled, orderType: "FAK", response: leg2Resp });

  const matched = roundShares(Math.min(leg1Filled, leg2Filled));
  record.filledShares = matched;
  record.actualCost = (leg1Filled * c.broad.yesBook.ask) + (leg2Filled * c.narrow.noBook.ask);
  record.guaranteedFloor = matched;
  record.lockedFloorProfit = matched * c.lockedEdge;
  record.jackpotPayout = matched * 2;

  // The matched portion is a genuine risk-free package and is booked complete.
  // Any excess on the over-filled leg is a NAKED leg: instead of holding it to a
  // directional resolution, we spin it off as an orphan for the completion/
  // unwind engine to re-pair across the ladder (or flatten on the tight stop).
  const nakedShares = roundShares(Math.abs(leg1Filled - leg2Filled));
  const nakedRole: "broad_yes" | "narrow_no" | null =
    leg1Filled > leg2Filled ? "broad_yes" : leg2Filled > leg1Filled ? "narrow_no" : null;
  const errSuffix = legErrors.length ? ` errors=${legErrors.join("; ")}` : "";

  if (matched > 0) {
    record.status = "package_complete";
    if (nakedRole) record.failureReason = `partial_fill matched=${matched} naked_${nakedRole}=${nakedShares} -> orphan${errSuffix}`;
  } else {
    record.status = "unwind_required";
    record.failureReason = nakedRole
      ? `naked_${nakedRole}=${nakedShares} -> orphan (no matched fill)${errSuffix}`
      : `no_fill both FAK legs killed (arb gone); no position${errSuffix}`;
  }
  record.updatedAt = new Date().toISOString();
  persist(record, orders);

  if (nakedRole && nakedShares >= 0.01) {
    registerOrphanFromExecution(c, nakedRole, nakedShares, record.packageId);
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

function registerOrphanFromExecution(c: Candidate, role: "broad_yes" | "narrow_no", shares: number, fromPackageId: string) {
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
}

function orphanBestBid(o: Orphan): number {
  return topOfBook(o.tokenId).bid;
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
  completionEdge: number;
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
    if (completionEdge <= ORPHAN_COMPLETION_MARGIN) continue;
    if (compBook.askSize + EPSILON < o.shares) continue;          // not enough depth to cover the orphan
    if (o.shares + EPSILON < compBook.minOrderSize) continue;     // orphan smaller than complement's min order
    if (!best || completionEdge > best.completionEdge) {
      best = {
        candidate: pair,
        complementToken: o.role === "broad_yes" ? narrow.noTokenId : broad.yesTokenId,
        complementAsk,
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
    // else: complements exist but none positive-EV — keep holding (stop bounds risk).
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
    log(`orphan ${o.id} COMPLETE attempt: buy complement ${pick.complementToken.slice(0, 10)}… ask=${pick.complementAsk.toFixed(4)} edge=${(pick.completionEdge * 100).toFixed(2)}c shares=${o.shares}`);
    const before = await reconcileTokenBalance(reconcileAddress, pick.complementToken);
    let resp: unknown;
    try {
      resp = await postFakBuy(client, pick.complementToken, pick.complementAsk, o.shares);
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
      record.jackpotPayout = matched * 2;
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
    if (!(bid > 0)) {
      log(`orphan ${o.id} unwind deferred (${reason}): no bid to sell into`);
      return; // stay "completing"; retry next sweep
    }
    o.attempts += 1;
    log(`orphan ${o.id} UNWIND (${reason}): FAK-sell ${o.shares} @ bid=${bid.toFixed(4)} fill=${o.fillPrice.toFixed(4)}`);
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
    if (!passesDynamicGate(legs)) continue;
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
  const child = spawn("bash", ["-lc", "git add data/polymarket-live-packages.json data/polymarket-live-orders.json data/polymarket-live-orphans.json 2>/dev/null && git diff --cached --quiet || git commit -m 'arb-daemon: ledger update' -q && git push -q"], {
    stdio: "ignore",
    detached: false,
  });
  child.on("error", (err) => log(`ledger git push failed: ${err.message}`));
}

// ─── Startup ───

async function main() {
  log(`starting; mode=${DRY_RUN ? "DRY_RUN" : "REAL"} enabled=${ENABLED} hardDisabled=${HARD_DISABLED}`);
  log(`gates: maxPackage=$${MAX_PACKAGE_USD} maxDaily=$${MAX_DAILY_USD} maxOpen=${MAX_OPEN_PACKAGES} maxPerMin=${MAX_PER_MIN} minEdge=${(MIN_EDGE * 100).toFixed(2)}c minTouch=${MIN_AVAILABLE_SHARES} maxSpread=${MAX_SPREAD}`);
  log(`orphan policy: stop=${ORPHAN_STOP_CENTS} completionMargin=${ORPHAN_COMPLETION_MARGIN} expiryBufferMs=${ORPHAN_EXPIRY_BUFFER_MS} pollMs=${ORPHAN_POLL_MS} (re-pair naked legs across ladder, else unwind)`);

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
      log(`WARNING: funder balance/allowance below cap at startup; entries paused until funded.`);
    }
  } else {
    log(`dry-run: skipping CLOB client + balance probe`);
  }

  loadOrphans();
  await reconcileOrphansAtStartup();

  await refreshWatchlist();
  connectMarketWs(0);
  await connectUserWs(0);

  setInterval(() => { void refreshWatchlist(); }, WATCHLIST_REFRESH_MS);
  setInterval(() => { void refreshBalance(); }, BALANCE_REFRESH_MS);
  setInterval(() => flushLedger(), LEDGER_FLUSH_MS);
  setInterval(() => orphanLoop(), ORPHAN_POLL_MS);

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
