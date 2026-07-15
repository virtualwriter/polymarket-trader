/**
 * Deterministic replay harness for the paper-trading engine.
 *
 * Re-runs scripts/trading-engine.ts hour-by-hour over ARCHIVED instrument
 * snapshots inside an isolated sandbox, producing a replay trade ledger that can
 * be compared to production or used to test strategy variants.
 *
 * Isolation model (verified from source):
 *   - trading-engine.ts derives DATA_DIR from resolveEnginePathConfig({ scriptDir:
 *     import.meta.dirname }) => join(scriptDir, "..", "data"). dataDir is NOT
 *     env-redirectable. The only lever is WHERE the engine file lives. So we copy
 *     the entire scripts/ tree into <sandbox>/scripts and give it a sibling
 *     <sandbox>/data. The engine then reads/writes ONLY inside the sandbox.
 *   - liveStateDir IS redirectable (POLYMARKET_TRADER_STATE_DIR); we also point it
 *     at <sandbox>/.runtime (it would default there anyway via scriptDir/..).
 *
 * Network / LLM neutralization:
 *   - --no-llm => NO_LLM=true => callLLM() is never invoked => zero token spend.
 *     (--no-llm does NOT set MUTATION_DISABLED, so trades ARE written.)
 *   - replay-preload.mjs replaces globalThis.fetch with an empty-JSON stub, so any
 *     Polymarket Gamma/CLOB book fetch degrades to null gracefully. Fully offline.
 *
 * Clock injection:
 *   - replay-preload.mjs freezes the global Date to REPLAY_NOW_MS (approach (c),
 *     no engine edits). This covers all new Date()/Date.now() sites including the
 *     America/New_York weekend-window gate isStockPerpFundingWindowOpen().
 *
 * Usage:
 *   npx tsx scripts/replay-harness.ts --start 2026-07-10 --end 2026-07-14 \
 *       --sandbox /tmp/replay-1 [--signals WEEKEND_HL_FUNDING_REVERSION_LONG] \
 *       [--lookback 12] [--keep-going] [--rebuild-store] [--limit-hours N]
 *
 * SAFETY: reads production data read-only; writes only inside <sandbox>. Never
 * touches data/, /var/lib/polymarket-trader, systemd services, or git.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = join(HARNESS_DIR, "..");
const RV_HISTORY_DIR = "/var/lib/polymarket-trader/relative-value-history";

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const START = String(args.start ?? "");
const END = String(args.end ?? "");
const SANDBOX = String(args.sandbox ?? "");
const LOOKBACK = Number(args.lookback ?? 12);
const KEEP_GOING = Boolean(args["keep-going"]);
const REBUILD_STORE = Boolean(args["rebuild-store"]);
const LIMIT_HOURS = args["limit-hours"] ? Number(args["limit-hours"]) : Infinity;
const SIGNALS_FILTER = args.signals
  ? String(args.signals).split(",").map((s) => s.trim()).filter(Boolean)
  : [];

if (!START || !END || !SANDBOX) {
  console.error("usage: replay-harness --start YYYY-MM-DD --end YYYY-MM-DD --sandbox PATH [--signals A,B] [--lookback 12] [--keep-going] [--rebuild-store] [--limit-hours N]");
  process.exit(2);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(msg);
}

function hourKeyToMs(hourKey: string): number {
  // hourKey "YYYY-MM-DDTHH" (UTC)
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(hourKey);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], 0, 0, 0);
}

function firstCsvField(line: string): string {
  let v = line.split(",", 1)[0] ?? "";
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

// ── snapshot store ───────────────────────────────────────────────────────────
function buildSnapshotStore(): { index: Record<string, string>; storeDir: string } {
  const storeDir = join(SANDBOX, "snapshot-store");
  log(`[setup] building snapshot store at ${storeDir} (this is the one-time heavy step)...`);
  const helper = join(HARNESS_DIR, "replay-snapshot-store.py");
  const cmd = ["python3", helper, "--repo", REPO, "--store", storeDir];
  if (REBUILD_STORE) cmd.push("--rebuild");
  execFileSync(cmd[0], cmd.slice(1), { stdio: ["ignore", "inherit", "inherit"] });
  const index = JSON.parse(readFileSync(join(storeDir, "index.json"), "utf-8")) as Record<string, string>;
  return { index, storeDir };
}

// ── relative-value history index ─────────────────────────────────────────────
function buildRvHistoryIndex(): { hourKey: string; path: string }[] {
  const out: { hourKey: string; path: string }[] = [];
  if (!existsSync(RV_HISTORY_DIR)) return out;
  for (const day of readdirSync(RV_HISTORY_DIR)) {
    const dayDir = join(RV_HISTORY_DIR, day);
    let files: string[];
    try {
      files = readdirSync(dayDir);
    } catch {
      continue;
    }
    for (const f of files) {
      // filename: YYYY-MM-DDTHHMMSSZ-cross_venue_relative_value.csv
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})\d{4}Z-/.exec(f);
      if (!m) continue;
      out.push({ hourKey: `${m[1]}T${m[2]}`, path: join(dayDir, f) });
    }
  }
  out.sort((a, b) => (a.hourKey < b.hourKey ? -1 : a.hourKey > b.hourKey ? 1 : 0));
  return out;
}

function closestRvFile(rvIndex: { hourKey: string; path: string }[], hourKey: string): string | null {
  let best: string | null = null;
  for (const e of rvIndex) {
    if (e.hourKey <= hourKey) best = e.path;
    else break;
  }
  return best;
}

// ── sandbox setup ────────────────────────────────────────────────────────────
const STATIC_CONFIG_FILES = [
  "learning-params.json",
  "signal-weights.json",
  "hypotheses.json",
  "lessons.json",
  "confidence-calibration.json",
  "calibration-buckets-summary.json",
  "nightly-llm-advice.json",
  "nightly-llm-advice-ingested.json",
  "shadow-measurement-artifacts.json",
  "operationally-tainted-trades.json",
  "llm-truth-state.json",
];

function setupSandbox(): { rvHeader: string } {
  log(`[setup] preparing sandbox ${SANDBOX}`);
  // Fresh sandbox (but keep snapshot-store cache if present).
  if (existsSync(SANDBOX)) {
    for (const entry of readdirSync(SANDBOX)) {
      if (entry === "snapshot-store") continue;
      rmSync(join(SANDBOX, entry), { recursive: true, force: true });
    }
  } else {
    mkdirSync(SANDBOX, { recursive: true });
  }

  // Copy the engine code tree (real copies so import.meta.dirname resolves into
  // the sandbox and DATA_DIR becomes <sandbox>/data).
  execFileSync("cp", ["-a", join(REPO, "scripts"), join(SANDBOX, "scripts")]);
  for (const f of ["package.json", "tsconfig.json"]) {
    if (existsSync(join(REPO, f))) execFileSync("cp", ["-a", join(REPO, f), join(SANDBOX, f)]);
  }
  if (existsSync(join(REPO, "docs"))) execFileSync("cp", ["-a", join(REPO, "docs"), join(SANDBOX, "docs")]);

  // node_modules: symlink to production install (read-only usage).
  const nm = join(SANDBOX, "node_modules");
  if (!existsSync(nm)) symlinkSync(join(REPO, "node_modules"), nm, "dir");

  mkdirSync(join(SANDBOX, "data"), { recursive: true });
  mkdirSync(join(SANDBOX, ".runtime"), { recursive: true });
  mkdirSync(join(SANDBOX, "relative-value"), { recursive: true });

  // Static configs (copied as an as-of-now snapshot; config drift over the
  // window is not reconstructed — documented as a limitation).
  for (const f of STATIC_CONFIG_FILES) {
    const src = join(REPO, "data", f);
    if (existsSync(src)) execFileSync("cp", ["-a", src, join(SANDBOX, "data", f)]);
  }

  // Fresh, empty state for a clean replay.
  writeFileSync(
    join(SANDBOX, "data", "portfolio.json"),
    JSON.stringify(
      { cash: 100, positions: [], totalRealizedPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, lastUpdated: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(SANDBOX, "data", "blocked-signals.json"), "[]\n");
  writeFileSync(
    join(SANDBOX, "data", "processed-closed-trades.json"),
    JSON.stringify({ processedIds: [], updatedAt: new Date().toISOString() }, null, 2) + "\n",
  );

  // RV header (for hours with no history file).
  let rvHeader = "";
  const rvCur = join(REPO, "relative-value", "cross_venue_relative_value.csv");
  if (existsSync(rvCur)) rvHeader = readFileSync(rvCur, "utf-8").split("\n")[0] ?? "";
  return { rvHeader };
}

// ── per-hour input construction ──────────────────────────────────────────────
function writeSnapshotWindow(storeDir: string, index: Record<string, string>, hours: string[], T: string) {
  const eligible = hours.filter((h) => h <= T);
  const window = eligible.slice(-LOOKBACK);
  const parts: string[] = [];
  for (const h of window) {
    parts.push(readFileSync(join(storeDir, index[h]), "utf-8").trim());
  }
  writeFileSync(join(SANDBOX, "data", "instrument-snapshots.jsonl"), parts.join("\n") + "\n");
}

function truncateCsv(name: string, rows: string[], header: string, T: string) {
  const kept = rows.filter((line) => firstCsvField(line) <= T);
  writeFileSync(join(SANDBOX, "data", name), header + "\n" + kept.join("\n") + "\n");
}

// ── engine invocation ────────────────────────────────────────────────────────
function runEngineHour(T: string): { ok: boolean; ms: number; log: string } {
  const ms = hourKeyToMs(T);
  const preloadUrl = pathToFileURL(join(SANDBOX, "scripts", "replay-preload.mjs")).href;
  const engine = join(SANDBOX, "scripts", "trading-engine.ts");
  const started = Date.now();
  const res = spawnSync(
    "node",
    ["--import", "tsx", "--import", preloadUrl, engine, "--no-llm"],
    {
      cwd: SANDBOX,
      env: {
        ...process.env,
        REPLAY_NOW_MS: String(ms),
        POLYMARKET_TRADER_STATE_DIR: join(SANDBOX, ".runtime"),
        // Ensure no accidental live-order envs; make LLM keys absent.
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      },
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const elapsed = Date.now() - started;
  const output = (res.stdout ?? "") + (res.stderr ?? "");
  return { ok: res.status === 0, ms: elapsed, log: output };
}

// ── ledger / report ──────────────────────────────────────────────────────────
interface LedgerRow {
  signal_type: string;
  asset: string;
  opened_at: string;
  closed_at: string;
  pnl: number;
  close_reason: string;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readLedger(): LedgerRow[] {
  const file = join(SANDBOX, "data", "trades-detailed.csv");
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf-8").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const idx = (name: string) => headers.indexOf(name);
  return lines.slice(1).map((line) => {
    const v = parseCsvLine(line);
    return {
      signal_type: v[idx("signal_type")] ?? "",
      asset: v[idx("asset")] ?? "",
      opened_at: v[idx("opened_at")] ?? "",
      closed_at: v[idx("closed_at")] ?? "",
      pnl: Number(v[idx("pnl")] ?? 0),
      close_reason: v[idx("close_reason")] ?? "",
    };
  });
}

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m: Record<string, T[]> = {};
  for (const r of rows) (m[key(r)] ??= []).push(r);
  return m;
}

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const t0 = Date.now();
  const { index, storeDir } = buildSnapshotStore();
  const { rvHeader } = setupSandbox();
  // Deploy preload into sandbox scripts dir (it is copied with scripts/ already
  // if present in the repo; ensure a copy exists next to the engine).
  const preloadSrc = join(REPO, "scripts", "replay-preload.mjs");
  if (existsSync(preloadSrc)) execFileSync("cp", ["-a", preloadSrc, join(SANDBOX, "scripts", "replay-preload.mjs")]);
  const rvIndex = buildRvHistoryIndex();

  const allHours = Object.keys(index).sort();
  const startKey = `${START}T00`;
  const endKey = `${END}T23`;
  let replayHours = allHours.filter((h) => h >= startKey && h <= endKey);
  if (Number.isFinite(LIMIT_HOURS)) replayHours = replayHours.slice(0, LIMIT_HOURS);

  log(`[replay] window ${startKey}..${endKey}: ${replayHours.length} snapshot hours to replay`);
  if (replayHours.length === 0) {
    console.error("[replay] no snapshot hours in window; aborting");
    process.exit(1);
  }

  // Pre-load daily CSVs once.
  const valAll = readFileSync(join(REPO, "data", "daily-valuations.csv"), "utf-8").split("\n").filter((l) => l.trim() !== "");
  const macroAll = readFileSync(join(REPO, "data", "daily-macro.csv"), "utf-8").split("\n").filter((l) => l.trim() !== "");
  const valHeader = valAll[0];
  const macroHeader = macroAll[0];
  const valRows = valAll.slice(1);
  const macroRows = macroAll.slice(1);

  const perHourMs: number[] = [];
  let failed = 0;
  const hourLogsDir = join(SANDBOX, "hour-logs");
  mkdirSync(hourLogsDir, { recursive: true });

  for (let i = 0; i < replayHours.length; i++) {
    const T = replayHours[i];
    writeSnapshotWindow(storeDir, index, allHours, T);
    truncateCsv("daily-valuations.csv", valRows, valHeader, T);
    truncateCsv("daily-macro.csv", macroRows, macroHeader, T);
    const rvFile = closestRvFile(rvIndex, T);
    if (rvFile) execFileSync("cp", ["-a", rvFile, join(SANDBOX, "relative-value", "cross_venue_relative_value.csv")]);
    else writeFileSync(join(SANDBOX, "relative-value", "cross_venue_relative_value.csv"), rvHeader + "\n");

    const r = runEngineHour(T);
    perHourMs.push(r.ms);
    writeFileSync(join(hourLogsDir, `${T}.log`), r.log);
    const openedMatch = /Opened (\d+) weekend HL stock funding LIVE trades/.exec(r.log);
    const openedWk = openedMatch ? openedMatch[1] : "0";
    const status = r.ok ? "ok" : "FAIL";
    log(`  [${i + 1}/${replayHours.length}] ${T}  ${(r.ms / 1000).toFixed(1)}s  ${status}  weekend-funding-opened=${openedWk}`);
    if (!r.ok) {
      failed++;
      log(`    engine exited non-zero; tail:\n${r.log.split("\n").slice(-8).map((l) => "      " + l).join("\n")}`);
      if (!KEEP_GOING) {
        console.error("[replay] aborting (use --keep-going to continue past failures)");
        break;
      }
    }
  }

  // Build report.
  const ledger = readLedger();
  const closedBySignal = groupBy(ledger, (r) => r.signal_type);
  const tradesClosedBySignal: Record<string, { count: number; pnl: number }> = {};
  for (const [sig, rows] of Object.entries(closedBySignal)) {
    tradesClosedBySignal[sig] = { count: rows.length, pnl: Number(rows.reduce((s, r) => s + r.pnl, 0).toFixed(6)) };
  }
  const finalPortfolio = JSON.parse(readFileSync(join(SANDBOX, "data", "portfolio.json"), "utf-8"));
  const openBySignal: Record<string, number> = {};
  for (const p of finalPortfolio.positions ?? []) openBySignal[p.signalType] = (openBySignal[p.signalType] ?? 0) + 1;

  const avgMs = perHourMs.reduce((a, b) => a + b, 0) / (perHourMs.length || 1);
  const perHourSec = Number((avgMs / 1000).toFixed(2));
  const fullWindowEstimateMin = Number(((perHourSec * 24 * 45) / 60).toFixed(1));

  const report = {
    window: { start: START, end: END, startKey, endKey },
    hoursReplayed: replayHours.length,
    hoursFailed: failed,
    config: {
      lookback: LOOKBACK,
      signalsFilter: SIGNALS_FILTER,
      sandbox: SANDBOX,
      offline: true,
      llm: "disabled (--no-llm)",
      clock: "frozen via REPLAY_NOW_MS (replay-preload.mjs)",
      freshPortfolioCash: 100,
    },
    tradesClosedBySignal,
    openPositionsAtEndBySignal: openBySignal,
    totals: {
      closedTrades: ledger.length,
      totalPnl: Number(ledger.reduce((s, r) => s + r.pnl, 0).toFixed(6)),
      openAtEnd: (finalPortfolio.positions ?? []).length,
    },
    perHourWallTimeSec: perHourSec,
    fullWindowEstimateMin,
    totalReplayWallSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };

  const reportPath = join(SANDBOX, "replay-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  log(`\n[replay] done. report: ${reportPath}`);
  log(JSON.stringify(report, null, 2));
}

main();
