import { describe, expect, it } from "vitest";
import { parseHeatmapTimestamp, parseTimestamp } from "./time.js";

describe("reporting time helpers", () => {
  it("normalizes hourly heatmap timestamps to UTC", () => {
    expect(parseHeatmapTimestamp("2026-06-08T13")?.toISOString()).toBe("2026-06-08T13:00:00.000Z");
  });

  it("parses full ISO timestamps", () => {
    expect(parseHeatmapTimestamp("2026-06-08T13:14:15Z")?.toISOString()).toBe("2026-06-08T13:14:15.000Z");
    expect(parseTimestamp("2026-06-08T13:14:15Z")?.toISOString()).toBe("2026-06-08T13:14:15.000Z");
  });

  it("returns null for empty or invalid values", () => {
    expect(parseHeatmapTimestamp(undefined)).toBeNull();
    expect(parseHeatmapTimestamp("not-a-date")).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp("not-a-date")).toBeNull();
  });
});
