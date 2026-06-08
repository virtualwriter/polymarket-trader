export type Outcome = "win" | "loss";

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  pnlPctSum: number;
}

export function emptyStats(): Stats {
  return { trades: 0, wins: 0, losses: 0, pnl: 0, pnlPctSum: 0 };
}

export function addStats(stats: Stats, pnl: number, pnlPct: number, outcome?: Outcome) {
  stats.trades += 1;
  stats.pnl += Number.isFinite(pnl) ? pnl : 0;
  stats.pnlPctSum += Number.isFinite(pnlPct) ? pnlPct : 0;
  const resolvedOutcome = outcome ?? (pnl >= 0 ? "win" : "loss");
  if (resolvedOutcome === "win") stats.wins += 1;
  else stats.losses += 1;
}

export function winRateValue(stats: Stats): number {
  return stats.trades > 0 ? stats.wins / stats.trades : -1;
}

export function sortStatsRows(rows: Array<[string, Stats]>): Array<[string, Stats]> {
  return rows.sort((a, b) =>
    winRateValue(b[1]) - winRateValue(a[1]) ||
    b[1].trades - a[1].trades ||
    b[1].pnl - a[1].pnl ||
    a[0].localeCompare(b[0])
  );
}

export function grouped<T>(
  items: T[],
  keyFn: (item: T) => string,
  statFn: (stats: Stats, item: T) => void,
): Array<[string, Stats]> {
  const map = new Map<string, Stats>();
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    const stats = map.get(key) ?? emptyStats();
    statFn(stats, item);
    map.set(key, stats);
  }
  return sortStatsRows([...map.entries()]);
}
