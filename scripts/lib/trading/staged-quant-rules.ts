import type { CandidateSizingPreview } from "./candidate-actions.js";
import type { PortfolioExposurePreview } from "./exposure.js";

export type StagedQuantRuleMode = "observe_uniform" | "apply_sizing_preview";

export interface StagedQuantRuleConfig {
  mode: StagedQuantRuleMode;
  tradeSize: number;
  liveSizingEnabled: boolean;
  minEdgePts: number;
  maxExposureAlertAbs: number;
}

export interface StagedQuantRulePreview {
  candidateId: string;
  signalType: string;
  asset: string;
  mode: StagedQuantRuleMode;
  liveSizingEnabled: boolean;
  currentFlatSize: number;
  previewSize: number;
  enforcedLiveSize: number;
  wouldResize: boolean;
  edgePts: number | null;
  alerts: string[];
  notes: string[];
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function maxAbsClusterExposure(exposure: PortfolioExposurePreview | undefined): number {
  if (!exposure) return 0;
  return Math.max(0, ...Object.values(exposure.afterCandidate.byCluster).map((value) => Math.abs(value)));
}

export function buildStagedQuantRulePreviews(inputs: {
  sizingPreviews: readonly CandidateSizingPreview[];
  exposurePreviews: readonly PortfolioExposurePreview[];
  config: StagedQuantRuleConfig;
}): StagedQuantRulePreview[] {
  const { sizingPreviews, exposurePreviews, config } = inputs;
  return sizingPreviews.map((sizing, index) => {
    const exposure = exposurePreviews[index];
    const alerts: string[] = [];
    const edgePts = sizing.edgePts;
    if (edgePts !== null && edgePts < config.minEdgePts) {
      alerts.push(`edge ${edgePts.toFixed(2)}pt < staged min ${config.minEdgePts.toFixed(2)}pt`);
    }
    const maxClusterAbsExposure = maxAbsClusterExposure(exposure);
    if (maxClusterAbsExposure > config.maxExposureAlertAbs) {
      alerts.push(`cluster exposure ${maxClusterAbsExposure.toFixed(2)} > alert cap ${config.maxExposureAlertAbs.toFixed(2)}`);
    }
    alerts.push(...(exposure?.warnings ?? []));

    const enabledSize = config.mode === "apply_sizing_preview" && config.liveSizingEnabled
      ? sizing.previewSize
      : config.tradeSize;
    const enforcedLiveSize = rounded(enabledSize);
    const wouldResize = rounded(sizing.previewSize) !== rounded(config.tradeSize);

    return {
      candidateId: exposure?.candidateId ?? `${sizing.signalType}:${sizing.asset}:${index}`,
      signalType: sizing.signalType,
      asset: sizing.asset,
      mode: config.mode,
      liveSizingEnabled: config.liveSizingEnabled,
      currentFlatSize: rounded(config.tradeSize),
      previewSize: rounded(sizing.previewSize),
      enforcedLiveSize,
      wouldResize,
      edgePts,
      alerts,
      notes: [
        config.liveSizingEnabled
          ? "Live sizing switch is enabled; apply_sizing_preview mode may change future entry size."
          : "Live sizing switch is disabled; entries remain uniform at TRADE_SIZE while previews are observed.",
      ],
    };
  });
}
