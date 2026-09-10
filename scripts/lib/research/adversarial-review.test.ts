import { describe, expect, it } from "vitest";
import {
  ADVERSARIAL_REREVIEW_DELTA,
  ADVERSARIAL_REVIEW_TRIGGER_TESTS,
  buildAdversarialReviewPrompt,
  findReviewCandidates,
  type AdversarialReviewsFile,
} from "./adversarial-review.js";
import { PROMOTION_GROUPS, type Hypothesis } from "./hypothesis-shadow-eval.js";

const group = PROMOTION_GROUPS[0];

function memberWithTests(id: string, setupId: string, testCount: number): Hypothesis {
  return {
    id, setupId, created: "2026-08-01",
    description: `Test hypothesis ${id} for ${setupId}`,
    conditions: { yesAsk: "between 0.35 and 0.65" },
    prediction: "NO P&L positive over horizon", timeframeDays: 3, confidence: 0.7,
    direction: "neutral",
    tests: Array.from({ length: testCount }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      triggered: true,
      outcome: (i % 3 === 0 ? "loss" : "win") as "win" | "loss",
      actualMove: "x",
      magnitude: i % 3 === 0 ? -20 : 40,
      magnitudeUnit: "pct_return" as const,
      contractEntry: { marketId: `mkt-${id}-${i}` } as any,
    })),
    winRate: 0.66, status: "active", promotedToSignal: false, postMortem: null, source: "llm",
  };
}

const noReviews: AdversarialReviewsFile = { updatedAt: "", reviews: {} };

describe("findReviewCandidates", () => {
  it("ignores groups below the trigger threshold", () => {
    const hyps = [memberWithTests("H-1", group.setupIds[0], ADVERSARIAL_REVIEW_TRIGGER_TESTS - 1)];
    expect(findReviewCandidates(hyps, noReviews)).toHaveLength(0);
  });

  it("emits a candidate once the deduped pooled record reaches the trigger", () => {
    const hyps = [memberWithTests("H-1", group.setupIds[0], ADVERSARIAL_REVIEW_TRIGGER_TESTS)];
    const candidates = findReviewCandidates(hyps, noReviews);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].group.groupId).toBe(group.groupId);
    expect(candidates[0].pooled.length).toBe(ADVERSARIAL_REVIEW_TRIGGER_TESTS);
  });

  it("does not re-review until the record grows by the delta", () => {
    const hyps = [memberWithTests("H-1", group.setupIds[0], ADVERSARIAL_REVIEW_TRIGGER_TESTS + 1)];
    const reviewed: AdversarialReviewsFile = {
      updatedAt: "2026-09-01T00:00:00Z",
      reviews: {
        [group.groupId]: {
          groupId: group.groupId, label: group.label, generatedAt: "2026-09-01T00:00:00Z",
          testCountAtReview: ADVERSARIAL_REVIEW_TRIGGER_TESTS,
          wins: 10, losses: 5, objections: [], overallAssessment: "", recommendation: "no_objection",
        },
      },
    };
    expect(findReviewCandidates(hyps, reviewed)).toHaveLength(0);
    const grown = [memberWithTests("H-1", group.setupIds[0], ADVERSARIAL_REVIEW_TRIGGER_TESTS + ADVERSARIAL_REREVIEW_DELTA)];
    expect(findReviewCandidates(grown, reviewed)).toHaveLength(1);
  });

  it("excludes killed members from the pooled record", () => {
    const killed = memberWithTests("H-1", group.setupIds[0], ADVERSARIAL_REVIEW_TRIGGER_TESTS);
    killed.status = "killed";
    expect(findReviewCandidates([killed], noReviews)).toHaveLength(0);
  });
});

describe("buildAdversarialReviewPrompt", () => {
  const [candidate] = findReviewCandidates(
    [memberWithTests("H-1", group.setupIds[0], ADVERSARIAL_REVIEW_TRIGGER_TESTS)],
    noReviews,
  );
  const prompt = buildAdversarialReviewPrompt(candidate);

  it("instructs the adversarial stance with the hunt list", () => {
    expect(prompt).toContain("ASSUME THE EDGE IS FALSE");
    expect(prompt).toContain("pseudo-replication");
    expect(prompt).toContain("regime dependence");
    expect(prompt).toContain("base-rate illusion");
  });

  it("denies the reviewer any power over evidence", () => {
    expect(prompt).toContain("NO power to modify evidence or block promotion");
  });

  it("includes the deduped record and member conditions", () => {
    expect(prompt).toContain(`${group.groupId}`);
    expect(prompt).toContain("yesAsk");
    expect(prompt).toContain("mkt-H-1-0");
  });

  it("permits an honest empty verdict", () => {
    expect(prompt).toContain('"no_objection"');
    expect(prompt).toContain("manufactured objections corrode trust");
  });
});
