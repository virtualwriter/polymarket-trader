/**
 * Lightweight exit scanner.
 *
 * Intended to run once per minute between full hourly scans. It only checks
 * open positions against live-ish marks and closes positions that hit target,
 * stop, or expiry. It does not scan for new trades, call the LLM, or load the
 * large instrument snapshot file.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dirname ?? ".", "..", "data");
const HL_API = "https://api.hyperliquid.xyz/info";
const GAMMA_API = "https://gamma-api.polymarket.com";
const DRY_RUN = process.argv.includes("--dry-run");
const FUNDING_BREAKEVEN_ARM_PCT = 1.5;
const FUNDING_BREAKEVEN_LOCK_PCT = 0.25;

type Venue = "polymarket" | "hyperliquid" | "spot";
type Direction = "long" | "short";
type InstrumentType = "spot" | "hl_perp" | "pm_yes" | "pm_no" | "legacy_asset";
type CloseReason = "target" | "stop" | "breakeven_stop" | "expiry" | "llm_decision" | "signal_killed";

interface Position {
  id: string;
  openedAt: string;
  asset: string;
  venue: Venue;
  direction: Direction;
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage?: number;
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  targetPct: number | null;
  stopPct: number;
  expiryDate: string;
  instrumentType?: InstrumentType;
  instrumentId?: string;
  instrumentLabel?: string;
  entryUnderlyingPrice?: number;
  currentUnderlyingPrice?: number;
  fundingPnlAccrued?: number;
  peakPnlPct?: number;
}

interface Portfolio {
  cash: number;
  positions: Position[];
  totalRealizedPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  lastUpdated: string;
}

interface Mark {
  currentPrice: number;
  underlyingPrice: number | null;
  marketPnl: number;
  fundingPnl: number;
  pnl: number;
  pnlPct: number;
}

interface ClosedTrade {
  id: string;
  openedAt: string;
  closedAt: string;
  asset: string;
  venue: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  leverage?: number;
  pnl: number;
  pnlPct: number;
  marketPnl?: number;
  fundingPnl?: number;
  signalType: string;
  hypothesisId: string | null;
  thesis: string;
  closeReason: CloseReason;
  instrumentType?: string;
  instrumentId?: string;
  instrumentLabel?: string;
}

interface PolymarketContractMark {
  yesPrice: number;
  bestBid: number;
  bestAsk: number;
}

function dataPath(name: string) {
  return join(DATA_DIR, name);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(dataPath(name), "utf-8")) as T;
}

function writeJson(name: string, value: unknown) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(dataPath(name), JSON.stringify(value, null, 2) + "\n");
}

async function fetchJson(url: string, body?: unknown): Promise<any> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchHyperliquidMarks(): Promise<Record<string, number>> {
  const marks: Record<string, number> = {};

  try {
    const allMids = await fetchJson(HL_API, { type: "allMids" });
    for (const asset of ["BTC", "HYPE"]) {
      const value = numeric(allMids?.[asset]);
      if (value) marks[asset] = value;
    }
  } catch (error: any) {
    console.warn(`Hyperliquid allMids unavailable: ${error.message}`);
  }

  try {
    const dexMeta = await fetchJson(HL_API, { type: "metaAndAssetCtxs", dex: "xyz" });
    const universe: { name: string }[] = dexMeta?.[0]?.universe ?? [];
    const ctxs: any[] = dexMeta?.[1] ?? [];
    const builderAssets: Array<[string, string]> = [
      ["xyz:AMZN", "AMZN"],
      ["xyz:GOLD", "GOLD"],
      ["xyz:CL", "OIL"],
    ];
    for (const [coin, asset] of builderAssets) {
      const idx = universe.findIndex((item) => item.name === coin);
      const value = idx >= 0 ? numeric(ctxs[idx]?.markPx) : null;
      if (value) marks[asset] = value;
    }
  } catch (error: any) {
    console.warn(`Hyperliquid xyz marks unavailable: ${error.message}`);
  }

  return marks;
}

async function fetchPolymarketMarks(positions: Position[]): Promise<Map<string, PolymarketContractMark>> {
  const marks = new Map<string, PolymarketContractMark>();
  const slugs = [...new Set(positions
    .map((position) => position.instrumentId?.split("::")[0])
    .filter((slug): slug is string => !!slug))];

  for (const slug of slugs) {
    try {
      const events = await fetchJson(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`);
      for (const event of Array.isArray(events) ? events : []) {
        for (const market of event.markets ?? []) {
          const marketId = String(market.id ?? "");
          if (!marketId) continue;
          let outcomePrices: number[] = [];
          try {
            outcomePrices = JSON.parse(market.outcomePrices || "[]").map(Number);
          } catch {}
          marks.set(`${slug}::${marketId}`, {
            yesPrice: outcomePrices[0] ?? 0,
            bestBid: Number(market.bestBid ?? 0),
            bestAsk: Number(market.bestAsk ?? 0),
          });
        }
      }
    } catch (error: any) {
      console.warn(`Polymarket mark unavailable for ${slug}: ${error.message}`);
    }
  }

  return marks;
}

function polymarketExitPrice(contract: PolymarketContractMark, instrumentType: InstrumentType): number | null {
  if (instrumentType === "pm_yes") return contract.bestBid > 0 ? contract.bestBid : contract.yesPrice;
  if (instrumentType === "pm_no") return contract.bestAsk > 0 ? 1 - contract.bestAsk : 1 - contract.yesPrice;
  return null;
}

function markPosition(
  position: Position,
  assetMarks: Record<string, number>,
  polymarketMarks: Map<string, PolymarketContractMark>,
): Mark | null {
  let currentPrice: number | null = null;
  let underlyingPrice: number | null = assetMarks[position.asset] ?? null;
  let marketPnl = 0;
  const fundingPnl = position.fundingPnlAccrued ?? 0;

  if (position.instrumentType === "pm_yes" || position.instrumentType === "pm_no") {
    const contract = position.instrumentId ? polymarketMarks.get(position.instrumentId) : null;
    if (!contract) return null;
    currentPrice = polymarketExitPrice(contract, position.instrumentType);
    if (!currentPrice || currentPrice <= 0) return null;
    const shares = position.size / position.entryPrice;
    marketPnl = shares * (currentPrice - position.entryPrice);
  } else {
    currentPrice = assetMarks[position.asset] ?? null;
    if (!currentPrice || currentPrice <= 0) return null;
    const rawReturn = position.direction === "long"
      ? (currentPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - currentPrice) / position.entryPrice;
    marketPnl = position.size * (position.leverage ?? 1) * rawReturn;
  }

  const pnl = marketPnl + fundingPnl;
  return {
    currentPrice,
    underlyingPrice,
    marketPnl,
    fundingPnl,
    pnl,
    pnlPct: (pnl / position.size) * 100,
  };
}

function isFundingSignal(signalType: string): boolean {
  return signalType === "FUNDING_EXTREME_SHORT" || signalType === "FUNDING_EXTREME_LONG";
}

function updatePeakPnl(position: Position, mark: Mark) {
  position.peakPnlPct = Math.max(position.peakPnlPct ?? mark.pnlPct, mark.pnlPct);
}

function fundingBreakevenStopHit(position: Position, mark: Mark): boolean {
  return isFundingSignal(position.signalType)
    && (position.peakPnlPct ?? mark.pnlPct) >= FUNDING_BREAKEVEN_ARM_PCT
    && mark.pnlPct <= FUNDING_BREAKEVEN_LOCK_PCT;
}

function realizeClosedPosition(portfolio: Portfolio, position: Position, mark: Mark, closeReason: CloseReason, closedAt: string): ClosedTrade {
  const trade: ClosedTrade = {
    id: position.id,
    openedAt: position.openedAt,
    closedAt,
    asset: position.asset,
    venue: position.venue,
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice: mark.currentPrice,
    size: position.size,
    leverage: position.leverage ?? 1,
    pnl: mark.pnl,
    pnlPct: mark.pnlPct,
    marketPnl: mark.marketPnl,
    fundingPnl: mark.fundingPnl,
    signalType: position.signalType,
    hypothesisId: position.hypothesisId,
    thesis: position.thesis,
    closeReason,
    instrumentType: position.instrumentType,
    instrumentId: position.instrumentId,
    instrumentLabel: position.instrumentLabel,
  };

  portfolio.cash += position.size + mark.pnl;
  portfolio.totalRealizedPnl += mark.pnl;
  portfolio.totalTrades++;
  if (mark.pnl >= 0) portfolio.winCount++;
  else portfolio.lossCount++;

  return trade;
}

function appendTradeCsv(trade: ClosedTrade) {
  const header = "id,opened_at,closed_at,asset,venue,direction,instrument_type,instrument_id,instrument_label,entry_price,exit_price,size,leverage,pnl,pnl_pct,market_pnl,funding_pnl,signal_type,hypothesis_id,thesis,close_reason\n";
  const filepath = dataPath("trades-detailed.csv");
  if (!existsSync(filepath)) appendFileSync(filepath, header);
  const vals = [
    trade.id, trade.openedAt, trade.closedAt, trade.asset, trade.venue,
    trade.direction, trade.instrumentType ?? "", trade.instrumentId ?? "",
    `"${(trade.instrumentLabel ?? "").replace(/"/g, '""')}"`,
    trade.entryPrice, trade.exitPrice, trade.size, trade.leverage ?? 1,
    trade.pnl.toFixed(4), trade.pnlPct.toFixed(2),
    (trade.marketPnl ?? trade.pnl).toFixed(4), (trade.fundingPnl ?? 0).toFixed(4),
    trade.signalType, trade.hypothesisId ?? "",
    `"${trade.thesis.replace(/"/g, '""')}"`, trade.closeReason,
  ];
  appendFileSync(filepath, vals.join(",") + "\n");
}

async function main() {
  const portfolio = readJson<Portfolio>("portfolio.json");
  if (portfolio.positions.length === 0) {
    console.log("Exit scanner: no open positions.");
    return;
  }

  const [assetMarks, polymarketMarks] = await Promise.all([
    fetchHyperliquidMarks(),
    fetchPolymarketMarks(portfolio.positions.filter((position) => position.venue === "polymarket")),
  ]);

  const now = new Date().toISOString();
  const remaining: Position[] = [];
  const closed: ClosedTrade[] = [];

  for (const position of portfolio.positions) {
    const mark = markPosition(position, assetMarks, polymarketMarks);
    if (!mark) {
      remaining.push(position);
      continue;
    }
    updatePeakPnl(position, mark);

    let closeReason: CloseReason | null = null;
    if (position.targetPct !== null && mark.pnlPct >= position.targetPct) closeReason = "target";
    else if (fundingBreakevenStopHit(position, mark)) closeReason = "breakeven_stop";
    else if (mark.pnlPct <= -position.stopPct) closeReason = "stop";
    else if (new Date(position.expiryDate) <= new Date()) closeReason = "expiry";

    position.currentPrice = mark.currentPrice;
    position.currentUnderlyingPrice = mark.underlyingPrice ?? undefined;
    position.fundingPnlAccrued = mark.fundingPnl;

    if (closeReason) {
      const trade = realizeClosedPosition(portfolio, position, mark, closeReason, now);
      closed.push(trade);
      console.log(`Exit scanner: ${position.asset} ${position.direction} ${closeReason} at ${mark.currentPrice} (${mark.pnlPct.toFixed(2)}%).`);
    } else {
      remaining.push(position);
    }
  }

  if (closed.length === 0) {
    if (!DRY_RUN) {
      portfolio.lastUpdated = now;
      writeJson("portfolio.json", portfolio);
    }
    console.log(`Exit scanner: checked ${portfolio.positions.length} positions; no exits.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`Exit scanner dry run: would close ${closed.length} positions.`);
    return;
  }

  portfolio.positions = remaining;
  portfolio.lastUpdated = now;
  for (const trade of closed) appendTradeCsv(trade);
  writeJson("portfolio.json", portfolio);
  console.log(`Exit scanner: closed ${closed.length} positions and saved portfolio.`);
}

main().catch((error) => {
  console.error(`Exit scanner failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
