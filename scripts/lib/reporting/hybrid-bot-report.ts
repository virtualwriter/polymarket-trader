import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReportHybridBot, ReportHybridBotCoinStats, ReportHybridBotPosition } from "./report-builders.js";

interface HybridBotShadowEvent {
  ts?: string;
  coin?: string;
  action?: "open" | "close";
  side?: "long" | "short";
  entry_price?: number;
  exit_price?: number;
  signal_price?: number;
  fill_price?: number;
  fill_size?: number;
  real_size_usd?: number;
  size_usd?: number;
  fee_usd?: number;
  real_fee_usd?: number;
  pnl_pct?: number;
  regime?: "bull" | "bear";
  reason?: string;
  ema_diff_pct?: number;
}

interface HybridBotState {
  positions?: Record<string, ReportHybridBotPosition>;
  total_trades?: number;
  total_wins?: number;
  total_fees?: number;
}

export function resolveHybridBotFile(args: {
  envValue: string | undefined;
  basename: string;
  liveStateDir: string;
  dataDir: string;
}): string {
  if (args.envValue) return args.envValue;
  const primary = join(args.liveStateDir, args.basename);
  if (existsSync(primary)) return primary;
  const localFallback = join(args.dataDir, args.basename);
  return existsSync(localFallback) ? localFallback : primary;
}

/**
 * The hybrid bot's real-dollar trades belong to a separate fund and must never
 * be counted at real notional in this trader's reports. This trader analyzes
 * $1 paper trades, so every hybrid event is re-normalized to a fixed $1 shadow
 * notional here, regardless of what size_usd the feed recorded (the live
 * service ran with --shadow-size 2000, which wrote real-fund notional into
 * the shadow feed).
 */
export const HYBRID_SHADOW_NOTIONAL_USD = 1.0;

export function readHybridBotReport(args: {
  stateFile: string;
  tradesFile: string;
}): ReportHybridBot {
  const empty: ReportHybridBotCoinStats = {
    trades: 0, wins: 0, losses: 0,
    realizedPnlUsd: 0, realizedPnlPctSum: 0, feesUsd: 0,
    opens: 0, closes: 0, lastEventTs: null,
  };
  const report: ReportHybridBot = {
    available: false,
    stateLastModified: null,
    feedLastModified: null,
    positions: new Map(),
    perCoinStats: new Map(),
    totalsAcrossAllCoins: { ...empty },
  };

  if (existsSync(args.stateFile)) {
    try {
      const state = JSON.parse(readFileSync(args.stateFile, "utf-8")) as HybridBotState;
      report.stateLastModified = statSync(args.stateFile).mtime.toISOString();
      report.available = true;
      for (const [coin, pos] of Object.entries(state.positions ?? {})) {
        if (pos && pos.in_position) report.positions.set(coin, pos);
      }
    } catch (err) {
      console.error(`[hybrid-bot] failed to read state: ${(err as Error).message}`);
    }
  }

  if (existsSync(args.tradesFile)) {
    try {
      report.feedLastModified = statSync(args.tradesFile).mtime.toISOString();
      report.available = true;
      const raw = readFileSync(args.tradesFile, "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        let event: HybridBotShadowEvent;
        try { event = JSON.parse(line); } catch { continue; }
        const coin = event.coin ?? "UNKNOWN";
        const stats = report.perCoinStats.get(coin) ?? { ...empty };
        const totals = report.totalsAcrossAllCoins;
        // Scale the actual exchange fee down to the $1 paper notional. Real
        // fees (real_fee_usd over real_size_usd) are preferred; fall back to
        // the recorded fee over the recorded size.
        const realFee = Number(event.real_fee_usd ?? event.fee_usd ?? 0);
        const realSize = Number(event.real_size_usd ?? event.size_usd ?? 0);
        const fee = realFee > 0 && realSize > 0
          ? realFee * (HYBRID_SHADOW_NOTIONAL_USD / realSize)
          : 0;
        stats.feesUsd += fee;
        totals.feesUsd += fee;
        if (event.action === "open") {
          stats.opens += 1;
          totals.opens += 1;
        } else if (event.action === "close") {
          stats.closes += 1;
          totals.closes += 1;
          stats.trades += 1;
          totals.trades += 1;
          const pct = Number(event.pnl_pct ?? 0);
          const pnlUsd = (pct / 100) * HYBRID_SHADOW_NOTIONAL_USD - fee;
          stats.realizedPnlUsd += pnlUsd;
          stats.realizedPnlPctSum += pct;
          totals.realizedPnlUsd += pnlUsd;
          totals.realizedPnlPctSum += pct;
          if (pnlUsd > 0) {
            stats.wins += 1;
            totals.wins += 1;
          } else {
            stats.losses += 1;
            totals.losses += 1;
          }
        }
        if (event.ts) {
          stats.lastEventTs = event.ts;
          totals.lastEventTs = event.ts;
        }
        report.perCoinStats.set(coin, stats);
      }
    } catch (err) {
      console.error(`[hybrid-bot] failed to read shadow trades: ${(err as Error).message}`);
    }
  }

  return report;
}
