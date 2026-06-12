export interface JournalClosedTrade {
  asset: string;
  direction: string;
  venue: string;
  instrumentType?: string;
  instrumentLabel?: string;
  signalType: string;
  closeReason: string;
  pnl: number;
  pnlPct: number;
  marketPnl?: number;
  fundingPnl?: number;
}

export interface JournalOpenedPosition {
  asset: string;
  direction: string;
  venue: string;
  instrumentType?: string;
  instrumentLabel?: string;
  signalType: string;
  entryPrice: number;
}

export interface JournalPortfolio {
  cash: number;
  positions: unknown[];
  totalRealizedPnl: number;
  totalTrades: number;
  winCount: number;
}

export interface JournalStatObservation {
  type: string;
  description: string;
}

export interface JournalBlockedSummary {
  openCount: number;
  resolvedCount: number;
  wouldHaveWon: number;
  wouldHaveLost: number;
  recentResolved: Array<{
    outcome: "win" | "loss";
    blockedReason: string;
    signalType: string;
    asset: string;
    direction: string;
    venue: string;
    closeReason: string;
    pnlPct: number;
  }>;
}

const TRADE_SIZE_FOR_JOURNAL = 1;

function humanCloseReason(reason: string): string {
  switch (reason) {
    case "target": return "hit target";
    case "stop": return "hit stop";
    case "breakeven_stop": return "stopped at breakeven";
    case "expiry": return "expired";
    case "llm_decision": return "closed by LLM";
    case "signal_killed": return "closed because signal was killed";
    case "thesis_validated": return "closed with thesis validated (near-money repriced)";
    case "thesis_validated_profitable": return "closed with thesis validated profitably";
    case "thesis_compressed_loss": return "edge compressed but trade lost money";
    case "data_quality_artifact": return "closed as data-quality artifact (excluded from learning)";
    default: return reason;
  }
}

function blockedReasonLabel(reason: string): string {
  switch (reason) {
    case "iv_downside_leg_untracked": return "Missing downside leg";
    case "polymarket_proxy_short": return "PM proxy short";
    case "relative_value_heatmap": return "Relative-value heatmap";
    case "one_touch_high_edge_shadow": return "One-touch high-edge";
    case "stale_lottery_ticket_shadow": return "Stale lottery NO";
    case "manual_shadow_trade": return "Manual shadow";
    default: return "Blocked";
  }
}

export function portfolioJournalSection(portfolio: JournalPortfolio): string[] {
  const winRate = portfolio.totalTrades > 0 ? ((portfolio.winCount / portfolio.totalTrades) * 100).toFixed(0) : "N/A";
  return [
    `**Portfolio:** $${(portfolio.cash + portfolio.positions.length * TRADE_SIZE_FOR_JOURNAL).toFixed(2)} total | Cash $${portfolio.cash.toFixed(2)} | ${portfolio.positions.length} open | P&L $${portfolio.totalRealizedPnl.toFixed(4)} | ${winRate}% win rate (${portfolio.totalTrades} trades)`,
    "",
  ];
}

export function closedTradesJournalSection(closedTrades: JournalClosedTrade[]): string[] {
  if (closedTrades.length === 0) return [];
  const lines = [`**Closed ${closedTrades.length} trades:**`];
  for (const t of closedTrades) {
    const emoji = t.pnl >= 0 ? "✅" : "❌";
    lines.push(`- ${emoji} ${t.asset} ${t.direction} via ${t.venue}/${t.instrumentType ?? "legacy"} [${t.instrumentLabel ?? "n/a"}] (${t.signalType}) → ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (${t.pnlPct.toFixed(1)}%, market ${(t.marketPnl ?? t.pnl).toFixed(4)}, funding ${(t.fundingPnl ?? 0).toFixed(4)})`);
  }
  lines.push("");
  return lines;
}

export function openedPositionsJournalSection(openedPositions: JournalOpenedPosition[]): string[] {
  if (openedPositions.length === 0) return [];
  const lines = [`**Opened ${openedPositions.length} positions:**`];
  for (const p of openedPositions) {
    lines.push(`- ${p.asset} ${p.direction} @ $${p.entryPrice} via ${p.venue}/${p.instrumentType ?? "legacy"} [${p.instrumentLabel ?? "n/a"}] (${p.signalType})`);
  }
  lines.push("");
  return lines;
}

export function observationJournalSection(title: string, observations: string[]): string[] {
  if (observations.length === 0) return [];
  return [title, ...observations.map((observation) => `- ${observation}`), ""];
}

export function statObservationJournalSection(statObs: JournalStatObservation[]): string[] {
  if (statObs.length === 0) return [];
  return ["**Statistical observations:**", ...statObs.slice(0, 5).map((o) => `- [${o.type}] ${o.description}`), ""];
}

export function blockedSignalJournalSection(blockedObs: string[], blockedSummary: JournalBlockedSummary): string[] {
  if (blockedObs.length === 0 && blockedSummary.recentResolved.length === 0 && blockedSummary.openCount === 0) return [];
  const lines = [
    "**Blocked signal learning:**",
    `- Open blocked shadows: ${blockedSummary.openCount}`,
    `- Resolved blocked shadows: ${blockedSummary.resolvedCount} (${blockedSummary.wouldHaveWon} wins / ${blockedSummary.wouldHaveLost} losses)`,
  ];
  for (const note of blockedObs) lines.push(`- ${note}`);
  for (const shadow of blockedSummary.recentResolved.slice(-4)) {
    const emoji = shadow.outcome === "win" ? "✅" : "❌";
    lines.push(`- ${emoji} ${blockedReasonLabel(shadow.blockedReason)}: ${shadow.signalType} ${shadow.asset} ${shadow.direction} via ${shadow.venue} would have ${humanCloseReason(shadow.closeReason)} (${shadow.pnlPct >= 0 ? "+" : ""}${shadow.pnlPct.toFixed(2)}%)`);
  }
  lines.push("");
  return lines;
}

export function llmJournalSection(llmJournal: string | null): string[] {
  if (!llmJournal) return [];
  return ["**LLM analysis:**", llmJournal, ""];
}

export function rejectionJournalSection(rejectionSection: string[]): string[] {
  if (rejectionSection.length === 0) return [];
  return [...rejectionSection, ""];
}
