import type { GameStateParser, GameEvent, GameState } from "./GameStateParser.js";
import type { GameRiskSignal } from "../mm/RiskManager.js";

/**
 * Tennis game state parser. Maps tennis structure to auction-like risk signals.
 *
 * Tennis structure: Point → Game → Set → Match
 * Each SET is treated as a "lot" — the bot earns spread during normal play
 * and withdraws before set/match points (the "hammer").
 *
 * state.extra fields:
 *   setsA, setsB:       set score (e.g. 2-1)
 *   gamesA, gamesB:     game score within current set (e.g. 5-4)
 *   pointA, pointB:     point score within current game (e.g. "40", "30")
 *   isBreakPoint:        boolean
 *   isSetPoint:          boolean
 *   isMatchPoint:        boolean
 *   lastGoalTime:        timestamp of last score change (for cooldown)
 */
export class TennisParser implements GameStateParser {
  readonly sport = "tennis" as const;

  parseEvent(event: GameEvent, state: GameState): GameRiskSignal {
    const d = event.data ?? {};
    state.lastEventTime = Date.now();

    if (event.eventType === "score_update") {
      if (d.scoreA !== undefined) state.scoreA = d.scoreA as number;
      if (d.scoreB !== undefined) state.scoreB = d.scoreB as number;
      if (d.period) state.period = d.period as string;
      if (d.clock) state.clock = d.clock as string;

      // Tennis-specific state from Sportradar or enriched bridge data
      if (d.setsA !== undefined) state.extra.setsA = d.setsA;
      if (d.setsB !== undefined) state.extra.setsB = d.setsB;
      if (d.gamesA !== undefined) state.extra.gamesA = d.gamesA;
      if (d.gamesB !== undefined) state.extra.gamesB = d.gamesB;
      if (d.pointA !== undefined) state.extra.pointA = d.pointA;
      if (d.pointB !== undefined) state.extra.pointB = d.pointB;

      this.computeKeyPoints(state);
      state.extra.lastGoalTime = Date.now();
    }

    if (event.eventType === "odds_update") {
      const fv = (d.fairValue ?? d.probability) as number | undefined;
      if (fv && fv > 0 && fv < 1) state.fairValue = fv;
    }

    if (event.eventType === "game_start") {
      state.phase = "live";
      state.extra.setsA = 0;
      state.extra.setsB = 0;
    }

    if (event.eventType === "game_end") {
      state.phase = "resolved";
    }

    return this.buildSignal(state);
  }

  getWithdrawalUrgency(state: GameState): number {
    if (state.extra.isMatchPoint) return 1.0;
    if (state.extra.isSetPoint) return 0.8;
    if (state.extra.isBreakPoint) return 0.5;
    return 0;
  }

  getVolatilityMultiplier(state: GameState): number {
    if (state.extra.isMatchPoint) return 4.0;
    if (state.extra.isSetPoint) return 3.0;
    if (state.extra.isBreakPoint) return 2.0;

    // Tiebreak is high volatility
    const gA = (state.extra.gamesA as number) ?? 0;
    const gB = (state.extra.gamesB as number) ?? 0;
    if (gA === 6 && gB === 6) return 2.5;

    return 1.0;
  }

  private computeKeyPoints(state: GameState): void {
    const sA = (state.extra.setsA as number) ?? 0;
    const sB = (state.extra.setsB as number) ?? 0;
    const gA = (state.extra.gamesA as number) ?? 0;
    const gB = (state.extra.gamesB as number) ?? 0;
    const pA = String(state.extra.pointA ?? "0");
    const pB = String(state.extra.pointB ?? "0");

    const pointVal = (p: string) => {
      if (p === "AD") return 50;
      return parseInt(p) || 0;
    };

    const pvA = pointVal(pA);
    const pvB = pointVal(pB);

    // Break point: return player is at 40 or AD, serve player is behind
    // (simplified — we don't track who is serving, so approximate)
    state.extra.isBreakPoint = (pvA >= 40 && pvB < pvA) || (pvB >= 40 && pvA < pvB);

    // Set point: one player is at 5+ games and ahead, and at 40/AD on points
    const onServeForSet = (gA >= 5 && gA > gB && pvA >= 40 && pvA > pvB) ||
                          (gB >= 5 && gB > gA && pvB >= 40 && pvB > pvA);
    // Tiebreak set point
    const inTiebreak = gA === 6 && gB === 6;
    const tiebreakSetPoint = inTiebreak && (
      (state.scoreA >= 6 && state.scoreA > state.scoreB) ||
      (state.scoreB >= 6 && state.scoreB > state.scoreA)
    );
    state.extra.isSetPoint = onServeForSet || tiebreakSetPoint;

    // Match point: it's a set point AND winning would clinch the match (best of 3 or 5)
    const bestOf3MatchPoint = (state.extra.isSetPoint) &&
      ((sA === 1 && gA >= 5 && gA > gB) || (sB === 1 && gB >= 5 && gB > gA));
    const bestOf5MatchPoint = (state.extra.isSetPoint) &&
      ((sA === 2 && gA >= 5 && gA > gB) || (sB === 2 && gB >= 5 && gB > gA));
    state.extra.isMatchPoint = bestOf3MatchPoint || bestOf5MatchPoint;
  }

  private buildSignal(state: GameState): GameRiskSignal {
    if (state.phase !== "live") {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "pre-game" };
    }

    if (state.extra.isMatchPoint) {
      return { shouldWiden: false, shouldWithdraw: true, spreadMultiplier: 4.0, reason: "match-point" };
    }

    if (state.extra.isSetPoint) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 3.0, reason: "set-point" };
    }

    if (state.extra.isBreakPoint) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 2.0, reason: "break-point" };
    }

    // Tiebreak general volatility
    const gA = (state.extra.gamesA as number) ?? 0;
    const gB = (state.extra.gamesB as number) ?? 0;
    if (gA === 6 && gB === 6) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 2.5, reason: "tiebreak" };
    }

    // Between sets (period change just happened) — calm period, tighten
    const timeSinceEvent = Date.now() - state.lastEventTime;
    if (timeSinceEvent > 120_000 && state.period.includes("Set")) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.8, reason: "between-sets" };
    }

    return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "normal-play" };
  }
}
