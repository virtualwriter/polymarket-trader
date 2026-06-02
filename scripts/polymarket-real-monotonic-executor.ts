import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { ClobClient, type ApiKeyCreds, AssetType, OrderType, Side, type TickSize } from "@polymarket/clob-client";
import { config } from "dotenv";
import { ethers } from "ethers";
import { VpnGuard } from "../engine-src/live/VpnGuard.js";

// @polymarket/clob-client signs L2 requests via globalThis.crypto.subtle.
// Node < 19 (the VPS runs 18) does not expose globalThis.crypto by default,
// so polyfill it from node:crypto before any CLOB call.
if (!globalThis.crypto) (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const ROOT = join(import.meta.dirname ?? ".", "..");
const DEFAULT_LIVE_STATE_DIR = join(ROOT, ".runtime");
const LIVE_STATE_DIR = process.env.POLYMARKET_TRADER_STATE_DIR ?? DEFAULT_LIVE_STATE_DIR;
const LIVE_PORTFOLIO_FILE = process.env.POLYMARKET_TRADER_LIVE_PORTFOLIO ?? join(LIVE_STATE_DIR, "portfolio-live.json");
const DATA_DIR = join(ROOT, "data");
const PACKAGES_PATH = join(DATA_DIR, "polymarket-live-packages.json");
const ORDERS_PATH = join(DATA_DIR, "polymarket-live-orders.json");

const HOST = process.env.POLYMARKET_CLOB_HOST ?? "https://clob.polymarket.com";
const GAMMA_API = process.env.GAMMA_API ?? "https://gamma-api.polymarket.com";
const CHAIN_ID = 137;
const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

const ENABLED = process.env.ENABLE_MONOTONIC_ARB_REAL_PM === "1";
const HARD_DISABLED = process.env.DISABLE_REAL_PM_TRADING === "1";
const DRY_RUN = process.argv.includes("--dry-run") || process.env.MONOTONIC_ARB_REAL_PM_DRY_RUN === "1" || !ENABLED || HARD_DISABLED;
const PROBE_ONLY = process.argv.includes("--probe-only");
const MAX_PACKAGE_USD = Number(process.env.MONOTONIC_ARB_REAL_PM_MAX_PACKAGE_USD ?? 1);
const MAX_DAILY_USD = Number(process.env.MONOTONIC_ARB_REAL_PM_MAX_DAILY_USD ?? 5);
const MAX_OPEN_PACKAGES = Number(process.env.MONOTONIC_ARB_REAL_PM_MAX_OPEN_PACKAGES ?? 20);
const MAX_PACKAGES_PER_RUN = Number(process.env.MONOTONIC_ARB_REAL_PM_MAX_PER_RUN ?? 1);
const MIN_EDGE = Number(process.env.MONOTONIC_ARB_REAL_PM_MIN_EDGE ?? 0.001);
const MIN_LIQUIDITY = Number(process.env.MONOTONIC_ARB_REAL_PM_MIN_LIQUIDITY ?? 10_000);
const MAX_SPREAD = Number(process.env.MONOTONIC_ARB_REAL_PM_MAX_SPREAD ?? 0.01);
const MIN_AVAILABLE_SHARES = Number(process.env.MONOTONIC_ARB_REAL_PM_MIN_AVAILABLE_SHARES ?? 5);
const MIN_ORDER_SHARES = Number(process.env.MONOTONIC_ARB_REAL_PM_MIN_ORDER_SHARES ?? 1);
const FILL_WAIT_MS = Number(process.env.MONOTONIC_ARB_REAL_PM_FILL_WAIT_MS ?? 3000);
const FETCH_TIMEOUT_MS = Number(process.env.MONOTONIC_ARB_REAL_PM_FETCH_TIMEOUT_MS ?? 12_000);
const MARKET_CONCURRENCY = Math.max(1, Number(process.env.MONOTONIC_ARB_REAL_PM_MARKET_CONCURRENCY ?? 4));
const EVENT_CONCURRENCY = Math.max(1, Number(process.env.MONOTONIC_ARB_REAL_PM_EVENT_CONCURRENCY ?? 2));
const EPSILON = 1e-9;
const CANDIDATE_SOURCE = process.env.MONOTONIC_ARB_REAL_PM_SOURCE ?? "portfolio";
const SOCKS_PROXY = process.env.SOCKS_PROXY || process.env.ALL_PROXY || undefined;
const SKIP_VPN = process.env.MONOTONIC_ARB_REAL_PM_SKIP_VPN === "1" || process.argv.includes("--skip-vpn");
const ALLOWED_ASSETS = new Set((process.env.MONOTONIC_ARB_REAL_PM_ASSETS ?? "BTC,ETH,GOLD,SOL,SILVER,SPY")
  .split(",")
  .map((asset) => asset.trim().toUpperCase())
  .filter(Boolean));

type Direction = "above" | "below";
type BookLevel = { price?: string; size?: string };
type GammaMarket = {
  id?: string;
  question?: string;
  description?: string;
  resolutionSource?: string;
  groupItemTitle?: string;
  outcomes?: string;
  clobTokenIds?: string;
  volume?: string | number;
  liquidity?: string | number;
  liquidityNum?: number;
  startDate?: string | null;
  createdAt?: string | null;
  endDate?: string | null;
  active?: boolean;
  closed?: boolean;
};
type GammaEvent = {
  slug?: string;
  title?: string;
  startDate?: string | null;
  createdAt?: string | null;
  markets?: GammaMarket[];
};
type Book = {
  tokenId: string;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  spread: number;
};
type MarketQuote = {
  eventSlug: string;
  eventTitle: string;
  marketId: string;
  question: string;
  description: string;
  resolutionSource: string;
  strike: number;
  direction: Direction;
  startDate: string | null;
  endDate: string | null;
  liquidity: number;
  yesTokenId: string;
  noTokenId: string;
  yesBook: Book;
  noBook: Book;
};
type Candidate = {
  foundAt: string;
  asset: string;
  eventSlug: string;
  eventTitle: string;
  packageId: string;
  direction: Direction;
  broad: MarketQuote;
  narrow: MarketQuote;
  packageCost: number;
  lockedEdge: number;
  availableSize: number;
  maxSpread: number;
  minLiquidity: number;
  eligible: boolean;
  rejectionReasons: string[];
};
type LivePackage = {
  id: string;
  packageId: string;
  status: "quoted" | "leg1_submitted" | "leg1_filled" | "leg2_submitted" | "package_complete" | "unwind_required" | "dry_run";
  createdAt: string;
  updatedAt: string;
  dryRun: boolean;
  walletAddress: string;
  asset: string;
  eventSlug: string;
  direction: Direction;
  broadStrike: number;
  narrowStrike: number;
  intendedShares: number;
  filledShares: number;
  intendedCost: number;
  actualCost: number;
  guaranteedFloor: number;
  lockedFloorProfit: number;
  jackpotPayout: number;
  settlementWindow: { startDate: string | null; endDate: string | null };
  legOrderIds: { broadYes?: string; narrowNo?: string };
  tokenIds: { broadYes: string; narrowNo: string };
  prices: { broadYesAsk: number; narrowNoAsk: number; packageCost: number };
  packageLegs: Array<{
    role: "broad_yes" | "narrow_no";
    instrumentType: "pm_yes" | "pm_no";
    instrumentId: string;
    instrumentLabel: string;
    entryPrice: number;
    strike: number;
    direction: Direction;
    yesBid: number;
    yesAsk: number;
    yesBidSize?: number | null;
    yesAskSize?: number | null;
    startDate?: string | null;
  }>;
  failureReason?: string;
};
type LiveOrder = {
  packageId: string;
  createdAt: string;
  role: "broad_yes" | "narrow_no";
  tokenId: string;
  side: "BUY";
  price: number;
  size: number;
  orderType: string;
  response: unknown;
};
type PortfolioPosition = {
  id?: string;
  openedAt?: string;
  asset?: string;
  signalType?: string;
  instrumentType?: string;
  instrumentId?: string;
  instrumentLabel?: string;
  packageLegs?: Array<{
    role?: string;
    instrumentType?: string;
    instrumentId?: string;
    instrumentLabel?: string;
    strike?: number;
    direction?: Direction;
    startDate?: string | null;
  }>;
};
type Portfolio = {
  positions?: PortfolioPosition[];
};

function parseNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readJsonArray<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function writeJsonArray<T>(path: string, rows: T[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n");
}

function appendJsonArray<T>(path: string, rows: T[]) {
  writeJsonArray(path, [...readJsonArray<T>(path), ...rows]);
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "polymarket-real-monotonic-executor/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
    return res.json();
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`${url} -> timed out after ${FETCH_TIMEOUT_MS}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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

function parseStrike(question: string, groupItemTitle = ""): { strike: number; direction: Direction } | null {
  const text = `${groupItemTitle} ${question}`;
  const value = text.match(/\$?\s*([0-9][0-9,]*(?:\.\d+)?)/);
  if (!value) return null;
  const strike = parseNumber(value[1]);
  if (!strike) return null;
  const lower = text.toLowerCase();
  const down = lower.includes("↓") || lower.includes(" low") || lower.includes("(low)") || lower.includes(" dip") || lower.includes("below");
  const up = lower.includes("↑") || lower.includes(" high") || lower.includes("(high)") || lower.includes(" hit") || lower.includes("reach") || lower.includes("above");
  if (down && !up) return { strike, direction: "below" };
  if (groupItemTitle.includes("↓") || lower.includes("(low)") || lower.includes(" dip")) return { strike, direction: "below" };
  return { strike, direction: "above" };
}

function polymarketAssetForSlug(slug: string): string | null {
  if (slug.includes("bitcoin")) return "BTC";
  if (slug.includes("ethereum")) return "ETH";
  if (slug.includes("solana")) return "SOL";
  if (slug.includes("hyperliquid")) return "HYPE";
  if (slug.startsWith("gc-") || slug.includes("gold-gc") || slug.includes("xauusd")) return "GOLD";
  if (slug.startsWith("spx-") || slug.includes("s-p-500") || slug.includes("sp-500")) return "SPY";
  if (slug.startsWith("si-") || slug.includes("silver") || slug.includes("xagusd")) return "SILVER";
  if (slug.startsWith("cl-") || slug.includes("wti") || slug.includes("crude-oil")) return "OIL";
  if (slug.includes("amazon") || slug.includes("amzn")) return "AMZN";
  return null;
}

function isNestedLadderEvent(slug: string, title = ""): boolean {
  const haystack = `${slug} ${title}`.toLowerCase();
  if (haystack.includes("settle") || haystack.includes("final trading day") || haystack.includes("over-under")) return false;
  if (haystack.includes("range") || /\$\d+(?:\.\d+)?\s*-\s*\$?\d+(?:\.\d+)?/.test(haystack)) return false;
  return haystack.includes("hit") || haystack.includes("reach") || haystack.includes("dip");
}

function resolutionTemplate(quote: MarketQuote): string {
  return quote.description
    .toLowerCase()
    .replace(/\$?\d[\d,]*(?:\.\d+)?/g, "<num>")
    .replace(/\s+/g, " ")
    .trim();
}

function resolutionMatches(a: MarketQuote, b: MarketQuote): boolean {
  const aSource = a.resolutionSource.trim().toLowerCase();
  const bSource = b.resolutionSource.trim().toLowerCase();
  if (aSource && bSource && aSource !== bSource) return false;
  const aTemplate = resolutionTemplate(a);
  const bTemplate = resolutionTemplate(b);
  return !aTemplate || !bTemplate || aTemplate === bTemplate;
}

function bestLevel(levels: BookLevel[] | undefined, side: "bid" | "ask"): { price: number; size: number } {
  const parsed = (levels ?? [])
    .map((level) => ({ price: parseNumber(level.price), size: parseNumber(level.size) }))
    .filter((level) => level.price > 0 && level.size > 0);
  if (parsed.length === 0) return { price: 0, size: 0 };
  return parsed.reduce((best, level) => side === "bid"
    ? (level.price > best.price ? level : best)
    : (level.price < best.price ? level : best));
}

async function fetchBook(tokenId: string): Promise<Book> {
  const book = await fetchJson(`${HOST}/book?${new URLSearchParams({ token_id: tokenId })}`);
  const bid = bestLevel(book.bids, "bid");
  const ask = bestLevel(book.asks, "ask");
  return {
    tokenId,
    bid: bid.price,
    bidSize: bid.size,
    ask: ask.price,
    askSize: ask.size,
    spread: bid.price > 0 && ask.price > 0 ? Math.max(0, ask.price - bid.price) : 0,
  };
}

function defaultEventSlugs(now = new Date()): string[] {
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" }).toLowerCase();
  const year = now.getUTCFullYear();
  return [
    "what-price-will-bitcoin-hit-before-2027",
    "what-price-will-ethereum-hit-before-2027",
    "what-price-will-solana-hit-before-2027",
    "what-price-will-hyperliquid-hit-before-2027",
    "what-will-gold-gc-hit-by-end-of-december",
    "gc-hit-jun-2026",
    "spx-hit-jun-2026",
    "spx-hit-dec-2026",
    "si-hit-jun-2026",
    `what-price-will-bitcoin-hit-in-${month}-${year}`,
    `what-price-will-ethereum-hit-in-${month}-${year}`,
    `what-price-will-solana-hit-in-${month}-${year}`,
    `what-price-will-xauusd-hit-in-${month}-${year}`,
  ].filter((slug, idx, arr) => arr.indexOf(slug) === idx);
}

function eventSlugs(): string[] {
  const override = process.env.MONOTONIC_ARB_REAL_PM_EVENT_SLUGS;
  if (!override) return defaultEventSlugs();
  return override.split(",").map((slug) => slug.trim()).filter(Boolean);
}

async function marketQuote(event: GammaEvent, market: GammaMarket): Promise<MarketQuote | null> {
  const eventSlug = event.slug ?? "";
  const marketId = String(market.id ?? "");
  const question = market.question ?? "";
  if (!eventSlug || !marketId || !question || market.closed || market.active === false) return null;
  const parsed = parseStrike(question, market.groupItemTitle ?? "");
  if (!parsed) return null;
  const outcomes = parseJsonArray(market.outcomes).map(String);
  const tokenIds = parseJsonArray(market.clobTokenIds).map(String);
  const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
  const noIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "no");
  if (yesIndex < 0 || noIndex < 0 || !tokenIds[yesIndex] || !tokenIds[noIndex]) return null;
  const [yesBook, noBook] = await Promise.all([fetchBook(tokenIds[yesIndex]), fetchBook(tokenIds[noIndex])]);
  if (yesBook.bid <= 0 || yesBook.ask <= 0 || noBook.bid <= 0 || noBook.ask <= 0) return null;
  return {
    eventSlug,
    eventTitle: event.title ?? eventSlug,
    marketId,
    question,
    description: market.description ?? "",
    resolutionSource: market.resolutionSource ?? "",
    strike: parsed.strike,
    direction: parsed.direction,
    startDate: market.startDate ?? market.createdAt ?? event.startDate ?? event.createdAt ?? null,
    endDate: market.endDate ?? null,
    liquidity: parseNumber(market.liquidityNum ?? market.liquidity),
    yesTokenId: tokenIds[yesIndex],
    noTokenId: tokenIds[noIndex],
    yesBook,
    noBook,
  };
}

function evaluatePair(asset: string, broad: MarketQuote, narrow: MarketQuote, foundAt: string): Candidate {
  const packageCost = broad.yesBook.ask + narrow.noBook.ask;
  const lockedEdge = 1 - packageCost;
  // Match the paper/live-sim monotonic arb gate: both underlying YES markets
  // must be tight. The executed NO leg is the complement of the narrow YES,
  // and its own CLOB bid/ask spread can look artificially wide even when the
  // narrow YES bid that creates the NO ask is tight and deep.
  const maxSpread = Math.max(broad.yesBook.spread, narrow.yesBook.spread);
  const minLiquidity = Math.min(broad.liquidity, narrow.liquidity);
  const availableSize = Math.min(broad.yesBook.askSize, narrow.noBook.askSize);
  const rejectionReasons: string[] = [];
  if (!ALLOWED_ASSETS.has(asset)) rejectionReasons.push("asset_not_allowlisted");
  if (broad.endDate && narrow.endDate && broad.endDate !== narrow.endDate) rejectionReasons.push("expiry_mismatch");
  if (!resolutionMatches(broad, narrow)) rejectionReasons.push("resolution_mismatch");
  if (lockedEdge + EPSILON < MIN_EDGE) rejectionReasons.push("edge_below_threshold");
  if (maxSpread - EPSILON > MAX_SPREAD) rejectionReasons.push("wide_spread");
  if (minLiquidity + EPSILON < MIN_LIQUIDITY) rejectionReasons.push("low_liquidity");
  if (availableSize + EPSILON < MIN_AVAILABLE_SHARES) rejectionReasons.push("insufficient_top_of_book_size");
  return {
    foundAt,
    asset,
    eventSlug: broad.eventSlug,
    eventTitle: broad.eventTitle,
    packageId: `${broad.eventSlug}::YES-${broad.marketId}+NO-${narrow.marketId}`,
    direction: broad.direction,
    broad,
    narrow,
    packageCost,
    lockedEdge,
    availableSize,
    maxSpread,
    minLiquidity,
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
  };
}

async function scanEvent(slug: string, foundAt: string): Promise<Candidate[]> {
  const events = await fetchJson(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`);
  const event = Array.isArray(events) && events.length > 0 ? events[0] as GammaEvent : null;
  if (!event?.slug) return [];
  const asset = polymarketAssetForSlug(event.slug);
  if (!asset || !isNestedLadderEvent(event.slug, event.title ?? "")) return [];
  const quotes = (await mapLimit(event.markets ?? [], MARKET_CONCURRENCY, (market) => marketQuote(event, market)))
    .filter((quote): quote is MarketQuote => quote !== null);
  const candidates: Candidate[] = [];
  for (const direction of ["above", "below"] as const) {
    const directional = quotes
      .filter((quote) => quote.direction === direction)
      .sort((a, b) => a.strike - b.strike);
    for (let i = 0; i < directional.length; i++) {
      for (let j = i + 1; j < directional.length; j++) {
        const lower = directional[i];
        const higher = directional[j];
        const broad = direction === "above" ? lower : higher;
        const narrow = direction === "above" ? higher : lower;
        const candidate = evaluatePair(asset, broad, narrow, foundAt);
        if (candidate.lockedEdge > 0 || candidate.eligible) candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function marketIdFromInstrumentId(instrumentId: string | undefined): string | null {
  if (!instrumentId) return null;
  const parts = instrumentId.split("::");
  return parts.length >= 2 ? parts[1] : null;
}

function slugFromInstrumentId(instrumentId: string | undefined): string | null {
  if (!instrumentId) return null;
  const parts = instrumentId.split("::");
  return parts[0] || null;
}

async function fetchEvent(slug: string): Promise<GammaEvent | null> {
  const events = await fetchJson(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`);
  return Array.isArray(events) && events.length > 0 ? events[0] as GammaEvent : null;
}

async function candidateFromPortfolioPosition(position: PortfolioPosition, foundAt: string): Promise<Candidate | null> {
  if (position.signalType !== "MONOTONIC_ARB" || position.instrumentType !== "pm_package") return null;
  if (!position.instrumentId || !Array.isArray(position.packageLegs)) return null;
  const slug = slugFromInstrumentId(position.instrumentId);
  if (!slug) return null;
  const broadLeg = position.packageLegs.find((leg) => leg.role === "broad_yes");
  const narrowLeg = position.packageLegs.find((leg) => leg.role === "narrow_no");
  const broadMarketId = marketIdFromInstrumentId(broadLeg?.instrumentId);
  const narrowMarketId = marketIdFromInstrumentId(narrowLeg?.instrumentId);
  if (!broadMarketId || !narrowMarketId) return null;

  const event = await fetchEvent(slug);
  if (!event?.slug) return null;
  const asset = (position.asset ?? polymarketAssetForSlug(event.slug) ?? "").toUpperCase();
  if (!asset) return null;
  const markets = event.markets ?? [];
  const broadMarket = markets.find((market) => String(market.id ?? "") === broadMarketId);
  const narrowMarket = markets.find((market) => String(market.id ?? "") === narrowMarketId);
  if (!broadMarket || !narrowMarket) return null;
  const [broad, narrow] = await Promise.all([
    marketQuote(event, broadMarket),
    marketQuote(event, narrowMarket),
  ]);
  if (!broad || !narrow) return null;
  if (broad.direction !== narrow.direction) return null;
  const expectedBroadStrike = typeof broadLeg?.strike === "number" ? broadLeg.strike : broad.strike;
  const expectedNarrowStrike = typeof narrowLeg?.strike === "number" ? narrowLeg.strike : narrow.strike;
  if (Math.abs(broad.strike - expectedBroadStrike) > EPSILON || Math.abs(narrow.strike - expectedNarrowStrike) > EPSILON) return null;
  return evaluatePair(asset, broad, narrow, foundAt);
}

function readPortfolio(): Portfolio {
  if (existsSync(LIVE_PORTFOLIO_FILE)) return JSON.parse(readFileSync(LIVE_PORTFOLIO_FILE, "utf-8")) as Portfolio;
  const tracked = join(DATA_DIR, "portfolio.json");
  if (existsSync(tracked)) return JSON.parse(readFileSync(tracked, "utf-8")) as Portfolio;
  return { positions: [] };
}

async function portfolioCandidates(foundAt: string, alreadyOpen: Set<string>): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const portfolio = readPortfolio();
  const positions = (portfolio.positions ?? [])
    .filter((position) =>
      position.signalType === "MONOTONIC_ARB" &&
      position.instrumentType === "pm_package" &&
      !!position.instrumentId &&
      !alreadyOpen.has(position.instrumentId)
    );
  const candidates: Candidate[] = [];
  const errors: string[] = [];
  for (const position of positions) {
    try {
      const candidate = await candidateFromPortfolioPosition(position, foundAt);
      if (candidate) candidates.push(candidate);
      else errors.push(`${position.instrumentId}: unable_to_requote_portfolio_package`);
    } catch (error: any) {
      errors.push(`${position.instrumentId}: ${error?.message ?? String(error)}`);
    }
  }
  return { candidates, errors };
}

async function scanCandidates(foundAt: string): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const scans = await mapLimit(eventSlugs(), EVENT_CONCURRENCY, async (slug) => {
    try {
      return { slug, candidates: await scanEvent(slug, foundAt), error: null as string | null };
    } catch (error: any) {
      return { slug, candidates: [] as Candidate[], error: error?.message ?? String(error) };
    }
  });
  const candidates: Candidate[] = [];
  const errors: string[] = [];
  for (const scan of scans) {
    candidates.push(...scan.candidates);
    if (scan.error) errors.push(`${scan.slug}: ${scan.error}`);
  }
  return { candidates, errors };
}

async function clobClient(): Promise<{ signer: ethers.Wallet; client: ClobClient }> {
  const signer = signerFromEnv();
  const l1 = new ClobClient(HOST, CHAIN_ID, signer);
  const creds = await l1.deriveApiKey() as ApiKeyCreds;
  return { signer, client: new ClobClient(HOST, CHAIN_ID, signer, creds) };
}

function signerFromEnv(): ethers.Wallet {
  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (privateKey) return new ethers.Wallet(privateKey);

  const mnemonic = process.env.HYPERLIQUID_MNEMONIC?.trim();
  if (mnemonic) return ethers.Wallet.fromMnemonic(mnemonic);

  throw new Error("Missing PRIVATE_KEY or HYPERLIQUID_MNEMONIC");
}

function hasWalletSecret(): boolean {
  return !!process.env.PRIVATE_KEY?.trim() || !!process.env.HYPERLIQUID_MNEMONIC?.trim();
}

function parseClobUnits(value: unknown): number {
  const raw = String(value ?? "0");
  if (/^\d+$/.test(raw)) return Number(raw) / 1_000_000;
  return parseNumber(raw);
}

function parseCollateralAllowance(collateral: any): number {
  if (collateral?.allowance !== undefined) return parseClobUnits(collateral.allowance);
  const allowances = collateral?.allowances;
  if (!allowances || typeof allowances !== "object") return 0;
  const parsed = Object.values(allowances).map(parseClobUnits).filter((value) => Number.isFinite(value));
  return parsed.length ? Math.min(...parsed) : 0;
}

async function accountProbe(client: ClobClient, address: string) {
  const collateral = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  const openOrders = await client.getOpenOrders();
  return {
    walletAddress: address,
    collateralBalance: parseClobUnits((collateral as any).balance),
    collateralAllowance: parseCollateralAllowance(collateral),
    rawCollateral: collateral,
    openOrderCount: Array.isArray(openOrders) ? openOrders.length : 0,
  };
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function spentToday(rows: LivePackage[]): number {
  const key = todayKey();
  return rows
    .filter((row) => row.createdAt.slice(0, 10) === key && !row.dryRun && row.status !== "unwind_required")
    .reduce((sum, row) => sum + (row.actualCost || row.intendedCost || 0), 0);
}

function openPackageCount(rows: LivePackage[]): number {
  return rows.filter((row) => ["quoted", "leg1_submitted", "leg1_filled", "leg2_submitted", "package_complete"].includes(row.status)).length;
}

function sizeForCandidate(candidate: Candidate, packageRows: LivePackage[]): { shares: number; cost: number; reason?: string } {
  const remainingDailyUsd = Math.max(0, MAX_DAILY_USD - spentToday(packageRows));
  const maxUsd = Math.min(MAX_PACKAGE_USD, remainingDailyUsd);
  if (maxUsd <= 0) return { shares: 0, cost: 0, reason: "daily_cap_exhausted" };
  const shares = Math.floor(Math.min(candidate.availableSize, maxUsd / candidate.packageCost) * 100) / 100;
  const cost = shares * candidate.packageCost;
  if (shares < MIN_ORDER_SHARES) return { shares, cost, reason: `shares_below_min_order_${MIN_ORDER_SHARES}` };
  return { shares, cost };
}

function orderId(response: any): string | undefined {
  return response?.orderID ?? response?.orderId ?? response?.id ?? response?.order_id;
}

function assertOrderResponse(response: any, role: string) {
  if (response?.success === false) {
    throw new Error(`${role} order rejected: ${response?.errorMsg ?? JSON.stringify(response).slice(0, 500)}`);
  }
  const status = String(response?.status ?? "").toUpperCase();
  if (status && ["FAILED", "REJECTED", "CANCELLED", "CANCELED"].includes(status)) {
    throw new Error(`${role} order status ${status}: ${JSON.stringify(response).slice(0, 500)}`);
  }
}

async function postFokBuy(client: ClobClient, tokenId: string, price: number, usdAmount: number): Promise<any> {
  const tickSize = await client.getTickSize(tokenId) as TickSize;
  return client.createAndPostMarketOrder(
    { tokenID: tokenId, price, amount: Number(usdAmount.toFixed(6)), side: Side.BUY, orderType: OrderType.FOK },
    { tickSize, negRisk: false },
    OrderType.FOK,
  );
}

async function reconcileTokenBalance(address: string, tokenId: string): Promise<number> {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const ctf = new ethers.Contract(CTF_ADDRESS, ["function balanceOf(address,uint256) view returns (uint256)"], provider);
  const raw = await ctf.balanceOf(address, tokenId);
  return parseFloat(ethers.utils.formatUnits(raw, 6));
}

async function reconcilePackage(address: string, candidate: Candidate): Promise<{ broadYesBalance: number; narrowNoBalance: number; matchedShares: number }> {
  const [broadYesBalance, narrowNoBalance] = await Promise.all([
    reconcileTokenBalance(address, candidate.broad.yesTokenId),
    reconcileTokenBalance(address, candidate.narrow.noTokenId),
  ]);
  return { broadYesBalance, narrowNoBalance, matchedShares: Math.min(broadYesBalance, narrowNoBalance) };
}

function packageRecord(candidate: Candidate, walletAddress: string, shares: number, dryRun: boolean): LivePackage {
  const now = new Date().toISOString();
  const intendedCost = shares * candidate.packageCost;
  return {
    id: `PMARB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    packageId: candidate.packageId,
    status: dryRun ? "dry_run" : "quoted",
    createdAt: now,
    updatedAt: now,
    dryRun,
    walletAddress,
    asset: candidate.asset,
    eventSlug: candidate.eventSlug,
    direction: candidate.direction,
    broadStrike: candidate.broad.strike,
    narrowStrike: candidate.narrow.strike,
    intendedShares: shares,
    filledShares: 0,
    intendedCost,
    actualCost: 0,
    guaranteedFloor: shares,
    lockedFloorProfit: shares * candidate.lockedEdge,
    jackpotPayout: shares * 2,
    settlementWindow: { startDate: candidate.broad.startDate ?? candidate.narrow.startDate, endDate: candidate.broad.endDate ?? candidate.narrow.endDate },
    legOrderIds: {},
    tokenIds: { broadYes: candidate.broad.yesTokenId, narrowNo: candidate.narrow.noTokenId },
    prices: { broadYesAsk: candidate.broad.yesBook.ask, narrowNoAsk: candidate.narrow.noBook.ask, packageCost: candidate.packageCost },
    packageLegs: [
      {
        role: "broad_yes",
        instrumentType: "pm_yes",
        instrumentId: `${candidate.eventSlug}::${candidate.broad.marketId}`,
        instrumentLabel: `${candidate.eventSlug} - YES - ${candidate.broad.question}`,
        entryPrice: candidate.broad.yesBook.ask,
        strike: candidate.broad.strike,
        direction: candidate.direction,
        yesBid: candidate.broad.yesBook.bid,
        yesAsk: candidate.broad.yesBook.ask,
        yesBidSize: candidate.broad.yesBook.bidSize,
        yesAskSize: candidate.broad.yesBook.askSize,
        startDate: candidate.broad.startDate,
      },
      {
        role: "narrow_no",
        instrumentType: "pm_no",
        instrumentId: `${candidate.eventSlug}::${candidate.narrow.marketId}`,
        instrumentLabel: `${candidate.eventSlug} - NO - ${candidate.narrow.question}`,
        entryPrice: candidate.narrow.noBook.ask,
        strike: candidate.narrow.strike,
        direction: candidate.direction,
        yesBid: candidate.narrow.yesBook.bid,
        yesAsk: candidate.narrow.yesBook.ask,
        yesBidSize: candidate.narrow.yesBook.bidSize,
        yesAskSize: candidate.narrow.yesBook.askSize,
        startDate: candidate.narrow.startDate,
      },
    ],
  };
}

async function executeCandidate(client: ClobClient, walletAddress: string, candidate: Candidate, shares: number, packageRows: LivePackage[]) {
  const record = packageRecord(candidate, walletAddress, shares, DRY_RUN);
  const orders: LiveOrder[] = [];
  const leg1Usd = shares * candidate.broad.yesBook.ask;
  const leg2Usd = shares * candidate.narrow.noBook.ask;

  console.log(`Candidate: ${candidate.asset} ${candidate.eventSlug} ${candidate.direction} YES ${candidate.broad.strike} + NO ${candidate.narrow.strike}`);
  console.log(`  entry=${candidate.packageCost.toFixed(4)} edge=${(candidate.lockedEdge * 100).toFixed(2)}c shares=${shares.toFixed(2)} cost=$${(leg1Usd + leg2Usd).toFixed(4)}`);
  console.log(`  settlement=${record.settlementWindow.startDate} -> ${record.settlementWindow.endDate}`);

  if (DRY_RUN) {
    console.log("Dry run: not posting real orders.");
    return { record, orders };
  }

  try {
    record.status = "leg1_submitted";
    record.updatedAt = new Date().toISOString();
    appendJsonArray(PACKAGES_PATH, [record]);

    const leg1 = await postFokBuy(client, candidate.broad.yesTokenId, candidate.broad.yesBook.ask, leg1Usd);
    assertOrderResponse(leg1, "broad_yes");
    record.legOrderIds.broadYes = orderId(leg1);
    orders.push({ packageId: record.packageId, createdAt: new Date().toISOString(), role: "broad_yes", tokenId: candidate.broad.yesTokenId, side: "BUY", price: candidate.broad.yesBook.ask, size: shares, orderType: "FOK", response: leg1 });
    record.status = "leg1_filled";
    record.updatedAt = new Date().toISOString();

    await new Promise((resolvePromise) => setTimeout(resolvePromise, FILL_WAIT_MS));
    const leg2 = await postFokBuy(client, candidate.narrow.noTokenId, candidate.narrow.noBook.ask, leg2Usd);
    assertOrderResponse(leg2, "narrow_no");
    record.legOrderIds.narrowNo = orderId(leg2);
    orders.push({ packageId: record.packageId, createdAt: new Date().toISOString(), role: "narrow_no", tokenId: candidate.narrow.noTokenId, side: "BUY", price: candidate.narrow.noBook.ask, size: shares, orderType: "FOK", response: leg2 });
    record.status = "leg2_submitted";
    record.updatedAt = new Date().toISOString();

    await new Promise((resolvePromise) => setTimeout(resolvePromise, FILL_WAIT_MS));
    const recon = await reconcilePackage(walletAddress, candidate);
    record.filledShares = Math.floor(recon.matchedShares * 100) / 100;
    record.actualCost = record.filledShares * candidate.packageCost;
    record.status = record.filledShares >= shares * 0.99 ? "package_complete" : "unwind_required";
    if (record.status === "unwind_required") {
      record.failureReason = `reconcile_mismatch broad_yes=${recon.broadYesBalance} narrow_no=${recon.narrowNoBalance} intended=${shares}`;
    }
    record.updatedAt = new Date().toISOString();
    const rows = packageRows.filter((row) => row.id !== record.id);
    writeJsonArray(PACKAGES_PATH, [...rows, record]);
    appendJsonArray(ORDERS_PATH, orders);
    return { record, orders };
  } catch (error: any) {
    record.status = "unwind_required";
    record.failureReason = error?.message ?? String(error);
    record.updatedAt = new Date().toISOString();
    const rows = readJsonArray<LivePackage>(PACKAGES_PATH).filter((row) => row.id !== record.id);
    writeJsonArray(PACKAGES_PATH, [...rows, record]);
    appendJsonArray(ORDERS_PATH, orders);
    throw error;
  }
}

async function main() {
  // Route every real Polymarket order through the VPN guard. activateProxy()
  // patches the Node global agent, so the CLOB client's internal axios calls
  // (API-key derivation, order posting, reconciliation) all exit via the
  // SOCKS5 proxy. This lives entirely in the executor — the scanner and
  // trading engine are untouched.
  const vpnGuard = new VpnGuard({
    socksProxy: SOCKS_PROXY,
    skipChecks: DRY_RUN || SKIP_VPN,
    onVpnDrop: (reason) => {
      console.error(`\n[VPN] *** VPN DROPPED *** ${reason}`);
      console.error(`[VPN] Halting real PM executor immediately — no further orders.`);
      process.exit(1);
    },
  });
  vpnGuard.activateProxy();
  if (!DRY_RUN) {
    try {
      await vpnGuard.verifyLocation();
    } catch (err: any) {
      console.error(`\n[VPN] *** BLOCKED *** ${err.message}`);
      console.error(`[VPN] Cannot place real Polymarket orders without VPN to an allowed country.`);
      process.exit(1);
    }
    vpnGuard.startMonitoring();
  }
  console.log(`VPN: ${DRY_RUN || SKIP_VPN ? "SKIPPED" : SOCKS_PROXY ? "SOCKS5 proxy" : "system VPN"}`);

  try {
    await runExecutor();
  } finally {
    vpnGuard.stopMonitoring();
  }
}

async function runExecutor() {
  const hasSignerSecret = hasWalletSecret();
  let signer: ethers.Wallet | null = null;
  let client: ClobClient | null = null;
  let probe: Awaited<ReturnType<typeof accountProbe>> | null = null;
  if (hasSignerSecret) {
    const created = await clobClient();
    signer = created.signer;
    client = created.client;
    probe = await accountProbe(client, signer.address);
    console.log(`Wallet: ${probe.walletAddress}`);
    console.log(`Collateral balance=${probe.collateralBalance} allowance=${probe.collateralAllowance} openOrders=${probe.openOrderCount}`);
  } else {
    if (!DRY_RUN || PROBE_ONLY) throw new Error("Missing PRIVATE_KEY or HYPERLIQUID_MNEMONIC");
    console.log("Wallet: unavailable in local dry-run (no PRIVATE_KEY or HYPERLIQUID_MNEMONIC set)");
  }
  console.log(`Mode: ${DRY_RUN ? "DRY_RUN" : "REAL"} enabled=${ENABLED} hardDisabled=${HARD_DISABLED}`);

  if (PROBE_ONLY) return;

  if (!DRY_RUN && (!client || !signer || !probe)) throw new Error("Real mode requires initialized wallet/client");
  if (!DRY_RUN && probe!.collateralBalance < MAX_PACKAGE_USD) throw new Error(`Insufficient PM collateral balance for cap $${MAX_PACKAGE_USD}`);
  if (!DRY_RUN && probe!.collateralAllowance < MAX_PACKAGE_USD) throw new Error(`Insufficient PM collateral allowance for cap $${MAX_PACKAGE_USD}`);

  const packageRows = readJsonArray<LivePackage>(PACKAGES_PATH);
  if (openPackageCount(packageRows) >= MAX_OPEN_PACKAGES) throw new Error(`Open real PM package cap reached (${MAX_OPEN_PACKAGES})`);
  const portfolioPackageIds = new Set((readPortfolio().positions ?? [])
    .filter((position) => position.signalType === "MONOTONIC_ARB" && position.instrumentType === "pm_package")
    .map((position) => position.instrumentId)
    .filter((id): id is string => typeof id === "string" && id.length > 0));
  const alreadyOpen = new Set(packageRows
    .filter((row) => ["quoted", "leg1_submitted", "leg1_filled", "leg2_submitted", "package_complete"].includes(row.status))
    .map((row) => row.packageId));
  for (const packageId of portfolioPackageIds) alreadyOpen.add(packageId);

  const foundAt = new Date().toISOString();
  const { candidates, errors } = CANDIDATE_SOURCE === "scan"
    ? await scanCandidates(foundAt)
    : await portfolioCandidates(foundAt, alreadyOpen);
  const eligible = candidates
    .filter((candidate) => candidate.eligible && !alreadyOpen.has(candidate.packageId))
    .sort((a, b) => b.lockedEdge - a.lockedEdge)
    .slice(0, MAX_PACKAGES_PER_RUN);
  console.log(`Candidate source=${CANDIDATE_SOURCE}; candidates=${candidates.length}; eligibleNew=${eligible.length}`);
  for (const error of errors.slice(0, 5)) console.log(`Scan error: ${error}`);
  for (const candidate of candidates
    .filter((row) => row.lockedEdge > 0)
    .sort((a, b) => b.lockedEdge - a.lockedEdge)
    .slice(0, 5)) {
    console.log(`Positive edge: ${candidate.asset} ${candidate.eventSlug} YES ${candidate.broad.strike} + NO ${candidate.narrow.strike} edge=${(candidate.lockedEdge * 100).toFixed(2)}c size=${candidate.availableSize.toFixed(2)} eligible=${candidate.eligible}${candidate.rejectionReasons.length ? ` reasons=${candidate.rejectionReasons.join(",")}` : ""}`);
  }

  for (const candidate of eligible) {
    const sized = sizeForCandidate(candidate, packageRows);
    if (sized.reason) {
      console.log(`Skip ${candidate.packageId}: ${sized.reason} shares=${sized.shares.toFixed(2)} cost=$${sized.cost.toFixed(4)}`);
      continue;
    }
    const result = await executeCandidate(client!, signer?.address ?? "DRY_RUN_NO_WALLET", candidate, sized.shares, packageRows);
    console.log(`Package ${result.record.packageId} status=${result.record.status} filled=${result.record.filledShares.toFixed(2)} intended=${result.record.intendedShares.toFixed(2)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
