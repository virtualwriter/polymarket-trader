/**
 * Discover active sports markets on Polymarket and generate games.json
 * with real condition IDs, token IDs, and sport-specific risk configs.
 *
 * Usage:
 *   npx tsx scripts/discover-games.ts
 *   npx tsx scripts/discover-games.ts --sport tennis
 *   npx tsx scripts/discover-games.ts --output games-live.json
 *   npx tsx scripts/discover-games.ts --max-pages 5
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GAMMA_URL = "https://gamma-api.polymarket.com";

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

const sportFilter = getArg("sport");
const outputFile = getArg("output") ?? "games.json";
const maxPages = parseInt(getArg("max-pages") ?? "10");

interface DiscoveredGame {
  id: string;
  question: string;
  teamA: string;
  teamB: string;
  sport: string;
  league: string;
  startTime: string;
  initialProb: number;
  polymarketSlug: string;
  conditionId: string;
  clobTokenIds: string[];
  sportradarEventId: string;
  riskConfig: {
    baseHalfSpread: number;
    inventorySkewPerUnit: number;
    withdrawalWindowSeconds: number;
    positionCapUsdc: number;
  };
}

const SPORT_RISK_CONFIGS: Record<string, DiscoveredGame["riskConfig"]> = {
  tennis: {
    baseHalfSpread: 0.015,
    inventorySkewPerUnit: 0.015,
    withdrawalWindowSeconds: 30,
    positionCapUsdc: 3_000_000_000,
  },
  soccer: {
    baseHalfSpread: 0.02,
    inventorySkewPerUnit: 0.02,
    withdrawalWindowSeconds: 120,
    positionCapUsdc: 3_000_000_000,
  },
  baseball: {
    baseHalfSpread: 0.015,
    inventorySkewPerUnit: 0.01,
    withdrawalWindowSeconds: 60,
    positionCapUsdc: 5_000_000_000,
  },
  basketball: {
    baseHalfSpread: 0.01,
    inventorySkewPerUnit: 0.005,
    withdrawalWindowSeconds: 120,
    positionCapUsdc: 5_000_000_000,
  },
};

// Sports slug prefixes that Polymarket uses
const SPORTS_SLUG_PREFIXES = [
  "nba-", "nfl-", "mlb-", "nhl-", "atp-", "wta-",
  "ucl-", "epl-", "mls-", "ncaa-", "cbb-", "cfb-",
  "wnba-", "liga-", "ligue-", "serie-a-", "bundesliga-",
];

function isSportsMarket(market: any): boolean {
  const slug = (market.slug ?? "").toLowerCase();
  const q = (market.question ?? "").toLowerCase();

  // Fast check: slug prefix match
  if (SPORTS_SLUG_PREFIXES.some(p => slug.startsWith(p))) return true;

  // Keyword check in question
  const sportWords = [
    "nba", "nfl", "mlb", "nhl", "atp", "wta", "epl", "ucl",
    "suns", "bucks", "lakers", "celtics", "warriors", "nets",
    "yankees", "dodgers", "red sox", "mets", "cubs",
    "chiefs", "eagles", "cowboys", "bills",
    "tennis", "basketball", "baseball", "soccer", "football",
    "premier league", "champions league", "serie a",
    "total sets", "spread:", "moneyline", "o/u",
  ];
  return sportWords.some(w => slug.includes(w) || q.includes(w));
}

function detectSport(market: any): string {
  const slug = (market.slug ?? "").toLowerCase();
  const q = (market.question ?? "").toLowerCase();

  if (slug.startsWith("atp-") || slug.startsWith("wta-") || q.includes("total sets")) return "tennis";
  if (slug.startsWith("nba-") || slug.startsWith("wnba-") || slug.startsWith("cbb-")) return "basketball";
  if (slug.startsWith("mlb-")) return "baseball";
  if (slug.startsWith("nfl-") || slug.startsWith("cfb-")) return "football";
  if (slug.startsWith("nhl-")) return "hockey";
  if (slug.startsWith("ucl-") || slug.startsWith("epl-") || slug.startsWith("mls-") ||
      slug.startsWith("liga-") || slug.startsWith("ligue-") || slug.startsWith("serie-a-") ||
      slug.startsWith("bundesliga-")) return "soccer";

  if (q.includes("tennis") || q.includes("atp") || q.includes("wta")) return "tennis";
  if (q.includes("nba") || q.includes("basketball")) return "basketball";
  if (q.includes("mlb") || q.includes("baseball")) return "baseball";
  if (q.includes("soccer") || q.includes("premier league") || q.includes("champions league")) return "soccer";
  if (q.includes("nfl") || q.includes("nfl draft")) return "football";

  return "unknown";
}

function extractTeams(market: any): { teamA: string; teamB: string } {
  const q = (market.question ?? "") as string;

  // "Will X beat Y?" pattern
  const beatMatch = q.match(/Will (.+?) beat (.+?)\??$/i);
  if (beatMatch) return { teamA: beatMatch[1].trim(), teamB: beatMatch[2].trim() };

  // "Will X win..." pattern
  const winMatch = q.match(/Will (.+?) win/i);
  if (winMatch) return { teamA: winMatch[1].trim(), teamB: "Opponent" };

  // "X vs. Y: ..." pattern (Polymarket format)
  const vsMatch = q.match(/^(.+?)\s+vs\.?\s+(.+?):/i);
  if (vsMatch) return { teamA: vsMatch[1].trim(), teamB: vsMatch[2].trim() };

  // "X vs Y" generic
  const vsMatch2 = q.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch2) return { teamA: vsMatch2[1].trim(), teamB: vsMatch2[2].trim() };

  // Tennis: "Player A vs. Player B: total sets"
  const tennisMatch = q.match(/^(.+?)\s+vs\.?\s+(.+?):/i);
  if (tennisMatch) return { teamA: tennisMatch[1].trim(), teamB: tennisMatch[2].trim() };

  return { teamA: "Team A", teamB: "Team B" };
}

function detectLeague(sport: string, market: any): string {
  const slug = (market.slug ?? "").toLowerCase();

  if (sport === "tennis") {
    if (slug.startsWith("atp")) return "ATP";
    if (slug.startsWith("wta")) return "WTA";
    return "Tennis";
  }
  if (sport === "basketball") {
    if (slug.startsWith("nba")) return "NBA";
    if (slug.startsWith("wnba")) return "WNBA";
    if (slug.startsWith("cbb")) return "NCAAB";
    return "Basketball";
  }
  if (sport === "baseball") return "MLB";
  if (sport === "soccer") {
    if (slug.startsWith("epl")) return "EPL";
    if (slug.startsWith("ucl")) return "UCL";
    if (slug.startsWith("mls")) return "MLS";
    if (slug.startsWith("liga")) return "La Liga";
    if (slug.startsWith("bundesliga")) return "Bundesliga";
    if (slug.startsWith("serie-a")) return "Serie A";
    if (slug.startsWith("ligue")) return "Ligue 1";
    return "Soccer";
  }
  if (sport === "football") {
    if (slug.startsWith("nfl")) return "NFL";
    if (slug.startsWith("cfb")) return "NCAAF";
    return "Football";
  }
  return sport.toUpperCase();
}

async function discoverMarkets(): Promise<DiscoveredGame[]> {
  console.log("Fetching sports markets from Polymarket...\n");

  const games: DiscoveredGame[] = [];
  let offset = 0;
  const limit = 100;
  let page = 0;
  let totalScanned = 0;
  let totalSports = 0;

  while (page < maxPages) {
    page++;
    const url = `${GAMMA_URL}/markets?closed=false&limit=${limit}&offset=${offset}` +
      `&order=volume&ascending=false`;

    console.log(`  Page ${page}/${maxPages} (offset ${offset})...`);

    const res = await fetch(url);
    if (!res.ok) { console.error(`  Gamma API error: ${res.status}`); break; }

    const markets = await res.json() as any[];
    if (markets.length === 0) { console.log("  No more markets."); break; }
    totalScanned += markets.length;

    for (const market of markets) {
      if (!isSportsMarket(market)) continue;

      const sport = detectSport(market);
      if (sport === "unknown" || sport === "hockey") continue;
      if (sportFilter && sport !== sportFilter) continue;

      totalSports++;

      const { teamA, teamB } = extractTeams(market);
      const league = detectLeague(sport, market);
      const riskConfig = SPORT_RISK_CONFIGS[sport] ?? SPORT_RISK_CONFIGS.basketball;

      let initialProb = 0.5;
      if (market.outcomePrices) {
        try {
          const prices = JSON.parse(market.outcomePrices);
          initialProb = parseFloat(prices[0]) || 0.5;
        } catch { /* use default */ }
      }

      games.push({
        id: market.slug ?? `pm-${market.id}`,
        question: market.question,
        teamA,
        teamB,
        sport,
        league,
        startTime: market.startDate ?? market.createdAt ?? new Date().toISOString(),
        initialProb: Math.round(initialProb * 1000) / 1000,
        polymarketSlug: market.slug ?? "",
        conditionId: market.conditionId ?? "",
        clobTokenIds: market.clobTokenIds ?? [],
        sportradarEventId: "",
        riskConfig,
        volume: parseFloat(market.volume ?? "0"),
        liquidity: parseFloat(market.liquidity ?? market.liquidityNum ?? "0"),
      } as any);
    }

    console.log(`  Found ${totalSports} sports markets so far (${totalScanned} total scanned)`);

    if (markets.length < limit) break;
    offset += limit;
    await new Promise(r => setTimeout(r, 300));
  }

  return games;
}

/**
 * Select 2 games per sport: the highest-liquidity one + a random one.
 * This gives both the best-case scenario and a control sample per sport.
 */
function selectGames(games: DiscoveredGame[]): DiscoveredGame[] {
  const targetSports = ["tennis", "soccer", "baseball", "basketball"];
  const selected: DiscoveredGame[] = [];

  for (const sport of targetSports) {
    // Games are already sorted by volume descending (API order)
    const sportGames = games.filter(g => g.sport === sport);
    if (sportGames.length === 0) continue;

    // #1: highest liquidity (first in the list since API sorts by volume desc)
    const best = sportGames[0];
    selected.push(best);

    // #2: random pick from the rest
    if (sportGames.length > 1) {
      const rest = sportGames.slice(1);
      const randomIdx = Math.floor(Math.random() * rest.length);
      selected.push(rest[randomIdx]);
    }
  }

  return selected;
}

function stripInternalFields(game: DiscoveredGame): DiscoveredGame {
  const { volume, liquidity, ...clean } = game as any;
  return clean;
}

async function main() {
  const games = await discoverMarkets();

  console.log(`\nFound ${games.length} sports markets:\n`);

  const bySport: Record<string, DiscoveredGame[]> = {};
  for (const g of games) {
    if (!bySport[g.sport]) bySport[g.sport] = [];
    bySport[g.sport].push(g);
  }
  console.log(`By sport: ${Object.entries(bySport).map(([s, gs]) => `${s}: ${gs.length}`).join(", ") || "none found"}\n`);

  // Show all found per sport with volume
  for (const [sport, gs] of Object.entries(bySport)) {
    console.log(`  ${sport.toUpperCase()}:`);
    for (const g of gs.slice(0, 5)) {
      const vol = ((g as any).volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
      const liq = ((g as any).liquidity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
      console.log(`    $${vol.padStart(10)} vol | $${liq.padStart(8)} liq | ${g.teamA} vs ${g.teamB} (${g.league}) — ${(g.initialProb * 100).toFixed(0)}%`);
    }
    if (gs.length > 5) console.log(`    ... and ${gs.length - 5} more`);
  }

  // Select 2 per sport: highest liquidity + random
  const selected = selectGames(games);

  console.log(`\nSelected ${selected.length} games (2 per sport: best + random):\n`);
  for (const g of selected) {
    const vol = ((g as any).volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
    console.log(`  [${g.sport.padEnd(10)}] ${g.teamA} vs ${g.teamB} (${g.league}) — vol: $${vol}`);
  }

  const output = {
    games: selected.map(stripInternalFields),
    traders: [
      { name: "Sharp-Bettor-A",  bias: "yes", smartness: 9,  budget: 500,  aggression: 0.45 },
      { name: "Sharp-Bettor-B",  bias: "no",  smartness: 8,  budget: 400,  aggression: 0.4  },
      { name: "Model-Trader",    bias: "yes", smartness: 7,  budget: 300,  aggression: 0.35 },
      { name: "Semi-Pro-A",      bias: "no",  smartness: 5,  budget: 200,  aggression: 0.3  },
      { name: "Semi-Pro-B",      bias: "yes", smartness: 5,  budget: 150,  aggression: 0.3  },
      { name: "Retail-A",        bias: "no",  smartness: 3,  budget: 80,   aggression: 0.2  },
      { name: "Retail-B",        bias: "yes", smartness: 3,  budget: 60,   aggression: 0.2  },
      { name: "Degen-A",         bias: "no",  smartness: 1,  budget: 40,   aggression: 0.5  },
      { name: "Degen-B",         bias: "yes", smartness: 2,  budget: 35,   aggression: 0.4  },
      { name: "Whale-Sharp",     bias: "yes", smartness: 10, budget: 1000, aggression: 0.35 },
    ],
  };

  const outPath = resolve(__dirname, outputFile);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${selected.length} games to ${outPath}`);
}

main().catch(console.error);
