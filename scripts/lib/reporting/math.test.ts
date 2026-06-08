import { describe, expect, it } from "vitest";
import { normalCdf } from "./math.js";

describe("reporting math helpers", () => {
  it("returns expected central normal CDF values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.1586553, 5);
  });

  it("is symmetric around zero", () => {
    for (const x of [0.25, 0.75, 1.5, 2.25]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 6);
    }
  });

  it("approaches the tails without leaving probability bounds", () => {
    expect(normalCdf(-6)).toBeGreaterThanOrEqual(0);
    expect(normalCdf(-6)).toBeLessThan(0.001);
    expect(normalCdf(6)).toBeGreaterThan(0.999);
    expect(normalCdf(6)).toBeLessThanOrEqual(1);
  });
});
