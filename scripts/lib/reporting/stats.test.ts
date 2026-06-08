import { describe, expect, it } from "vitest";
import { addStats, emptyStats, grouped, sortStatsRows, winRateValue } from "./stats.js";
import type { Stats } from "./stats.js";

describe("reporting stats helpers", () => {
  it("creates and updates stats", () => {
    const stats = emptyStats();
    addStats(stats, 1.25, 12.5);
    addStats(stats, -0.5, Number.NaN);
    addStats(stats, Number.NaN, 3, "win");

    expect(stats).toEqual({
      trades: 3,
      wins: 2,
      losses: 1,
      pnl: 0.75,
      pnlPctSum: 15.5,
    });
  });

  it("computes win-rate sort value", () => {
    expect(winRateValue({ trades: 4, wins: 3, losses: 1, pnl: 0, pnlPctSum: 0 })).toBe(0.75);
    expect(winRateValue(emptyStats())).toBe(-1);
  });

  it("sorts stats rows by win rate, trade count, pnl, then label", () => {
    const row = (trades: number, wins: number, pnl: number): Stats => ({
      trades,
      wins,
      losses: trades - wins,
      pnl,
      pnlPctSum: 0,
    });

    expect(sortStatsRows([
      ["b", row(2, 1, 5)],
      ["a", row(4, 2, 3)],
      ["c", row(4, 3, 1)],
      ["d", row(4, 2, 9)],
    ]).map(([label]) => label)).toEqual(["c", "d", "a", "b"]);
  });

  it("groups items into sorted stats rows", () => {
    const rows = grouped(
      [
        { group: "x", pnl: 1 },
        { group: "y", pnl: -1 },
        { group: "x", pnl: 2 },
        { group: "", pnl: 3 },
      ],
      (item) => item.group,
      (stats, item) => addStats(stats, item.pnl, item.pnl * 10),
    );

    expect(rows.map(([label, stats]) => [label, stats.trades, stats.pnl])).toEqual([
      ["x", 2, 3],
      ["unknown", 1, 3],
      ["y", 1, -1],
    ]);
  });
});
