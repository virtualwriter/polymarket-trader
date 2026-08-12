type BlockedSignalVenue = "polymarket" | "hyperliquid" | "spot";
type BlockedSignalDirection = "long" | "short";
type BlockedSignalReason =
  | "short_blocked_by_positive_trend"
  | "iv_downside_leg_untracked"
  | "manual_shadow_trade"
  | "polymarket_proxy_short"
  | "relative_value_heatmap"
  | "monotonic_arb_shadow"
  | "one_touch_high_edge_shadow"
  | "stale_lottery_ticket_shadow"
  | "weekend_hl_funding_shadow"
  | "no_bias_adjusted_gap_shadow"
  | "live_entry_not_promoted";
type BlockedSignalCloseReason =
  | "target"
  | "stop"
  | "expiry"
  | "data_quality_artifact"
  | "breakeven_stop"
  | "llm_decision"
  | "signal_killed"
  | "thesis_validated"
  | "thesis_validated_profitable"
  | "thesis_compressed_loss";

export interface LegacyManualForceCloseCandidate {
  blockedReason: string;
  hypotheticalResult?: {
    closeReason: string;
    closeTrigger?: string;
  };
}

/**
 * True for a manual shadow closed by the pre-2026-07-10 resolver.
 *
 * Manual shadows have no legitimate edge-compression exit: oneTouchEdgeGapClosed
 * and the NO-bias equivalent both early-return unless the shadow carries their
 * own blockedReason, and the weekend-funding exit is likewise reason-gated. So a
 * manual shadow holding a thesis_* close can only be a legacy record from the
 * resolver that fired on any gate failure, realizing a mid-flight mark rather
 * than the thesis.
 *
 * The Phase 3 backfill stamped closeTrigger on every close it could classify.
 * These are exactly the ones it could not, which is why an absent trigger is
 * the discriminator rather than a hardcoded date.
 */
export function isLegacyManualShadowForceClose(shadow: LegacyManualForceCloseCandidate): boolean {
  if (shadow.blockedReason !== "manual_shadow_trade") return false;
  if (shadow.hypotheticalResult === undefined) return false;
  if (shadow.hypotheticalResult.closeTrigger !== undefined) return false;
  const reason = shadow.hypotheticalResult.closeReason;
  return reason === "thesis_validated"
    || reason === "thesis_validated_profitable"
    || reason === "thesis_compressed_loss";
}

export interface BlockedSignalSummaryShadow {
  status: "open" | "resolved" | "cancelled";
  resolvedAt?: string;
  signalType: string;
  asset: string;
  venue: BlockedSignalVenue;
  direction: BlockedSignalDirection;
  blockedReason: BlockedSignalReason;
  thesis: string;
  position: {
    instrumentLabel?: string;
    instrumentType?: string;
  };
  trendMetrics?: unknown;
  marketQuality?: {
    flags: string[];
  } & Record<string, unknown>;
  hypotheticalResult?: {
    outcome: "win" | "loss";
    closeReason: BlockedSignalCloseReason;
    pnlPct: number;
    closeTrigger?: string;
    closeNote?: string;
  };
  sourceComparison?: unknown;
  learningExcluded?: unknown;
}

export function summarizeBlockedSignals<TShadow extends BlockedSignalSummaryShadow>(blockedSignals: TShadow[]) {
  const reportableSignals = blockedSignals.filter(isReportableShadowLearningSignal);
  const openCount = reportableSignals.filter((shadow) => shadow.status === "open").length;
  const resolved = reportableSignals
    .filter((shadow): shadow is TShadow & {
      hypotheticalResult: NonNullable<TShadow["hypotheticalResult"]>;
      resolvedAt: string;
    } => shadow.status === "resolved" && !!shadow.hypotheticalResult && !!shadow.resolvedAt && !shadow.learningExcluded)
    .sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt));
  const openQualityWarnings = reportableSignals
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
  for (const shadow of reportableSignals) {
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

function isReportableShadowLearningSignal(shadow: BlockedSignalSummaryShadow): boolean {
  return shadow.signalType !== "MONOTONIC_ARB" && shadow.position.instrumentType !== "pm_package";
}

export interface BlockedSignalObservationRow {
  signalType: string;
  resolved: number;
  wouldHaveWon: number;
  wouldHaveLost: number;
  avgPnlPct: number;
}

export interface BlockedSignalObservationSummary {
  bySignal: BlockedSignalObservationRow[];
}

export interface BlockedSignalObservationConfig {
  staleLotteryTicketNoSignal: string;
  oneTouchHighEdgeSignalNo: string;
  oneTouchHighEdgeSignalYes: string;
  oneTouchNoShadowMinSellYesEdgePts: number;
  oneTouchNoShadowMaxSpread: number;
  oneTouchNoShadowMinLiquidity: number;
}

export function buildBlockedSignalObservations(
  summary: BlockedSignalObservationSummary,
  config: BlockedSignalObservationConfig,
): string[] {
  const notes: string[] = [];
  for (const row of summary.bySignal) {
    if (row.resolved < 3) continue;
    if (row.signalType.endsWith("_DOWNSIDE")) {
      // IV divergence missing-leg shadows
      const base = row.signalType.replace("_DOWNSIDE", "");
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${base} missing downside leg is profitable: ${row.wouldHaveWon}/${row.resolved} below-contract shadows would have won. The engine is leaving money on the table by ignoring the downside contract.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${base} missing downside leg is unprofitable: ${row.wouldHaveLost}/${row.resolved} below-contract shadows would have lost. The current upside-only approach appears correct.`);
      } else {
        notes.push(`${base} missing downside leg is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else if (row.signalType.endsWith("_PM_PROXY_SHORT")) {
      const base = row.signalType.replace("_PM_PROXY_SHORT", "");
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${base} Polymarket proxy short is promising: ${row.wouldHaveWon}/${row.resolved} NO-upside proxy shorts would have won, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${base} Polymarket proxy short is weak: ${row.wouldHaveLost}/${row.resolved} NO-upside proxy shorts would have lost, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else {
        notes.push(`${base} Polymarket proxy short is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else if (row.signalType === "MONOTONIC_ARB") {
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`MONOTONIC_ARB setup category is validating: ${row.wouldHaveWon}/${row.resolved} shadow packages settled profitably, avg P&L ${row.avgPnlPct.toFixed(2)}%. Review fee/slippage assumptions before live promotion.`);
      } else if (row.wouldHaveLost > 0) {
        notes.push(`MONOTONIC_ARB setup category has execution/model breaks: ${row.wouldHaveLost}/${row.resolved} shadow packages lost money despite locked-edge screening, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else {
        notes.push(`MONOTONIC_ARB setup category is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadow packages, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else if (row.signalType === config.staleLotteryTicketNoSignal) {
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`STALE_LOTTERY_TICKET_NO shadow is validating: ${row.wouldHaveWon}/${row.resolved} far-OTM NO shadows would have won, avg P&L ${row.avgPnlPct.toFixed(2)}%. The market is repricing stale lottery premium and the shadow is collecting it.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`STALE_LOTTERY_TICKET_NO shadow is weak: ${row.wouldHaveLost}/${row.resolved} far-OTM NO shadows would have lost, avg P&L ${row.avgPnlPct.toFixed(2)}%. Either model touch prob is biased low or PM is pricing tails efficiently.`);
      } else {
        notes.push(`STALE_LOTTERY_TICKET_NO shadow is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else if (row.signalType === config.oneTouchHighEdgeSignalNo || row.signalType === config.oneTouchHighEdgeSignalYes) {
      const side = row.signalType === config.oneTouchHighEdgeSignalNo ? "NO-only sell-YES-edge" : "YES exploratory";
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${side} one-touch shadow is validating: ${row.wouldHaveWon}/${row.resolved} shadows won, avg P&L ${row.avgPnlPct.toFixed(2)}%. For new touch-market shadows, keep NO-only, sell_yes_edge_pts >= ${config.oneTouchNoShadowMinSellYesEdgePts}, spread <= ${(config.oneTouchNoShadowMaxSpread * 100).toFixed(0)}c, liquidity >= ${config.oneTouchNoShadowMinLiquidity}, and exit when edge disappears.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${side} one-touch shadow is weak: ${row.wouldHaveLost}/${row.resolved} shadows lost, avg P&L ${row.avgPnlPct.toFixed(2)}%. Do not promote YES contracts or sell_yes_edge_pts < ${config.oneTouchNoShadowMinSellYesEdgePts}; continue bucketing NO edge size before sizing from edge magnitude.`);
      } else {
        notes.push(`${side} one-touch shadow is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%). Use edge as a gate, not a sizing multiplier, until edge-size buckets have more data.`);
      }
    } else if (row.signalType.startsWith("USER_")) {
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${row.signalType} manual shadow signal is promising: ${row.wouldHaveWon}/${row.resolved} shadows would have won, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${row.signalType} manual shadow signal is weak: ${row.wouldHaveLost}/${row.resolved} shadows would have lost, avg P&L ${row.avgPnlPct.toFixed(2)}%.`);
      } else {
        notes.push(`${row.signalType} manual shadow signal is inconclusive (${row.wouldHaveWon}W/${row.wouldHaveLost}L across ${row.resolved} resolved shadows, avg P&L ${row.avgPnlPct.toFixed(2)}%).`);
      }
    } else {
      // Trend-blocked shadows
      if (row.wouldHaveWon >= row.wouldHaveLost + 2) {
        notes.push(`${row.signalType} trend filter may be too strict: ${row.wouldHaveWon}/${row.resolved} blocked trades would have won.`);
      } else if (row.wouldHaveLost >= row.wouldHaveWon + 2) {
        notes.push(`${row.signalType} trend filter is avoiding losses: ${row.wouldHaveLost}/${row.resolved} blocked trades would have lost.`);
      }
    }
  }
  return notes;
}
