import { describe, expect, it } from "vitest";
import {
  buildDatasetInventory,
  buildExplorerPrompt,
  EXPLORER_FOCUS_ROTATION,
  EXPLORER_MAX_PROPOSED_HYPOTHESES,
  EXPLORER_MAX_PROPOSED_STRATS,
  explorerFocusForDate,
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
