export interface LeanArtifactFilenames {
  engineState: string;
  truthState: string;
  candidateActions: string;
  llmAdvice: string;
  executionPlan: string;
}

export interface LeanArtifactInputs {
  engineState: unknown;
  truthState: unknown;
  candidateActions: unknown;
  gatedAdvice: unknown | null;
  executionPlan: unknown | null;
}

export function buildLeanArtifactEntries(
  filenames: LeanArtifactFilenames,
  inputs: LeanArtifactInputs,
): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [
    [filenames.engineState, inputs.engineState],
    [filenames.truthState, inputs.truthState],
    [filenames.candidateActions, inputs.candidateActions],
  ];
  if (inputs.gatedAdvice) entries.push([filenames.llmAdvice, inputs.gatedAdvice]);
  if (inputs.executionPlan) entries.push([filenames.executionPlan, inputs.executionPlan]);
  return entries;
}

export interface ExecutionPlanArtifactInputs<
  TMechanicalExit,
  TSignalKillExit,
  TAcceptedClose,
  TRejectedClose,
  TSkippedTrade,
  TSignal extends { confidence: number },
> {
  candidateActions: {
    mechanicalExits: TMechanicalExit[];
    signalKillExits: TSignalKillExit[];
  };
  gatedAdvice: {
    acceptedCloses: TAcceptedClose[];
    rejectedCloses: TRejectedClose[];
    skippedTrades: TSkippedTrade[];
  };
  signals: TSignal[];
  dryRun: boolean;
  llmDryRun: boolean;
  mutationDisabled: boolean;
  generatedAt?: string;
}

export function buildExecutionPlanArtifact<
  TMechanicalExit,
  TSignalKillExit,
  TAcceptedClose,
  TRejectedClose,
  TSkippedTrade,
  TSignal extends { confidence: number },
>(
  inputs: ExecutionPlanArtifactInputs<TMechanicalExit, TSignalKillExit, TAcceptedClose, TRejectedClose, TSkippedTrade, TSignal>,
) {
  const { candidateActions, gatedAdvice, signals, dryRun, llmDryRun, mutationDisabled } = inputs;
  return {
    generatedAt: inputs.generatedAt ?? new Date().toISOString(),
    dryRun,
    llmDryRun,
    mechanicalExits: candidateActions.mechanicalExits,
    signalKillExits: candidateActions.signalKillExits,
    llmCloses: gatedAdvice.acceptedCloses,
    entrySignals: signals.sort((a, b) => b.confidence - a.confidence),
    rejectedLlmActions: gatedAdvice.rejectedCloses,
    skippedLlmActions: gatedAdvice.skippedTrades,
    notes: [
      mutationDisabled ? "Executor mutations disabled for dry-run verification." : "Executor mutations enabled.",
      `${gatedAdvice.acceptedCloses.length} LLM closes accepted; ${gatedAdvice.rejectedCloses.length} rejected; ${gatedAdvice.skippedTrades.length} non-close instructions skipped.`,
    ],
  };
}

export interface DryRunVerificationArtifactInputs<TEngineState, TCandidateActions, TExecutionPlan> {
  engineState: TEngineState & {
    portfolio: {
      openPositions: number;
    };
  };
  candidateActions: TCandidateActions & {
    mechanicalExits: unknown[];
    signalKillExits: unknown[];
    entryCandidates: unknown[];
  };
  executionPlan: (TExecutionPlan & {
    llmCloses: unknown[];
    rejectedLlmActions: unknown[];
  }) | null;
  mutationDisabled: boolean;
  shadowArchitecture: boolean;
  generatedAt?: string;
}

export function buildDryRunVerificationArtifact<TEngineState, TCandidateActions, TExecutionPlan>(
  inputs: DryRunVerificationArtifactInputs<TEngineState, TCandidateActions, TExecutionPlan>,
) {
  if (!inputs.mutationDisabled && !inputs.shadowArchitecture) return null;
  return {
    generatedAt: inputs.generatedAt ?? new Date().toISOString(),
    mutationDisabled: inputs.mutationDisabled,
    checks: {
      portfolioPositions: inputs.engineState.portfolio.openPositions,
      mechanicalExitCandidates: inputs.candidateActions.mechanicalExits.length,
      signalKillExitCandidates: inputs.candidateActions.signalKillExits.length,
      entryCandidates: inputs.candidateActions.entryCandidates.length,
      llmClosesAccepted: inputs.executionPlan?.llmCloses.length ?? 0,
      llmClosesRejected: inputs.executionPlan?.rejectedLlmActions.length ?? 0,
    },
    protectedStateFiles: [
      "portfolio.json",
      "trades-detailed.csv",
      "learning-journal.md",
      "hypotheses.json",
      "signal-weights.json",
      "blocked-signals.json",
      "learning-params.json",
    ],
  };
}

export interface EngineDataFreshnessInputs<TValuationRow, TMacroRow, TInstrumentSnapshot> {
  valuationRows: TValuationRow[];
  macroRows: TMacroRow[];
  instrumentSnapshots: TInstrumentSnapshot[];
  latestValuationAt: string;
  latestInstrumentSnapshotAt: string | null;
}

export function buildEngineDataFreshnessArtifact<TValuationRow, TMacroRow, TInstrumentSnapshot>(
  inputs: EngineDataFreshnessInputs<TValuationRow, TMacroRow, TInstrumentSnapshot>,
) {
  return {
    valuationRows: inputs.valuationRows.length,
    latestValuationAt: inputs.latestValuationAt,
    macroRows: inputs.macroRows.length,
    instrumentSnapshots: inputs.instrumentSnapshots.length,
    latestInstrumentSnapshotAt: inputs.latestInstrumentSnapshotAt,
  };
}

export interface EnginePortfolioSummaryInputs<TPosition> {
  portfolio: {
    cash: number;
    positions: TPosition[];
    totalRealizedPnl: number;
    totalTrades: number;
    winCount: number;
  };
  unrealizedPnl: number;
}

export function buildEnginePortfolioSummaryArtifact<TPosition>(
  inputs: EnginePortfolioSummaryInputs<TPosition>,
) {
  const { portfolio, unrealizedPnl } = inputs;
  return {
    cash: Number(portfolio.cash.toFixed(4)),
    openPositions: portfolio.positions.length,
    realizedPnl: Number(portfolio.totalRealizedPnl.toFixed(4)),
    totalTrades: portfolio.totalTrades,
    winRatePct: portfolio.totalTrades > 0 ? Number(((portfolio.winCount / portfolio.totalTrades) * 100).toFixed(1)) : null,
    unrealizedPnl: Number(unrealizedPnl.toFixed(4)),
  };
}

export interface EngineSignalHealthInput {
  type: string;
  enabled: boolean;
  weight: number;
  trades: number;
  wins: number;
  avgPnlPct: number;
  perAsset?: Record<string, {
    disabled?: boolean;
  }>;
}

export function buildEngineSignalHealthArtifact<TSignalHealth extends EngineSignalHealthInput>(
  weights: TSignalHealth[],
) {
  return weights.map((weight) => ({
    type: weight.type,
    enabled: weight.enabled,
    weight: Number(weight.weight.toFixed(4)),
    trades: weight.trades,
    wins: weight.wins,
    avgPnlPct: Number(weight.avgPnlPct.toFixed(4)),
    disabledAssets: Object.entries(weight.perAsset ?? {})
      .filter(([, stats]) => stats.disabled)
      .map(([asset]) => asset),
  }));
}

export interface EngineStateArtifactInputs<TDataFreshness, TPortfolio, TOpenPosition, TSignalHealth, TBlockedSummary, TLearningParams> {
  generatedAt?: string;
  dataFreshness: TDataFreshness;
  portfolio: TPortfolio;
  openPositions: TOpenPosition[];
  signalHealth: TSignalHealth[];
  blockedSummary: TBlockedSummary;
  learningParams: TLearningParams;
}

export function buildEngineStateArtifact<TDataFreshness, TPortfolio, TOpenPosition, TSignalHealth, TBlockedSummary, TLearningParams>(
  inputs: EngineStateArtifactInputs<TDataFreshness, TPortfolio, TOpenPosition, TSignalHealth, TBlockedSummary, TLearningParams>,
) {
  return {
    generatedAt: inputs.generatedAt ?? new Date().toISOString(),
    dataFreshness: inputs.dataFreshness,
    portfolio: inputs.portfolio,
    openPositions: inputs.openPositions,
    signalHealth: inputs.signalHealth,
    blockedSummary: inputs.blockedSummary,
    learningParams: inputs.learningParams,
  };
}
