import type { GameStateParser, GameEvent, GameState } from "./GameStateParser.js";
import type { GameRiskSignal } from "../mm/RiskManager.js";

/**
 * Basketball game state parser. Basketball has continuous scoring with no
 * discrete "lots" — the risk model instead uses score differential and
 * time remaining to modulate spreads.
 *
 * Key risk zones:
 *   - Final 2 minutes of 4th quarter with close game
 *   - Overtime periods
 *   - Timeouts and challenges (brief recalibration)
 *   - Big leads → calm, tight spreads
 *
 * state.extra fields:
 *   quarter:          1-4 or OT, OT2, etc.
 *   secondsRemaining: seconds left in current period
 *   isOvertime:       boolean
 *   isTimeout:        boolean
 *   timeoutUntil:     timestamp when timeout ends
 *   leadChanges:      count of lead changes (momentum indicator)
 */
export class BasketballParser implements GameStateParser {
  readonly sport = "basketball" as const;
  private regulationPeriods: number;

  constructor(regulationPeriods = 4) {
    this.regulationPeriods = regulationPeriods;
  }

  private isFinalPeriod(state: GameState): boolean {
    const quarter = this.getQuarterNumber(state);
    return quarter >= this.regulationPeriods || !!state.extra.isOvertime;
  }

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

      // Parse quarter from period
      if (d.quarter !== undefined) {
        state.extra.quarter = d.quarter;
      } else if (state.period) {
        const p = state.period.toUpperCase();
        if (p.includes("OT")) {
          state.extra.isOvertime = true;
          state.extra.quarter = p;
        } else {
          const m = p.match(/(\d)/);
          if (m) state.extra.quarter = parseInt(m[1]);
        }
      }

      // Parse remaining time
      if (d.secondsRemaining !== undefined) {
        state.extra.secondsRemaining = d.secondsRemaining;
      } else if (state.clock) {
        state.extra.secondsRemaining = this.parseClockToSeconds(state.clock);
      }

      // Track lead changes
      if ((prevA > prevB && state.scoreA < state.scoreB) ||
          (prevA < prevB && state.scoreA > state.scoreB)) {
        state.extra.leadChanges = ((state.extra.leadChanges as number) ?? 0) + 1;
      }

      // Timeout detection (from Sportradar PBP or manual event)
      if (d.isTimeout) {
        state.extra.isTimeout = true;
        state.extra.timeoutUntil = Date.now() + 90_000; // ~90s timeout
      }

      // Halftime detection (from Sportradar boxscore status)
      if (d.isHalftime) {
        state.extra.isHalftime = true;
        state.period = "HT";
      } else if (state.extra.isHalftime && !d.isHalftime) {
        state.extra.isHalftime = false;
      }
    }

    if (event.eventType === "odds_update") {
      const fv = (d.fairValue ?? d.probability) as number | undefined;
      if (fv && fv > 0 && fv < 1) state.fairValue = fv;
    }

    if (event.eventType === "game_start") {
      state.phase = "live";
      state.extra.quarter = 1;
      state.extra.leadChanges = 0;
    }

    if (event.eventType === "game_end") {
      state.phase = "resolved";
    }

    // Clear timeout if expired
    const timeoutUntil = (state.extra.timeoutUntil as number) ?? 0;
    if (timeoutUntil && Date.now() > timeoutUntil) {
      state.extra.isTimeout = false;
    }

    return this.buildSignal(state);
  }

  getWithdrawalUrgency(state: GameState): number {
    const secsLeft = (state.extra.secondsRemaining as number) ?? 720;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);
    const finalPeriod = this.isFinalPeriod(state);

    // Overtime final minute
    if (state.extra.isOvertime && secsLeft <= 60 && scoreDiff <= 3) return 0.9;

    // Final period last 90 seconds, close game
    if (finalPeriod && secsLeft <= 90 && scoreDiff <= 5) return 0.8;

    // Final period last 3 minutes, very close game
    if (finalPeriod && secsLeft <= 180 && scoreDiff <= 3) return 0.6;

    return 0;
  }

  getVolatilityMultiplier(state: GameState): number {
    const secsLeft = (state.extra.secondsRemaining as number) ?? 720;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);
    const finalPeriod = this.isFinalPeriod(state);

    // Overtime
    if (state.extra.isOvertime) {
      if (secsLeft <= 60 && scoreDiff <= 3) return 4.0;
      return 2.5;
    }

    // Final period crunch time
    if (finalPeriod) {
      if (secsLeft <= 30 && scoreDiff <= 5) return 4.0;
      if (secsLeft <= 90 && scoreDiff <= 5) return 3.0;
      if (secsLeft <= 180 && scoreDiff <= 5) return 2.5;
      if (secsLeft <= 300 && scoreDiff <= 8) return 2.0;
    }

    // Halftime — extended dead ball
    if (state.extra.isHalftime) return 0.5;

    // Timeout — brief calm, tighter spreads
    if (state.extra.isTimeout) return 0.7;

    // Big lead — very calm
    if (scoreDiff >= 20) return 0.5;
    if (scoreDiff >= 15) return 0.6;
    if (scoreDiff >= 10) return 0.8;

    // Halftime
    const quarter = this.getQuarterNumber(state);
    if (state.period === "HT" || (quarter === 2 && secsLeft === 0)) return 0.7;

    return 1.0;
  }

  private parseClockToSeconds(clock: string): number {
    const parts = clock.split(":");
    if (parts.length === 2) {
      return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
    }
    return parseFloat(clock) || 0;
  }

  private getQuarterNumber(state: GameState): number {
    const q = state.extra.quarter;
    if (typeof q === "number") return q;
    if (typeof q === "string") {
      if (q.includes("OT")) return 5;
      const m = q.match(/(\d)/);
      if (m) return parseInt(m[1]);
    }
    return 1;
  }

  private buildSignal(state: GameState): GameRiskSignal {
    if (state.phase !== "live") {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "pre-game" };
    }

    const secsLeft = (state.extra.secondsRemaining as number) ?? 720;
    const scoreDiff = Math.abs(state.scoreA - state.scoreB);
    const finalPeriod = this.isFinalPeriod(state);

    // Overtime final minute, close game — withdraw entirely
    if (state.extra.isOvertime && secsLeft <= 60 && scoreDiff <= 3) {
      return { shouldWiden: false, shouldWithdraw: true, spreadMultiplier: 4.0, reason: "OT-final-minute" };
    }

    // Overtime general — wide spreads
    if (state.extra.isOvertime) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 2.5, reason: "overtime" };
    }

    // Final period last 90 seconds, close game — withdraw (max adverse selection zone)
    if (finalPeriod && secsLeft <= 90 && scoreDiff <= 5) {
      return { shouldWiden: false, shouldWithdraw: true, spreadMultiplier: 4.0, reason: "final-90s" };
    }

    // Final period last 3 minutes, close game — heavily widened
    if (finalPeriod && secsLeft <= 180 && scoreDiff <= 5) {
      const mult = 2.0 + (180 - secsLeft) / 90;
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: mult, reason: "crunch-time" };
    }

    // Final period last 5 minutes, competitive — widened
    if (finalPeriod && secsLeft <= 300 && scoreDiff <= 8) {
      return { shouldWiden: true, shouldWithdraw: false, spreadMultiplier: 2.0, reason: "late-close" };
    }

    // Halftime — extended dead ball, very tight spreads (zero adverse selection)
    if (state.extra.isHalftime) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.5, reason: "halftime" };
    }

    // Timeout — brief calm, tighter spreads (low adverse selection during dead ball)
    if (state.extra.isTimeout) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.7, reason: "timeout" };
    }

    // Big lead — very calm, tighter spreads (each point has minimal impact)
    if (scoreDiff >= 20) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.5, reason: "blowout" };
    }
    if (scoreDiff >= 15) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.6, reason: "big-lead" };
    }
    if (scoreDiff >= 10) {
      return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 0.8, reason: "comfortable-lead" };
    }

    return { shouldWiden: false, shouldWithdraw: false, spreadMultiplier: 1.0, reason: "normal-play" };
  }
}
