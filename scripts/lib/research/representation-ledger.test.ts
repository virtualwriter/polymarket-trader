import { describe, expect, it } from "vitest";
import {
  mergeLedger,
  representationKey,
  summarizeLedger,
  type RepresentationEntry,
} from "./representation-ledger.js";

const turnoverProposal = {
  proposedAt: "2026-09-11T07:00:00Z",
  proposals: [
    { name: "turnover", transform: "ratio", columns: ["volume", "liquidity"], rationale: "turnover proxy" },
  ],
};

describe("mergeLedger", () => {
  it("creates a proposed entry keyed by mathematical signature, not name", () => {
    const entries = mergeLedger([], turnoverProposal, null);
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("ratio(volume,liquidity)");
    expect(entries[0].name).toBe("x_turnover");
    expect(entries[0].status).toBe("proposed");
    expect(entries[0].timesProposed).toBe(1);
  });

  it("re-proposal on a later night increments the count; same night does not", () => {
    let entries = mergeLedger([], turnoverProposal, null);
    entries = mergeLedger(entries, turnoverProposal, null); // rerun, same proposedAt
    expect(entries[0].timesProposed).toBe(1);
    entries = mergeLedger(entries, {
      proposedAt: "2026-09-13T07:00:00Z",
      proposals: [{ name: "vol_liq", transform: "ratio", columns: ["volume", "liquidity"] }],
    }, null);
    expect(entries).toHaveLength(1); // same signature, renamed by the model
    expect(entries[0].timesProposed).toBe(2);
    expect(entries[0].name).toBe("x_vol_liq");
  });

  it("miner acceptance upgrades status; validation rejection marks it; acceptance is sticky", () => {
    let entries = mergeLedger([], turnoverProposal, null);
    entries = mergeLedger(entries, null, {
      generatedAt: "2026-09-12T08:00:00Z",
      proposedDerivedFeatures: [{ name: "x_turnover", transform: "ratio", columns: ["volume", "liquidity"], edges: [0.5, 1.5] }],
    });
    expect(entries[0].status).toBe("accepted");
    expect(entries[0].edges).toEqual([0.5, 1.5]);
    // A later rejection (panel changed) must not demote an accepted entry.
    entries = mergeLedger(entries, null, {
      generatedAt: "2026-09-13T08:00:00Z",
      rejectedDerivedFeatures: ["x_turnover"],
    });
    expect(entries[0].status).toBe("accepted");
  });

  it("rejection marks a merely-proposed entry", () => {
    let entries = mergeLedger([], turnoverProposal, null);
    entries = mergeLedger(entries, null, {
      generatedAt: "2026-09-12T08:00:00Z",
      rejectedDerivedFeatures: ["x_turnover"],
    });
    expect(entries[0].status).toBe("rejected_validation");
  });

  it("accumulates mining budget idempotently per report generatedAt", () => {
    let entries = mergeLedger([], turnoverProposal, null);
    const report = {
      generatedAt: "2026-09-12T08:00:00Z",
      proposedDerivedFeatures: [{ name: "x_turnover", transform: "ratio", columns: ["volume", "liquidity"] }],
      derivedFeatureStats: [{ name: "x_turnover", strataTested: 40, survivors: 0, bestQ: 0.2 }],
    };
    entries = mergeLedger(entries, null, report);
    entries = mergeLedger(entries, null, report); // nightly rerun: no double count
    expect(entries[0].testsSpentTotal).toBe(40);
    expect(entries[0].minedRuns).toBe(1);
    expect(entries[0].status).toBe("accepted");
    // A second night with a survivor confirms and accumulates.
    entries = mergeLedger(entries, null, {
      generatedAt: "2026-09-13T08:00:00Z",
      derivedFeatureStats: [{ name: "x_turnover", strataTested: 42, survivors: 2, bestQ: 0.03 }],
    });
    expect(entries[0].testsSpentTotal).toBe(82);
    expect(entries[0].survivorsTotal).toBe(2);
    expect(entries[0].status).toBe("holdout_confirmed");
    expect(entries[0].bestQ).toBe(0.03);
  });

  it("recovers identity from the report when the proposals file was already overwritten", () => {
    const entries = mergeLedger([], null, {
      generatedAt: "2026-09-12T08:00:00Z",
      proposedDerivedFeatures: [{ name: "x_iv_ratio", transform: "ratio", columns: ["pm_iv", "option_iv"] }],
      derivedFeatureStats: [{ name: "x_iv_ratio", strataTested: 10, survivors: 0, bestQ: null }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe(representationKey("ratio", ["pm_iv", "option_iv"]));
    expect(entries[0].status).toBe("accepted");
    expect(entries[0].testsSpentTotal).toBe(10);
  });
});

describe("summarizeLedger", () => {
  it("computes the tests-per-confirmed-representation economics", () => {
    const base: Omit<RepresentationEntry, "key" | "name" | "status" | "testsSpentTotal" | "survivorsTotal"> = {
      transform: "ratio", columns: ["a", "b"], firstProposedAt: "", lastProposedAt: "",
      timesProposed: 1, minedRuns: 1,
    };
    const summary = summarizeLedger([
      { ...base, key: "k1", name: "x_a", status: "holdout_confirmed", testsSpentTotal: 60, survivorsTotal: 3 },
      { ...base, key: "k2", name: "x_b", status: "accepted", testsSpentTotal: 30, survivorsTotal: 0 },
      { ...base, key: "k3", name: "x_c", status: "rejected_validation", testsSpentTotal: 0, survivorsTotal: 0 },
      { ...base, key: "k4", name: "x_d", status: "proposed", testsSpentTotal: 0, survivorsTotal: 0 },
    ] as RepresentationEntry[]);
    expect(summary.totalProposed).toBe(4);
    expect(summary.accepted).toBe(2); // holdout_confirmed counts as accepted too
    expect(summary.rejectedValidation).toBe(1);
    expect(summary.holdoutConfirmed).toBe(1);
    expect(summary.testsSpentTotal).toBe(90);
    expect(summary.testsPerConfirmedRepresentation).toBe(90);
  });

  it("reports null economics before any confirmation", () => {
    expect(summarizeLedger([]).testsPerConfirmedRepresentation).toBeNull();
  });
});
