/**
 * Regime labeling for validation records (assessor capability #4).
 *
 * Every hypothesis test has a date; this module maps dates to coarse market
 * regime labels so the engine can know the conditions under which a promoted
 * family's evidence was collected — and notice, at entry time, when today's
 * regime was never part of that evidence.
 *
 * Design choices, deliberately conservative:
 * - Three dimensions only (vol / funding / macro), each with 3-4 coarse
 *   buckets. Fine-grained regimes would make every envelope look violated.
 * - The envelope is derived from test DATES on the fly, not from stamps, so
 *   the entire historical record participates without a backfill. New tests
 *   also get stamped for auditability, but the math never trusts the stamp.
 * - Out-of-envelope is per-dimension ("today's vol tercile never appeared in
 *   this family's validation days"), not per-signature, because requiring the
 *   exact 3-tuple to recur would flag constantly on thin histories.
 * - Unknown beats wrong: if a dimension can't be labeled for a date, it is
 *   omitted and never counts toward or against the envelope.
 */

export type VolRegime = "low" | "mid" | "high";
export type FundingRegime = "negative" | "low" | "baseline" | "elevated";
export type MacroRegime = "risk_off" | "neutral" | "risk_on";

export interface RegimeLabels {
  vol?: VolRegime;
  funding?: FundingRegime;
  macro?: MacroRegime;
}

export interface RegimeSeries {
  /** ISO date (YYYY-MM-DD) → labels for that day. */
  byDate: Map<string, RegimeLabels>;
  /** Sorted ascending. */
  dates: string[];
  /** Vol tercile thresholds actually used (for logs/tests). */
  volThresholds: { low: number; high: number } | null;
}

/** Generic row shape shared by the engine's readCsv and research loaders. */
type Row = Record<string, string | number>;

// Funding buckets are economic, not statistical: the HL baseline rate pins
// btc_hl_funding_ann at ~10.95 most days, so deviation from that band is the
// signal. Negative funding (shorts pay longs) is its own regime.
const FUNDING_NEGATIVE_MAX = 0;
const FUNDING_LOW_MAX = 8;
const FUNDING_BASELINE_MAX = 13;

// How many days back regimeOn() will walk to fill a missing dimension.
// Valuations and macro snapshots occasionally skip a day; a week-old label is
// still the same coarse regime far more often than not.
const REGIME_LOOKBACK_DAYS = 7;

// An envelope built from fewer labeled test days than this is too thin to
// declare anything out-of-distribution — with 3 vol terciles and 4 tests you
// would expect gaps by chance alone.
export const REGIME_ENVELOPE_MIN_DATED_TESTS = 5;

function num(v: string | number | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoDate(v: string | number | undefined): string | null {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function macroRegimeFromLabel(label: string): MacroRegime | undefined {
  const norm = label.trim().toUpperCase().replace(/"/g, "");
  if (norm === "") return undefined;
  if (norm.includes("BEAR")) return "risk_off";
  if (norm.includes("BULL")) return "risk_on";
  if (norm.includes("NEUTRAL")) return "neutral";
  return undefined;
}

export function fundingRegimeFromAnnPct(annPct: number): FundingRegime {
  if (annPct < FUNDING_NEGATIVE_MAX) return "negative";
  if (annPct < FUNDING_LOW_MAX) return "low";
  if (annPct <= FUNDING_BASELINE_MAX) return "baseline";
  return "elevated";
}

/**
 * Build the date → regime map from the two series the engine already loads
 * every run: daily-valuations.csv rows (vol from btc_opt_iv_30d terciles,
 * funding from btc_hl_funding_ann) and daily-macro.csv rows (macro_label,
 * last row per date wins since the file can carry intraday snapshots).
 */
export function buildRegimeSeries(valRows: Row[], macroRows: Row[]): RegimeSeries {
  const byDate = new Map<string, RegimeLabels>();

  const upsert = (date: string): RegimeLabels => {
    let labels = byDate.get(date);
    if (!labels) { labels = {}; byDate.set(date, labels); }
    return labels;
  };

  // Vol terciles are computed over the full loaded IV history so the labels
  // are self-calibrating rather than pinned to magic IV levels.
  const ivByDate = new Map<string, number>();
  for (const row of valRows) {
    const date = isoDate(row.date);
    if (!date) continue;
    const iv = num(row.btc_opt_iv_30d);
    if (iv !== null) ivByDate.set(date, iv);
    const funding = num(row.btc_hl_funding_ann);
    if (funding !== null) upsert(date).funding = fundingRegimeFromAnnPct(funding);
  }

  let volThresholds: RegimeSeries["volThresholds"] = null;
  if (ivByDate.size >= 3) {
    const sorted = [...ivByDate.values()].sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length / 3)];
    const high = sorted[Math.floor((sorted.length * 2) / 3)];
    volThresholds = { low, high };
    for (const [date, iv] of ivByDate) {
      upsert(date).vol = iv < low ? "low" : iv < high ? "mid" : "high";
    }
  }

  for (const row of macroRows) {
    const date = isoDate(row.date);
    if (!date) continue;
    const regime = macroRegimeFromLabel(String(row.macro_label ?? ""));
    if (regime) upsert(date).macro = regime; // later rows overwrite = last-per-date
  }

  return { byDate, dates: [...byDate.keys()].sort(), volThresholds };
}

/**
 * Labels in effect on a date, walking back up to REGIME_LOOKBACK_DAYS to fill
 * dimensions missing from the exact day.
 */
export function regimeOn(series: RegimeSeries, date: string): RegimeLabels {
  const target = isoDate(date);
  if (!target) return {};
  const result: RegimeLabels = {};
  const base = new Date(`${target}T00:00:00Z`).getTime();
  if (!Number.isFinite(base)) return {};
  for (let back = 0; back <= REGIME_LOOKBACK_DAYS; back++) {
    const day = new Date(base - back * 86_400_000).toISOString().slice(0, 10);
    const labels = series.byDate.get(day);
    if (!labels) continue;
    if (result.vol === undefined && labels.vol !== undefined) result.vol = labels.vol;
    if (result.funding === undefined && labels.funding !== undefined) result.funding = labels.funding;
    if (result.macro === undefined && labels.macro !== undefined) result.macro = labels.macro;
    if (result.vol !== undefined && result.funding !== undefined && result.macro !== undefined) break;
  }
  return result;
}

export interface RegimeEnvelope {
  vol: Set<VolRegime>;
  funding: Set<FundingRegime>;
  macro: Set<MacroRegime>;
  /** Test dates that produced at least one label. */
  datedTests: number;
}

/** The set of regimes a family's evidence was actually collected under. */
export function regimeEnvelopeForDates(series: RegimeSeries, dates: string[]): RegimeEnvelope {
  const envelope: RegimeEnvelope = { vol: new Set(), funding: new Set(), macro: new Set(), datedTests: 0 };
  for (const date of dates) {
    const labels = regimeOn(series, date);
    let any = false;
    if (labels.vol !== undefined) { envelope.vol.add(labels.vol); any = true; }
    if (labels.funding !== undefined) { envelope.funding.add(labels.funding); any = true; }
    if (labels.macro !== undefined) { envelope.macro.add(labels.macro); any = true; }
    if (any) envelope.datedTests++;
  }
  return envelope;
}

/**
 * Dimensions of the current regime that never appeared in the validation
 * envelope, as human-readable strings ("vol=high, validated under {low, mid}").
 * Empty array = in-envelope (or envelope too thin to judge).
 */
export function outOfEnvelopeDimensions(
  current: RegimeLabels,
  envelope: RegimeEnvelope,
  minDatedTests: number = REGIME_ENVELOPE_MIN_DATED_TESTS,
): string[] {
  if (envelope.datedTests < minDatedTests) return [];
  const out: string[] = [];
  const check = <T extends string>(dim: string, value: T | undefined, seen: Set<T>) => {
    // A dimension with no history in the envelope can't be violated; a
    // dimension unknown today can't be judged.
    if (value === undefined || seen.size === 0) return;
    if (!seen.has(value)) out.push(`${dim}=${value} (validated under {${[...seen].sort().join(", ")}})`);
  };
  check("vol", current.vol, envelope.vol);
  check("funding", current.funding, envelope.funding);
  check("macro", current.macro, envelope.macro);
  return out;
}

export function formatRegimeEnvelope(envelope: RegimeEnvelope): string {
  const fmt = (name: string, set: Set<string>) =>
    `${name}={${set.size > 0 ? [...set].sort().join(",") : "?"}}`;
  return `${fmt("vol", envelope.vol)} ${fmt("funding", envelope.funding)} ${fmt("macro", envelope.macro)} over ${envelope.datedTests} dated tests`;
}

export function formatRegimeLabels(labels: RegimeLabels): string {
  const parts: string[] = [];
  if (labels.vol) parts.push(`vol=${labels.vol}`);
  if (labels.funding) parts.push(`funding=${labels.funding}`);
  if (labels.macro) parts.push(`macro=${labels.macro}`);
  return parts.length > 0 ? parts.join(" ") : "unknown";
}
