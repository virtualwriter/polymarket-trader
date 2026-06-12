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
