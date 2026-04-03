/**
 * Multi-source market scanner for Gold, Bitcoin, HYPE, Amazon
 *
 * Data sources:
 *   1. Hyperliquid  — perps for BTC, HYPE, PURR (funding, OI, price, book)
 *   2. Polymarket   — prediction markets related to these assets
 *   3. CBOE         — delayed options chains for IBIT, GLD, AMZN
 *   4. Yahoo Finance — fallback options data
 *
 * Usage:  npx tsx scripts/market-scanner.ts [--json]
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface HLAssetCtx {
  coin: string;
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string | null;
  impactPxs: string[] | null;
}

interface HLBookLevel {
  px: string;
  sz: string;
  n: number;
}

interface HLBookResponse {
  coin: string;
  levels: [HLBookLevel[], HLBookLevel[]];
}

interface HLSpotToken {
  name: string;
  index: number;
  tokens: { name: string; szDecimals: number; weiDecimals: number; index: number }[];
}

interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  outcomePrices: string;
  outcomes: string;
  volume: string;
  liquidity: string;
  startDate: string;
  endDate: string;
  closed: boolean;
  active: boolean;
  bestBid: number;
  bestAsk: number;
  spread: number;
}

interface OptionQuote {
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: string;
  type: "call" | "put";
}

interface OptionsSnapshot {
  symbol: string;
  underlyingPrice: number;
  chains: OptionQuote[];
  source: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const HL_API = "https://api.hyperliquid.xyz/info";
const GAMMA_API = "https://gamma-api.polymarket.com";

const HL_PERP_COINS = ["BTC", "HYPE"];
const OPTIONS_SYMBOLS = ["IBIT", "GLD", "AMZN", "PURR", "CL"];

const POLYMARKET_EVENT_SLUGS = [
  "what-price-will-bitcoin-hit-before-2027",
  "what-price-will-hyperliquid-hit-before-2027",
  "what-will-gold-gc-hit-by-end-of-december",
  "cl-hit-jun-2026",
  "cl-over-under-jun-2026",
  "cl-settle-jun-2026",
];
const POLYMARKET_SEARCH_KEYWORDS = ["amazon stock", "AMZN"];

const JSON_OUTPUT = process.argv.includes("--json");

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson(url: string, body?: unknown): Promise<any> {
  const opts: RequestInit = {
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    opts.method = "POST";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return res.json();
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

function divider(title: string) {
  if (JSON_OUTPUT) return;
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(70)}`);
}

function warn(msg: string) {
  if (!JSON_OUTPUT) console.log(`  ⚠  ${msg}`);
}

// ─── 1. Hyperliquid ─────────────────────────────────────────────────────────

async function fetchHyperliquid() {
  divider("HYPERLIQUID — Perpetual Futures");

  const [metaAndCtx, spotMetaAndCtx] = await Promise.all([
    fetchJson(HL_API, { type: "metaAndAssetCtxs" }),
    fetchJson(HL_API, { type: "spotMetaAndAssetCtxs" }).catch(() => null),
  ]);

  const universe: { name: string; szDecimals: number }[] = metaAndCtx[0].universe;
  const assetCtxs: any[] = metaAndCtx[1];

  const results: Record<string, any> = {};

  for (const coin of HL_PERP_COINS) {
    const idx = universe.findIndex((u) => u.name === coin);
    if (idx === -1) {
      warn(`${coin} perp not found on Hyperliquid`);
      continue;
    }

    const ctx = assetCtxs[idx];
    const markPx = parseFloat(ctx.markPx);
    const oraclePx = parseFloat(ctx.oraclePx);
    const funding = parseFloat(ctx.funding);
    const openInterest = parseFloat(ctx.openInterest);
    const dayVol = parseFloat(ctx.dayNtlVlm);
    const premium = parseFloat(ctx.premium ?? "0");

    let book: HLBookResponse | null = null;
    try {
      book = await fetchJson(HL_API, { type: "l2Book", coin });
    } catch {}

    const bestBid = book ? parseFloat(book.levels[0][0]?.px ?? "0") : 0;
    const bestAsk = book ? parseFloat(book.levels[1][0]?.px ?? "0") : 0;
    const bidDepth5 = book
      ? book.levels[0].slice(0, 5).reduce((s, l) => s + parseFloat(l.sz) * parseFloat(l.px), 0)
      : 0;
    const askDepth5 = book
      ? book.levels[1].slice(0, 5).reduce((s, l) => s + parseFloat(l.sz) * parseFloat(l.px), 0)
      : 0;

    const annualizedFunding = funding * 24 * 365;

    results[coin] = {
      markPx,
      oraclePx,
      funding8h: funding,
      fundingAnnualized: annualizedFunding,
      premium,
      openInterest,
      openInterestUsd: openInterest * markPx,
      dayVolume: dayVol,
      bestBid,
      bestAsk,
      spread: bestAsk - bestBid,
      bidDepth5Usd: bidDepth5,
      askDepth5Usd: askDepth5,
    };

    if (!JSON_OUTPUT) {
      console.log(`\n  ┌─ ${coin}-PERP ─────────────────────────────────`);
      console.log(`  │  Mark Price:      $${fmt(markPx, coin === "BTC" ? 2 : 4)}`);
      console.log(`  │  Oracle Price:    $${fmt(oraclePx, coin === "BTC" ? 2 : 4)}`);
      console.log(`  │  Funding (8h):    ${pct(funding)}  (${annualizedFunding > 0 ? "longs pay" : "shorts pay"})`);
      console.log(`  │  Annualized:      ${pct(annualizedFunding)}`);
      console.log(`  │  Open Interest:   ${fmt(openInterest, 0)} contracts (${fmtUsd(openInterest * markPx)})`);
      console.log(`  │  24h Volume:      ${fmtUsd(dayVol)}`);
      console.log(`  │  Best Bid/Ask:    $${fmt(bestBid, 4)} / $${fmt(bestAsk, 4)}  (spread: $${fmt(bestAsk - bestBid, 4)})`);
      console.log(`  │  Book Depth (5):  Bids ${fmtUsd(bidDepth5)} | Asks ${fmtUsd(askDepth5)}`);
      console.log(`  └────────────────────────────────────────────`);
    }
  }

  // Spot data for HYPE if available
  if (spotMetaAndCtx) {
    const spotUniverse = spotMetaAndCtx[0].universe as HLSpotToken[];
    const spotCtxs = spotMetaAndCtx[1] as any[];
    const idx = spotUniverse.findIndex((u) => u.tokens.some((t) => t.name === "HYPE"));
    if (idx !== -1 && spotCtxs[idx]) {
      const ctx = spotCtxs[idx];
      const midPx = ctx.midPx ? parseFloat(ctx.midPx) : null;
      const dayVol = ctx.dayNtlVlm ? parseFloat(ctx.dayNtlVlm) : 0;
      if (midPx && !JSON_OUTPUT) {
        console.log(`\n  ┌─ HYPE SPOT ──────────────────────────────`);
        console.log(`  │  Mid Price:      $${fmt(midPx, 4)}`);
        console.log(`  │  24h Volume:     ${fmtUsd(dayVol)}`);
        console.log(`  └────────────────────────────────────────────`);
      }
      if (midPx) {
        results["HYPE_SPOT"] = { midPx, dayVolume: dayVol };
      }
    }
  }

  return results;
}

// ─── 2. Polymarket ──────────────────────────────────────────────────────────

interface PriceStrike {
  question: string;
  strike: number;
  direction: "above" | "below";
  yesPrice: number;
  volume: number;
}

interface PolymarketEvent {
  title: string;
  slug: string;
  strikes: PriceStrike[];
  totalVolume: number;
}

function parseStrike(question: string): { strike: number; direction: "above" | "below" } | null {
  // "reach $150,000" / "hit (HIGH) $6,000" / "settle over $90"
  const highMatch = question.match(/(?:reach|hit\s*\(HIGH\)|settle\s+over|settle\s+at\s*>\s*)\s*\$?([\d,]+)/i);
  // "dip to $55,000" / "hit (LOW) $40" / "settle under" / "below"
  const lowMatch = question.match(/(?:dip\s+to|hit\s*\(LOW\)|settle\s+under|below)\s*\$?([\d,]+)/i);
  // "settle at >$84"
  const settleAbove = question.match(/settle\s+at\s*>\s*\$?([\d,]+)/i);
  // "settle at $63-$70" (range bucket — use midpoint)
  const rangeMatch = question.match(/settle\s+at\s+\$?([\d,]+)\s*-\s*\$?([\d,]+)/i);
  // "settle at <$42" or "settle at >$84"
  const settleLt = question.match(/settle\s+at\s*<\s*\$?([\d,]+)/i);
  const settleGt = question.match(/settle\s+at\s*>\s*\$?([\d,]+)/i);

  if (highMatch) return { strike: parseFloat(highMatch[1].replace(/,/g, "")), direction: "above" };
  if (lowMatch) return { strike: parseFloat(lowMatch[1].replace(/,/g, "")), direction: "below" };
  if (settleAbove) return { strike: parseFloat(settleAbove[1].replace(/,/g, "")), direction: "above" };
  if (settleGt) return { strike: parseFloat(settleGt[1].replace(/,/g, "")), direction: "above" };
  if (settleLt) return { strike: parseFloat(settleLt[1].replace(/,/g, "")), direction: "below" };
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1].replace(/,/g, ""));
    const hi = parseFloat(rangeMatch[2].replace(/,/g, ""));
    return { strike: (lo + hi) / 2, direction: "above" };
  }

  // Generic fallback patterns
  const reachMatch = question.match(/reach\s+\$?([\d,]+)/i);
  const aboveMatch = question.match(/above\s+\$?([\d,]+)/i);
  const belowMatch = question.match(/below\s+\$?([\d,]+)/i);
  const dropMatch = question.match(/drop.*?\$?([\d,]+)/i);
  const overMatch = question.match(/over\s+\$?([\d,]+)/i);

  if (reachMatch) return { strike: parseFloat(reachMatch[1].replace(/,/g, "")), direction: "above" };
  if (aboveMatch) return { strike: parseFloat(aboveMatch[1].replace(/,/g, "")), direction: "above" };
  if (overMatch) return { strike: parseFloat(overMatch[1].replace(/,/g, "")), direction: "above" };
  if (belowMatch) return { strike: parseFloat(belowMatch[1].replace(/,/g, "")), direction: "below" };
  if (dropMatch) return { strike: parseFloat(dropMatch[1].replace(/,/g, "")), direction: "below" };
  return null;
}

async function fetchPolymarket() {
  divider("POLYMARKET — Prediction Markets");

  const events: PolymarketEvent[] = [];

  // Direct lookup of known event slugs first
  for (const slug of POLYMARKET_EVENT_SLUGS) {
    try {
      const url = `${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`;
      const data = await fetchJson(url);
      if (!Array.isArray(data)) continue;

      for (const event of data) {
        const title = event.title || "";
        const eSlug = event.slug || "";
        const markets = event.markets || [];
        const strikes: PriceStrike[] = [];
        let totalVolume = 0;

        for (const m of markets) {
          const parsed = parseStrike(m.question || "");
          if (!parsed) continue;
          let prices: number[] = [];
          try { prices = JSON.parse(m.outcomePrices || "[]").map(Number); } catch {}
          const vol = parseFloat(m.volume || "0");
          totalVolume += vol;
          strikes.push({
            question: m.question,
            strike: parsed.strike,
            direction: parsed.direction,
            yesPrice: prices[0] ?? 0,
            volume: vol,
          });
        }

        strikes.sort((a, b) => b.strike - a.strike);
        if (strikes.length > 0 && !events.find((e) => e.slug === eSlug)) {
          events.push({ title, slug: eSlug, strikes, totalVolume });
        }
      }
    } catch (e: any) {
      warn(`Polymarket slug lookup "${slug}" failed: ${e.message}`);
    }
  }

  // Also paginate to find keyword-matched events
  for (let offset = 0; offset <= 1000; offset += 100) {
    try {
      const url = `${GAMMA_API}/events?closed=false&limit=100&offset=${offset}`;
      const data = await fetchJson(url);
      if (!Array.isArray(data) || data.length === 0) break;

      for (const event of data) {
        const title = event.title || "";
        const slug = event.slug || "";

        const isTarget =
          POLYMARKET_EVENT_SLUGS.includes(slug) ||
          POLYMARKET_SEARCH_KEYWORDS.some((kw) => title.toLowerCase().includes(kw.toLowerCase()));

        if (!isTarget) continue;

        const markets = event.markets || [];
        const strikes: PriceStrike[] = [];
        let totalVolume = 0;

        for (const m of markets) {
          const parsed = parseStrike(m.question || "");
          if (!parsed) continue;

          let prices: number[] = [];
          try {
            prices = JSON.parse(m.outcomePrices || "[]").map(Number);
          } catch {}

          const vol = parseFloat(m.volume || "0");
          totalVolume += vol;

          strikes.push({
            question: m.question,
            strike: parsed.strike,
            direction: parsed.direction,
            yesPrice: prices[0] ?? 0,
            volume: vol,
          });
        }

        strikes.sort((a, b) => b.strike - a.strike);

        if (strikes.length > 0 && !events.find((e) => e.slug === slug)) {
          events.push({ title, slug, strikes, totalVolume });
        }
      }
    } catch (e: any) {
      warn(`Polymarket events fetch failed (offset ${offset}): ${e.message}`);
    }
  }

  if (!JSON_OUTPUT) {
    if (events.length === 0) {
      console.log("  No price prediction events found.");
    }
    for (const ev of events) {
      console.log(`\n  ┌─ ${ev.title}  (Total Vol: ${fmtUsd(ev.totalVolume)})`);
      console.log(`  │  https://polymarket.com/event/${ev.slug}`);
      console.log(`  │`);
      console.log(`  │  ${"Strike".padEnd(12)} ${"Dir".padEnd(7)} ${"YES".padStart(7)} ${"Implied".padStart(8)}  Distribution`);
      console.log(`  │  ${"─".repeat(60)}`);
      for (const s of ev.strikes) {
        const prob = s.yesPrice * 100;
        const bar = "█".repeat(Math.round(prob / 2));
        console.log(
          `  │  ${("$" + fmt(s.strike, 0)).padEnd(12)} ${s.direction.padEnd(7)} ${(s.yesPrice.toFixed(3)).padStart(7)} ${(prob.toFixed(1) + "%").padStart(8)}  ${bar}`
        );
      }
      console.log(`  └────────────────────────────────────────────`);
    }
  }

  return events;
}

// ─── 3. Options Data ────────────────────────────────────────────────────────

function parseCboeSymbol(sym: string): { expiration: string; type: "call" | "put"; strike: number } | null {
  // Format: AMZN260402C00125000 → AMZN, 26-04-02, Call, $125.00
  // The symbol is: ROOT + YYMMDD + C/P + 8-digit strike (strike * 1000)
  const match = sym.match(/^[A-Z]+(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const [, dateStr, cpFlag, strikeStr] = match;
  const yy = dateStr.slice(0, 2);
  const mm = dateStr.slice(2, 4);
  const dd = dateStr.slice(4, 6);
  return {
    expiration: `20${yy}-${mm}-${dd}`,
    type: cpFlag === "P" ? "put" : "call",
    strike: parseInt(strikeStr, 10) / 1000,
  };
}

async function fetchCboeOptions(symbol: string): Promise<OptionsSnapshot | null> {
  try {
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`;
    const data = await fetchJson(url);

    const underlying = data?.data?.current_price ?? data?.data?.close ?? 0;
    const options: any[] = data?.data?.options ?? [];

    const chains: OptionQuote[] = [];
    for (const opt of options) {
      const optSym: string = opt.option ?? "";
      const parsed = parseCboeSymbol(optSym);
      if (!parsed) continue;

      const bid = opt.bid ?? 0;
      const ask = opt.ask ?? 0;
      const vol = opt.volume ?? 0;
      const oi = opt.open_interest ?? 0;
      const iv = opt.iv ?? 0;

      chains.push({
        strike: parsed.strike,
        bid,
        ask,
        mid: (bid + ask) / 2,
        volume: vol,
        openInterest: oi,
        impliedVolatility: iv,
        expiration: parsed.expiration,
        type: parsed.type,
      });
    }

    return { symbol, underlyingPrice: underlying, chains, source: "CBOE delayed" };
  } catch {
    return null;
  }
}

async function fetchYahooOptions(symbol: string): Promise<OptionsSnapshot | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}`;
    const data = await fetchJson(url);

    const quote = data?.optionChain?.result?.[0]?.quote;
    const underlying = quote?.regularMarketPrice ?? 0;
    const opts = data?.optionChain?.result?.[0]?.options?.[0];

    const chains: OptionQuote[] = [];
    for (const type of ["calls", "puts"] as const) {
      const optType = type === "calls" ? "call" : "put";
      for (const o of opts?.[type] ?? []) {
        chains.push({
          strike: o.strike ?? 0,
          bid: o.bid ?? 0,
          ask: o.ask ?? 0,
          mid: ((o.bid ?? 0) + (o.ask ?? 0)) / 2,
          volume: o.volume ?? 0,
          openInterest: o.openInterest ?? 0,
          impliedVolatility: o.impliedVolatility ?? 0,
          expiration: o.expiration
            ? new Date(o.expiration * 1000).toISOString().slice(0, 10)
            : "",
          type: optType,
        });
      }
    }

    return { symbol, underlyingPrice: underlying, chains, source: "Yahoo Finance" };
  } catch {
    return null;
  }
}

async function fetchOptions() {
  divider("OPTIONS — IBIT / GLD / AMZN");

  const results: Record<string, OptionsSnapshot> = {};

  for (const symbol of OPTIONS_SYMBOLS) {
    let snapshot = await fetchCboeOptions(symbol);
    if (!snapshot || snapshot.chains.length === 0) {
      snapshot = await fetchYahooOptions(symbol);
    }

    if (!snapshot || snapshot.chains.length === 0) {
      warn(`No options data found for ${symbol} (CBOE + Yahoo both failed)`);
      continue;
    }

    results[symbol] = snapshot;

    if (!JSON_OUTPUT) {
      const calls = snapshot.chains.filter((c) => c.type === "call");
      const puts = snapshot.chains.filter((c) => c.type === "put");

      const nearestExp = [...new Set(snapshot.chains.map((c) => c.expiration))]
        .filter(Boolean)
        .sort()[0];
      const nearCalls = calls
        .filter((c) => c.expiration === nearestExp)
        .sort((a, b) => a.strike - b.strike);
      const nearPuts = puts
        .filter((c) => c.expiration === nearestExp)
        .sort((a, b) => a.strike - b.strike);

      const totalCallOI = calls.reduce((s, c) => s + c.openInterest, 0);
      const totalPutOI = puts.reduce((s, c) => s + c.openInterest, 0);
      const totalCallVol = calls.reduce((s, c) => s + c.volume, 0);
      const totalPutVol = puts.reduce((s, c) => s + c.volume, 0);
      const pcRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : 0;

      const atmCalls = nearCalls.filter(
        (c) => Math.abs(c.strike - snapshot!.underlyingPrice) / snapshot!.underlyingPrice < 0.05
      );
      const avgAtmIV =
        atmCalls.length > 0
          ? atmCalls.reduce((s, c) => s + c.impliedVolatility, 0) / atmCalls.length
          : 0;

      console.log(`\n  ┌─ ${symbol} OPTIONS (${snapshot.source}) ──────────────`);
      console.log(`  │  Underlying:     $${fmt(snapshot.underlyingPrice)}`);
      console.log(`  │  Nearest Exp:    ${nearestExp || "N/A"}`);
      console.log(`  │  Total Chains:   ${snapshot.chains.length} (${calls.length} calls, ${puts.length} puts)`);
      console.log(`  │  Call OI / Vol:  ${fmt(totalCallOI, 0)} / ${fmt(totalCallVol, 0)}`);
      console.log(`  │  Put  OI / Vol:  ${fmt(totalPutOI, 0)} / ${fmt(totalPutVol, 0)}`);
      console.log(`  │  Put/Call Ratio: ${fmt(pcRatio, 3)}`);
      if (avgAtmIV > 0) {
        console.log(`  │  ATM IV (avg):   ${(avgAtmIV * 100).toFixed(1)}%`);
      }

      // Show nearest-expiry ATM strikes
      const atm = snapshot.underlyingPrice;
      const nearby = nearCalls
        .filter((c) => c.strike >= atm * 0.9 && c.strike <= atm * 1.1)
        .slice(0, 8);
      if (nearby.length > 0) {
        console.log(`  │`);
        console.log(`  │  Near-ATM Calls (${nearestExp}):`);
        console.log(`  │  ${"Strike".padEnd(10)} ${"Bid".padStart(8)} ${"Ask".padStart(8)} ${"IV".padStart(8)} ${"OI".padStart(10)}`);
        for (const c of nearby) {
          const marker = Math.abs(c.strike - atm) / atm < 0.01 ? " ◄ ATM" : "";
          console.log(
            `  │  ${("$" + fmt(c.strike)).padEnd(10)} ${("$" + fmt(c.bid)).padStart(8)} ${("$" + fmt(c.ask)).padStart(8)} ${c.impliedVolatility > 0 ? (c.impliedVolatility * 100).toFixed(1) + "%" : "N/A".padStart(4)}${fmt(c.openInterest, 0).padStart(10)}${marker}`
          );
        }
      }

      // Max pain calculation
      const allStrikes = [...new Set(snapshot.chains.filter(c => c.expiration === nearestExp).map((c) => c.strike))].sort(
        (a, b) => a - b
      );
      let maxPainStrike = 0;
      let minPain = Infinity;
      for (const testStrike of allStrikes) {
        let pain = 0;
        for (const c of nearCalls.filter((c) => c.expiration === nearestExp)) {
          if (testStrike > c.strike) pain += (testStrike - c.strike) * c.openInterest;
        }
        for (const p of nearPuts.filter((c) => c.expiration === nearestExp)) {
          if (testStrike < p.strike) pain += (p.strike - testStrike) * p.openInterest;
        }
        if (pain < minPain) {
          minPain = pain;
          maxPainStrike = testStrike;
        }
      }
      if (maxPainStrike > 0) {
        console.log(`  │`);
        console.log(`  │  Max Pain:       $${fmt(maxPainStrike)}  (${((maxPainStrike / atm - 1) * 100).toFixed(1)}% from spot)`);
      }

      console.log(`  └────────────────────────────────────────────`);
    }
  }

  return results;
}

// ─── 4. Cross-Source Analysis ───────────────────────────────────────────────

function crossAnalysis(
  hl: Record<string, any>,
  pm: PolymarketEvent[],
  opts: Record<string, OptionsSnapshot>
) {
  divider("CROSS-SOURCE SIGNALS");

  const btcEvent = pm.find((e) => e.slug.includes("bitcoin"));
  const hypeEvent = pm.find((e) => e.slug.includes("hyperliquid"));

  // BTC: HL funding + IBIT options IV + Polymarket implied distribution
  if (hl.BTC) {
    const funding = hl.BTC.fundingAnnualized;
    const btcSpot = hl.BTC.markPx;

    const ibitAtmIV =
      opts.IBIT?.chains
        .filter(
          (c) =>
            c.type === "call" &&
            Math.abs(c.strike - opts.IBIT!.underlyingPrice) / opts.IBIT!.underlyingPrice < 0.05 &&
            c.impliedVolatility > 0
        )
        .reduce((s, c, _, a) => s + c.impliedVolatility / a.length, 0) ?? 0;

    if (!JSON_OUTPUT) {
      console.log(`\n  ┌─ BITCOIN Cross-Source ────────────────────────`);
      console.log(`  │  HL BTC Spot:       $${fmt(btcSpot)}`);
      console.log(`  │  HL Funding (ann):  ${pct(funding)}  ${funding > 0.15 ? "← HIGH (longs crowded)" : funding < -0.05 ? "← NEGATIVE (shorts crowded)" : "← neutral"}`);
      console.log(`  │  HL 24h Volume:     ${fmtUsd(hl.BTC.dayVolume)}`);
      console.log(`  │  HL OI:             ${fmtUsd(hl.BTC.openInterestUsd)}`);
      if (opts.IBIT) {
        console.log(`  │  IBIT Spot:         $${fmt(opts.IBIT.underlyingPrice)}`);
        if (ibitAtmIV > 0) {
          console.log(`  │  IBIT ATM IV:       ${(ibitAtmIV * 100).toFixed(1)}%  ${ibitAtmIV > 0.6 ? "← HIGH, pricing big move" : ibitAtmIV < 0.3 ? "← LOW, market complacent" : ""}`);
        }
      }
      if (btcEvent) {
        const nearStrikes = btcEvent.strikes
          .filter((s) => s.strike >= btcSpot * 0.8 && s.strike <= btcSpot * 3)
          .slice(0, 6);
        if (nearStrikes.length > 0) {
          console.log(`  │`);
          console.log(`  │  Polymarket implied distribution (2026):`);
          for (const s of nearStrikes) {
            const prob = s.yesPrice * 100;
            console.log(
              `  │    BTC ${s.direction === "above" ? ">" : "<"} $${fmt(s.strike, 0).padEnd(8)} ${prob.toFixed(1).padStart(5)}% YES  ${"█".repeat(Math.round(prob / 2))}`
            );
          }
        }
      }

      // Signal synthesis
      console.log(`  │`);
      if (funding > 0.15 && ibitAtmIV > 0.5) {
        console.log(`  │  SIGNAL: High funding + high IV = crowded longs priced into options`);
        console.log(`  │          Polymarket upside tails may be OVERPRICED`);
      } else if (funding < -0.05 && ibitAtmIV < 0.35) {
        console.log(`  │  SIGNAL: Negative funding + low IV = complacent + shorts crowded`);
        console.log(`  │          Polymarket upside tails may be UNDERPRICED`);
      } else {
        console.log(`  │  SIGNAL: No strong cross-source divergence`);
      }
      console.log(`  └────────────────────────────────────────────`);
    }
  }

  // HYPE: HL funding/OI + Polymarket price distribution
  if (hl.HYPE) {
    const funding = hl.HYPE.fundingAnnualized;
    const hypeSpot = hl.HYPE.markPx;

    if (!JSON_OUTPUT) {
      console.log(`\n  ┌─ HYPE Cross-Source ──────────────────────────`);
      console.log(`  │  HL HYPE Spot:      $${fmt(hypeSpot, 4)}`);
      console.log(`  │  HL Funding (ann):  ${pct(funding)}  ${funding > 0.3 ? "← HIGH (longs crowded)" : funding < -0.1 ? "← NEGATIVE (shorts crowded)" : "← neutral"}`);
      console.log(`  │  HL OI:             ${fmtUsd(hl.HYPE.openInterestUsd)}`);
      console.log(`  │  HL 24h Volume:     ${fmtUsd(hl.HYPE.dayVolume)}`);

      if (hypeEvent) {
        console.log(`  │`);
        console.log(`  │  Polymarket implied distribution (2026):`);
        for (const s of hypeEvent.strikes) {
          const prob = s.yesPrice * 100;
          console.log(
            `  │    HYPE ${s.direction === "above" ? ">" : "<"} $${fmt(s.strike, 0).padEnd(5)} ${prob.toFixed(1).padStart(5)}% YES  ${"█".repeat(Math.round(prob / 2))}`
          );
        }

        // Compare HL spot to Polymarket distribution
        const aboveSpot = hypeEvent.strikes.filter(
          (s) => s.direction === "above" && s.strike > hypeSpot
        );
        const nearestAbove = aboveSpot[aboveSpot.length - 1];
        if (nearestAbove) {
          console.log(`  │`);
          console.log(
            `  │  Nearest above-spot strike: $${fmt(nearestAbove.strike, 0)} → ${(nearestAbove.yesPrice * 100).toFixed(1)}% YES`
          );
          if (funding > 0.3 && nearestAbove.yesPrice > 0.5) {
            console.log(`  │  SIGNAL: High funding + high Polymarket prob → crowded trade, fade upside`);
          } else if (funding < -0.1 && nearestAbove.yesPrice < 0.3) {
            console.log(`  │  SIGNAL: Negative funding + low Polymarket prob → contrarian buy on upside tails`);
          }
        }
      }
      console.log(`  └────────────────────────────────────────────`);
    }
  }

  // Gold: GLD options + Polymarket GC strikes
  const goldEvent = pm.find((e) => e.slug.includes("gold-gc"));
  if (opts.GLD || goldEvent) {
    const nearest = opts.GLD
      ? [...new Set(opts.GLD.chains.map((c) => c.expiration))].filter(Boolean).sort()[0]
      : "";
    const nearChains = opts.GLD
      ? opts.GLD.chains.filter((c) => c.expiration === nearest)
      : [];
    const putVol = nearChains.filter((c) => c.type === "put").reduce((s, c) => s + c.volume, 0);
    const callVol = nearChains.filter((c) => c.type === "call").reduce((s, c) => s + c.volume, 0);
    const pcRatio = callVol > 0 ? putVol / callVol : 0;

    const atmCalls = nearChains.filter(
      (c) =>
        c.type === "call" &&
        Math.abs(c.strike - (opts.GLD?.underlyingPrice ?? 0)) / (opts.GLD?.underlyingPrice ?? 1) < 0.03 &&
        c.impliedVolatility > 0
    );
    const atmIV = atmCalls.length > 0
      ? atmCalls.reduce((s, c) => s + c.impliedVolatility, 0) / atmCalls.length
      : 0;

    if (!JSON_OUTPUT) {
      console.log(`\n  ┌─ GOLD Cross-Source ───────────────────────────`);
      if (opts.GLD) {
        console.log(`  │  GLD ETF Spot:     $${fmt(opts.GLD.underlyingPrice)}`);
        console.log(`  │  Nearest Exp:      ${nearest}`);
        console.log(`  │  Put/Call Ratio:   ${fmt(pcRatio, 3)}  ${pcRatio > 1.5 ? "← heavy put buying (fear/hedge)" : pcRatio < 0.5 ? "← call-heavy (bullish)" : "← balanced"}`);
        if (atmIV > 0) {
          console.log(`  │  ATM IV:           ${(atmIV * 100).toFixed(1)}%`);
        }
      }
      if (goldEvent) {
        console.log(`  │`);
        console.log(`  │  Polymarket Gold (GC) strikes (Dec 2026):`);
        for (const s of goldEvent.strikes) {
          const prob = s.yesPrice * 100;
          console.log(
            `  │    GC ${s.direction === "above" ? ">" : "<"} $${fmt(s.strike, 0).padEnd(8)} ${prob.toFixed(1).padStart(5)}% YES  ${"█".repeat(Math.round(prob / 2))}`
          );
        }
      }
      console.log(`  └────────────────────────────────────────────`);
    }
  }

  // Amazon: AMZN options
  if (opts.AMZN) {
    const nearest = [...new Set(opts.AMZN.chains.map((c) => c.expiration))].filter(Boolean).sort()[0];
    const nearChains = opts.AMZN.chains.filter((c) => c.expiration === nearest);
    const putVol = nearChains.filter((c) => c.type === "put").reduce((s, c) => s + c.volume, 0);
    const callVol = nearChains.filter((c) => c.type === "call").reduce((s, c) => s + c.volume, 0);
    const pcRatio = callVol > 0 ? putVol / callVol : 0;

    const atmCalls = nearChains.filter(
      (c) =>
        c.type === "call" &&
        Math.abs(c.strike - opts.AMZN.underlyingPrice) / opts.AMZN.underlyingPrice < 0.03 &&
        c.impliedVolatility > 0
    );
    const atmIV = atmCalls.length > 0
      ? atmCalls.reduce((s, c) => s + c.impliedVolatility, 0) / atmCalls.length
      : 0;

    if (!JSON_OUTPUT) {
      console.log(`\n  ┌─ AMAZON / AMZN Cross-Source ─────────────────`);
      console.log(`  │  AMZN Spot:        $${fmt(opts.AMZN.underlyingPrice)}`);
      console.log(`  │  Nearest Exp:      ${nearest}`);
      console.log(`  │  Put/Call Ratio:   ${fmt(pcRatio, 3)}  ${pcRatio > 1.5 ? "← heavy put buying" : pcRatio < 0.5 ? "← call-heavy" : "← balanced"}`);
      if (atmIV > 0) {
        console.log(`  │  ATM IV:           ${(atmIV * 100).toFixed(1)}%`);
      }
      console.log(`  └────────────────────────────────────────────`);
    }
  }

  // PURR stock options
  if (opts.PURR) {
    const nearest = [...new Set(opts.PURR.chains.map((c) => c.expiration))].filter(Boolean).sort()[0];
    const nearChains = opts.PURR.chains.filter((c) => c.expiration === nearest);
    const putVol = nearChains.filter((c) => c.type === "put").reduce((s, c) => s + c.volume, 0);
    const callVol = nearChains.filter((c) => c.type === "call").reduce((s, c) => s + c.volume, 0);
    const pcRatio = callVol > 0 ? putVol / callVol : 0;

    const atmCalls = nearChains.filter(
      (c) =>
        c.type === "call" &&
        Math.abs(c.strike - opts.PURR.underlyingPrice) / opts.PURR.underlyingPrice < 0.1 &&
        c.impliedVolatility > 0
    );
    const atmIV = atmCalls.length > 0
      ? atmCalls.reduce((s, c) => s + c.impliedVolatility, 0) / atmCalls.length
      : 0;

    if (!JSON_OUTPUT) {
      console.log(`\n  ┌─ PURR Stock Options ──────────────────────────`);
      console.log(`  │  PURR Spot:        $${fmt(opts.PURR.underlyingPrice)}`);
      console.log(`  │  Nearest Exp:      ${nearest}`);
      console.log(`  │  Total Chains:     ${opts.PURR.chains.length}`);
      console.log(`  │  Put/Call Ratio:   ${fmt(pcRatio, 3)}  ${pcRatio > 1.5 ? "← heavy put buying" : pcRatio < 0.5 ? "← call-heavy" : "← balanced"}`);
      if (atmIV > 0) {
        console.log(`  │  ATM IV:           ${(atmIV * 100).toFixed(1)}%`);
      }
      console.log(`  └────────────────────────────────────────────`);
    }
  }

  // Oil / WTI Crude (CL) + Polymarket CL strikes
  const clEvents = pm.filter((e) => e.slug.includes("cl-"));
  if (opts.CL || clEvents.length > 0) {
    const nearest = [...new Set(opts.CL.chains.map((c) => c.expiration))].filter(Boolean).sort()[0];
    const nearChains = opts.CL.chains.filter((c) => c.expiration === nearest);
    const putVol = nearChains.filter((c) => c.type === "put").reduce((s, c) => s + c.volume, 0);
    const callVol = nearChains.filter((c) => c.type === "call").reduce((s, c) => s + c.volume, 0);
    const pcRatio = callVol > 0 ? putVol / callVol : 0;

    const atmCalls = nearChains.filter(
      (c) =>
        c.type === "call" &&
        Math.abs(c.strike - opts.CL.underlyingPrice) / opts.CL.underlyingPrice < 0.05 &&
        c.impliedVolatility > 0
    );
    const atmIV = atmCalls.length > 0
      ? atmCalls.reduce((s, c) => s + c.impliedVolatility, 0) / atmCalls.length
      : 0;

    if (!JSON_OUTPUT) {
      console.log(`\n  ┌─ OIL / WTI Crude (CL) Cross-Source ─────────`);
      if (opts.CL) {
        console.log(`  │  WTI Spot:         $${fmt(opts.CL.underlyingPrice)}`);
        console.log(`  │  Nearest Exp:      ${nearest}`);
        console.log(`  │  Total Chains:     ${opts.CL.chains.length}`);
        console.log(`  │  Put/Call Ratio:   ${fmt(pcRatio, 3)}  ${pcRatio > 1.5 ? "← heavy put buying (bearish/hedge)" : pcRatio < 0.5 ? "← call-heavy (bullish)" : "← balanced"}`);
        if (atmIV > 0) {
          console.log(`  │  ATM IV:           ${(atmIV * 100).toFixed(1)}%`);
        }

        const atm = opts.CL.underlyingPrice;
        const nearbyCalls = nearChains
          .filter((c) => c.type === "call" && c.strike >= atm * 0.95 && c.strike <= atm * 1.1)
          .sort((a, b) => a.strike - b.strike)
          .slice(0, 6);
        if (nearbyCalls.length > 0) {
          console.log(`  │`);
          console.log(`  │  Near-ATM Calls (${nearest}):`);
          console.log(`  │  ${"Strike".padEnd(10)} ${"Bid".padStart(8)} ${"Ask".padStart(8)} ${"IV".padStart(8)} ${"OI".padStart(10)}`);
          for (const c of nearbyCalls) {
            const marker = Math.abs(c.strike - atm) / atm < 0.01 ? " << ATM" : "";
            console.log(
              `  │  ${("$" + fmt(c.strike)).padEnd(10)} ${("$" + fmt(c.bid)).padStart(8)} ${("$" + fmt(c.ask)).padStart(8)} ${c.impliedVolatility > 0 ? (c.impliedVolatility * 100).toFixed(1) + "%" : "N/A".padStart(4)}${fmt(c.openInterest, 0).padStart(10)}${marker}`
            );
          }
        }
      }

      if (clEvents.length > 0) {
        for (const ev of clEvents) {
          const liveStrikes = ev.strikes.filter((s) => s.yesPrice > 0 && s.yesPrice < 1);
          if (liveStrikes.length === 0) continue;
          console.log(`  │`);
          console.log(`  │  Polymarket: ${ev.title}`);
          for (const s of liveStrikes.slice(0, 12)) {
            const prob = s.yesPrice * 100;
            console.log(
              `  │    CL ${s.direction === "above" ? ">" : "<"} $${fmt(s.strike, 0).padEnd(5)} ${prob.toFixed(1).padStart(5)}% YES  ${"█".repeat(Math.round(prob / 2))}`
            );
          }
        }
      }
      console.log(`  └────────────────────────────────────────────`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!JSON_OUTPUT) {
    console.log(`\n  Market Scanner — ${new Date().toISOString()}`);
    console.log(`  Assets: Bitcoin, HYPE, Gold, Amazon, PURR, Oil/WTI`);
    console.log(`  Sources: Hyperliquid, Polymarket, CBOE Options`);
  }

  const [hl, pm, opts] = await Promise.all([
    fetchHyperliquid().catch((e) => {
      warn(`Hyperliquid failed: ${e.message}`);
      return {} as Record<string, any>;
    }),
    fetchPolymarket().catch((e) => {
      warn(`Polymarket failed: ${e.message}`);
      return [] as any[];
    }),
    fetchOptions().catch((e) => {
      warn(`Options failed: ${e.message}`);
      return {} as Record<string, OptionsSnapshot>;
    }),
  ]);

  crossAnalysis(hl, pm, opts);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ hyperliquid: hl, polymarket: pm, options: opts }, null, 2));
  }

  if (!JSON_OUTPUT) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`  Scan complete. Run with --json for machine-readable output.`);
    console.log(`${"─".repeat(70)}\n`);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
