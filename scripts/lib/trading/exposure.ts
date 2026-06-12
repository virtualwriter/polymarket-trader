export type ExposureDirection = "long" | "short";
export type ExposureVenue = "polymarket" | "hyperliquid" | "spot";

export interface ExposurePosition {
  asset: string;
  venue: ExposureVenue;
  direction: ExposureDirection;
  signalType: string;
  size: number;
  leverage?: number | null;
}

export interface ExposureCandidate extends ExposurePosition {
  candidateId?: string;
}

export interface ExposureSnapshot {
  totalGross: number;
  totalNet: number;
  byAsset: Record<string, number>;
  bySignalType: Record<string, number>;
  byVenue: Record<string, number>;
  byCluster: Record<string, number>;
}

export interface PortfolioExposurePreview {
  candidateId: string;
  asset: string;
  venue: ExposureVenue;
  direction: ExposureDirection;
  signalType: string;
  candidateSize: number;
  riskClusters: string[];
  current: ExposureSnapshot;
  afterCandidate: ExposureSnapshot;
  warnings: string[];
}

export interface PortfolioExposurePreviewInputs {
  positions: ExposurePosition[];
  candidates: ExposureCandidate[];
  maxClusterAbsExposure?: number;
}

function roundExposure(value: number): number {
  return Number(value.toFixed(4));
}

function signedExposure(item: ExposurePosition): number {
  const multiplier = item.direction === "long" ? 1 : -1;
  const leverage = item.leverage && Number.isFinite(item.leverage) ? item.leverage : 1;
  return item.size * leverage * multiplier;
}

function addExposure(target: Record<string, number>, key: string, value: number): void {
  target[key] = roundExposure((target[key] ?? 0) + value);
}

export function riskClustersForExposure(item: Pick<ExposurePosition, "asset" | "venue" | "signalType">): string[] {
  const asset = item.asset.toUpperCase();
  const signalType = item.signalType.toUpperCase();
  const clusters = new Set<string>([
    `${asset.toLowerCase()}_delta`,
    `${item.venue}_venue`,
  ]);

  if (["BTC", "ETH", "SOL", "HYPE", "AMZN"].includes(asset)) clusters.add("risk_on");
  if (["GOLD", "OIL", "SILVER"].includes(asset)) clusters.add("commodity");
  if (item.venue === "polymarket") clusters.add("polymarket_binary");
  if (signalType.includes("ONE_TOUCH") || signalType.includes("NO_BIAS")) clusters.add("polymarket_touch_no");
  if (signalType.includes("FUNDING")) clusters.add("funding_reversion");
  if (signalType.includes("PC_RATIO")) clusters.add("options_sentiment");
  if (signalType.includes("MONOTONIC_ARB")) clusters.add("monotonic_arb");

  return Array.from(clusters).sort();
}

export function buildExposureSnapshot(items: ExposurePosition[]): ExposureSnapshot {
  const snapshot: ExposureSnapshot = {
    totalGross: 0,
    totalNet: 0,
    byAsset: {},
    bySignalType: {},
    byVenue: {},
    byCluster: {},
  };

  for (const item of items) {
    const exposure = signedExposure(item);
    snapshot.totalGross += Math.abs(exposure);
    snapshot.totalNet += exposure;
    addExposure(snapshot.byAsset, item.asset, exposure);
    addExposure(snapshot.bySignalType, item.signalType, exposure);
    addExposure(snapshot.byVenue, item.venue, exposure);
    for (const cluster of riskClustersForExposure(item)) {
      addExposure(snapshot.byCluster, cluster, exposure);
    }
  }

  snapshot.totalGross = roundExposure(snapshot.totalGross);
  snapshot.totalNet = roundExposure(snapshot.totalNet);
  return snapshot;
}

export function buildPortfolioExposurePreviews(inputs: PortfolioExposurePreviewInputs): PortfolioExposurePreview[] {
  const maxClusterAbsExposure = inputs.maxClusterAbsExposure ?? 5;
  const current = buildExposureSnapshot(inputs.positions);

  return inputs.candidates.map((candidate, index) => {
    const riskClusters = riskClustersForExposure(candidate);
    const afterCandidate = buildExposureSnapshot([...inputs.positions, candidate]);
    const candidateId = candidate.candidateId ?? `${candidate.signalType}:${candidate.asset}:${index}`;
    const warnings: string[] = [];
    const currentAssetExposure = current.byAsset[candidate.asset] ?? 0;
    const afterAssetExposure = afterCandidate.byAsset[candidate.asset] ?? 0;
    if (Math.abs(afterAssetExposure) > Math.abs(currentAssetExposure) && Math.abs(currentAssetExposure) > 0) {
      warnings.push(`${candidate.asset} exposure increases from ${currentAssetExposure.toFixed(4)} to ${afterAssetExposure.toFixed(4)}.`);
    }

    for (const cluster of riskClusters) {
      const before = current.byCluster[cluster] ?? 0;
      const after = afterCandidate.byCluster[cluster] ?? 0;
      if (Math.abs(after) > Math.abs(before) && Math.abs(before) > 0) {
        warnings.push(`${cluster} cluster exposure increases from ${before.toFixed(4)} to ${after.toFixed(4)}.`);
      }
      if (Math.abs(after) > maxClusterAbsExposure) {
        warnings.push(`${cluster} cluster exposure ${after.toFixed(4)} exceeds preview threshold ${maxClusterAbsExposure.toFixed(4)}.`);
      }
    }

    return {
      candidateId,
      asset: candidate.asset,
      venue: candidate.venue,
      direction: candidate.direction,
      signalType: candidate.signalType,
      candidateSize: roundExposure(candidate.size),
      riskClusters,
      current,
      afterCandidate,
      warnings,
    };
  });
}
