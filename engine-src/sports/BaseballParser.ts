import type { GameStateParser, GameEvent, GameState } from "./GameStateParser.js";
import type { GameRiskSignal } from "../mm/RiskManager.js";

/**
 * Baseball game state parser. Baseball has a highly discrete structure
 * (pitch → at-bat → half-inning → inning) that maps well to auction lots.
 *
 * The "leverage index" concept drives risk: how much does the current game
 * state affect win probability? High leverage = informed flow = widen/withdraw.
 *
 * state.extra fields:
 *   inning:         current inning number (1-9+)
 *   halfInning:     "top" | "bottom"
 *   outs:           0, 1, or 2
 *   runners:        bitmask (1=1st, 2=2nd, 4=3rd) or count
 *   runnersOnBase:  number of runners
 *   leverageIndex:  computed 0-1 scale of current situation importance
 *   isExtraInnings: boolean
 */
export class BaseballParser implements GameStateParser {
  readonly sport = "baseball" as const;

  parseEvent(event: GameEvent, state: GameState): GameRiskSignal {
    const d = event.data ?? {};
    state.lastEventTime = Date.now();

    if (event.eventType === "score_update") {
      if (d.scoreA !== undefined) state.scoreA = d.scoreA as number;
      if (d.scoreB !== undefined) state.scoreB = d.scoreB as number;
      if (d.period) state.period = d.period as string;
      if (d.clock) state.clock = d.clock as string;

      if (d.inning !== undefined) state.extra.inning = d.inning;
      if (d.halfInning !== undefined) state.extra.halfInning = d.halfInning;
      if (d.outs !== undefined) state.extra.outs = d.outs;
      if (d.runners !== undefined) state.extra.runners = d.runners;
      if (d.runnersOnBase !== undefined) state.extra.runnersOnBase = d.runnersOnBase;

      // Parse inning from period string (e.g. "End 5", "Top 7")
      if (!d.inning && state.period) {
        const m = state.period.match(/(\d+)/);
        if (m) state.extra.inning = parseInt(m[1]);
        if (state.period.toLowerCase().includes("top")) state.extra.halfInning = "top";
        if (state.period.toLowerCase().includes("bot")) state.extra.halfInning = "bottom";
        if (state.period.toLowerCase().includes("end")) state.extra.halfInning = "end";
      }

      state.extra.isExtraInnings = ((state.extra.inning as number) ?? 0) > 9;
      this.computeLeverageIndex(state);
    }

    if (event.eventType === "odds_update") {
      const fv = (d.fairValue ?? d.probability) as number | undefined;
      if (fv && fv > 0 && fv < 1) state.fairValue = fv;
    }

    if (event.eventType === "game_start") {
      state.phase = "live";
      state.extra.inning = 1;
      state.extra.halfInning = "top";
      state.extra.outs = 0;
    }

    if (event.eventType === "game_end") {
      state.phase = "resolved";
    }

    return this.buildSignal(state);
  }

  getWithdrawalUrgency(state: GameState): number {
    const li = (state.extra.leverageIndex as number) ?? 0;
    if (li > 0.85) return 0.9;
    if (li > 0.7) return 0.6;
    return 0;
  }

  getVolatilityMultiplier(state: GameState): number {
    const li = (state.extra.leverageIndex as number) ?? 0;

    if (li > 0.85) return 3.5;
    if (li > 0.7) return 2.5;
    if (li > 0.5) return 1.8;
    if (li > 0.3) return 1.3;

    // Early innings, big lead — very calm
    const inning = (state.extra.inning as number) ?? 1;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);
    if (inning <= 5 && scoreDiff >= 5) return 0.7;

    return 1.0;
  }

  /**
   * Simplified leverage index: how much does the current situation matter?
   * Based on inning, outs, score differential, runners on base.
   */
  private computeLeverageIndex(state: GameState): void {
    const inning = (state.extra.inning as number) ?? 1;
    const outs = (state.extra.outs as number) ?? 0;
    const runnersOnBase = (state.extra.runnersOnBase as number) ??
      this.countRunners(state.extra.runners as number | undefined);
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);

    // Inning factor: later innings matter more (0.1 to 1.0)
    const inningFactor = Math.min(1.0, inning / 9);

    // Score factor: close games matter more (1.0 for tied, decreasing)
    const scoreFactor = scoreDiff === 0 ? 1.0 :
      scoreDiff === 1 ? 0.8 :
      scoreDiff === 2 ? 0.5 :
      scoreDiff <= 4 ? 0.3 : 0.1;

    // Outs factor: 2 outs is more leveraged than 0
    const outsFactor = outs === 2 ? 1.0 : outs === 1 ? 0.7 : 0.5;

    // Runners factor: more runners = more potential for big swings
    const runnersFactor = 1.0 + runnersOnBase * 0.15;

    // Extra innings boost
    const extraInningsBoost = state.extra.isExtraInnings ? 0.2 : 0;

    const li = Math.min(1.0,
      inningFactor * scoreFactor * outsFactor * runnersFactor + extraInningsBoost
    );
    state.extra.leverageIndex = li;
  }

  private countRunners(bitmask: number | undefined): number {
    if (bitmask === undefined) return 0;
    let count = 0;
    if (bitmask & 1) count++;
    if (bitmask & 2) count++;
    if (bitmask & 4) count++;
    return count;
  }

  private buildSignal(state: GameState): GameRiskSignal {
    if (state.phase !== "live") {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "pre-game" };
    }

    const li = (state.extra.leverageIndex as number) ?? 0;
    const inning = (state.extra.inning as number) ?? 1;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);

    // Very high leverage — withdraw
    if (li > 0.85) {
      return { shouldWiden: false, shouldWithdraw: true, spreadMultiplier: 3.5, reason: "extreme-leverage" };
    }

    // High leverage — widen significantly
    if (li > 0.7) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 2.5, reason: "high-leverage" };
    }

    // Moderate leverage
    if (li > 0.5) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 1.8, reason: "moderate-leverage" };
    }

    // Between innings — brief recalibration, slightly tighter
    if (state.extra.halfInning === "end") {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.9, reason: "between-innings" };
    }

    // Early blowout — very calm
    if (inning <= 5 && scoreDiff >= 5) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.7, reason: "blowout" };
    }

    return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "normal-play" };
  }
}
