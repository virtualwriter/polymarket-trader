import { join } from "node:path";

export interface EnginePathConfig {
  dataDir: string;
  defaultLiveStateDir: string;
  liveStateDir: string;
  livePortfolioFile: string;
  pendingClosedTradesFile: string;
  relativeValueCsv: string;
  hybridBotTradesFile: string;
  hybridBotStateFile: string;
  hybridStrategyDoc: string;
}

export interface EnginePathConfigInputs {
  scriptDir: string;
  env: Record<string, string | undefined>;
}

export function resolveEnginePathConfig(inputs: EnginePathConfigInputs): EnginePathConfig {
  const { scriptDir, env } = inputs;
  const dataDir = join(scriptDir, "..", "data");
  const defaultLiveStateDir = join(scriptDir, "..", ".runtime");
  const liveStateDir = env.POLYMARKET_TRADER_STATE_DIR ?? defaultLiveStateDir;
  return {
    dataDir,
    defaultLiveStateDir,
    liveStateDir,
    livePortfolioFile: env.POLYMARKET_TRADER_LIVE_PORTFOLIO ?? join(liveStateDir, "portfolio-live.json"),
    pendingClosedTradesFile: env.POLYMARKET_TRADER_PENDING_CLOSED_TRADES ?? join(liveStateDir, "pending-closed-trades.jsonl"),
    relativeValueCsv: join(scriptDir, "..", "relative-value", "cross_venue_relative_value.csv"),
    hybridBotTradesFile: env.HYPERLIQUID_HYBRID_TRADES_FILE ?? join(liveStateDir, "hyperliquid-hybrid-trades.jsonl"),
    hybridBotStateFile: env.HYPERLIQUID_HYBRID_STATE_FILE ?? join(liveStateDir, "hyperliquid-hybrid-state.json"),
    hybridStrategyDoc: join(scriptDir, "..", "docs", "hybrid-strategy-context.md"),
  };
}

export interface EngineCliFlags {
  noLlm: boolean;
  dryRun: boolean;
  shadowArchitecture: boolean;
  llmDryRun: boolean;
  mutationDisabled: boolean;
}

export function parseEngineCliFlags(argv: string[]): EngineCliFlags {
  const dryRun = argv.includes("--dry-run");
  const llmDryRun = argv.includes("--llm-dry-run");
  return {
    noLlm: argv.includes("--no-llm"),
    dryRun,
    shadowArchitecture: argv.includes("--shadow-architecture") || dryRun,
    llmDryRun,
    mutationDisabled: dryRun || llmDryRun,
  };
}
