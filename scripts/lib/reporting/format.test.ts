import { describe, expect, it } from "vitest";
import { escapeMd, fmtModelValue, fmtPct, fmtPriceValue, fmtUsd, winRate } from "./format.js";

describe("reporting format helpers", () => {
  it("formats signed USD and percent values", () => {
    expect(fmtUsd(1.23456)).toBe("+$1.2346");
    expect(fmtUsd(-1.23456)).toBe("-$1.2346");
    expect(fmtPct(12.345)).toBe("+12.35%");
    expect(fmtPct(-12.345)).toBe("-12.35%");
  });

  it("formats win rates", () => {
    expect(winRate({ trades: 4, wins: 3 })).toBe("75.0%");
    expect(winRate({ trades: 0, wins: 0 })).toBe("n/a");
  });

  it("formats nullable model and price values", () => {
    expect(fmtModelValue(0.1234567)).toBe("0.123457");
    expect(fmtModelValue(null)).toBe("");
    expect(fmtPriceValue(0.1234567)).toBe("0.1235");
    expect(fmtPriceValue(null)).toBe("");
  });

  it("escapes markdown table content", () => {
    expect(escapeMd("a|b\nc")).toBe("a\\|b c");
  });
});
