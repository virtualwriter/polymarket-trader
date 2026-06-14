import { describe, expect, it } from "vitest";
import {
  buildMonotonicPreflightReport,
  isValidMonotonicArbPackage,
  monotonicPackageInvariantReasons,
} from "./monotonic-invariants.js";

describe("monotonic arb invariants", () => {
  it("accepts broad YES plus narrow NO packages", () => {
    expect(isValidMonotonicArbPackage({
      id: "MA-valid",
      asset: "BTC",
      venue: "polymarket",
      direction: "long",
      signalType: "MONOTONIC_ARB",
      instrumentType: "pm_package",
      packageLegs: [
        { role: "broad_yes", instrumentType: "pm_yes", instrumentId: "event::broad" },
        { role: "narrow_no", instrumentType: "pm_no", instrumentId: "event::narrow" },
      ],
    })).toBe(true);
  });

  it("rejects legacy single-leg monotonic rows", () => {
    expect(monotonicPackageInvariantReasons({
      id: "MA-single-leg",
      asset: "SOL",
      venue: "polymarket",
      direction: "long",
      signalType: "MONOTONIC_ARB",
      instrumentType: "pm_yes",
      packageLegs: [{ role: "broad_yes", instrumentType: "pm_yes" }],
    })).toEqual([
      "instrumentType=pm_yes is not pm_package",
      "packageLegs has 1 leg(s); expected >=2",
    ]);
  });

  it("builds an operator-review report without mutating positions", () => {
    const report = buildMonotonicPreflightReport([
      {
        id: "regular",
        asset: "ETH",
        venue: "hyperliquid",
        direction: "short",
        signalType: "FUNDING_EXTREME_SHORT",
      },
      {
        id: "MA-malformed",
        openedAt: "2026-06-01T00:00:00.000Z",
        asset: "GOLD",
        venue: "polymarket",
        direction: "long",
        signalType: "MONOTONIC_ARB",
        instrumentType: "pm_package",
        instrumentId: "pkg",
        instrumentLabel: "bad package",
        packageLegs: [{ role: "broad_yes", instrumentType: "pm_yes" }],
      },
    ], "2026-06-14T00:00:00.000Z");

    expect(report).toMatchObject({
      checkedPositions: 2,
      monotonicOpenPositions: 1,
      validPackages: 0,
      malformedPositions: [{
        id: "MA-malformed",
        recommendedAction: "operator_review_quarantine",
        reasons: ["packageLegs has 1 leg(s); expected >=2"],
      }],
    });
  });
});
