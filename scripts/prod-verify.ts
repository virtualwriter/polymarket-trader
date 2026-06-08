import { accessSync, constants, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(repoRoot, "config.env") });
config({ path: join(repoRoot, ".env") });

type Check = {
  name: string;
  ok: boolean;
  detail: string;
  required?: boolean;
};

const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string, required = true) {
  checks.push({ name, ok, detail, required });
}

function readable(path: string): boolean {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function writable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function fileExists(relPath: string) {
  const path = join(repoRoot, relPath);
  add(relPath, existsSync(path), path);
}

function commandOutput(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch (err) {
    return `unavailable (${err instanceof Error ? err.message : String(err)})`;
  }
}

const stateDir = process.env.POLYMARKET_TRADER_STATE_DIR
  ? resolve(process.env.POLYMARKET_TRADER_STATE_DIR)
  : join(repoRoot, ".runtime");

for (const relPath of [
  "scripts/run-polymarket-trader.sh",
  "scripts/trading-engine.ts",
  "scripts/market-scanner.ts",
  "scripts/position-exit-scanner.ts",
  "scripts/daily_trader_email_report.py",
  "scripts/cross_venue_relative_value_report.py",
  "docs/runtime-state.md",
  "docs/new-machine-live-handoff.md",
]) {
  fileExists(relPath);
}

add(
  "ANTHROPIC_API_KEY",
  Boolean(process.env.ANTHROPIC_API_KEY),
  process.env.ANTHROPIC_API_KEY ? "present" : "missing",
  false,
);
add("state dir exists", existsSync(stateDir), stateDir);
add("state dir readable", readable(stateDir), stateDir, false);
add("state dir writable", writable(stateDir), stateDir, false);

const localWrapper = "/usr/local/bin/run-polymarket-trader";
add(
  "VPS wrapper path",
  existsSync(localWrapper),
  `${localWrapper} ${existsSync(localWrapper) ? "exists" : "missing on this host"}`,
  false,
);

const hlAccount = process.env.HYPERLIQUID_ACCOUNT_ADDRESS;
const hlHasKey = Boolean(process.env.HYPERLIQUID_PRIVATE_KEY || process.env.HYPERLIQUID_MNEMONIC);
add("Hyperliquid account env", Boolean(hlAccount), hlAccount ? "present" : "missing", false);
add("Hyperliquid signing env", hlHasKey, hlHasKey ? "present" : "missing", false);
fileExists("hyperliquid-crv-rebalancer/test_hl_agent_setup.py");

const stateMount = existsSync(stateDir) ? stateDir : repoRoot;
const df = commandOutput("df", ["-h", stateMount]);
const gitRev = commandOutput("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"]);
const nodeVersion = commandOutput("node", ["--version"]);
const npmVersion = commandOutput("npm", ["--version"]);

console.log("Production verification (read-only)");
console.log(`repo=${repoRoot}`);
console.log(`git=${gitRev}`);
console.log(`node=${nodeVersion} npm=${npmVersion}`);
console.log(`stateDir=${stateDir}`);
console.log("");

for (const check of checks) {
  const prefix = check.ok ? "OK " : check.required ? "FAIL" : "WARN";
  console.log(`${prefix} ${check.name}: ${check.detail}`);
}

console.log("");
console.log("Disk usage:");
console.log(df);

const failed = checks.filter((check) => check.required && !check.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} required check(s) failed.`);
  process.exit(1);
}

const stateStat = existsSync(stateDir) ? statSync(stateDir) : null;
if (stateStat && !stateStat.isDirectory()) {
  console.error(`\nState path exists but is not a directory: ${stateDir}`);
  process.exit(1);
}
