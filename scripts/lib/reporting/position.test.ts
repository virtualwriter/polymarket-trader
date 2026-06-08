import { describe, expect, it } from "vitest";
import {
  extractExpiryMonth,
  extractStrikePrice,
  formatStrike,
  marketDetail,
  positionUnrealizedPnl,
  positionUnrealizedPnlPct,
} from "./position.js";

describe("reporting position helpers", () => {
  it("calculates long and short perp unrealized pnl", () => {
    expect(positionUnrealizedPnl({
      entryPrice: 100,
      currentPrice: 110,
      direction: "long",
      size: 10,
      instrumentType: "hl_perp",
      leverage: 2,
    })).toBeCloseTo(2);

    expect(positionUnrealizedPnl({
      entryPrice: 100,
      currentPrice: 90,
      direction: "short",
      size: 10,
      instrumentType: "hl_perp",
      leverage: 2,
    })).toBeCloseTo(2);
  });

  it("treats Polymarket NO shorts as owned token positions", () => {
    expect(positionUnrealizedPnl({
      entryPrice: 0.4,
      currentPrice: 0.5,
      direction: "short",
      size: 10,
      instrumentType: "pm_no",
    })).toBeCloseTo(2.5);
    expect(positionUnrealizedPnlPct({
      entryPrice: 0.4,
      currentPrice: 0.5,
      direction: "short",
      size: 10,
      instrumentType: "pm_no",
    })).toBeCloseTo(25);
  });

  it("formats market detail from available fields", () => {
    expect(marketDetail({
      entryPrice: 0.4,
      currentPrice: 0.5,
      entryUnderlyingPrice: 100,
      currentUnderlyingPrice: 105,
      size: 10,
      instrumentType: "pm_yes",
      instrumentId: "event::market",
      instrumentLabel: "BTC above $100,000",
    })).toBe("market=BTC above $100,000; instrument_type=pm_yes; instrument_id=event::market; entry=0.4; current=0.5; entry_underlying=100; current_underlying=105");
  });

  it("extracts and formats strikes", () => {
    expect(formatStrike("100000.5")).toBe("$100,000.5");
    expect(extractStrikePrice({
      entryPrice: 0.1,
      size: 1,
      instrumentType: "pm_package",
      packageLegs: [
        { role: "broad_yes", strike: 100000 },
        { role: "narrow_no", strike: 120000 },
      ],
    })).toBe("$100,000 / $120,000");
    expect(extractStrikePrice({
      entryPrice: 0.1,
      size: 1,
      instrumentLabel: "BTC will hit $100,000 then $120,000",
    })).toBe("$120,000");
  });

  it("extracts expiry months from labels and ids", () => {
    expect(extractExpiryMonth({
      entryPrice: 0.1,
      size: 1,
      instrumentLabel: "BTC by end of September",
    })).toBe("September");
    expect(extractExpiryMonth({
      entryPrice: 0.1,
      size: 1,
      instrumentId: "btc-above-100k-oct",
    })).toBe("October");
  });
});
