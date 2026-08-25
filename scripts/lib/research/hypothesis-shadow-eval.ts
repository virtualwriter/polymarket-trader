import { slugifySetupId } from "../trading/setup-family.js";
import { binomialPValue, oneSidedTPValue, sampleMoments } from "./alpha-stats.js";
import {
  DERIVED_KEY_PATTERN,
  MARKET_ROW_CONDITION_KEYS,
  METADATA_CONDITION_KEYS,
  PM_CONTRACT_PRICING_KEYS,
  RELATIVE_VALUE_AGG_PATTERN,
} from "./condition-catalog.js";

export interface HypothesisTest {
  date: string;
  triggered: boolean;
  outcome: "win" | "loss" | "pending";
  actualMove: string;
  excludedFromSetupStats?: boolean;
  exclusionReason?: string;
  /** Signed realized edge (see HypothesisEvalResult.magnitude). Absent on tests
   * resolved before magnitude recording shipped. */
  magnitude?: number;
  magnitudeUnit?: MagnitudeUnit;
  /** The contract a Polymarket thesis entered, recorded at open so the trade
   * can be marked on its own instrument when the horizon comes due. */
  contractEntry?: ContractEntryStamp;
}

export interface Hypothesis {
  id: string;
  setupId?: string;
  setupLabel?: string;
  created: string;
  description: string;
  conditions: Record<string, string>;
  prediction: string;
  timeframeDays: number;
  confidence: number;
  direction?: "long" | "short" | "neutral";
  originFindingId?: string;
  /** Lineage: id of the failing hypothesis this one refines (mechanism change
   * grounded in the parent family's diagnosed failure). */
  refinesHypothesisId?: string;
  themeId?: string;
  tests: HypothesisTest[];
  winRate: number;
  status: "active" | "promoted" | "archived" | "killed";
  promotedToSignal: boolean;
  postMortem: string | null;
  source: "llm" | "statistical" | "shadow_mined" | "informed_flow_study_v1";
}

export interface HypothesisSetupFamily {
  setupId: string;
  setupLabel: string;
  hypotheses: Hypothesis[];
  completed: HypothesisTest[];
  pending: HypothesisTest[];
  wins: number;
  losses: number;
  winRate: number;
  primary: Hypothesis;
}

export interface SnapshotRow {
  date: string;
  [key: string]: string | number;
}

export interface RelativeValueObservation {
  timestamp: string;
  modelVersion: string;
  asset: string;
  eventSlug: string;
  marketId: string;
  question: string;
  contractMonth: string;
  direction: "above" | "below";
  strike: number;
  expiry: string;
  pmYes: number | null;
  pmBid: number | null;
  pmAsk: number | null;
  pmSpread: number | null;
  modelProb: number | null;
  underlyingCapYes: number | null;
  pmToUnderlyingCapRatio: number | null;
  underlyingCapSignal: string;
  settlementYesSum: number | null;
  settlementOverround: number | null;
  settlementTailYes: number | null;
  settlementSkewYes: number | null;
  edgePts: number | null;
  bestExpression: string;
  optionIv: number | null;
  pmIv: number | null;
  cboeNoGapPts: number | null;
  cmeNoGapPts: number | null;
  adjustedNoGapPts: number | null;
  sourceAgreementBucket: string;
  noBiasCandidatePassed: boolean;
  liquidity: number | null;
  perpFundingAnn?: number | null;
  perpOiUsd?: number | null;
  perpBasisPct?: number | null;
  sellYesEdgePts?: number | null;
  smartFlowNetYes?: number | null;
  smartFlowStance?: number | null;
  flags: string;
  /**
   * Whether the source row carried a perp funding column at all, as distinct
   * from carrying it empty.
   *
   * This is the only question any consumer ever asked of `rawRow`, which cost
   * 68 retained string properties per observation to answer — enough to push
   * the nightly backfill into its heap ceiling. Producers that still attach
   * `rawRow` stay supported by the fallback at the call site.
   */
  hasPerpFunding?: boolean;
  rawRow?: Record<string, string>;
}

const UNDERLYING_CAP_ENTRY_MAX_SPREAD = 0.02;
const UNDERLYING_CAP_ENTRY_MIN_LIQUIDITY = 1000;

export const HYPOTHESIS_SHADOW_TESTS_REQUIRED = 20;
/** Sequential testing cap: past the base 20, inconclusive families keep
 * testing until decisive (significant promote / futility kill) or this cap. */
export const HYPOTHESIS_SHADOW_TESTS_EXTENDED_CAP = 60;
/** Nominal one-sided alpha for the promotion binomial test. Deliberately
 * strict: the gate is re-checked as evidence accumulates (optional stopping),
 * which inflates the effective false-promotion rate a few-fold above nominal —
 * 0.01 nominal keeps the effective rate near a conventional 0.05. */
export const PROMOTE_SIGNIFICANCE_ALPHA = 0.01;
/** Live retest fan-out for LLM + FIND-linked setup families (~8x prior 25). */
const HYPOTHESIS_SETUP_RETEST_ACTIVE_LIMIT = 200;
/** Max in-flight pending shadow tests per LLM/FIND family (~8x prior 1). */
const HYPOTHESIS_SETUP_MAX_PENDING_PER_FAMILY = 8;
/** Parallel retest budget for shadow-mined families (does not steal LLM slots). */
const SHADOW_MINED_RETEST_ACTIVE_LIMIT = 80;
/** Allow multiple in-flight tests per shadow-mined family to accelerate evidence. */
const SHADOW_MINED_MAX_PENDING_PER_FAMILY = 4;
const SHADOW_MINED_ADVICE_FILE = "shadow-mined-hypotheses.json";
const SHADOW_MINED_ADVICE_INGESTED_FILE = "shadow-mined-hypotheses-ingested.json";
const SHADOW_MINED_MAX_NEW_PER_INGEST = 8;
const PROMOTE_THRESHOLD = 0.65;
const PROMOTE_MIN_TESTS = HYPOTHESIS_SHADOW_TESTS_REQUIRED;
const DEMOTE_THRESHOLD = 0.45;
const KILL_THRESHOLD = 0.40;
const WEIGHT_DECAY = 0.85;
export const DATA_CONTAMINATED_SETUP_IDS = new Set([
  "oil_iv_statistical_breakdown_arbitrage",
  "oil_funding_volatility_mean_reversion",
  "oil_pm_spot_divergence_mean_reversion",
  "gold_pm_premium_futures_spread_mean_reversion",
  "cross_asset_funding_positioning_exhaustion",
]);
export const RETIRED_LLM_SETUP_IDS = new Set([
  "oil_iv_statistical_breakdown_arbitrage",
  "cross_asset_funding_positioning_exhaustion",
  "cross_asset_iv_compression_vol_expansion",
  "other_mixed",
  "oil_funding_volatility_mean_reversion",
  "retired_btc_pm_iv_hardcoded_variants",
  "retired_btc_listed_iv_hardcoded_variants",
  "retired_btc_pm_iv_leftover_hardcoded_variants",
  "retired_hype_spot_pm_divergence_variants",
  "retired_amzn_hardcoded_variants",
  "retired_pm_settlement_bucket_hardcoded_variants",
  "retired_hype_adjacent_momentum_variants",
  "retired_btc_hype_confirmation_variants",
  "hype_adjacent_momentum_variants",
  "btc_hype_confirmation_shadow",
]);
const GOLD_SETTLEMENT_TAIL_HYPOTHESIS_IDS = new Set(["H-527"]);
const OIL_SETTLEMENT_TAIL_HYPOTHESIS_IDS = new Set(["H-528"]);
const GOLD_SETTLEMENT_SKEW_HYPOTHESIS_IDS = new Set(["H-529"]);
const OIL_SETTLEMENT_SKEW_HYPOTHESIS_IDS = new Set(["H-530"]);
const RETIRED_PM_SETTLEMENT_BUCKET_HARDCODED_HYPOTHESIS_IDS = new Set([
  "H-101", "H-105", "H-110", "H-114", "H-117", "H-120", "H-123", "H-174",
  "H-297", "H-327", "H-339", "H-372", "H-429",
]);
const RETIRED_BTC_PM_IV_HARDCODED_HYPOTHESIS_IDS = new Set([
  "H-213", "H-216", "H-219", "H-224", "H-227", "H-234", "H-239", "H-245",
  "H-248", "H-251", "H-255", "H-258", "H-268", "H-270", "H-289", "H-301",
  "H-305", "H-307", "H-350", "H-410", "H-413", "H-442",
]);
const BTC_LISTED_IV_MOMENTUM_HYPOTHESIS_IDS = new Set([
  "H-012", "H-170", "H-218",
]);
const RETIRED_BTC_LISTED_IV_HARDCODED_HYPOTHESIS_IDS = new Set([
  "H-054", "H-065", "H-073", "H-115", "H-152", "H-186",
]);
const BTC_OPTIONS_POSITIONING_MACRO_HYPOTHESIS_IDS = new Set(["H-300"]);
const BTC_PM_IV_EXPANSION_REVERSION_HYPOTHESIS_IDS = new Set(["H-001"]);
const BTC_MEDIAN_RANGE_HYPOTHESIS_IDS = new Set(["H-014", "H-017", "H-021"]);
const RETIRED_BTC_PM_IV_LEFTOVER_HARDCODED_HYPOTHESIS_IDS = new Set([
  "H-046", "H-221", "H-261", "H-273", "H-284", "H-285", "H-291", "H-336", "H-424",
]);
const HYPE_RELATIVE_OI_BREAKOUT_HYPOTHESIS_IDS = new Set([
  "H-521", "H-116", "H-181", "H-211", "H-122", "H-143", "H-225", "H-134",
  "H-128", "H-217", "H-333", "H-235",
]);
const HYPE_ADJACENT_MOMENTUM_HYPOTHESIS_IDS = new Set([
  "H-020", "H-214", "H-079", "H-081", "H-256", "H-118", "H-087", "H-089",
  "H-187", "H-067", "H-102", "H-131", "H-126", "H-140", "H-084", "H-137",
]);
const BTC_HYPE_CONFIRMATION_SHADOW_HYPOTHESIS_IDS = new Set([
  "H-180", "H-195", "H-038", "H-077", "H-208", "H-183", "H-041", "H-205",
  "H-059", "H-064", "H-426", "H-075", "H-098", "H-056",
]);
const RETIRED_HYPE_SPOT_PM_DIVERGENCE_HYPOTHESIS_IDS = new Set(["H-018", "H-040"]);
const AMZN_PERP_SPOT_FUNDING_CLEAN_HYPOTHESIS_IDS = new Set([
  "H-005", "H-037", "H-043", "H-045", "H-058", "H-060", "H-099", "H-100",
  "H-147", "H-150", "H-154", "H-254", "H-257", "H-259", "H-265", "H-328", "H-408",
]);
const AMZN_OPTIONS_POSITIONING_CLEAN_HYPOTHESIS_IDS = new Set([
  "H-023", "H-052", "H-055", "H-106", "H-119", "H-178",
]);
const RETIRED_AMZN_HARDCODED_HYPOTHESIS_IDS = new Set([
  "H-047", "H-062", "H-173", "H-191", "H-222", "H-238", "H-241", "H-244",
  "H-280", "H-294", "H-295", "H-299", "H-303", "H-306", "H-312", "H-354",
  "H-360", "H-374", "H-378", "H-381", "H-405", "H-425", "H-428", "H-433",
]);

export function num(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Unit of a scored test's magnitude. The promotion gate may only pool
 * magnitudes that share a unit — averaging a percent return with a funding-rate
 * point would produce a meaningless expectation.
 */
export type MagnitudeUnit = "pct_return" | "funding_pts";

export interface HypothesisEvalResult {
  outcome: "win" | "loss";
  actualMove: string;
  /** False when the hyp cannot be scored honestly — callers must exclude from setup stats. */
  scorable: boolean;
  method: string;
  /** Signed realized edge from the hypothesis's own point of view: positive
   * means the thesis made money. Win/loss alone cannot distinguish a strategy
   * that wins small and loses big from one that genuinely profits, so the
   * promotion gate tests this rather than the win rate alone. */
  magnitude?: number;
  magnitudeUnit?: MagnitudeUnit;
}

export function getAssetPrice(row: SnapshotRow, asset: string): number | null {
  const upper = asset.toUpperCase();
  const map: Record<string, string> = {
    BTC: "btc_spot",
    ETH: "eth_spot",
    HYPE: "hype_spot",
    GOLD: "gold_gc_spot",
    AMZN: "amzn_stock",
    SPY: "spy_spot",
    SILVER: "silver_spot",
    SOL: "sol_spot",
    OIL: "oil_wti_spot",
  };
  const preferred = map[upper];
  const candidates = [
    preferred,
    `${upper.toLowerCase()}_spot`,
    `${upper.toLowerCase()}_stock`,
    `${upper.toLowerCase()}_hl_perp`,
    `${upper.toLowerCase()}_gc_spot`,
  ].filter((key): key is string => Boolean(key));
  for (const key of candidates) {
    const v = num(row[key]);
    if (v !== null && v > 0) return v;
  }
  return null;
}

/** Annualized funding level keys only — never percentiles / z-scores. */
export function fundingAnnConditionKey(hypothesis: Hypothesis): string | null {
  return Object.keys(hypothesis.conditions ?? {}).find((key) => /_hl_funding_ann$/.test(key)) ?? null;
}

export function inferHypothesisAsset(hypothesis: Hypothesis): string | null {
  const fromConditions = String(hypothesis.conditions?.asset ?? "").trim().toUpperCase();
  if (fromConditions && /^[A-Z][A-Z0-9._-]*$/.test(fromConditions)) return fromConditions;

  const text = `${hypothesis.description} ${hypothesis.prediction}`.toLowerCase();
  if (/\bbtc\b|\bbitcoin\b/.test(text)) return "BTC";
  if (/\bgold\b|\bxau\b/.test(text)) return "GOLD";
  if (/\bamzn\b|\bamazon\b/.test(text)) return "AMZN";
  if (/\boil\b|\bbrent\b|\bwti\b/.test(text)) return "OIL";
  // HYPE ticker — avoid matching venue word "hyperliquid" alone when another asset is intended
  if (/\bhype\b/.test(text)) return "HYPE";
  return null;
}

/**
 * Direction for P&L scoring. Explicit hypothesis.direction always wins.
 * Falls back to prediction language (word-bounded) and signalType hints.
 * Never treats the substring "down" inside unrelated tokens as bearish by itself;
 * use "downside" / "decline" / "drop" / "short" instead.
 */
export function resolveHypothesisDirection(hypothesis: Hypothesis): "long" | "short" | "neutral" {
  if (hypothesis.direction === "long" || hypothesis.direction === "short" || hypothesis.direction === "neutral") {
    return hypothesis.direction;
  }

  const prediction = hypothesis.prediction.toLowerCase();
  const shortRe =
    /\b(decline|declines|declining|drop|drops|falling|falls|fall|short|sell-yes|downside)\b|short side|mean reversion lower|revert toward fair/;
  const longRe =
    /\b(rally|rise|rises|rising|bounce|long|upside)\b|funding reversion|reversion_long|reversion long/;
  if (shortRe.test(prediction)) return "short";
  if (longRe.test(prediction)) return "long";

  const signal = String(hypothesis.conditions?.signalType ?? "").toUpperCase();
  if (signal.includes("REVERSION_LONG") || signal.endsWith("_LONG") || signal.includes("EXTREME_LONG")) return "long";
  if (signal.includes("EXTREME_SHORT") || signal.endsWith("_SHORT") || signal.includes("HIGH_EDGE_NO")) return "short";
  return "neutral";
}

/**
 * The spot direction a hypothesis's own test record actually supports, or null
 * when the record supports no spot view at all.
 *
 * The engine graded every shadow test with resolveHypothesisDirection, but
 * chose the live trade direction with a separate, broader keyword inferrer.
 * Where the two disagreed, a family could accumulate a win rate measured on the
 * asset falling and then be traded long. Nineteen live hypotheses were in that
 * state, which is a plausible contributor to PROMOTED_HYPOTHESIS running at a
 * 39.6% live win rate.
 *
 * A "neutral" resolution returns null rather than a direction: those tests were
 * graded on funding normalizing or on absolute movement, neither of which is
 * evidence that spot goes a particular way.
 */
export function evidenceBackedDirection(hypothesis: Hypothesis): "long" | "short" | null {
  const resolved = resolveHypothesisDirection(hypothesis);
  return resolved === "neutral" ? null : resolved;
}

function scoreDirectionalMove(
  movePct: number,
  direction: "long" | "short" | "neutral",
  thresholdPct: number,
  asset: string,
  startPx: number,
  endPx: number,
): HypothesisEvalResult {
  if (direction === "short") {
    return {
      outcome: movePct <= -thresholdPct ? "win" : "loss",
      actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx}) [short needs ≤ -${thresholdPct}%]`,
      scorable: true,
      method: "spot_directional_short",
      magnitude: -movePct,
      magnitudeUnit: "pct_return",
    };
  }
  if (direction === "long") {
    return {
      outcome: movePct >= thresholdPct ? "win" : "loss",
      actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx}) [long needs ≥ +${thresholdPct}%]`,
      scorable: true,
      method: "spot_directional_long",
      magnitude: movePct,
      magnitudeUnit: "pct_return",
    };
  }
  return {
    outcome: Math.abs(movePct) >= thresholdPct ? "win" : "loss",
    actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx}) [neutral abs needs ≥ ${thresholdPct}%]`,
    scorable: true,
    method: "spot_abs_move",
    // A neutral vol thesis pays off on movement beyond the bar it had to clear,
    // so the bar stands in for the cost of the position.
    magnitude: Math.abs(movePct) - thresholdPct,
    magnitudeUnit: "pct_return",
  };
}

export function isPolymarketExpression(hypothesis: Hypothesis): boolean {
  const venue = String(hypothesis.conditions?.venue ?? "").toLowerCase();
  const signal = String(hypothesis.conditions?.signalType ?? "").toUpperCase();
  if (venue === "polymarket"
    || signal.includes("ONE_TOUCH")
    || signal.includes("NO_BIAS")
    || signal.includes("PM_")) return true;
  // Venue and signalType are optional, and the research hypotheses that trade
  // contracts most explicitly set neither — they name the contract's price
  // instead. Reading the conditions catches those: 22 FIND-derived theses were
  // misread as spot theses because only the two optional fields were checked.
  return Object.keys(hypothesis.conditions ?? {}).some(isPolymarketContractConditionKey);
}

/**
 * Whether a single condition key prices a Polymarket contract.
 *
 * Bare keys are matched directly, but the shadow miner writes the same metrics
 * scoped to an asset — `gold_pm_underlying_cap_edge_pts_max` is a contract
 * price against a model, not a fact about gold spot. Matching only the bare set
 * left the two mined gold one-touch families reading as spot theses, so the
 * spot scorer graded 40 contract trials on whether gold fell 2% and recorded
 * 0 wins from 40. Those aggregates already have a pattern in the catalog; this
 * consults it rather than restating the list.
 */
function isPolymarketContractConditionKey(key: string): boolean {
  if (PM_CONTRACT_PRICING_KEYS.has(key)) return true;
  if (RELATIVE_VALUE_AGG_PATTERN.test(key)) return true;
  // `btc_sell_yes_edge_pts` is the same claim as `sell_yes_edge_pts`.
  return [...PM_CONTRACT_PRICING_KEYS].some((bare) => key.endsWith(`_${bare}`));
}

/**
 * The contract quotes a Polymarket thesis is actually about, at entry and exit.
 *
 * Supplied by callers that already load relative-value observations, so the
 * contract scorer can mark the trade on its own instrument instead of guessing
 * from spot.
 */
export interface ContractScoringContext {
  /** Observations at the trigger, for choosing the entry contract. */
  entryRows?: RelativeValueObservation[];
  /** Observations at the horizon end, for marking that contract's exit. */
  exitRows: RelativeValueObservation[];
  /**
   * The contract recorded when the test opened.
   *
   * Preferred over `entryRows`: it is what the trade actually entered, whereas
   * re-deriving the entry from a historical snapshot can pick a different
   * contract if the day's quotes shifted.
   */
  entryStamp?: ContractEntryStamp;
}

/** The contract and price a Polymarket test entered, recorded at open. */
export interface ContractEntryStamp {
  marketId: string;
  eventSlug: string;
  asset: string;
  direction: "above" | "below";
  strike: number;
  /** Price of the side held, not the YES quote. */
  entryPrice: number;
  side: "yes" | "no";
}

/**
 * Which side of the contract the thesis takes.
 *
 * These theses are overwhelmingly premium sales — "sell the one-touch YES",
 * "the NO sale is profitable" — which is a long NO position. A hypothesis
 * direction of `short` means short the contract, not short the underlying.
 */
function contractSide(hypothesis: Hypothesis): "yes" | "no" {
  const prediction = hypothesis.prediction.toLowerCase();
  if (/\b(buy|long)\s+(the\s+)?yes\b/.test(prediction)) return "yes";
  if (/\b(sell|short|fade)\b/.test(prediction) || /\bno\s+(sale|side|outcome)\b/.test(prediction)) return "no";
  return resolveHypothesisDirection(hypothesis) === "long" ? "yes" : "no";
}

/** Converts a quoted YES probability into the price of the side held. */
function sidePrice(yesPrice: number, side: "yes" | "no"): number {
  return side === "yes" ? yesPrice : 1 - yesPrice;
}

/**
 * Scores a Polymarket thesis on the contract's own P&L.
 *
 * The underlying's percent move gets a touch contract's direction roughly
 * right and its economics entirely wrong: a NO sold at 8c returns +1150% if
 * the barrier is never reached and -100% if it is, in neither case in
 * proportion to how far spot travelled. Grading these on a 2% spot move
 * recorded 0 wins from 40 trials on two mined gold one-touch families whose
 * live shadow cohort was winning 62% of the time on the same setup.
 *
 * Entry is the contract that realised the condition's own reduction — the
 * conditions take a max over sell-YES edge, and the live shadow opener enters
 * that same best-edge row — and exit is that contract's later quote.
 */
export function evaluatePolymarketContractTest(
  hypothesis: Hypothesis,
  ctx: ContractScoringContext,
): HypothesisEvalResult {
  const stamp = ctx.entryStamp ?? deriveContractEntry(hypothesis, ctx.entryRows ?? []);
  if (!stamp) {
    const asset = conditionAsset(hypothesis) ?? inferHypothesisAsset(hypothesis);
    return {
      outcome: "loss",
      actualMove: `UNSCORABLE: no ${asset ?? "matching"} contract quote at trigger`,
      scorable: false,
      method: "contract_entry_unavailable",
    };
  }

  const exit = ctx.exitRows.find((row) => row.marketId === stamp.marketId && row.pmYes !== null);
  if (!exit) {
    return {
      outcome: "loss",
      actualMove: `UNSCORABLE: contract ${stamp.marketId || "?"} has no exit quote at the horizon`,
      scorable: false,
      method: "contract_exit_unavailable",
    };
  }
  if (stamp.entryPrice <= 0) {
    return {
      outcome: "loss",
      actualMove: `UNSCORABLE: contract ${stamp.marketId} entry price ${stamp.entryPrice.toFixed(4)} is not tradeable`,
      scorable: false,
      method: "contract_entry_unpriced",
    };
  }

  const exitPrice = sidePrice(exit.pmYes as number, stamp.side);
  const pnlPct = ((exitPrice - stamp.entryPrice) / stamp.entryPrice) * 100;
  return {
    outcome: pnlPct > 0 ? "win" : "loss",
    actualMove: `${stamp.side.toUpperCase()} on ${stamp.asset} ${stamp.direction} ${stamp.strike}`
      + ` ${stamp.entryPrice.toFixed(3)} → ${exitPrice.toFixed(3)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% on the contract)`,
    scorable: true,
    method: "pm_contract_pnl",
    magnitude: pnlPct,
    magnitudeUnit: "pct_return",
  };
}

/**
 * Every quote row a Polymarket thesis could enter right now.
 *
 * Thresholds have to be applied contract by contract. The condition evaluator
 * reduces each metric across every scoped contract with a max, so "edge >= 8
 * and spread <= 0.015" passes as long as *some* contract is wide and *some
 * other* one is tight. Taking the max-edge row out of that set picked a 98.9c
 * NO whose whole upside was 1.1%, and four theses with different conditions
 * all landed on the same contract.
 */
function eligibleContractRows(
  hypothesis: Hypothesis,
  rows: RelativeValueObservation[],
): RelativeValueObservation[] {
  const asset = conditionAsset(hypothesis) ?? inferHypothesisAsset(hypothesis);
  const wantDirection = touchDirectionConstraint(hypothesis);
  return rows.filter((row) =>
    (asset === null || row.asset === asset)
    && row.pmYes !== null
    && (wantDirection === null || row.direction === wantDirection)
    && contractRowSatisfiesConditions(hypothesis, row));
}

/**
 * How many distinct contracts satisfy this thesis's conditions right now.
 *
 * This is the honest input to concurrent-test capacity: a mid-priced-pool
 * thesis may have a dozen nameable entries at once, while a narrow one-touch
 * thesis may have one. Zero for non-contract theses.
 */
export function distinctEligibleContracts(
  hypothesis: Hypothesis,
  rows: RelativeValueObservation[],
): number {
  if (!isPolymarketExpression(hypothesis)) return 0;
  return new Set(eligibleContractRows(hypothesis, rows).map((row) => row.marketId)).size;
}

/**
 * Picks the contract a Polymarket thesis is about from a set of quotes.
 *
 * Max sell-YES edge is the entry the conditions describe — they reduce over
 * scoped contracts with a max — and it is the row the live shadow opener
 * enters, so evidence and execution name the same contract. Without an edge
 * reading it falls back to the widest premium, which is the same trade
 * expressed by price. Markets in excludeMarketIds are skipped so concurrent
 * tests on one variant land on distinct contracts.
 */
export function deriveContractEntry(
  hypothesis: Hypothesis,
  rows: RelativeValueObservation[],
  excludeMarketIds?: ReadonlySet<string>,
): ContractEntryStamp | null {
  const side = contractSide(hypothesis);
  const candidates = eligibleContractRows(hypothesis, rows)
    .filter((row) => !excludeMarketIds?.has(row.marketId));
  if (candidates.length === 0) return null;

  const entry = candidates.reduce((best, row) => {
    const rank = (candidate: RelativeValueObservation): number =>
      candidate.sellYesEdgePts ?? (side === "no" ? (candidate.pmYes ?? 0) : -(candidate.pmYes ?? 0));
    return rank(row) > rank(best) ? row : best;
  });

  return {
    marketId: entry.marketId,
    eventSlug: entry.eventSlug,
    asset: entry.asset,
    direction: entry.direction,
    strike: entry.strike,
    entryPrice: sidePrice(entry.pmYes as number, side),
    side,
  };
}

/** One contract's value for a condition key, or null if the key is not one. */
function contractRowMetric(key: string, row: RelativeValueObservation): number | null {
  switch (key) {
    case "sell_yes_edge_pts": return row.sellYesEdgePts ?? null;
    case "yesAsk": return row.pmAsk;
    case "yesSpread": return row.pmSpread;
    case "liquidity": return row.liquidity;
    case "smart_flow_stance": return row.smartFlowStance ?? null;
    case "smart_flow_net_yes": return row.smartFlowNetYes ?? null;
    case "touch_direction": return row.direction === "above" ? 1 : row.direction === "below" ? -1 : null;
    case "days_to_expiry": return rowDaysToExpiry(row);
    case "adjusted_no_gap_pts": return row.adjustedNoGapPts;
    case "pm_iv_minus_opt_iv_pts":
      return row.pmIv !== null && row.optionIv !== null ? (row.pmIv - row.optionIv) * 100 : null;
    default: return null;
  }
}

/** Comparison and range expressions, evaluated against a single value. */
function satisfiesNumericExpression(value: number, rawExpression: string): boolean {
  const expression = String(rawExpression).trim().toLowerCase().replace(/%/g, "");

  const between = expression.match(/^between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/);
  if (between) return value >= Number(between[1]) && value <= Number(between[2]);

  const comparison = expression.match(/^([<>]=?|=|==)\s*(-?\d+(?:\.\d+)?)/);
  if (!comparison) return true; // Shapes this cannot read do not veto a contract.
  const threshold = Number(comparison[2]);
  switch (comparison[1]) {
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    default: return value === threshold;
  }
}

/** Whether one contract meets every contract-level threshold the thesis names. */
function contractRowSatisfiesConditions(
  hypothesis: Hypothesis,
  row: RelativeValueObservation,
): boolean {
  for (const [key, expression] of Object.entries(hypothesis.conditions ?? {})) {
    const value = contractRowMetric(key, row);
    if (value === null) continue;
    if (!satisfiesNumericExpression(value, String(expression))) return false;
  }
  return true;
}

/** The `touch_direction` gate as a side, so entry selection honours it. */
function touchDirectionConstraint(hypothesis: Hypothesis): "above" | "below" | null {
  const raw = hypothesis.conditions?.touch_direction;
  if (raw === undefined || raw === null) return null;
  const text = String(raw).toLowerCase();
  if (text.includes("above")) return "above";
  if (text.includes("below")) return "below";
  // Encoded numerically by relativeValueConditionValue: 1 above, -1 below.
  if (/(^|[^-\d])1(\D|$)/.test(text) && !text.includes("-1")) return "above";
  if (text.includes("-1")) return "below";
  return null;
}

/**
 * Score a completed shadow test.
 *
 * Rules (scorer v2):
 * 1. Prefer explicit hypothesis.direction over prediction-string heuristics.
 * 2. Never default shorts to "underlying must rise".
 * 3. Funding keys must be *_hl_funding_ann (not percentiles); missing funding falls through.
 * 4. If direction and asset/price cannot be determined, return scorable=false so callers exclude the test.
 * 5. Polymarket-contract theses are scored on the contract, never on spot.
 */
export function evaluateHypothesisTest(
  hypothesis: Hypothesis,
  startRow: SnapshotRow,
  endRow: SnapshotRow,
  contractCtx?: ContractScoringContext,
): HypothesisEvalResult {
  // Contract theses are settled on the contract or not at all. Falling through
  // to the spot path would resume grading a premium sale by how far the
  // underlying moved, which is the measurement this guard exists to stop.
  if (isPolymarketExpression(hypothesis)) {
    if (contractCtx) return evaluatePolymarketContractTest(hypothesis, contractCtx);
    return {
      outcome: "loss",
      actualMove: "UNSCORABLE: Polymarket-contract thesis needs contract quotes, not a spot move",
      scorable: false,
      method: "awaiting_contract_scorer",
    };
  }
  return evaluateSpotHypothesisTest(hypothesis, startRow, endRow);
}

function evaluateSpotHypothesisTest(
  hypothesis: Hypothesis,
  startRow: SnapshotRow,
  endRow: SnapshotRow,
): HypothesisEvalResult {
  const prediction = hypothesis.prediction.toLowerCase();
  const direction = resolveHypothesisDirection(hypothesis);
  const signalType = String(hypothesis.conditions?.signalType ?? "").toUpperCase();
  const percentMatch = prediction.match(/>\s*(\d+(?:\.\d+)?)%/);
  const thresholdPct = percentMatch ? parseFloat(percentMatch[1]) : 2;

  const fundingKey = fundingAnnConditionKey(hypothesis);
  const wantsFunding = Boolean(fundingKey)
    || /\bfunding\b/.test(prediction)
    || signalType.includes("FUNDING");

  if (wantsFunding && fundingKey) {
    const startFunding = num(startRow[fundingKey]);
    const endFunding = num(endRow[fundingKey]);
    if (startFunding !== null && endFunding !== null) {
      const asset = inferHypothesisAsset(hypothesis);
      const startPx = asset ? getAssetPrice(startRow, asset) : null;
      const endPx = asset ? getAssetPrice(endRow, asset) : null;
      if (asset && startPx !== null && endPx !== null && direction !== "neutral") {
        const movePct = ((endPx - startPx) / startPx) * 100;
        const scored = scoreDirectionalMove(movePct, direction, thresholdPct, asset, startPx, endPx);
        return {
          ...scored,
          actualMove: `${scored.actualMove}; funding ${startFunding.toFixed(1)}%→${endFunding.toFixed(1)}%`,
          method: `${scored.method}+funding_context`,
        };
      }

      if (prediction.includes("below")) {
        const target = prediction.match(/below\s+(\d+(?:\.\d+)?)/);
        const level = target ? parseFloat(target[1]) : 10;
        return {
          outcome: endFunding < level ? "win" : "loss",
          actualMove: `Funding moved ${startFunding.toFixed(1)}% → ${endFunding.toFixed(1)}% (need < ${level})`,
          scorable: true,
          method: "funding_below_level",
          magnitude: level - endFunding,
          magnitudeUnit: "funding_pts",
        };
      }

      // Weekend / funding-reversion longs: funding rising (normalizing) counts as win when no mark.
      if (direction === "long" || /reversion|normaliz/.test(prediction)) {
        return {
          outcome: endFunding > startFunding ? "win" : "loss",
          actualMove: `Funding moved ${startFunding.toFixed(1)}% → ${endFunding.toFixed(1)}% (long reversion needs increase)`,
          scorable: true,
          method: "funding_normalize_up",
          magnitude: endFunding - startFunding,
          magnitudeUnit: "funding_pts",
        };
      }
      if (direction === "short") {
        return {
          outcome: endFunding < startFunding ? "win" : "loss",
          actualMove: `Funding moved ${startFunding.toFixed(1)}% → ${endFunding.toFixed(1)}% (short needs decrease)`,
          scorable: true,
          method: "funding_decrease",
          magnitude: startFunding - endFunding,
          magnitudeUnit: "funding_pts",
        };
      }
    }
    // Missing funding samples: fall through to underlying — do not hard-lose on percentile keys.
  }

  const asset = inferHypothesisAsset(hypothesis);
  if (!asset) {
    return {
      outcome: "loss",
      actualMove: "UNSCORABLE: could not infer asset (set conditions.asset)",
      scorable: false,
      method: "unscorable_asset",
    };
  }

  const startPx = getAssetPrice(startRow, asset);
  const endPx = getAssetPrice(endRow, asset);
  if (startPx === null || endPx === null) {
    return {
      outcome: "loss",
      actualMove: `UNSCORABLE: missing ${asset} price history`,
      scorable: false,
      method: "unscorable_price",
    };
  }
  const movePct = ((endPx - startPx) / startPx) * 100;

  if (direction === "long" || direction === "short") {
    return scoreDirectionalMove(movePct, direction, thresholdPct, asset, startPx, endPx);
  }

  if (/\b(move|moves|moved|volatility)\b/.test(prediction)) {
    return scoreDirectionalMove(movePct, "neutral", thresholdPct, asset, startPx, endPx);
  }

  return {
    outcome: "loss",
    actualMove: "UNSCORABLE: missing hypothesis.direction and no directional language in prediction",
    scorable: false,
    method: "unscorable_direction",
  };
}

/**
 * Intrinsic scorability: can evaluateHypothesisTest EVER produce a scorable
 * result for this hypothesis, independent of data availability on a given
 * day? Mirrors the scorer-v2 preamble exactly. Used by the retest openers so
 * the engine stops spending shadow-test slots on hypotheses whose every
 * resolution lands in unscorable_direction / unscorable_asset — that burn was
 * invisible and consumed most of some families' budgets.
 */
export function hypothesisScoringMode(
  hypothesis: Hypothesis,
): "funding" | "directional" | "neutral_move" | "contract" | null {
  // Contract theses are scorable, just not by the spot path — reporting them as
  // unscorable would have the sweep retire the mined one-touch families that
  // the shadow ledger shows working.
  if (isPolymarketExpression(hypothesis)) return "contract";
  const prediction = hypothesis.prediction.toLowerCase();
  const direction = resolveHypothesisDirection(hypothesis);
  const signalType = String(hypothesis.conditions?.signalType ?? "").toUpperCase();
  const fundingKey = fundingAnnConditionKey(hypothesis);
  const wantsFunding = Boolean(fundingKey)
    || /\bfunding\b/.test(prediction)
    || signalType.includes("FUNDING");

  // Funding path scores without direction when the prediction states a level
  // ("below 10") or a reversion/normalization thesis; directional hyps with a
  // funding key also resolve on this path.
  if (wantsFunding && fundingKey
    && (direction !== "neutral" || prediction.includes("below") || /reversion|normaliz/.test(prediction))) {
    return "funding";
  }
  if (inferHypothesisAsset(hypothesis) === null) return null;
  if (direction === "long" || direction === "short") return "directional";
  if (/\b(move|moves|moved|volatility)\b/.test(prediction)) return "neutral_move";
  return null;
}

/** A variant that has burned at least this many tests without ever being
 * scorable has had ample opportunity; it is retired rather than left to clutter
 * the active pool. Below the threshold the variant stays active so the nightly
 * LLM can still see it as struggling and propose a refinement. */
export const UNSCORABLE_BURN_RETIRE_THRESHOLD = 10;

/**
 * How long an unscorable variant stays active waiting to be re-authored.
 *
 * The burn threshold alone became unreachable once the retest opener started
 * skipping unscorable families: no new tests means no new burns, so a variant
 * stalled below the threshold sat in the active pool permanently — 40 of 179
 * were in that state. The nightly LLM runs daily and now sees these families by
 * name, so a week is several real chances to fix one before it is retired.
 */
export const UNSCORABLE_REAUTHOR_GRACE_DAYS = 7;

export interface UnscorableSweepResult {
  /** Pending tests cancelled because their variant can never be scored. */
  cancelledTests: number;
  /** Variants retired after burning past the threshold. */
  retiredVariants: number;
  /** Variants left active so the LLM can re-author them. */
  flaggedForReauthor: number;
  /** Setup families holding retained variants, so the note is actionable. */
  retainedSetupIds: string[];
  notes: string[];
}

/**
 * Stops the single largest source of wasted test budget: shadow tests queued
 * against hypotheses the scorer can never grade.
 *
 * Two thirds of all tests ever recorded resolved UNSCORABLE. The retest openers
 * now refuse to open new ones, but tests already queued still resolve into the
 * void, and long-dead variants still occupy the active pool. This cancels the
 * queued tests and retires variants that have already burned past the
 * threshold, while leaving fresher ones visible for refinement.
 */
export function sweepUnscorableHypotheses(
  hypotheses: Hypothesis[],
  now: Date = new Date(),
): UnscorableSweepResult {
  const result: UnscorableSweepResult = {
    cancelledTests: 0,
    retiredVariants: 0,
    flaggedForReauthor: 0,
    retainedSetupIds: [],
    notes: [],
  };
  const retained = new Set<string>();

  for (const hypothesis of hypotheses) {
    if (hypothesis.status !== "active" && hypothesis.status !== "promoted") continue;
    // Contract theses report mode "contract" and so never reach this sweep;
    // they are graded on the contract, which is what used to be missing.
    if (hypothesisScoringMode(hypothesis) !== null) continue;

    let burned = 0;
    let pending = 0;
    for (const test of hypothesis.tests) {
      if (test.outcome === "pending" && !test.excludedFromSetupStats) {
        test.excludedFromSetupStats = true;
        test.exclusionReason = "cancelled_unscorable_variant";
        test.actualMove = "CANCELLED: variant cannot be scored (no direction, funding thesis, or move language); test would resolve UNSCORABLE.";
        // A cancelled test has to leave "pending", or it holds a slot in the
        // family's pending cap forever and never counts toward the burn total
        // that retires the variant. It carries excludedFromSetupStats, so the
        // terminal outcome never reaches a win rate.
        test.outcome = "loss";
        result.cancelledTests++;
        burned++;
      } else if (test.excludedFromSetupStats && test.outcome !== "pending") {
        burned++;
      } else if (test.outcome === "pending") {
        pending++;
      }
    }

    // Inert once nothing is queued: the retest opener refuses to open tests for
    // an unscorable variant, so its burn count can never grow and it would
    // otherwise sit in the active pool permanently. The grace window still
    // gives a freshly authored variant time to be corrected first.
    const created = new Date(hypothesis.created).getTime();
    const graceExpired = Number.isFinite(created)
      && now.getTime() - created > UNSCORABLE_REAUTHOR_GRACE_DAYS * 86_400_000;
    const inert = hypothesis.tests.length > 0 && pending === 0 && graceExpired;
    if (burned >= UNSCORABLE_BURN_RETIRE_THRESHOLD || inert) {
      hypothesis.status = "killed";
      hypothesis.promotedToSignal = false;
      hypothesis.postMortem = appendPostMortemSegment(
        hypothesis.postMortem,
        `Retired unscorable: burned ${burned} tests that could never be graded. The thesis states no direction, no funding reversion, and no move magnitude, so the scorer has nothing to measure. Re-author with an explicit direction or a measurable move before retesting.`,
      );
      result.retiredVariants++;
    } else {
      result.flaggedForReauthor++;
      if (hypothesis.setupId) retained.add(hypothesis.setupId);
    }
  }

  result.retainedSetupIds = [...retained].sort();
  if (result.cancelledTests > 0 || result.retiredVariants > 0) {
    result.notes.push(
      `🧹 Unscorable sweep: cancelled ${result.cancelledTests} queued tests, retired ${result.retiredVariants} burned-out variants, ${result.flaggedForReauthor} left active for re-authoring.`,
    );
  }
  return result;
}

/**
 * Appends a review observation to a postMortem while capping the segment
 * count. postMortem was append-only, so months-old optimistic narration
 * ("working perfectly") permanently anchored the record even after the stats
 * turned — and truncation showed the LLM the OLDEST text first. Keeping only
 * the newest segments makes the narrative track the evidence.
 */
export function appendPostMortemSegment(
  existing: string | null | undefined,
  observation: string,
  maxSegments = 4,
): string {
  const segments = (existing ?? "")
    .split(" | ")
    .map((segment) => segment.trim())
    .filter(Boolean);
  segments.push(observation.trim());
  return segments.slice(-maxSegments).join(" | ");
}

export function completedHypothesisTests(hypothesis: Hypothesis): HypothesisTest[] {
  return hypothesis.tests.filter((test) => test.outcome !== "pending" && !test.excludedFromSetupStats);
}

export function pendingHypothesisTests(hypothesis: Hypothesis): HypothesisTest[] {
  return hypothesis.tests.filter((test) => test.outcome === "pending" && !test.excludedFromSetupStats);
}

export function classifyHypothesisSetup(hypothesis: Hypothesis): { setupId: string; setupLabel: string } {
  if (hypothesis.id === "H-523") {
    return {
      setupId: "btc_pm_iv_regime_relative_compression",
      setupLabel: "BTC PM IV regime-relative compression",
    };
  }
  if (RETIRED_BTC_PM_IV_HARDCODED_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_btc_pm_iv_hardcoded_variants",
      setupLabel: "Retired BTC PM-IV hard-coded variants",
    };
  }
  if (BTC_LISTED_IV_MOMENTUM_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "btc_listed_iv_momentum_confirmation",
      setupLabel: "BTC listed-IV momentum confirmation",
    };
  }
  if (RETIRED_BTC_LISTED_IV_HARDCODED_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_btc_listed_iv_hardcoded_variants",
      setupLabel: "Retired BTC listed-IV hard-coded variants",
    };
  }
  if (BTC_OPTIONS_POSITIONING_MACRO_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "btc_options_positioning_macro",
      setupLabel: "BTC options positioning / macro",
    };
  }
  if (BTC_PM_IV_EXPANSION_REVERSION_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "btc_pm_iv_expansion_reversion",
      setupLabel: "BTC PM-IV expansion / reversion",
    };
  }
  if (BTC_MEDIAN_RANGE_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "btc_median_range_strike_distribution",
      setupLabel: "BTC median range / strike distribution",
    };
  }
  if (RETIRED_BTC_PM_IV_LEFTOVER_HARDCODED_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_btc_pm_iv_leftover_hardcoded_variants",
      setupLabel: "Retired BTC PM-IV leftover hard-coded variants",
    };
  }
  if (HYPE_RELATIVE_OI_BREAKOUT_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "hype_relative_oi_breakout_continuation",
      setupLabel: "HYPE relative OI breakout continuation",
    };
  }
  if (HYPE_ADJACENT_MOMENTUM_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_hype_adjacent_momentum_variants",
      setupLabel: "Retired HYPE adjacent momentum hard-coded variants",
    };
  }
  if (BTC_HYPE_CONFIRMATION_SHADOW_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_btc_hype_confirmation_variants",
      setupLabel: "Retired BTC-HYPE confirmation hard-coded variants",
    };
  }
  if (RETIRED_HYPE_SPOT_PM_DIVERGENCE_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_hype_spot_pm_divergence_variants",
      setupLabel: "Retired HYPE spot-PM divergence variants",
    };
  }
  if (AMZN_PERP_SPOT_FUNDING_CLEAN_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "amzn_perp_spot_funding_convergence",
      setupLabel: "AMZN perp/spot funding convergence",
    };
  }
  if (AMZN_OPTIONS_POSITIONING_CLEAN_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "amzn_options_positioning_momentum",
      setupLabel: "AMZN options positioning / momentum",
    };
  }
  if (RETIRED_AMZN_HARDCODED_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_amzn_hardcoded_variants",
      setupLabel: "Retired AMZN hard-coded variants",
    };
  }
  if (GOLD_SETTLEMENT_TAIL_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "gold_settlement_bucket_tail_volatility",
      setupLabel: "Gold settlement bucket tail volatility",
    };
  }
  if (OIL_SETTLEMENT_TAIL_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "oil_settlement_bucket_tail_volatility",
      setupLabel: "Oil settlement bucket tail volatility",
    };
  }
  if (GOLD_SETTLEMENT_SKEW_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "gold_settlement_bucket_skew",
      setupLabel: "Gold settlement bucket upside skew",
    };
  }
  if (OIL_SETTLEMENT_SKEW_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "oil_settlement_bucket_skew",
      setupLabel: "Oil settlement bucket upside skew",
    };
  }
  if (RETIRED_PM_SETTLEMENT_BUCKET_HARDCODED_HYPOTHESIS_IDS.has(hypothesis.id)) {
    return {
      setupId: "retired_pm_settlement_bucket_hardcoded_variants",
      setupLabel: "Retired PM settlement bucket hard-coded variants",
    };
  }

  const text = `${hypothesis.description} ${hypothesis.prediction} ${Object.keys(hypothesis.conditions ?? {}).join(" ")}`.toLowerCase();
  // Use word-boundary matching for "hype" so substrings like "hyperliquid" (the
  // venue, applies to all assets) don't get misclassified as the HYPE asset.
  const mentionsHypeAsset = /\bhype\b/.test(text);

  let label = "Other / mixed";
  if (text.includes("settlement bucket") || text.includes("settle bucket") || (text.includes("settle") && (text.includes("tail") || text.includes("overround") || text.includes("volatility")))) {
    label = "PM settlement bucket volatility";
  } else if (text.includes("underlying cap") || text.includes("spot/strike") || text.includes("payoff cap") || text.includes("pm/cap")) {
    label = "PM odds / underlying payoff cap";
  } else if (text.includes("cross-asset") && (text.includes("funding") || text.includes("positioning"))) {
    label = "Cross-asset funding/positioning exhaustion";
  } else if (text.includes("cross-asset") && text.includes("iv")) {
    label = "Cross-asset IV compression / vol expansion";
  } else if (text.includes("cross-asset") && (text.includes("p/c") || text.includes("put-call"))) {
    label = "Cross-asset options repositioning";
  } else if (text.includes("btc") && mentionsHypeAsset && (text.includes("correlation") || text.includes("coordinated"))) {
    label = "BTC momentum / correlation breakout";
  } else if (mentionsHypeAsset && text.includes("funding/oi long bounce")) {
    label = "HYPE funding/OI long bounce";
  } else if (mentionsHypeAsset && text.includes("funding/oi liquidation short")) {
    label = "HYPE funding/OI liquidation short";
  } else if (mentionsHypeAsset && (text.includes("oi") || text.includes("open interest")) && (text.includes("distribution") || text.includes("exhaustion"))) {
    label = "HYPE OI distribution exhaustion / reversal";
  } else if (mentionsHypeAsset && (text.includes("breakout") || text.includes("momentum") || text.includes("fomo") || text.includes("surge"))) {
    label = "HYPE breakout / OI surge momentum";
  } else if (mentionsHypeAsset && (text.includes("funding") || text.includes("oi") || text.includes("open interest"))) {
    label = "HYPE funding/OI normalization";
  } else if (text.includes("btc") && (text.includes("dealer hedg") || text.includes("term spread") || text.includes("term structure") || text.includes("gamma stress") || text.includes("hedge stress"))) {
    label = "BTC dealer hedge stress / pullback";
  } else if (text.includes("btc") && text.includes("funding")) {
    label = "BTC funding exhaustion / reversal";
  } else if (text.includes("btc") && (text.includes("iv compression") || text.includes("pm iv") || text.includes("vol"))) {
    label = "BTC IV compression / vol reversion";
  } else if (text.includes("btc") && (text.includes("p/c") || text.includes("put-call"))) {
    label = "BTC put-call exhaustion / reversal";
  } else if (text.includes("btc") && (text.includes("momentum") || text.includes("breakout") || text.includes("correlation"))) {
    label = "BTC momentum / correlation breakout";
  } else if (text.includes("oil") && (text.includes("iv") || text.includes("statistical") || text.includes("arbitrage") || text.includes("breakdown"))) {
    label = "Oil IV/statistical breakdown arbitrage";
  } else if (text.includes("oil") && text.includes("funding")) {
    label = "Oil funding volatility / mean reversion";
  } else if (text.includes("oil") && (text.includes("pm") || text.includes("spot"))) {
    label = "Oil PM-spot divergence / mean reversion";
  } else if (text.includes("gold") && (text.includes("pm") || text.includes("premium") || text.includes("settlement") || text.includes("futures"))) {
    label = "Gold PM premium / futures spread mean reversion";
  } else if (text.includes("gold") && (text.includes("iv") || text.includes("compression"))) {
    label = "Gold IV compression / vol reversion";
  } else if (text.includes("amzn") && (text.includes("funding") || text.includes("basis") || text.includes("perp"))) {
    label = "AMZN perp/spot funding convergence";
  } else if (text.includes("amzn") && (text.includes("p/c") || text.includes("put-call") || text.includes("momentum"))) {
    label = "AMZN options positioning / momentum";
  } else if (text.includes("macro")) {
    label = "Macro regime / risk momentum";
  }

  return {
    setupId: slugifySetupId(label),
    setupLabel: label,
  };
}

export function ensureHypothesisSetupMetadata(hypothesis: Hypothesis): void {
  // Shadow-mined hyps carry a stable cluster setupId from the miner — keep it.
  if (
    hypothesis.source === "shadow_mined" &&
    typeof hypothesis.setupId === "string" &&
    hypothesis.setupId.length > 0 &&
    typeof hypothesis.setupLabel === "string" &&
    hypothesis.setupLabel.length > 0
  ) {
    return;
  }
  // FIND-linked research hyps keep a stable per-FIND family (not freeform classifiers / retired other_mixed).
  if (typeof hypothesis.originFindingId === "string" && hypothesis.originFindingId.length > 0) {
    hypothesis.setupId = `find_${hypothesis.originFindingId.replace(/^FIND-/i, "").toLowerCase()}`;
    hypothesis.setupLabel = `FIND-linked ${hypothesis.originFindingId}`;
    return;
  }
  const setup = classifyHypothesisSetup(hypothesis);
  hypothesis.setupId = setup.setupId;
  hypothesis.setupLabel = setup.setupLabel;
}

function completedSetupTests(hypotheses: Hypothesis[]): HypothesisTest[] {
  return hypotheses.flatMap((hypothesis) => completedHypothesisTests(hypothesis));
}

function pendingSetupTests(hypotheses: Hypothesis[]): HypothesisTest[] {
  return hypotheses.flatMap((hypothesis) => pendingHypothesisTests(hypothesis));
}

function selectSetupPrimary(hypotheses: Hypothesis[]): Hypothesis {
  // Killed/archived hypotheses are never eligible to represent a family — if
  // we let them through, the promotion path at evaluateHypotheses() will set
  // status="promoted" on a killed entry and resurrect it. Fall back to the
  // full list only when every member is killed/archived (so the family record
  // still has a representative for reporting).
  const eligible = hypotheses.filter((h) => h.status !== "killed" && h.status !== "archived");
  const pool = eligible.length > 0 ? eligible : hypotheses;
  return [...pool].sort((a, b) => {
    if (a.status === "promoted" && b.status !== "promoted") return -1;
    if (b.status === "promoted" && a.status !== "promoted") return 1;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.id.localeCompare(b.id);
  })[0];
}

export function hypothesisSetupFamilies(hypotheses: Hypothesis[]): HypothesisSetupFamily[] {
  const bySetup = new Map<string, Hypothesis[]>();
  for (const hypothesis of hypotheses) {
    ensureHypothesisSetupMetadata(hypothesis);
    const setupId = hypothesis.setupId ?? "other_mixed";
    bySetup.set(setupId, [...(bySetup.get(setupId) ?? []), hypothesis]);
  }

  return [...bySetup.entries()].map(([setupId, familyHypotheses]) => {
    const completed = completedSetupTests(familyHypotheses);
    const pending = pendingSetupTests(familyHypotheses);
    const wins = completed.filter((test) => test.outcome === "win").length;
    const losses = completed.filter((test) => test.outcome === "loss").length;
    const setupLabel = familyHypotheses[0]?.setupLabel ?? setupId;
    return {
      setupId,
      setupLabel,
      hypotheses: familyHypotheses,
      completed,
      pending,
      wins,
      losses,
      winRate: completed.length > 0 ? wins / completed.length : 0,
      primary: selectSetupPrimary(familyHypotheses),
    };
  });
}

// Canonical home is alpha-stats.ts, shared with the Python discovery layer.
// Re-exported here because the engine and existing tests import it from this module.
export { binomialPValue } from "./alpha-stats.js";

/** Minimum magnitude-bearing tests before the expectancy test can gate a family.
 * Below this the family is judged on win rate alone, as it always was. */
export const MAGNITUDE_EVIDENCE_MIN_TESTS = 10;
/** A family is blocked when its realized edge is significantly negative at this
 * level. Deliberately looser than PROMOTE_SIGNIFICANCE_ALPHA: we want to catch
 * money-losing setups readily, while still demanding strong evidence to promote. */
export const MAGNITUDE_NEGATIVE_ALPHA = 0.1;

export interface SetupMagnitudeEvidence {
  /** Number of scored tests contributing a magnitude in a single consistent unit. */
  n: number;
  unit: MagnitudeUnit | null;
  mean: number;
  /** One-sided p that mean edge > 0. Null when there is too little evidence. */
  pPositive: number | null;
  /** One-sided p that mean edge < 0. Null when there is too little evidence. */
  pNegative: number | null;
  /** True when the record is strong enough to gate on. */
  usable: boolean;
}

/**
 * Pools the realized edge of a family's scored tests.
 *
 * Magnitudes are only pooled when every contributing test shares a unit; a
 * family mixing percent returns with funding points has no meaningful mean, so
 * the majority unit wins and the rest are dropped rather than averaged.
 */
export function setupMagnitudeEvidence(tests: readonly HypothesisTest[]): SetupMagnitudeEvidence {
  const byUnit = new Map<MagnitudeUnit, number[]>();
  for (const test of tests) {
    if (test.outcome === "pending" || test.excludedFromSetupStats) continue;
    if (typeof test.magnitude !== "number" || !Number.isFinite(test.magnitude)) continue;
    if (!test.magnitudeUnit) continue;
    const list = byUnit.get(test.magnitudeUnit) ?? [];
    list.push(test.magnitude);
    byUnit.set(test.magnitudeUnit, list);
  }

  let unit: MagnitudeUnit | null = null;
  let values: number[] = [];
  for (const [candidate, list] of byUnit) {
    if (list.length > values.length) {
      unit = candidate;
      values = list;
    }
  }

  const { n, mean, std } = sampleMoments(values);
  const pPositive = oneSidedTPValue(mean, std, n);
  const pNegative = oneSidedTPValue(-mean, std, n);
  return {
    n,
    unit,
    mean,
    pPositive,
    pNegative,
    usable: n >= MAGNITUDE_EVIDENCE_MIN_TESTS && pPositive !== null,
  };
}

/**
 * Distinct start-days a measured base rate must cover.
 *
 * The replay steps hourly, which gives a stable point estimate but heavily
 * overlapping windows — 700 hourly samples drawn from three weeks are nowhere
 * near 700 independent observations. Requiring distinct days instead means the
 * guard measures how much history backs the estimate rather than how finely it
 * was sampled. Asset price columns only start partway through the valuation
 * file, so early windows are unscorable and this bites.
 */
export const BASE_RATE_MIN_DAYS = 20;

export interface EmpiricalBaseRate {
  /** Unconditional win frequency of this hypothesis's own success criterion. */
  baseRate: number;
  /** Scorable windows the estimate is built from. */
  n: number;
  /** Distinct calendar days those windows start on. */
  days: number;
}

/**
 * The share of the time this hypothesis's success criterion is met by chance.
 *
 * A 50% null asks "is this better than a coin flip", which is the wrong
 * question for almost every thesis here. "GOLD declines >2% in 2 days" is not
 * a coin flip — it happens roughly a quarter of the time — so a family right
 * 40% of the time was being recorded as a failure when it was in fact well
 * ahead of chance. Five families with 18 or more completed tests sat below the
 * 50% bar while clearing a measured one.
 *
 * The estimate replays the family's own scorer over every historical window of
 * its own horizon, ignoring whether the conditions fired. That is exactly the
 * null the significance test wants — the criterion's frequency for an entry
 * chosen without the signal — and it is measured with the same code that
 * grades the real tests, so no separate set of assumptions can drift from it.
 *
 * This cuts both ways by design. A thesis whose criterion is usually true (a
 * barrier that is usually not touched) gets a null well above 50% and has to
 * clear a correspondingly higher bar than it used to.
 */
export function empiricalBaseRate(
  hypothesis: Hypothesis,
  valuationRows: readonly SnapshotRow[],
): EmpiricalBaseRate | null {
  // Contract theses are graded on an instrument these rows do not contain;
  // replaying them here would measure a spot move and call it a base rate.
  if (isPolymarketExpression(hypothesis)) return null;
  const horizon = Math.max(1, Math.round(hypothesis.timeframeDays || 1));
  if (valuationRows.length <= horizon) return null;

  // Timestamps are parsed with looseTimeMs because valuation dates are
  // hour-truncated ("2026-08-21T20"), which Date.parse rejects outright — a
  // strict parse silently measured zero windows for every family.
  const stamps = valuationRows.map((row) => looseTimeMs(String(row.date ?? "")));
  const horizonMs = horizon * 86_400_000;

  let wins = 0;
  let scorable = 0;
  const days = new Set<string>();
  // Two pointers, not a nested scan: the rows are hourly and time-ordered, so
  // the exit index only moves forward. A rescan per start index is quadratic
  // and this runs for every family on every engine pass.
  let exit = 0;
  for (let i = 0; i < valuationRows.length; i++) {
    const startMs = stamps[i];
    if (startMs === null) continue;
    if (exit < i + 1) exit = i + 1;
    while (exit < valuationRows.length
      && (stamps[exit] === null || (stamps[exit] as number) < startMs + horizonMs)) {
      exit++;
    }
    if (exit >= valuationRows.length) break;
    const result = evaluateSpotHypothesisTest(hypothesis, valuationRows[i], valuationRows[exit]);
    if (!result.scorable) continue;
    scorable++;
    days.add(String(valuationRows[i].date ?? "").slice(0, 10));
    if (result.outcome === "win") wins++;
  }
  if (days.size < BASE_RATE_MIN_DAYS) return null;
  return { baseRate: wins / scorable, n: scorable, days: days.size };
}

/**
 * How far a win rate must exceed its base rate to count as an edge worth
 * trading, as a ratio.
 *
 * Statistical significance alone can certify an edge too small to survive
 * costs, so a size requirement sits alongside it. Expressed as a ratio because
 * a fixed number of points means different things at different base rates:
 * five points over a 15% base rate is a third more winners, five points over
 * 60% is barely a nudge.
 */
export const PROMOTE_MIN_LIFT = 1.25;

/**
 * Win rate this far below the base rate marks a thesis as worse than no signal.
 *
 * The old floor killed anything under 40% outright, which condemned a family
 * winning 40% of the time on a criterion that comes up 33% of the time by
 * chance — a genuine edge, discarded for failing to beat a number that had
 * nothing to do with it.
 */
export const KILL_MAX_LIFT = 0.85;

/**
 * The win rate a family must reach to be promotable.
 *
 * Relative to the base rate when one was measured; the absolute floor is only
 * for families whose criterion could not be replayed, where there is nothing
 * to be relative to.
 */
export function promoteWinRateFloor(nullWinRate: number | null, absoluteFloor: number): number {
  if (nullWinRate === null) return absoluteFloor;
  // The additive term keeps a near-zero base rate from making the bar trivial:
  // 1.25x a 2% base rate is 2.5%, which any noise clears.
  return Math.min(0.95, Math.max(nullWinRate * PROMOTE_MIN_LIFT, nullWinRate + 0.05));
}

/** The win rate below which a family is abandoned. Mirrors the promote floor. */
export function killWinRateFloor(nullWinRate: number | null, absoluteFloor: number): number {
  if (nullWinRate === null) return absoluteFloor;
  return Math.max(0, nullWinRate * KILL_MAX_LIFT);
}

/**
 * True when the family clears BOTH bars: it is right more often than chance
 * (binomial on win rate) and it actually makes money (one-sided Student-t on
 * realized edge). The expectancy test only applies once enough magnitude-bearing
 * tests exist, so families whose tests predate magnitude recording still resolve
 * on win rate rather than deadlocking.
 *
 * `nullWinRate` is the frequency the criterion is met without the signal — see
 * empiricalBaseRate. Pass null when it could not be measured, which falls back
 * to a coin-flip test against the absolute floor; a measured value is always
 * preferable and is what makes the win-rate bar mean anything.
 */
export function setupFamilyIsPromotable(
  wins: number,
  completed: number,
  promoteThreshold: number,
  tests: readonly HypothesisTest[] = [],
  nullWinRate: number | null = null,
): boolean {
  if (completed <= 0) return false;
  const winRate = wins / completed;
  if (winRate < promoteWinRateFloor(nullWinRate, promoteThreshold)) return false;
  if (binomialPValue(wins, completed, nullWinRate ?? 0.5) >= PROMOTE_SIGNIFICANCE_ALPHA) return false;

  const edge = setupMagnitudeEvidence(tests);
  if (!edge.usable) return true;
  return edge.pPositive! < PROMOTE_SIGNIFICANCE_ALPHA;
}

/**
 * True when a family should be abandoned because its realized edge is
 * significantly negative, regardless of how often it is nominally "right".
 * This is the case win rate alone cannot see.
 */
export function setupFamilyIsUnprofitable(tests: readonly HypothesisTest[]): boolean {
  const edge = setupMagnitudeEvidence(tests);
  if (!edge.usable) return false;
  return edge.pNegative !== null && edge.pNegative < MAGNITUDE_NEGATIVE_ALPHA;
}

/** True when the family's completed record is statistically decisive:
 * promotable (win rate over threshold, significantly above chance, and
 * profitable), or killable (win rate below the futility floor, or realized
 * edge significantly negative). */
export function setupFamilyIsDecisive(
  wins: number,
  completed: number,
  promoteThreshold: number,
  killThreshold: number,
  tests: readonly HypothesisTest[] = [],
  nullWinRate: number | null = null,
): boolean {
  if (completed <= 0) return false;
  const winRate = wins / completed;
  if (winRate < killWinRateFloor(nullWinRate, killThreshold)) return true;
  if (setupFamilyIsUnprofitable(tests)) return true;
  return setupFamilyIsPromotable(wins, completed, promoteThreshold, tests, nullWinRate);
}

export function hypothesisSetupNeedsMoreShadowTests(
  family: HypothesisSetupFamily,
  sources: ReadonlySet<string> = new Set(["llm"]),
  nullWinRate: number | null = null,
): boolean {
  if (!family.hypotheses.some((hypothesis) => sources.has(hypothesis.source))) return false;
  if (!family.hypotheses.some((hypothesis) => hypothesis.status !== "killed" && hypothesis.status !== "archived")) return false;
  const completed = family.completed.length;
  if (completed < HYPOTHESIS_SHADOW_TESTS_REQUIRED) return true;
  if (completed >= HYPOTHESIS_SHADOW_TESTS_EXTENDED_CAP) return false;
  // Sequential evidence: past the base requirement, keep testing only while
  // the record is statistically inconclusive — neither significantly above
  // chance at the promote bar nor below the futility floor. Freezing at
  // exactly 20 would strand e.g. 13/20 (65%, p=0.13) forever.
  return !setupFamilyIsDecisive(family.wins, completed, PROMOTE_THRESHOLD, KILL_THRESHOLD, family.completed, nullWinRate);
}

export function isDataContaminatedSetup(setupId: string): boolean {
  return DATA_CONTAMINATED_SETUP_IDS.has(setupId);
}

function lookbackRows(valuationRows: SnapshotRow[], amount: number, unit: string): SnapshotRow[] {
  const periods = Math.max(1, Math.round(amount * (unit === "d" ? 24 : 1)));
  return valuationRows.slice(-Math.min(valuationRows.length, periods));
}

function valuesForKey(rows: SnapshotRow[], key: string): number[] {
  return rows.map((row) => num(row[key])).filter((value): value is number => value !== null);
}

function percentileRank(values: number[], current: number): number | null {
  if (values.length === 0) return null;
  const belowOrEqual = values.filter((value) => value <= current).length;
  return (belowOrEqual / values.length) * 100;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], avg: number): number | null {
  if (values.length < 2) return null;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function derivedHypothesisConditionValue(key: string, valuationRows: SnapshotRow[]): number | null {
  const latestRow = valuationRows[valuationRows.length - 1];
  if (!latestRow) return null;

  const pctFromExtreme = key.match(/^(.+)_pct_from_(\d+)(h|d)_(high|low)$/);
  if (pctFromExtreme) {
    const [, baseKey, amount, unit, extreme] = pctFromExtreme;
    const current = num(latestRow[baseKey]);
    const values = valuesForKey(lookbackRows(valuationRows, Number(amount), unit), baseKey);
    if (current === null || values.length === 0) return null;
    const reference = extreme === "high" ? Math.max(...values) : Math.min(...values);
    return reference === 0 ? null : ((current - reference) / reference) * 100;
  }

  const pctVsSma = key.match(/^(.+)_pct_vs_(\d+)(h|d)_sma$/);
  if (pctVsSma) {
    const [, baseKey, amount, unit] = pctVsSma;
    const current = num(latestRow[baseKey]);
    const avg = mean(valuesForKey(lookbackRows(valuationRows, Number(amount), unit), baseKey));
    return current === null || avg === null || avg === 0 ? null : ((current - avg) / avg) * 100;
  }

  const percentile = key.match(/^(.+)_percentile_(\d+)(h|d)$/);
  if (percentile) {
    const [, baseKey, amount, unit] = percentile;
    const current = num(latestRow[baseKey]);
    const values = valuesForKey(lookbackRows(valuationRows, Number(amount), unit), baseKey);
    return current === null ? null : percentileRank(values, current);
  }

  const zscore = key.match(/^(.+)_zscore_(\d+)(h|d)$/);
  if (zscore) {
    const [, baseKey, amount, unit] = zscore;
    const current = num(latestRow[baseKey]);
    const values = valuesForKey(lookbackRows(valuationRows, Number(amount), unit), baseKey);
    const avg = mean(values);
    const sd = avg === null ? null : standardDeviation(values, avg);
    return current === null || avg === null || sd === null || sd === 0 ? null : (current - avg) / sd;
  }

  const changePct = key.match(/^(.+)_change_pct_(\d+)(h|d)$/);
  if (changePct) {
    const [, baseKey, amount, unit] = changePct;
    const periods = Math.max(1, Math.round(Number(amount) * (unit === "d" ? 24 : 1)));
    const current = num(latestRow[baseKey]);
    const priorRow = valuationRows[Math.max(0, valuationRows.length - 1 - periods)];
    const prior = priorRow ? num(priorRow[baseKey]) : null;
    return current === null || prior === null || prior === 0 ? null : ((current - prior) / prior) * 100;
  }

  return null;
}

function conditionAsset(hypothesis: Hypothesis): string | null {
  const raw = hypothesis.conditions?.asset;
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/^["']|["']$/g, "");
  const listMatch = cleaned.match(/^in\s*\[?(.+?)\]?$/i);
  const first = (listMatch ? listMatch[1] : cleaned).split(/[,|]/)[0]?.trim();
  return first ? first.replace(/^["']|["']$/g, "").toUpperCase() : null;
}

function reduceRelativeValues(values: number[], reducer: "max" | "min" | "avg"): number | null {
  if (values.length === 0) return null;
  if (reducer === "max") return Math.max(...values);
  if (reducer === "min") return Math.min(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function relativeValueConditionValue(
  key: string,
  relativeValueRows: RelativeValueObservation[],
  hypothesis: Hypothesis,
): number | null {
  const match = key.match(/^([a-z]+)_pm_(underlying_cap|settle)_(ratio|edge_pts|yes_sum|overround|tail_yes|skew_yes)_(max|min|avg)(_tight)?$/);
  if (match) {
    const [, rawAsset, group, metric, reducer, tightOnly] = match;
    const asset = rawAsset.toUpperCase();
    const values = relativeValueRows
      .filter((row) => row.asset === asset)
      .filter((row) => group !== "underlying_cap" || (row.direction === "above" && row.underlyingCapYes !== null))
      .filter((row) => group !== "settle" || row.settlementYesSum !== null)
      .filter((row) => !tightOnly || (
        row.pmSpread !== null
        && row.pmSpread <= UNDERLYING_CAP_ENTRY_MAX_SPREAD
        && row.liquidity !== null
        && row.liquidity >= UNDERLYING_CAP_ENTRY_MIN_LIQUIDITY
      ))
      .map((row) => {
        if (metric === "ratio") return row.pmToUnderlyingCapRatio;
        if (metric === "edge_pts") return row.edgePts;
        if (metric === "yes_sum") return row.settlementYesSum;
        if (metric === "overround") return row.settlementOverround;
        if (metric === "tail_yes") return row.settlementTailYes;
        if (metric === "skew_yes") return row.settlementSkewYes;
        return null;
      })
      .filter((value): value is number => value !== null);
    return reduceRelativeValues(values, reducer as "max" | "min" | "avg");
  }

  const perpMatch = key.match(/^([a-z]+)_hl_(funding_ann|oi|basis_pct)$/);
  if (perpMatch) {
    const [, rawAsset, metric] = perpMatch;
    const values = relativeValueRows
      .filter((row) => row.asset === rawAsset.toUpperCase())
      .map((row) => {
        if (metric === "funding_ann") return row.perpFundingAnn ?? null;
        if (metric === "oi") return row.perpOiUsd ?? null;
        return row.perpBasisPct ?? null;
      })
      .filter((value): value is number => value !== null);
    return reduceRelativeValues(values, "avg");
  }

  const asset = conditionAsset(hypothesis);
  const scopedRows = asset ? relativeValueRows.filter((row) => row.asset === asset) : relativeValueRows;
  const values = scopedRows
    .map((row) => {
      if (key === "sell_yes_edge_pts") return row.sellYesEdgePts ?? null;
      if (key === "yesAsk") return row.pmAsk;
      if (key === "yesSpread") return row.pmSpread;
      if (key === "liquidity") return row.liquidity;
      if (key === "smart_flow_stance") return row.smartFlowStance ?? null;
      if (key === "smart_flow_net_yes") return row.smartFlowNetYes ?? null;
      // Encode touch direction so hyps can gate highs vs dips numerically.
      if (key === "touch_direction") return row.direction === "above" ? 1 : row.direction === "below" ? -1 : null;
      if (key === "days_to_expiry") return rowDaysToExpiry(row);
      // Vol points: rv-file IVs are decimals (0.14 = 14%), catalog exposes points.
      if (key === "pm_iv_minus_opt_iv_pts") {
        return row.pmIv !== null && row.optionIv !== null ? (row.pmIv - row.optionIv) * 100 : null;
      }
      if (key === "adjusted_no_gap_pts") return row.adjustedNoGapPts;
      return null;
    })
    .filter((value): value is number => value !== null);
  if (key === "yesAsk" || key === "yesSpread") return reduceRelativeValues(values, "min");
  // MIN so "days_to_expiry <= 5" targets the nearest-expiry scoped contract.
  if (key === "days_to_expiry") return reduceRelativeValues(values, "min");
  if (key === "sell_yes_edge_pts" || key === "liquidity" || key === "smart_flow_net_yes") {
    return reduceRelativeValues(values, "max");
  }
  if (key === "smart_flow_stance" || key === "touch_direction") return reduceRelativeValues(values, "max");
  if (key === "pm_iv_minus_opt_iv_pts" || key === "adjusted_no_gap_pts") return reduceRelativeValues(values, "max");
  return null;
}

/** Parses rv timestamps that may be hour-truncated ("2026-07-28T23"). */
function looseTimeMs(value: string): number | null {
  if (!value) return null;
  const normalized = /T\d{2}$/.test(value) ? `${value}:00:00Z` : value;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

/** Days from the observation's own timestamp to contract expiry — correct
 * both live (timestamp ≈ now) and in walk-forward backfill (historic rows). */
function rowDaysToExpiry(row: RelativeValueObservation): number | null {
  const expiryMs = looseTimeMs(row.expiry);
  const observedMs = looseTimeMs(row.timestamp);
  if (expiryMs === null || observedMs === null) return null;
  return (expiryMs - observedMs) / 86_400_000;
}

function hypothesisConditionValue(
  key: string,
  valuationRows: SnapshotRow[],
  hypothesis: Hypothesis,
  relativeValueRows: RelativeValueObservation[] = [],
): number | null {
  const latestRow = valuationRows[valuationRows.length - 1];
  const previousRow = valuationRows.length > 1 ? valuationRows[valuationRows.length - 2] : null;
  if (!latestRow) return null;
  if (key.startsWith("previous_")) return previousRow ? num(previousRow[key.replace(/^previous_/, "")]) : null;
  const direct = num(latestRow[key]);
  if (direct !== null) return direct;
  const derived = derivedHypothesisConditionValue(key, valuationRows);
  if (derived !== null) return derived;
  const relativeValue = relativeValueConditionValue(key, relativeValueRows, hypothesis);
  if (relativeValue !== null) return relativeValue;

  if (key === "ratio") {
    const pmIvKey = Object.keys(hypothesis.conditions).find((conditionKey) => conditionKey.endsWith("_pm_iv"));
    const optIvKey = Object.keys(hypothesis.conditions).find((conditionKey) => conditionKey.includes("_opt_iv"));
    const pmIv = pmIvKey ? num(latestRow[pmIvKey]) : null;
    const optIv = optIvKey ? num(latestRow[optIvKey]) : null;
    if (pmIv !== null && optIv !== null && optIv !== 0) return pmIv / optIv;
  }

  return null;
}

/** Metadata condition keys: scope the hypothesis rather than compare a
 * numeric value. Kept in sync with the condition catalog and the backfill's
 * BACKFILL_META_CONDITION_KEYS. */
export const HYPOTHESIS_METADATA_CONDITION_KEYS = new Set(["asset", "venue", "signalType", "day_of_week"]);

function parseMetadataListExpression(rawExpression: string): string[] {
  const expression = String(rawExpression).trim();
  const list = expression.match(/^in\s*\[?(.+?)\]?$/i);
  const body = list ? list[1] : expression.replace(/^(=|==)\s*/, "");
  return body
    .split(/[,|]/)
    .map((value) => value.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean);
}

export function evaluateHypothesisCondition(
  key: string,
  rawExpression: string,
  valuationRows: SnapshotRow[],
  hypothesis: Hypothesis,
  relativeValueRows: RelativeValueObservation[] = [],
): boolean {
  const latestRow = valuationRows[valuationRows.length - 1];
  const previousRow = valuationRows.length > 1 ? valuationRows[valuationRows.length - 2] : null;

  if (HYPOTHESIS_METADATA_CONDITION_KEYS.has(key)) {
    // day_of_week is genuinely evaluable from the decision row's date.
    if (key === "day_of_week") {
      const dateMs = latestRow ? Date.parse(String(latestRow.date)) : NaN;
      if (!Number.isFinite(dateMs)) return false;
      const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(dateMs).getUTCDay()];
      return parseMetadataListExpression(rawExpression).some((allowed) => allowed.slice(0, 3) === weekday);
    }
    // asset / venue / signalType scope which market rows the other keys read
    // (see conditionAsset); as standalone conditions they always pass. This
    // mirrors the backfill's metadata handling — previously the live path
    // returned false for these keys, silently disabling any hypothesis that
    // carried them.
    return true;
  }

  const expression = String(rawExpression).trim().toLowerCase().replace(/%/g, "");
  const value = hypothesisConditionValue(key, valuationRows, hypothesis, relativeValueRows);
  const previousValue = key.startsWith("previous_")
    ? null
    : previousRow ? num(previousRow[key]) : null;

  const between = expression.match(/^between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/);
  if (between) {
    if (value === null) return false;
    const low = Number(between[1]);
    const high = Number(between[2]);
    return value >= low && value <= high;
  }

  const absChange = expression.match(/^abs\(current\s*-\s*previous\)\s*([<>]=?)\s*(-?\d+(?:\.\d+)?)/);
  if (absChange) {
    if (value === null || previousValue === null) return false;
    const delta = Math.abs(value - previousValue);
    const threshold = Number(absChange[2]);
    return absChange[1].startsWith(">") ? delta > threshold : delta < threshold;
  }

  const declining = expression.match(/^declining\s*>\s*(-?\d+(?:\.\d+)?)/);
  if (declining) {
    if (value === null || previousValue === null) return false;
    return previousValue - value > Number(declining[1]);
  }

  if (expression.includes("changes sign")) {
    if (value === null || previousValue === null) return false;
    return Math.sign(value) !== 0 && Math.sign(previousValue) !== 0 && Math.sign(value) !== Math.sign(previousValue);
  }

  const dailyChange = expression.match(/^<\s*(-?\d+(?:\.\d+)?)\s*daily change/);
  if (dailyChange) {
    if (value === null || previousValue === null || previousValue === 0) return false;
    return Math.abs(((value - previousValue) / previousValue) * 100) < Number(dailyChange[1]);
  }

  const comparison = expression.match(/^([<>]=?|=|==)\s*(-?\d+(?:\.\d+)?)/);
  if (comparison) {
    if (value === null) return false;
    const threshold = Number(comparison[2]);
    switch (comparison[1]) {
      case ">": return value > threshold;
      case ">=": return value >= threshold;
      case "<": return value < threshold;
      case "<=": return value <= threshold;
      case "=":
      case "==": return value === threshold;
    }
  }

  return false;
}

export function hypothesisConditionsSatisfied(
  hypothesis: Hypothesis,
  valuationRows: SnapshotRow[],
  relativeValueRows: RelativeValueObservation[] = [],
): boolean {
  const latestRow = valuationRows[valuationRows.length - 1];
  if (!latestRow) return false;
  const entries = Object.entries(hypothesis.conditions ?? {});
  if (entries.length === 0) return false;
  return entries.every(([key, expression]) => evaluateHypothesisCondition(key, String(expression), valuationRows, hypothesis, relativeValueRows));
}

/** Rows sampled when estimating how often a hypothesis would fire. Roughly a
 * quarter of hourly history — long enough to span regimes, short enough that
 * the estimate reflects the market the hypothesis will actually trade. */
export const TRIGGER_ESTIMATE_WINDOW_ROWS = 720;
/** Minimum historical rows required before the rarity gate may reject anything. */
export const TRIGGER_ESTIMATE_MIN_ROWS = 120;
/**
 * A hypothesis must plausibly fire this often to be worth a test slot. At 1/week
 * a family still needs ~20 weeks to reach HYPOTHESIS_SHADOW_TESTS_REQUIRED, so
 * this is a floor on testability rather than an ambition: below it, the idea
 * cannot produce a verdict on any useful horizon.
 */
export const MIN_TRIGGERS_PER_WEEK = 1.0;

/**
 * Longest test horizon an idea may claim.
 *
 * A pending test resolves only after timeframeDays elapses, and a variant is
 * never given a second concurrent test, because overlapping windows on the same
 * conditions are near-duplicate observations rather than independent evidence.
 * So the horizon, not the trigger rate, sets how fast a family accumulates: one
 * test per variant per horizon. At the old 14- and 30-day horizons a family
 * needed most of a year to reach a verdict.
 */
export const MAX_TEST_HORIZON_DAYS = 7;

/**
 * Longest acceptable wait for a family to reach a verdict, in weeks.
 *
 * One quarter. Every admitted idea has to be capable of being decided inside a
 * research cycle, or it occupies a family slot indefinitely without ever
 * producing an answer — which is what left 25 families holding a median of six
 * completed tests and none of them at the 20 the promotion gate requires.
 */
export const MAX_WEEKS_TO_VERDICT = 13;

/**
 * Max concurrent pending tests one Polymarket-contract variant may hold.
 *
 * A contract thesis names a specific instrument per test, so simultaneous
 * tests on *distinct* contracts are distinct observations — different strikes,
 * expiries, and events — unlike a spot thesis, where two overlapping tests
 * would grade the same price path twice. Without this, a 7-day contract
 * horizon caps a single-variant family at 1 test/week and 20 required tests
 * can never fit inside MAX_WEEKS_TO_VERDICT; the outcome-panel NO-edge
 * hypotheses were rejected at ingest for exactly that arithmetic. Four matches
 * the shadow-mined per-family allowance; the outcomes remain correlated
 * through market-wide beta, which is the same compromise sibling variants
 * already accept.
 */
export const PM_CONTRACT_MAX_PENDING_PER_VARIANT = 4;

export interface VerdictTimeEstimate {
  /** Independent tests the family can accumulate per week. */
  testsPerWeek: number;
  /** Weeks to reach HYPOTHESIS_SHADOW_TESTS_REQUIRED, Infinity if never. */
  weeksToVerdict: number;
  /** Which constraint binds: the horizon or how often conditions hold. */
  boundBy: "horizon" | "trigger_rate";
}

/**
 * How long this idea would take to earn a verdict.
 *
 * Accumulation is limited by two independent things and takes the worse of
 * them: conditions have to actually hold (triggersPerWeek), and each variant
 * yields at most concurrentPerVariant tests per horizon. Counting sibling
 * variants is what lets a slower thesis still qualify by being expressed
 * several ways, which is the honest route to more samples — distinct
 * conditions produce distinct observations. Contract theses get the same
 * credit through concurrentPerVariant, because their concurrent tests enter
 * distinct instruments; spot theses must leave it at 1, since overlapping
 * tests there would grade the same price path twice.
 */
export function estimateWeeksToVerdict(
  timeframeDays: number,
  triggersPerWeek: number,
  siblingVariants = 1,
  concurrentPerVariant = 1,
): VerdictTimeEstimate {
  const horizon = Math.max(timeframeDays, 0.5);
  const variants = Math.max(siblingVariants, 1);
  const concurrent = Math.max(concurrentPerVariant, 1);
  const horizonCapacity = (variants * concurrent * 7) / horizon;
  const testsPerWeek = Math.min(horizonCapacity, Math.max(triggersPerWeek, 0));
  return {
    testsPerWeek,
    weeksToVerdict: testsPerWeek > 0 ? HYPOTHESIS_SHADOW_TESTS_REQUIRED / testsPerWeek : Number.POSITIVE_INFINITY,
    boundBy: horizonCapacity <= triggersPerWeek ? "horizon" : "trigger_rate",
  };
}

export function isTooSlowToVerdict(estimate: VerdictTimeEstimate): boolean {
  return estimate.weeksToVerdict > MAX_WEEKS_TO_VERDICT;
}

export interface TriggerFrequencyEstimate {
  rowsEvaluated: number;
  triggers: number;
  windowDays: number;
  triggersPerWeek: number;
  /** False when the estimate cannot be trusted — callers must not reject then. */
  reliable: boolean;
  /** Why the estimate is untrustworthy, when it is. */
  unreliableReason?: "insufficient_history" | "not_replayable";
}

/**
 * True when every condition can be replayed against valuation history.
 *
 * Market-row and relative-value-aggregate keys read the engine's *current*
 * Polymarket contract rows, of which only a recent snapshot is retained — there
 * is no per-hour history to replay them over. Estimating a trigger rate for
 * those conditions produces a number that looks precise and means nothing, and
 * measuring it against real families showed it wrongly scoring the most
 * productive heatmap families at zero. Such hypotheses are therefore exempt
 * from the rarity gate rather than judged by an estimate that cannot see them.
 */
export function conditionsReplayableFromValuationHistory(
  hypothesis: Hypothesis,
  valuationRows: SnapshotRow[],
): boolean {
  const sample = valuationRows[valuationRows.length - 1];
  if (!sample) return false;
  const keys = Object.keys(hypothesis.conditions ?? {});
  let dataKeys = 0;

  for (const key of keys) {
    if (METADATA_CONDITION_KEYS.has(key)) continue;
    if (MARKET_ROW_CONDITION_KEYS.has(key)) return false;
    if (RELATIVE_VALUE_AGG_PATTERN.test(key)) return false;
    dataKeys++;
    if (key in sample) continue;
    const derived = DERIVED_KEY_PATTERN.exec(key);
    if (derived && derived[1] in sample) continue;
    // An unrecognised key cannot be replayed, so it cannot be judged either.
    return false;
  }
  // All-metadata conditions (asset/venue only) hold on every row by construction,
  // so a rate computed from them says nothing about the thesis.
  return dataKeys > 0;
}

/**
 * Estimates how often a hypothesis's conditions would have fired, by replaying
 * them point-in-time across recent history.
 *
 * Note that an unevaluable condition and a never-true condition are the same
 * event here, and both should be rejected: either way the engine will never
 * open a test, which is precisely the failure this gate exists to prevent.
 * Relative-value history is passed whole rather than sliced, which can only
 * over-estimate the rate — the gate errs toward admitting hypotheses.
 */
export function estimateTriggerFrequency(
  hypothesis: Hypothesis,
  valuationRows: SnapshotRow[],
  relativeValueRows: RelativeValueObservation[] = [],
  windowRows: number = TRIGGER_ESTIMATE_WINDOW_ROWS,
): TriggerFrequencyEstimate {
  const start = Math.max(0, valuationRows.length - windowRows);
  const sampled = valuationRows.slice(start);
  const rowsEvaluated = sampled.length;

  if (rowsEvaluated < TRIGGER_ESTIMATE_MIN_ROWS) {
    return {
      rowsEvaluated, triggers: 0, windowDays: 0, triggersPerWeek: 0,
      reliable: false, unreliableReason: "insufficient_history",
    };
  }
  if (!conditionsReplayableFromValuationHistory(hypothesis, valuationRows)) {
    return {
      rowsEvaluated, triggers: 0, windowDays: 0, triggersPerWeek: 0,
      reliable: false, unreliableReason: "not_replayable",
    };
  }

  let triggers = 0;
  for (let i = 0; i < rowsEvaluated; i++) {
    const history = valuationRows.slice(0, start + i + 1);
    if (hypothesisConditionsSatisfied(hypothesis, history, relativeValueRows)) triggers++;
  }

  const days = new Set(sampled.map((row) => String(row.date ?? "").slice(0, 10)).filter(Boolean));
  const windowDays = days.size > 0 ? days.size : rowsEvaluated / 24;
  const triggersPerWeek = windowDays > 0 ? (triggers / windowDays) * 7 : 0;

  return { rowsEvaluated, triggers, windowDays, triggersPerWeek, reliable: true };
}

/**
 * True when a hypothesis fires too rarely to ever accumulate a verdict.
 * Half of all active setup families were on track to need six months or more to
 * reach the promotion bar, because nothing checked testability before admitting
 * an idea.
 */
export function isTriggerTooRare(estimate: TriggerFrequencyEstimate): boolean {
  if (!estimate.reliable) return false;
  return estimate.triggersPerWeek < MIN_TRIGGERS_PER_WEEK;
}

export function hasRegimeRelativeConditions(hypothesis: Hypothesis): boolean {
  return Object.keys(hypothesis.conditions ?? {}).some((key) => (
    /^.+_pct_from_\d+[hd]_(high|low)$/.test(key)
    || /^.+_pct_vs_\d+[hd]_sma$/.test(key)
    || /^.+_percentile_\d+[hd]$/.test(key)
    || /^.+_zscore_\d+[hd]$/.test(key)
    || /^.+_change_pct_\d+[hd]$/.test(key)
  ));
}
