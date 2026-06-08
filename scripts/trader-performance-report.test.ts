import { describe, expect, it } from "vitest";
import {
  currentBidAsk,
  relativeValueContextNote,
  relativeValueEntryMatch,
  type Position,
} from "./trader-performance-report.js";

const position: Position = {
  id: "test-position",
  openedAt: "2026-06-01T12:30:00.000Z",
  asset: "BTC",
  venue: "polymarket",
  direction: "long",
  entryPrice: 0.4,
  currentPrice: 0.5,
  size: 1,
  signalType: "TEST",
  hypothesisId: null,
  thesis: "test",
  instrumentType: "pm_yes",
  instrumentId: "btc-hit-jun-2026::123",
};

describe("trader report relative-value provenance", () => {
  it("marks heatmap snapshots as snapshot with distance from open time", () => {
    const match = relativeValueEntryMatch(
      new Map(),
      position,
      position.openedAt,
      { timestamp: "2026-06-01T12:00:00.000Z", options_touch_adjusted_prob: "0.42" },
    );

    expect(match.source).toBe("snapshot");
    expect(match.timestamp?.toISOString()).toBe("2026-06-01T12:00:00.000Z");
    expect(match.distanceHours).toBeCloseTo(0.5);
  });

  it("finds the nearest history row and reports distance from open time", () => {
    const match = relativeValueEntryMatch(
      new Map([
        ["btc-hit-jun-2026::123", [
          { timestamp: new Date("2026-06-01T10:00:00.000Z"), row: { timestamp: "2026-06-01 10:00" } },
          { timestamp: new Date("2026-06-01T13:00:00.000Z"), row: { timestamp: "2026-06-01 13:00" } },
        ]],
      ]),
      position,
      position.openedAt,
    );

    expect(match.source).toBe("history_nearest");
    expect(match.timestamp?.toISOString()).toBe("2026-06-01T13:00:00.000Z");
    expect(match.distanceHours).toBeCloseTo(0.5);
  });

  it("marks exact timestamp matches separately from nearest history matches", () => {
    const match = relativeValueEntryMatch(
      new Map([
        ["btc-hit-jun-2026::123", [
          { timestamp: new Date("2026-06-01T12:30:00.000Z"), row: { timestamp: "2026-06-01 12:30" } },
        ]],
      ]),
      position,
      position.openedAt,
    );

    expect(match.source).toBe("history_exact");
    expect(match.distanceHours).toBe(0);
  });

  it("marks missing rows when no match is available within the max distance", () => {
    const match = relativeValueEntryMatch(
      new Map([
        ["btc-hit-jun-2026::123", [
          { timestamp: new Date("2026-05-29T12:30:00.000Z"), row: { timestamp: "2026-05-29 12:30" } },
        ]],
      ]),
      position,
      position.openedAt,
    );

    expect(match.source).toBe("missing");
    expect(match.row).toBeUndefined();
    expect(match.distanceHours).toBeNull();
  });

  it("converts YES bid/ask into NO token bid/ask", () => {
    expect(currentBidAsk({ pm_best_bid: "0.25", pm_best_ask: "0.30" }, "pm_no")).toEqual({
      bid: 0.7,
      ask: 0.75,
    });
  });

  it("includes model, market, provenance, and current row age in context notes", () => {
    const note = relativeValueContextNote({
      entryMatch: {
        row: { timestamp: "2026-06-01T12:00:00.000Z" },
        source: "snapshot",
        timestamp: new Date("2026-06-01T12:00:00.000Z"),
        distanceHours: 0.5,
      },
      currentRow: {
        timestamp: "2026-06-08T17:00:00.000Z",
        options_touch_adjusted_prob: "0.55",
        pm_best_bid: "0.44",
        pm_best_ask: "0.46",
      },
      generatedAt: "2026-06-08T18:30:00.000Z",
      entryModel: 0.42,
      currentModel: 0.55,
      bidAsk: { bid: 0.44, ask: 0.46 },
      strike: "$100,000",
      expiry: "June",
    });

    expect(note).toContain("entry_model=0.420000");
    expect(note).toContain("current_model=0.550000");
    expect(note).toContain("current_bid=0.4400");
    expect(note).toContain("current_ask=0.4600");
    expect(note).toContain("strike=$100,000");
    expect(note).toContain("expiry=June");
    expect(note).toContain("entry_row_source=snapshot");
    expect(note).toContain("entry_row_distance_hours=0.50");
    expect(note).toContain("current_row_source=current");
    expect(note).toContain("current_row_age_hours=1.50");
  });
});
