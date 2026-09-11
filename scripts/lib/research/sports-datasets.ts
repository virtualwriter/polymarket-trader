/**
 * Sports/weather research datasets for the nightly explorer.
 *
 * These are produced by the sports-arb repo's collectors (weather monitors on
 * the Mac, softball pipeline) and rsynced to SPORTS_EXPORTS_DIR on the VPS by
 * sports-arb's research-export sync. This module flattens them into the same
 * Record<string,string> row shape every other scannable dataset uses.
 *
 * VALIDATION VENUE — the constitutional point: the PM crypto gauntlet cannot
 * shadow-test a weather or softball idea (no instruments to mark it against).
 * Explorer observations on these datasets therefore route to
 * data/sports-proposals.json, which sports-arb's own prospective evaluators
 * consume — they NEVER become PM FINDs or hypotheses. Because validation is
 * prospective (future ledger rows nobody has seen), no temporal holdout mask
 * is applied to these scans.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where sports-arb's research-export sync lands on the VPS. */
export const DEFAULT_SPORTS_EXPORTS_DIR = "/var/lib/sports-arb/research-exports";

export function sportsExportsDir(): string {
  return process.env.SPORTS_EXPORTS_DIR || DEFAULT_SPORTS_EXPORTS_DIR;
}

export const WEATHER_CITIES = ["austin", "chi", "la", "miami", "nyc"] as const;

function dayOfWeekName(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(ms).getUTCDay()];
}

/**
 * Predictor bins look like "<=84", "85-86", ">=91" (and occasional single
 * values). Returns whether a settle temperature lands inside the bin, or null
 * when the bin string is unparseable.
 */
export function binContains(bin: string, settleF: number): boolean | null {
  const s = bin.trim();
  let m = s.match(/^<=\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return settleF <= Number(m[1]);
  m = s.match(/^>=\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return settleF >= Number(m[1]);
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (m) return settleF >= Number(m[1]) && settleF <= Number(m[2]);
  m = s.match(/^(-?\d+(?:\.\d+)?)$/);
  if (m) return settleF === Number(m[1]);
  return null;
}

interface PredictorSnapshot {
  predicted_high_f?: number | null;
  bin?: string | null;
  daily_implied?: Record<string, number> | null;
  forecast_peak_hour?: number | null;
  twc_high_f?: number | null;
}

interface LedgerDay {
  local_date?: string;
  open?: PredictorSnapshot | null;
  final_pred?: PredictorSnapshot | null;
  settlement?: { high_f?: number | null } | null;
  scores?: {
    open?: { settle_f?: number | null } | null;
    final?: { settle_f?: number | null } | null;
  } | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return typeof v === "number" || (typeof v === "string" && v.trim() !== "")
    ? (Number.isFinite(n) ? n : null)
    : null;
}

function snapshotColumns(
  prefix: "open" | "final",
  snap: PredictorSnapshot | null | undefined,
  settleF: number | null,
): Record<string, string> {
  const pred = num(snap?.predicted_high_f);
  const bin = String(snap?.bin ?? "").trim();
  const implied = bin && snap?.daily_implied ? num(snap.daily_implied[bin]) : null;
  let hit: boolean | null = null;
  if (settleF !== null && bin) hit = binContains(bin, settleF);
  // P&L of buying the predicted bin at the market's implied price: pays $1 on
  // a hit. Only defined when both the settle and a market price exist.
  let pnlPct: number | null = null;
  if (hit !== null && implied !== null && implied > 0 && implied < 1) {
    pnlPct = hit ? ((1 - implied) / implied) * 100 : -100;
  }
  return {
    [`${prefix}_pred_high_f`]: pred === null ? "" : String(pred),
    [`${prefix}_bin`]: bin,
    [`${prefix}_bin_implied_pct`]: implied === null ? "" : (implied * 100).toFixed(1),
    [`${prefix}_bin_hit`]: hit === null ? "" : (hit ? "1" : "0"),
    [`${prefix}_abs_err_f`]: pred !== null && settleF !== null ? String(Math.abs(pred - settleF)) : "",
    [`${prefix}_pnl_pct`]: pnlPct === null ? "" : pnlPct.toFixed(2),
  };
}

/**
 * One row per city-day from the high-predictor ledgers. Settled rows carry
 * bin-hit / abs-error / bin-buy P&L for both the OPEN (morning) and FINAL
 * (end-of-day) predictor snapshots; unsettled rows have those columns empty
 * (settled=0) so scans can filter on them.
 */
export function loadWeatherRows(dir: string = sportsExportsDir()): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const city of WEATHER_CITIES) {
    const path = join(dir, `${city}-high-predictor-ledger.json`);
    if (!existsSync(path)) continue;
    let parsed: { days?: Record<string, LedgerDay> };
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    const days = parsed?.days && typeof parsed.days === "object" ? parsed.days : {};
    for (const day of Object.values(days)) {
      const date = String(day?.local_date ?? "").slice(0, 10);
      if (!date) continue;
      const settleF = num(day?.settlement?.high_f)
        ?? num(day?.scores?.final?.settle_f)
        ?? num(day?.scores?.open?.settle_f);
      const openPred = num(day?.open?.predicted_high_f);
      const finalPred = num(day?.final_pred?.predicted_high_f);
      rows.push({
        city,
        date,
        day_of_week: dayOfWeekName(`${date}T12:00:00Z`),
        settled: settleF === null ? "0" : "1",
        settle_f: settleF === null ? "" : String(settleF),
        twc_high_f: num(day?.open?.twc_high_f) === null ? "" : String(num(day?.open?.twc_high_f)),
        forecast_peak_hour: num(day?.final_pred?.forecast_peak_hour) === null
          ? ""
          : String(num(day?.final_pred?.forecast_peak_hour)),
        pred_drift_f: openPred !== null && finalPred !== null ? String(finalPred - openPred) : "",
        ...snapshotColumns("open", day?.open, settleF),
        ...snapshotColumns("final", day?.final_pred, settleF),
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city));
  return rows;
}

function recStr(rec: Record<string, unknown>, k: string): string {
  const v = rec[k];
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(String).join("|");
  if (typeof v === "boolean") return v ? "1" : "0";
  return String(v);
}

function readJsonlRecords(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const out: Record<string, unknown>[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (rec && typeof rec === "object" && !Array.isArray(rec)) out.push(rec);
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Softball rows come from two sources in the exports dir, tagged by `origin`:
 *
 * - mlb-softball-samples.jsonl (origin=backtest_sample): the nightly
 *   collector's settled would-fire samples — over and middle configs with
 *   won/pnl/fee and final scores. The deep population (thousands of rows).
 * - mlb-over-softball-outcomes.jsonl (origin=order_flow): the live signal /
 *   order records joined to final scores (produced by sports-arb; optional).
 *
 * Missing files degrade to an empty or partial dataset — nothing breaks.
 */
export function loadSoftballRows(dir: string = sportsExportsDir()): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const rec of readJsonlRecords(join(dir, "mlb-softball-samples.jsonl"))) {
    const date = String(rec.day ?? "").slice(0, 10);
    if (!date) continue;
    const won = rec.won === true ? "1" : rec.won === false ? "0" : "";
    const pnl = Number(rec.pnl);
    const finalAway = Number(rec.finalAway);
    const finalHome = Number(rec.finalHome);
    rows.push({
      origin: "backtest_sample",
      date,
      day_of_week: dayOfWeekName(`${date}T12:00:00Z`),
      kind: recStr(rec, "kind"),
      slug: recStr(rec, "slug"),
      source: "",
      inning: recStr(rec, "inning"),
      half: recStr(rec, "half"),
      score_away: recStr(rec, "scoreAway"),
      score_home: recStr(rec, "scoreHome"),
      cur_total: recStr(rec, "curTotal"),
      runs_delta: recStr(rec, "runsDelta"),
      runs_needed: "",
      line: recStr(rec, "line"),
      ask: recStr(rec, "ask"),
      ask_size: recStr(rec, "askSize"),
      cats: recStr(rec, "cats"),
      fee: recStr(rec, "fee"),
      live: "",
      settled: won === "" ? "0" : "1",
      final_total: Number.isFinite(finalAway) && Number.isFinite(finalHome)
        ? String(finalAway + finalHome)
        : "",
      over_hit: won,
      // pnl in the samples file is per-$1 fractional return.
      pnl_pct: Number.isFinite(pnl) ? (pnl * 100).toFixed(2) : "",
    });
  }

  for (const rec of readJsonlRecords(join(dir, "mlb-over-softball-outcomes.jsonl"))) {
    const observedAt = String(rec.observedAt ?? rec.date ?? "");
    const date = observedAt.slice(0, 10);
    if (!date) continue;
    rows.push({
      origin: "order_flow",
      date,
      day_of_week: dayOfWeekName(observedAt),
      kind: recStr(rec, "kind"),
      slug: recStr(rec, "slug"),
      source: recStr(rec, "source"),
      inning: recStr(rec, "inning"),
      half: "",
      score_away: recStr(rec, "scoreAway"),
      score_home: recStr(rec, "scoreHome"),
      cur_total: recStr(rec, "curTotal"),
      runs_delta: recStr(rec, "runsDelta"),
      runs_needed: recStr(rec, "runsNeeded"),
      line: recStr(rec, "line"),
      ask: recStr(rec, "ask"),
      ask_size: recStr(rec, "askSize"),
      cats: recStr(rec, "cats"),
      fee: "",
      live: recStr(rec, "live"),
      settled: recStr(rec, "settled"),
      final_total: recStr(rec, "finalTotal"),
      over_hit: recStr(rec, "overHit"),
      pnl_pct: recStr(rec, "pnlPct"),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}
