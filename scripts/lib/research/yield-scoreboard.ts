/**
 * Research-yield scoreboard: the measurement side of the "decisive experiment"
 * an external assessment proposed in September 2026 — freeze the statistical
 * constitution, fix the research budget, and compare the discovery yield of
 * the autonomous explorer against the established miner/FIND pipeline over 60
 * days.
 *
 * Both preconditions already hold (the validation gauntlet is fixed by policy;
 * authoring is capped at 10 mined/refinement + 3 explorer slots per night), so
 * this module just makes the comparison measurable: one snapshot per day of
 * per-origin cohort yield, appended to data/research-yield-scoreboard.json.
 *
 * Cohorts:
 * - mined:      authored from a ranked FIND (originFindingId / find_* setup)
 * - refinement: authored from a diagnosed family failure (refinesHypothesisId)
 * - explorer:   freeform, authored by the free-roaming explorer (origin tag)
 * - legacy:     everything predating the origin discipline
 *
 * Yield is deliberately effort-normalized: tests consumed per surviving
 * hypothesis, not raw counts — "later generations should find useful
 * hypotheses with fewer experiments" is the claim under test.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type OriginCohort = "mined" | "refinement" | "explorer" | "legacy";

export interface ScoreboardHypothesis {
  id?: string;
  status?: string;
  origin?: string;
  originFindingId?: string;
  refinesHypothesisId?: string;
  setupId?: string;
  created?: string;
  conditions?: Record<string, string>;
  promotedToSignal?: boolean;
  tests?: Array<{ outcome?: string }>;
}

export interface CohortYield {
  authored: number;
  active: number;
  killed: number;
  archived: number;
  promoted: number;
  /** Resolved (non-pending) test outcomes consumed by this cohort. */
  testsResolved: number;
  testsWon: number;
  /** Hypotheses with >= 10 resolved tests still alive: survived early culling. */
  matureSurvivors: number;
  /** Resolved tests spent per mature survivor (lower = more efficient). */
  testsPerSurvivor: number | null;
  /** Hypotheses that completed the full 20-test gauntlet and are still alive:
   * the prospective-survival bar, not the halfway mark. */
  gateSurvivors: number;
  /** Gate survivors per 100 hypotheses authored — the budget-normalized
   * "prospective discoveries per research experiment" metric. Comparable
   * across cohorts with different nightly slot budgets. */
  gateSurvivorsPer100Authored: number | null;
}

/** Novelty accounting for the explorer cohort: are its survivors genuinely
 * outside the mined taxonomy, and are they independent discoveries rather
 * than variants of one? */
export interface ExplorerNovelty {
  /** Condition keys used by explorer hypotheses that no mined/refinement
   * hypothesis has ever used. */
  novelConditionKeys: string[];
  matureSurvivors: number;
  /** Mature survivors using at least one condition key outside the mined
   * vocabulary. */
  novelMatureSurvivors: number;
  /** novelMatureSurvivors / matureSurvivors. */
  novelSurvivorRate: number | null;
  /** Distinct condition-key signatures among mature survivors — a proxy for
   * independent mechanisms (15 survivors with 2 signatures is 2 discoveries,
   * not 15). */
  distinctConditionSignatures: number;
}

export interface YieldSnapshot {
  date: string;
  cohorts: Record<OriginCohort, CohortYield>;
  /** Kept for continuity with early rows; superseded by explorerNovelty. */
  explorerNovelConditionKeys: string[];
  explorerNovelty: ExplorerNovelty;
}

export function cohortForHypothesis(h: ScoreboardHypothesis): OriginCohort {
  if (h.origin === "explorer") return "explorer";
  if (typeof h.refinesHypothesisId === "string" && h.refinesHypothesisId.length > 0) return "refinement";
  if (
    (typeof h.originFindingId === "string" && h.originFindingId.length > 0)
    || (typeof h.setupId === "string" && h.setupId.startsWith("find_"))
  ) return "mined";
  return "legacy";
}

const MATURE_TEST_COUNT = 10;
/** The full gauntlet: same as HYPOTHESIS_SHADOW_TESTS_REQUIRED / PROMOTE_MIN_TESTS. */
const GATE_TEST_COUNT = 20;

function emptyYield(): CohortYield {
  return {
    authored: 0, active: 0, killed: 0, archived: 0, promoted: 0,
    testsResolved: 0, testsWon: 0, matureSurvivors: 0, testsPerSurvivor: null,
    gateSurvivors: 0, gateSurvivorsPer100Authored: null,
  };
}

export function buildYieldSnapshot(hypotheses: ScoreboardHypothesis[], date: string): YieldSnapshot {
  const cohorts: Record<OriginCohort, CohortYield> = {
    mined: emptyYield(), refinement: emptyYield(), explorer: emptyYield(), legacy: emptyYield(),
  };
  const nonExplorerKeys = new Set<string>();
  interface ExplorerSurvivorInfo { keys: string[]; signature: string }
  const explorerAllKeys = new Set<string>();
  const explorerMatureSurvivorInfo: ExplorerSurvivorInfo[] = [];

  for (const h of hypotheses) {
    const cohort = cohortForHypothesis(h);
    const y = cohorts[cohort];
    y.authored++;
    const status = h.status ?? "active";
    if (status === "killed") y.killed++;
    else if (status === "archived") y.archived++;
    else y.active++;
    if (h.promotedToSignal || status === "promoted") y.promoted++;

    let resolved = 0;
    for (const t of h.tests ?? []) {
      if (t.outcome === "win" || t.outcome === "loss") {
        resolved++;
        y.testsResolved++;
        if (t.outcome === "win") y.testsWon++;
      }
    }
    const alive = status !== "killed" && status !== "archived";
    const isMatureSurvivor = alive && resolved >= MATURE_TEST_COUNT;
    if (isMatureSurvivor) y.matureSurvivors++;
    if (alive && resolved >= GATE_TEST_COUNT) y.gateSurvivors++;

    const keys = Object.keys(h.conditions ?? {}).sort();
    if (cohort === "explorer") {
      keys.forEach((k) => explorerAllKeys.add(k));
      if (isMatureSurvivor) explorerMatureSurvivorInfo.push({ keys, signature: keys.join("|") });
    } else {
      keys.forEach((k) => nonExplorerKeys.add(k));
    }
  }

  for (const y of Object.values(cohorts)) {
    y.testsPerSurvivor = y.matureSurvivors > 0
      ? Number((y.testsResolved / y.matureSurvivors).toFixed(1))
      : null;
    y.gateSurvivorsPer100Authored = y.authored > 0
      ? Number(((y.gateSurvivors / y.authored) * 100).toFixed(2))
      : null;
  }

  const novelKeys = [...explorerAllKeys].filter((k) => !nonExplorerKeys.has(k)).sort();
  const novelKeySet = new Set(novelKeys);
  const novelMatureSurvivors = explorerMatureSurvivorInfo
    .filter((info) => info.keys.some((k) => novelKeySet.has(k)))
    .length;

  return {
    date,
    cohorts,
    explorerNovelConditionKeys: novelKeys,
    explorerNovelty: {
      novelConditionKeys: novelKeys,
      matureSurvivors: explorerMatureSurvivorInfo.length,
      novelMatureSurvivors,
      novelSurvivorRate: explorerMatureSurvivorInfo.length > 0
        ? Number((novelMatureSurvivors / explorerMatureSurvivorInfo.length).toFixed(3))
        : null,
      distinctConditionSignatures: new Set(explorerMatureSurvivorInfo.map((i) => i.signature)).size,
    },
  };
}

/**
 * Appends today's snapshot to the scoreboard file (idempotent per date: a
 * rerun replaces the same-day row so hourly/nightly double-runs cannot double
 * count). Keeps at most 400 daily rows.
 */
export function appendYieldScoreboard(dataDir: string, now: Date = new Date()): YieldSnapshot | null {
  const hypothesesPath = join(dataDir, "hypotheses.json");
  if (!existsSync(hypothesesPath)) return null;
  let hypotheses: ScoreboardHypothesis[];
  try {
    const raw = JSON.parse(readFileSync(hypothesesPath, "utf-8"));
    if (!Array.isArray(raw)) return null;
    hypotheses = raw;
  } catch {
    return null;
  }

  const date = now.toISOString().slice(0, 10);
  const snapshot = buildYieldSnapshot(hypotheses, date);

  const scoreboardPath = join(dataDir, "research-yield-scoreboard.json");
  let rows: YieldSnapshot[] = [];
  if (existsSync(scoreboardPath)) {
    try {
      const raw = JSON.parse(readFileSync(scoreboardPath, "utf-8"));
      if (Array.isArray(raw?.rows)) rows = raw.rows;
    } catch {
      rows = [];
    }
  }
  rows = rows.filter((r) => r.date !== date);
  rows.push(snapshot);
  rows.sort((a, b) => a.date.localeCompare(b.date));
  rows = rows.slice(-400);

  writeFileSync(scoreboardPath, JSON.stringify({
    updatedAt: now.toISOString(),
    experiment: "explorer-vs-pipeline discovery yield (60-day assessment criteria, Sep 2026)",
    // Verdict thresholds agreed with the external assessor on 2026-09-10.
    // The statistical constitution stays frozen for the experiment's duration.
    verdictCriteria: {
      efficiency: "explorer testsPerSurvivor <= 35 (mined baseline 53.1 at day 0); tiers: >50 none, 40-50 promising, 35-40 meaningful, <=35 additive, <=30 strong, <=25 extraordinary",
      scale: ">= 15 explorer mature survivors (prefer 20+), across independent mechanisms (see distinctConditionSignatures, not raw count)",
      novelty: "substantial explorerNovelty.novelSurvivorRate — survivors outside the mined condition vocabulary, not rediscoveries",
      prospectiveSurvival: "explorer gateSurvivorsPer100Authored at or above the mined cohort's — survivors must finish the full 20-test future-contract gauntlet",
    },
    rows,
  }, null, 2) + "\n");
  return snapshot;
}
