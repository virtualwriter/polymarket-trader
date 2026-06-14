import { describe, expect, it } from "vitest";
import { isContaminatedTrade } from "./portfolio-ledger.js";

describe("portfolio ledger contamination", () => {
  it("classifies one-leg monotonic arb rows as contaminated artifacts", () => {
    expect(isContaminatedTrade({
      id: "MA-bad-single-leg",
      signalType: "MONOTONIC_ARB",
      instrumentType: "pm_yes",
      closeReason: "stop",
    })).toBe(true);
  });

  it("does not classify valid monotonic package rows as contaminated by shape", () => {
    expect(isContaminatedTrade({
      id: "MA-valid-package",
      signalType: "MONOTONIC_ARB",
      instrumentType: "pm_package",
      closeReason: "expiry",
    })).toBe(false);
  });
});
