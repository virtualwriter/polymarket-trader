/**
 * Reinstates hypotheses the unscorable sweep retired for the wrong reason.
 *
 * The sweep is meant to retire theses the scorer can never grade *because they
 * are vaguely worded*, while sparing Polymarket-contract theses, which no
 * wording can turn into a spot move. Its first run misread the second group:
 * isPolymarketExpression only inspected the optional `venue` and `signalType`
 * fields, and the FIND-derived contract theses set neither — they name the
 * contract's price instead (sell_yes_edge_pts, touch_direction,
 * pm_iv_minus_opt_iv_pts, adjusted_no_gap_pts). 22 of them were retired.
 *
 * The detector now reads the conditions, so this only has to undo the damage
 * already written to disk. Run with --apply; without it, prints the plan.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  appendPostMortemSegment,
  isPolymarketExpression,
  type Hypothesis,
} from "./lib/research/hypothesis-shadow-eval.js";

const APPLY = process.argv.includes("--apply");
const PATH = process.env.HYPOTHESES_PATH ?? "data/hypotheses.json";

const raw = JSON.parse(readFileSync(PATH, "utf8")) as Hypothesis[] | { hypotheses: Hypothesis[] };
const hypotheses: Hypothesis[] = Array.isArray(raw) ? raw : raw.hypotheses;

let restored = 0;
for (const hypothesis of hypotheses) {
  if (hypothesis.status !== "killed") continue;
  if (!(hypothesis.postMortem ?? "").includes("Retired unscorable")) continue;
  if (!isPolymarketExpression(hypothesis)) continue;

  restored++;
  console.log(`RESTORE ${hypothesis.id} (${hypothesis.setupId ?? hypothesis.source})`);
  if (!APPLY) continue;

  hypothesis.status = "active";
  hypothesis.postMortem = appendPostMortemSegment(
    hypothesis.postMortem,
    "Retirement reversed: this is a Polymarket contract thesis, and the spot scorer cannot grade a contract trade regardless of how the thesis is worded. The limitation is the scorer's, not this thesis's, so it was reinstated rather than re-authored. Its evidence has to come from the shadow record.",
  );
}

console.log(`\n${restored} contract hypotheses ${APPLY ? "restored" : "would be restored"} (of ${hypotheses.length} total).`);
if (APPLY) {
  writeFileSync(PATH, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`Wrote ${PATH}.`);
}
