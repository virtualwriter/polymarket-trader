/**
 * Macro composite scoring.
 *
 * The composite drives MACRO_MOMENTUM_UP/DOWN, the only signals in the engine
 * that can take a trend-following view on BTC. It sat frozen at exactly 19 for
 * 400 consecutive hourly snapshots (2026-08-03 to 2026-08-21) while BTC rallied
 * 22%, because all three of its inputs had died in ways that each looked like a
 * valid reading:
 *
 *   - Iran resolved. Its nuclear-deal market settled YES at 1.00, so the score
 *     pinned at its 97 ceiling and stopped carrying information.
 *   - Fed clamped. The live input (P(>=1 cut) = 14.6%) produced a base of 11.6,
 *     then two penalties totalling -15 drove it negative and the clamp returned
 *     0. One of those penalties came from a stale market that no longer had an
 *     open September contract, so it applied unconditionally.
 *   - Oil read gold. The event lookup fell back to matching the title fragment
 *     "settle at in june", which names no asset, and gold's June settlement sat
 *     earlier in the fetch list — so oil scored off gold's resolved ladder.
 *
 * Two structural lessons are encoded here. A resolved market is not a neutral
 * reading, it is a constant, so it must be detected and dropped rather than
 * blended in. And a component that is dropped must have its weight
 * redistributed, because feeding a placeholder into a fixed-weight average
 * silently converts missing data into a confident opinion.
 */

/** One rung of a Polymarket strike ladder, as normalised by the scanner. */
export interface LadderQuote {
  strike?: number | null;
  price?: number | null;
  direction?: string | null;
  dir?: string | null;
  yesPrice?: number | null;
  yes?: number | null;
}

const RESOLVED_EPSILON = 1e-6;
/**
 * Above this, a barrier is treated as already touched rather than likely.
 *
 * Within-month touch ladders keep quoting barriers spot has already crossed,
 * pinned at 1.00. Those are facts about the past, and reading one as "certain
 * to happen" is what makes a ladder look maximally bullish forever.
 */
const TOUCHED_THRESHOLD = 0.999;

export function ladderStrike(quote: LadderQuote): number | null {
  const raw = quote.strike ?? quote.price;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function ladderYes(quote: LadderQuote): number | null {
  const raw = quote.yesPrice ?? quote.yes;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function ladderDirection(quote: LadderQuote): string {
  return String(quote.direction ?? quote.dir ?? "").toLowerCase();
}

/**
 * True when every quote has collapsed onto 0 or 1.
 *
 * This is the source-independent fingerprint of a settled market, and it is
 * cheaper and more reliable than trusting a `closed` flag that the scanner's
 * normalisation does not always carry through.
 */
export function isSettledLadder(quotes: LadderQuote[]): boolean {
  const prices = quotes.map(ladderYes).filter((p): p is number => p !== null);
  if (prices.length === 0) return true;
  return prices.every((p) => p <= RESOLVED_EPSILON || p >= 1 - RESOLVED_EPSILON);
}

/**
 * Probability of touching the nearest barrier on one side that spot has not
 * already crossed.
 *
 * "Nearest untouched" rather than the max or a fixed strike floor: the max over
 * a ladder always selects the most-certain rung, which is the least
 * informative one, and a hard-coded floor stops meaning anything once the
 * underlying moves away from the level it was written for.
 */
export function pTouchNearestUntouched(
  quotes: LadderQuote[],
  spot: number,
  side: "above" | "below",
): { probability: number; strike: number } | null {
  if (!Number.isFinite(spot) || spot <= 0) return null;
  const candidates = quotes
    .map((quote) => ({ strike: ladderStrike(quote), yes: ladderYes(quote), direction: ladderDirection(quote) }))
    .filter((q): q is { strike: number; yes: number; direction: string } =>
      q.strike !== null
      && q.yes !== null
      && q.direction === side
      && q.yes < TOUCHED_THRESHOLD
      && (side === "above" ? q.strike > spot : q.strike < spot));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
  return { probability: candidates[0].yes, strike: candidates[0].strike };
}

/**
 * Oil's contribution, 0-100, where 100 means oil is biased lower.
 *
 * Cheaper oil is risk-on, so the score rises as downside touch risk dominates
 * upside. Expressing it as a ratio of the two sides rather than an absolute
 * probability keeps it scale-free, which matters because the two barriers are
 * rarely exactly equidistant from spot.
 */
export function oilRiskOnScore(quotes: LadderQuote[], spot: number): number | null {
  if (isSettledLadder(quotes)) return null;
  const up = pTouchNearestUntouched(quotes, spot, "above");
  const down = pTouchNearestUntouched(quotes, spot, "below");
  if (!up || !down) return null;
  const total = up.probability + down.probability;
  if (total <= 0) return null;
  return clamp01to100((down.probability / total) * 100);
}

export interface FedScoreInputs {
  /** P(at least one cut), 0-1. */
  pAtLeastOneCut: number;
  /** P(cut by September), 0-1, or null when no open contract prices it. */
  pCutBySept: number | null;
  expectedCuts: number;
}

/**
 * The Fed's contribution, 0-100, where 100 means maximally dovish.
 *
 * Timing and depth apply as bounded multiplicative tilts rather than flat
 * point penalties. A fixed -15 is larger than the entire base whenever cut odds
 * are under 19%, so the old form clamped to zero and destroyed all sensitivity
 * across the range the market has actually occupied all year. A tilt can never
 * outrun the base, so the live probability always drives the output. An absent
 * timing market contributes no tilt at all, instead of being read as bad news.
 */
export function fedRiskOnScore(inputs: FedScoreInputs): number {
  const base = clamp01to100(inputs.pAtLeastOneCut * 100);
  let tilt = 1;
  if (inputs.pCutBySept !== null) {
    if (inputs.pCutBySept > 0.5) tilt *= 1.15;
    else if (inputs.pCutBySept < 0.3) tilt *= 0.85;
  }
  if (inputs.expectedCuts >= 2) tilt *= 1.15;
  else if (inputs.expectedCuts < 1) tilt *= 0.9;
  return clamp01to100(base * tilt);
}

/**
 * BTC-specific risk appetite, 0-100, from the outperformance markets.
 *
 * The composite previously contained no BTC input of any kind, which made
 * "macro says risk-on, therefore go long BTC" a claim about Fed policy and
 * Middle East geopolitics with nothing crypto in it. These markets price BTC
 * beating other assets outright, so they move with exactly the appetite the
 * signal is trying to trade.
 */
export function btcRiskOnScore(probabilitiesPct: Array<number | null>): number | null {
  const live = probabilitiesPct.filter((p): p is number => typeof p === "number" && Number.isFinite(p));
  if (live.length === 0) return null;
  return clamp01to100(live.reduce((a, b) => a + b, 0) / live.length);
}

export interface MacroComponent {
  name: string;
  /** 0-100, or null when the component has no live reading. */
  score: number | null;
  weight: number;
}

export interface MacroBlend {
  composite: number;
  label: string;
  /** Components that contributed, for the audit trail. */
  used: string[];
  /** Components dropped as resolved, missing or unreadable. */
  dropped: string[];
  /** Share of nominal weight that was live. Low values mean a thin composite. */
  coverage: number;
}

/**
 * Weighted blend over live components only, renormalised to what is available.
 *
 * Renormalising is the whole point: a dropped component must not contribute a
 * number, and it must not silently shrink the others toward zero either. When
 * nothing is live the composite is undefined rather than 0, since 0 reads as
 * "maximally bearish" and would be acted on.
 */
export function blendMacroComponents(components: MacroComponent[]): MacroBlend | null {
  const used = components.filter((c) => c.score !== null && c.weight > 0);
  const dropped = components.filter((c) => c.score === null || c.weight <= 0);
  const totalWeight = used.reduce((sum, c) => sum + c.weight, 0);
  const nominalWeight = components.reduce((sum, c) => sum + Math.max(c.weight, 0), 0);
  if (totalWeight <= 0) return null;

  const weighted = used.reduce((sum, c) => sum + (c.score as number) * c.weight, 0);
  const composite = Math.round(weighted / totalWeight);
  return {
    composite,
    label: macroLabel(composite),
    used: used.map((c) => c.name),
    dropped: dropped.map((c) => c.name),
    coverage: nominalWeight > 0 ? totalWeight / nominalWeight : 0,
  };
}

export function macroLabel(composite: number): string {
  if (composite >= 80) return "VERY BULLISH";
  if (composite >= 60) return "BULLISH";
  if (composite >= 45) return "NEUTRAL";
  if (composite >= 30) return "BEARISH";
  return "VERY BEARISH";
}

function clamp01to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
