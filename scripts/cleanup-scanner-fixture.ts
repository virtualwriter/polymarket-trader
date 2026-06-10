import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scannerOutputs = [
  "data/daily-macro.csv",
  "data/daily-valuations.csv",
  "data/instrument-snapshots.jsonl",
];

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? resolve(process.argv[idx + 1]) : null;
}

function argRawValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function argNumber(name: string, fallback: number): number {
  const raw = argRawValue(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileHash(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tailNonemptyLines(path: string, maxLines: number): string {
  if (!existsSync(path)) return "";
  const size = statSync(path).size;
  if (size === 0) return "";
  const fd = openSync(path, "r");
  try {
    const chunkSize = 1024 * 1024;
    let offset = size;
    let suffix = "";
    while (offset > 0) {
      const bytesToRead = Math.min(chunkSize, offset);
      offset -= bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      readSync(fd, buffer, 0, bytesToRead, offset);
      suffix = buffer.toString("utf8") + suffix;
      const lines = suffix.split("\n").filter((line) => line.trim());
      if (lines.length >= maxLines || offset === 0) {
        return lines.slice(-maxLines).join("\n") + "\n";
      }
    }
  } finally {
    closeSync(fd);
  }
  return "";
}

function copyFixtureOutput(src: string, dest: string, snapshotLines: number) {
  if (!existsSync(src)) return;
  mkdirSync(dirname(dest), { recursive: true });
  if (src.endsWith("instrument-snapshots.jsonl")) {
    writeFileSync(dest, tailNonemptyLines(src, snapshotLines));
  } else {
    copyFileSync(src, dest);
  }
}

function recordFixture(dir: string, snapshotLines: number) {
  for (const rel of scannerOutputs) {
    copyFixtureOutput(join(repoRoot, rel), join(dir, rel), snapshotLines);
  }
}

function csvSummary(path: string) {
  if (!existsSync(path)) return { exists: false };
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim());
  const header = lines[0] ?? "";
  const lastRow = lines[lines.length - 1] ?? "";
  return {
    exists: true,
    rows: Math.max(0, lines.length - 1),
    headerHash: sha256(header),
    lastRowHash: sha256(lastRow),
    columns: header ? header.split(",").length : 0,
  };
}

function instrumentSnapshotSummary(path: string) {
  if (!existsSync(path)) return { exists: false };
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim());
  const latest = readJson<any>(path, null) ?? (lines.length ? JSON.parse(lines[lines.length - 1]) : null);
  return {
    exists: true,
    lines: lines.length,
    fileHash: fileHash(path),
    latestTimestamp: latest?.timestamp ?? null,
    latestTopLevelKeys: latest && typeof latest === "object" ? Object.keys(latest).sort() : [],
  };
}

function compareValues(before: any, after: any, path = "$"): string[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [`${path}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`];
  }
  if (before && after && typeof before === "object" && typeof after === "object") {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => compareValues(before[key], after[key], `${path}.${key}`));
  }
  return [`${path}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`];
}

function comparable(value: any): any {
  if (!value || typeof value !== "object") return value;
  const { repoHead: _repoHead, comparison: _comparison, fixture: _fixture, ...rest } = value;
  return rest;
}

const fixtureDir = argValue("--fixture");
const recordFixtureDir = argValue("--record-fixture");
const comparePath = argValue("--compare");
const outPath = argValue("--out");
const snapshotLines = argNumber("--snapshot-lines", 24);
if (recordFixtureDir) recordFixture(recordFixtureDir, snapshotLines);

const sourceRoot = fixtureDir ?? recordFixtureDir ?? repoRoot;
const summary = {
  command: "cleanup-scanner-fixture",
  repoHead: (() => {
    try {
      return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })(),
  outputs: {
    dailyMacro: csvSummary(join(sourceRoot, "data/daily-macro.csv")),
    dailyValuations: csvSummary(join(sourceRoot, "data/daily-valuations.csv")),
    instrumentSnapshots: instrumentSnapshotSummary(join(sourceRoot, "data/instrument-snapshots.jsonl")),
  },
};

const comparison = comparePath
  ? (() => {
      const baseline = readJson<any>(comparePath, null);
      if (!baseline) return { baseline: comparePath, status: "missing_baseline", differences: [`baseline not found or invalid: ${comparePath}`] };
      const differences = compareValues(comparable(baseline), comparable(summary));
      return { baseline: comparePath, status: differences.length === 0 ? "match" : "drift", differences };
    })()
  : undefined;

const result = {
  ...summary,
  comparison,
  fixture: fixtureDir || recordFixtureDir
    ? {
        replayedFrom: fixtureDir,
        recordedTo: recordFixtureDir,
        files: scannerOutputs,
        snapshotLines,
      }
    : undefined,
};

const output = JSON.stringify(result, null, 2) + "\n";
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, output);
}
process.stdout.write(output);
process.exit(comparison && comparison.status !== "match" ? 2 : 0);
