/**
 * Rebate Pool — accumulates taker fees + deposit conversion fees,
 * then distributes them daily to makers based on performance.
 *
 * Distribution formula:
 *   maker_rebate = pool * (maker_score / total_score)
 *
 * Where maker_score = filled_volume * time_weight * thin_side_multiplier * vip_multiplier
 *
 * Thin-side multiplier: 1.5–2.0x when maker fills on the side where probability < 35% or > 65%
 */

import { FeeCalculator } from "./FeeCalculator.js";

export interface MakerActivity {
  address: string;
  filledVolume: bigint;      // total USDC volume of orders filled as maker
  timeWeightedScore: number; // sum of (fillSize * secondsOrderWasLive)
  thinSideFills: bigint;     // volume filled on the underdog/lopsided side
  totalFills: bigint;        // total volume including non-thin side
}

export interface RebateRecord {
  address: string;
  amount: bigint;
  period: string;             // e.g. "2026-03-01"
  filledVolume: string;
  shareOfPool: number;
  thinSideBonus: boolean;
  timestamp: number;
}

export interface PoolStats {
  currentPoolBalance: bigint;
  takerFeesAccumulated: bigint;
  depositFeesAccumulated: bigint;
  totalDistributed: bigint;
  currentPeriod: string;
  makerCount: number;
  nextDistribution: number;   // unix ms
}

const THIN_SIDE_THRESHOLD = 0.35;
const THIN_SIDE_MULTIPLIER = 1.75;
const REBATE_SHARE = 1.0;  // 100% of fees to pool during bootstrap phase
const DISTRIBUTION_HOUR_UTC = 0;

export class RebatePool {
  private takerFeesThisPeriod = 0n;
  private depositFeesThisPeriod = 0n;
  private totalDistributed = 0n;
  private makerActivity: Map<string, MakerActivity> = new Map();
  private rebateHistory: RebateRecord[] = [];
  private feeCalculator: FeeCalculator;
  private distributionTimer?: ReturnType<typeof setInterval>;

  constructor(feeCalculator: FeeCalculator) {
    this.feeCalculator = feeCalculator;
  }

  /**
   * Record a taker fee collected from a trade.
   */
  addTakerFee(fee: bigint): void {
    this.takerFeesThisPeriod += fee;
  }

  /**
   * Record deposit conversion fees forwarded to the pool.
   * Called by the deposit integration when LI.FI integrator fees are received.
   */
  addDepositFee(amount: bigint): void {
    this.depositFeesThisPeriod += amount;
  }

  /**
   * Record a maker fill for rebate tracking.
   * @param makerAddress - the maker's address
   * @param fillSize - USDC value of the fill
   * @param orderAgeSeconds - how long the order sat on the book before being filled
   * @param isThinSide - whether the maker was providing liquidity on the underdog side
   */
  recordMakerFill(
    makerAddress: string,
    fillSize: bigint,
    orderAgeSeconds: number,
    isThinSide: boolean,
  ): void {
    const addr = makerAddress.toLowerCase();
    let activity = this.makerActivity.get(addr);
    if (!activity) {
      activity = {
        address: addr,
        filledVolume: 0n,
        timeWeightedScore: 0,
        thinSideFills: 0n,
        totalFills: 0n,
      };
      this.makerActivity.set(addr, activity);
    }

    activity.filledVolume += fillSize;
    activity.totalFills += fillSize;
    activity.timeWeightedScore += Number(fillSize) * Math.max(1, orderAgeSeconds);

    if (isThinSide) {
      activity.thinSideFills += fillSize;
    }
  }

  /**
   * Determine if a price represents the "thin side" of the market.
   * Thin side = providing liquidity where probability < 35% or > 65%.
   */
  isThinSide(marketMidpoint: number | undefined, orderSide: "buy" | "sell"): boolean {
    if (marketMidpoint === undefined) return false;
    if (marketMidpoint < THIN_SIDE_THRESHOLD && orderSide === "buy") return true;
    if (marketMidpoint > (1 - THIN_SIDE_THRESHOLD) && orderSide === "sell") return true;
    return false;
  }

  /**
   * Distribute the pool to all active makers. Called daily at 00:00 UTC.
   */
  distribute(): RebateRecord[] {
    const pool = this.getPoolBalance();
    if (pool === 0n || this.makerActivity.size === 0) {
      this.resetPeriod();
      return [];
    }

    const distributable = BigInt(Math.floor(Number(pool) * REBATE_SHARE));
    const period = this.getCurrentPeriod();
    const records: RebateRecord[] = [];

    // Calculate scores
    let totalScore = 0;
    const scores: Array<{ address: string; score: number }> = [];

    for (const activity of this.makerActivity.values()) {
      const thinRatio = activity.totalFills > 0n
        ? Number(activity.thinSideFills) / Number(activity.totalFills)
        : 0;
      const thinMultiplier = thinRatio > 0.1 ? 1 + (THIN_SIDE_MULTIPLIER - 1) * thinRatio : 1;
      const vipMultiplier = this.feeCalculator.getRebateMultiplier(activity.address);
      const score = activity.timeWeightedScore * thinMultiplier * vipMultiplier;

      scores.push({ address: activity.address, score });
      totalScore += score;
    }

    if (totalScore === 0) {
      this.resetPeriod();
      return [];
    }

    for (const { address, score } of scores) {
      const share = score / totalScore;
      const amount = BigInt(Math.floor(Number(distributable) * share));
      if (amount === 0n) continue;

      const activity = this.makerActivity.get(address)!;
      const record: RebateRecord = {
        address,
        amount,
        period,
        filledVolume: activity.filledVolume.toString(),
        shareOfPool: share,
        thinSideBonus: activity.thinSideFills > 0n,
        timestamp: Date.now(),
      };

      records.push(record);
      this.rebateHistory.push(record);
      this.totalDistributed += amount;
    }

    this.resetPeriod();
    return records;
  }

  /**
   * Get an estimate of what a maker would earn from the current pool.
   */
  estimateRebate(address: string): { estimated: bigint; shareOfPool: number; rank: number } {
    const addr = address.toLowerCase();
    const pool = this.getPoolBalance();
    if (pool === 0n || this.makerActivity.size === 0) {
      return { estimated: 0n, shareOfPool: 0, rank: 0 };
    }

    let totalScore = 0;
    let myScore = 0;
    const allScores: number[] = [];

    for (const activity of this.makerActivity.values()) {
      const thinRatio = activity.totalFills > 0n
        ? Number(activity.thinSideFills) / Number(activity.totalFills)
        : 0;
      const thinMultiplier = thinRatio > 0.1 ? 1 + (THIN_SIDE_MULTIPLIER - 1) * thinRatio : 1;
      const vipMultiplier = this.feeCalculator.getRebateMultiplier(activity.address);
      const score = activity.timeWeightedScore * thinMultiplier * vipMultiplier;

      totalScore += score;
      allScores.push(score);
      if (activity.address === addr) myScore = score;
    }

    if (totalScore === 0) return { estimated: 0n, shareOfPool: 0, rank: 0 };

    const share = myScore / totalScore;
    const estimated = BigInt(Math.floor(Number(pool) * share));
    allScores.sort((a, b) => b - a);
    const rank = allScores.indexOf(myScore) + 1;

    return { estimated, shareOfPool: share, rank };
  }

  getPoolBalance(): bigint {
    return this.takerFeesThisPeriod + this.depositFeesThisPeriod;
  }

  getStats(): PoolStats {
    const now = new Date();
    const nextDist = new Date(now);
    nextDist.setUTCHours(DISTRIBUTION_HOUR_UTC, 0, 0, 0);
    if (nextDist <= now) nextDist.setUTCDate(nextDist.getUTCDate() + 1);

    return {
      currentPoolBalance: this.getPoolBalance(),
      takerFeesAccumulated: this.takerFeesThisPeriod,
      depositFeesAccumulated: this.depositFeesThisPeriod,
      totalDistributed: this.totalDistributed,
      currentPeriod: this.getCurrentPeriod(),
      makerCount: this.makerActivity.size,
      nextDistribution: nextDist.getTime(),
    };
  }

  getRebateHistory(address?: string, limit = 30): RebateRecord[] {
    const records = address
      ? this.rebateHistory.filter((r) => r.address === address.toLowerCase())
      : this.rebateHistory;
    return records.slice(-limit);
  }

  getMakerLeaderboard(limit = 20): Array<MakerActivity & { score: number; estimatedRebate: bigint }> {
    const entries: Array<MakerActivity & { score: number; estimatedRebate: bigint }> = [];
    const pool = this.getPoolBalance();
    let totalScore = 0;

    const scored: Array<{ activity: MakerActivity; score: number }> = [];
    for (const activity of this.makerActivity.values()) {
      const thinRatio = activity.totalFills > 0n
        ? Number(activity.thinSideFills) / Number(activity.totalFills)
        : 0;
      const thinMultiplier = thinRatio > 0.1 ? 1 + (THIN_SIDE_MULTIPLIER - 1) * thinRatio : 1;
      const vipMultiplier = this.feeCalculator.getRebateMultiplier(activity.address);
      const score = activity.timeWeightedScore * thinMultiplier * vipMultiplier;
      totalScore += score;
      scored.push({ activity, score });
    }

    scored.sort((a, b) => b.score - a.score);

    for (const { activity, score } of scored.slice(0, limit)) {
      const share = totalScore > 0 ? score / totalScore : 0;
      entries.push({
        ...activity,
        score,
        estimatedRebate: BigInt(Math.floor(Number(pool) * share)),
      });
    }

    return entries;
  }

  /**
   * Start the automatic daily distribution timer.
   */
  startAutoDistribution(): void {
    this.distributionTimer = setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === DISTRIBUTION_HOUR_UTC && now.getUTCMinutes() === 0) {
        const records = this.distribute();
        if (records.length > 0) {
          console.log(`[RebatePool] Distributed to ${records.length} makers. Pool: ${this.totalDistributed}`);
        }
      }
    }, 60_000);
  }

  stop(): void {
    if (this.distributionTimer) {
      clearInterval(this.distributionTimer);
      this.distributionTimer = undefined;
    }
  }

  private getCurrentPeriod(): string {
    return new Date().toISOString().split("T")[0];
  }

  private resetPeriod(): void {
    this.takerFeesThisPeriod = 0n;
    this.depositFeesThisPeriod = 0n;
    this.makerActivity.clear();
  }
}
