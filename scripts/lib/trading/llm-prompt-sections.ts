export interface PromptPortfolio {
  cash: number;
  positions: unknown[];
  totalRealizedPnl: number;
  totalTrades: number;
  winCount: number;
}

export interface PromptSignalWeight {
  type: string;
  weight: number;
  trades: number;
  wins: number;
  avgPnlPct: number;
  perAsset?: Record<string, {
    trades: number;
    wins: number;
    avgPnlPct: number;
    disabled?: boolean;
  }>;
}

export interface PromptHypothesis {
  id: string;
  setupId?: string;
  description: string;
  status: string;
  winRate: number;
  tests: unknown[];
  postMortem: string | null;
}

export interface PromptStatObservation {
  type: string;
  description: string;
}

export interface PromptClosedTrade {
  asset: string;
  direction: string;
  venue: string;
  instrumentType?: string;
  closeReason: string;
  pnl: number;
  marketPnl?: number;
  fundingPnl?: number;
  instrumentLabel?: string;
}

export interface PromptCandidateActions {
  llmCloseEligibility: unknown[];
  entryCandidates: unknown[];
  mechanicalExits: unknown[];
  signalKillExits: unknown[];
}

export function formatPortfolioPromptSummary(portfolio: PromptPortfolio): string {
  return `Cash: $${portfolio.cash.toFixed(2)} | Open positions: ${portfolio.positions.length} | Realized P&L: $${portfolio.totalRealizedPnl.toFixed(2)}
Win rate: ${portfolio.totalTrades > 0 ? ((portfolio.winCount / portfolio.totalTrades) * 100).toFixed(0) : "N/A"}% over ${portfolio.totalTrades} trades`;
}

export function formatAllowedActionSurfacePrompt(candidateActions: PromptCandidateActions): string {
  return JSON.stringify({
    llmCloseEligibility: candidateActions.llmCloseEligibility,
    candidateEntryCount: candidateActions.entryCandidates.length,
    mechanicalExitCount: candidateActions.mechanicalExits.length,
    signalKillExitCount: candidateActions.signalKillExits.length,
  }, null, 1);
}

export function formatSignalPerformancePrompt(activeWeights: PromptSignalWeight[]): string {
  return activeWeights.map((w) => {
    const disabledAssets = Object.entries(w.perAsset ?? {})
      .filter(([, stats]) => stats.disabled)
      .map(([asset, stats]) => `${asset} disabled (${stats.wins}/${stats.trades} wins, avg pnl=${stats.avgPnlPct.toFixed(2)}%)`)
      .join("; ");
    return `  ${w.type}: weight=${w.weight.toFixed(2)}, ${w.wins}/${w.trades} wins (${w.trades > 0 ? ((w.wins / w.trades) * 100).toFixed(0) : "N/A"}%), avg pnl=${w.avgPnlPct.toFixed(2)}%${disabledAssets ? ` | disabled assets: ${disabledAssets}` : ""}`;
  }).join("\n") || "  No trades yet";
}

export function formatActiveHypothesesPrompt(activeHypotheses: PromptHypothesis[]): string {
  return activeHypotheses.map((h) => `  ${h.id} (${h.setupId ?? "unclassified"}): ${h.description} [${h.status}, ${(h.winRate * 100).toFixed(0)}% over ${h.tests.length} variant tests]`).join("\n") || "  None yet";
}

export function formatKilledHypothesesPrompt(killedRecently: PromptHypothesis[]): string {
  return killedRecently.map((h) => `  ${h.id}: ${h.description} — ${h.postMortem}`).join("\n") || "  None";
}

export function formatStatObservationsPrompt(statObs: PromptStatObservation[]): string {
  return statObs.map((o) => `  [${o.type}] ${o.description}`).join("\n") || "  None";
}

export function formatRecentClosedTradesPrompt(closedTrades: PromptClosedTrade[]): string {
  return closedTrades.slice(-10).map((t) => `  ${t.asset} ${t.direction} via ${t.venue}/${t.instrumentType ?? "legacy"} ${t.closeReason}: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(4)} (market=${(t.marketPnl ?? t.pnl).toFixed(4)}, funding=${(t.fundingPnl ?? 0).toFixed(4)}) [${t.instrumentLabel ?? "n/a"}]`).join("\n") || "  None";
}
