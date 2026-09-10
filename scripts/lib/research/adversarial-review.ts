/**
 * Adversarial promotion review — the devil's advocate at the gate.
 *
 * The statistical gates prove a family's record is unlikely under the null;
 * they cannot ask whether the record itself is misleading. The classes of
 * error that have actually bitten this system — pseudo-replicated tests on
 * the same contract, migration artifacts graded as strategy losses, edges
 * that were secretly one asset's regime — were all found by adversarial
 * reading of the evidence, not by p-values.
 *
 * This module institutionalizes that reading. When a promotion group's
 * deduplicated pooled record approaches the gate, one LLM session per family
 * is given the full test record and a single instruction: assume the edge is
 * FALSE and construct the strongest case that the evidence is misleading.
 *
 * The adversary has no power over evidence or promotion — its objections are
 * recorded in data/adversarial-reviews.json and stamped into the promotion
 * journal, so a promotion never happens without the strongest known case
 * against it sitting next to it in the record.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  dedupePooledGroupTests,
  PROMOTION_GROUPS,
  type Hypothesis,
  type HypothesisTest,
  type PromotionGroup,
} from "./hypothesis-shadow-eval.js";
import { extractLlmJsonObject, requestLlmText, resolveLlmRoute, type LlmMessage } from "../trading/llm-transport.js";

/** Review fires once the deduped pooled record reaches this many tests. */
export const ADVERSARIAL_REVIEW_TRIGGER_TESTS = 15;
/** Re-review when the record has grown by this many tests since last review. */
export const ADVERSARIAL_REREVIEW_DELTA = 5;
const MAX_REVIEWS_PER_NIGHT = 2;
const REVIEW_TIMEOUT_MS = Number(process.env.ADVERSARIAL_REVIEW_TIMEOUT_MS ?? 600_000);
const REVIEW_MAX_TOKENS = 8_192;

export interface AdversarialObjection {
  kind: string;
  argument: string;
  severity: "low" | "medium" | "high";
}

export interface AdversarialReview {
  groupId: string;
  label: string;
  generatedAt: string;
  testCountAtReview: number;
  wins: number;
  losses: number;
  objections: AdversarialObjection[];
  overallAssessment: string;
  recommendation: "no_objection" | "caution" | "strong_objection";
}

export interface AdversarialReviewsFile {
  updatedAt: string;
  reviews: Record<string, AdversarialReview>;
}

export interface ReviewCandidate {
  group: PromotionGroup;
  members: Hypothesis[];
  pooled: HypothesisTest[];
  wins: number;
}

export function loadAdversarialReviews(dataDir: string): AdversarialReviewsFile {
  const path = join(dataDir, "adversarial-reviews.json");
  if (!existsSync(path)) return { updatedAt: "", reviews: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (raw && typeof raw === "object" && raw.reviews && typeof raw.reviews === "object") {
      return { updatedAt: String(raw.updatedAt ?? ""), reviews: raw.reviews };
    }
  } catch {
    // fall through
  }
  return { updatedAt: "", reviews: {} };
}

/**
 * Promotion groups whose deduped pooled record has reached the trigger and
 * has grown enough since the last review (or was never reviewed).
 */
export function findReviewCandidates(
  hypotheses: Hypothesis[],
  existing: AdversarialReviewsFile,
): ReviewCandidate[] {
  const out: ReviewCandidate[] = [];
  for (const group of PROMOTION_GROUPS) {
    const members = hypotheses.filter((h) =>
      group.setupIds.includes(h.setupId ?? "")
      && h.status !== "killed" && h.status !== "archived");
    if (members.length === 0) continue;
    const pooled = dedupePooledGroupTests(members);
    if (pooled.length < ADVERSARIAL_REVIEW_TRIGGER_TESTS) continue;
    const prior = existing.reviews[group.groupId];
    if (prior && pooled.length < prior.testCountAtReview + ADVERSARIAL_REREVIEW_DELTA) continue;
    const wins = pooled.filter((t) => t.outcome === "win").length;
    out.push({ group, members, pooled, wins });
  }
  return out;
}

export function buildAdversarialReviewPrompt(candidate: ReviewCandidate): string {
  const { group, members, pooled, wins } = candidate;
  const memberLines = members.map((h) =>
    `- ${h.id} [${h.setupId}] conf=${h.confidence} timeframe=${h.timeframeDays}d dir=${h.direction ?? "?"}\n  thesis: ${h.description.slice(0, 160)}\n  conditions: ${JSON.stringify(h.conditions)}`).join("\n");
  const testLines = pooled.map((t) => {
    const magnitude = typeof t.magnitude === "number" ? `${t.magnitude > 0 ? "+" : ""}${t.magnitude}${t.magnitudeUnit ?? ""}` : "n/a";
    const marketId = t.contractEntry?.marketId ? t.contractEntry.marketId.slice(0, 18) : "unstamped";
    return `${t.date} ${String(t.outcome).toUpperCase()} mag=${magnitude} market=${marketId}`;
  }).join("\n");

  return `You are the ADVERSARIAL REVIEWER for a quantitative research system. A hypothesis family group is approaching its promotion gate. The statistical gates (binomial vs empirical base rate, one-sided t on realized edge, test deduplication) will run separately — that is not your job.

Your job: ASSUME THE EDGE IS FALSE. Construct the strongest case that this evidence is misleading. You are not asked to be balanced; the promotion machinery provides the case in favor. Hunt specifically for:
- pseudo-replication: same underlying bet counted as multiple observations (same market, same event family, correlated expiries)
- selection effects: were these contracts/dates selected by a process that saw the outcomes (survivorship, backfill, opener bias)?
- regime dependence: does the record span one market condition (one month, one vol regime, one asset's trend) that could end?
- base-rate illusion: would a no-skill rule harvesting the same side/price band have produced this record?
- execution assumptions: are wins priced at quotes a real order could not have gotten (spread, liquidity, timing)?
- mechanism absence: is there a plausible causal story, or only a pattern?
- multiple comparisons: how many sibling cuts were searched to find this one?

You have NO power to modify evidence or block promotion. Your objections are recorded next to the promotion so the decision is made with the strongest known counter-case on file.

GROUP: ${group.groupId} — ${group.label}
POOLED DEDUPED RECORD: ${wins}W / ${pooled.length - wins}L (${pooled.length} tests)

MEMBER HYPOTHESES:
${memberLines}

DEDUPED TEST RECORD (date, outcome, realized magnitude, market):
${testLines}

Respond with ONLY this JSON:
{
  "objections": [ {"kind": "<one of the hunt categories or 'other'>", "argument": "<specific, evidence-cited argument>", "severity": "low"|"medium"|"high"} ],
  "overallAssessment": "<2-4 sentences: the single strongest reason this record could be misleading, and what evidence would settle it>",
  "recommendation": "no_objection" | "caution" | "strong_objection"
}
Severity discipline: "high" only for objections that, if true, fully explain the record without any real edge. If you find nothing substantive, return an empty objections array and recommendation "no_objection" — manufactured objections corrode trust in real ones.`;
}

function sanitizeReview(raw: unknown, candidate: ReviewCandidate, now: Date): AdversarialReview | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const objections: AdversarialObjection[] = Array.isArray(obj.objections)
    ? (obj.objections as unknown[])
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
      .slice(0, 8)
      .map((o): AdversarialObjection => ({
        kind: String(o.kind ?? "other").slice(0, 60),
        argument: String(o.argument ?? "").slice(0, 500),
        severity: o.severity === "high" || o.severity === "medium" ? o.severity : "low",
      }))
      .filter((o) => o.argument)
    : [];
  const recommendation = obj.recommendation === "strong_objection" || obj.recommendation === "caution"
    ? obj.recommendation
    : "no_objection";
  return {
    groupId: candidate.group.groupId,
    label: candidate.group.label,
    generatedAt: now.toISOString(),
    testCountAtReview: candidate.pooled.length,
    wins: candidate.wins,
    losses: candidate.pooled.length - candidate.wins,
    objections,
    overallAssessment: String(obj.overallAssessment ?? "").slice(0, 800),
    recommendation,
  };
}

export interface RunAdversarialReviewResult {
  skipped: boolean;
  candidates: number;
  reviewed: number;
  error?: string;
}

export async function runAdversarialReviewStep(opts: { dataDir: string }): Promise<RunAdversarialReviewResult> {
  const log = (msg: string) => console.log(`[adversarial-review] ${msg}`);
  if (process.env.ADVERSARIAL_REVIEW_DISABLE === "1") {
    log("ADVERSARIAL_REVIEW_DISABLE=1; skipping.");
    return { skipped: true, candidates: 0, reviewed: 0 };
  }

  const hypothesesPath = join(opts.dataDir, "hypotheses.json");
  if (!existsSync(hypothesesPath)) return { skipped: true, candidates: 0, reviewed: 0 };
  let hypotheses: Hypothesis[];
  try {
    hypotheses = JSON.parse(readFileSync(hypothesesPath, "utf-8"));
    if (!Array.isArray(hypotheses)) throw new Error("hypotheses.json is not an array");
  } catch (e: any) {
    return { skipped: false, candidates: 0, reviewed: 0, error: String(e?.message ?? e) };
  }

  const existing = loadAdversarialReviews(opts.dataDir);
  const candidates = findReviewCandidates(hypotheses, existing);
  if (candidates.length === 0) {
    log("no promotion group is close enough to its gate for review.");
    return { skipped: false, candidates: 0, reviewed: 0 };
  }

  const route = resolveLlmRoute("nightly_research");
  if (!route) {
    log("no API key for nightly_research route; skipping");
    return { skipped: true, candidates: candidates.length, reviewed: 0 };
  }

  let reviewed = 0;
  const now = new Date();
  for (const candidate of candidates.slice(0, MAX_REVIEWS_PER_NIGHT)) {
    try {
      const prompt = buildAdversarialReviewPrompt(candidate);
      const messages: LlmMessage[] = [{ role: "user", content: prompt }];
      const resp = await requestLlmText(route, messages, { maxTokens: REVIEW_MAX_TOKENS, timeoutMs: REVIEW_TIMEOUT_MS });
      const jsonText = extractLlmJsonObject(resp.text);
      const parsed = jsonText ? JSON.parse(jsonText) : null;
      const review = sanitizeReview(parsed, candidate, now);
      if (!review) {
        log(`${candidate.group.groupId}: response did not parse; skipped`);
        continue;
      }
      existing.reviews[candidate.group.groupId] = review;
      reviewed++;
      log(`${candidate.group.groupId}: ${review.recommendation} (${review.objections.length} objection(s)) at ${review.testCountAtReview} tests`);
    } catch (e: any) {
      log(`${candidate.group.groupId}: failed — ${e?.message ?? e}`);
    }
  }

  if (reviewed > 0) {
    writeFileSync(join(opts.dataDir, "adversarial-reviews.json"), JSON.stringify({
      updatedAt: now.toISOString(),
      reviews: existing.reviews,
    }, null, 2) + "\n");
  }
  return { skipped: false, candidates: candidates.length, reviewed };
}
