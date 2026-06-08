export interface WinRateStats {
  trades: number;
  wins: number;
}

export function fmtUsd(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(4)}`;
}

export function fmtPct(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function winRate(stats: WinRateStats): string {
  return stats.trades > 0 ? `${((stats.wins / stats.trades) * 100).toFixed(1)}%` : "n/a";
}

export function fmtModelValue(value: number | null): string {
  return value === null ? "" : value.toFixed(6);
}

export function fmtPriceValue(value: number | null): string {
  return value === null ? "" : value.toFixed(4);
}

export function escapeMd(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
