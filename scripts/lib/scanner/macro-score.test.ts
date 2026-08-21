import { describe, expect, it } from "vitest";
import {
  blendMacroComponents,
  btcRiskOnScore,
  fedRiskOnScore,
  isSettledLadder,
  oilRiskOnScore,
  pTouchNearestUntouched,
  macroLabel,
  type LadderQuote,
} from "./macro-score.js";

const quote = (strike: number, direction: string, yesPrice: number): LadderQuote =>
  ({ strike, direction, yesPrice });

describe("isSettledLadder", () => {
  it("detects a ladder whose quotes have all collapsed to 0 or 1", () => {
    // Gold's June settlement, the ladder that was being read as oil.
    const settled = [
      quote(6200, "above", 0), quote(4400, "above", 0), quote(3800, "above", 1),
    ];
    expect(isSettledLadder(settled)).toBe(true);
  });

  it("treats a live ladder with interior prices as unsettled", () => {
    expect(isSettledLadder([quote(90, "above", 0.615), quote(75, "below", 0.08)])).toBe(false);
  });

  it("treats an empty ladder as settled so it cannot be scored", () => {
    expect(isSettledLadder([])).toBe(true);
  });

  it("does not mistake a partially pinned live ladder for a settled one", () => {
    // Barriers already crossed this month sit at 1 alongside live rungs.
    expect(isSettledLadder([quote(80, "above", 1), quote(90, "above", 0.615)])).toBe(false);
  });
});

describe("pTouchNearestUntouched", () => {
  const ladder = [
    quote(150, "above", 0.0035), quote(100, "above", 0.095), quote(95, "above", 0.26),
    quote(90, "above", 0.615), quote(85, "above", 1), quote(80, "above", 1),
    quote(75, "below", 1), quote(75, "below", 0.08), quote(70, "below", 0.024),
  ];

  it("skips barriers spot has already crossed", () => {
    // 85 and 80 are pinned at 1; the nearest live upside rung is 90.
    expect(pTouchNearestUntouched(ladder, 83, "above")).toEqual({ probability: 0.615, strike: 90 });
  });

  it("picks the nearest untouched barrier below spot", () => {
    expect(pTouchNearestUntouched(ladder, 83, "below")).toEqual({ probability: 0.08, strike: 75 });
  });

  it("returns null when one side has no untouched barrier", () => {
    expect(pTouchNearestUntouched([quote(90, "above", 1)], 83, "above")).toBeNull();
  });

  it("rejects a nonsensical spot", () => {
    expect(pTouchNearestUntouched(ladder, 0, "above")).toBeNull();
  });
});

describe("oilRiskOnScore", () => {
  it("refuses to score a resolved ladder", () => {
    // The regression: gold's settled June ladder previously yielded 1.0 here,
    // which zeroed the oil score and pinned the composite for 18 days.
    const goldSettled = [quote(6200, "above", 0), quote(4400, "above", 0), quote(3800, "above", 1)];
    expect(oilRiskOnScore(goldSettled, 83)).toBeNull();
  });

  it("scores oil as risk-off when upside touch risk dominates", () => {
    const ladder = [quote(90, "above", 0.615), quote(75, "below", 0.08)];
    const score = oilRiskOnScore(ladder, 83);
    // 0.08 / (0.615 + 0.08) = 11.5 — oil biased sharply higher.
    expect(score).toBeCloseTo(11.51, 1);
  });

  it("scores oil as risk-on when downside touch risk dominates", () => {
    const ladder = [quote(90, "above", 0.10), quote(75, "below", 0.50)];
    expect(oilRiskOnScore(ladder, 83)).toBeCloseTo(83.33, 1);
  });

  it("is balanced when both sides are equally likely", () => {
    expect(oilRiskOnScore([quote(90, "above", 0.3), quote(75, "below", 0.3)], 83)).toBeCloseTo(50, 6);
  });
});

describe("fedRiskOnScore", () => {
  it("stays sensitive at the low cut odds that used to clamp it to zero", () => {
    // The observed state: P(>=1 cut) 14.55%, no open September market,
    // expectedCuts 0.3. The old form produced 11.6 - 15 -> clamped 0.
    const score = fedRiskOnScore({ pAtLeastOneCut: 0.1455, pCutBySept: null, expectedCuts: 0.3 });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeCloseTo(13.1, 1);
  });

  it("moves when the live cut probability moves", () => {
    const low = fedRiskOnScore({ pAtLeastOneCut: 0.145, pCutBySept: null, expectedCuts: 0.3 });
    const high = fedRiskOnScore({ pAtLeastOneCut: 0.205, pCutBySept: null, expectedCuts: 0.3 });
    expect(high).toBeGreaterThan(low);
  });

  it("applies no timing tilt when no open contract prices it", () => {
    const absent = fedRiskOnScore({ pAtLeastOneCut: 0.4, pCutBySept: null, expectedCuts: 1.2 });
    const hawkish = fedRiskOnScore({ pAtLeastOneCut: 0.4, pCutBySept: 0.1, expectedCuts: 1.2 });
    expect(absent).toBeGreaterThan(hawkish);
    expect(absent).toBeCloseTo(40, 6);
  });

  it("rewards a dovish path without ever exceeding the scale", () => {
    const score = fedRiskOnScore({ pAtLeastOneCut: 0.98, pCutBySept: 0.8, expectedCuts: 3 });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(90);
  });

  it("cannot be driven to zero by tilts alone", () => {
    const score = fedRiskOnScore({ pAtLeastOneCut: 0.05, pCutBySept: 0.05, expectedCuts: 0 });
    expect(score).toBeGreaterThan(0);
  });
});

describe("btcRiskOnScore", () => {
  it("averages the live outperformance probabilities", () => {
    expect(btcRiskOnScore([59, 22.5])).toBeCloseTo(40.75, 6);
  });

  it("ignores markets with no open contract", () => {
    expect(btcRiskOnScore([59, null, null])).toBeCloseTo(59, 6);
  });

  it("returns null when nothing is live", () => {
    expect(btcRiskOnScore([null, null])).toBeNull();
  });
});

describe("blendMacroComponents", () => {
  it("renormalises over the components that are live", () => {
    const blend = blendMacroComponents([
      { name: "fed", score: 13.1, weight: 0.3 },
      { name: "oil", score: null, weight: 0.2 },
      { name: "iran", score: null, weight: 0.1 },
      { name: "btc", score: 40.75, weight: 0.4 },
    ]);
    // (13.1*0.3 + 40.75*0.4) / 0.7 = 28.9
    expect(blend?.composite).toBe(29);
    expect(blend?.used).toEqual(["fed", "btc"]);
    expect(blend?.dropped).toEqual(["oil", "iran"]);
    expect(blend?.coverage).toBeCloseTo(0.7, 6);
  });

  it("does not let a dropped component read as maximally bearish", () => {
    const withDrop = blendMacroComponents([
      { name: "fed", score: 60, weight: 0.5 },
      { name: "oil", score: null, weight: 0.5 },
    ]);
    expect(withDrop?.composite).toBe(60);
  });

  it("returns null rather than 0 when no component is live", () => {
    expect(blendMacroComponents([
      { name: "fed", score: null, weight: 0.5 },
      { name: "oil", score: null, weight: 0.5 },
    ])).toBeNull();
  });

  it("reports full coverage when everything is live", () => {
    const blend = blendMacroComponents([
      { name: "a", score: 50, weight: 0.5 },
      { name: "b", score: 70, weight: 0.5 },
    ]);
    expect(blend?.composite).toBe(60);
    expect(blend?.coverage).toBeCloseTo(1, 6);
  });
});

describe("macroLabel", () => {
  it("maps the composite onto the existing bands", () => {
    expect(macroLabel(19)).toBe("VERY BEARISH");
    expect(macroLabel(29)).toBe("VERY BEARISH");
    expect(macroLabel(30)).toBe("BEARISH");
    expect(macroLabel(35)).toBe("BEARISH");
    expect(macroLabel(50)).toBe("NEUTRAL");
    expect(macroLabel(65)).toBe("BULLISH");
    expect(macroLabel(85)).toBe("VERY BULLISH");
  });
});
