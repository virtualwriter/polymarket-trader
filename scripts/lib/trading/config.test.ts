import { describe, expect, it } from "vitest";
import { parseEngineCliFlags, resolveEnginePathConfig } from "./config.js";

describe("engine config helpers", () => {
  it("resolves default runtime paths from the script directory", () => {
    expect(resolveEnginePathConfig({ scriptDir: "/repo/scripts", env: {} })).toEqual({
      dataDir: "/repo/data",
      defaultLiveStateDir: "/repo/.runtime",
      liveStateDir: "/repo/.runtime",
      livePortfolioFile: "/repo/.runtime/portfolio-live.json",
      pendingClosedTradesFile: "/repo/.runtime/pending-closed-trades.jsonl",
      relativeValueCsv: "/repo/relative-value/cross_venue_relative_value.csv",
      hybridBotTradesFile: "/repo/.runtime/hyperliquid-hybrid-trades.jsonl",
      hybridBotStateFile: "/repo/.runtime/hyperliquid-hybrid-state.json",
      hybridStrategyDoc: "/repo/docs/hybrid-strategy-context.md",
    });
  });

  it("lets environment overrides replace live state and hybrid paths", () => {
    const config = resolveEnginePathConfig({
      scriptDir: "/repo/scripts",
      env: {
        POLYMARKET_TRADER_STATE_DIR: "/state",
        POLYMARKET_TRADER_LIVE_PORTFOLIO: "/custom/portfolio-live.json",
        POLYMARKET_TRADER_PENDING_CLOSED_TRADES: "/custom/pending.jsonl",
        HYPERLIQUID_HYBRID_TRADES_FILE: "/custom/hybrid-trades.jsonl",
        HYPERLIQUID_HYBRID_STATE_FILE: "/custom/hybrid-state.json",
      },
    });

    expect(config.liveStateDir).toBe("/state");
    expect(config.livePortfolioFile).toBe("/custom/portfolio-live.json");
    expect(config.pendingClosedTradesFile).toBe("/custom/pending.jsonl");
    expect(config.hybridBotTradesFile).toBe("/custom/hybrid-trades.jsonl");
    expect(config.hybridBotStateFile).toBe("/custom/hybrid-state.json");
  });

  it("parses dry-run and LLM flags without reading process.argv directly", () => {
    expect(parseEngineCliFlags(["node", "script", "--dry-run", "--no-llm"])).toEqual({
      noLlm: true,
      dryRun: true,
      shadowArchitecture: true,
      llmDryRun: false,
      mutationDisabled: true,
    });
    expect(parseEngineCliFlags(["--llm-dry-run", "--shadow-architecture"])).toEqual({
      noLlm: false,
      dryRun: false,
      shadowArchitecture: true,
      llmDryRun: true,
      mutationDisabled: true,
    });
  });
});
