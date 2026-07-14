import { closeSync, existsSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { SizingCalibrationBucket } from "../trading/sizing.js";

/**
 * Nightly-research artifact contract (July 2026 infrastructure plan, Phase 4).
 *
 * The nightly research run aggregates the unbounded NO-bias calibration log
 * (relative-value/calibration/no_bias_candidates.jsonl, 240MB+ on the VPS)
 * into this small summary. The hourly engine reads ONLY the summary — never
 * the raw log — so a growing calibration file can never again take down the
 * hourly run (Jul 11–14 OOM outage).
 */
export interface CalibrationBucketsSummary {
  generatedAt: string;
  sourceFile: string;
  marketsResolved: number;
  buckets: SizingCalibrationBucket[];
}

export type CalibrationSummaryStatus = "fresh" | "stale" | "missing" | "invalid";

export interface CalibrationSummaryReadResult {
  status: CalibrationSummaryStatus;
  generatedAt: string | null;
  buckets: SizingCalibrationBucket[];
}

function calibrationEntryPrice(row: Record<string, unknown>): number | null {
  const yesBid = typeof row.pm_best_bid === "number" ? row.pm_best_bid : Number(row.pm_best_bid);
  if (!Number.isFinite(yesBid)) return null;
  const entry = 1 - yesBid;
  return entry > 0 && entry < 1 ? entry : null;
}

/**
 * Stream the calibration JSONL in fixed-size chunks and keep only a tiny
 * per-market aggregate: the earliest resolved outcome and the earliest
 * gate-passing row's entry price + asset. Memory is O(markets), not O(rows).
 * (Moved verbatim from trading-engine.ts loadNoBiasCalibrationBuckets.)
 */
export function aggregateNoBiasCalibrationBuckets(path: string, signalType: string): CalibrationBucketsSummary {
  interface MarketAgg {
    outcome: "YES" | "NO" | null;
    outcomeTs: string;
    passTs: string;
    passEntry: number | null;
    passAsset: string;
    hasPass: boolean;
  }
  const byMarket = new Map<string, MarketAgg>();
  const consumeLine = (line: string): void => {
    if (!line.trim()) return;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      const marketId = String(row.market_id ?? "");
      if (!marketId) return;
      const ts = String(row.timestamp ?? "");
      let agg = byMarket.get(marketId);
      if (!agg) {
        agg = { outcome: null, outcomeTs: "", passTs: "", passEntry: null, passAsset: "", hasPass: false };
        byMarket.set(marketId, agg);
      }
      if ((row.resolved_outcome === "YES" || row.resolved_outcome === "NO")
          && (agg.outcome === null || ts < agg.outcomeTs)) {
        agg.outcome = row.resolved_outcome;
        agg.outcomeTs = ts;
      }
      if (row.candidate_passed === true && (!agg.hasPass || ts < agg.passTs)) {
        agg.hasPass = true;
        agg.passTs = ts;
        agg.passEntry = calibrationEntryPrice(row);
        agg.passAsset = String(row.asset ?? "");
      }
    } catch {}
  };

  if (existsSync(path)) {
    const fd = openSync(path, "r");
    try {
      const chunk = Buffer.alloc(8 * 1024 * 1024);
      const decoder = new StringDecoder("utf8");
      let carry = "";
      for (;;) {
        const bytesRead = readSync(fd, chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        const lines = (carry + decoder.write(chunk.subarray(0, bytesRead))).split("\n");
        carry = lines.pop() ?? "";
        for (const line of lines) consumeLine(line);
      }
      consumeLine(carry + decoder.end());
    } finally {
      closeSync(fd);
    }
  }

  const byAsset = new Map<string, { n: number; wins: number }>();
  let total = 0;
  let wins = 0;
  for (const agg of byMarket.values()) {
    const outcome = agg.outcome;
    if (outcome !== "YES" && outcome !== "NO") continue;
    if (!agg.hasPass || agg.passEntry === null) continue;
    const asset = agg.passAsset;
    const won = outcome === "NO";
    total++;
    if (won) wins++;
    if (asset) {
      const bucket = byAsset.get(asset) ?? { n: 0, wins: 0 };
      bucket.n++;
      if (won) bucket.wins++;
      byAsset.set(asset, bucket);
    }
  }

  const buckets: SizingCalibrationBucket[] = [];
  if (total > 0) {
    buckets.push({
      signalType,
      n: total,
      winRate: wins / total,
      label: "NO-bias gate resolved events",
    });
  }
  for (const [asset, bucket] of byAsset) {
    buckets.push({
      signalType,
      asset,
      n: bucket.n,
      winRate: bucket.wins / bucket.n,
      label: `NO-bias gate resolved events / ${asset}`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: path,
    marketsResolved: total,
    buckets,
  };
}

/** Atomic write (tmp + rename) so the hourly engine never reads a torn file. */
export function writeCalibrationBucketsSummary(path: string, summary: CalibrationBucketsSummary): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(summary, null, 2) + "\n");
  renameSync(tmp, path);
}

const DEFAULT_MAX_AGE_HOURS = 48;

/**
 * Failure-isolation contract: this never throws. Calibration win rates are
 * cumulative and move slowly, so stale buckets are still returned (flagged
 * "stale" for logging); only a missing or unparseable artifact yields empty
 * buckets, in which case sizing falls back to signal history / confidence —
 * the same behavior as before calibration buckets existed.
 */
export function readCalibrationBucketsSummary(
  path: string,
  opts: { maxAgeHours?: number; now?: Date } = {},
): CalibrationSummaryReadResult {
  const maxAgeHours = opts.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const now = opts.now ?? new Date();
  if (!existsSync(path)) {
    return { status: "missing", generatedAt: null, buckets: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<CalibrationBucketsSummary>;
    const buckets = Array.isArray(parsed.buckets)
      ? parsed.buckets.filter((bucket): bucket is SizingCalibrationBucket =>
          !!bucket && typeof bucket === "object"
          && typeof (bucket as SizingCalibrationBucket).signalType === "string"
          && Number.isFinite((bucket as SizingCalibrationBucket).n)
          && Number.isFinite((bucket as SizingCalibrationBucket).winRate))
      : [];
    const generatedAt = typeof parsed.generatedAt === "string" ? parsed.generatedAt : null;
    const ageMs = generatedAt ? now.getTime() - Date.parse(generatedAt) : Number.POSITIVE_INFINITY;
    const status: CalibrationSummaryStatus = Number.isFinite(ageMs) && ageMs <= maxAgeHours * 3600_000
      ? "fresh"
      : "stale";
    return { status, generatedAt, buckets };
  } catch {
    return { status: "invalid", generatedAt: null, buckets: [] };
  }
}
