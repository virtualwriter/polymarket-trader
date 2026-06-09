import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(repoRoot, "data");
const relativeValueCsv = join(repoRoot, "relative-value", "cross_venue_relative_value.csv");
const dryRunArtifacts = [
  join(dataDir, "candidate-actions.json"),
  join(dataDir, "engine-state.json"),
  join(dataDir, "execution-plan.json"),
  join(dataDir, "dry-run-verification.json"),
  join(dataDir, "llm-advice.json"),
  join(dataDir, "llm-truth-state.json"),
];

type Backup = { path: string; existed: boolean; content?: string };

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function fileHash(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function countCsvRows(path: string): number {
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "");
  return Math.max(0, lines.length - 1);
}

function countBy<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function backupArtifacts(): Backup[] {
  return dryRunArtifacts.map((path) => ({
    path,
    existed: existsSync(path),
    content: existsSync(path) ? readFileSync(path, "utf8") : undefined,
  }));
}

function restoreArtifacts(backups: Backup[]) {
  for (const backup of backups) {
    if (backup.existed) {
      writeFileSync(backup.path, backup.content ?? "");
    } else if (existsSync(backup.path)) {
      unlinkSync(backup.path);
    }
  }
}

function parseNumber(pattern: RegExp, text: string): number | null {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

function outputPath(): string | null {
  const idx = process.argv.indexOf("--out");
  return idx >= 0 && process.argv[idx + 1] ? resolve(process.argv[idx + 1]) : null;
}

function comparePath(): string | null {
  const idx = process.argv.indexOf("--compare");
  return idx >= 0 && process.argv[idx + 1] ? resolve(process.argv[idx + 1]) : null;
}

function comparable(value: any): any {
  if (!value || typeof value !== "object") return value;
  const { repoHead: _repoHead, comparison: _comparison, gitStatus: _gitStatus, ...rest } = value;
  return rest;
}

function diffValues(before: any, after: any, path = "$"): string[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [`${path}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`];
  }
  if (
    before && after &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => diffValues(before[key], after[key], `${path}.${key}`));
  }
  return [`${path}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`];
}

function gitStatusLines(): string[] {
  try {
    return execFileSync("git", ["status", "--porcelain=v1"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).split("\n").filter(Boolean).sort();
  } catch {
    return [];
  }
}

function statusPath(line: string): string {
  return line.slice(2).trimStart().replace(/^"|"$/g, "");
}

function pathSet(lines: string[]): Set<string> {
  return new Set(lines.map(statusPath));
}

const backups = backupArtifacts();
const gitStatusBefore = gitStatusLines();
let stdout = "";
let stderr = "";
let exitCode = 0;

try {
  stdout = execFileSync("npx", ["tsx", "scripts/trading-engine.ts", "--dry-run", "--no-llm"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (err: any) {
  stdout = String(err?.stdout ?? "");
  stderr = String(err?.stderr ?? err?.message ?? err);
  exitCode = Number(err?.status ?? 1);
}

const candidateActions = readJson<any>(join(dataDir, "candidate-actions.json"), {});
const engineState = readJson<any>(join(dataDir, "engine-state.json"), {});
const executionPlan = readJson<any>(join(dataDir, "execution-plan.json"), {});
const dryRunVerification = readJson<any>(join(dataDir, "dry-run-verification.json"), {});
const truthState = readJson<any>(join(dataDir, "llm-truth-state.json"), {});
const blockedSignals = readJson<any[]>(join(dataDir, "blocked-signals.json"), []);
const portfolio = readJson<any>(join(dataDir, "portfolio.json"), {});
const openPositions: any[] = Array.isArray(portfolio.positions) ? portfolio.positions : [];
const entryCandidates: any[] = Array.isArray(candidateActions.entryCandidates) ? candidateActions.entryCandidates : [];
const mechanicalExits: any[] = Array.isArray(candidateActions.mechanicalExits) ? candidateActions.mechanicalExits : [];
const signalKillExits: any[] = Array.isArray(candidateActions.signalKillExits) ? candidateActions.signalKillExits : [];
const llmCloseEligibility: any[] = Array.isArray(candidateActions.llmCloseEligibility) ? candidateActions.llmCloseEligibility : [];
const executionEntrySignals: any[] = Array.isArray(executionPlan.entrySignals) ? executionPlan.entrySignals : [];
const executionMechanicalExits: any[] = Array.isArray(executionPlan.mechanicalExits) ? executionPlan.mechanicalExits : [];
const executionSignalKillExits: any[] = Array.isArray(executionPlan.signalKillExits) ? executionPlan.signalKillExits : [];
const executionLlmCloses: any[] = Array.isArray(executionPlan.llmCloses) ? executionPlan.llmCloses : [];
const truthSetupFamilies: any[] = Array.isArray(truthState.setupFamilies) ? truthState.setupFamilies : [];
const closedTradeRows = countCsvRows(join(dataDir, "trades-detailed.csv"));

const summary = {
  command: "npx tsx scripts/trading-engine.ts --dry-run --no-llm",
  exitCode,
  repoHead: (() => {
    try {
      return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })(),
  stdout: {
    signalsGenerated: parseNumber(/Signals generated: (\d+)/, stdout),
    summaryOpenPositions: parseNumber(/Open positions:\s+(\d+)/, stdout),
    activeSignals: parseNumber(/Active signals:\s+(\d+)\//, stdout),
    closedPositions: parseNumber(/Closed (\d+) positions:/, stdout) ?? 0,
    resolvedShadows: parseNumber(/Resolved (\d+) blocked-signal shadows:/, stdout) ?? 0,
  },
  files: {
    portfolioHash: fileHash(join(dataDir, "portfolio.json")),
    blockedSignalsHash: fileHash(join(dataDir, "blocked-signals.json")),
    heatmapRows: countCsvRows(relativeValueCsv),
    closedTradeRows,
  },
  portfolio: {
    cash: typeof portfolio.cash === "number" ? Number(portfolio.cash.toFixed(4)) : null,
    openPositions: openPositions.length,
    realizedPnl: typeof portfolio.totalRealizedPnl === "number" ? Number(portfolio.totalRealizedPnl.toFixed(4)) : null,
    totalTrades: portfolio.totalTrades ?? null,
    openBySignal: countBy(openPositions, (row) => String(row.signalType ?? "unknown")),
  },
  candidateActions: {
    entryCandidates: entryCandidates.length,
    entryByType: countBy(entryCandidates, (row) => String(row.type ?? "unknown")),
    entryByAsset: countBy(entryCandidates, (row) => String(row.asset ?? "unknown")),
    mechanicalExits: mechanicalExits.length,
    signalKillExits: signalKillExits.length,
    llmCloseEligibility: llmCloseEligibility.length,
    llmCloseAllowed: llmCloseEligibility.filter((row) => row.allowed === true).length,
  },
  engineState: {
    valuationRows: engineState.dataFreshness?.valuationRows ?? null,
    macroRows: engineState.dataFreshness?.macroRows ?? null,
    instrumentSnapshots: engineState.dataFreshness?.instrumentSnapshots ?? null,
    openPositions: engineState.portfolio?.openPositions ?? null,
    signalFamilies: Array.isArray(engineState.signalFamilies) ? engineState.signalFamilies.length : null,
  },
  executionPlan: {
    dryRun: executionPlan.dryRun ?? null,
    llmDryRun: executionPlan.llmDryRun ?? null,
    entrySignals: executionEntrySignals.length,
    entrySignalsByType: countBy(executionEntrySignals, (row) => String(row.type ?? "unknown")),
    mechanicalExits: executionMechanicalExits.length,
    signalKillExits: executionSignalKillExits.length,
    llmCloses: executionLlmCloses.length,
  },
  truthState: {
    setupFamilies: truthSetupFamilies.length,
    setupFamiliesByStatus: countBy(truthSetupFamilies, (row) => String(row.status ?? "unknown")),
    contaminationRules: Array.isArray(truthState.contaminationRules) ? truthState.contaminationRules.length : null,
  },
  dryRunVerification: {
    mutationDisabled: dryRunVerification.mutationDisabled ?? null,
    shadowArchitecture: dryRunVerification.shadowArchitecture ?? null,
    checks: dryRunVerification.checks ?? null,
  },
  blockedSignals: {
    total: blockedSignals.length,
    byStatus: countBy(blockedSignals, (row) => String(row.status ?? "unknown")),
    openByReason: countBy(blockedSignals.filter((row) => row.status === "open"), (row) => String(row.blockedReason ?? "unknown")),
  },
  stderr: stderr.trim() || undefined,
};

restoreArtifacts(backups);
const gitStatusAfter = gitStatusLines();
const beforePaths = pathSet(gitStatusBefore);
const afterPaths = pathSet(gitStatusAfter);
const newDirtyPaths = [...afterPaths].filter((path) => !beforePaths.has(path)).sort();
const clearedDirtyPaths = [...beforePaths].filter((path) => !afterPaths.has(path)).sort();
const changedStatusLines = gitStatusAfter.filter((line) => !gitStatusBefore.includes(line)).sort();
const restoredStatusLines = gitStatusBefore.filter((line) => !gitStatusAfter.includes(line)).sort();

const baselinePath = comparePath();
const comparison = baselinePath
  ? (() => {
      const baseline = readJson<any>(baselinePath, null);
      if (!baseline) {
        return {
          baseline: baselinePath,
          status: "missing_baseline",
          differences: [`baseline not found or invalid: ${baselinePath}`],
        };
      }
      const differences = diffValues(comparable(baseline), comparable(summary));
      return {
        baseline: baselinePath,
        status: differences.length === 0 ? "match" : "drift",
        differences,
      };
    })()
  : undefined;

const result = comparison ? { ...summary, comparison } : summary;
const resultWithStatus = {
  ...result,
  gitStatus: {
    dirtyBefore: gitStatusBefore.length,
    dirtyAfter: gitStatusAfter.length,
    newDirtyPaths,
    clearedDirtyPaths,
    changedStatusLines,
    restoredStatusLines,
  },
};

const out = JSON.stringify(resultWithStatus, null, 2) + "\n";
const outPath = outputPath();
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, out);
}
process.stdout.write(out);
process.exit(exitCode || (comparison && comparison.status !== "match" ? 2 : 0) || (newDirtyPaths.length ? 3 : 0));
