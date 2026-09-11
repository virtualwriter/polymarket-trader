import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { binContains, loadSoftballRows, loadWeatherRows } from "./sports-datasets.js";

let tmp: string | null = null;
function makeDir(): string {
  tmp = mkdtempSync(join(tmpdir(), "sports-ds-"));
  return tmp;
}
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("binContains", () => {
  it("parses the predictor bin grammar", () => {
    expect(binContains("<=84", 79)).toBe(true);
    expect(binContains("<=84", 85)).toBe(false);
    expect(binContains("85-86", 86)).toBe(true);
    expect(binContains("85-86", 84)).toBe(false);
    expect(binContains(">=91", 95)).toBe(true);
    expect(binContains(">=91", 90)).toBe(false);
    expect(binContains("garbage", 80)).toBeNull();
  });
});

describe("loadWeatherRows", () => {
  it("flattens ledger days with settled outcomes and computes bin-buy pnl", () => {
    const dir = makeDir();
    const ledger = {
      version: 1,
      days: {
        "26SEP01": {
          day: "26SEP01",
          local_date: "2026-09-01",
          open: {
            predicted_high_f: 88,
            bin: "87-88",
            daily_implied: { "<=84": 0.1, "85-86": 0.4, "87-88": 0.4, "89-90": 0.1 },
            twc_high_f: 86,
          },
          final_pred: {
            predicted_high_f: 85,
            bin: "85-86",
            daily_implied: { "<=84": 0.2, "85-86": 0.75, "87-88": 0.05 },
            forecast_peak_hour: 16,
          },
          settlement: { high_f: 86 },
          scores: { final: { settle_f: 86 } },
        },
        "26SEP02": {
          day: "26SEP02",
          local_date: "2026-09-02",
          open: { predicted_high_f: 90, bin: "89-90", daily_implied: { "89-90": 0.5 } },
          final_pred: { predicted_high_f: 90, bin: "89-90", daily_implied: { "89-90": 0.9 } },
          settlement: null,
          scores: { final: { settle_f: null } },
        },
      },
    };
    writeFileSync(join(dir, "nyc-high-predictor-ledger.json"), JSON.stringify(ledger));
    const rows = loadWeatherRows(dir);
    expect(rows).toHaveLength(2);

    const settled = rows.find((r) => r.date === "2026-09-01")!;
    expect(settled.city).toBe("nyc");
    expect(settled.settled).toBe("1");
    expect(settled.settle_f).toBe("86");
    // Open predicted 87-88, settle 86: miss → -100.
    expect(settled.open_bin_hit).toBe("0");
    expect(settled.open_pnl_pct).toBe("-100.00");
    expect(settled.open_abs_err_f).toBe("2");
    // Final predicted 85-86 at implied 0.75, settle 86: hit → (0.25/0.75)*100.
    expect(settled.final_bin_hit).toBe("1");
    expect(Number(settled.final_pnl_pct)).toBeCloseTo(33.33, 1);
    expect(settled.pred_drift_f).toBe("-3");

    const unsettled = rows.find((r) => r.date === "2026-09-02")!;
    expect(unsettled.settled).toBe("0");
    expect(unsettled.final_pnl_pct).toBe("");
    expect(unsettled.final_bin_hit).toBe("");
  });

  it("returns empty when the exports dir has no ledgers", () => {
    const dir = makeDir();
    expect(loadWeatherRows(dir)).toEqual([]);
  });
});

describe("loadSoftballRows", () => {
  it("flattens settled backtest samples with per-dollar pnl scaled to pct", () => {
    const dir = makeDir();
    const sample = {
      day: "2026-07-20",
      slug: "mlb-min-cle-2026-07-20",
      kind: "over",
      inning: 2,
      half: null,
      runsDelta: 2,
      scoreAway: 2,
      scoreHome: 5,
      curTotal: 7,
      line: 7.5,
      ask: 0.91,
      cats: ["multi_run_early"],
      won: true,
      fee: 0.0057,
      pnl: 0.0843,
      finalAway: 4,
      finalHome: 13,
    };
    writeFileSync(join(dir, "mlb-softball-samples.jsonl"), JSON.stringify(sample) + "\n");
    const rows = loadSoftballRows(dir);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe("backtest_sample");
    expect(rows[0].date).toBe("2026-07-20");
    expect(rows[0].kind).toBe("over");
    expect(rows[0].settled).toBe("1");
    expect(rows[0].over_hit).toBe("1");
    expect(rows[0].pnl_pct).toBe("8.43");
    expect(rows[0].final_total).toBe("17");
  });

  it("flattens outcome rows and tolerates a missing file", () => {
    const dir = makeDir();
    expect(loadSoftballRows(dir)).toEqual([]);
    const rec = {
      kind: "mlb_over_softball_signal",
      observedAt: "2026-08-03T23:06:28.525Z",
      slug: "mlb-a-b-2026-08-03",
      inning: 3,
      line: 4.5,
      ask: 0.72,
      cats: ["multi_run_early", "cheap_over_early"],
      live: false,
      settled: true,
      finalTotal: 9,
      overHit: true,
      pnlPct: 38.9,
    };
    writeFileSync(join(dir, "mlb-over-softball-outcomes.jsonl"), JSON.stringify(rec) + "\n\nnot-json\n");
    const rows = loadSoftballRows(dir);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe("order_flow");
    expect(rows[0].date).toBe("2026-08-03");
    expect(rows[0].cats).toBe("multi_run_early|cheap_over_early");
    expect(rows[0].live).toBe("0");
    expect(rows[0].over_hit).toBe("1");
    expect(rows[0].pnl_pct).toBe("38.9");
  });
});
