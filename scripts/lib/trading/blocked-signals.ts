export interface BlockedSignalSummaryShadow {
  status: "open" | "resolved" | "cancelled";
  resolvedAt?: string;
  signalType: string;
  asset: string;
  venue: string;
  direction: string;
  blockedReason: string;
  thesis: string;
  position: {
    instrumentLabel?: string;
  };
  trendMetrics?: unknown;
  marketQuality?: {
    flags: string[];
  } & Record<string, unknown>;
  hypotheticalResult?: {
    outcome: "win" | "loss";
    closeReason: string;
    pnlPct: number;
  };
  sourceComparison?: unknown;
  learningExcluded?: unknown;
}

export function summarizeBlockedSignals<TShadow extends BlockedSignalSummaryShadow>(blockedSignals: TShadow[]) {
  const openCount = blockedSignals.filter((shadow) => shadow.status === "open").length;
  const resolved = blockedSignals
    .filter((shadow): shadow is TShadow & {
      hypotheticalResult: NonNullable<TShadow["hypotheticalResult"]>;
      resolvedAt: string;
    } => shadow.status === "resolved" && !!shadow.hypotheticalResult && !!shadow.resolvedAt && !shadow.learningExcluded)
    .sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt));
  const openQualityWarnings = blockedSignals
    .filter((shadow): shadow is TShadow & { marketQuality: NonNullable<TShadow["marketQuality"]> } =>
      shadow.status === "open" && !!shadow.marketQuality && shadow.marketQuality.flags.length > 0)
    .slice(-8)
    .map((shadow) => ({
      signalType: shadow.signalType,
      asset: shadow.asset,
      blockedReason: shadow.blockedReason,
      instrumentLabel: shadow.position.instrumentLabel,
      marketQuality: shadow.marketQuality,
      thesis: shadow.thesis,
    }));

  const bySignal = new Map<string, {
    signalType: string;
    blocked: number;
    resolved: number;
    wouldHaveWon: number;
    wouldHaveLost: number;
    avgPnlPct: number;
  }>();
  for (const shadow of blockedSignals) {
    if (shadow.learningExcluded) continue;
    const row = bySignal.get(shadow.signalType) ?? {
      signalType: shadow.signalType,
      blocked: 0,
      resolved: 0,
      wouldHaveWon: 0,
      wouldHaveLost: 0,
      avgPnlPct: 0,
    };
    row.blocked++;
    if (shadow.hypotheticalResult) {
      row.resolved++;
      if (shadow.hypotheticalResult.outcome === "win") row.wouldHaveWon++;
      else row.wouldHaveLost++;
      row.avgPnlPct = ((row.avgPnlPct * (row.resolved - 1)) + shadow.hypotheticalResult.pnlPct) / row.resolved;
    }
    bySignal.set(shadow.signalType, row);
  }

  return {
    openCount,
    resolvedCount: resolved.length,
    wouldHaveWon: resolved.filter((shadow) => shadow.hypotheticalResult.outcome === "win").length,
    wouldHaveLost: resolved.filter((shadow) => shadow.hypotheticalResult.outcome === "loss").length,
    bySignal: Array.from(bySignal.values())
      .map((row) => ({ ...row, avgPnlPct: Number(row.avgPnlPct.toFixed(2)) }))
      .sort((a, b) => (b.wouldHaveWon - b.wouldHaveLost) - (a.wouldHaveWon - a.wouldHaveLost))
      .slice(0, 8),
    recentResolved: resolved.slice(-8).map((shadow) => ({
      signalType: shadow.signalType,
      asset: shadow.asset,
      venue: shadow.venue,
      direction: shadow.direction,
      blockedReason: shadow.blockedReason,
      outcome: shadow.hypotheticalResult.outcome,
      closeReason: shadow.hypotheticalResult.closeReason,
      pnlPct: shadow.hypotheticalResult.pnlPct,
      resolvedAt: shadow.resolvedAt,
      trendMetrics: shadow.trendMetrics,
      marketQuality: shadow.marketQuality,
      sourceComparison: shadow.sourceComparison,
    })),
    openQualityWarnings,
  };
}
