/**
 * Live P&L monitor for the sports MM bot.
 *
 * Queries on-chain balances (USDC + conditional tokens) and the live
 * server's fair value to compute real-time P&L.
 *
 * Usage:
 *   npx tsx scripts/pnl.ts              # one-shot snapshot
 *   npx tsx scripts/pnl.ts --watch      # refresh every 10s
 *   npx tsx scripts/pnl.ts --watch 5    # refresh every 5s
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../config.env") });

const RPC_URL = process.env.RPC_URL ?? "https://polygon-rpc.com";
const WALLET = process.env.PRIVATE_KEY
  ? new ethers.Wallet(process.env.PRIVATE_KEY).address
  : "0xAf8dd60D4911709A9c77a8cFC8C86E1A7D0Aea07";

const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const SERVER_URL = "http://localhost:8081";

const STARTING_BANKROLL = 168; // USDC at session start

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const usdc = new ethers.Contract(USDC_ADDRESS, [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
], provider);
const ctf = new ethers.Contract(CTF_ADDRESS, [
  "function balanceOf(address, uint256) view returns (uint256)",
], provider);

interface GameConfig {
  id: string;
  teamA: string;
  teamB: string;
  clobTokenIds: string;
}

const gamesPath = resolve(__dirname, "games.json");
const gamesJson = JSON.parse(readFileSync(gamesPath, "utf-8"));
const games: GameConfig[] = gamesJson.games;

async function getServerState(): Promise<Record<string, { fairValue: number; phase: string }>> {
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    if (!res.ok) return {};
    const data = await res.json() as any;
    return data.marketState ?? {};
  } catch {
    return {};
  }
}

async function snapshot() {
  const [usdcBal, serverState] = await Promise.all([
    usdc.balanceOf(WALLET),
    getServerState(),
  ]);

  const usdcAmount = parseFloat(ethers.utils.formatUnits(usdcBal, 6));

  let totalTokenValue = 0;
  const positions: Array<{
    game: string;
    yesTokens: number;
    noTokens: number;
    fv: number;
    yesValue: number;
    noValue: number;
    phase: string;
  }> = [];

  for (const game of games) {
    const tokenIds = JSON.parse(game.clobTokenIds) as string[];
    const [yesBal, noBal] = await Promise.all([
      ctf.balanceOf(WALLET, tokenIds[0]),
      ctf.balanceOf(WALLET, tokenIds[1]),
    ]);

    const yesTokens = parseFloat(ethers.utils.formatUnits(yesBal, 6));
    const noTokens = parseFloat(ethers.utils.formatUnits(noBal, 6));

    if (yesTokens < 0.01 && noTokens < 0.01) continue;

    const state = serverState[game.id];
    const fv = state?.fairValue ?? 0.5;
    const phase = state?.phase ?? "unknown";

    const yesValue = yesTokens * fv;
    const noValue = noTokens * (1 - fv);
    totalTokenValue += yesValue + noValue;

    positions.push({ game: game.id, yesTokens, noTokens, fv, yesValue, noValue, phase });
  }

  const totalPortfolio = usdcAmount + totalTokenValue;
  const pnl = totalPortfolio - STARTING_BANKROLL;
  const pnlPct = (pnl / STARTING_BANKROLL) * 100;

  return { usdcAmount, totalTokenValue, totalPortfolio, pnl, pnlPct, positions };
}

function formatUsd(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}

async function printSnapshot() {
  const s = await snapshot();
  const now = new Date().toLocaleTimeString();

  console.clear();
  console.log(`\n  ╔═══════════════════════════════════════════════════╗`);
  console.log(`  ║          SPORTS MM — LIVE P&L MONITOR             ║`);
  console.log(`  ╠═══════════════════════════════════════════════════╣`);
  console.log(`  ║  ${now.padEnd(48)}║`);
  console.log(`  ╠═══════════════════════════════════════════════════╣`);
  console.log(`  ║  USDC balance:      $${s.usdcAmount.toFixed(2).padEnd(28)}║`);
  console.log(`  ║  Token value (MtM):  $${s.totalTokenValue.toFixed(2).padEnd(28)}║`);
  console.log(`  ║  ─────────────────────────────────────────────── ║`);
  console.log(`  ║  Total portfolio:   $${s.totalPortfolio.toFixed(2).padEnd(28)}║`);
  console.log(`  ║  Starting bankroll: $${STARTING_BANKROLL.toFixed(2).padEnd(28)}║`);
  console.log(`  ║  ─────────────────────────────────────────────── ║`);

  const pnlStr = `${formatUsd(s.pnl)} (${s.pnlPct >= 0 ? "+" : ""}${s.pnlPct.toFixed(1)}%)`;
  const pnlLine = s.pnl >= 0
    ? `  ║  P&L:  ${pnlStr.padEnd(42)}║`
    : `  ║  P&L:  ${pnlStr.padEnd(42)}║`;
  console.log(pnlLine);

  console.log(`  ╠═══════════════════════════════════════════════════╣`);

  if (s.positions.length === 0) {
    console.log(`  ║  No open token positions                         ║`);
  } else {
    console.log(`  ║  OPEN POSITIONS                                   ║`);
    for (const p of s.positions) {
      const shortId = p.game.replace(/-moneyline$/, "").slice(0, 30);
      console.log(`  ║  ${shortId.padEnd(32)} [${p.phase}]${" ".repeat(Math.max(0, 10 - p.phase.length))}║`);
      console.log(`  ║    FV: ${(p.fv * 100).toFixed(1)}%  ║  YES: ${p.yesTokens.toFixed(1)} ($${p.yesValue.toFixed(2)})  NO: ${p.noTokens.toFixed(1)} ($${p.noValue.toFixed(2)})`.padEnd(54) + `║`);
    }
  }

  console.log(`  ╚═══════════════════════════════════════════════════╝`);
}

// CLI
const args = process.argv.slice(2);
const watchMode = args.includes("--watch");
const intervalArg = args.find(a => !a.startsWith("--") && !isNaN(Number(a)));
const intervalSec = intervalArg ? parseInt(intervalArg) : 10;

await printSnapshot();

if (watchMode) {
  setInterval(printSnapshot, intervalSec * 1000);
}
