import { describe, expect, it } from "vitest";
import {
  buildRegimeSeries,
  formatRegimeEnvelope,
  formatRegimeLabels,
  fundingRegimeFromAnnPct,
  macroRegimeFromLabel,
  outOfEnvelopeDimensions,
  regimeEnvelopeForDates,
  regimeOn,
  REGIME_ENVELOPE_MIN_DATED_TESTS,
} from "./regime.js";

type Row = Record<string, string | number>;

function valRow(date: string, iv: number | "", funding: number | ""): Row {
  return { date, btc_opt_iv_30d: iv, btc_hl_funding_ann: funding };
}

// 9 days of IV spanning three clean terciles (30s, 50s, 70s).
const VAL_ROWS: Row[] = [
  valRow("2026-09-01", 30, 10.9),
  valRow("2026-09-02", 32, 10.9),
  valRow("2026-09-03", 34, -2),
  valRow("2026-09-04", 50, 5),
  valRow("2026-09-05", 52, 10.9),
  valRow("2026-09-06", 54, 25),
  valRow("2026-09-07", 70, 10.9),
  valRow("2026-09-08", 72, 10.9),
  valRow("2026-09-09", 74, 10.9),
];

const MACRO_ROWS: Row[] = [
  { date: "2026-09-01", macro_label: '"VERY BEARISH"' },
  { date: "2026-09-05", macro_label: "NEUTRAL" },
  { date: "2026-09-09", macro_label: "BULLISH" },
];

describe("regime label derivation", () => {
  it("maps macro labels onto risk regimes", () => {
    expect(macroRegimeFromLabel("VERY BEARISH")).toBe("risk_off");
    expect(macroRegimeFromLabel("BEARISH")).toBe("risk_off");
    expect(macroRegimeFromLabel("NEUTRAL")).toBe("neutral");
    expect(macroRegimeFromLabel("BULLISH")).toBe("risk_on");
    expect(macroRegimeFromLabel("")).toBeUndefined();
    expect(macroRegimeFromLabel("GARBAGE")).toBeUndefined();
  });

  it("buckets funding economically around the HL baseline", () => {
    expect(fundingRegimeFromAnnPct(-3)).toBe("negative");
    expect(fundingRegimeFromAnnPct(4)).toBe("low");
    expect(fundingRegimeFromAnnPct(10.95)).toBe("baseline");
    expect(fundingRegimeFromAnnPct(25)).toBe("elevated");
  });

  it("assigns vol terciles from the loaded IV history", () => {
    const series = buildRegimeSeries(VAL_ROWS, MACRO_ROWS);
    expect(regimeOn(series, "2026-09-01").vol).toBe("low");
    expect(regimeOn(series, "2026-09-05").vol).toBe("mid");
    expect(regimeOn(series, "2026-09-09").vol).toBe("high");
  });

  it("walks back up to a week to fill missing dimensions", () => {
    const series = buildRegimeSeries(VAL_ROWS, MACRO_ROWS);
    // 09-03 has no macro row; nearest prior macro is 09-01 (risk_off).
    expect(regimeOn(series, "2026-09-03").macro).toBe("risk_off");
    // 09-06 falls back to the 09-05 NEUTRAL macro row.
    expect(regimeOn(series, "2026-09-06").macro).toBe("neutral");
    // A date far past the series gets nothing.
    expect(regimeOn(series, "2027-01-01")).toEqual({});
  });

  it("last macro row per date wins and empty cells label nothing", () => {
    const series = buildRegimeSeries(
      [valRow("2026-09-01", "", "")],
      [
        { date: "2026-09-01", macro_label: "NEUTRAL" },
        { date: "2026-09-01", macro_label: "BEARISH" },
      ],
    );
    const labels = regimeOn(series, "2026-09-01");
    expect(labels.macro).toBe("risk_off");
    expect(labels.vol).toBeUndefined();
    expect(labels.funding).toBeUndefined();
  });
});

describe("regime envelope", () => {
  const series = buildRegimeSeries(VAL_ROWS, MACRO_ROWS);

  it("collects the regimes evidence was gathered under", () => {
    const envelope = regimeEnvelopeForDates(series, [
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
    expect(envelope.datedTests).toBe(5);
    expect([...envelope.vol].sort()).toEqual(["low", "mid"]);
    expect(envelope.funding.has("negative")).toBe(true);
    expect(envelope.macro.has("risk_off")).toBe(true);
    expect(envelope.macro.has("risk_on")).toBe(false);
  });

  it("flags per-dimension out-of-envelope conditions", () => {
    const envelope = regimeEnvelopeForDates(series, [
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
    // 09-09 is high vol + risk_on macro: both dimensions were never validated.
    const out = outOfEnvelopeDimensions(regimeOn(series, "2026-09-09"), envelope);
    expect(out.some((d) => d.startsWith("vol=high"))).toBe(true);
    expect(out.some((d) => d.startsWith("macro=risk_on"))).toBe(true);
    // In-envelope day flags nothing.
    expect(outOfEnvelopeDimensions(regimeOn(series, "2026-09-02"), envelope)).toEqual([]);
  });

  it("refuses to judge thin envelopes", () => {
    const thin = regimeEnvelopeForDates(series, ["2026-09-01"]);
    expect(thin.datedTests).toBeLessThan(REGIME_ENVELOPE_MIN_DATED_TESTS);
    expect(outOfEnvelopeDimensions(regimeOn(series, "2026-09-09"), thin)).toEqual([]);
  });

  it("cannot violate a dimension with no envelope history", () => {
    // Macro-free series: envelope has vol+funding only, current has macro.
    const noMacroSeries = buildRegimeSeries(VAL_ROWS, []);
    const envelope = regimeEnvelopeForDates(noMacroSeries, [
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
    expect(envelope.macro.size).toBe(0);
    const out = outOfEnvelopeDimensions({ vol: "low", macro: "risk_on" }, envelope);
    expect(out).toEqual([]);
  });

  it("formats envelopes and labels readably", () => {
    const envelope = regimeEnvelopeForDates(series, ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    const text = formatRegimeEnvelope(envelope);
    expect(text).toContain("vol={low,mid}");
    expect(text).toContain("over 5 dated tests");
    expect(formatRegimeLabels({ vol: "high", funding: "baseline" })).toBe("vol=high funding=baseline");
    expect(formatRegimeLabels({})).toBe("unknown");
  });
});
