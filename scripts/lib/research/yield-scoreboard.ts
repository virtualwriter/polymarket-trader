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
}

export interface YieldSnapshot {
  date: string;
  cohorts: Record<OriginCohort, CohortYield>;
  /** Condition keys used by explorer hypotheses that no mined/refinement
   * hypothesis has ever used — a proxy for "outside the existing taxonomy". */
  explorerNovelConditionKeys: string[];
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

function emptyYield(): CohortYield {
  return {
    authored: 0, active: 0, killed: 0, archived: 0, promoted: 0,
    testsResolved: 0, testsWon: 0, matureSurvivors: 0, testsPerSurvivor: null,
  };
}

export function buildYieldSnapshot(hypotheses: ScoreboardHypothesis[], date: string): YieldSnapshot {
  const cohorts: Record<OriginCohort, CohortYield> = {
    mined: emptyYield(), refinement: emptyYield(), explorer: emptyYield(), legacy: emptyYield(),
  };
  const nonExplorerKeys = new Set<string>();
  const explorerKeys = new Set<string>();

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
    if (alive && resolved >= MATURE_TEST_COUNT) y.matureSurvivors++;

    const keys = Object.keys(h.conditions ?? {});
    if (cohort === "explorer") keys.forEach((k) => explorerKeys.add(k));
    else keys.forEach((k) => nonExplorerKeys.add(k));
  }

  for (const y of Object.values(cohorts)) {
    y.testsPerSurvivor = y.matureSurvivors > 0
      ? Number((y.testsResolved / y.matureSurvivors).toFixed(1))
      : null;
  }

  return {
    date,
    cohorts,
    explorerNovelConditionKeys: [...explorerKeys].filter((k) => !nonExplorerKeys.has(k)).sort(),
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
    rows,
  }, null, 2) + "\n");
  return snapshot;
}
