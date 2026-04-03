import type { GameStateParser, GameEvent, GameState } from "./GameStateParser.js";
import type { GameRiskSignal } from "../mm/RiskManager.js";

/**
 * Soccer game state parser. Soccer is the WORST fit for this bot style due to
 * unpredictable goals causing massive probability jumps. The parser's job is
 * defensive — widening aggressively near danger zones and pausing after goals.
 *
 * state.extra fields:
 *   minute:            current match minute (0-90+)
 *   prevScoreA:        previous score for goal detection
 *   prevScoreB:        previous score for goal detection
 *   goalCooldownUntil: timestamp when goal cooldown expires
 *   isPenaltyShootout: boolean
 *   isExtraTime:       boolean
 */
export class SoccerParser implements GameStateParser {
  readonly sport = "soccer" as const;

  private static readonly GOAL_COOLDOWN_MS = 30_000;

  parseEvent(event: GameEvent, state: GameState): GameRiskSignal {
    const d = event.data ?? {};
    state.lastEventTime = Date.now();

    if (event.eventType === "score_update") {
      const prevA = state.scoreA;
      const prevB = state.scoreB;
      if (d.scoreA !== undefined) state.scoreA = d.scoreA as number;
      if (d.scoreB !== undefined) state.scoreB = d.scoreB as number;
      if (d.period) state.period = d.period as string;
      if (d.clock) state.clock = d.clock as string;

      // Parse minute from clock or period
      if (d.minute !== undefined) {
        state.extra.minute = d.minute;
      } else if (state.clock) {
        const m = parseInt(state.clock);
        if (!isNaN(m)) state.extra.minute = m;
      }

      // Goal detection — trigger cooldown
      if (state.scoreA !== prevA || state.scoreB !== prevB) {
        state.extra.prevScoreA = prevA;
        state.extra.prevScoreB = prevB;
        state.extra.goalCooldownUntil = Date.now() + SoccerParser.GOAL_COOLDOWN_MS;
      }

      // Period detection
      state.extra.isPenaltyShootout = state.period === "PenaltyShootout";
      state.extra.isExtraTime = state.period === "ET" ||
        state.period === "1H ET" || state.period === "2H ET";
    }

    if (event.eventType === "odds_update") {
      const fv = (d.fairValue ?? d.probability) as number | undefined;
      if (fv && fv > 0 && fv < 1) state.fairValue = fv;
    }

    if (event.eventType === "game_start") {
      state.phase = "live";
      state.extra.minute = 0;
    }

    if (event.eventType === "game_end") {
      state.phase = "resolved";
    }

    return this.buildSignal(state);
  }

  getWithdrawalUrgency(state: GameState): number {
    if (state.extra.isPenaltyShootout) return 1.0;

    const minute = (state.extra.minute as number) ?? 0;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);

    // Final minutes of close game
    if (minute >= 88 && scoreDiff <= 1) return 0.9;
    if (minute >= 85 && scoreDiff === 0) return 0.7;

    // Goal just happened — high urgency
    const cooldownUntil = (state.extra.goalCooldownUntil as number) ?? 0;
    if (Date.now() < cooldownUntil) return 0.8;

    return 0;
  }

  getVolatilityMultiplier(state: GameState): number {
    const minute = (state.extra.minute as number) ?? 0;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);

    if (state.extra.isPenaltyShootout) return 5.0;

    // Goal cooldown — extreme volatility
    const cooldownUntil = (state.extra.goalCooldownUntil as number) ?? 0;
    if (Date.now() < cooldownUntil) return 4.0;

    if (state.extra.isExtraTime) return 3.0;

    // Late game close score — progressive widening
    if (minute >= 80 && scoreDiff <= 1) {
      return 1.0 + (minute - 80) * 0.2;
    }

    // Early/mid game, big lead — relatively calm
    if (scoreDiff >= 3) return 0.8;

    return 1.0;
  }

  private buildSignal(state: GameState): GameRiskSignal {
    if (state.phase !== "live") {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "pre-game" };
    }

    // Penalty shootout — withdraw entirely
    if (state.extra.isPenaltyShootout) {
      return { shouldWiden: false, shouldWithdraw: true, spreadMultiplier: 5.0, reason: "penalty-shootout" };
    }

    // Goal just scored — pause quoting during cooldown
    const cooldownUntil = (state.extra.goalCooldownUntil as number) ?? 0;
    if (Date.now() < cooldownUntil) {
      return { shouldWiden: false, shouldWithdraw: true, spreadMultiplier: 4.0, reason: "goal-cooldown" };
    }

    const minute = (state.extra.minute as number) ?? 0;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);

    // Extra time — high volatility
    if (state.extra.isExtraTime) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 3.0, reason: "extra-time" };
    }

    // Final minutes of close game
    if (minute >= 88 && scoreDiff <= 1) {
      return { shouldWiden: false, shouldWithdraw: true, spreadMultiplier: 3.0, reason: "final-minutes-close" };
    }

    if (minute >= 80 && scoreDiff <= 1) {
      const mult = 1.0 + (minute - 80) * 0.2;
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: mult, reason: "late-game-close" };
    }

    // Halftime — calm, tighten slightly
    if (state.period === "HT" || state.period === "Break") {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.8, reason: "halftime" };
    }

    // Big lead — calm
    if (scoreDiff >= 3) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.8, reason: "blowout" };
    }

    return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "normal-play" };
  }
}
