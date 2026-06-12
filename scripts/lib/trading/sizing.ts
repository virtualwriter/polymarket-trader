export interface BinaryKellyInputs {
  entryPrice: number;
  winProbability: number;
}

export interface BinaryPositionSizingInputs extends BinaryKellyInputs {
  bankroll: number;
  availableCash: number;
  minSize: number;
  maxSize: number;
  kellyFraction?: number;
  confidence?: number;
  maxBankrollFraction?: number;
}

export interface BinaryPositionSizing {
  size: number;
  edgePts: number;
  rawKellyFraction: number;
  adjustedKellyFraction: number;
  cappedKellyFraction: number;
  reason: "positive_edge" | "non_positive_edge" | "below_min_size" | "invalid_input" | "no_cash";
}

export type SizingProbabilitySource =
  | "calibration_bucket"
  | "signal_asset_history"
  | "signal_family_history"
  | "signal_confidence_fallback"
  | "unsupported";

export interface SizingCalibrationBucket {
  signalType: string;
  asset?: string;
  n: number;
  winRate: number;
  label?: string;
}

export interface SizingSignalHistory {
  signalType: string;
  trades: number;
  wins: number;
  perAsset?: Record<string, {
    trades: number;
    wins: number;
  }>;
}

export interface SizingProbabilityInputs {
  signalType: string;
  asset: string;
  fallbackConfidence: number;
  calibrationBuckets?: SizingCalibrationBucket[];
  signalHistories?: SizingSignalHistory[];
  minCalibrationEvents?: number;
  minAssetHistoryTrades?: number;
  minSignalHistoryTrades?: number;
}

export interface SizingProbabilityResolution {
  probability: number | null;
  source: SizingProbabilitySource;
  sampleSize: number | null;
  notes: string[];
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function binaryKellyFraction(inputs: BinaryKellyInputs): number | null {
  const { entryPrice, winProbability } = inputs;
  if (!Number.isFinite(entryPrice) || !Number.isFinite(winProbability)) return null;
  if (entryPrice <= 0 || entryPrice >= 1 || winProbability < 0 || winProbability > 1) return null;
  return Math.max(0, (winProbability - entryPrice) / (1 - entryPrice));
}

export function sizeBinaryPosition(inputs: BinaryPositionSizingInputs): BinaryPositionSizing {
  const kelly = binaryKellyFraction(inputs);
  const edgePts = Number.isFinite(inputs.winProbability) && Number.isFinite(inputs.entryPrice)
    ? (inputs.winProbability - inputs.entryPrice) * 100
    : 0;

  if (
    kelly === null
    || !finitePositive(inputs.bankroll)
    || !finitePositive(inputs.minSize)
    || !finitePositive(inputs.maxSize)
    || inputs.maxSize < inputs.minSize
  ) {
    return {
      size: 0,
      edgePts,
      rawKellyFraction: 0,
      adjustedKellyFraction: 0,
      cappedKellyFraction: 0,
      reason: "invalid_input",
    };
  }

  if (!finitePositive(inputs.availableCash)) {
    return {
      size: 0,
      edgePts,
      rawKellyFraction: kelly,
      adjustedKellyFraction: 0,
      cappedKellyFraction: 0,
      reason: "no_cash",
    };
  }

  if (kelly <= 0) {
    return {
      size: 0,
      edgePts,
      rawKellyFraction: 0,
      adjustedKellyFraction: 0,
      cappedKellyFraction: 0,
      reason: "non_positive_edge",
    };
  }

  const confidence = clamp(inputs.confidence ?? 1, 0, 1);
  const kellyFraction = clamp(inputs.kellyFraction ?? 0.5, 0, 1);
  const maxBankrollFraction = clamp(inputs.maxBankrollFraction ?? 0.03, 0, 1);
  const adjustedKellyFraction = kelly * kellyFraction * confidence;
  const cappedKellyFraction = Math.min(adjustedKellyFraction, maxBankrollFraction);
  const rawSize = inputs.bankroll * cappedKellyFraction;

  if (rawSize < inputs.minSize) {
    return {
      size: 0,
      edgePts,
      rawKellyFraction: kelly,
      adjustedKellyFraction,
      cappedKellyFraction,
      reason: "below_min_size",
    };
  }

  return {
    size: Number(Math.min(rawSize, inputs.maxSize, inputs.availableCash).toFixed(4)),
    edgePts,
    rawKellyFraction: kelly,
    adjustedKellyFraction,
    cappedKellyFraction,
    reason: "positive_edge",
  };
}

function validProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function smoothedWinRate(wins: number, trades: number): number {
  return (wins + 1) / (trades + 2);
}

function usableCalibrationBucket(
  bucket: SizingCalibrationBucket | undefined,
  minEvents: number,
): bucket is SizingCalibrationBucket {
  return !!bucket && bucket.n >= minEvents && validProbability(bucket.winRate);
}

export function resolveSizingProbability(inputs: SizingProbabilityInputs): SizingProbabilityResolution {
  const minCalibrationEvents = Math.max(1, Math.floor(inputs.minCalibrationEvents ?? 5));
  const minAssetHistoryTrades = Math.max(1, Math.floor(inputs.minAssetHistoryTrades ?? 5));
  const minSignalHistoryTrades = Math.max(1, Math.floor(inputs.minSignalHistoryTrades ?? 10));
  const notes: string[] = [];

  const exactCalibration = inputs.calibrationBuckets?.find((bucket) =>
    bucket.signalType === inputs.signalType && bucket.asset === inputs.asset);
  const exactCalibrationN = exactCalibration?.n;
  if (usableCalibrationBucket(exactCalibration, minCalibrationEvents)) {
    return {
      probability: exactCalibration.winRate,
      source: "calibration_bucket",
      sampleSize: exactCalibration.n,
      notes: [`Using resolved calibration bucket${exactCalibration.label ? ` (${exactCalibration.label})` : ""}: n=${exactCalibration.n}, win_rate=${(exactCalibration.winRate * 100).toFixed(1)}%.`],
    };
  }
  if (exactCalibrationN !== undefined) notes.push(`Ignored asset calibration bucket n=${exactCalibrationN}; need >=${minCalibrationEvents}.`);

  const familyCalibration = inputs.calibrationBuckets?.find((bucket) =>
    bucket.signalType === inputs.signalType && !bucket.asset);
  const familyCalibrationN = familyCalibration?.n;
  if (usableCalibrationBucket(familyCalibration, minCalibrationEvents)) {
    return {
      probability: familyCalibration.winRate,
      source: "calibration_bucket",
      sampleSize: familyCalibration.n,
      notes: [`Using resolved calibration bucket${familyCalibration.label ? ` (${familyCalibration.label})` : ""}: n=${familyCalibration.n}, win_rate=${(familyCalibration.winRate * 100).toFixed(1)}%.`],
    };
  }
  if (familyCalibrationN !== undefined) notes.push(`Ignored signal calibration bucket n=${familyCalibrationN}; need >=${minCalibrationEvents}.`);

  const history = inputs.signalHistories?.find((candidate) => candidate.signalType === inputs.signalType);
  const assetHistory = history?.perAsset?.[inputs.asset];
  if (assetHistory && assetHistory.trades >= minAssetHistoryTrades) {
    return {
      probability: smoothedWinRate(assetHistory.wins, assetHistory.trades),
      source: "signal_asset_history",
      sampleSize: assetHistory.trades,
      notes: [`Using smoothed signal/asset win rate: ${assetHistory.wins}/${assetHistory.trades}.`],
    };
  }
  if (assetHistory) notes.push(`Ignored signal/asset history ${assetHistory.wins}/${assetHistory.trades}; need >=${minAssetHistoryTrades} trades.`);

  if (history && history.trades >= minSignalHistoryTrades) {
    return {
      probability: smoothedWinRate(history.wins, history.trades),
      source: "signal_family_history",
      sampleSize: history.trades,
      notes: [`Using smoothed signal-family win rate: ${history.wins}/${history.trades}.`],
    };
  }
  if (history) notes.push(`Ignored signal-family history ${history.wins}/${history.trades}; need >=${minSignalHistoryTrades} trades.`);

  if (validProbability(inputs.fallbackConfidence)) {
    return {
      probability: inputs.fallbackConfidence,
      source: "signal_confidence_fallback",
      sampleSize: null,
      notes: [...notes, "Falling back to signal.confidence because no sufficiently sampled calibration/history probability is available."],
    };
  }

  return {
    probability: null,
    source: "unsupported",
    sampleSize: null,
    notes: [...notes, "No valid probability source is available."],
  };
}
