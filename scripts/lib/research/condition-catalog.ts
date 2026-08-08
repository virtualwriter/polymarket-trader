/**
 * Condition-key catalog: the single source of truth for every hypothesis
 * condition key the engine can evaluate.
 *
 * Three consumers are kept in lockstep so the LLM ⇄ engine vocabulary can
 * never silently drift again:
 *
 *  1. The nightly research prompt embeds `buildConditionCatalogPromptSection`
 *     — the model only ever sees keys defined here, with their definitions.
 *  2. Engine ingest calls `validateHypothesisConditions` — a hypothesis using
 *     a key or expression outside this catalog is rejected before it enters
 *     the book (reject reason `unevaluable_conditions`).
 *  3. `condition-catalog.test.ts` executes every catalog example through the
 *     real `evaluateHypothesisCondition`, so a definition cannot ship unless
 *     the engine provably evaluates it exactly as described.
 *
 * To add a new condition key: implement it in hypothesis-shadow-eval.ts,
 * add a catalog entry here with a definition + example, and the tests will
 * fail until both sides agree. The nightly prompt picks it up automatically.
 */

export interface ConditionCatalogEntry {
  /** Concrete key ("sell_yes_edge_pts") or human-readable pattern label
   * ("<column>_zscore_<N>h|d") shown to the LLM. */
  label: string;
  kind: "metadata" | "market_row" | "valuation_column" | "derived" | "relative_value";
  /** LLM-facing definition. Must describe exactly what the engine computes. */
  definition: string;
  /** Example condition, executed against the engine by the catalog tests. */
  example: { key: string; expression: string };
  /** Omit from the prompt (legacy/internal keys kept only for validation). */
  advertise?: boolean;
}

/** Metadata keys: scope which markets/times the hypothesis applies to. */
export const METADATA_CONDITION_KEYS = new Set(["asset", "venue", "signalType", "day_of_week"]);

/**
 * Market-row keys: evaluated against the engine's current Polymarket contract
 * rows (cross-venue relative-value observations), scoped to the hypothesis's
 * `asset` condition when present. Must match relativeValueConditionValue in
 * hypothesis-shadow-eval.ts.
 */
export const MARKET_ROW_CONDITION_KEYS = new Set([
  "sell_yes_edge_pts",
  "yesAsk",
  "yesSpread",
  "liquidity",
  "smart_flow_stance",
  "smart_flow_net_yes",
  "touch_direction",
  "days_to_expiry",
  "pm_iv_minus_opt_iv_pts",
  "adjusted_no_gap_pts",
]);

export const DERIVED_KEY_PATTERN = /^(.+)_(pct_from_\d+[hd]_(high|low)|pct_vs_\d+[hd]_sma|percentile_\d+[hd]|zscore_\d+[hd]|change_pct_\d+[hd])$/;
export const RELATIVE_VALUE_AGG_PATTERN = /^([a-z]+)_pm_(underlying_cap|settle)_(ratio|edge_pts|yes_sum|overround|tail_yes|skew_yes)_(max|min|avg)(_tight)?$/;
const PERP_KEY_PATTERN = /^([a-z0-9]+)_hl_(funding_ann|oi|basis_pct)$/;

export const CONDITION_CATALOG: ConditionCatalogEntry[] = [
  // ── Metadata ──────────────────────────────────────────────────────────────
  {
    label: "asset",
    kind: "metadata",
    definition:
      "Scopes all market-row keys below to one asset's Polymarket contracts (BTC, ETH, HYPE, GOLD, OIL, AMZN, SPY, ...). "
      + "Expression is the bare symbol (\"OIL\") or a list (\"in [OIL, GOLD]\"). Metadata only — it gates scope, not a numeric value.",
    example: { key: "asset", expression: "OIL" },
  },
  {
    label: "day_of_week",
    kind: "metadata",
    definition:
      "Restricts the hypothesis to specific weekdays (UTC, evaluated at the engine's decision time). "
      + "Expression is a list of 3-letter day names: \"in [sat, sun]\" or a single day \"mon\".",
    example: { key: "day_of_week", expression: "in [mon, tue, wed, thu, fri, sat, sun]" },
  },
  // ── Market-row keys (current Polymarket contract rows, scoped by asset) ──
  {
    label: "sell_yes_edge_pts",
    kind: "market_row",
    definition:
      "Best sell-YES edge in probability points across the asset's open contracts (model probability below the PM bid). "
      + "Aggregated as MAX across scoped contracts: \"sell_yes_edge_pts >= 2\" means at least one contract offers ≥2pts of sell-YES edge.",
    example: { key: "sell_yes_edge_pts", expression: ">= 1" },
  },
  {
    label: "yesAsk",
    kind: "market_row",
    definition:
      "Lowest YES ask price (0-1) across the asset's scoped contracts (MIN aggregation). "
      + "\"yesAsk <= 0.15\" means some contract's YES side can be bought at ≤15c.",
    example: { key: "yesAsk", expression: "<= 0.99" },
  },
  {
    label: "yesSpread",
    kind: "market_row",
    definition:
      "Tightest YES bid-ask spread (0-1) across the asset's scoped contracts (MIN aggregation). "
      + "\"yesSpread <= 0.03\" means at least one contract trades with a spread of ≤3c.",
    example: { key: "yesSpread", expression: "<= 0.5" },
  },
  {
    label: "liquidity",
    kind: "market_row",
    definition:
      "Largest order-book liquidity in USD across the asset's scoped contracts (MAX aggregation). "
      + "\"liquidity >= 5000\" means at least one contract has ≥$5k available.",
    example: { key: "liquidity", expression: ">= 100" },
  },
  {
    label: "smart_flow_stance",
    kind: "market_row",
    definition:
      "Stance of tracked smart wallets on the asset's contracts: -1 = smart money selling YES (or absent while dumb money buys), "
      + "0 = flat/unknown, +1 = smart money buying YES. Aggregated as MAX across scoped contracts, so \"smart_flow_stance <= -1\" requires "
      + "every scoped contract to show smart money short YES, and \"smart_flow_stance >= 1\" requires at least one contract with smart money long YES.",
    example: { key: "smart_flow_stance", expression: ">= -1" },
  },
  {
    label: "smart_flow_net_yes",
    kind: "market_row",
    definition:
      "Net YES position size from tracked walk-forward smart wallets (positive = net buying YES), MAX across scoped contracts.",
    example: { key: "smart_flow_net_yes", expression: "> 0" },
  },
  {
    label: "touch_direction",
    kind: "market_row",
    definition:
      "Direction of the asset's one-touch contracts: +1 = above-strike (touch-high) contracts present, -1 = only below-strike (touch-low). "
      + "MAX across scoped contracts: use \"touch_direction >= 1\" to require touch-high contracts, \"touch_direction <= -1\" for touch-low only.",
    example: { key: "touch_direction", expression: ">= 1" },
  },
  {
    label: "days_to_expiry",
    kind: "market_row",
    definition:
      "Days until the NEAREST scoped contract expires (MIN aggregation, fractional days allowed). "
      + "\"days_to_expiry <= 5\" targets near-expiry contracts; \"days_to_expiry >= 10\" means no scoped contract expires within 10 days.",
    example: { key: "days_to_expiry", expression: ">= 0" },
  },
  {
    label: "pm_iv_minus_opt_iv_pts",
    kind: "market_row",
    definition:
      "Polymarket-implied volatility minus listed-option implied volatility, in volatility points, MAX across scoped contracts. "
      + "\"pm_iv_minus_opt_iv_pts >= 10\" means at least one contract prices PM IV ≥10 vol points rich to the options market.",
    example: { key: "pm_iv_minus_opt_iv_pts", expression: ">= 10" },
  },
  {
    label: "adjusted_no_gap_pts",
    kind: "market_row",
    definition:
      "Source-agreement-adjusted NO-side gap in probability points (the no-bias signal's core input), MAX across scoped contracts. "
      + "Positive = NO looks cheap relative to adjusted fair value.",
    example: { key: "adjusted_no_gap_pts", expression: ">= 5" },
  },
  // ── Derived time-series patterns (base must be a valuation column) ────────
  {
    label: "<column>_pct_from_<N>h|d_high / <column>_pct_from_<N>h|d_low",
    kind: "derived",
    definition:
      "Percent distance of the column's latest value from its N-hour/day high or low. "
      + "e.g. btc_spot_pct_from_7d_high > -3 = within 3% of the 7-day high.",
    example: { key: "btc_spot_pct_from_7d_high", expression: "> -50" },
  },
  {
    label: "<column>_pct_vs_<N>h|d_sma",
    kind: "derived",
    definition: "Percent of latest value vs its N-hour/day simple moving average. e.g. btc_spot_pct_vs_24h_sma > 0 = above the 24h SMA.",
    example: { key: "btc_spot_pct_vs_24h_sma", expression: "> -50" },
  },
  {
    label: "<column>_percentile_<N>h|d",
    kind: "derived",
    definition: "Percentile rank (0-100) of the latest value within the trailing N-hour/day window. e.g. btc_ibit_pc_ratio_percentile_30d < 15.",
    example: { key: "btc_spot_percentile_7d", expression: ">= 0" },
  },
  {
    label: "<column>_zscore_<N>h|d",
    kind: "derived",
    definition: "Z-score of the latest value within the trailing N-hour/day window. e.g. btc_pm_iv_zscore_30d < -2.",
    example: { key: "btc_spot_zscore_7d", expression: "between -10 and 10" },
  },
  {
    label: "<column>_change_pct_<N>h|d",
    kind: "derived",
    definition: "Percent change of the column over the last N hours/days. e.g. btc_spot_change_pct_24h > 1.5.",
    example: { key: "btc_spot_change_pct_24h", expression: "> -50" },
  },
  // ── Relative-value aggregates ─────────────────────────────────────────────
  {
    label: "<asset>_pm_underlying_cap_<metric>_<max|min|avg>[_tight]",
    kind: "relative_value",
    definition:
      "Aggregate over the asset's above-strike contracts with an underlying-cap valuation; metric ∈ {ratio, edge_pts}. "
      + "e.g. oil_pm_underlying_cap_edge_pts_max >= 15. The _tight suffix restricts to tight-spread, liquid contracts.",
    example: { key: "oil_pm_underlying_cap_edge_pts_max", expression: ">= 1" },
  },
  {
    label: "<asset>_pm_settle_<metric>_<max|min|avg>",
    kind: "relative_value",
    definition:
      "Aggregate over the asset's settlement-band contracts; metric ∈ {yes_sum, overround, tail_yes, skew_yes}. "
      + "e.g. gold_pm_settle_overround_max >= 5.",
    example: { key: "gold_pm_settle_yes_sum_max", expression: ">= 0" },
  },
  {
    label: "<asset>_hl_funding_ann / <asset>_hl_oi / <asset>_hl_basis_pct",
    kind: "relative_value",
    definition:
      "Hyperliquid perp metrics for the asset: annualized funding rate in percent (e.g. -50 = -50%/yr), open interest in USD, spot-perp basis in percent. "
      + "Reads the valuation column when one exists, else averages live perp observations.",
    example: { key: "cbrs_hl_funding_ann", expression: "< 0" },
  },
];

// ── Aliases: common wrong names → the catalog key ─────────────────────────
// Used for reject-note suggestions and by the one-off repair script.
export const CONDITION_KEY_ALIASES: Record<string, string> = {
  contract_expiry_days: "days_to_expiry",
  contract_days_to_expiry: "days_to_expiry",
  expiry_days: "days_to_expiry",
  dte_days: "days_to_expiry",
  yes_spread: "yesSpread",
  yes_ask: "yesAsk",
  no_bias_adjusted_gap: "adjusted_no_gap_pts",
  adjusted_no_gap: "adjusted_no_gap_pts",
  pm_iv_gt_opt_iv_pps: "pm_iv_minus_opt_iv_pts",
  pm_iv_minus_opt_iv_30d: "pm_iv_minus_opt_iv_pts",
  pm_iv_minus_opt_iv: "pm_iv_minus_opt_iv_pts",
  one_touch_direction: "touch_direction",
};

export function suggestConditionKey(key: string): string | null {
  if (CONDITION_KEY_ALIASES[key]) return CONDITION_KEY_ALIASES[key];
  // "<asset>_one_touch_sell_yes_edge_pts" → generic key + asset scoping.
  if (/^[a-z0-9]+_one_touch_sell_yes_edge_pts$/.test(key)) return "sell_yes_edge_pts";
  if (/^[a-z0-9]+_sell_yes_edge_pts$/.test(key)) return "sell_yes_edge_pts";
  const spaceless = key.replace(/\s+/g, "_");
  if (spaceless !== key && MARKET_ROW_CONDITION_KEYS.has(spaceless)) return spaceless;
  return null;
}

// ── Expression validation ───────────────────────────────────────────────────
// Mirrors evaluateHypothesisCondition exactly: an expression is valid here
// if and only if the engine's evaluator has a branch that parses it.
const NUMERIC_EXPRESSION_PATTERNS: RegExp[] = [
  /^between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/,
  /^abs\(current\s*-\s*previous\)\s*([<>]=?)\s*(-?\d+(?:\.\d+)?)/,
  /^declining\s*>\s*(-?\d+(?:\.\d+)?)/,
  /^<\s*(-?\d+(?:\.\d+)?)\s*daily change/,
  /^([<>]=?|=|==)\s*(-?\d+(?:\.\d+)?)\s*$/,
];

export function isValidNumericConditionExpression(rawExpression: string): boolean {
  const expression = String(rawExpression).trim().toLowerCase().replace(/%/g, "");
  if (expression.includes("changes sign")) return true;
  return NUMERIC_EXPRESSION_PATTERNS.some((pattern) => pattern.test(expression));
}

function isValidMetadataExpression(rawExpression: string): boolean {
  const expression = String(rawExpression).trim();
  if (expression.length === 0) return false;
  // Bare value, "= value", or "in [a, b]" — anything list-parseable.
  return /^(in\s*\[?[\w\s,"'|-]+\]?|(=|==)?\s*[\w"'-]+(\s*[,|]\s*[\w"'-]+)*)$/i.test(expression);
}

export interface ConditionValidationIssue {
  key: string;
  expression: string;
  reason:
    | "unknown_key"
    | "unknown_valuation_column"
    | "derived_base_unknown"
    | "invalid_expression"
    | "invalid_metadata_expression";
  suggestion: string | null;
}

function expressionSuggestion(rawExpression: string): string | null {
  const expression = String(rawExpression).trim();
  // En-dash or hyphen range like "1.0–3.0" → engine's between syntax.
  const range = expression.match(/^(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)$/);
  if (range) return `between ${range[1]} and ${range[2]}`;
  return null;
}

/**
 * Validates a hypothesis's conditions against the catalog. Returns an empty
 * array when every key is evaluable by the engine and every expression is
 * parseable by evaluateHypothesisCondition.
 */
export function validateHypothesisConditions(
  conditions: Record<string, unknown>,
  valuationColumns: Iterable<string>,
): ConditionValidationIssue[] {
  const columns = valuationColumns instanceof Set ? valuationColumns as Set<string> : new Set(valuationColumns);
  const issues: ConditionValidationIssue[] = [];
  const keys = Object.keys(conditions ?? {});

  for (const key of keys) {
    const expression = String(conditions[key] ?? "");

    if (METADATA_CONDITION_KEYS.has(key)) {
      if (!isValidMetadataExpression(expression)) {
        issues.push({ key, expression, reason: "invalid_metadata_expression", suggestion: null });
      }
      continue;
    }

    const baseKey = key.startsWith("previous_") ? key.slice("previous_".length) : key;
    let keyKnown = false;

    if (MARKET_ROW_CONDITION_KEYS.has(baseKey)) {
      keyKnown = true;
    } else if (baseKey === "ratio") {
      // Legacy PM-IV/opt-IV ratio: evaluable only alongside sibling *_pm_iv
      // and *_opt_iv condition keys (see hypothesisConditionValue). Not
      // advertised to the LLM — pm_iv_minus_opt_iv_pts supersedes it.
      keyKnown = keys.some((k) => k.endsWith("_pm_iv")) && keys.some((k) => k.includes("_opt_iv"));
      if (!keyKnown) {
        issues.push({ key, expression, reason: "unknown_key", suggestion: "pm_iv_minus_opt_iv_pts" });
        continue;
      }
    } else if (columns.has(baseKey)) {
      keyKnown = true;
    } else {
      const derived = baseKey.match(DERIVED_KEY_PATTERN);
      if (derived) {
        if (columns.has(derived[1])) {
          keyKnown = true;
        } else {
          issues.push({
            key, expression, reason: "derived_base_unknown",
            suggestion: suggestConditionKey(derived[1]),
          });
          continue;
        }
      } else if (RELATIVE_VALUE_AGG_PATTERN.test(baseKey) || PERP_KEY_PATTERN.test(baseKey)) {
        keyKnown = true;
      }
    }

    if (!keyKnown) {
      issues.push({ key, expression, reason: "unknown_key", suggestion: suggestConditionKey(baseKey) });
      continue;
    }

    if (!isValidNumericConditionExpression(expression)) {
      issues.push({ key, expression, reason: "invalid_expression", suggestion: expressionSuggestion(expression) });
    }
  }

  return issues;
}

export function formatConditionIssues(issues: ConditionValidationIssue[]): string {
  return issues
    .map((issue) => {
      const hint = issue.suggestion ? ` — did you mean "${issue.suggestion}"?` : "";
      return `${issue.key}="${issue.expression}" (${issue.reason})${hint}`;
    })
    .join("; ");
}

// ── Prompt section ──────────────────────────────────────────────────────────

/**
 * Builds the CONDITION KEY CATALOG prompt section shown to the nightly LLM.
 * valuationColumns should be the live daily-valuations.csv header so the
 * model sees exactly the columns the engine will look up.
 */
export function buildConditionCatalogPromptSection(valuationColumns: string[]): string {
  const byKind = (kind: ConditionCatalogEntry["kind"]) =>
    CONDITION_CATALOG
      .filter((entry) => entry.kind === kind && entry.advertise !== false)
      .map((entry) => `  - ${entry.label}: ${entry.definition} Example: {"${entry.example.key}": "${entry.example.expression}"}`)
      .join("\n");

  const columns = valuationColumns.filter((column) => column !== "date");
  const columnList = columns.length > 0 ? columns.join(", ") : "(valuation columns unavailable this run)";

  return `CONDITION KEY CATALOG (STRICT — the engine evaluates ONLY these keys; a hypothesis using any other key is rejected at ingest with reason unevaluable_conditions and is never tested):

Metadata keys (scope the hypothesis; string expressions):
${byKind("metadata")}

Market-row keys (evaluated against the asset's live Polymarket contract rows; add an "asset" condition to scope them; numeric expressions):
${byKind("market_row")}

Valuation columns (numeric time-series; use directly, with a previous_ prefix for the prior row, or inside the derived patterns below):
  ${columnList}

Derived time-series patterns (base <column> must be one of the valuation columns above):
${byKind("derived")}

Relative-value aggregate patterns:
${byKind("relative_value")}

Expression syntax (the ONLY forms the engine parses; anything else fails silently):
  - "> N", ">= N", "< N", "<= N", "= N" — plain numeric comparisons (N may be negative or decimal; a trailing % is stripped)
  - "between A and B" — inclusive range (do NOT write "A-B" or "A–B" ranges)
  - "abs(current - previous) > N" / "< N" — absolute one-step change
  - "declining > N" — previous minus current exceeds N
  - "changes sign" — value flipped sign vs previous row
  - "< N daily change" — absolute percent change vs previous row below N
  - Metadata keys only: bare value ("OIL"), "= OIL", or "in [OIL, GOLD]"
  - PROHIBITED: arithmetic ("> opt_iv_30d + 10"), column references on the right side, units other than %, en-dash ranges, AND/OR compounds. One key, one simple expression; combine via multiple keys (all conditions must hold).`;
}
