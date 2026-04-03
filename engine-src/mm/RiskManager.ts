import { Trade, Side } from "../types.js";

export interface RiskConfig {
  positionCapUsdc: bigint;
  maxFillSizeUsdc: bigint;
  withdrawalWindowSeconds: number;
  baseHalfSpread: number;
  inventorySkewPerUnit: number;
  inventoryUnitUsdc: bigint;
  /** Gross cap multiplier — max(totalBuy, totalSell) cannot exceed positionCapUsdc * this. Default: 3 */
  grossCapMultiplier: number;
  /** Fair value staleness: seconds without update before widening. Default: 60 */
  staleFvWidenSeconds: number;
  /** Fair value staleness: seconds without update before full withdrawal. Default: 180 */
  staleFvWithdrawSeconds: number;
  /** Midpoint divergence: abs(mid - fairValue) threshold to widen. Default: 0.10 */
  divergenceWidenThreshold: number;
  /** Midpoint divergence: abs(mid - fairValue) threshold to withdraw. Default: 0.20 */
  divergenceWithdrawThreshold: number;
  /** Pre-game spread multiplier. Default: 5.0 */
  preGameSpreadMultiplier: number;
  /** VPIN: number of recent fills to track per market. Default: 20 */
  vpinWindowSize: number;
  /** VPIN: threshold for one-sided flow (>threshold or <1-threshold triggers). Default: 0.75 */
  vpinThreshold: number;
  /** VPIN: spread multiplier when triggered. Default: 2.5 */
  vpinSpreadMultiplier: number;
  /** Toxicity: min resolved markets before scoring a wallet. Default: 3 */
  toxicityMinMarkets: number;
  /** Toxicity: correct-side ratio to flag as toxic. Default: 0.65 */
  toxicityThreshold: number;
  /** Toxicity: correct-side ratio to flag as very toxic. Default: 0.75 */
  toxicityHighThreshold: number;
  /** Toxicity: min resolved markets for very-toxic. Default: 5 */
  toxicityHighMinMarkets: number;
}

const DEFAULT_CONFIG: RiskConfig = {
  positionCapUsdc: 5_000_000_000n,
  maxFillSizeUsdc: 500_000_000n,
  withdrawalWindowSeconds: 10,
  baseHalfSpread: 0.01,
  inventorySkewPerUnit: 0.005,
  inventoryUnitUsdc: 500_000_000n,
  grossCapMultiplier: 3,
  staleFvWidenSeconds: 60,
  staleFvWithdrawSeconds: 180,
  divergenceWidenThreshold: 0.10,
  divergenceWithdrawThreshold: 0.20,
  preGameSpreadMultiplier: 5.0,
  vpinWindowSize: 20,
  vpinThreshold: 0.75,
  vpinSpreadMultiplier: 2.5,
  toxicityMinMarkets: 3,
  toxicityThreshold: 0.65,
  toxicityHighThreshold: 0.75,
  toxicityHighMinMarkets: 5,
};

interface MarketInventory {
  netYesExposure: bigint;
  netNoExposure: bigint;
  totalBuyVolume: bigint;
  totalSellVolume: bigint;
  fillCount: number;
}

interface WalletToxicity {
  correctSideCount: number;
  totalResolvedLots: number;
}

export interface FillEvaluation {
  spreadMultiplier: number;
  refuse: boolean;
  reasons: string[];
}

export interface GameRiskSignal {
  shouldWiden: boolean;
  shouldWithdraw: boolean;
  spreadMultiplier: number;
  reason: string;
}

/**
 * Enhanced risk manager with Phase 1 mechanical defenses + Tier 1 flow-based defenses.
 *
 * Phase 1 (mechanical):
 *   - Hard position caps per market
 *   - Inventory-skewed spreads
 *   - Time-based quote withdrawal
 *   - Per-trade size limits
 *
 * Tier 1 (flow-based):
 *   - VPIN: detect one-sided order flow imbalance
 *   - Per-wallet toxicity: track wallets that are consistently correct
 *   - Bayesian prior shifting: adjust fair value estimate from flow signals
 *   - Sport-specific game state risk signals
 */
export class RiskManager {
  private config: RiskConfig;
  private inventory: Map<string, MarketInventory> = new Map();
  private auctionEndTimes: Map<string, number> = new Map();

  // Tier 1: VPIN — track recent fill sides per market (0 = YES buy, 1 = NO buy)
  private recentSides: Map<string, number[]> = new Map();

  // Tier 1: Per-wallet toxicity scoring across resolved markets
  private walletToxicity: Map<string, WalletToxicity> = new Map();

  // Tier 1: Bayesian prior shift per market — accumulated adjustment to fair value
  private biasShi: Map<string, number> = new Map();

  // Sport-specific risk signals injected by GameStateParsers
  private gameRiskSignals: Map<string, GameRiskSignal> = new Map();

  // Fair value + midpoint tracking for staleness & divergence
  private lastFairValueTs: Map<string, number> = new Map();
  private lastFairValue: Map<string, number> = new Map();
  private lastMidpoint: Map<string, number> = new Map();
  private gamePhases: Map<string, string> = new Map();

  // Defense activation counters for performance tracking
  private _vpinTriggerCount = 0;
  private _toxicityBlockCount = 0;
  private _toxicityWidenCount = 0;
  private _bayesianShiftCount = 0;
  private _gameSignalCount = 0;
  private _staleFvWithdrawals = 0;
  private _divergenceWithdrawals = 0;

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ───────── Fair Value / Midpoint / Phase Updates ─────────

  notifyFairValue(marketId: string, fairValue: number): void {
    this.lastFairValue.set(marketId, fairValue);
    this.lastFairValueTs.set(marketId, Date.now());
  }

  notifyMidpoint(marketId: string, midpoint: number): void {
    this.lastMidpoint.set(marketId, midpoint);
  }

  setGamePhase(marketId: string, phase: string): void {
    this.gamePhases.set(marketId, phase);
  }

  getFairValueStalenessMs(marketId: string): number {
    const ts = this.lastFairValueTs.get(marketId);
    if (!ts) return Infinity;
    return Date.now() - ts;
  }

  getMidpointDivergence(marketId: string): number {
    const fv = this.lastFairValue.get(marketId);
    const mid = this.lastMidpoint.get(marketId);
    if (fv === undefined || mid === undefined) return 0;
    return Math.abs(mid - fv);
  }

  // ───────── Phase 1: Mechanical Defenses ─────────

  setAuctionEndTime(marketId: string, endTimeMs: number): void {
    this.auctionEndTimes.set(marketId, endTimeMs);
  }

  private getInventory(marketId: string): MarketInventory {
    if (!this.inventory.has(marketId)) {
      this.inventory.set(marketId, {
        netYesExposure: 0n, netNoExposure: 0n,
        totalBuyVolume: 0n, totalSellVolume: 0n, fillCount: 0,
      });
    }
    return this.inventory.get(marketId)!;
  }

  recordFill(marketId: string, trade: Trade, ammIsMaker: boolean): void {
    const inv = this.getInventory(marketId);
    inv.fillCount++;

    const ammBoughtYes = (ammIsMaker && trade.side === Side.SELL) ||
                         (!ammIsMaker && trade.side === Side.BUY);

    if (ammBoughtYes) {
      inv.netYesExposure += trade.size;
      inv.netNoExposure -= trade.size;
      inv.totalBuyVolume += trade.size;
    } else {
      inv.netYesExposure -= trade.size;
      inv.netNoExposure += trade.size;
      inv.totalSellVolume += trade.size;
    }

    // Tier 1: record fill direction for VPIN
    const takerAddr = ammIsMaker ? trade.taker : trade.maker;
    const takerBoughtYes = !ammBoughtYes;
    this.recordVpinFill(marketId, takerBoughtYes ? 0 : 1);

    // Tier 1: Bayesian prior update
    this.updateBayesianShift(marketId);
  }

  getAllowedSize(marketId: string, requestedSize: bigint, isBuyingSideYes: boolean): bigint {
    const inv = this.getInventory(marketId);

    let allowed = requestedSize < this.config.maxFillSizeUsdc
      ? requestedSize
      : this.config.maxFillSizeUsdc;

    // Net exposure cap (original)
    const currentExposure = isBuyingSideYes
      ? (inv.netYesExposure > 0n ? inv.netYesExposure : -inv.netYesExposure)
      : (inv.netNoExposure > 0n ? inv.netNoExposure : -inv.netNoExposure);

    const absExposure = currentExposure < 0n ? -currentExposure : currentExposure;
    const netHeadroom = this.config.positionCapUsdc - absExposure;

    if (netHeadroom <= 0n) return 0n;
    if (allowed > netHeadroom) allowed = netHeadroom;

    // Gross exposure cap — prevents massive balanced-but-risky inventory
    const grossCap = this.config.positionCapUsdc * BigInt(this.config.grossCapMultiplier);
    const grossOnSide = isBuyingSideYes ? inv.totalBuyVolume : inv.totalSellVolume;
    const grossHeadroom = grossCap - grossOnSide;

    if (grossHeadroom <= 0n) return 0n;
    if (allowed > grossHeadroom) allowed = grossHeadroom;

    return allowed;
  }

  shouldWithdraw(marketId: string): boolean {
    // Check time-based withdrawal
    const endTime = this.auctionEndTimes.get(marketId);
    if (endTime) {
      const remaining = (endTime - Date.now()) / 1000;
      if (remaining <= this.config.withdrawalWindowSeconds && remaining > 0) return true;
    }

    // Check sport-specific withdrawal signal
    const signal = this.gameRiskSignals.get(marketId);
    if (signal?.shouldWithdraw) return true;

    // Stale fair value — pull quotes entirely if no update for too long
    const stalenessMs = this.getFairValueStalenessMs(marketId);
    if (stalenessMs > this.config.staleFvWithdrawSeconds * 1000) {
      this._staleFvWithdrawals++;
      return true;
    }

    // Midpoint-vs-FairValue divergence — pull quotes if too far apart
    const divergence = this.getMidpointDivergence(marketId);
    if (divergence > this.config.divergenceWithdrawThreshold) {
      this._divergenceWithdrawals++;
      return true;
    }

    return false;
  }

  getAdjustedSpread(marketId: string): {
    bidHalfSpread: number;
    askHalfSpread: number;
    inventorySkew: number;
    atCapBid: boolean;
    atCapAsk: boolean;
  } {
    const inv = this.getInventory(marketId);
    let base = this.config.baseHalfSpread;

    // Pre-game spread multiplier — much wider when no live game action
    const phase = this.gamePhases.get(marketId);
    if (phase === "pre_game") {
      base *= this.config.preGameSpreadMultiplier;
    }

    // Stale fair value — widen before full withdrawal kicks in
    const stalenessMs = this.getFairValueStalenessMs(marketId);
    if (stalenessMs > this.config.staleFvWidenSeconds * 1000) {
      const staleRatio = Math.min(5, stalenessMs / (this.config.staleFvWidenSeconds * 1000));
      base *= (1 + staleRatio);
    }

    // Midpoint divergence — progressive widening
    const divergence = this.getMidpointDivergence(marketId);
    if (divergence > this.config.divergenceWidenThreshold) {
      const divRatio = divergence / this.config.divergenceWidenThreshold;
      base *= (1 + divRatio);
    }

    // Apply sport-specific spread multiplier (always — enables tightening during
    // timeouts/blowouts AND widening during crunch time)
    const signal = this.gameRiskSignals.get(marketId);
    if (signal && signal.spreadMultiplier !== 1.0) {
      base *= signal.spreadMultiplier;
      this._gameSignalCount++;
    }

    // Apply VPIN spread multiplier
    const vpinMult = this.getVpinMultiplier(marketId);
    base *= vpinMult;

    const netYes = Number(inv.netYesExposure);
    const unitSize = Number(this.config.inventoryUnitUsdc);
    const exposureUnits = netYes / unitSize;
    const inventorySkew = exposureUnits * this.config.inventorySkewPerUnit;

    const bidHalfSpread = Math.max(0.005, base + Math.max(0, inventorySkew));
    const askHalfSpread = Math.max(0.005, base - Math.min(0, -inventorySkew));

    // Net cap
    const atCapBid = inv.netYesExposure >= this.config.positionCapUsdc;
    const atCapAsk = inv.netNoExposure >= this.config.positionCapUsdc;

    // Gross cap check
    const grossCap = this.config.positionCapUsdc * BigInt(this.config.grossCapMultiplier);
    const grossAtCapBid = inv.totalBuyVolume >= grossCap;
    const grossAtCapAsk = inv.totalSellVolume >= grossCap;

    return {
      bidHalfSpread,
      askHalfSpread,
      inventorySkew,
      atCapBid: atCapBid || grossAtCapBid,
      atCapAsk: atCapAsk || grossAtCapAsk,
    };
  }

  // ───────── Tier 1: VPIN (Volume-synchronized Probability of Informed Trading) ─────────

  private recordVpinFill(marketId: string, side: number): void {
    if (!this.recentSides.has(marketId)) {
      this.recentSides.set(marketId, []);
    }
    const sides = this.recentSides.get(marketId)!;
    sides.push(side);
    if (sides.length > this.config.vpinWindowSize) {
      sides.shift();
    }
  }

  private getVpinMultiplier(marketId: string): number {
    const sides = this.recentSides.get(marketId);
    if (!sides || sides.length < 8) return 1.0;

    const yesFrac = sides.filter(s => s === 0).length / sides.length;
    if (yesFrac > this.config.vpinThreshold || yesFrac < (1 - this.config.vpinThreshold)) {
      this._vpinTriggerCount++;
      return this.config.vpinSpreadMultiplier;
    }
    return 1.0;
  }

  isVpinTriggered(marketId: string): boolean {
    return this.getVpinMultiplier(marketId) > 1.0;
  }

  // ───────── Tier 1: Per-Wallet Toxicity Scoring ─────────

  /**
   * Called after a market resolves. Updates each wallet's toxicity score
   * based on whether they were on the correct side.
   */
  recordResolution(
    marketId: string,
    resolvedYes: boolean,
    walletPositions: Map<string, { netYes: number }>,
  ): void {
    for (const [wallet, pos] of walletPositions) {
      const wasCorrect = (resolvedYes && pos.netYes > 0) ||
                         (!resolvedYes && pos.netYes < 0);

      if (!this.walletToxicity.has(wallet)) {
        this.walletToxicity.set(wallet, { correctSideCount: 0, totalResolvedLots: 0 });
      }
      const tox = this.walletToxicity.get(wallet)!;
      tox.totalResolvedLots++;
      if (wasCorrect) tox.correctSideCount++;
    }
  }

  private getWalletToxicityLevel(wallet: string): "clean" | "toxic" | "very_toxic" {
    const tox = this.walletToxicity.get(wallet);
    if (!tox) return "clean";

    const correctRatio = tox.totalResolvedLots > 0
      ? tox.correctSideCount / tox.totalResolvedLots
      : 0;

    if (tox.totalResolvedLots >= this.config.toxicityHighMinMarkets &&
        correctRatio >= this.config.toxicityHighThreshold) {
      return "very_toxic";
    }
    if (tox.totalResolvedLots >= this.config.toxicityMinMarkets &&
        correctRatio >= this.config.toxicityThreshold) {
      return "toxic";
    }
    return "clean";
  }

  /**
   * Evaluate whether a proposed fill should be accepted, widened, or refused.
   * Direction-aware: if a toxic wallet's trade would REDUCE MM exposure, allow it
   * at a smaller penalty since it's helping the MM flatten its book.
   */
  evaluateFill(
    marketId: string,
    takerId: string,
    tradeSide: Side,
    tradeSize: bigint,
  ): FillEvaluation {
    let spreadMultiplier = 1.0;
    let refuse = false;
    const reasons: string[] = [];

    // VPIN component
    const vpinMult = this.getVpinMultiplier(marketId);
    if (vpinMult > 1.0) {
      spreadMultiplier *= vpinMult;
      reasons.push(`vpin:${vpinMult.toFixed(1)}x`);
    }

    // Per-wallet toxicity component
    const toxLevel = this.getWalletToxicityLevel(takerId);
    if (toxLevel !== "clean") {
      const inv = this.getInventory(marketId);
      const takerBuysYes = tradeSide === Side.BUY;
      const tradeReducesMmExposure =
        (takerBuysYes && inv.netNoExposure > inv.netYesExposure) ||
        (!takerBuysYes && inv.netYesExposure > inv.netNoExposure);

      if (tradeReducesMmExposure) {
        // Toxic but helping the MM — small penalty
        spreadMultiplier *= 1.3;
        reasons.push(`tox-reduce:1.3x`);
        this._toxicityWidenCount++;
      } else if (toxLevel === "very_toxic") {
        const exposureRatio = Math.abs(this.getExposureRatio(marketId));
        if (exposureRatio > 0.25) {
          refuse = true;
          reasons.push("very-toxic+exposed:refuse");
          this._toxicityBlockCount++;
        } else {
          spreadMultiplier *= 3.0;
          reasons.push("very-toxic:3x");
          this._toxicityWidenCount++;
        }
      } else {
        spreadMultiplier *= 2.0;
        reasons.push("toxic:2x");
        this._toxicityWidenCount++;
      }
    }

    // Sport-specific game signal
    const signal = this.gameRiskSignals.get(marketId);
    if (signal?.shouldWiden) {
      spreadMultiplier *= signal.spreadMultiplier;
      reasons.push(`game:${signal.reason}`);
    }

    return { spreadMultiplier, refuse, reasons };
  }

  // ───────── Tier 1: Bayesian Prior Shifting ─────────

  private updateBayesianShift(marketId: string): void {
    const sides = this.recentSides.get(marketId);
    if (!sides || sides.length < 6) return;

    const yesFrac = sides.filter(s => s === 0).length / sides.length;
    let shift = this.biasShi.get(marketId) ?? 0;

    // Flow-based shift: if flow is one-sided, shift toward it
    if (yesFrac > 0.65) {
      shift += 0.0005;
      this._bayesianShiftCount++;
    } else if (yesFrac < 0.35) {
      shift -= 0.0005;
      this._bayesianShiftCount++;
    }

    // Inventory-based shift: when heavily exposed, shift to encourage offsetting flow
    const inv = this.getInventory(marketId);
    const totalShares = Number(inv.totalBuyVolume + inv.totalSellVolume);
    if (totalShares > 0) {
      const exposureRatio = Math.abs(this.getExposureRatio(marketId));
      if (exposureRatio > 0.35) {
        const direction = Number(inv.netYesExposure) > 0 ? -1 : 1;
        shift += direction * 0.001 * exposureRatio;
      }
    }

    // Clamp total shift
    shift = Math.max(-0.05, Math.min(0.05, shift));
    this.biasShi.set(marketId, shift);
  }

  /** Returns the Bayesian shift to apply to fair value for this market. */
  getBaseBiasShift(marketId: string): number {
    return this.biasShi.get(marketId) ?? 0;
  }

  // ───────── Sport-Specific Game State Signals ─────────

  /**
   * Called by GameStateParsers to inject sport-specific risk signals.
   * These signals influence spread widening and withdrawal decisions.
   */
  setGameRiskSignal(marketId: string, signal: GameRiskSignal): void {
    this.gameRiskSignals.set(marketId, signal);
  }

  clearGameRiskSignal(marketId: string): void {
    this.gameRiskSignals.delete(marketId);
  }

  // ───────── Queries ─────────

  getExposureRatio(marketId: string): number {
    const inv = this.getInventory(marketId);
    const cap = Number(this.config.positionCapUsdc);
    if (cap === 0) return 0;
    return Number(inv.netYesExposure) / cap;
  }

  getStats(marketId: string): {
    netYesExposure: string;
    netNoExposure: string;
    totalBuyVolume: string;
    totalSellVolume: string;
    fillCount: number;
    exposureRatio: number;
    positionCapUsdc: string;
    maxFillSizeUsdc: string;
    withdrawn: boolean;
    vpinTriggered: boolean;
    bayesianShift: number;
    gameSignal: GameRiskSignal | null;
  } {
    const inv = this.getInventory(marketId);
    return {
      netYesExposure: inv.netYesExposure.toString(),
      netNoExposure: inv.netNoExposure.toString(),
      totalBuyVolume: inv.totalBuyVolume.toString(),
      totalSellVolume: inv.totalSellVolume.toString(),
      fillCount: inv.fillCount,
      exposureRatio: this.getExposureRatio(marketId),
      positionCapUsdc: this.config.positionCapUsdc.toString(),
      maxFillSizeUsdc: this.config.maxFillSizeUsdc.toString(),
      withdrawn: this.shouldWithdraw(marketId),
      vpinTriggered: this.isVpinTriggered(marketId),
      bayesianShift: this.getBaseBiasShift(marketId),
      gameSignal: this.gameRiskSignals.get(marketId) ?? null,
    };
  }

  getDefenseStats(): {
    vpinTriggers: number;
    toxicityBlocks: number;
    toxicityWidens: number;
    bayesianShifts: number;
    gameSignals: number;
    staleFvWithdrawals: number;
    divergenceWithdrawals: number;
    trackedWallets: number;
    toxicWallets: number;
    veryToxicWallets: number;
  } {
    let toxicWallets = 0;
    let veryToxicWallets = 0;
    for (const [wallet] of this.walletToxicity) {
      const level = this.getWalletToxicityLevel(wallet);
      if (level === "toxic") toxicWallets++;
      else if (level === "very_toxic") veryToxicWallets++;
    }

    return {
      vpinTriggers: this._vpinTriggerCount,
      toxicityBlocks: this._toxicityBlockCount,
      toxicityWidens: this._toxicityWidenCount,
      bayesianShifts: this._bayesianShiftCount,
      gameSignals: this._gameSignalCount,
      staleFvWithdrawals: this._staleFvWithdrawals,
      divergenceWithdrawals: this._divergenceWithdrawals,
      trackedWallets: this.walletToxicity.size,
      toxicWallets,
      veryToxicWallets,
    };
  }

  getConfig(): RiskConfig {
    return { ...this.config };
  }

  resetMarket(marketId: string): void {
    this.inventory.delete(marketId);
    this.auctionEndTimes.delete(marketId);
    this.recentSides.delete(marketId);
    this.biasShi.delete(marketId);
    this.gameRiskSignals.delete(marketId);
    this.lastFairValueTs.delete(marketId);
    this.lastFairValue.delete(marketId);
    this.lastMidpoint.delete(marketId);
    this.gamePhases.delete(marketId);
  }
}
