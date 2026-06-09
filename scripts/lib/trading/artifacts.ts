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
