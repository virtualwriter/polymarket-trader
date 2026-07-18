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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  HYPOTHESIS_SHADOW_TESTS_REQUIRED,
  RETIRED_LLM_SETUP_IDS,
  completedHypothesisTests,
  evaluateHypothesisTest,
  hypothesisConditionsSatisfied,
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
  targetTests: number;
  hypothesesPath: string;
  valuationsPath: string;
  relativeValuePath: string;
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
  before: Counts;
  after: Counts;
  totals: {
    familiesVisited: number;
    testsOpened: number;
    testsResolved: number;
    wins: number;
    losses: number;
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
    targetTests: HYPOTHESIS_SHADOW_TESTS_REQUIRED,
    hypothesesPath: "data/hypotheses.json",
    valuationsPath: "data/daily-valuations.csv",
    relativeValuePath: "relative-value/cross_venue_relative_value.csv",
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
    else if (arg === "--target-tests") opts.targetTests = Number(next());
    else if (arg === "--hypotheses") opts.hypothesesPath = next();
    else if (arg === "--valuations") opts.valuationsPath = next();
    else if (arg === "--relative-value") opts.relativeValuePath = next();
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
  return readCsvFile(path)
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

function eligibleFamilies(hypotheses: Hypothesis[]): HypothesisSetupFamily[] {
  return hypothesisSetupFamilies(hypotheses.filter((hypothesis) => hypothesis.source === "llm"))
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

function familySnapshot(family: HypothesisSetupFamily) {
  const completed = completedFamilyTests(family);
  const pending = pendingFamilyTests(family);
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
    .find((hypothesis) => hypothesisConditionsSatisfied(hypothesis, valuationHistory, relativeHistory)) ?? null;
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
      test.actualMove = `[historical-backfill] ${result.actualMove} (resolved ${currentDate} from ${dayKey(test.date)})`;
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
  const hypotheses = JSON.parse(readFileSync(hypothesesPath, "utf-8")) as Hypothesis[];
  const valuationRows = readValuationRows(valuationsPath);
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
    .sort((a, b) => completedFamilyTests(a).length - completedFamilyTests(b).length || a.setupId.localeCompare(b.setupId));
  const selectedFamilies = opts.maxFamilies === null ? families : families.slice(0, opts.maxFamilies);

  const summaries: FamilyBackfillSummary[] = [];
  let totalOpened = 0;
  let totalResolved = 0;
  let totalWins = 0;
  let totalLosses = 0;

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

      let snapshot = familySnapshot(family);
      if (snapshot.completed.length >= opts.targetTests) break;
      if (snapshot.total >= opts.targetTests) continue;
      if (hasFamilyTestOnDate(family, currentDate)) {
        skippedOpenDates++;
        continue;
      }

      const candidate = candidateForDate(family, valuationHistory, relativeHistory);
      if (!candidate) continue;

      snapshot = familySnapshot(family);
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
    before,
    after,
    totals: {
      familiesVisited: selectedFamilies.length,
      testsOpened: totalOpened,
      testsResolved: totalResolved,
      wins: totalWins,
      losses: totalLosses,
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
  reportPath: opts.reportPath,
}, null, 2));
