import { oneSidedTPValue } from "../research/alpha-stats.js";

export interface SetupIdentifier {
  setupId: string;
  setupLabel: string;
}

export interface SignalSetupLabelConfig {
  oneTouchHighEdgeSignalNo: string;
  oneTouchHighEdgeSignalYes: string;
  staleLotteryTicketNoSignal: string;
}

export interface SetupTruthEvidenceSummary {
  cleanTrades: number;
  tradeWins: number;
  avgTradePnlPct: number;
  resolvedShadows: number;
  shadowWins: number;
  avgShadowPnlPct: number;
  hypothesisTests: number;
  /**
   * Sample standard deviations of per-trade P&L. Present only for records built
   * after expectancy-aware promotion landed; when absent the status falls back
   * to the win-rate rule alone.
   */
  tradePnlStdPct?: number;
  shadowPnlStdPct?: number;
}

export interface SetupTruthRecordForStatus {
  setupLabel: string;
  status: "needs_more_data" | "exploratory" | "validating" | "eligible_live" | "disabled" | "contaminated_retest";
  currentConclusion: string;
  knownInvalidAssumptions: string[];
  evidenceSummary: SetupTruthEvidenceSummary;
}

export interface SetupTruthStatusThresholds {
  killThreshold: number;
  promoteThreshold: number;
  /**
   * Significance required to call a family eligible on realized edge alone.
   * Defaults to 0.01 when omitted.
   */
  expectancyAlpha?: number;
  /** Minimum sample before the expectancy route is allowed. */
  expectancyMinSamples?: number;
}

const DEFAULT_EXPECTANCY_ALPHA = 0.01;
const DEFAULT_EXPECTANCY_MIN_SAMPLES = 30;

export function slugifySetupId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function setupIdForSignalType(signalType: string, config: SignalSetupLabelConfig): SetupIdentifier {
  if (signalType === config.oneTouchHighEdgeSignalNo) {
    return { setupId: "one_touch_high_edge_no", setupLabel: "One-touch NO sell-YES edge" };
  }
  if (signalType === config.oneTouchHighEdgeSignalYes) {
    return { setupId: "one_touch_high_edge_yes_exploratory", setupLabel: "One-touch high-edge YES exploratory" };
  }
  if (signalType === config.staleLotteryTicketNoSignal) {
    return { setupId: "stale_lottery_ticket_no", setupLabel: "Stale lottery ticket NO" };
  }
  if (signalType.includes("USER_PM_IV_TOUCH_CHEAP_YES")) {
    return { setupId: "manual_iv_touch_cheap_yes", setupLabel: "Manual IV-touch cheap YES" };
  }
  if (signalType.includes("USER_PM_IV_TOUCH_RICH_NO")) {
    return { setupId: "manual_iv_touch_rich_no", setupLabel: "Manual IV-touch rich NO" };
  }
  if (signalType === "MONOTONIC_ARB") {
    return { setupId: "monotonic_arb", setupLabel: "Monotonic arb" };
  }
  const setupLabel = signalType
    .replace(/_PM_PROXY_SHORT$/, " Polymarket proxy short")
    .replace(/_DOWNSIDE$/, " downside leg")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  return { setupId: slugifySetupId(signalType), setupLabel };
}

export function buildTruthConclusion(record: SetupTruthRecordForStatus): string {
  const e = record.evidenceSummary;
  const tradeRate = e.cleanTrades > 0 ? `${e.tradeWins}/${e.cleanTrades}` : "no clean live trades";
  const shadowRate = e.resolvedShadows > 0 ? `${e.shadowWins}/${e.resolvedShadows}` : "no resolved shadows";
  if (record.status === "contaminated_retest") {
    return `${record.setupLabel} is under clean retest: contaminated or superseded historical evidence is excluded. Clean live trades: ${tradeRate}, avg P&L ${e.avgTradePnlPct.toFixed(2)}%; shadows: ${shadowRate}.`;
  }
  if (record.status === "eligible_live") {
    return `${record.setupLabel} is eligible for live consideration based on grouped setup-family evidence. Clean live trades: ${tradeRate}, avg P&L ${e.avgTradePnlPct.toFixed(2)}%; shadows: ${shadowRate}.`;
  }
  if (record.status === "disabled") {
    return `${record.setupLabel} is disabled or weak on current clean evidence. Clean live trades: ${tradeRate}, avg P&L ${e.avgTradePnlPct.toFixed(2)}%; shadows: ${shadowRate}.`;
  }
  if (record.status === "validating") {
    return `${record.setupLabel} is validating but still sample-size sensitive. Clean live trades: ${tradeRate}, avg P&L ${e.avgTradePnlPct.toFixed(2)}%; shadows: ${shadowRate}.`;
  }
  return `${record.setupLabel} remains exploratory. Clean live trades: ${tradeRate}, avg P&L ${e.avgTradePnlPct.toFixed(2)}%; shadows: ${shadowRate}.`;
}

/**
 * True when a family's realized edge is significantly positive.
 *
 * The win-rate route alone cannot see a strategy that is right 57% of the time
 * but makes money because its winners dwarf its losers — the gated one-touch
 * cohort is exactly that shape, and a 65% win-rate bar would reject it forever.
 */
function expectancyIsSignificant(
  samples: number,
  meanPct: number,
  stdPct: number | undefined,
  thresholds: SetupTruthStatusThresholds,
): boolean {
  const alpha = thresholds.expectancyAlpha ?? DEFAULT_EXPECTANCY_ALPHA;
  const minSamples = thresholds.expectancyMinSamples ?? DEFAULT_EXPECTANCY_MIN_SAMPLES;
  if (stdPct === undefined || samples < minSamples || meanPct <= 0) return false;
  const p = oneSidedTPValue(meanPct, stdPct, samples);
  return p !== null && p < alpha;
}

export function finalizeSetupTruthRecord<TRecord extends SetupTruthRecordForStatus>(
  record: TRecord,
  thresholds: SetupTruthStatusThresholds,
): TRecord {
  const e = record.evidenceSummary;
  const tradeWinRate = e.cleanTrades > 0 ? e.tradeWins / e.cleanTrades : null;
  const shadowWinRate = e.resolvedShadows > 0 ? e.shadowWins / e.resolvedShadows : null;
  const profitableOnEdge = expectancyIsSignificant(e.cleanTrades, e.avgTradePnlPct, e.tradePnlStdPct, thresholds)
    || expectancyIsSignificant(e.resolvedShadows, e.avgShadowPnlPct, e.shadowPnlStdPct, thresholds);
  // Same test mirrored: a family can be nominally right often enough while
  // still losing money, and that should disable it rather than be ignored.
  const unprofitableOnEdge = expectancyIsSignificant(e.cleanTrades, -e.avgTradePnlPct, e.tradePnlStdPct, thresholds)
    || expectancyIsSignificant(e.resolvedShadows, -e.avgShadowPnlPct, e.shadowPnlStdPct, thresholds);
  if (record.knownInvalidAssumptions.length > 0 && e.cleanTrades + e.resolvedShadows < 10) {
    record.status = "contaminated_retest";
  } else if (
    (e.cleanTrades >= 5 && tradeWinRate !== null && tradeWinRate < thresholds.killThreshold)
    || (e.cleanTrades >= 10 && e.avgTradePnlPct < -1)
    || unprofitableOnEdge
  ) {
    record.status = "disabled";
  } else if (
    (e.cleanTrades >= 5 && tradeWinRate !== null && tradeWinRate >= thresholds.promoteThreshold && e.avgTradePnlPct > 0)
    || (e.resolvedShadows >= 10 && shadowWinRate !== null && shadowWinRate >= thresholds.promoteThreshold && e.avgShadowPnlPct > 0)
    || profitableOnEdge
  ) {
    record.status = "eligible_live";
  } else if (e.cleanTrades + e.resolvedShadows + e.hypothesisTests >= 5) {
    record.status = "validating";
  } else {
    record.status = "exploratory";
  }
  record.currentConclusion = buildTruthConclusion(record);
  return record;
}
