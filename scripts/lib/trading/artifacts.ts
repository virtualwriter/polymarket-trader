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
