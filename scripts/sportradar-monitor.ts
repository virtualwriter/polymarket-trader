/**
 * Sportradar Live Monitor — Parallel data logger.
 *
 * Watches the same games as the CLOB sim and logs:
 *   1. Sportradar game events (scores, periods, match status)
 *   2. Polymarket CLOB snapshots (bid, ask, midpoint, last trade)
 *
 * These two streams are NOT wired together. Both are logged to the same
 * JSONL file with timestamps so you can correlate after the fact:
 *   "At 18:32:05 Sportradar said Blancaneaux won Set 2,
 *    and the CLOB midpoint moved from 12% to 18% over the next 4 seconds."
 *
 * Usage:
 *   npx tsx scripts/sportradar-monitor.ts
 *
 * Output:
 *   logs/sr-monitor-<session>.jsonl   — every event, one JSON per line
 *   Console                           — live summary
 */

import { config } from "dotenv";
import { readFileSync, appendFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const SR_KEY = process.env.SPORTRADAR_API_KEY;
if (!SR_KEY) {
  console.error("Missing SPORTRADAR_API_KEY in .env");
  process.exit(1);
}

// ───────────────────── Config ─────────────────────

const CLOB_URL = "https://clob.polymarket.com";
const SR_POLL_INTERVAL_MS = 30_000;
const CLOB_POLL_INTERVAL_MS = 5_000;

// ───────────────────── Logger ─────────────────────

const logsDir = resolve(__dirname, "../logs");
try { mkdirSync(logsDir, { recursive: true }); } catch {}
const sessionId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logPath = resolve(logsDir, `sr-monitor-${sessionId}.jsonl`);

function log(source: string, gameId: string, eventType: string, data: Record<string, unknown>) {
  const entry = {
    ts: Date.now(),
    isoTime: new Date().toISOString(),
    source,
    gameId,
    eventType,
    ...data,
  };
  const line = JSON.stringify(entry) + "\n";
  try { appendFileSync(logPath, line); } catch {}
  return entry;
}

// ───────────────────── Load Games ─────────────────────

interface GameConfig {
  id: string;
  question: string;
  teamA: string;
  teamB: string;
  sport: string;
  league: string;
  conditionId: string;
  clobTokenIds: string;
  sportradarEventId: string;
}

const gamesPath = resolve(__dirname, "games.json");
const gamesJson = JSON.parse(readFileSync(gamesPath, "utf-8"));
const games: GameConfig[] = gamesJson.games;

console.log(`\n=== SPORTRADAR LIVE MONITOR ===`);
console.log(`Session: ${sessionId}`);
console.log(`Log file: ${logPath}`);
console.log(`Games: ${games.length}`);
console.log(`SR poll: every ${SR_POLL_INTERVAL_MS / 1000}s | CLOB poll: every ${CLOB_POLL_INTERVAL_MS / 1000}s\n`);

for (const g of games) {
  console.log(`  ${g.id} [${g.sport}]: ${g.teamA} vs ${g.teamB}`);
}
console.log();

// ───────────────────── Sportradar API ─────────────────────

const SR_BASE: Record<string, string> = {
  tennis: "https://api.sportradar.com/tennis/trial/v3/en",
  soccer: "https://api.sportradar.com/soccer/trial/v4/en",
  basketball: "https://api.sportradar.com/nba/trial/v8/en/games",
  ncaab: "https://api.sportradar.com/ncaamb/trial/v8/en/games",
};

const disabledSports = new Set<string>();

async function srFetch(url: string, sport: string): Promise<any | null> {
  if (disabledSports.has(sport)) return null;
  try {
    const fullUrl = `${url}${url.includes("?") ? "&" : "?"}api_key=${SR_KEY}`;
    const res = await fetch(fullUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      if (res.status === 403) {
        console.error(`  [SR] ${sport}: 403 Forbidden — disabling`);
        disabledSports.add(sport);
      } else if (res.status === 429) {
        console.error(`  [SR] ${sport}: 429 rate limited`);
      } else {
        console.error(`  [SR] ${sport}: HTTP ${res.status}`);
      }
      return null;
    }
    return await res.json();
  } catch (err: any) {
    console.error(`  [SR] ${sport} fetch error: ${err.message}`);
    return null;
  }
}

// Fuzzy matching: Sportradar competitor names → our game IDs
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function matchGameId(teamA: string, teamB: string): string | null {
  for (const g of games) {
    const gA = normalize(g.teamA);
    const gB = normalize(g.teamB);
    const srA = normalize(teamA);
    const srB = normalize(teamB);

    if (gA === srA || gB === srB || gA === srB || gB === srA) return g.id;

    // Last-name match for tennis
    const lastGA = normalize(g.teamA.split(" ").pop() ?? "");
    const lastGB = normalize(g.teamB.split(" ").pop() ?? "");
    const lastSRA = normalize(teamA.split(" ").pop() ?? "");
    const lastSRB = normalize(teamB.split(" ").pop() ?? "");

    if (lastGA && (lastGA === lastSRA || lastGA === lastSRB)) return g.id;
    if (lastGB && (lastGB === lastSRA || lastGB === lastSRB)) return g.id;
  }
  return null;
}

// ───────────────────── SR: Tennis Polling ─────────────────────
// Uses three endpoints at different frequencies to minimize API calls:
//   1. /schedules/live/summaries      — only live matches (tiny payload), every cycle
//   2. /schedules/live/timelines_delta — point-by-point 10s delta, every cycle
//   3. /schedules/{date}/summaries     — full daily schedule (heavy), every 5 min for pre-match

let lastDailyTennisPoll = 0;
const DAILY_TENNIS_INTERVAL_MS = 5 * 60_000;

function processTennisSummary(summary: any, source: string): number {
  const match = summary.sport_event;
  const status = summary.sport_event_status;
  if (!match || !status) return 0;

  const competitors = match.competitors ?? [];
  const teamA = competitors[0]?.name ?? "?";
  const teamB = competitors[1]?.name ?? "?";
  const gameId = matchGameId(teamA, teamB);
  if (!gameId) return 0;

  const matchStatus = status.match_status ?? status.status;
  const periodScores = status.period_scores ?? [];
  const setsA = periodScores.filter((p: any) => p.home_score > p.away_score && p.type === "set").length;
  const setsB = periodScores.filter((p: any) => p.away_score > p.home_score && p.type === "set").length;
  const currentSet = periodScores[periodScores.length - 1];

  log("sportradar", gameId, "tennis_state", {
    matchStatus,
    srEventId: match.id,
    srSource: source,
    teamA, teamB,
    homeScore: status.home_score ?? 0,
    awayScore: status.away_score ?? 0,
    setsA, setsB,
    currentSetGamesA: currentSet?.home_score ?? 0,
    currentSetGamesB: currentSet?.away_score ?? 0,
    setNumber: periodScores.length,
    periodScores,
    gamePointA: status.home_game_score,
    gamePointB: status.away_game_score,
    winnerId: status.winner_id ?? null,
  });

  const statusStr = matchStatus === "not_started" ? "pre-match"
    : matchStatus === "live" || matchStatus === "in_progress" ? "LIVE"
    : matchStatus;

  console.log(
    `  [SR] ${gameId}: ${statusStr} | ` +
    `${teamA} ${setsA}-${setsB} ${teamB} | ` +
    `Set ${periodScores.length}: ${currentSet?.home_score ?? 0}-${currentSet?.away_score ?? 0}` +
    (status.home_game_score !== undefined ? ` (${status.home_game_score}-${status.away_game_score})` : "")
  );
  return 1;
}

async function pollTennis() {
  if (!games.some(g => g.sport === "tennis")) return;

  let found = 0;

  // Primary: Live Summaries — only currently live matches (lightweight)
  const liveData = await srFetch(`${SR_BASE.tennis}/schedules/live/summaries.json`, "tennis");
  if (liveData?.summaries) {
    for (const summary of liveData.summaries) {
      found += processTennisSummary(summary, "live-summaries");
    }
  }

  // If we got live data, also fetch the timeline delta for point-by-point granularity
  if (found > 0) {
    await new Promise(r => setTimeout(r, 1200));
    const deltaData = await srFetch(`${SR_BASE.tennis}/schedules/live/timelines_delta.json`, "tennis");
    if (deltaData?.sport_event_timelines) {
      for (const timeline of deltaData.sport_event_timelines) {
        const match = timeline.sport_event;
        if (!match) continue;
        const competitors = match.competitors ?? [];
        const teamA = competitors[0]?.name ?? "?";
        const teamB = competitors[1]?.name ?? "?";
        const gameId = matchGameId(teamA, teamB);
        if (!gameId) continue;

        const events = timeline.timeline ?? [];
        for (const evt of events) {
          log("sportradar", gameId, "tennis_point", {
            srSource: "timelines-delta",
            type: evt.type,
            time: evt.time,
            homeScore: evt.home_score,
            awayScore: evt.away_score,
            server: evt.server,
            result: evt.result,
            period: evt.period,
            periodName: evt.period_name,
            breakPoint: evt.break_point,
            matchPoint: evt.match_point,
            setPoint: evt.set_point,
          });
        }

        if (events.length > 0) {
          console.log(`  [SR] ${gameId}: +${events.length} point(s) from delta`);
        }
      }
    }
  }

  // Fallback: Daily schedule for pre-match detection (infrequent — every 5 min)
  const now = Date.now();
  if (found === 0 && now - lastDailyTennisPoll > DAILY_TENNIS_INTERVAL_MS) {
    lastDailyTennisPoll = now;
    await new Promise(r => setTimeout(r, 1200));
    const today = new Date().toISOString().slice(0, 10);
    console.log(`  [SR] Tennis: no live matches, checking daily schedule...`);
    const dailyData = await srFetch(`${SR_BASE.tennis}/schedules/${today}/summaries.json`, "tennis");
    if (dailyData?.summaries) {
      for (const summary of dailyData.summaries) {
        found += processTennisSummary(summary, "daily-summaries");
      }
    }
  }

  if (found === 0 && !disabledSports.has("tennis")) {
    console.log(`  [SR] Tennis: no matching games found`);
  }
}

// ───────────────────── SR: Basketball (NBA) Polling ─────────────────────

async function pollBasketball() {
  if (!games.some(g => g.sport === "basketball")) return;

  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const data = await srFetch(`${SR_BASE.basketball}/${yyyy}/${mm}/${dd}/schedule.json`, "basketball");
  if (!data?.games) return;

  let found = 0;
  for (const game of data.games) {
    const homeTeam = game.home?.name ?? "?";
    const awayTeam = game.away?.name ?? "?";

    const gameId = matchGameId(homeTeam, awayTeam);
    if (!gameId) continue;

    found++;
    const status = game.status ?? "unknown";
    const quarter = game.quarter ?? 0;
    const clock = game.clock ?? "";

    log("sportradar", gameId, "basketball_state", {
      status,
      srEventId: game.id,
      srId: game.sr_id,
      homeTeam, awayTeam,
      homeAlias: game.home?.alias,
      awayAlias: game.away?.alias,
      homeScore: game.home_points ?? 0,
      awayScore: game.away_points ?? 0,
      quarter,
      clock,
      scheduled: game.scheduled,
      venue: game.venue?.name ?? "",
      broadcasts: game.broadcasts?.map((b: any) => b.network) ?? [],
    });

    const statusStr = status === "scheduled" ? "pre-game"
      : status === "inprogress" ? "LIVE"
      : status === "halftime" ? "HALFTIME"
      : status === "closed" ? "FINAL"
      : status;

    console.log(
      `  [SR] ${gameId}: ${statusStr} | ` +
      `${homeTeam} ${game.home_points ?? 0}-${game.away_points ?? 0} ${awayTeam}` +
      (quarter ? ` | Q${quarter} ${clock}` : "")
    );
  }

  if (found === 0 && !disabledSports.has("basketball")) {
    console.log(`  [SR] Basketball: no matching games found in today's schedule`);
  }
}

// ───────────────────── SR: NCAAB Polling ─────────────────────

async function pollNcaab() {
  const ncaabGames = games.filter(g => g.league === "NCAAB");
  if (ncaabGames.length === 0) return;

  let found = 0;

  // If we have a sportradarEventId, use the boxscore endpoint (has live scores)
  for (const g of ncaabGames) {
    if (!g.sportradarEventId) continue;
    const boxUrl = `https://api.sportradar.com/ncaamb/trial/v8/en/games/${g.sportradarEventId}/boxscore.json`;
    const data = await srFetch(boxUrl, "ncaab");
    if (!data || data.message) continue;

    found++;
    const homeTeam = data.home?.name ?? "?";
    const awayTeam = data.away?.name ?? "?";
    const status = data.status ?? "unknown";
    const half = data.half ?? 0;
    const clock = data.clock ?? "";
    const homeScore = data.home?.points ?? 0;
    const awayScore = data.away?.points ?? 0;

    log("sportradar", g.id, "ncaab_state", {
      status,
      srEventId: g.sportradarEventId,
      homeTeam, awayTeam,
      homeScore, awayScore,
      half,
      clock,
      title: data.title ?? "",
      venue: data.venue?.name ?? "",
    });

    const statusStr = status === "scheduled" ? "pre-game"
      : status === "inprogress" ? "LIVE"
      : status === "halftime" ? "HALFTIME"
      : status === "closed" ? "FINAL"
      : status;

    console.log(
      `  [SR] ${g.id}: ${statusStr} | ` +
      `${awayTeam} ${awayScore} @ ${homeTeam} ${homeScore}` +
      (half ? ` | H${half} ${clock}` : "")
    );

    await new Promise(r => setTimeout(r, 1200));
  }

  // Fallback: daily schedule for games without a sportradarEventId
  const unmatched = ncaabGames.filter(g => !g.sportradarEventId);
  if (unmatched.length > 0) {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const data = await srFetch(`${SR_BASE.ncaab}/${yyyy}/${mm}/${dd}/schedule.json`, "ncaab");
    if (data?.games) {
      for (const game of data.games) {
        const homeTeam = game.home?.name ?? "?";
        const awayTeam = game.away?.name ?? "?";
        const gameId = matchGameId(homeTeam, awayTeam);
        if (!gameId) continue;
        found++;
        log("sportradar", gameId, "ncaab_state", {
          status: game.status ?? "unknown",
          srEventId: game.id,
          homeTeam, awayTeam,
          homeScore: game.home_points ?? 0,
          awayScore: game.away_points ?? 0,
          half: game.half ?? 0,
          clock: game.clock ?? "",
        });
      }
    }
  }

  if (found === 0 && !disabledSports.has("ncaab")) {
    console.log(`  [SR] NCAAB: no matching games found`);
  }
}

// ───────────────────── SR: Soccer Polling ─────────────────────

async function pollSoccer() {
  if (!games.some(g => g.sport === "soccer")) return;

  const today = new Date().toISOString().slice(0, 10);
  const data = await srFetch(`${SR_BASE.soccer}/schedules/${today}/summaries.json`, "soccer");
  if (!data?.summaries) return;

  let found = 0;
  for (const summary of data.summaries) {
    const match = summary.sport_event;
    const status = summary.sport_event_status;
    if (!match || !status) continue;

    const competitors = match.competitors ?? [];
    const teamA = competitors.find((c: any) => c.qualifier === "home")?.name ?? "?";
    const teamB = competitors.find((c: any) => c.qualifier === "away")?.name ?? "?";
    const gameId = matchGameId(teamA, teamB);
    if (!gameId) continue;

    found++;
    const matchStatus = status.match_status ?? status.status;

    log("sportradar", gameId, "soccer_state", {
      matchStatus,
      srEventId: match.id,
      teamA, teamB,
      homeScore: status.home_score ?? 0,
      awayScore: status.away_score ?? 0,
      minute: status.clock?.played ? Math.floor(parseInt(status.clock.played) / 60) : null,
      period: matchStatus,
    });

    console.log(
      `  [SR] ${gameId}: ${matchStatus} | ${teamA} ${status.home_score ?? 0}-${status.away_score ?? 0} ${teamB}`
    );
  }

  if (found === 0 && !disabledSports.has("soccer")) {
    console.log(`  [SR] Soccer: no matching games found in today's schedule`);
  }
}

// ───────────────────── Polymarket CLOB Polling ─────────────────────

interface ClobState {
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  lastPrice: number | null;
  spread: number | null;
}

const lastClobState = new Map<string, ClobState>();

async function pollClob() {
  for (const game of games) {
    try {
      const tokenIds = JSON.parse(game.clobTokenIds) as string[];
      if (!tokenIds[0]) continue;

      const res = await fetch(`${CLOB_URL}/book?token_id=${tokenIds[0]}`);
      if (!res.ok) continue;
      const book = await res.json() as any;

      const bids = (book.bids ?? []).sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price));
      const asks = (book.asks ?? []).sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));
      const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null;
      const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;
      const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
      const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

      const bidDepth = bids.slice(0, 5).reduce((s: number, b: any) => s + parseFloat(b.size || "0"), 0);
      const askDepth = asks.slice(0, 5).reduce((s: number, a: any) => s + parseFloat(a.size || "0"), 0);

      const prev = lastClobState.get(game.id);
      const changed = !prev || prev.midpoint !== midpoint || prev.bestBid !== bestBid || prev.bestAsk !== bestAsk;

      const state: ClobState = { bestBid, bestAsk, midpoint, lastPrice: null, spread };
      lastClobState.set(game.id, state);

      log("polymarket-clob", game.id, "orderbook_snapshot", {
        bestBid, bestAsk, midpoint, spread,
        bidLevels: bids.length,
        askLevels: asks.length,
        bidDepthTop5: Math.round(bidDepth),
        askDepthTop5: Math.round(askDepth),
        changed,
      });

      if (changed) {
        const midStr = midpoint !== null ? `${(midpoint * 100).toFixed(1)}%` : "N/A";
        const spreadStr = spread !== null ? `${(spread * 100).toFixed(1)}¢` : "N/A";
        console.log(
          `  [CLOB] ${game.id}: mid=${midStr} | ` +
          `bid=${bestBid !== null ? (bestBid * 100).toFixed(1) : "N/A"}¢ ` +
          `ask=${bestAsk !== null ? (bestAsk * 100).toFixed(1) : "N/A"}¢ | ` +
          `spread=${spreadStr} | depth: ${Math.round(bidDepth)}/${Math.round(askDepth)}`
        );
      }
    } catch (err: any) {
      console.error(`  [CLOB] ${game.id}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }
}


// ───────────────────── Main Loop ─────────────────────

async function srCycle() {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\n[${ts}] ── Sportradar poll ──`);
  // Trial key: 1 QPS. Prioritize live games, 3s spacing, no retries.
  await pollNcaab();
  await new Promise(r => setTimeout(r, 3000));
  await pollBasketball();
  await new Promise(r => setTimeout(r, 3000));
  await pollTennis();
  await new Promise(r => setTimeout(r, 3000));
  await pollSoccer();
}

async function clobCycle() {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ── CLOB snapshot ──`);
  await pollClob();
}

log("system", "all", "session_start", {
  games: games.map(g => ({ id: g.id, sport: g.sport, teamA: g.teamA, teamB: g.teamB })),
  srPollMs: SR_POLL_INTERVAL_MS,
  clobPollMs: CLOB_POLL_INTERVAL_MS,
});

await srCycle();
await clobCycle();

setInterval(srCycle, SR_POLL_INTERVAL_MS);
setInterval(clobCycle, CLOB_POLL_INTERVAL_MS);

console.log(`\n  Monitoring live. Logging to ${logPath}`);
console.log(`  Ctrl+C to stop.\n`);
