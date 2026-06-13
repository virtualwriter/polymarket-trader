export interface MechanicalExitCandidateInput<TCloseReason extends string> {
  positionId: string;
  closeReason: TCloseReason | null;
}

export interface MechanicalExitCandidate<TCloseReason extends string> {
  positionId: string;
  reason: TCloseReason;
}

export interface SignalKillPosition {
  id: string;
  signalType: string;
  asset: string;
}

export interface SignalKillWeight {
  type: string;
  enabled: boolean;
  perAsset?: Record<string, { disabled?: boolean }>;
}

export interface SignalKillExitCandidate {
  positionId: string;
  signalType: string;
  asset: string;
}

export function buildMechanicalExitCandidates<TCloseReason extends string>(
  positions: MechanicalExitCandidateInput<TCloseReason>[],
): Array<MechanicalExitCandidate<TCloseReason>> {
  return positions
    .map((position) => position.closeReason ? { positionId: position.positionId, reason: position.closeReason } : null)
    .filter((row): row is MechanicalExitCandidate<TCloseReason> => row !== null);
}

export function buildSignalKillExitCandidates(
  positions: SignalKillPosition[],
  weights: SignalKillWeight[],
): SignalKillExitCandidate[] {
  return positions
    .filter((position) => {
      const weight = weights.find((candidate) => candidate.type === position.signalType);
      const perAsset = weight?.perAsset?.[position.asset];
      return !!weight && (!weight.enabled || perAsset?.disabled === true);
    })
    .map((position) => ({
      positionId: position.id,
      signalType: position.signalType,
      asset: position.asset,
    }));
}
