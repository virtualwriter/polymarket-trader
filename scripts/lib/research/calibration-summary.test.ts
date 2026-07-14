import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  aggregateNoBiasCalibrationBuckets,
  readCalibrationBucketsSummary,
  writeCalibrationBucketsSummary,
  type CalibrationBucketsSummary,
} from "./calibration-summary.js";

const SIGNAL_TYPE = "NO_BIAS_GATE";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "calibration-summary-"));
  tempDirs.push(dir);
  return dir;
}

function tempJsonl(lines: string[]): string {
  const file = join(tempDir(), "calibration.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

function tempSummaryFile(): string {
  return join(tempDir(), "calibration-summary.json");
}

describe("aggregateNoBiasCalibrationBuckets", () => {
  it("aggregates resolved gate-passing markets and ignores malformed or incomplete rows", () => {
    const path = tempJsonl([
      JSON.stringify({
        market_id: "m-win",
        timestamp: "2026-01-01T10:00:00.000Z",
        candidate_passed: true,
        pm_best_bid: 0.7,
        asset: "BTC",
      }),
      JSON.stringify({
        market_id: "m-win",
        timestamp: "2026-01-02T10:00:00.000Z",
        resolved_outcome: "NO",
      }),
      JSON.stringify({
        market_id: "m-win",
        timestamp: "2026-01-03T10:00:00.000Z",
        resolved_outcome: "YES",
      }),
      JSON.stringify({
        market_id: "m-loss",
        timestamp: "2026-01-01T11:00:00.000Z",
        candidate_passed: true,
        pm_best_bid: 0.6,
        asset: "ETH",
      }),
      JSON.stringify({
        market_id: "m-loss",
        timestamp: "2026-01-01T12:00:00.000Z",
        candidate_passed: true,
        pm_best_bid: 0.4,
        asset: "GOLD",
      }),
      JSON.stringify({
        market_id: "m-loss",
        timestamp: "2026-01-02T11:00:00.000Z",
        resolved_outcome: "YES",
      }),
      JSON.stringify({
        market_id: "m-no-resolution",
        timestamp: "2026-01-01T12:00:00.000Z",
        candidate_passed: true,
        pm_best_bid: 0.5,
        asset: "SOL",
      }),
      JSON.stringify({
        market_id: "m-no-pass",
        timestamp: "2026-01-02T12:00:00.000Z",
        resolved_outcome: "NO",
      }),
      "{not valid json",
      JSON.stringify({
        timestamp: "2026-01-01T13:00:00.000Z",
        candidate_passed: true,
        pm_best_bid: 0.55,
        asset: "DOGE",
      }),
    ]);

    const summary = aggregateNoBiasCalibrationBuckets(path, SIGNAL_TYPE);

    expect(summary.sourceFile).toBe(path);
    expect(summary.marketsResolved).toBe(2);
    expect(summary.buckets).toEqual([
      {
        signalType: SIGNAL_TYPE,
        n: 2,
        winRate: 0.5,
        label: "NO-bias gate resolved events",
      },
      {
        signalType: SIGNAL_TYPE,
        asset: "BTC",
        n: 1,
        winRate: 1,
        label: "NO-bias gate resolved events / BTC",
      },
      {
        signalType: SIGNAL_TYPE,
        asset: "ETH",
        n: 1,
        winRate: 0,
        label: "NO-bias gate resolved events / ETH",
      },
    ]);
  });

  it("returns empty buckets when the calibration file is missing", () => {
    const missingPath = join(tmpdir(), "missing-calibration-summary.jsonl");
    const summary = aggregateNoBiasCalibrationBuckets(missingPath, SIGNAL_TYPE);

    expect(summary.marketsResolved).toBe(0);
    expect(summary.buckets).toEqual([]);
    expect(summary.sourceFile).toBe(missingPath);
  });
});

describe("writeCalibrationBucketsSummary and readCalibrationBucketsSummary", () => {
  const buckets: CalibrationBucketsSummary["buckets"] = [
    {
      signalType: SIGNAL_TYPE,
      n: 3,
      winRate: 2 / 3,
      label: "NO-bias gate resolved events",
    },
    {
      signalType: SIGNAL_TYPE,
      asset: "BTC",
      n: 2,
      winRate: 0.5,
      label: "NO-bias gate resolved events / BTC",
    },
  ];

  it("round-trips a summary and reports fresh vs stale status from generatedAt", () => {
    const path = tempSummaryFile();
    const now = new Date("2026-07-14T12:00:00.000Z");
    const summary: CalibrationBucketsSummary = {
      generatedAt: now.toISOString(),
      sourceFile: "/tmp/no_bias_candidates.jsonl",
      marketsResolved: 3,
      buckets,
    };

    writeCalibrationBucketsSummary(path, summary);

    const fresh = readCalibrationBucketsSummary(path, { now, maxAgeHours: 48 });
    expect(fresh.status).toBe("fresh");
    expect(fresh.generatedAt).toBe(summary.generatedAt);
    expect(fresh.buckets).toEqual(buckets);

    const staleNow = new Date(now.getTime() + 49 * 3600_000);
    const stale = readCalibrationBucketsSummary(path, { now: staleNow, maxAgeHours: 48 });
    expect(stale.status).toBe("stale");
    expect(stale.generatedAt).toBe(summary.generatedAt);
    expect(stale.buckets).toEqual(buckets);
  });

  it("never throws and isolates missing, invalid, and malformed bucket entries", () => {
    const missingPath = join(tmpdir(), "missing-calibration-summary.json");
    expect(readCalibrationBucketsSummary(missingPath)).toEqual({
      status: "missing",
      generatedAt: null,
      buckets: [],
    });

    const invalidPath = tempSummaryFile();
    writeFileSync(invalidPath, "{not valid json");
    expect(readCalibrationBucketsSummary(invalidPath)).toEqual({
      status: "invalid",
      generatedAt: null,
      buckets: [],
    });

    const filteredPath = tempSummaryFile();
    writeFileSync(filteredPath, JSON.stringify({
      generatedAt: "2026-07-14T12:00:00.000Z",
      buckets: [
        null,
        "garbage",
        { signalType: 1, n: 2, winRate: 0.5 },
        { signalType: SIGNAL_TYPE, n: "bad", winRate: 0.5 },
        { signalType: SIGNAL_TYPE, n: 2, winRate: "bad" },
        buckets[0],
      ],
    }));
    const filtered = readCalibrationBucketsSummary(filteredPath, {
      now: new Date("2026-07-14T12:00:00.000Z"),
    });
    expect(filtered.status).toBe("fresh");
    expect(filtered.buckets).toEqual([buckets[0]]);
  });
});
