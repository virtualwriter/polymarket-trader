import { describe, expect, it } from "vitest";
import { buildScannerHyperliquidSnapshot, buildScannerMacroCsvRow, buildScannerValuationCsvRow, scannerCsvValue } from "./output.js";

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

  it("builds valuation CSV rows with existing rounding and percent conversions", () => {
    const row = buildScannerValuationCsvRow({
      date: "2026-06-12T17",
      btcSpot: 105432.1,
      btcFwd: 110987.6,
      btcPm: { ev: 108765.4, impliedVol: 0.456, medianMax: 120123, medianMin: 90123 },
      btcIv30: { iv: 0.333 },
      btcIv90: { iv: 0.444 },
      btcFundingAnnualized: -0.01234,
      btcOpenInterestUsd: 1234567.89,
      btcPcRatio: 0.98765,
      hypeSpot: 38.123456,
      hypePm: { ev: 40.123, impliedVol: 1.234, medianMax: 55.55, medianMin: 21.11 },
      hypeFundingAnnualized: 0,
      hypeOpenInterestUsd: 111.4,
      goldGcSpot: 3333.3,
      goldFwd: 3400.4,
      goldSettleEV: 3350.8,
      goldPm: { impliedVol: 0.222, medianMax: 4600.4, medianMin: 2900.4 },
      goldIv30: { iv: 0.111 },
      goldIv90: { iv: 0.222 },
      goldFundingAnnualized: 0.015,
      goldPcRatio: null,
      amznStock: 180.126,
      amznHlPerp: 181.456,
      amznFwd: 184.789,
      amznIv30: { iv: 0.301 },
      amznIv90: { iv: 0.402 },
      amznFundingAnnualized: 0.025,
      amznBasis: 0.739,
      amznPcRatio: 1.2345,
      oilWti: 77.777,
      oilBrent: 81.111,
      oilSpread: 3.334,
      oilFwd: 80.04,
      oilSettleEV: 79.96,
      oilPm: { impliedVol: 0.654 },
      oilIv30: { iv: 0.5 },
      oilIv90: { iv: 0.6 },
      oilFundingAnnualized: -0.125,
      oilPcRatio: 0.4321,
      spySpot: 6123.456,
      silverSpot: 36.123456,
      ethSpot: 2500.456,
      solSpot: 145.6789,
    });

    expect(row).toMatchObject({
      btc_spot: 105432,
      btc_opt_fwd_90d: 110988,
      btc_pm_ev: 108765,
      btc_opt_iv_30d: 33.3,
      btc_opt_iv_90d: 44.4,
      btc_opt_iv_term_spread: -11.1,
      btc_pm_iv: 45.6,
      btc_hl_funding_ann: -1.23,
      btc_hl_oi: 1234568,
      btc_ibit_pc_ratio: 0.988,
      hype_spot: 38.1235,
      hype_hl_funding_ann: null,
      gold_gld_spot: null,
      gold_hl_funding_ann: 1.5,
      amzn_hl_basis_pct: 0.74,
      oil_brent_wti_spread: 3.3,
      oil_hl_funding_ann: -12.5,
      spy_spot: 6123.46,
      silver_spot: 36.1235,
      eth_spot: 2500.46,
      sol_spot: 145.6789,
    });
  });
});
