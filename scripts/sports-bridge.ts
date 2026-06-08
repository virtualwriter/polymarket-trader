/**
 * Sports Data Bridge — Streams live odds + scores into the MM server.
 *
 * Legacy note: sports simulation support only. This script is not part of the
 * USA production hourly trader, exit scanner, or heatmap generation path.
 *
 * Supported sources:
 *   --source demo         Synthetic odds walk for testing
 *   --source espn         ESPN hidden API (free, ~15s delay)
 *   --source odds-api     The Odds API (aggregated sportsbook odds)
 *   --source betfair      Betfair Exchange streaming API
 *   --source sportradar   Sportradar Sports Data API (30-day free trial)
 *   --source polymarket   Polymarket read-only feed (CLOB + Sports WebSocket)
 *   --source all          Run all available sources concurrently
 *
 * Usage:
 *   npx tsx scripts/sports-bridge.ts --source demo
 *   npx tsx scripts/sports-bridge.ts --source sportradar
 *   npx tsx scripts/sports-bridge.ts --source all
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const SIM_SERVER_URL = process.env.SIM_SERVER_URL ?? "http://localhost:8080";

// ───────────────────── CLI ─────────────────────

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

const source = getArg("source") ?? "demo";
const betfairKey = getArg("betfair-key") ?? process.env.BETFAIR_API_KEY;
const oddsApiKey = getArg("odds-api-key") ?? process.env.ODDS_API_KEY;
const sportradarKey = getArg("sportradar-key") || process.env.SPORTRADAR_API_KEY;

// ───────────────────── Event Posting ─────────────────────

let connected = false;
let failCount = 0;

async function postEvent(event: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SIM_SERVER_URL}/game-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    if (res.ok) {
      if (!connected) {
        connected = true;
        failCount = 0;
        console.log(`[bridge] Connected to MM server at ${SIM_SERVER_URL}`);
      }
      return true;
    }
    console.error(`[bridge] POST returned ${res.status}`);
    return false;
  } catch (err: any) {
    failCount++;
    if (failCount <= 3) {
      console.error(`[bridge] Cannot reach MM server (${err.message}). Is sports-sim-server running?`);
    } else if (failCount % 20 === 0) {
      console.error(`[bridge] Still cannot reach MM server (${failCount} failures)`);
    }
    connected = false;
    return false;
  }
}

// ───────────────────── Game Config Fetching ─────────────────────

interface GameInfo {
  id: string;
  sport: string;
  teamA: string;
  teamB: string;
  sportradarEventId?: string;
  polymarketSlug?: string;
}

async function fetchGameConfigs(): Promise<GameInfo[]> {
  try {
    const res = await fetch(`${SIM_SERVER_URL}/game-status`);
    if (!res.ok) return [];
    const data = await res.json() as any;
    return (data.games ?? []).map((g: any) => ({
      id: g.marketId,
      sport: g.sport ?? "unknown",
      teamA: g.teamA ?? "",
      teamB: g.teamB ?? "",
      sportradarEventId: g.sportradarEventId ?? "",
      polymarketSlug: g.polymarketSlug ?? "",
    }));
  } catch {
    return [];
  }
}

// ───────────────────── Demo Source (Random Walk) ─────────────────────

async function runDemo() {
  console.log("[demo] Starting synthetic odds walk...\n");

  const res = await fetch(`${SIM_SERVER_URL}/game-status`);
  if (!res.ok) {
    console.error("[demo] Cannot reach MM server. Start the sports-sim-server first.");
    process.exit(1);
  }
  const data = await res.json() as { games: Array<{ marketId: string; fairValue: number }> };
  const games = data.games.map(g => ({ id: g.marketId, prob: g.fairValue }));

  if (games.length === 0) {
    console.error("[demo] No games found on MM server.");
    process.exit(1);
  }

  console.log(`[demo] Tracking ${games.length} games: ${games.map(g => g.id).join(", ")}\n`);

  for (const game of games) {
    await postEvent({ marketId: game.id, eventType: "game_start", data: { quarter: "1Q" } });
  }

  let tick = 0;
  const interval = setInterval(async () => {
    tick++;

    for (const game of games) {
      const drift = (Math.random() - 0.5) * 0.04;
      const momentum = (Math.random() - 0.5) * 0.01;
      game.prob = Math.max(0.03, Math.min(0.97, game.prob + drift + momentum));

      await postEvent({
        marketId: game.id,
        eventType: "odds_update",
        data: { fairValue: Math.round(game.prob * 1000) / 1000, source: "demo" },
      });

      if (Math.random() < 0.05) {
        const teamAScored = Math.random() < game.prob;
        await postEvent({
          marketId: game.id,
          eventType: "score_update",
          data: {
            scoreA: teamAScored ? 1 : 0,
            scoreB: teamAScored ? 0 : 1,
            quarter: tick < 60 ? "1Q" : tick < 120 ? "2Q" : tick < 180 ? "3Q" : "4Q",
            clock: `${12 - (tick % 60)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
          },
        });
      }
    }

    if (tick >= 60) {
      for (const game of games) {
        await postEvent({
          marketId: game.id,
          eventType: "game_end",
          data: { teamAWins: game.prob > 0.5 },
        });
      }
      console.log("\n[demo] All demo games resolved. Exiting.");
      clearInterval(interval);
      process.exit(0);
    }
  }, 5000);
}

// ───────────────────── ESPN Source ─────────────────────

async function runEspn() {
  console.log("[espn] Starting ESPN scoreboard polling (15s intervals)...\n");

  // Fetch registered games from sim server for ID mapping
  const registeredGames = await fetchGameConfigs();
  const gameIdByTeam = new Map<string, string>();
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const g of registeredGames) {
    if (g.teamA) gameIdByTeam.set(normalize(g.teamA), g.id);
    if (g.teamB) gameIdByTeam.set(normalize(g.teamB), g.id);
    const lastA = g.teamA.split(" ").pop();
    const lastB = g.teamB.split(" ").pop();
    if (lastA) gameIdByTeam.set(normalize(lastA), g.id);
    if (lastB) gameIdByTeam.set(normalize(lastB), g.id);
  }

  function resolveGameId(espnId: string, nameA: string, nameB: string): string {
    const byA = gameIdByTeam.get(normalize(nameA));
    if (byA) return byA;
    const byB = gameIdByTeam.get(normalize(nameB));
    if (byB) return byB;
    return espnId;
  }

  const SPORT_URLS: Record<string, string> = {
    nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
    cbb: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard",
    soccer: "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard",
    mlb: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
    tennis: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
  };

  async function pollSport(sport: string, url: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json() as any;

      for (const event of data.events ?? []) {
        const comp = event.competitions?.[0];
        if (!comp) continue;

        const teamA = comp.competitors?.[0];
        const teamB = comp.competitors?.[1];
        if (!teamA || !teamB) continue;

        const nameA = teamA.team?.shortDisplayName ?? teamA.team?.displayName ?? "";
        const nameB = teamB.team?.shortDisplayName ?? teamB.team?.displayName ?? "";
        const gameId = resolveGameId(`${sport}-${event.id}`, nameA, nameB);
        const scoreA = parseInt(teamA.score ?? "0");
        const scoreB = parseInt(teamB.score ?? "0");
        const status = comp.status?.type?.name;

        if (status === "STATUS_IN_PROGRESS") {
          await postEvent({
            marketId: gameId,
            eventType: "score_update",
            data: {
              scoreA, scoreB,
              quarter: comp.status?.period?.toString() ?? "",
              clock: comp.status?.displayClock ?? "",
              teamA: nameA,
              teamB: nameB,
              source: "espn",
            },
          });
        } else if (status === "STATUS_FINAL") {
          await postEvent({
            marketId: gameId,
            eventType: "game_end",
            data: { teamAWins: scoreA > scoreB, scoreA, scoreB, source: "espn" },
          });
        }
      }
    } catch (err: any) {
      console.error(`[espn:${sport}] Poll failed: ${err.message}`);
    }
  }

  setInterval(() => {
    for (const [sport, url] of Object.entries(SPORT_URLS)) {
      pollSport(sport, url);
    }
  }, 15_000);

  for (const [sport, url] of Object.entries(SPORT_URLS)) {
    pollSport(sport, url);
  }
}

// ───────────────────── The Odds API Source ─────────────────────

async function runOddsApi() {
  if (!oddsApiKey) {
    console.error("[odds-api] No API key. Use --odds-api-key <key> or set ODDS_API_KEY.");
    process.exit(1);
  }

  console.log("[odds-api] Starting aggregated odds polling (30s intervals)...\n");

  const SPORTS = [
    "americanfootball_nfl",
    "basketball_nba",
    "soccer_epl",
    "baseball_mlb",
    "tennis_atp_french_open",
  ];

  async function pollOdds() {
    for (const sport of SPORTS) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?` +
          `apiKey=${oddsApiKey}&regions=us,uk&markets=h2h&oddsFormat=decimal`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json() as any[];

        for (const game of data) {
          const bookmakers = game.bookmakers ?? [];
          if (bookmakers.length === 0) continue;

          const allProbs: number[] = [];
          for (const bk of bookmakers) {
            const h2h = bk.markets?.find((m: any) => m.key === "h2h");
            if (!h2h?.outcomes) continue;
            const homeOdds = h2h.outcomes.find((o: any) => o.name === game.home_team);
            if (homeOdds) allProbs.push(1 / homeOdds.price);
          }

          if (allProbs.length > 0) {
            const avgProb = allProbs.reduce((a, b) => a + b, 0) / allProbs.length;
            const devigged = Math.max(0.03, Math.min(0.97, avgProb));

            await postEvent({
              marketId: game.id,
              eventType: "odds_update",
              data: {
                fairValue: Math.round(devigged * 1000) / 1000,
                source: "odds-api",
                bookmakerCount: allProbs.length,
                homeTeam: game.home_team,
                awayTeam: game.away_team,
              },
            });
          }
        }
      } catch (err: any) {
        console.error(`[odds-api] ${sport}: ${err.message}`);
      }
    }
  }

  await pollOdds();
  setInterval(pollOdds, 30_000);
}

// ───────────────────── Betfair Source ─────────────────────

async function runBetfair() {
  if (!betfairKey) {
    console.error("[betfair] No API key. Use --betfair-key <key> or set BETFAIR_API_KEY.");
    process.exit(1);
  }

  console.log("[betfair] Betfair Exchange API (placeholder — needs session management)");

  const BETFAIR_API = "https://api.betfair.com/exchange/betting/rest/v1.0";

  setInterval(async () => {
    console.log("[betfair] Would poll Betfair markets here...");
  }, 10_000);
}

// ───────────────────── Sportradar Source ─────────────────────

async function runSportradar() {
  if (!sportradarKey) {
    console.error("[sportradar] No API key. Use --sportradar-key <key> or set SPORTRADAR_API_KEY.");
    console.error("[sportradar] Get a 30-day free trial at https://developer.sportradar.com/");
    process.exit(1);
  }

  // Fetch registered games from sim server so we can map Sportradar data → game IDs
  const registeredGames = await fetchGameConfigs();
  if (registeredGames.length === 0) {
    console.warn("[sportradar] No registered games found on sim server — events will use SR IDs");
  }

  // Build a fuzzy team-name → game ID lookup
  const gameIdByTeam = new Map<string, string>();
  for (const g of registeredGames) {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (g.teamA) gameIdByTeam.set(normalize(g.teamA), g.id);
    if (g.teamB) gameIdByTeam.set(normalize(g.teamB), g.id);
    // Also index by last name for tennis players
    const lastA = g.teamA.split(" ").pop();
    const lastB = g.teamB.split(" ").pop();
    if (lastA) gameIdByTeam.set(normalize(lastA), g.id);
    if (lastB) gameIdByTeam.set(normalize(lastB), g.id);
  }

  function resolveGameId(srId: string, teamA: string, teamB: string): string {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Try exact team name matches first
    const byA = gameIdByTeam.get(normalize(teamA));
    if (byA) return byA;
    const byB = gameIdByTeam.get(normalize(teamB));
    if (byB) return byB;
    // Try last name for tennis
    const lastA = teamA.split(" ").pop() ?? "";
    const lastB = teamB.split(" ").pop() ?? "";
    const byLastA = gameIdByTeam.get(normalize(lastA));
    if (byLastA) return byLastA;
    const byLastB = gameIdByTeam.get(normalize(lastB));
    if (byLastB) return byLastB;
    // Fallback to SR id
    return srId;
  }

  console.log("[sportradar] Starting Sportradar polling...");
  console.log(`[sportradar] Registered games for matching: ${registeredGames.length}`);
  console.log(`[sportradar] Trial key supports: tennis, soccer (NBA/MLB not included)\n`);

  const BASE_URLS: Record<string, string> = {
    tennis: `https://api.sportradar.com/tennis/trial/v3/en`,
    soccer: `https://api.sportradar.com/soccer/trial/v4/en`,
  };

  const disabledSports = new Set<string>();

  async function srFetch(url: string, sport: string): Promise<any | null> {
    if (disabledSports.has(sport)) return null;
    try {
      const res = await fetch(`${url}?api_key=${sportradarKey}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) {
          if (!disabledSports.has(sport)) {
            console.error(`[sportradar] ${sport}: ${res.status} — disabling this sport`);
            disabledSports.add(sport);
          }
        } else if (res.status === 429) {
          console.error(`[sportradar] Rate limited — backing off`);
        }
        return null;
      }
      return await res.json();
    } catch (err: any) {
      console.error(`[sportradar] ${sport} fetch error: ${err.message}`);
      return null;
    }
  }

  // ── Tennis: daily schedule + live match timelines ──
  async function pollTennis() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const schedule = await srFetch(`${BASE_URLS.tennis}/schedules/${today}/summaries.json`, "tennis");
    if (!schedule?.summaries) return;

    let matched = 0;
    for (const summary of schedule.summaries) {
      const match = summary.sport_event;
      const status = summary.sport_event_status;
      if (!match || !status) continue;

      const competitors = match.competitors ?? [];
      const teamA = competitors[0]?.name ?? "Player A";
      const teamB = competitors[1]?.name ?? "Player B";
      const gameId = resolveGameId(`sr-tennis-${match.id}`, teamA, teamB);
      const matchStatus = status.match_status ?? status.status;

      if (matchStatus === "live" || matchStatus === "in_progress") {
        matched++;
        const periodScores = status.period_scores ?? [];
        const setsA = periodScores.filter((p: any) =>
          p.home_score > p.away_score && p.type === "set").length;
        const setsB = periodScores.filter((p: any) =>
          p.away_score > p.home_score && p.type === "set").length;

        const currentSet = periodScores[periodScores.length - 1];

        await postEvent({
          marketId: gameId,
          eventType: "score_update",
          data: {
            scoreA: status.home_score ?? 0,
            scoreB: status.away_score ?? 0,
            period: `Set ${periodScores.length}`,
            setsA, setsB,
            gamesA: currentSet?.home_score ?? 0,
            gamesB: currentSet?.away_score ?? 0,
            teamA, teamB,
            source: "sportradar",
          },
        });

        if (status.home_score !== undefined) {
          const impliedProb = Math.max(0.05, Math.min(0.95, 0.5 + (setsA - setsB) * 0.15));
          await postEvent({
            marketId: gameId,
            eventType: "odds_update",
            data: { fairValue: impliedProb, source: "sportradar", teamA, teamB },
          });
        }
      } else if (matchStatus === "closed" || matchStatus === "ended") {
        await postEvent({
          marketId: gameId,
          eventType: "game_end",
          data: {
            teamAWins: (status.home_score ?? 0) > (status.away_score ?? 0),
            source: "sportradar",
          },
        });
      }
    }
    if (matched > 0) console.log(`[sportradar] Tennis: ${matched} live matches found`);
  }

  // ── Soccer: daily schedule + live timelines ──
  async function pollSoccer() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const schedule = await srFetch(
      `${BASE_URLS.soccer}/schedules/${today}/summaries.json`, "soccer"
    );
    if (!schedule?.summaries) return;

    let matched = 0;
    for (const summary of schedule.summaries) {
      const match = summary.sport_event;
      const status = summary.sport_event_status;
      if (!match || !status) continue;

      const competitors = match.competitors ?? [];
      const teamA = competitors.find((c: any) => c.qualifier === "home")?.name ?? "Home";
      const teamB = competitors.find((c: any) => c.qualifier === "away")?.name ?? "Away";
      const gameId = resolveGameId(`sr-soccer-${match.id}`, teamA, teamB);
      const matchStatus = status.match_status ?? status.status;

      if (matchStatus === "live" || matchStatus === "1st_half" ||
          matchStatus === "2nd_half" || matchStatus === "extra_time" ||
          matchStatus === "penalty") {
        matched++;
        await postEvent({
          marketId: gameId,
          eventType: "score_update",
          data: {
            scoreA: status.home_score ?? 0,
            scoreB: status.away_score ?? 0,
            minute: status.clock?.played ? Math.floor(parseInt(status.clock.played) / 60) : undefined,
            period: matchStatus === "1st_half" ? "1H" :
                    matchStatus === "2nd_half" ? "2H" :
                    matchStatus === "extra_time" ? "ET" :
                    matchStatus === "penalty" ? "PenaltyShootout" : matchStatus,
            teamA, teamB,
            source: "sportradar",
          },
        });
      } else if (matchStatus === "ended" || matchStatus === "closed") {
        await postEvent({
          marketId: gameId,
          eventType: "game_end",
          data: {
            teamAWins: (status.home_score ?? 0) > (status.away_score ?? 0),
            source: "sportradar",
          },
        });
      }
    }
    if (matched > 0) console.log(`[sportradar] Soccer: ${matched} live matches found`);
  }

  const pollAll = async () => {
    await pollTennis();
    await new Promise(r => setTimeout(r, 2000));
    await pollSoccer();
  };

  await pollAll();
  setInterval(pollAll, 20_000);
}

// ───────────────────── Polymarket Read-Only Source ─────────────────────

async function runPolymarket() {
  console.log("[polymarket] Starting Polymarket read-only feed...\n");

  const WS_URL = "wss://sports-api.polymarket.com/ws";
  const CLOB_URL = "https://clob.polymarket.com";
  const GAMMA_URL = "https://gamma-api.polymarket.com";

  // Connect to Sports WebSocket for live scores
  let ws: any;
  function connectWs() {
    try {
      const WebSocket = require("ws");
      ws = new WebSocket(WS_URL);

      ws.on("open", () => console.log("[polymarket] Sports WebSocket connected"));

      ws.on("message", async (raw: any) => {
        const msg = raw.toString();
        if (msg === "ping") { ws.send("pong"); return; }

        try {
          const data = JSON.parse(msg);
          if (!data.gameId) return;

          const slug = data.slug ?? "";
          const marketId = `pm-${data.leagueAbbreviation}-${data.gameId}`;

          if (data.status === "InProgress" || data.live) {
            const [scoreA, scoreB] = (data.score ?? "0-0").split("-").map(Number);
            await postEvent({
              marketId,
              eventType: "score_update",
              data: {
                scoreA: scoreA || 0,
                scoreB: scoreB || 0,
                period: data.period ?? "",
                clock: data.elapsed ?? "",
                teamA: data.homeTeam,
                teamB: data.awayTeam,
                source: "polymarket",
              },
            });
          }

          if (data.ended) {
            const [scoreA, scoreB] = (data.score ?? "0-0").split("-").map(Number);
            await postEvent({
              marketId,
              eventType: "game_end",
              data: {
                teamAWins: (scoreA || 0) > (scoreB || 0),
                source: "polymarket",
              },
            });
          }
        } catch { /* ignore parse errors */ }
      });

      ws.on("close", () => {
        console.log("[polymarket] WebSocket closed, reconnecting in 5s...");
        setTimeout(connectWs, 5000);
      });

      ws.on("error", (err: any) => {
        console.error(`[polymarket] WebSocket error: ${err.message}`);
      });
    } catch (err: any) {
      console.error(`[polymarket] WebSocket connect failed: ${err.message}`);
      setTimeout(connectWs, 10000);
    }
  }

  connectWs();

  // Poll CLOB for orderbook midpoints
  async function pollClobMidpoints() {
    const games = await fetchGameConfigs();
    for (const game of games) {
      if (!game.polymarketSlug) continue;

      try {
        const res = await fetch(`${GAMMA_URL}/markets?slug=${game.polymarketSlug}&closed=false`);
        if (!res.ok) continue;
        const markets = await res.json() as any[];
        if (markets.length === 0) continue;

        const market = markets[0];
        const clobTokenIds = market.clobTokenIds;
        if (!clobTokenIds || clobTokenIds.length === 0) continue;

        const midRes = await fetch(`${CLOB_URL}/midpoint?token_id=${clobTokenIds[0]}`);
        if (!midRes.ok) continue;
        const midData = await midRes.json() as any;
        const mid = parseFloat(midData.mid ?? "0.5");

        if (mid > 0 && mid < 1) {
          await postEvent({
            marketId: game.id,
            eventType: "odds_update",
            data: { fairValue: mid, source: "polymarket" },
          });
        }
      } catch { /* ignore per-market errors */ }
    }
  }

  setInterval(pollClobMidpoints, 10_000);
  setTimeout(pollClobMidpoints, 3000);
}

// ───────────────────── Polymarket Live Replay (WebSocket) ─────────────────────

async function runPolymarketLive() {
  console.log("[pm-live] Starting Polymarket LIVE WebSocket stream...\n");

  const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
  const GAMMA_URL = "https://gamma-api.polymarket.com";

  const games = await fetchGameConfigs();
  if (games.length === 0) {
    console.error("[pm-live] No games registered on sim server.");
    process.exit(1);
  }

  const gamesJsonPath = resolve(__dirname, "games.json");
  let gamesJsonData: any;
  try {
    const { readFileSync } = await import("fs");
    gamesJsonData = JSON.parse(readFileSync(gamesJsonPath, "utf-8"));
  } catch {
    console.error("[pm-live] Cannot read games.json");
    process.exit(1);
  }

  interface MarketState {
    gameId: string;
    tokenId: string;       // YES token
    tokenIdNo: string;     // NO token
    bestBid: number;
    bestAsk: number;
    lastMid: number | null;
    started: boolean;
    resolved: boolean;
    updateCount: number;
    fillCount: number;
    totalVolume: number;
  }

  const markets = new Map<string, MarketState>();
  const tokenToGame = new Map<string, string>();

  for (const gameJson of gamesJsonData.games) {
    let tokenIds: string[] = [];
    try {
      tokenIds = typeof gameJson.clobTokenIds === "string"
        ? JSON.parse(gameJson.clobTokenIds)
        : gameJson.clobTokenIds ?? [];
    } catch { continue; }

    if (tokenIds.length === 0) continue;

    const ms: MarketState = {
      gameId: gameJson.id,
      tokenId: tokenIds[0],
      tokenIdNo: tokenIds[1] ?? "",
      bestBid: 0,
      bestAsk: 1,
      lastMid: null,
      started: false,
      resolved: false,
      updateCount: 0,
      fillCount: 0,
      totalVolume: 0,
    };
    markets.set(gameJson.id, ms);
    tokenToGame.set(tokenIds[0], gameJson.id);
    if (tokenIds[1]) tokenToGame.set(tokenIds[1], gameJson.id);
  }

  console.log(`[pm-live] Tracking ${markets.size} markets via CLOB WebSocket:\n`);
  for (const [id, ms] of markets) {
    console.log(`  ${id} → token ${ms.tokenId.slice(0, 20)}...`);
  }
  console.log();

  // Detect live games using Gamma API gameStartTime (authoritative source)
  async function fetchGameStartTime(conditionId: string): Promise<number | null> {
    try {
      const res = await fetch(`${GAMMA_URL}/markets?condition_id=${conditionId}`);
      if (!res.ok) return null;
      const arr = await res.json() as any[];
      if (arr.length === 0) return null;
      const mkt = arr[0];
      const gst = mkt.gameStartTime || mkt.startDate;
      if (gst) return new Date(gst).getTime();
    } catch { /* ignore */ }
    return null;
  }

  for (const gameJson of gamesJsonData.games) {
    const ms = markets.get(gameJson.id);
    if (!ms) continue;
    const apiStart = await fetchGameStartTime(gameJson.conditionId);
    const startTime = apiStart ?? new Date(gameJson.startTime).getTime();
    const now = Date.now();
    if (now >= startTime) {
      await postEvent({ marketId: gameJson.id, eventType: "game_start", data: { quarter: "Live" } });
      ms.started = true;
      console.log(`[pm-live] ${gameJson.id}: LIVE (started ${((now - startTime) / 3600000).toFixed(1)}h ago)`);
    } else {
      console.log(`[pm-live] ${gameJson.id}: pre-market (starts in ${((startTime - now) / 3600000).toFixed(1)}h)`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // ─── Seed initial midpoints from REST API ───

  const CLOB_URL = "https://clob.polymarket.com";
  for (const [id, ms] of markets) {
    try {
      const res = await fetch(`${CLOB_URL}/midpoint?token_id=${ms.tokenId}`);
      if (res.ok) {
        const data = await res.json() as any;
        const mid = parseFloat(data.mid ?? "0");
        if (mid > 0.01 && mid < 0.99) {
          ms.lastMid = mid;
          ms.bestBid = mid - 0.01;
          ms.bestAsk = mid + 0.01;
          await postEvent({
            marketId: id,
            eventType: "odds_update",
            data: { fairValue: mid, source: "polymarket-rest", bestBid: ms.bestBid, bestAsk: ms.bestAsk },
          });
          console.log(`[pm-live] ${id}: seeded midpoint ${(mid * 100).toFixed(1)}%`);
        }
      }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log();

  // ─── WebSocket Connection ───

  const { default: WebSocket } = await import("ws");

  function connectWs() {
    const ws = new WebSocket(WS_URL);

    ws.on("open", () => {
      console.log(`[pm-live] WebSocket connected to CLOB`);

      const allTokens = [...tokenToGame.keys()];
      ws.send(JSON.stringify({
        assets_ids: allTokens,
        type: "market",
      }));
      console.log(`[pm-live] Subscribed to ${allTokens.length} assets across ${markets.size} markets\n`);
    });

    ws.on("message", async (raw: any) => {
      try {
        const data = JSON.parse(raw.toString());

        // Skip initial snapshot — we already seeded via REST
        if (Array.isArray(data)) return;

        // Incremental update: price_changes
        const changes = data.price_changes as Array<{
          asset_id: string;
          price: string;
          size: string;
          side: string;
          best_bid?: string;
          best_ask?: string;
        }> | undefined;

        if (!changes) return;

        for (const change of changes) {
          const gameId = tokenToGame.get(change.asset_id);
          if (!gameId) continue;
          const ms = markets.get(gameId);
          if (!ms || ms.resolved) continue;

          const isYesToken = change.asset_id === ms.tokenId;
          const price = parseFloat(change.price);
          const size = parseFloat(change.size);

          // Only update best bid/ask if the values are reasonable (not extreme 0.01/0.99)
          if (isYesToken) {
            if (change.best_bid) {
              const bb = parseFloat(change.best_bid);
              if (bb > 0.05 && bb < 0.95) ms.bestBid = bb;
            }
            if (change.best_ask) {
              const ba = parseFloat(change.best_ask);
              if (ba > 0.05 && ba < 0.95) ms.bestAsk = ba;
            }
          } else {
            if (change.best_bid) {
              const nb = parseFloat(change.best_bid);
              if (nb > 0.05 && nb < 0.95) ms.bestAsk = 1 - nb;
            }
            if (change.best_ask) {
              const na = parseFloat(change.best_ask);
              if (na > 0.05 && na < 0.95) ms.bestBid = 1 - na;
            }
          }

          // Compute midpoint — use best bid/ask if spread is tight, otherwise keep last mid
          let newMid = ms.lastMid ?? 0.5;
          const spread = ms.bestAsk - ms.bestBid;
          if (spread > 0 && spread < 0.20) {
            newMid = (ms.bestBid + ms.bestAsk) / 2;
          }

          // Detect fills: size → 0 at a meaningful price level
          if (size === 0 && price > 0.05 && price < 0.95) {
            const isBidSide = change.side === "BUY";
            const tradeSide = isBidSide ? "sell" : "buy";
            const effectivePrice = isYesToken ? price : 1 - price;
            await postEvent({
              marketId: gameId,
              eventType: "external_trade",
              data: { side: tradeSide, price: effectivePrice, size: 50, source: "polymarket-ws" },
            });
            ms.fillCount++;
            ms.totalVolume += 50;
          }

          ms.updateCount++;

          // Send fair value update if midpoint changed meaningfully
          if (newMid > 0.02 && newMid < 0.98 && ms.lastMid !== null) {
            const delta = Math.abs(newMid - ms.lastMid);
            if (delta > 0.001) {
              await postEvent({
                marketId: gameId,
                eventType: "odds_update",
                data: { fairValue: newMid, source: "polymarket-ws", bestBid: ms.bestBid, bestAsk: ms.bestAsk },
              });

              if (delta > 0.005) {
                console.log(
                  `  ${gameId}: ${(ms.lastMid * 100).toFixed(1)}% → ${(newMid * 100).toFixed(1)}% ` +
                  `(Δ${(delta * 100).toFixed(1)}¢) | updates: ${ms.updateCount} | fills: ${ms.fillCount}`
                );
              }
              ms.lastMid = newMid;
            }
          }
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("close", (code: number) => {
      console.log(`[pm-live] WebSocket closed (${code}) — reconnecting in 3s...`);
      setTimeout(connectWs, 3000);
    });

    ws.on("error", (err: any) => {
      console.error(`[pm-live] WebSocket error: ${err.message}`);
    });
  }

  connectWs();

  // ─── Resolution checker (still uses Gamma REST API) ───

  async function checkResolutions() {
    for (const [id, ms] of markets) {
      if (ms.resolved) continue;
      const game = gamesJsonData.games.find((g: any) => g.id === id);
      if (!game) continue;

      if (!ms.started) {
        const apiStart = await fetchGameStartTime(game.conditionId);
        const startTime = apiStart ?? new Date(game.startTime).getTime();
        if (Date.now() >= startTime) {
          console.log(`\n[pm-live] ${id}: game time reached — starting\n`);
          await postEvent({ marketId: id, eventType: "game_start", data: { quarter: "Live" } });
          ms.started = true;
        }
        continue;
      }

      if (!game.polymarketSlug) continue;
      const apiStart = await fetchGameStartTime(game.conditionId);
      const startTime = apiStart ?? new Date(game.startTime).getTime();
      if (Date.now() - startTime < 30 * 60 * 1000) continue;

      try {
        const res = await fetch(`${GAMMA_URL}/markets?slug=${game.polymarketSlug}`);
        if (!res.ok) continue;
        const arr = await res.json() as any[];
        if (arr.length === 0) continue;
        const mkt = arr[0];
        if (mkt.closed === true) {
          const prices = JSON.parse(mkt.outcomePrices ?? "[0.5, 0.5]");
          const outcome = parseFloat(prices[0]) > 0.5;
          console.log(`\n[pm-live] ${id} RESOLVED (outcome: ${outcome ? "YES" : "NO"})\n`);
          await postEvent({
            marketId: id,
            eventType: "game_end",
            data: { teamAWins: outcome, source: "polymarket-live" },
          });
          ms.resolved = true;
        }
      } catch { /* ignore */ }
    }
  }

  setInterval(checkResolutions, 30_000);
  setTimeout(checkResolutions, 10_000);

  // Heartbeat: re-send current midpoint every 15s even if unchanged.
  // Prevents the server's stale-FV detector from falsely widening/withdrawing
  // when the market is stable (halftime, timeout, quiet period).
  setInterval(async () => {
    for (const [id, ms] of markets) {
      if (ms.resolved || ms.lastMid === null) continue;
      await postEvent({
        marketId: id,
        eventType: "odds_update",
        data: { fairValue: ms.lastMid, source: "polymarket-heartbeat", bestBid: ms.bestBid, bestAsk: ms.bestAsk },
      });
    }
  }, 15_000);

  // Status summary every 30s
  setInterval(() => {
    const active = [...markets.values()].filter(m => !m.resolved);
    const totalUpdates = active.reduce((s, m) => s + m.updateCount, 0);
    const totalFills = active.reduce((s, m) => s + m.fillCount, 0);
    console.log(`[pm-live] ${active.length} active markets | ${totalUpdates} WS updates | ${totalFills} inferred fills`);
  }, 30_000);

  // ─── Sportradar Game-State Enrichment (timeouts, halftime, clock) ───
  // Runs alongside the CLOB WebSocket when a Sportradar API key is available.
  // The CLOB gives us prices; Sportradar gives us game state for spread adjustments.

  if (sportradarKey) {
    // Single-game focus: poll every 1s so we know about scores BEFORE TV-watching bettors
    const activeGames = gamesJsonData.games.filter((g: any) => {
      const ms = markets.get(g.id);
      return ms && !ms.resolved && g.sportradarEventId;
    });
    const SR_POLL_MS = activeGames.length <= 1 ? 1_000 : Math.max(1_200 * activeGames.length, 5_000);
    console.log(`[pm-live+sr] Sportradar enrichment enabled — ${activeGames.length} game(s), polling every ${SR_POLL_MS}ms`);

    const SR_NCAAB_BASE = "https://api.sportradar.com/ncaamb/trial/v8/en/games";
    const SR_NBA_BASE = "https://api.sportradar.com/nba/trial/v8/en/games";
    const srDisabled = new Set<string>();

    async function srFetchJson(url: string, label: string): Promise<any | null> {
      if (srDisabled.has(label)) return null;
      try {
        const fullUrl = `${url}${url.includes("?") ? "&" : "?"}api_key=${sportradarKey}`;
        const res = await fetch(fullUrl, { headers: { Accept: "application/json" } });
        if (!res.ok) {
          if (res.status === 403) {
            console.error(`[sr] ${label}: 403 — disabling`);
            srDisabled.add(label);
          } else if (res.status === 429) {
            // Rate limited — back off silently, will retry next poll
          }
          return null;
        }
        return await res.json();
      } catch (err: any) {
        console.error(`[sr] ${label}: ${err.message}`);
        return null;
      }
    }

    // Track last known scores + status to detect CHANGES (the whole point)
    const lastSrStatus = new Map<string, string>();
    const lastSrScores = new Map<string, string>();

    async function pollSportradarGameState() {
      // Only poll games that have a sportradarEventId — skip everything else to save rate budget
      for (const gameJson of activeGames) {
        const ms = markets.get(gameJson.id);
        if (!ms || ms.resolved || !ms.started) continue;

        const league = (gameJson.league ?? "").toUpperCase();
        const sport = (gameJson.sport ?? "").toLowerCase();
        if (sport !== "basketball") continue;

        const srId = gameJson.sportradarEventId;
        if (!srId) continue;

        const base = league === "NCAAB" ? SR_NCAAB_BASE : SR_NBA_BASE;
        const boxUrl = `${base}/${srId}/boxscore.json`;

        const box = await srFetchJson(boxUrl, `box-${gameJson.id}`);
        if (!box || box.message) continue;

        const homeScore = box.home?.points ?? 0;
        const awayScore = box.away?.points ?? 0;
        const status = box.status ?? "unknown";
        const half = box.half ?? box.quarter ?? 0;
        const clock = box.clock ?? "";

        const prevStatus = lastSrStatus.get(gameJson.id) ?? "";
        const scoreKey = `${awayScore}-${homeScore}`;
        const prevScoreKey = lastSrScores.get(gameJson.id) ?? "";
        const scoreChanged = prevScoreKey !== "" && prevScoreKey !== scoreKey;

        lastSrStatus.set(gameJson.id, status);
        lastSrScores.set(gameJson.id, scoreKey);

        const clockSeconds = parseClockToSeconds(clock);

        const isHalftime = status === "halftime";
        if (isHalftime && prevStatus !== "halftime") {
          console.log(`[sr] ${gameJson.id}: ⏸ HALFTIME detected`);
        }

        if (status === "closed" || status === "complete") {
          console.log(`[sr] ${gameJson.id}: 🏁 GAME ENDED — ${awayScore}-${homeScore}`);
          await postEvent({
            marketId: gameJson.id,
            eventType: "game_end",
            data: { teamAWins: awayScore > homeScore, source: "sportradar" },
          });
          continue;
        }

        if (scoreChanged) {
          // SCORE CHANGED — send urgent score_change event so server cancels stale orders IMMEDIATELY
          console.log(`[sr] ${gameJson.id}: ⚡ SCORE CHANGE ${prevScoreKey} → ${scoreKey} (${clock} ${half}H)`);
          await postEvent({
            marketId: gameJson.id,
            eventType: "score_change",
            data: {
              scoreA: awayScore,
              scoreB: homeScore,
              quarter: half,
              secondsRemaining: clockSeconds,
              clock,
              isHalftime: false,
              prevScore: prevScoreKey,
              newScore: scoreKey,
              source: "sportradar",
            },
          });
        } else if (status === "inprogress" || isHalftime) {
          // No score change — regular heartbeat update for clock/halftime/timeout tracking
          await postEvent({
            marketId: gameJson.id,
            eventType: "score_update",
            data: {
              scoreA: awayScore,
              scoreB: homeScore,
              quarter: half,
              secondsRemaining: clockSeconds,
              clock,
              isHalftime,
              source: "sportradar",
            },
          });
        }

        // PBP for timeout detection — only if we have headroom in rate limit
        if (activeGames.length <= 1 && status === "inprogress" && !scoreChanged) {
          const pbpUrl = `${base}/${srId}/pbp.json`;
          const pbp = await srFetchJson(pbpUrl, `pbp-${gameJson.id}`);
          if (pbp?.periods) {
            const currentPeriod = pbp.periods[pbp.periods.length - 1];
            const events = currentPeriod?.events ?? [];
            const recentEvents = events.slice(-5);
            const recentTimeout = recentEvents.find((e: any) =>
              e.type === "timeout" || e.event_type === "timeout" ||
              (e.description ?? "").toLowerCase().includes("timeout")
            );

            if (recentTimeout) {
              const timeoutClock = recentTimeout.clock ?? clock;
              const timeoutSecs = parseClockToSeconds(timeoutClock);
              if (Math.abs(clockSeconds - timeoutSecs) < 5) {
                console.log(`[sr] ${gameJson.id}: ⏱ TIMEOUT (${recentTimeout.description ?? "timeout"}) at ${timeoutClock}`);
                await postEvent({
                  marketId: gameJson.id,
                  eventType: "score_update",
                  data: {
                    scoreA: awayScore,
                    scoreB: homeScore,
                    quarter: half,
                    secondsRemaining: clockSeconds,
                    clock,
                    isTimeout: true,
                    source: "sportradar-pbp",
                  },
                });
              }
            }
          }
        }
      }
    }

    setTimeout(pollSportradarGameState, 2000);
    setInterval(pollSportradarGameState, SR_POLL_MS);
  } else {
    console.log(`[pm-live] ⚠ No SPORTRADAR_API_KEY — game state enrichment disabled`);
    console.log(`[pm-live] Set SPORTRADAR_API_KEY in sports-mm/.env for score-aware spread adjustments`);
  }
}

// ───────────────────── Helpers ─────────────────────

function parseClockToSeconds(clock: string): number {
  const parts = clock.split(":");
  if (parts.length === 2) {
    return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  }
  return parseFloat(clock) || 0;
}

// ───────────────────── Main ─────────────────────

async function main() {
  console.log(`\n=== SPORTS DATA BRIDGE ===`);
  console.log(`Source: ${source}`);
  console.log(`MM Server: ${SIM_SERVER_URL}\n`);

  try {
    const res = await fetch(`${SIM_SERVER_URL}/health`);
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      console.log(`[bridge] MM server status: ${data.mode} (${data.liveGames} live, ${data.resolvedGames} resolved)\n`);
    }
  } catch {
    console.error("[bridge] Cannot reach MM server. Start sports-sim-server.ts first.\n");
  }

  if (source === "all") {
    console.log("[bridge] Running all available sources concurrently...\n");
    const promises: Promise<void>[] = [runDemo()];
    if (oddsApiKey) promises.push(runOddsApi());
    if (sportradarKey) promises.push(runSportradar());
    promises.push(runEspn());
    promises.push(runPolymarket());
    await Promise.allSettled(promises);
    return;
  }

  switch (source) {
    case "demo": await runDemo(); break;
    case "espn": await runEspn(); break;
    case "odds-api": await runOddsApi(); break;
    case "betfair": await runBetfair(); break;
    case "sportradar": await runSportradar(); break;
    case "polymarket": await runPolymarket(); break;
    case "polymarket-live": await runPolymarketLive(); break;
    default:
      console.error(`Unknown source: ${source}. Use: demo, espn, odds-api, betfair, sportradar, polymarket, polymarket-live, all`);
      process.exit(1);
  }
}

main().catch(console.error);
