#!/usr/bin/env tsx
import { join } from "node:path";
import { aggregateNoBiasCalibrationBuckets, writeCalibrationBucketsSummary } from "./lib/research/calibration-summary.js";
import { compactJournalFile } from "./lib/research/journal-compaction.js";
import { buildLessonsArtifactFromFiles, writeLessonsArtifact } from "./lib/research/lessons.js";

/**
 * Nightly research orchestrator (July 2026 infrastructure plan, Phase 4).
 *
 * Runs the research work that used to live inline in the hourly trading
 * engine — calibration aggregation, lesson rollups, journal compaction — as
 * an independent nightly job. Each step is isolated: one step failing never
 * blocks the others, and the hourly engine only ever reads the small
 * artifacts this script produces (never the raw, unbounded source logs).
 */
const SCRIPT_DIR = import.meta.dirname ?? ".";
const ROOT = join(SCRIPT_DIR, "..");
const DATA_DIR = join(ROOT, "data");

const NO_BIAS_CALIBRATION_JSONL = join(ROOT, "relative-value", "calibration", "no_bias_candidates.jsonl");
const CALIBRATION_BUCKETS_SUMMARY_FILE = join(DATA_DIR, "calibration-buckets-summary.json");
const NO_BIAS_SIGNAL_TYPE = "NO_BIAS_ADJUSTED_GAP_SHADOW";

const TRADES_DETAILED_CSV = join(DATA_DIR, "trades-detailed.csv");
const BLOCKED_SIGNALS_JSON = join(DATA_DIR, "blocked-signals.json");
const LESSONS_FILE = join(DATA_DIR, "lessons.json");

const LEARNING_JOURNAL_FILE = join(DATA_DIR, "learning-journal.md");
const JOURNAL_ARCHIVE_DIR = join(DATA_DIR, "journal-archive");

function runStep(name: string, fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[nightly-research] ${name} FAILED: ${message}`);
    return `${name}: ${message}`;
  }
}

function stepCalibrationBuckets(): void {
  const summary = aggregateNoBiasCalibrationBuckets(NO_BIAS_CALIBRATION_JSONL, NO_BIAS_SIGNAL_TYPE);
  writeCalibrationBucketsSummary(CALIBRATION_BUCKETS_SUMMARY_FILE, summary);
  console.log(`[nightly-research] calibration-buckets: marketsResolved=${summary.marketsResolved}, buckets=${summary.buckets.length}`);
}

function stepLessons(): void {
  const artifact = buildLessonsArtifactFromFiles({
    tradesCsvPath: TRADES_DETAILED_CSV,
    blockedSignalsPath: BLOCKED_SIGNALS_JSON,
  });
  writeLessonsArtifact(LESSONS_FILE, artifact);
  console.log(`[nightly-research] lessons: wrote ${artifact.lessons.length} lessons to ${LESSONS_FILE}`);
}

function stepJournalCompaction(): void {
  const result = compactJournalFile(LEARNING_JOURNAL_FILE, JOURNAL_ARCHIVE_DIR);
  if (result.compacted) {
    console.log(`[nightly-research] journal-compaction: archived ${result.archivedBytes} bytes to ${result.archivePath}`);
  } else {
    console.log("[nightly-research] journal-compaction: journal under threshold");
  }
}

function main(): void {
  const failures: string[] = [];
  for (const [name, fn] of [
    ["calibration-buckets", stepCalibrationBuckets],
    ["lessons", stepLessons],
    ["journal-compaction", stepJournalCompaction],
  ] as const) {
    const failure = runStep(name, fn);
    if (failure) failures.push(failure);
  }

  if (failures.length > 0) {
    console.log(`[nightly-research] completed with ${failures.length} failure(s): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("[nightly-research] completed successfully");
}

main();
