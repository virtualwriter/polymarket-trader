/**
 * USER_PM_IV_TOUCH_RICH_NO — engine-live signal for Polymarket YES priced rich
 * vs the options-derived touch model (buy NO / sell YES).
 *
 * Live opening uses the same relative-value heatmap rows the heatmap button
 * used, with deterministic gates.
 *
 * The "~16/21 wins, avg +14%" shadow record this signal was originally sized on
 * was contaminated: 12 of those closes came from the pre-2026-07-10 resolver
 * firing on any gate failure, realizing a mid-flight mark instead of the thesis.
 * On clean evidence the family is 6/7 at +2.70%, and truth state carries it as
 * validating rather than eligible_live.
 *
 * The gates below do NOT yet encode the direction asymmetry found on
 * 2026-08-12 across 49 gated entries in the NO-bias candidate log: upside
 * barriers are overpriced by the market (29.3% priced vs 9.1% realized touch,
 * +10.6% per trade) while downside barriers are close to calibrated (45.3% vs
 * 44.4% realized, -24.0% per trade) and the apparent richness there is the
 * model underpricing touch by ~11pt. Restricting to upside barriers is the open
 * decision; see setup-invalid-assumptions.json for manual_iv_touch_rich_no.
 */

export const USER_PM_IV_TOUCH_RICH_NO_SIGNAL = "USER_PM_IV_TOUCH_RICH_NO";

/** Minimum PM-richness vs touch model in probability points (|edge_score|). */
export const USER_PM_IV_TOUCH_RICH_NO_MIN_EDGE_PTS = 5;
/** Cap DTE so live book matches resolved winners (mostly <60d), not 200d+ lotteries. */
export const USER_PM_IV_TOUCH_RICH_NO_MAX_DTE_DAYS = 60;
export const USER_PM_IV_TOUCH_RICH_NO_MAX_SPREAD = 0.03;
export const USER_PM_IV_TOUCH_RICH_NO_MIN_LIQUIDITY = 1_000;
/** Hold window for paper/live exits when contract expiry is farther out. */
export const USER_PM_IV_TOUCH_RICH_NO_HOLD_DAYS = 30;
/** Max new live signals per hourly run (one short per asset still applies upstream). */
export const USER_PM_IV_TOUCH_RICH_NO_MAX_SIGNALS_PER_RUN = 5;

export const USER_PM_IV_TOUCH_RICH_NO_LIVE_ASSETS = new Set([
  "BTC",
  "ETH",
  "OIL",
  "GOLD",
  "SPY",
]);

export const USER_PM_IV_TOUCH_RICH_NO_BAD_FLAGS = new Set([
  "wide_pm_spread",
  "low_pm_liquidity",
  "missing_options_iv",
  "no_listed_options_mapping",
]);

export interface IvTouchRichNoRow {
  asset: string;
  eventSlug: string;
  marketId: string;
  direction: "above" | "below";
  bestExpression: string;
  edgePts: number | null;
  pmSpread: number | null;
  liquidity: number | null;
  modelProb: number | null;
  pmYes: number | null;
  flags: string;
  /** Days to expiry when available (rawRow.dte_days or computed). */
  dteDays: number | null;
}

function flagSet(flags: string): Set<string> {
  // Engine CSV uses ";" (relativeValueFlagSet); tolerate "|" too.
  return new Set(
    String(flags)
      .split(/[;|]/)
      .map((f) => f.trim())
      .filter(Boolean),
  );
}

/** PM-richness in pts: how much YES exceeds the touch model (positive = rich). */
export function ivTouchRichnessPts(row: Pick<IvTouchRichNoRow, "edgePts" | "bestExpression">): number | null {
  if (row.edgePts === null || !Number.isFinite(row.edgePts)) return null;
  // Heatmap edge_score is signed: negative when PM YES > touch model on
  // sell_yes_or_buy_no rows (the manual thesis "edge -14.6 pts").
  if (row.bestExpression === "sell_yes_or_buy_no") {
    return row.edgePts < 0 ? Math.abs(row.edgePts) : null;
  }
  return null;
}

/**
 * Live eligibility for USER_PM_IV_TOUCH_RICH_NO.
 * Requires sell_yes_or_buy_no expression, minimum richness, quality gates, and asset allowlist.
 */
export function userPmIvTouchRichNoEligible(row: IvTouchRichNoRow): boolean {
  if (!row.marketId || !row.eventSlug) return false;
  if (!USER_PM_IV_TOUCH_RICH_NO_LIVE_ASSETS.has(row.asset)) return false;
  if (row.bestExpression !== "sell_yes_or_buy_no") return false;

  const richness = ivTouchRichnessPts(row);
  if (richness === null || richness < USER_PM_IV_TOUCH_RICH_NO_MIN_EDGE_PTS) return false;

  if (row.pmSpread === null || row.pmSpread > USER_PM_IV_TOUCH_RICH_NO_MAX_SPREAD) return false;
  if (row.liquidity === null || row.liquidity < USER_PM_IV_TOUCH_RICH_NO_MIN_LIQUIDITY) return false;

  if (row.dteDays !== null && Number.isFinite(row.dteDays)) {
    if (row.dteDays <= 0 || row.dteDays > USER_PM_IV_TOUCH_RICH_NO_MAX_DTE_DAYS) return false;
  }

  const flags = flagSet(row.flags);
  if (Array.from(USER_PM_IV_TOUCH_RICH_NO_BAD_FLAGS).some((flag) => flags.has(flag))) return false;

  return true;
}

export function userPmIvTouchRichNoConfidence(richnessPts: number, weight: number): number {
  const strength = Math.min(1, Math.max(0.4, richnessPts / 15));
  return Math.min(0.95, Math.max(0.2, strength * Math.max(weight, 0.5)));
}
