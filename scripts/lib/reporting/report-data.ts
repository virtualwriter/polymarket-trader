import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { readCsvRecords } from "./csv.js";
import type { ReportBlockedSignalShadow, ReportClosedTrade, ReportPosition } from "./report-builders.js";

export interface InstrumentSnapshotFile {
  timestamp: string;
  hyperliquid?: Record<string, {
    markPx?: number | null;
    fundingAnnualized?: number | null;
  }>;
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function extractHyperliquidMids(snapshot: InstrumentSnapshotFile | null): Map<string, number> {
  const mids = new Map<string, number>();
  if (!snapshot?.hyperliquid) return mids;
  for (const [key, quote] of Object.entries(snapshot.hyperliquid)) {
    const mark = quote?.markPx;
    if (typeof mark === "number" && mark > 0) {
      mids.set(key, mark);
      mids.set(key.toUpperCase(), mark);
    }
  }
  return mids;
}

export function readLatestInstrumentSnapshot(file: string): InstrumentSnapshotFile | null {
  if (!existsSync(file)) return null;

  const size = statSync(file).size;
  if (size === 0) return null;

  const fd = openSync(file, "r");
  try {
    const chunkSize = 1024 * 1024;
    let offset = size;
    let suffix = "";

    while (offset > 0) {
      const bytesToRead = Math.min(chunkSize, offset);
      offset -= bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      readSync(fd, buffer, 0, bytesToRead, offset);
      suffix = buffer.toString("utf-8") + suffix;

      const lines = suffix.split("\n").filter((line) => line.trim());
      if (lines.length >= 2 || offset === 0) {
        const latestLine = lines[lines.length - 1];
        return latestLine ? JSON.parse(latestLine) as InstrumentSnapshotFile : null;
      }
    }
  } finally {
    closeSync(fd);
  }

  return null;
}

export function readClosedTrades(file: string): ReportClosedTrade[] {
  return readCsvRecords(file).map((row) => {
    return {
      id: row.id,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      asset: row.asset,
      venue: row.venue,
      direction: row.direction,
      entryPrice: Number(row.entry_price),
      exitPrice: Number(row.exit_price),
      size: Number(row.size),
      pnl: Number(row.pnl),
      pnlPct: Number(row.pnl_pct),
      marketPnl: Number(row.market_pnl),
      fundingPnl: Number(row.funding_pnl),
      signalType: row.signal_type,
      hypothesisId: row.hypothesis_id || null,
      entryConfidence: row.entry_confidence ? Number(row.entry_confidence) : null,
      thesis: row.thesis,
      closeReason: row.close_reason,
      instrumentType: row.instrument_type || undefined,
      instrumentId: row.instrument_id || undefined,
      instrumentLabel: row.instrument_label || undefined,
    };
  }).filter((trade) => trade.id && trade.closedAt);
}

function tradeClosedAtMs(trade: ReportClosedTrade): number {
  const parsed = new Date(trade.closedAt).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function dedupeClosedTrades(trades: ReportClosedTrade[]): ReportClosedTrade[] {
  const byId = new Map<string, ReportClosedTrade>();
  for (const trade of trades) {
    const existing = byId.get(trade.id);
    if (!existing || tradeClosedAtMs(trade) < tradeClosedAtMs(existing)) {
      byId.set(trade.id, trade);
    }
  }
  return [...byId.values()].sort((a, b) =>
    new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime() ||
    tradeClosedAtMs(a) - tradeClosedAtMs(b) ||
    a.id.localeCompare(b.id)
  );
}

export function markHlPerpPositionsFromLatestSnapshot(
  positions: ReportPosition[],
  latestSnapshot: InstrumentSnapshotFile | null,
): void {
  if (!latestSnapshot?.hyperliquid) return;
  for (const position of positions) {
    if (position.instrumentType !== "hl_perp") continue;
    const quote = latestSnapshot.hyperliquid[position.instrumentId ?? position.asset]
      ?? latestSnapshot.hyperliquid[position.asset];
    const markPx = quote?.markPx;
    if (!(typeof markPx === "number" && markPx > 0)) continue;
    position.currentPrice = markPx;
    position.currentUnderlyingPrice = markPx;
  }
}

export function markOpenShadowPositionsFromLatestSnapshot(
  shadows: ReportBlockedSignalShadow[],
  latestSnapshot: InstrumentSnapshotFile | null,
): void {
  const openShadowPositions = shadows
    .filter((shadow) => shadow.status === "open" && shadow.position)
    .map((shadow) => shadow.position as ReportPosition);
  markHlPerpPositionsFromLatestSnapshot(openShadowPositions, latestSnapshot);
}
