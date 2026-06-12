import {
  buildPortfolioExposurePreviews,
  type ExposureDirection,
  type ExposurePosition,
  type ExposureVenue,
  type PortfolioExposurePreview,
} from "./exposure.js";
import {
  resolveSizingProbability,
  sizeBinaryPosition,
  type SizingCalibrationBucket,
  type SizingSignalHistory,
} from "./sizing.js";

export interface CandidatePreviewSignal {
  type: string;
  asset: string;
  venue: ExposureVenue;
  direction: ExposureDirection;
  entryPrice: number;
  confidence: number;
  leverage?: number;
}

export interface CandidatePreviewPortfolio {
  cash: number;
  positions: ExposurePosition[];
}

export interface CandidatePreviewWeight {
  type: string;
  trades: number;
  wins: number;
  perAsset?: Record<string, { trades: number; wins: number }>;
}

export interface CandidateSizingPreviewConfig {
  tradeSize: number;
  maxBankroll: number;
  minSize: number;
  maxSize: number;
  kellyFraction: number;
  maxBankrollFraction: number;
  minCalibrationEvents: number;
  minAssetHistoryTrades: number;
  minSignalHistoryTrades: number;
}

export interface CandidateSizingPreview {
  signalType: string;
  asset: string;
  venue: string;
  direction: string;
  currentFlatSize: number;
  previewSize: number;
  reason: string;
  entryPrice: number;
  probabilitySource: string;
  winProbability: number | null;
  probabilitySampleSize: number | null;
  edgePts: number | null;
  rawKellyFraction: number | null;
  adjustedKellyFraction: number | null;
  cappedKellyFraction: number | null;
  notes: string[];
}

export function sizingSignalHistories(weights: CandidatePreviewWeight[]): SizingSignalHistory[] {
  return weights.map((weight) => ({
    signalType: weight.type,
    trades: weight.trades,
    wins: weight.wins,
    perAsset: Object.fromEntries(Object.entries(weight.perAsset ?? {}).map(([asset, stats]) => [
      asset,
      { trades: stats.trades, wins: stats.wins },
    ])),
  }));
}

export function buildCandidateSizingPreview(inputs: {
  signal: CandidatePreviewSignal;
  portfolio: Pick<CandidatePreviewPortfolio, "cash">;
  calibrationBuckets: SizingCalibrationBucket[];
  signalHistories: SizingSignalHistory[];
  config: CandidateSizingPreviewConfig;
}): CandidateSizingPreview {
  const { signal, portfolio, calibrationBuckets, signalHistories, config } = inputs;
  const isBinaryPolymarket = signal.venue === "polymarket" && signal.entryPrice > 0 && signal.entryPrice < 1;
  const notes = [
    "Preview only: live entries still use TRADE_SIZE until an intentional fixture-gated sizing change is accepted.",
  ];
  if (!isBinaryPolymarket) {
    notes.push("Unsupported by binary Kelly preview because the candidate is not a probability-priced Polymarket entry.");
    return {
      signalType: signal.type,
      asset: signal.asset,
      venue: signal.venue,
      direction: signal.direction,
      currentFlatSize: config.tradeSize,
      previewSize: 0,
      reason: "unsupported_signal",
      entryPrice: Number(signal.entryPrice.toFixed(6)),
      probabilitySource: "unsupported",
      winProbability: null,
      probabilitySampleSize: null,
      edgePts: null,
      rawKellyFraction: null,
      adjustedKellyFraction: null,
      cappedKellyFraction: null,
      notes,
    };
  }

  const probability = resolveSizingProbability({
    signalType: signal.type,
    asset: signal.asset,
    fallbackConfidence: signal.confidence,
    calibrationBuckets,
    signalHistories,
    minCalibrationEvents: config.minCalibrationEvents,
    minAssetHistoryTrades: config.minAssetHistoryTrades,
    minSignalHistoryTrades: config.minSignalHistoryTrades,
  });
  notes.push(...probability.notes);
  const sizing = sizeBinaryPosition({
    bankroll: config.maxBankroll,
    availableCash: portfolio.cash,
    minSize: config.minSize,
    maxSize: config.maxSize,
    entryPrice: signal.entryPrice,
    winProbability: probability.probability ?? Number.NaN,
    kellyFraction: config.kellyFraction,
    maxBankrollFraction: config.maxBankrollFraction,
  });

  return {
    signalType: signal.type,
    asset: signal.asset,
    venue: signal.venue,
    direction: signal.direction,
    currentFlatSize: config.tradeSize,
    previewSize: sizing.size,
    reason: sizing.reason,
    entryPrice: Number(signal.entryPrice.toFixed(6)),
    probabilitySource: probability.source,
    winProbability: probability.probability === null ? null : Number(probability.probability.toFixed(6)),
    probabilitySampleSize: probability.sampleSize,
    edgePts: Number(sizing.edgePts.toFixed(4)),
    rawKellyFraction: Number(sizing.rawKellyFraction.toFixed(6)),
    adjustedKellyFraction: Number(sizing.adjustedKellyFraction.toFixed(6)),
    cappedKellyFraction: Number(sizing.cappedKellyFraction.toFixed(6)),
    notes,
  };
}

export function buildCandidateActionPreviews(inputs: {
  portfolio: CandidatePreviewPortfolio;
  signals: CandidatePreviewSignal[];
  calibrationBuckets: SizingCalibrationBucket[];
  signalHistories: SizingSignalHistory[];
  sizingConfig: CandidateSizingPreviewConfig;
  maxClusterAbsExposure: number;
}): {
  sizingPreviews: CandidateSizingPreview[];
  portfolioExposurePreviews: PortfolioExposurePreview[];
} {
  const sizingPreviews = inputs.signals.map((signal) => buildCandidateSizingPreview({
    signal,
    portfolio: inputs.portfolio,
    calibrationBuckets: inputs.calibrationBuckets,
    signalHistories: inputs.signalHistories,
    config: inputs.sizingConfig,
  }));
  const portfolioExposurePreviews = buildPortfolioExposurePreviews({
    positions: inputs.portfolio.positions,
    candidates: inputs.signals.map((signal, index) => ({
      candidateId: `${signal.type}:${signal.asset}:${index}`,
      asset: signal.asset,
      venue: signal.venue,
      direction: signal.direction,
      signalType: signal.type,
      size: sizingPreviews[index]?.previewSize ?? 0,
      leverage: signal.leverage,
    })),
    maxClusterAbsExposure: inputs.maxClusterAbsExposure,
  });
  return { sizingPreviews, portfolioExposurePreviews };
}
