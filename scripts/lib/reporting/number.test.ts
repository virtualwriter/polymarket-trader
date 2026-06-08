import { describe, expect, it } from "vitest";
import { safeNumber } from "./number.js";

describe("reporting number helpers", () => {
  it("returns finite numeric values", () => {
    expect(safeNumber(12.5)).toBe(12.5);
    expect(safeNumber("12.5")).toBe(12.5);
    expect(safeNumber("0")).toBe(0);
  });

  it("returns null for non-finite values", () => {
    expect(safeNumber(Number.NaN)).toBeNull();
    expect(safeNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(safeNumber("not-a-number")).toBeNull();
    expect(safeNumber(undefined)).toBeNull();
  });
});
