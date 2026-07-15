#!/usr/bin/env tsx
import { join } from "node:path";
import { aggregateNoBiasCalibrationBuckets, writeCalibrationBucketsSummary } from "./lib/research/calibration-summary.js";
import { compactJournalFile } from "./lib/research/journal-compaction.js";
import { buildLessonsArtifactFromFiles, writeLessonsArtifact } from "./lib/research/lessons.js";
import { runNightlyLlmStep } from "./lib/research/nightly-llm.js";

/**
 * Nightly research orchestrator (July 2026 infrastructure plan, Phase 4-5).
 *
 * Runs the research work that used to live inline in the hourly trading
 * engine — calibration aggregation, lesson rollups, journal compaction, and
 * (Phase 5) LLM-driven hypothesis generation/review/parameter tuning — as
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

async function runStep(name: string, fn: () => void | Promise<void>): Promise<string | null> {
  try {
    await fn();
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

// Retired-setup blocking is enforced at ingest by the hourly engine
// (RETIRED_LLM_SETUP_IDS in ingestNightlyLlmAdvice), so this orchestrator
// doesn't need to know the retired list itself — it's passed through only
// so the prompt can tell the model not to bother proposing them.
async function stepNightlyLlm(): Promise<void> {
  const result = await runNightlyLlmStep({ dataDir: DATA_DIR, retiredSetupIds: [] });
  if (result.skipped) {
    console.log("[nightly-research] nightly-llm: skipped (no API key configured or NIGHTLY_LLM_DISABLE=1)");
    return;
  }
  if (!result.wrote) {
    throw new Error(result.error ?? "nightly-llm step failed without a specific error");
  }
  console.log("[nightly-research] nightly-llm: wrote data/nightly-llm-advice.json");
}

async function main(): Promise<void> {
  const failures: string[] = [];
  for (const [name, fn] of [
    ["calibration-buckets", stepCalibrationBuckets],
    ["lessons", stepLessons],
    ["journal-compaction", stepJournalCompaction],
    ["nightly-llm", stepNightlyLlm],
  ] as const) {
    const failure = await runStep(name, fn);
    if (failure) failures.push(failure);
  }

  if (failures.length > 0) {
    console.log(`[nightly-research] completed with ${failures.length} failure(s): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("[nightly-research] completed successfully");
}

main().catch((e) => {
  console.error("[nightly-research] Fatal error:", e);
  process.exit(1);
});
