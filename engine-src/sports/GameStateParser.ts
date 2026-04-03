import type { GameRiskSignal } from "../mm/RiskManager.js";

export type Sport = "tennis" | "soccer" | "baseball" | "basketball" | "hockey";

export interface GameEvent {
  marketId?: string;
  gameId?: string;
  eventType: "odds_update" | "score_update" | "game_start" | "game_end" | "external_trade";
  data?: Record<string, unknown>;
}

/**
 * Sport-specific state tracked across events.
 * Each parser enriches this with sport-specific fields.
 */
export interface GameState {
  sport: Sport;
  phase: "pre_game" | "live" | "resolved";
  fairValue: number;
  scoreA: number;
  scoreB: number;
  period: string;
  clock: string;
  lastEventTime: number;
  extra: Record<string, unknown>;
}

/**
 * Interface for sport-specific game state parsers.
 * Each parser translates raw game events into risk signals
 * that the RiskManager uses to adjust spreads and withdrawal.
 */
export interface GameStateParser {
  readonly sport: Sport;

  /** Parse a raw game event and update internal state. Returns a risk signal. */
  parseEvent(event: GameEvent, state: GameState): GameRiskSignal;

  /** How urgently should the MM withdraw? 0 = no urgency, 1 = immediate. */
  getWithdrawalUrgency(state: GameState): number;

  /** Multiplier for base spread given current game state. */
  getVolatilityMultiplier(state: GameState): number;
}

export async function createParser(sport: Sport): Promise<GameStateParser> {
  switch (sport) {
    case "tennis": {
      const { TennisParser } = await import("./TennisParser.js");
      return new TennisParser();
    }
    case "soccer": {
      const { SoccerParser } = await import("./SoccerParser.js");
      return new SoccerParser();
    }
    case "baseball": {
      const { BaseballParser } = await import("./BaseballParser.js");
      return new BaseballParser();
    }
    case "basketball":
    case "hockey": {
      const { BasketballParser } = await import("./BasketballParser.js");
      return new BasketballParser();
    }
    default:
      throw new Error(`Unknown sport: ${sport}`);
  }
}

export function createGameState(sport: Sport, initialProb: number): GameState {
  return {
    sport,
    phase: "pre_game",
    fairValue: initialProb,
    scoreA: 0,
    scoreB: 0,
    period: "",
    clock: "",
    lastEventTime: Date.now(),
    extra: {},
  };
}
