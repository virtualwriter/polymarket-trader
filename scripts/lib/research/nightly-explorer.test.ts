import { describe, expect, it } from "vitest";
import {
  buildDatasetInventory,
  buildExplorerPrompt,
  EXPLORER_FOCUS_ROTATION,
  EXPLORER_MAX_PROPOSED_FEATURES,
  EXPLORER_MAX_PROPOSED_HYPOTHESES,
  EXPLORER_MAX_PROPOSED_STRATS,
  explorerFocusForDate,
  EXPLORER_MAX_SPORTS_PROPOSALS,
  sanitizeFeatureProposals,
  sanitizeSportsProposals,
  sanitizeStratProposals,
} from "./nightly-explorer.js";
import type { ResearchDataset } from "./research-queries.js";

const emptyDataset: ResearchDataset = {
  trades: [],
  shadows: [],
  hypotheses: [],
  valuationRows: [],
  panelRows: [],
  spotPanelRows: [],
  fundingRows: [],
  macroRows: [],
  weatherRows: [],
  softballRows: [],
};

describe("buildExplorerPrompt", () => {
  const prompt = buildExplorerPrompt("DATASET INVENTORY (schemas):\n{}", ["btcPrice", "pm_iv_minus_opt_iv_pts"]);

  it("frames the free-roaming mission with the repeatability constraint", () => {
    expect(prompt).toContain("roam the raw archives freely");
    expect(prompt).toContain("REPEATABLE RULES ONLY");
    expect(prompt).toContain("never a story about one market");
  });

  it("advertises the freeform budget and the unchanged testing gauntlet", () => {
    expect(prompt).toContain(`up to ${EXPLORER_MAX_PROPOSED_HYPOTHESES} objects`);
    expect(prompt).toContain("face the full shadow-test gauntlet");
    expect(prompt).toContain("same holdout + false-discovery correction");
  });

  it("requires catalog-only condition keys and embeds the catalog", () => {
    expect(prompt).toContain("CONDITION KEY CATALOG");
    expect(prompt).toContain("conditions MUST use only keys");
  });

  it("caps stratification proposals and restricts them to known miner features", () => {
    expect(prompt).toContain(`up to ${EXPLORER_MAX_PROPOSED_STRATS} objects`);
    expect(prompt).toContain("ivgap");
    expect(prompt).toContain("spotret");
  });

  it("invites derived-feature proposals with the FDR warning and column whitelist", () => {
    expect(prompt).toContain(`up to ${EXPLORER_MAX_PROPOSED_FEATURES} objects`);
    expect(prompt).toContain("NEW REPRESENTATIONS");
    expect(prompt).toContain("burn shared false-discovery budget");
    expect(prompt).toContain("pm_to_underlying_cap_ratio");
    expect(prompt).toContain("coverage-gap evidence");
  });

  it("routes sports findings to sportsProposals with the validation-venue rule", () => {
    expect(prompt).toContain(`up to ${EXPLORER_MAX_SPORTS_PROPOSALS} objects`);
    expect(prompt).toContain("DIFFERENT VALIDATION VENUE");
    expect(prompt).toContain("sports-arb side evaluates it prospectively");
    expect(prompt).toContain("may become a proposedHypothesis");
  });
});

describe("sanitizeSportsProposals", () => {
  it("accepts valid rules and drops junk", () => {
    const out = sanitizeSportsProposals([
      {
        dataset: "weather",
        where: [{ column: "city", eq: "nyc" }, { column: "settled", eq: 1 }],
        metric: "final_pnl_pct",
        direction: "positive",
        rationale: "final snapshot beat implied in 12/15 settled days",
      },
      // Non-sports dataset: the PM panel must never route here.
      { dataset: "panel", where: [{ column: "dte_days", lte: 30 }], metric: "no_pnl_pct_7d", direction: "positive" },
      // No where-clauses: not a rule.
      { dataset: "weather", where: [], metric: "final_pnl_pct", direction: "positive" },
      // Bad direction.
      { dataset: "softball", where: [{ column: "inning", lte: 4 }], metric: "pnl_pct", direction: "up" },
      // Bad metric name.
      { dataset: "softball", where: [{ column: "inning", lte: 4 }], metric: "PnL%; drop table", direction: "positive" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].dataset).toBe("weather");
    expect(out[0].where).toHaveLength(2);
    expect(out[0].direction).toBe("positive");
  });

  it("dedupes identical rules and enforces the cap", () => {
    const rule = {
      dataset: "softball",
      where: [{ column: "ask", lte: 0.5 }],
      metric: "pnl_pct",
      direction: "positive",
      rationale: "cheap overs",
    };
    const many = Array.from({ length: EXPLORER_MAX_SPORTS_PROPOSALS + 3 }, (_, i) => ({
      ...rule,
      where: [{ column: "ask", lte: 0.1 * (i + 1) }],
    }));
    expect(sanitizeSportsProposals([rule, rule])).toHaveLength(1);
    expect(sanitizeSportsProposals(many)).toHaveLength(EXPLORER_MAX_SPORTS_PROPOSALS);
  });

  it("tolerates garbage input", () => {
    expect(sanitizeSportsProposals(undefined)).toEqual([]);
    expect(sanitizeSportsProposals("nope")).toEqual([]);
  });
});

describe("sanitizeStratProposals", () => {
  it("keeps valid combos, drops unknown features, dupes, and wrong sizes", () => {
    const out = sanitizeStratProposals([
      { features: ["fund", "liq"], rationale: "funding x liquidity" },
      { features: ["liq", "fund"], rationale: "same combo reordered" },
      { features: ["fund", "made_up"], rationale: "unknown feature dropped -> too short" },
      { features: ["fund"], rationale: "too short" },
      { features: ["money", "dow", "spread"], rationale: "triple ok" },
      "junk",
    ]);
    expect(out).toEqual([
      { features: ["fund", "liq"], rationale: "funding x liquidity" },
      { features: ["money", "dow", "spread"], rationale: "triple ok" },
    ]);
  });

  it("caps at the proposal budget", () => {
    const names = ["fund", "liq", "dow", "money", "spread", "macro", "spotret"];
    const combos: Array<{ features: string[]; rationale: string }> = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        combos.push({ features: [names[i], names[j]], rationale: "x" });
      }
    }
    expect(combos.length).toBeGreaterThan(EXPLORER_MAX_PROPOSED_STRATS);
    expect(sanitizeStratProposals(combos)).toHaveLength(EXPLORER_MAX_PROPOSED_STRATS);
  });

  it("returns empty on non-array input", () => {
    expect(sanitizeStratProposals(undefined)).toEqual([]);
    expect(sanitizeStratProposals({})).toEqual([]);
  });

  it("accepts combos referencing proposed derived features by x_ name", () => {
    const out = sanitizeStratProposals([
      { features: ["x_turnover", "price"], rationale: "derived x price" },
      { features: ["x_BadName!", "price"], rationale: "malformed derived name -> too short" },
    ]);
    expect(out).toEqual([{ features: ["x_turnover", "price"], rationale: "derived x price" }]);
  });
});

describe("sanitizeFeatureProposals", () => {
  it("keeps valid transforms, drops bad columns/arity/transform/name, dedupes", () => {
    const out = sanitizeFeatureProposals([
      { name: "turnover", transform: "ratio", columns: ["volume", "liquidity"], rationale: "turnover proxy" },
      { name: "dup", transform: "ratio", columns: ["volume", "liquidity"], rationale: "same transform+cols" },
      { name: "bad_col", transform: "ratio", columns: ["volume", "made_up"], rationale: "" },
      { name: "bad_arity", transform: "abs", columns: ["volume", "liquidity"], rationale: "" },
      { name: "bad_transform", transform: "sqrt", columns: ["volume"], rationale: "" },
      { name: "  9starts_with_digit", transform: "abs", columns: ["moneyness_pct"], rationale: "" },
      "junk",
    ]);
    expect(out).toEqual([
      { name: "turnover", transform: "ratio", columns: ["volume", "liquidity"], rationale: "turnover proxy" },
    ]);
  });

  it("validates optional edges: ascending and finite, else dropped from the proposal", () => {
    const out = sanitizeFeatureProposals([
      { name: "spread_abs", transform: "diff", columns: ["yes_ask", "yes_bid"], edges: [0.005, 0.02], rationale: "" },
      { name: "bad_edges", transform: "diff", columns: ["pm_iv", "option_iv"], edges: [3, 1], rationale: "" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].edges).toEqual([0.005, 0.02]);
    expect(out[1].edges).toBeUndefined();
  });

  it("caps at the feature budget and sanitizes names", () => {
    const columns = ["strike", "spot", "dte_days", "yes_ask", "yes_bid", "pm_spread", "liquidity"];
    const proposals = columns.map((c, i) => ({
      name: `Feat ${i} Name`, transform: "abs", columns: [c], rationale: "x",
    }));
    const out = sanitizeFeatureProposals(proposals);
    expect(out).toHaveLength(EXPLORER_MAX_PROPOSED_FEATURES);
    expect(out[0].name).toBe("feat_0_name");
  });

  it("returns empty on non-array input", () => {
    expect(sanitizeFeatureProposals(undefined)).toEqual([]);
    expect(sanitizeFeatureProposals("nope")).toEqual([]);
  });
});

describe("novelty steering", () => {
  it("lists known clusters as null results when provided", () => {
    const prompt = buildExplorerPrompt("INVENTORY", [], {
      knownClusters: ["Panel FIND: buy NO 7d ALL | yesAsk between 0.35 and 0.65 | WR=58%"],
    });
    expect(prompt).toContain("REDISCOVERING THESE IS A NULL RESULT");
    expect(prompt).toContain("yesAsk between 0.35 and 0.65");
  });

  it("mandates the nightly focus territory when provided", () => {
    const prompt = buildExplorerPrompt("INVENTORY", [], {
      focus: { name: "funding_history", brief: "funding regimes and persistence" },
    });
    expect(prompt).toContain("TONIGHT'S MANDATORY FOCUS: funding_history");
    expect(prompt).toContain("at least half of your queries");
  });

  it("rotates the focus deterministically across the full territory list", () => {
    const names = new Set<string>();
    for (let day = 0; day < EXPLORER_FOCUS_ROTATION.length; day++) {
      names.add(explorerFocusForDate(new Date(Date.UTC(2026, 8, 10 + day, 7))).name);
    }
    expect(names.size).toBe(EXPLORER_FOCUS_ROTATION.length);
    // Same night (before/after midnight UTC shifts within the same UTC day) is stable.
    expect(explorerFocusForDate(new Date(Date.UTC(2026, 8, 10, 1))).name)
      .toBe(explorerFocusForDate(new Date(Date.UTC(2026, 8, 10, 23))).name);
  });

  it("keeps the PM panel out of the rotation except for never-crossed interactions", () => {
    const panelEntries = EXPLORER_FOCUS_ROTATION.filter((f) => f.name.includes("panel"));
    expect(panelEntries.map((f) => f.name)).toEqual(["spot_panel", "panel_interactions"]);
    expect(panelEntries.find((f) => f.name === "panel_interactions")?.brief).toContain("never cross");
  });
});

describe("buildDatasetInventory", () => {
  it("lists a schema line for every scannable dataset even when empty", () => {
    const inventory = buildDatasetInventory({
      ...emptyDataset,
      fundingRows: [{ date: "2026-09-01", asset: "BTC", funding_ann: "-0.5" }],
    });
    expect(inventory).toContain("DATASET INVENTORY");
    expect(inventory).toContain("funding_ann");
  });
});
