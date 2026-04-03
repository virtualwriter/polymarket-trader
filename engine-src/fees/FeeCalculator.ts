/**
 * Dynamic probability-weighted taker fee calculator.
 *
 * Formula (Polymarket sports-style):
 *   fee = C * p * feeRate * (p * (1 - p))^exponent
 *
 * Where:
 *   C = number of shares (trade size in USDC units)
 *   p = share price (0.01 – 0.99)
 *   feeRate = 0.0175 (tunable)
 *   exponent = 1
 *
 * This produces a bell curve where:
 *   - Max effective rate ~1.56% at p = 0.50
 *   - Near-zero fee at p < 0.05 or p > 0.95
 *   - Makers always pay 0%
 */

export interface FeeConfig {
  feeRate: number;
  exponent: number;
}

const DEFAULT_CONFIG: FeeConfig = {
  feeRate: 0.0175,
  exponent: 1,
};

export enum VipTier {
  STANDARD = "standard",
  DEALER = "dealer",
}

const VIP_TAKER_DISCOUNT: Record<VipTier, number> = {
  [VipTier.STANDARD]: 1.0,
  [VipTier.DEALER]: 0.0, // 0% taker fee for verified dealers
};

const VIP_REBATE_MULTIPLIER: Record<VipTier, number> = {
  [VipTier.STANDARD]: 1.0,
  [VipTier.DEALER]: 1.25, // 25% boosted rebates
};

export class FeeCalculator {
  private config: FeeConfig;
  private vipRegistry: Map<string, VipTier> = new Map();

  constructor(config: Partial<FeeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate the taker fee for a trade.
   * Returns fee in the same units as tradeSize (USDC 6-decimal bigint).
   */
  calculateTakerFee(tradeSize: bigint, price: number, takerAddress: string): bigint {
    const tier = this.getTier(takerAddress);
    const discount = VIP_TAKER_DISCOUNT[tier];
    if (discount === 0) return 0n;

    const p = Math.max(0.01, Math.min(0.99, price));
    const { feeRate, exponent } = this.config;

    const feePerShare = p * feeRate * Math.pow(p * (1 - p), exponent);
    const feeFloat = Number(tradeSize) * feePerShare * discount;

    return BigInt(Math.floor(feeFloat));
  }

  /**
   * Get the effective fee rate for display purposes.
   */
  getEffectiveRate(price: number): number {
    const p = Math.max(0.01, Math.min(0.99, price));
    const { feeRate, exponent } = this.config;
    return p * feeRate * Math.pow(p * (1 - p), exponent);
  }

  /**
   * Get fee schedule table for a given trade size (for UI display).
   */
  getFeeSchedule(tradeSize: number = 100): Array<{ price: number; fee: number; effectiveRate: number }> {
    const prices = [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99];
    return prices.map((price) => {
      const rate = this.getEffectiveRate(price);
      return {
        price,
        fee: tradeSize * rate,
        effectiveRate: rate,
      };
    });
  }

  // --- VIP tier management ---

  registerVip(address: string, tier: VipTier): void {
    this.vipRegistry.set(address.toLowerCase(), tier);
  }

  removeVip(address: string): void {
    this.vipRegistry.delete(address.toLowerCase());
  }

  getTier(address: string): VipTier {
    return this.vipRegistry.get(address.toLowerCase()) ?? VipTier.STANDARD;
  }

  getRebateMultiplier(address: string): number {
    const tier = this.getTier(address);
    return VIP_REBATE_MULTIPLIER[tier];
  }
}
