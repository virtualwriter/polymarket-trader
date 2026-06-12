import { describe, expect, it } from "vitest";
import { buildScannerHyperliquidSnapshot, buildScannerMacroCsvRow, scannerCsvValue } from "./output.js";

describe("scanner output helpers", () => {
  it("builds macro CSV rows with rounded probability fields and event lookups", () => {
    const row = buildScannerMacroCsvRow({
      date: "2026-06-12T17",
      macroScore: {
        composite: 1.2,
        label: "risk_on",
        fed: {
          score: 2,
          signal: "dovish",
          pAtLeastOneCut: 0.567,
          expectedCuts: 1.23,
          medianFirstCut: "Sep",
        },
        iran: {
          score: -1,
          signal: "risk",
          pDealByYE: 0.123,
          pCeasefire: null,
          pNuclearTest: 0.045,
        },
        oil: {
          score: 0.5,
          signal: "tight",
          pSettleAboveCurrent: 0.678,
          pSpike120: 0.011,
          brentWtiSpread: 4.44,
        },
      },
      btcOutperform: [{
        markets: [
          { question: "Will Bitcoin outperform the S&P 500?", yesPrice: 0.61 },
          { question: "Will Bitcoin outperform gold?", yesPrice: 0.42, closed: true },
          { question: "Will Bitcoin outperform Nvidia?", yesPrice: 0.33 },
        ],
      }],
      gpu: [{
        markets: [
          { question: "Will H100 hit $2.75?", yesPrice: 0.21 },
          { question: "Will H100 hit $3.00?", yesPrice: 0.09 },
        ],
      }],
    });

    expect(row).toMatchObject({
      date: "2026-06-12T17",
      macro_composite: 1.2,
      macro_label: "risk_on",
      fed_p_at_least_one_cut: 56.7,
      fed_expected_cuts: 1.2,
      iran_p_deal_ye: 12.3,
      iran_p_ceasefire: null,
      iran_p_nuke_test: 4.5,
      oil_p_settle_above_current: 67.8,
      oil_p_spike_120: 1.1,
      oil_brent_wti_spread: 4.4,
      btc_outperform_sp500: 61,
      btc_outperform_gold: null,
      btc_outperform_nvda: 33,
      btc_outperform_silver: null,
      gpu_h100_hit_275: 21,
      gpu_h100_hit_300: 9,
    });
  });

  it("keeps existing CSV and Hyperliquid snapshot helper behavior stable", () => {
    expect(scannerCsvValue('a "quoted" value')).toBe('"a ""quoted"" value"');
    expect(buildScannerHyperliquidSnapshot({
      BTC: { markPx: 100.1234567, fundingAnnualized: 0.1234567 },
      "GOLD (GC)": { markPx: 3333.3333333 },
      "OIL (CL)": { markPx: 77.7777777 },
    })).toMatchObject({
      BTC: { markPx: 100.123457, fundingAnnualized: 0.123457 },
      GOLD: { markPx: 3333.333333 },
      OIL: { markPx: 77.777778 },
    });
  });
});
