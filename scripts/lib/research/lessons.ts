import { renameSync, writeFileSync } from "node:fs";
import { loadOperationallyTaintedTrades } from "../../portfolio-ledger.js";
import type { ReportBlockedSignalShadow, ReportClosedTrade } from "../reporting/report-builders.js";
import { dedupeClosedTrades, readClosedTrades, readJson } from "../reporting/report-data.js";
import { isForceClosedOneTouchShadow } from "../reporting/report-inputs.js";
import type { ReportShadowWithCloseTrigger } from "../reporting/report-inputs.js";

/**
 * Nightly-research artifact contract (July 2026 infrastructure plan, Phase 4).
 *
 * Deterministic, LLM-free rollup of what the live trader and shadow book have
 * actually done per signal type, so downstream tooling (or a human) can read
 * a small JSON file instead of re-deriving stats from the raw ledgers.
 */
export interface Lesson {
  signalType: string;
  scope: "live" | "shadow";
  asset?: string;
  n: number;
  wins: number;
  winRate: number;
  pnl: number;
  closeTriggerCounts: Record<string, number>;
  note: string;
}

export interface LessonsArtifact {
  generatedAt: string;
  lessons: Lesson[];
}

interface LessonOutcome {
  pnl: number;
  win: boolean;
  closeTrigger: string;
}

const DEFAULT_MIN_ASSET_TRADES = 5;

/**
 * Same predicate as the (unexported) `isMacroReportTrade` in
 * trader-performance-report.ts: monotonic-arb packages are a separate
 * risk-free strategy record and don't belong in signal-type lessons.
 */
function isMacroReportTrade(trade: Pick<ReportClosedTrade, "signalType" | "instrumentType">): boolean {
  return trade.signalType !== "MONOTONIC_ARB" && trade.instrumentType !== "pm_package";
}

/**
 * Mirrors `isCountedRealTrade` in trader-performance-report.ts: the same
 * canonical live-trade definition used for the performance report, so
 * lessons.json agrees with what a human reading that report would see.
 */
function isLearnableLiveTrade(trade: ReportClosedTrade, taintedTrades: Record<string, string>): boolean {
  return isMacroReportTrade(trade)
    && !taintedTrades[trade.id]
    && trade.closeReason !== "data_quality_artifact"
    && !(trade.closeReason ?? "").includes("DATA_CORRECTION_ARTIFACT")
    && !(trade.thesis ?? "").includes("NON_LEARNING_CLOSE");
}

function isLearnableResolvedShadow(shadow: ReportShadowWithCloseTrigger): boolean {
  return shadow.status === "resolved"
    && !!shadow.hypotheticalResult
    && !shadow.learningExcluded
    && !isForceClosedOneTouchShadow(shadow);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function buildNote(scope: "live" | "shadow", n: number, winRate: number, pnl: number, asset?: string): string {
  const pct = Math.round(winRate * 100);
  const sign = pnl >= 0 ? "+" : "";
  const label = scope === "shadow" ? "resolved shadows" : asset ? `live ${asset} trades` : "live trades";
  return `${n} ${label}, ${pct}% win rate, ${sign}$${pnl.toFixed(2)} total`;
}

function buildLesson(scope: "live" | "shadow", signalType: string, asset: string | undefined, outcomes: LessonOutcome[]): Lesson {
  const n = outcomes.length;
  const wins = outcomes.filter((outcome) => outcome.win).length;
  const pnl = outcomes.reduce((sum, outcome) => sum + outcome.pnl, 0);
  const winRate = n > 0 ? wins / n : 0;
  const closeTriggerCounts: Record<string, number> = {};
  for (const outcome of outcomes) {
    closeTriggerCounts[outcome.closeTrigger] = (closeTriggerCounts[outcome.closeTrigger] ?? 0) + 1;
  }
  const base = {
    signalType,
    scope,
    n,
    wins,
    winRate: round4(winRate),
    pnl: round4(pnl),
    closeTriggerCounts,
    note: buildNote(scope, n, winRate, pnl, asset),
  };
  return asset ? { ...base, asset } : base;
}

function tradeOutcome(trade: ReportClosedTrade): LessonOutcome {
  return { pnl: trade.pnl, win: trade.pnl >= 0, closeTrigger: trade.closeReason || "unknown" };
}

function shadowOutcome(shadow: ReportShadowWithCloseTrigger): LessonOutcome {
  const result = shadow.hypotheticalResult!;
  return {
    pnl: result.pnl,
    win: result.outcome === "win",
    closeTrigger: result.closeTrigger ?? result.closeReason ?? "unknown",
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function liveLessons(trades: ReportClosedTrade[], minAssetTrades: number): Lesson[] {
  const lessons: Lesson[] = [];
  for (const [signalType, signalTrades] of groupBy(trades, (trade) => trade.signalType)) {
    lessons.push(buildLesson("live", signalType, undefined, signalTrades.map(tradeOutcome)));
    for (const [asset, assetTrades] of groupBy(signalTrades, (trade) => trade.asset)) {
      if (assetTrades.length < minAssetTrades) continue;
      lessons.push(buildLesson("live", signalType, asset, assetTrades.map(tradeOutcome)));
    }
  }
  return lessons;
}

function shadowLessons(shadows: ReportShadowWithCloseTrigger[]): Lesson[] {
  const resolved = shadows.filter(isLearnableResolvedShadow);
  const lessons: Lesson[] = [];
  for (const [signalType, signalShadows] of groupBy(resolved, (shadow) => shadow.signalType)) {
    lessons.push(buildLesson("shadow", signalType, undefined, signalShadows.map(shadowOutcome)));
  }
  return lessons;
}

function compareLessons(a: Lesson, b: Lesson): number {
  return a.scope.localeCompare(b.scope)
    || a.signalType.localeCompare(b.signalType)
    || (a.asset ?? "").localeCompare(b.asset ?? "");
}

export interface BuildLessonsArtifactInput {
  generatedAt: string;
  liveTrades: ReportClosedTrade[];
  shadows: ReportShadowWithCloseTrigger[];
  minAssetTrades?: number;
}

/** Pure aggregation core — no file I/O, so it's directly unit-testable. */
export function buildLessonsArtifact(input: BuildLessonsArtifactInput): LessonsArtifact {
  const minAssetTrades = input.minAssetTrades ?? DEFAULT_MIN_ASSET_TRADES;
  const lessons = [
    ...liveLessons(input.liveTrades, minAssetTrades),
    ...shadowLessons(input.shadows),
  ].sort(compareLessons);
  return { generatedAt: input.generatedAt, lessons };
}

/** Thin I/O wrapper: loads + filters the live ledger the same way the performance report does. */
export function loadLiveLessonTrades(tradesCsvPath: string): ReportClosedTrade[] {
  const taintedTrades = loadOperationallyTaintedTrades();
  const allClosedTrades = readClosedTrades(tradesCsvPath);
  const deduped = dedupeClosedTrades(allClosedTrades.filter(isMacroReportTrade));
  return deduped.filter((trade) => isLearnableLiveTrade(trade, taintedTrades));
}

/** Thin I/O wrapper: loads the raw shadow-signal array (filtering happens in buildLessonsArtifact). */
export function loadShadowRecords(blockedSignalsPath: string): ReportShadowWithCloseTrigger[] {
  return readJson<ReportBlockedSignalShadow[]>(blockedSignalsPath, []) as ReportShadowWithCloseTrigger[];
}

export function buildLessonsArtifactFromFiles(paths: {
  tradesCsvPath: string;
  blockedSignalsPath: string;
  now?: Date;
}): LessonsArtifact {
  return buildLessonsArtifact({
    generatedAt: (paths.now ?? new Date()).toISOString(),
    liveTrades: loadLiveLessonTrades(paths.tradesCsvPath),
    shadows: loadShadowRecords(paths.blockedSignalsPath),
  });
}

/** Atomic write (tmp + rename) — safe for a nightly job to overwrite in place. */
export function writeLessonsArtifact(path: string, artifact: LessonsArtifact): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(artifact, null, 2) + "\n");
  renameSync(tmp, path);
}
