#!/usr/bin/env tsx
/**
 * Historical hypothesis shadow-test backfill.
 *
 * Dry run:
 *   npx tsx scripts/backfill-hypothesis-shadow-tests.ts --dry-run
 * Apply:
 *   npx tsx scripts/backfill-hypothesis-shadow-tests.ts --apply
 *
 * Optional nightly wiring can call this with --apply only when
 * HYPOTHESIS_SHADOW_BACKFILL=1. The default path is deliberately manual so
 * historical research mutations do not surprise the live loop.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  HYPOTHESIS_SHADOW_TESTS_REQUIRED,
  RETIRED_LLM_SETUP_IDS,
  completedHypothesisTests,
  evaluateHypothesisCondition,
  evaluateHypothesisTest,
  hypothesisSetupFamilies,
  isDataContaminatedSetup,
  pendingHypothesisTests,
  type Hypothesis,
  type HypothesisSetupFamily,
  type RelativeValueObservation,
  type SnapshotRow,
} from "./lib/research/hypothesis-shadow-eval.js";

interface CliOptions {
  apply: boolean;
  dryRun: boolean;
  maxFamilies: number | null;
  setupIds: string[] | null;
  targetTests: number;
  hypothesesPath: string;
  valuationsPath: string;
  relativeValuePath: string;
  hlFundingHistoryPath: string;
  reportPath: string;
}

interface FamilyBackfillSummary {
  setupId: string;
  setupLabel: string;
  beforeCompleted: number;
  beforePending: number;
  afterCompleted: number;
  afterPending: number;
  opened: number;
  resolved: number;
  wins: number;
  losses: number;
  skippedOpenDates: number;
  unfilledReason: string | null;
}

interface Report {
  mode: "dry-run" | "apply";
  generatedAt: string;
  targetTests: number;
  maxFamilies: number | null;
  hypothesesPath: string;
  valuationsPath: string;
  relativeValuePath: string;
  hlFundingHistoryPath: string;
  before: Counts;
  after: Counts;
  totals: {
    familiesVisited: number;
    testsOpened: number;
    testsResolved: number;
    wins: number;
    losses: number;
    skippedMetadataConditions: number;
    skippedUnknownConditions: Record<string, number>;
    missingMetricConditions: Record<string, number>;
  };
  families: FamilyBackfillSummary[];
  unfilledFamilies: FamilyBackfillSummary[];
}

interface Counts {
  eligibleFamilies: number;
  eligibleUnderTarget: number;
  allLlmFamilies: number;
  allLlmUnderTarget: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    apply: false,
    dryRun: false,
    maxFamilies: null,
    setupIds: null,
    targetTests: HYPOTHESIS_SHADOW_TESTS_REQUIRED,
    hypothesesPath: "data/hypotheses.json",
    valuationsPath: "data/daily-valuations.csv",
    relativeValuePath: "relative-value/cross_venue_relative_value.csv",
    hlFundingHistoryPath: "data/hl-funding-history.csv",
    reportPath: "data/hypothesis-shadow-backfill-report.json",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--max-families") opts.maxFamilies = Number(next());
    else if (arg === "--setup-ids") {
      opts.setupIds = next().split(",").map((value) => value.trim()).filter(Boolean);
    } else if (arg === "--target-tests") opts.targetTests = Number(next());
    else if (arg === "--hypotheses") opts.hypothesesPath = next();
    else if (arg === "--valuations") opts.valuationsPath = next();
    else if (arg === "--relative-value") opts.relativeValuePath = next();
    else if (arg === "--hl-funding-history") opts.hlFundingHistoryPath = next();
    else if (arg === "--report") opts.reportPath = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (opts.apply && opts.dryRun) throw new Error("Use only one of --apply or --dry-run.");
  if (!opts.apply) opts.dryRun = true;
  if (!Number.isInteger(opts.targetTests) || opts.targetTests <= 0) throw new Error("--target-tests must be a positive integer.");
  if (opts.maxFamilies !== null && (!Number.isInteger(opts.maxFamilies) || opts.maxFamilies <= 0)) {
    throw new Error("--max-families must be a positive integer.");
  }
  return opts;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }

  cells.push(cell);
  return cells;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function readCsvFile(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ""]));
  });
}


interface HlFundingHistoryPoint {
  timestampMs: number;
  value: number;
}

type HlFundingHistoryIndex = Map<string, HlFundingHistoryPoint[]>;

function hlFundingAssetKey(label: string): string {
  return label
    .replace(/^GOLD \(GC\)$/i, "GOLD")
    .replace(/^OIL \(CL\)$/i, "OIL")
    .replace(/^xyz:/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readHlFundingHistory(path: string): HlFundingHistoryIndex {
  const index: HlFundingHistoryIndex = new Map();
  for (const row of readCsvFile(path)) {
    const label = row.label || row.coin;
    const value = num(row.funding_ann_pct);
    const timestampMs = timeMs(row.timestamp ?? "");
    if (!label || value === null || !Number.isFinite(timestampMs) || timestampMs <= 0) continue;
    const key = hlFundingAssetKey(label);
    const points = index.get(key) ?? [];
    points.push({ timestampMs, value });
    index.set(key, points);
  }
  for (const points of index.values()) points.sort((a, b) => a.timestampMs - b.timestampMs);
  return index;
}

function nearestHlFunding(points: HlFundingHistoryPoint[], timestampMs: number): number | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].timestampMs < timestampMs) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [points[lo], points[lo - 1]].filter(Boolean) as HlFundingHistoryPoint[];
  candidates.sort((a, b) => Math.abs(a.timestampMs - timestampMs) - Math.abs(b.timestampMs - timestampMs));
  return candidates[0]?.value ?? null;
}

function enrichValuationRowsWithHlFunding(rows: SnapshotRow[], history: HlFundingHistoryIndex): SnapshotRow[] {
  if (history.size === 0) return rows;
  return rows.map((row) => {
    const timestampMs = timeMs(String(row.date));
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return row;
    let enriched: SnapshotRow | null = null;
    for (const [asset, points] of history.entries()) {
      const key = `${asset}_hl_funding_ann`;
      if (num(row[key]) !== null) continue;
      const value = nearestHlFunding(points, timestampMs);
      if (value === null) continue;
      if (!enriched) enriched = { ...row };
      enriched[key] = value;
    }
    return enriched ?? row;
  });
}

function collectCsvFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith(".csv") ? [path] : [];
  if (!stat.isDirectory()) return [];
  return readdirSync(path)
    .flatMap((entry) => collectCsvFiles(resolve(path, entry)))
    .sort();
}

function latestCsvPerDay(paths: string[]): string[] {
  const byDay = new Map<string, string>();
  for (const path of paths) {
    const day = path.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? path;
    const current = byDay.get(day);
    if (!current || path.localeCompare(current) > 0) byDay.set(day, path);
  }
  return [...byDay.values()].sort();
}

function relativeValueInputPaths(path: string): string[] {
  const stateDir = process.env.POLYMARKET_TRADER_STATE_DIR ?? "/var/lib/polymarket-trader";
  const latestPath = collectCsvFiles(path);
  const archivedPaths = latestCsvPerDay([
    ...collectCsvFiles(resolve("relative-value/history")),
    ...collectCsvFiles(resolve(stateDir, "relative-value-history")),
  ]);
  return [...new Set([...archivedPaths, ...latestPath])];
}

function readValuationRows(path: string): SnapshotRow[] {
  return readCsvFile(path)
    .map((raw) => {
      const row: SnapshotRow = { date: raw.date ?? "" };
      for (const [key, value] of Object.entries(raw)) {
        row[key] = value !== "" && !Number.isNaN(Number(value)) ? Number(value) : value;
      }
      return row;
    })
    .filter((row) => row.date.length > 0)
    .sort((a, b) => timeMs(String(a.date)) - timeMs(String(b.date)));
}

function readRelativeValueRows(path: string): RelativeValueObservation[] {
  return relativeValueInputPaths(path)
    .flatMap((inputPath) => readCsvFile(inputPath))
    .map((row): RelativeValueObservation | null => {
      const edgePts = num(row.edge_score);
      const strike = num(row.strike);
      const direction = row.direction === "above" || row.direction === "below" ? row.direction : null;
      const capRatio = num(row.pm_to_underlying_cap_ratio);
      if (strike === null || !direction) return null;
      if (edgePts === null && capRatio === null) return null;
      return {
        timestamp: row.timestamp ?? "",
        modelVersion: row.model_version ?? "",
        asset: row.asset ?? "",
        eventSlug: row.event_slug ?? "",
        marketId: row.market_id ?? "",
        question: row.contract_question ?? "",
        contractMonth: row.contract_month ?? "",
        direction,
        strike,
        expiry: row.expiry ?? "",
        pmYes: num(row.pm_yes_price),
        pmBid: num(row.pm_best_bid),
        pmAsk: num(row.pm_best_ask),
        pmSpread: num(row.pm_spread),
        modelProb: num(row.options_touch_adjusted_prob),
        underlyingCapYes: num(row.underlying_cap_yes_price),
        pmToUnderlyingCapRatio: capRatio,
        underlyingCapSignal: row.underlying_cap_signal ?? "",
        settlementYesSum: num(row.settlement_yes_sum),
        settlementOverround: num(row.settlement_overround),
        settlementTailYes: num(row.settlement_tail_yes),
        settlementSkewYes: num(row.settlement_skew_yes),
        edgePts,
        bestExpression: row.best_expression ?? "",
        optionIv: num(row.option_iv),
        pmIv: num(row.pm_iv),
        cboeNoGapPts: num(row.cboe_no_gap_pts),
        cmeNoGapPts: num(row.cme_no_gap_pts),
        adjustedNoGapPts: num(row.adjusted_no_gap_pts),
        sourceAgreementBucket: row.source_agreement_bucket ?? "",
        noBiasCandidatePassed: String(row.no_bias_candidate_passed ?? "").toLowerCase() === "true",
        liquidity: num(row.liquidity),
        perpFundingAnn: num(row.perp_funding_ann),
        perpOiUsd: num(row.perp_oi_usd),
        perpBasisPct: num(row.perp_basis_pct),
        sellYesEdgePts: num(row.sell_yes_edge_pts),
        flags: row.flags ?? "",
        rawRow: row,
      };
    })
    .filter((row): row is RelativeValueObservation => row !== null)
    .sort((a, b) => timeMs(a.timestamp) - timeMs(b.timestamp));
}

function timeMs(ts: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return Date.parse(`${ts}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(ts)) return Date.parse(`${ts}:00:00Z`);
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dayKey(ts: string): string {
  return ts.slice(0, 10);
}

function addDaysMs(ts: string, days: number): number {
  return timeMs(dayKey(ts)) + days * 24 * 60 * 60 * 1000;
}

function completedFamilyTests(family: HypothesisSetupFamily) {
  return family.hypotheses.flatMap((hypothesis) => completedHypothesisTests(hypothesis));
}

function pendingFamilyTests(family: HypothesisSetupFamily) {
  return family.hypotheses.flatMap((hypothesis) => pendingHypothesisTests(hypothesis));
}

function refreshWinRates(hypotheses: Hypothesis[]) {
  for (const hypothesis of hypotheses) {
    const completed = completedHypothesisTests(hypothesis);
    if (completed.length > 0) {
      hypothesis.winRate = completed.filter((test) => test.outcome === "win").length / completed.length;
    }
  }
}

const BACKFILL_META_CONDITION_KEYS = new Set(["venue", "asset", "signalType", "day_of_week"]);
const METRIC_KEY_HINT = /(funding|ratio|percentile|pct_|zscore|change|iv|oi|open_interest|volume|price|spread|basis|skew|tail|overround|edge|yes|ask|bid|liquidity|spot|perp|futures|cme|cboe|hl_|pm_|opt_)/i;
const DERIVED_KEY_PATTERN = /^(.+)_(pct_from_\d+[hd]_(high|low)|pct_vs_\d+[hd]_sma|percentile_\d+[hd]|zscore_\d+[hd]|change_pct_\d+[hd])$/;
const RELATIVE_VALUE_KEY_PATTERN = /^([a-z]+)_pm_(underlying_cap|settle)_(ratio|edge_pts|yes_sum|overround|tail_yes|skew_yes)_(max|min|avg)(_tight)?$/;

interface ConditionBackfillStats {
  skippedMetadataConditions: number;
  skippedUnknownConditions: Map<string, number>;
  missingMetricConditions: Map<string, number>;
}

function incrementCounter(counter: Map<string, number>, key: string) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function mapToSortedRecord(counter: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function parseListExpression(rawExpression: string): string[] | null {
  const expression = String(rawExpression).trim();
  const list = expression.match(/^in\s*\[?(.+?)\]?$/i);
  const body = list ? list[1] : expression.match(/^(?:=|==)\s*(.+)$/)?.[1];
  if (!body) return null;
  return body
    .split(/[,|]/)
    .map((value) => value.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean);
}

function weekdayName(date: string): string | null {
  const ms = timeMs(date);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(ms).getUTCDay()] ?? null;
}

function metadataConditionAllows(
  key: string,
  rawExpression: string,
  latestRow: SnapshotRow,
): boolean | null {
  const allowed = parseListExpression(rawExpression);
  if (!allowed || allowed.length === 0) return null;
  if (key === "day_of_week") {
    const day = weekdayName(String(latestRow.date));
    return day ? allowed.some((value) => day === value.slice(0, 3)) : null;
  }
  const rowValue = latestRow[key];
  if (typeof rowValue !== "string" || rowValue.trim() === "") return null;
  return allowed.includes(rowValue.trim().toLowerCase());
}

function conditionKeyHasNumericData(
  key: string,
  valuationRows: SnapshotRow[],
  relativeValueRows: RelativeValueObservation[],
  hypothesis: Hypothesis,
): boolean {
  const latestRow = valuationRows[valuationRows.length - 1];
  const previousRow = valuationRows.length > 1 ? valuationRows[valuationRows.length - 2] : null;
  if (!latestRow) return false;
  if (key.startsWith("previous_")) return previousRow ? num(previousRow[key.replace(/^previous_/, "")]) !== null : false;
  if (num(latestRow[key]) !== null) return true;
  const derived = key.match(DERIVED_KEY_PATTERN);
  if (derived) return valuationRows.some((row) => num(row[derived[1]]) !== null);
  if (RELATIVE_VALUE_KEY_PATTERN.test(key)) return relativeValueRows.length > 0;
  const perp = key.match(/^([a-z]+)_hl_(funding_ann|oi|basis_pct)$/);
  if (perp) return relativeValueRows.some((row) => row.asset === perp[1].toUpperCase() && row.rawRow?.perp_funding_ann !== undefined);
  if (["sell_yes_edge_pts", "yesAsk", "yesSpread", "liquidity"].includes(key)) {
    const assetExpression = hypothesis.conditions?.asset;
    const assets = assetExpression ? parseListExpression(String(assetExpression)) : null;
    return relativeValueRows.some((row) => !assets || assets.includes(row.asset.toLowerCase()));
  }
  if (key === "ratio") {
    const pmIvKey = Object.keys(hypothesis.conditions).find((conditionKey) => conditionKey.endsWith("_pm_iv"));
    const optIvKey = Object.keys(hypothesis.conditions).find((conditionKey) => conditionKey.includes("_opt_iv"));
    return Boolean(pmIvKey && optIvKey && num(latestRow[pmIvKey]) !== null && num(latestRow[optIvKey]) !== null);
  }
  return false;
}

function isMetricLikeConditionKey(key: string): boolean {
  return METRIC_KEY_HINT.test(key) || DERIVED_KEY_PATTERN.test(key) || RELATIVE_VALUE_KEY_PATTERN.test(key);
}

function backfillConditionsSatisfied(
  hypothesis: Hypothesis,
  valuationRows: SnapshotRow[],
  relativeValueRows: RelativeValueObservation[],
  stats: ConditionBackfillStats,
): boolean {
  const latestRow = valuationRows[valuationRows.length - 1];
  if (!latestRow) return false;
  const entries = Object.entries(hypothesis.conditions ?? {});
  if (entries.length === 0) return false;

  return entries.every(([key, rawExpression]) => {
    const expression = String(rawExpression);
    if (BACKFILL_META_CONDITION_KEYS.has(key)) {
      const allowed = metadataConditionAllows(key, expression, latestRow);
      if (allowed === false) return false;
      stats.skippedMetadataConditions++;
      return true;
    }

    if (evaluateHypothesisCondition(key, expression, valuationRows, hypothesis, relativeValueRows)) return true;
    if (conditionKeyHasNumericData(key, valuationRows, relativeValueRows, hypothesis)) return false;
    if (isMetricLikeConditionKey(key)) {
      incrementCounter(stats.missingMetricConditions, key);
      return false;
    }
    incrementCounter(stats.skippedUnknownConditions, key);
    return true;
  });
}

function eligibleFamilies(hypotheses: Hypothesis[]): HypothesisSetupFamily[] {
  const eligibleSources = new Set(["llm", "shadow_mined"]);
  return hypothesisSetupFamilies(hypotheses.filter((hypothesis) => eligibleSources.has(hypothesis.source) || Boolean(hypothesis.originFindingId)))
    .filter((family) => !RETIRED_LLM_SETUP_IDS.has(family.setupId))
    .filter((family) => !isDataContaminatedSetup(family.setupId))
    .filter((family) => family.hypotheses.some((hypothesis) => hypothesis.status !== "killed" && hypothesis.status !== "archived"));
}

function countFamilies(hypotheses: Hypothesis[], targetTests: number): Counts {
  const allLlmFamilies = hypothesisSetupFamilies(hypotheses.filter((hypothesis) => hypothesis.source === "llm"));
  const eligible = eligibleFamilies(hypotheses);
  return {
    eligibleFamilies: eligible.length,
    eligibleUnderTarget: eligible.filter((family) => completedFamilyTests(family).length < targetTests).length,
    allLlmFamilies: allLlmFamilies.length,
    allLlmUnderTarget: allLlmFamilies.filter((family) => completedFamilyTests(family).length < targetTests).length,
  };
}

function hasFamilyTestOnDate(family: HypothesisSetupFamily, date: string): boolean {
  return family.hypotheses.some((hypothesis) => hypothesis.tests.some((test) => dayKey(test.date) === date));
}

function familySnapshot(family: HypothesisSetupFamily, asOfDate: string | null = null) {
  const completed = completedFamilyTests(family);
  const pending = pendingFamilyTests(family)
    .filter((test) => asOfDate === null || timeMs(dayKey(test.date)) <= timeMs(asOfDate));
  return { completed, pending, total: completed.length + pending.length };
}

function relativeRowsThrough(rows: RelativeValueObservation[], cutoffMs: number): RelativeValueObservation[] {
  if (rows.length === 0) return [];
  return rows.filter((row) => timeMs(row.timestamp) <= cutoffMs);
}

function candidateForDate(
  family: HypothesisSetupFamily,
  valuationHistory: SnapshotRow[],
  relativeHistory: RelativeValueObservation[],
  stats: ConditionBackfillStats,
): Hypothesis | null {
  return [...family.hypotheses]
    .filter((hypothesis) => hypothesis.status !== "killed" && hypothesis.status !== "archived")
    .sort((a, b) => {
      const completedDelta = completedHypothesisTests(a).length - completedHypothesisTests(b).length;
      if (completedDelta !== 0) return completedDelta;
      const pendingDelta = pendingHypothesisTests(a).length - pendingHypothesisTests(b).length;
      if (pendingDelta !== 0) return pendingDelta;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.id.localeCompare(b.id);
    })
    .find((hypothesis) => backfillConditionsSatisfied(hypothesis, valuationHistory, relativeHistory, stats)) ?? null;
}

function resolveEligiblePending(
  family: HypothesisSetupFamily,
  rowsByDate: Map<string, SnapshotRow>,
  currentDate: string,
  currentRow: SnapshotRow,
): { resolved: number; wins: number; losses: number } {
  let resolved = 0;
  let wins = 0;
  let losses = 0;
  const currentMs = timeMs(currentDate);

  for (const hypothesis of family.hypotheses) {
    for (const test of hypothesis.tests) {
      if (test.outcome !== "pending") continue;
      if (currentMs < addDaysMs(test.date, hypothesis.timeframeDays)) continue;
      const startRow = rowsByDate.get(dayKey(test.date));
      if (!startRow) continue;
      const result = evaluateHypothesisTest(hypothesis, startRow, currentRow);
      test.outcome = result.outcome;
      test.actualMove = `[historical-backfill] ${result.actualMove} (resolved ${currentDate} from ${dayKey(test.date)}; method=${result.method})`;
      if (!result.scorable) {
        test.excludedFromSetupStats = true;
        test.exclusionReason = `unscorable_scorer_v2:${result.method}`;
        continue;
      }
      resolved++;
      if (result.outcome === "win") wins++;
      else losses++;
    }
  }
  return { resolved, wins, losses };
}

function backfill(opts: CliOptions): Report {
  const hypothesesPath = resolve(opts.hypothesesPath);
  const valuationsPath = resolve(opts.valuationsPath);
  const relativeValuePath = resolve(opts.relativeValuePath);
  const hlFundingHistoryPath = resolve(opts.hlFundingHistoryPath);
  const hypotheses = JSON.parse(readFileSync(hypothesesPath, "utf-8")) as Hypothesis[];
  const valuationRows = enrichValuationRowsWithHlFunding(
    readValuationRows(valuationsPath),
    readHlFundingHistory(hlFundingHistoryPath),
  );
  const relativeRows = readRelativeValueRows(relativeValuePath);

  if (valuationRows.length === 0) throw new Error(`No valuation rows loaded from ${valuationsPath}`);

  refreshWinRates(hypotheses);
  const before = countFamilies(hypotheses, opts.targetTests);
  const rowsByDate = new Map<string, SnapshotRow>();
  const decisionRows: SnapshotRow[] = [];
  for (const row of valuationRows) {
    const date = dayKey(String(row.date));
    const isNewDate = !rowsByDate.has(date);
    rowsByDate.set(date, row);
    if (isNewDate) decisionRows.push(row);
    else decisionRows[decisionRows.length - 1] = row;
  }

  const families = eligibleFamilies(hypotheses)
    .filter((family) => completedFamilyTests(family).length < opts.targetTests)
    .filter((family) => opts.setupIds === null || opts.setupIds.includes(family.setupId))
    .sort((a, b) => completedFamilyTests(a).length - completedFamilyTests(b).length || a.setupId.localeCompare(b.setupId));
  const selectedFamilies = opts.maxFamilies === null ? families : families.slice(0, opts.maxFamilies);

  const summaries: FamilyBackfillSummary[] = [];
  let totalOpened = 0;
  let totalResolved = 0;
  let totalWins = 0;
  let totalLosses = 0;
  const conditionStats: ConditionBackfillStats = {
    skippedMetadataConditions: 0,
    skippedUnknownConditions: new Map(),
    missingMetricConditions: new Map(),
  };

  for (const family of selectedFamilies) {
    const beforeSnapshot = familySnapshot(family);
    let opened = 0;
    let resolved = 0;
    let wins = 0;
    let losses = 0;
    let skippedOpenDates = 0;

    for (const currentRow of decisionRows) {
      const currentDate = dayKey(String(currentRow.date));
      const cutoffMs = timeMs(String(currentRow.date));
      const valuationHistory = valuationRows.filter((row) => timeMs(String(row.date)) <= cutoffMs);
      const relativeHistory = relativeRowsThrough(relativeRows, cutoffMs);

      const resolution = resolveEligiblePending(family, rowsByDate, currentDate, currentRow);
      resolved += resolution.resolved;
      wins += resolution.wins;
      losses += resolution.losses;

      let snapshot = familySnapshot(family, currentDate);
      if (snapshot.completed.length >= opts.targetTests) break;
      if (snapshot.total >= opts.targetTests) continue;
      if (hasFamilyTestOnDate(family, currentDate)) {
        skippedOpenDates++;
        continue;
      }

      const candidate = candidateForDate(family, valuationHistory, relativeHistory, conditionStats);
      if (!candidate) continue;

      snapshot = familySnapshot(family, currentDate);
      if (snapshot.completed.length + snapshot.pending.length >= opts.targetTests) continue;
      candidate.tests.push({
        date: currentDate,
        triggered: true,
        outcome: "pending",
        actualMove: `[historical-backfill] Setup ${family.setupId} shadow test ${snapshot.completed.length + snapshot.pending.length + 1}/${opts.targetTests} opened via ${candidate.id} after historical row satisfied variant conditions.`,
      });
      opened++;
    }

    refreshWinRates(family.hypotheses);
    const afterSnapshot = familySnapshot(family);
    totalOpened += opened;
    totalResolved += resolved;
    totalWins += wins;
    totalLosses += losses;

    let unfilledReason: string | null = null;
    if (afterSnapshot.completed.length < opts.targetTests) {
      unfilledReason = afterSnapshot.completed.length + afterSnapshot.pending.length >= opts.targetTests
        ? "pending tests occupy target slots"
        : "conditions did not historically trigger enough resolvable tests";
    }

    summaries.push({
      setupId: family.setupId,
      setupLabel: family.setupLabel,
      beforeCompleted: beforeSnapshot.completed.length,
      beforePending: beforeSnapshot.pending.length,
      afterCompleted: afterSnapshot.completed.length,
      afterPending: afterSnapshot.pending.length,
      opened,
      resolved,
      wins,
      losses,
      skippedOpenDates,
      unfilledReason,
    });
  }

  refreshWinRates(hypotheses);
  const after = countFamilies(hypotheses, opts.targetTests);
  const report: Report = {
    mode: opts.apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    targetTests: opts.targetTests,
    maxFamilies: opts.maxFamilies,
    hypothesesPath: opts.hypothesesPath,
    valuationsPath: opts.valuationsPath,
    relativeValuePath: opts.relativeValuePath,
    hlFundingHistoryPath: opts.hlFundingHistoryPath,
    before,
    after,
    totals: {
      familiesVisited: selectedFamilies.length,
      testsOpened: totalOpened,
      testsResolved: totalResolved,
      wins: totalWins,
      losses: totalLosses,
      skippedMetadataConditions: conditionStats.skippedMetadataConditions,
      skippedUnknownConditions: mapToSortedRecord(conditionStats.skippedUnknownConditions),
      missingMetricConditions: mapToSortedRecord(conditionStats.missingMetricConditions),
    },
    families: summaries,
    unfilledFamilies: summaries.filter((family) => family.afterCompleted < opts.targetTests),
  };

  if (opts.apply) {
    writeFileSync(hypothesesPath, JSON.stringify(hypotheses, null, 2) + "\n");
  }
  mkdirSync(dirname(resolve(opts.reportPath)), { recursive: true });
  writeFileSync(resolve(opts.reportPath), JSON.stringify(report, null, 2) + "\n");
  return report;
}

const opts = parseArgs(process.argv.slice(2));
const report = backfill(opts);
console.log(JSON.stringify({
  mode: report.mode,
  beforeUnderTarget: report.before.eligibleUnderTarget,
  afterUnderTarget: report.after.eligibleUnderTarget,
  familiesVisited: report.totals.familiesVisited,
  testsOpened: report.totals.testsOpened,
  testsResolved: report.totals.testsResolved,
  wins: report.totals.wins,
  losses: report.totals.losses,
  unfilledFamilies: report.unfilledFamilies.length,
  skippedMetadataConditions: report.totals.skippedMetadataConditions,
  skippedUnknownConditions: report.totals.skippedUnknownConditions,
  missingMetricConditions: report.totals.missingMetricConditions,
  reportPath: opts.reportPath,
}, null, 2));
