import { describe, expect, it } from "vitest";
import { buildYieldSnapshot, cohortForHypothesis, type ScoreboardHypothesis } from "./yield-scoreboard.js";

const win = { outcome: "win" };
const loss = { outcome: "loss" };
const pending = { outcome: "pending" };

describe("cohortForHypothesis", () => {
  it("classifies each origin correctly, explorer taking precedence", () => {
    expect(cohortForHypothesis({ origin: "explorer" })).toBe("explorer");
    expect(cohortForHypothesis({ refinesHypothesisId: "H-100" })).toBe("refinement");
    expect(cohortForHypothesis({ originFindingId: "FIND-0043" })).toBe("mined");
    expect(cohortForHypothesis({ setupId: "find_0043" })).toBe("mined");
    expect(cohortForHypothesis({ setupId: "other_mixed" })).toBe("legacy");
  });
});

describe("buildYieldSnapshot", () => {
  const hypotheses: ScoreboardHypothesis[] = [
    // Mined, mature survivor: 10 resolved tests, active.
    {
      status: "active", originFindingId: "FIND-0001",
      conditions: { yesAsk: "between 0.35 and 0.65" },
      tests: Array.from({ length: 10 }, (_, i) => (i < 7 ? win : loss)),
    },
    // Mined, killed with 4 resolved tests.
    { status: "killed", setupId: "find_0002", tests: [win, loss, loss, loss, pending] },
    // Refinement, active but immature (3 resolved).
    { status: "active", refinesHypothesisId: "H-500", tests: [win, win, loss] },
    // Explorer, active, novel condition key.
    {
      status: "active", origin: "explorer",
      conditions: { oil_hl_funding_ann_zscore_30d: "<= -0.388" },
      tests: [win, pending],
    },
    // Legacy archived.
    { status: "archived", tests: [loss] },
  ];
  const snapshot = buildYieldSnapshot(hypotheses, "2026-09-10");

  it("counts authored/status per cohort", () => {
    expect(snapshot.cohorts.mined).toMatchObject({ authored: 2, active: 1, killed: 1 });
    expect(snapshot.cohorts.refinement).toMatchObject({ authored: 1, active: 1 });
    expect(snapshot.cohorts.explorer).toMatchObject({ authored: 1, active: 1 });
    expect(snapshot.cohorts.legacy).toMatchObject({ authored: 1, archived: 1 });
  });

  it("counts only resolved tests and computes effort-normalized yield", () => {
    expect(snapshot.cohorts.mined.testsResolved).toBe(14);
    expect(snapshot.cohorts.mined.testsWon).toBe(8);
    expect(snapshot.cohorts.mined.matureSurvivors).toBe(1);
    expect(snapshot.cohorts.mined.testsPerSurvivor).toBe(14);
    // Explorer has 1 resolved test, no mature survivor yet.
    expect(snapshot.cohorts.explorer.testsResolved).toBe(1);
    expect(snapshot.cohorts.explorer.testsPerSurvivor).toBeNull();
  });

  it("flags condition keys only the explorer uses as novel", () => {
    expect(snapshot.explorerNovelConditionKeys).toEqual(["oil_hl_funding_ann_zscore_30d"]);
  });

  it("does not flag explorer keys that mined hypotheses also use", () => {
    const shared = buildYieldSnapshot([
      { status: "active", origin: "explorer", conditions: { yesAsk: "< 0.5" } },
      { status: "active", originFindingId: "FIND-0001", conditions: { yesAsk: "> 0.5" } },
    ], "2026-09-10");
    expect(shared.explorerNovelConditionKeys).toEqual([]);
  });
});
