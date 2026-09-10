import { describe, expect, it } from "vitest";
import {
  buildDatasetInventory,
  buildExplorerPrompt,
  EXPLORER_MAX_PROPOSED_HYPOTHESES,
  EXPLORER_MAX_PROPOSED_STRATS,
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
    const combos = [
      ["fund", "liq"], ["fund", "dow"], ["fund", "money"], ["fund", "spread"],
      ["liq", "dow"], ["liq", "money"], ["liq", "spread"],
    ].map((features) => ({ features, rationale: "x" }));
    expect(sanitizeStratProposals(combos)).toHaveLength(EXPLORER_MAX_PROPOSED_STRATS);
  });

  it("returns empty on non-array input", () => {
    expect(sanitizeStratProposals(undefined)).toEqual([]);
    expect(sanitizeStratProposals({})).toEqual([]);
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
