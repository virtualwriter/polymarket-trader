import { slugifySetupId } from "../trading/setup-family.js";

export interface HypothesisTest {
  date: string;
  triggered: boolean;
  outcome: "win" | "loss" | "pending";
  actualMove: string;
  excludedFromSetupStats?: boolean;
  exclusionReason?: string;
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
  rawRow?: Record<string, string>;
}

const UNDERLYING_CAP_ENTRY_MAX_SPREAD = 0.02;
const UNDERLYING_CAP_ENTRY_MIN_LIQUIDITY = 1000;

export const HYPOTHESIS_SHADOW_TESTS_REQUIRED = 20;
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

export interface HypothesisEvalResult {
  outcome: "win" | "loss";
  actualMove: string;
  /** False when the hyp cannot be scored honestly — callers must exclude from setup stats. */
  scorable: boolean;
  method: string;
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
    };
  }
  if (direction === "long") {
    return {
      outcome: movePct >= thresholdPct ? "win" : "loss",
      actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx}) [long needs ≥ +${thresholdPct}%]`,
      scorable: true,
      method: "spot_directional_long",
    };
  }
  return {
    outcome: Math.abs(movePct) >= thresholdPct ? "win" : "loss",
    actualMove: `${asset} moved ${movePct.toFixed(2)}% (${startPx} → ${endPx}) [neutral abs needs ≥ ${thresholdPct}%]`,
    scorable: true,
    method: "spot_abs_move",
  };
}

function isPolymarketExpression(hypothesis: Hypothesis): boolean {
  const venue = String(hypothesis.conditions?.venue ?? "").toLowerCase();
  const signal = String(hypothesis.conditions?.signalType ?? "").toUpperCase();
  return venue === "polymarket"
    || signal.includes("ONE_TOUCH")
    || signal.includes("NO_BIAS")
    || signal.includes("PM_");
}

/**
 * Score a completed shadow test.
 *
 * Rules (scorer v2):
 * 1. Prefer explicit hypothesis.direction over prediction-string heuristics.
 * 2. Never default shorts to "underlying must rise".
 * 3. Funding keys must be *_hl_funding_ann (not percentiles); missing funding falls through.
 * 4. If direction and asset/price cannot be determined, return scorable=false so callers exclude the test.
 */
export function evaluateHypothesisTest(
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
        };
      }

      // Weekend / funding-reversion longs: funding rising (normalizing) counts as win when no mark.
      if (direction === "long" || /reversion|normaliz/.test(prediction)) {
        return {
          outcome: endFunding > startFunding ? "win" : "loss",
          actualMove: `Funding moved ${startFunding.toFixed(1)}% → ${endFunding.toFixed(1)}% (long reversion needs increase)`,
          scorable: true,
          method: "funding_normalize_up",
        };
      }
      if (direction === "short") {
        return {
          outcome: endFunding < startFunding ? "win" : "loss",
          actualMove: `Funding moved ${startFunding.toFixed(1)}% → ${endFunding.toFixed(1)}% (short needs decrease)`,
          scorable: true,
          method: "funding_decrease",
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
    const scored = scoreDirectionalMove(movePct, direction, thresholdPct, asset, startPx, endPx);
    if (isPolymarketExpression(hypothesis)) {
      return {
        ...scored,
        actualMove: `${scored.actualMove} [underlying proxy for PM/one-touch]`,
        method: `${scored.method}_pm_underlying_proxy`,
      };
    }
    return scored;
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

export function hypothesisSetupNeedsMoreShadowTests(
  family: HypothesisSetupFamily,
  sources: ReadonlySet<string> = new Set(["llm"]),
): boolean {
  if (!family.hypotheses.some((hypothesis) => sources.has(hypothesis.source))) return false;
  if (!family.hypotheses.some((hypothesis) => hypothesis.status !== "killed" && hypothesis.status !== "archived")) return false;
  return family.completed.length < HYPOTHESIS_SHADOW_TESTS_REQUIRED;
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
      return null;
    })
    .filter((value): value is number => value !== null);
  if (key === "yesAsk" || key === "yesSpread") return reduceRelativeValues(values, "min");
  if (key === "sell_yes_edge_pts" || key === "liquidity" || key === "smart_flow_net_yes") {
    return reduceRelativeValues(values, "max");
  }
  if (key === "smart_flow_stance" || key === "touch_direction") return reduceRelativeValues(values, "max");
  return null;
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

export function evaluateHypothesisCondition(
  key: string,
  rawExpression: string,
  valuationRows: SnapshotRow[],
  hypothesis: Hypothesis,
  relativeValueRows: RelativeValueObservation[] = [],
): boolean {
  const latestRow = valuationRows[valuationRows.length - 1];
  const previousRow = valuationRows.length > 1 ? valuationRows[valuationRows.length - 2] : null;
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

export function hasRegimeRelativeConditions(hypothesis: Hypothesis): boolean {
  return Object.keys(hypothesis.conditions ?? {}).some((key) => (
    /^.+_pct_from_\d+[hd]_(high|low)$/.test(key)
    || /^.+_pct_vs_\d+[hd]_sma$/.test(key)
    || /^.+_percentile_\d+[hd]$/.test(key)
    || /^.+_zscore_\d+[hd]$/.test(key)
    || /^.+_change_pct_\d+[hd]$/.test(key)
  ));
}
