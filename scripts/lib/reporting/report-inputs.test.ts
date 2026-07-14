import { describe, expect, it } from "vitest";
import { isForceClosedOneTouchShadow } from "./report-inputs.js";
import type { ReportShadowWithCloseTrigger } from "./report-inputs.js";

const baseOneTouchShadow: ReportShadowWithCloseTrigger = {
  id: "shadow-1",
  status: "resolved",
  blockedAt: "2026-06-01T00:00:00.000Z",
  blockedReason: "one_touch_high_edge_shadow",
  signalType: "ONE_TOUCH_HIGH_EDGE_NO",
  asset: "BTC",
  venue: "polymarket",
  direction: "short",
  thesis: "fixture thesis",
};

describe("isForceClosedOneTouchShadow", () => {
  it("classifies legacy_gate_force_close even when thesis lacks edge_disappeared", () => {
    expect(isForceClosedOneTouchShadow({
      ...baseOneTouchShadow,
      thesis: "resolved normally",
      hypotheticalResult: {
        pnl: 1,
        pnlPct: 10,
        outcome: "win",
        closeReason: "target",
        closeTrigger: "legacy_gate_force_close",
      },
    })).toBe(true);
  });

  it("does not classify observed_gap_closed even when thesis contains edge_disappeared", () => {
    expect(isForceClosedOneTouchShadow({
      ...baseOneTouchShadow,
      thesis: "closed on edge_disappeared",
      hypotheticalResult: {
        pnl: 1,
        pnlPct: 10,
        outcome: "win",
        closeReason: "target",
        closeTrigger: "observed_gap_closed",
      },
    })).toBe(false);
  });

  it("falls back to thesis edge_disappeared when closeTrigger is absent", () => {
    expect(isForceClosedOneTouchShadow({
      ...baseOneTouchShadow,
      thesis: "closed on edge_disappeared",
      hypotheticalResult: {
        pnl: -1,
        pnlPct: -10,
        outcome: "loss",
        closeReason: "target",
      },
    })).toBe(true);
  });

  it("returns false for unrelated signal types", () => {
    expect(isForceClosedOneTouchShadow({
      ...baseOneTouchShadow,
      signalType: "OTHER_SIGNAL",
      thesis: "edge_disappeared",
    })).toBe(false);
  });
});
