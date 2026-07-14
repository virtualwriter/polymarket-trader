import { describe, expect, it } from "vitest";
import { buildLessonsArtifact } from "./lessons.js";
import type { ReportClosedTrade } from "../reporting/report-builders.js";
import type { ReportShadowWithCloseTrigger } from "../reporting/report-inputs.js";

function trade(overrides: Partial<ReportClosedTrade> & { id: string }): ReportClosedTrade {
  return {
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: "2026-06-02T00:00:00.000Z",
    asset: "BTC",
    venue: "polymarket",
    direction: "long",
    entryPrice: 0.5,
    exitPrice: 0.6,
    size: 1,
    pnl: 1,
    pnlPct: 10,
    marketPnl: 1,
    fundingPnl: 0,
    signalType: "SIG_A",
    hypothesisId: null,
    thesis: "fixture",
    closeReason: "expiry",
    ...overrides,
  };
}

const baseShadow: ReportShadowWithCloseTrigger = {
  id: "shadow-1",
  status: "resolved",
  blockedAt: "2026-06-01T00:00:00.000Z",
  blockedReason: "some_shadow_reason",
  signalType: "SHADOW_SIG",
  asset: "BTC",
  venue: "polymarket",
  direction: "short",
  thesis: "fixture thesis",
};

function shadow(overrides: Partial<ReportShadowWithCloseTrigger> & { id: string }): ReportShadowWithCloseTrigger {
  return { ...baseShadow, ...overrides };
}

describe("buildLessonsArtifact", () => {
  it("groups live trades by signalType, computes stats, and rounds pnl/winRate to 4 decimals", () => {
    const trades = [
      trade({ id: "t1", signalType: "SIG_A", asset: "BTC", pnl: 1 / 3, closeReason: "expiry" }),
      trade({ id: "t2", signalType: "SIG_A", asset: "BTC", pnl: -1 / 3, closeReason: "stop_hit" }),
      trade({ id: "t3", signalType: "SIG_B", asset: "ETH", pnl: 2, closeReason: "expiry" }),
    ];

    const artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: trades, shadows: [] });

    expect(artifact.generatedAt).toBe("2026-07-14T00:00:00.000Z");
    const sigA = artifact.lessons.find((lesson) => lesson.signalType === "SIG_A" && lesson.scope === "live" && !lesson.asset);
    expect(sigA).toEqual({
      signalType: "SIG_A",
      scope: "live",
      n: 2,
      wins: 1,
      winRate: 0.5,
      pnl: 0,
      closeTriggerCounts: { expiry: 1, stop_hit: 1 },
      note: "2 live trades, 50% win rate, +$0.00 total",
    });
    const sigB = artifact.lessons.find((lesson) => lesson.signalType === "SIG_B");
    expect(sigB?.pnl).toBe(2);
    expect(sigB?.wins).toBe(1);
  });

  it("emits a per-asset sub-lesson only once an asset reaches n >= 5 live trades", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, i) => trade({ id: `btc-${i}`, signalType: "SIG_A", asset: "BTC", pnl: 1 })),
      trade({ id: "eth-1", signalType: "SIG_A", asset: "ETH", pnl: 1 }),
    ];
    let artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: trades, shadows: [] });
    expect(artifact.lessons.some((lesson) => lesson.asset === "BTC")).toBe(false);
    expect(artifact.lessons.some((lesson) => lesson.asset === "ETH")).toBe(false);

    trades.push(trade({ id: "btc-5", signalType: "SIG_A", asset: "BTC", pnl: 1 }));
    artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: trades, shadows: [] });
    const btcLesson = artifact.lessons.find((lesson) => lesson.asset === "BTC");
    expect(btcLesson?.n).toBe(5);
    expect(btcLesson?.note).toBe("5 live BTC trades, 100% win rate, +$5.00 total");
    expect(artifact.lessons.some((lesson) => lesson.asset === "ETH")).toBe(false);
  });

  it("respects a custom minAssetTrades threshold", () => {
    const trades = [
      trade({ id: "a", signalType: "SIG_A", asset: "BTC", pnl: 1 }),
      trade({ id: "b", signalType: "SIG_A", asset: "BTC", pnl: 1 }),
    ];
    const artifact = buildLessonsArtifact({
      generatedAt: "2026-07-14T00:00:00.000Z",
      liveTrades: trades,
      shadows: [],
      minAssetTrades: 2,
    });
    expect(artifact.lessons.find((lesson) => lesson.asset === "BTC")?.n).toBe(2);
  });

  it("only counts resolved shadows with a hypotheticalResult, keyed by closeTrigger falling back to closeReason", () => {
    const shadows = [
      shadow({
        id: "s1",
        signalType: "SHADOW_SIG",
        hypotheticalResult: { pnl: 0.5, pnlPct: 5, outcome: "win", closeReason: "target", closeTrigger: "observed_gap_closed" },
      }),
      shadow({
        id: "s2",
        signalType: "SHADOW_SIG",
        hypotheticalResult: { pnl: -0.2, pnlPct: -2, outcome: "loss", closeReason: "stop" },
      }),
      shadow({ id: "s3", signalType: "SHADOW_SIG", status: "open", hypotheticalResult: undefined }),
      shadow({ id: "s4", signalType: "SHADOW_SIG", status: "cancelled" }),
    ];

    const artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: [], shadows });
    const lesson = artifact.lessons.find((item) => item.signalType === "SHADOW_SIG");
    expect(lesson).toEqual({
      signalType: "SHADOW_SIG",
      scope: "shadow",
      n: 2,
      wins: 1,
      winRate: 0.5,
      pnl: 0.3,
      closeTriggerCounts: { observed_gap_closed: 1, stop: 1 },
      note: "2 resolved shadows, 50% win rate, +$0.30 total",
    });
  });

  it("excludes shadows with learningExcluded set", () => {
    const shadows = [
      shadow({
        id: "s1",
        signalType: "SHADOW_SIG",
        hypotheticalResult: { pnl: 1, pnlPct: 10, outcome: "win", closeReason: "target" },
      }),
      shadow({
        id: "s2",
        signalType: "SHADOW_SIG",
        hypotheticalResult: { pnl: 1, pnlPct: 10, outcome: "win", closeReason: "target" },
        learningExcluded: { reason: "heatmap_shadow_horizon_mismatch", note: "excluded" },
      }),
    ];
    const artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: [], shadows });
    expect(artifact.lessons.find((item) => item.signalType === "SHADOW_SIG")?.n).toBe(1);
  });

  it("excludes legacy force-closed one-touch shadows via isForceClosedOneTouchShadow", () => {
    const shadows = [
      shadow({
        id: "s1",
        signalType: "ONE_TOUCH_HIGH_EDGE_NO",
        blockedReason: "one_touch_high_edge_shadow",
        thesis: "resolved normally",
        hypotheticalResult: { pnl: 1, pnlPct: 10, outcome: "win", closeReason: "target", closeTrigger: "legacy_gate_force_close" },
      }),
      shadow({
        id: "s2",
        signalType: "ONE_TOUCH_HIGH_EDGE_NO",
        blockedReason: "one_touch_high_edge_shadow",
        thesis: "resolved normally",
        hypotheticalResult: { pnl: 1, pnlPct: 10, outcome: "win", closeReason: "target", closeTrigger: "observed_gap_closed" },
      }),
    ];
    const artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: [], shadows });
    const lesson = artifact.lessons.find((item) => item.signalType === "ONE_TOUCH_HIGH_EDGE_NO");
    expect(lesson?.n).toBe(1);
  });

  it("sorts lessons by scope then signalType then asset for stable diffs", () => {
    const trades = [
      trade({ id: "a", signalType: "SIG_B", asset: "BTC", pnl: 1 }),
      trade({ id: "b", signalType: "SIG_A", asset: "ETH", pnl: 1 }),
    ];
    const shadows = [
      shadow({ id: "s1", signalType: "SIG_C", hypotheticalResult: { pnl: 1, pnlPct: 10, outcome: "win", closeReason: "x" } }),
    ];
    const artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: trades, shadows });
    expect(artifact.lessons.map((lesson) => `${lesson.scope}/${lesson.signalType}`)).toEqual([
      "live/SIG_A",
      "live/SIG_B",
      "shadow/SIG_C",
    ]);
  });

  it("returns an empty lessons array for no input data", () => {
    const artifact = buildLessonsArtifact({ generatedAt: "2026-07-14T00:00:00.000Z", liveTrades: [], shadows: [] });
    expect(artifact).toEqual({ generatedAt: "2026-07-14T00:00:00.000Z", lessons: [] });
  });
});
