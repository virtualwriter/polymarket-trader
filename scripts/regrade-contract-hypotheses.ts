/**
 * One-off: discard verdicts that graded a Polymarket contract thesis on spot.
 *
 * The scorer used to fall back to the underlying's percent move for contract
 * theses, so a premium sale was recorded as a loss whenever spot failed to
 * travel 2% in the thesis direction. That is unrelated to whether the contract
 * paid: the gold one-touch families sat at 0 wins from 20 while the same setup
 * won 62% of the time in the shadow ledger, which prices the actual instrument.
 *
 * Those verdicts are not merely stale, they are measurements of a different
 * question, so they are excluded from setup statistics rather than kept as
 * evidence. Variants killed on the strength of them are returned to active so
 * the contract scorer can grade them properly.
 *
 * Run with --apply to write; the default is a dry run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  appendPostMortemSegment,
  isPolymarketExpression,
} from "./lib/research/hypothesis-shadow-eval.js";

const HYPOTHESES_PATH = process.env.HYPOTHESES_PATH ?? "data/hypotheses.json";
const APPLY = process.argv.includes("--apply");
const EXCLUSION_REASON = "regraded_pm_contract_scorer";

/** Methods that measured spot when the thesis was about a contract. */
const SPOT_METHOD_MARKERS = [
  "spot_directional",
  "pm_underlying_proxy",
  "spot_neutral",
  "underlying proxy",
];

function wasGradedOnSpot(test: { actualMove?: string; contractEntry?: unknown }): boolean {
  if (test.contractEntry) return false;
  const text = String(test.actualMove ?? "").toLowerCase();
  return SPOT_METHOD_MARKERS.some((marker) => text.includes(marker));
}

const raw = JSON.parse(readFileSync(HYPOTHESES_PATH, "utf-8"));
const hypotheses: any[] = Array.isArray(raw) ? raw : (raw.hypotheses ?? []);

let contractHyps = 0;
let excludedTests = 0;
let revived = 0;
const touchedSetups = new Set<string>();

for (const hypothesis of hypotheses) {
  if (!isPolymarketExpression(hypothesis)) continue;
  contractHyps++;

  let excludedHere = 0;
  for (const test of hypothesis.tests ?? []) {
    if (test.outcome !== "win" && test.outcome !== "loss") continue;
    if (test.excludedFromSetupStats) continue;
    if (!wasGradedOnSpot(test)) continue;
    test.excludedFromSetupStats = true;
    test.exclusionReason = EXCLUSION_REASON;
    excludedHere++;
    excludedTests++;
  }
  if (excludedHere === 0) continue;
  if (hypothesis.setupId) touchedSetups.add(hypothesis.setupId);

  // Win rate is recomputed from what is left, so a family that has nothing
  // left reads as untested rather than as a run of losses.
  const counted = (hypothesis.tests ?? []).filter((t: any) =>
    (t.outcome === "win" || t.outcome === "loss") && !t.excludedFromSetupStats);
  const wins = counted.filter((t: any) => t.outcome === "win").length;
  hypothesis.winRate = counted.length > 0 ? wins / counted.length : 0;

  hypothesis.postMortem = appendPostMortemSegment(
    hypothesis.postMortem,
    `Discarded ${excludedHere} verdicts that graded this contract thesis on the underlying's spot move. The trade is a contract position whose return depends on its entry price and barrier, not on how far spot travelled, so those results measured a different question. Retesting under the contract scorer.`,
  );

  if (hypothesis.status === "killed") {
    hypothesis.status = "active";
    hypothesis.promotedToSignal = false;
    revived++;
  }
}

console.log(`Polymarket-contract hypotheses: ${contractHyps}`);
console.log(`spot-graded verdicts discarded:  ${excludedTests}`);
console.log(`variants returned to active:     ${revived}`);
console.log(`setup families affected:         ${touchedSetups.size}`);
for (const setupId of [...touchedSetups].sort()) console.log(`  - ${setupId}`);

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply to commit these changes.");
} else {
  const next = Array.isArray(raw) ? hypotheses : { ...raw, hypotheses };
  writeFileSync(HYPOTHESES_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nWrote ${HYPOTHESES_PATH}.`);
}
