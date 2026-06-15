import { describe, expect, it } from "vitest";
import { buildDryRunVerificationArtifact } from "./artifacts.js";

describe("trading artifacts", () => {
  it("includes staged quant preview counts in dry-run verification", () => {
    const artifact = buildDryRunVerificationArtifact({
      engineState: {
        portfolio: { openPositions: 2 },
      },
      candidateActions: {
        mechanicalExits: [],
        signalKillExits: [],
        entryCandidates: [{ type: "ONE_TOUCH_HIGH_EDGE_NO" }],
        sizingPreviews: [{ previewSize: 2.5 }],
        portfolioExposurePreviews: [{ candidateId: "ONE_TOUCH_HIGH_EDGE_NO:BTC:0" }],
        stagedQuantRules: [
          { liveSizingEnabled: false },
          { liveSizingEnabled: true },
        ],
      },
      executionPlan: {
        llmCloses: [],
        rejectedLlmActions: [{ reason: "not_allowed" }],
      },
      mutationDisabled: true,
      shadowArchitecture: true,
      generatedAt: "2026-06-14T00:00:00.000Z",
    });

    expect(artifact?.checks).toMatchObject({
      portfolioPositions: 2,
      entryCandidates: 1,
      sizingPreviews: 1,
      portfolioExposurePreviews: 1,
      stagedQuantRules: 2,
      stagedQuantLiveSizingEnabled: 1,
      llmClosesRejected: 1,
    });
  });
});
