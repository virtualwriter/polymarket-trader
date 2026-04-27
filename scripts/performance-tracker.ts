/**
 * Performance Tracker — Per-game P&L metrics, defense activation stats,
 * and cross-sport comparison dashboard.
 *
 * Polls the sports-sim-server HTTP API and builds a running report.
 * Can be run alongside the sim or post-hoc against the log files.
 *
 * Usage:
 *   npx tsx scripts/performance-tracker.ts
 *   npx tsx scripts/performance-tracker.ts --interval 10 --output results.json
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SIM_SERVER_URL = process.env.SIM_SERVER_URL ?? "http://localhost:8080";

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

const pollIntervalSec = parseInt(getArg("interval") ?? "5");
const outputFile = getArg("output") ?? "sim-results.json";

// ───────────────────── Data Structures ─────────────────────

interface GameMetrics {
  gameId: string;
  sport: string;
  teamA: string;
  teamB: string;
  phase: string;
  outcome: boolean | null;

  // P&L
  ammRealizedPnl: number;
  ammUnrealizedPnl: number;
  ammTotalPnl: number;
  grossPnl: number;
  totalFees: number;
  netPnl: number;

  // Volume
  totalFills: number;
  totalVolume: number;
  ammFills: number;
  p2pFills: number;
  avgSpreadCaptured: number;

  // Risk
  maxDrawdown: number;
  maxExposure: number;
  inventoryAtResolution: number;
  vpinTriggerCount: number;
  toxicityRefuseCount: number;
  bayesianShiftCount: number;
  gameSignalCount: number;

  // Time management
  totalQuotingTimeMs: number;
  totalWithdrawnTimeMs: number;
  quotingPct: number;
  withdrawalCount: number;

  // Timestamps
  gameStartTime: number;
  gameEndTime: number;
  durationMinutes: number;

  // Timeline snapshots
  pnlTimeline: Array<{ time: number; pnl: number }>;
  spreadTimeline: Array<{ time: number; spread: number }>;
}

interface CrossSportComparison {
  sport: string;
  gameCount: number;
  avgPnl: number;
  totalPnl: number;
  avgSpreadEarnedPerHour: number;
  avgRiskAdjustedReturn: number;
  avgDefenseFrequency: number;
  avgQuotingPct: number;
  edgeBps: number;
  auctionLikenessScore: number;
}

// ───────────────────── State ─────────────────────

const gameMetrics = new Map<string, GameMetrics>();
let startTime = Date.now();
let lastSnapshot: Record<string, any> = {};

// ───────────────────── API Polling ─────────────────────

async function fetchJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${SIM_SERVER_URL}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function pollAndUpdate(): Promise<void> {
  const [health, gameStatus, ammStatus, traderPnl, markets] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/game-status"),
    fetchJson("/amm-status"),
    fetchJson("/trader-pnl"),
    fetchJson("/markets"),
  ]);

  if (!health || !gameStatus) return;

  const now = Date.now();

  for (const game of gameStatus.games ?? []) {
    const id = game.marketId;
    if (!gameMetrics.has(id)) {
      gameMetrics.set(id, createEmptyMetrics(id, game));
    }
    const m = gameMetrics.get(id)!;
    m.phase = game.phase;

    if (game.phase === "live" && m.gameStartTime === 0) {
      m.gameStartTime = now;
    }
    if (game.phase === "resolved" && m.gameEndTime === 0) {
      m.gameEndTime = now;
      m.outcome = game.outcome;
      m.durationMinutes = (m.gameEndTime - m.gameStartTime) / 60000;
    }
  }

  // AMM status
  for (const amm of ammStatus?.amms ?? []) {
    const id = amm.marketId;
    const m = gameMetrics.get(id);
    if (!m) continue;

    const risk = amm.risk ?? {};
    const withdrawn = risk.withdrawn ?? false;
    const exposure = Math.abs(parseFloat(risk.netYesExposure ?? "0") / 1e6);

    if (withdrawn) {
      m.totalWithdrawnTimeMs += pollIntervalSec * 1000;
      m.withdrawalCount++;
    } else {
      m.totalQuotingTimeMs += pollIntervalSec * 1000;
    }

    if (exposure > m.maxExposure) m.maxExposure = exposure;

    if (m.phase === "resolved") {
      m.inventoryAtResolution = exposure;
    }

    if (risk.vpinTriggered) m.vpinTriggerCount++;
  }

  // Trader P&L — find AMM account
  const ammEntry = (traderPnl?.traders ?? []).find((t: any) =>
    t.name.toLowerCase().includes("amm") || t.name === "0x0000000000000000000000000000000000000amm"
  );

  if (ammEntry) {
    const perMarket = ammEntry.perMarket as Record<string, { realized: number; unrealized: number; total: number; fills?: number; volume?: number }> | undefined;
    if (perMarket) {
      for (const [mktId, pnl] of Object.entries(perMarket)) {
        const m = gameMetrics.get(mktId);
        if (m) {
          m.ammRealizedPnl = pnl.realized;
          m.ammUnrealizedPnl = pnl.unrealized;
          m.ammTotalPnl = pnl.total;
          if (pnl.fills !== undefined) m.totalFills = pnl.fills;
          if (pnl.volume !== undefined) m.totalVolume = pnl.volume;
        }
      }
    } else {
      const activeGames = [...gameMetrics.values()].filter(g => g.phase !== "pre_game");
      if (activeGames.length > 0) {
        const pnlPerGame = ammEntry.totalPnl / activeGames.length;
        for (const m of activeGames) {
          m.ammTotalPnl = pnlPerGame;
          m.ammRealizedPnl = ammEntry.realizedPnl / activeGames.length;
          m.ammUnrealizedPnl = ammEntry.unrealizedPnl / activeGames.length;
        }
      }
    }
  }

  // Market data
  for (const market of markets?.markets ?? []) {
    const m = gameMetrics.get(market.id);
    if (!m) continue;

    if (market.spread) {
      m.spreadTimeline.push({ time: now, spread: market.spread });
    }

    // Compute average spread
    if (m.spreadTimeline.length > 0) {
      m.avgSpreadCaptured = m.spreadTimeline.reduce((s, e) => s + e.spread, 0) / m.spreadTimeline.length;
    }
  }

  // Global trade counts (for summary)
  for (const m of gameMetrics.values()) {
    m.ammFills = health.ammTrades ?? 0;
    m.p2pFills = health.p2pTrades ?? 0;
  }

  lastSnapshot = health;

  // P&L timeline
  for (const m of gameMetrics.values()) {
    if (m.phase !== "pre_game") {
      m.pnlTimeline.push({ time: now, pnl: m.ammTotalPnl });

      // Max drawdown from peak
      const peak = Math.max(0, ...m.pnlTimeline.map(p => p.pnl));
      const trough = Math.min(0, ...m.pnlTimeline.map(p => p.pnl));
      m.maxDrawdown = Math.abs(peak - trough);
    }

    // Quoting percentage
    const totalTime = m.totalQuotingTimeMs + m.totalWithdrawnTimeMs;
    m.quotingPct = totalTime > 0 ? m.totalQuotingTimeMs / totalTime : 1.0;
  }
}

function createEmptyMetrics(id: string, game: any): GameMetrics {
  return {
    gameId: id,
    sport: game.sport ?? detectSportFromId(id),
    teamA: game.teamA ?? "",
    teamB: game.teamB ?? "",
    phase: game.phase ?? "pre_game",
    outcome: null,
    ammRealizedPnl: 0, ammUnrealizedPnl: 0, ammTotalPnl: 0,
    grossPnl: 0, totalFees: 0, netPnl: 0,
    totalFills: 0, totalVolume: 0, ammFills: 0, p2pFills: 0,
    avgSpreadCaptured: 0,
    maxDrawdown: 0, maxExposure: 0, inventoryAtResolution: 0,
    vpinTriggerCount: 0, toxicityRefuseCount: 0,
    bayesianShiftCount: 0, gameSignalCount: 0,
    totalQuotingTimeMs: 0, totalWithdrawnTimeMs: 0,
    quotingPct: 1.0, withdrawalCount: 0,
    gameStartTime: 0, gameEndTime: 0, durationMinutes: 0,
    pnlTimeline: [], spreadTimeline: [],
  };
}

function detectSportFromId(id: string): string {
  if (id.includes("tennis")) return "tennis";
  if (id.includes("soccer") || id.includes("city") || id.includes("liverpool")) return "soccer";
  if (id.includes("baseball") || id.includes("yankees") || id.includes("mlb")) return "baseball";
  if (id.includes("basketball") || id.includes("lakers") || id.includes("nba")) return "basketball";
  return "unknown";
}

// ───────────────────── Cross-Sport Comparison ─────────────────────

function computeCrossSportComparison(): CrossSportComparison[] {
  const bySport = new Map<string, GameMetrics[]>();
  for (const m of gameMetrics.values()) {
    if (!bySport.has(m.sport)) bySport.set(m.sport, []);
    bySport.get(m.sport)!.push(m);
  }

  const comparisons: CrossSportComparison[] = [];

  for (const [sport, games] of bySport) {
    const resolved = games.filter(g => g.phase === "resolved");
    const all = games;

    const avgPnl = all.length > 0
      ? all.reduce((s, g) => s + g.ammTotalPnl, 0) / all.length : 0;

    const totalPnl = all.reduce((s, g) => s + g.ammTotalPnl, 0);

    // Spread earned per hour
    const totalHours = all.reduce((s, g) => s + g.durationMinutes / 60, 0) || 1;
    const avgSpreadPerHour = totalPnl / totalHours;

    // Risk-adjusted: PnL / max drawdown (Sharpe-like)
    const avgMaxDD = all.length > 0
      ? all.reduce((s, g) => s + g.maxDrawdown, 0) / all.length : 1;
    const riskAdj = avgMaxDD > 0 ? avgPnl / avgMaxDD : 0;

    // Defense frequency: triggers per game
    const avgDefense = all.length > 0
      ? all.reduce((s, g) => s + g.vpinTriggerCount + g.withdrawalCount, 0) / all.length : 0;

    const avgQuoting = all.length > 0
      ? all.reduce((s, g) => s + g.quotingPct, 0) / all.length : 1;

    // Edge ratio: P&L per $1 of volume — how efficiently the bot captures spread
    const totalVol = all.reduce((s, g) => s + g.totalVolume, 0);
    const edgeRatio = totalVol > 0 ? (totalPnl / totalVol) * 100 : 0;

    comparisons.push({
      sport,
      gameCount: all.length,
      avgPnl: Math.round(avgPnl * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      avgSpreadEarnedPerHour: Math.round(avgSpreadPerHour * 100) / 100,
      avgRiskAdjustedReturn: Math.round(riskAdj * 1000) / 1000,
      avgDefenseFrequency: Math.round(avgDefense * 10) / 10,
      avgQuotingPct: Math.round(avgQuoting * 1000) / 10,
      edgeBps: Math.round(edgeRatio * 10) / 10,
      auctionLikenessScore: 0,
    });
  }

  comparisons.sort((a, b) => b.avgRiskAdjustedReturn - a.avgRiskAdjustedReturn);
  return comparisons;
}

// ───────────────────── Console Dashboard ─────────────────────

function printDashboard(): void {
  const games = [...gameMetrics.values()];
  if (games.length === 0) {
    console.log("[tracker] No games tracked yet...");
    return;
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.clear();
  console.log("╔═══════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                    SPORTS MM — LIVE PERFORMANCE DASHBOARD                        ║");
  console.log(`║  Elapsed: ${String(elapsed).padStart(6)}s | Games: ${games.length} | ${new Date().toLocaleTimeString().padStart(20)} ║`);
  console.log("╠═══════════════════════════════════════════════════════════════════════════════════╣");

  // Per-game table
  console.log("║ Game                          │ Sport      │ Phase    │ P&L      │ Fills │ Quote% ║");
  console.log("╟───────────────────────────────┼────────────┼──────────┼──────────┼───────┼────────╢");

  for (const m of games) {
    const pnlStr = (m.ammTotalPnl >= 0 ? "+" : "") + m.ammTotalPnl.toFixed(0);
    const label = `${m.teamA} v ${m.teamB}`.slice(0, 29);
    const quoteStr = `${(m.quotingPct * 100).toFixed(0)}%`;
    console.log(
      `║ ${label.padEnd(29)} │ ${m.sport.padEnd(10)} │ ${m.phase.padEnd(8)} │ ${pnlStr.padStart(8)} │ ${String(m.totalFills).padStart(5)} │ ${quoteStr.padStart(6)} ║`
    );
  }

  console.log("╠═══════════════════════════════════════════════════════════════════════════════════╣");

  // Cross-sport comparison
  const comparisons = computeCrossSportComparison();
  console.log("║                         CROSS-SPORT COMPARISON                                   ║");
  console.log("╟────────────┬──────┬──────────┬────────────┬──────────┬──────────┬─────────────────╢");
  console.log("║ Sport      │ Games│ Avg P&L  │ $/hour     │ Sharpe   │ Quote%   │ Edge (bps)      ║");
  console.log("╟────────────┼──────┼──────────┼────────────┼──────────┼──────────┼─────────────────╢");

  for (const c of comparisons) {
    console.log(
      `║ ${c.sport.padEnd(10)} │ ${String(c.gameCount).padStart(4)} │ ${String(c.avgPnl >= 0 ? "+" : "").padStart(1)}${c.avgPnl.toFixed(0).padStart(7)} │ ${String(c.avgSpreadEarnedPerHour >= 0 ? "+" : "").padStart(1)}${c.avgSpreadEarnedPerHour.toFixed(0).padStart(9)} │ ${c.avgRiskAdjustedReturn.toFixed(2).padStart(8)} │ ${String(c.avgQuotingPct).padStart(6)}% │ ${(c.edgeBps >= 0 ? "+" : "").padStart(1)}${c.edgeBps.toFixed(1).padStart(13)}bp ║`
    );
  }

  console.log("╠═══════════════════════════════════════════════════════════════════════════════════╣");

  // Defense activations
  const totalVpin = games.reduce((s, g) => s + g.vpinTriggerCount, 0);
  const totalWithdrawals = games.reduce((s, g) => s + g.withdrawalCount, 0);
  const totalToxBlocks = games.reduce((s, g) => s + g.toxicityRefuseCount, 0);

  console.log(`║  VPIN triggers: ${String(totalVpin).padStart(5)} │ Withdrawals: ${String(totalWithdrawals).padStart(5)} │ Toxicity blocks: ${String(totalToxBlocks).padStart(5)}          ║`);
  console.log("╚═══════════════════════════════════════════════════════════════════════════════════╝");
}

// ───────────────────── Save Results ─────────────────────

function saveResults(): void {
  const games = [...gameMetrics.values()].map(m => ({
    ...m,
    pnlTimeline: m.pnlTimeline.slice(-100), // Keep last 100 snapshots
    spreadTimeline: m.spreadTimeline.slice(-100),
  }));

  const output = {
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startTime,
    games,
    crossSport: computeCrossSportComparison(),
  };

  const outPath = resolve(__dirname, outputFile);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
}

// ───────────────────── Main Loop ─────────────────────

async function main() {
  console.log(`\n=== SPORTS MM PERFORMANCE TRACKER ===`);
  console.log(`Server: ${SIM_SERVER_URL}`);
  console.log(`Poll interval: ${pollIntervalSec}s`);
  console.log(`Output: ${outputFile}\n`);

  // Wait for server
  let retries = 0;
  while (retries < 10) {
    const health = await fetchJson("/health");
    if (health) break;
    retries++;
    console.log(`[tracker] Waiting for MM server... (${retries}/10)`);
    await new Promise(r => setTimeout(r, 2000));
  }

  startTime = Date.now();

  // Main poll loop
  const interval = setInterval(async () => {
    await pollAndUpdate();
    printDashboard();
  }, pollIntervalSec * 1000);

  // Save results periodically
  const saveInterval = setInterval(() => {
    saveResults();
  }, 30_000);

  // Initial poll
  await pollAndUpdate();
  printDashboard();

  // Shutdown handler
  const shutdown = () => {
    clearInterval(interval);
    clearInterval(saveInterval);
    console.log("\n\n=== FINAL RESULTS ===\n");
    printDashboard();
    saveResults();
    console.log(`\nResults saved to ${outputFile}`);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(console.error);
