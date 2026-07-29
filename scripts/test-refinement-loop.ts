#!/usr/bin/env tsx
/**
 * Acceptance test for the self-learning loop's diagnostic half:
 *
 *   "See if the LLM understood why a hypothesis failed, and then knows enough
 *    from why it failed to test a new hypothesis that it thinks improves that
 *    last hypothesis."
 *
 * Runs the REAL nightly LLM step (live DeepSeek/Anthropic call) against a
 * scratch copy of the data dir — the live nightly-llm-advice.json is never
 * touched — then grades the response:
 *
 *   CHECK 1 (diagnosis): a hypothesisReview targets a struggling-family
 *           variant with a substantive causal observation.
 *   CHECK 2 (memory):    at least one such review records an
 *           invalidatedAssumption (durable per-family memory).
 *   CHECK 3 (refinement): a newHypothesis carries refinesHypothesisId
 *           pointing at a struggling variant, with catalog-valid conditions
 *           that actually differ from the parent's.
 *   CHECK 4 (scorable):  the refinement can be graded by the test scorer.
 *
 * Usage: npx tsx scripts/test-refinement-loop.ts [--data-dir data]
 */

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectStrugglingFamilies, runNightlyLlmStep, type NightlyHypothesisSummary } from "./lib/research/nightly-llm.js";
import { validateHypothesisConditions, formatConditionIssues } from "./lib/research/condition-catalog.js";
import { hypothesisScoringMode, type Hypothesis } from "./lib/research/hypothesis-shadow-eval.js";

const dataDirArg = process.argv.indexOf("--data-dir");
const DATA_DIR = dataDirArg >= 0 ? process.argv[dataDirArg + 1] : "data";

const SCRATCH_FILES = [
  "hypotheses.json",
  "llm-truth-state.json",
  "engine-state.json",
  "lessons.json",
  "learning-params.json",
  "research-themes.json",
  "research-opportunities.json",
  "daily-valuations.csv",
];

function loadValuationColumns(path: string): string[] {
  if (!existsSync(path)) return [];
  const header = readFileSync(path, "utf8").split("\n", 1)[0] ?? "";
  return header.split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), "refinement-acceptance-"));
  for (const file of SCRATCH_FILES) {
    const src = join(DATA_DIR, file);
    if (existsSync(src)) copyFileSync(src, join(scratch, file));
  }

  const hypotheses = JSON.parse(readFileSync(join(scratch, "hypotheses.json"), "utf8")) as Array<
    NightlyHypothesisSummary & Hypothesis
  >;
  const struggling = collectStrugglingFamilies(hypotheses);
  if (struggling.length === 0) {
    console.log("No struggling setup families in the current data — nothing to diagnose. Exiting.");
    rmSync(scratch, { recursive: true, force: true });
    return;
  }
  const strugglingVariantIds = new Set(struggling.flatMap((f) => f.variantIds));
  console.log(`Struggling families in prompt (${struggling.length}):`);
  for (const f of struggling) {
    console.log(`  - ${f.setupId}: ${f.wins}/${f.completed} (${Math.round(f.winRate * 100)}%), unscorable burned ${f.unscorableBurned}, variants ${f.variantIds.join(",")}`);
  }

  console.log("\nRunning real nightly LLM step against scratch dir...");
  const result = await runNightlyLlmStep({ dataDir: scratch });
  if (!result.wrote) {
    console.error(`FAIL: nightly LLM step did not produce advice (skipped=${result.skipped}, error=${result.error ?? "n/a"})`);
    process.exit(1);
  }

  const advice = JSON.parse(readFileSync(join(scratch, "nightly-llm-advice.json"), "utf8"));
  const reviews: Array<{ id: string; observation: string; invalidatedAssumption?: string }> =
    Array.isArray(advice.hypothesisReviews) ? advice.hypothesisReviews : [];
  const newHypotheses: Array<Record<string, any>> = Array.isArray(advice.newHypotheses) ? advice.newHypotheses : [];
  const valuationColumns = loadValuationColumns(join(scratch, "daily-valuations.csv"));

  let pass = true;

  // CHECK 1: substantive diagnosis of a struggling variant.
  const diagnoses = reviews.filter((r) => strugglingVariantIds.has(r.id) && r.observation.trim().length >= 40);
  if (diagnoses.length > 0) {
    console.log(`\nCHECK 1 PASS — ${diagnoses.length} struggling-variant diagnosis(es):`);
    for (const d of diagnoses) console.log(`  ${d.id}: ${d.observation}`);
  } else {
    console.log("\nCHECK 1 FAIL — no hypothesisReview diagnosed a struggling-family variant.");
    pass = false;
  }

  // CHECK 2: durable invalidated-assumption memory.
  const withAssumption = diagnoses.filter((d) => (d.invalidatedAssumption ?? "").length >= 10);
  if (withAssumption.length > 0) {
    console.log(`\nCHECK 2 PASS — invalidated assumption(s) recorded:`);
    for (const d of withAssumption) console.log(`  ${d.id}: ${d.invalidatedAssumption}`);
  } else {
    console.log("\nCHECK 2 WARN — no invalidatedAssumption recorded (allowed, but weakens durable memory).");
  }

  // CHECK 3 + 4: linked, catalog-valid, genuinely different, scorable refinement.
  const refinements = newHypotheses.filter((h) => typeof h.refinesHypothesisId === "string" && strugglingVariantIds.has(h.refinesHypothesisId));
  if (refinements.length === 0) {
    console.log("\nCHECK 3 FAIL — no newHypothesis refines a struggling variant (refinesHypothesisId).");
    pass = false;
  }
  for (const r of refinements) {
    const parent = hypotheses.find((h) => h.id === r.refinesHypothesisId)!;
    const issues = validateHypothesisConditions(r.conditions ?? {}, valuationColumns);
    const differs = JSON.stringify(r.conditions ?? {}) !== JSON.stringify(parent.conditions ?? {});
    const scoringMode = hypothesisScoringMode({ ...(r as unknown as Hypothesis), tests: [] });
    const ok = issues.length === 0 && differs && scoringMode !== null;
    console.log(`\nCHECK 3/4 ${ok ? "PASS" : "FAIL"} — refinement of ${r.refinesHypothesisId}:`);
    console.log(`  description: ${r.description}`);
    console.log(`  conditions:  ${JSON.stringify(r.conditions)}`);
    console.log(`  parent cond: ${JSON.stringify(parent.conditions)}`);
    console.log(`  prediction:  ${r.prediction} (direction=${r.direction})`);
    console.log(`  catalog: ${issues.length === 0 ? "valid" : formatConditionIssues(issues)}; differs from parent: ${differs}; scoring mode: ${scoringMode ?? "UNSCORABLE"}`);
    if (!ok) pass = false;
  }

  console.log(`\n${pass ? "ACCEPTANCE PASS" : "ACCEPTANCE FAIL"} — advice preserved at ${scratch}/nightly-llm-advice.json for inspection.`);
  process.exit(pass ? 0 : 1);
}

main();
