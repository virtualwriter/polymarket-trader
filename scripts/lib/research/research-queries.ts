/**
 * Retrieval layer for the nightly research LLM.
 *
 * The nightly prompt is a fixed digest: over half of it is a raw truth-state
 * dump, and the model never sees a single individual trade — not one of the
 * hundreds of closed live trades, nor the thousand-plus resolved shadows, nor
 * any market history beyond a list of column names. It cannot ask a question,
 * so it can only comment on aggregates somebody else computed.
 *
 * This module gives it a small, deterministic query language instead. The model
 * emits `dataRequests`, the engine executes them here against the same
 * contamination-filtered ledger every other consumer uses, and the results are
 * fed back for a second pass. Queries are read-only, bounded in count and in
 * response size, and cannot express anything the executor does not implement.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanLedgerTrades, type LedgerTrade } from "../../portfolio-ledger.js";
import { meanPositivePValue, sampleMoments, wilsonLowerBound } from "./alpha-stats.js";

/** Hard cap on queries executed per nightly run. */
export const MAX_DATA_REQUESTS = 6;
/** Example rows returned per query, so a result can never blow the context. */
export const MAX_SAMPLE_ROWS = 12;

export type ResearchQuery =
  | {
    kind: "trades";
    signalType?: string;
    asset?: string;
    direction?: string;
    closedFrom?: string;
    closedTo?: string;
    outcome?: "win" | "loss";
    groupBy?: "signalType" | "asset" | "month" | "closeReason";
  }
  | {
    kind: "shadows";
    signalType?: string;
    asset?: string;
    direction?: string;
    resolvedFrom?: string;
    resolvedTo?: string;
    outcome?: "win" | "loss";
    groupBy?: "signalType" | "asset" | "month";
  }
  | {
    kind: "hypothesis_tests";
    setupId?: string;
    outcome?: "win" | "loss";
    includeUnscorable?: boolean;
    groupBy?: "setupId" | "exclusionReason";
  }
  | {
    kind: "market_stats";
    column: string;
    windowRows?: number;
  }
  | {
    kind: "panel";
    side: "no" | "yes";
    horizonDays: 3 | 7;
    asset?: string;
    where?: PanelWhereClause[];
  }
  | {
    kind: "spot_panel";
    side: "long" | "short";
    horizonDays: 1 | 3 | 7;
    asset?: string;
    where?: PanelWhereClause[];
  };

export interface PanelWhereClause {
  column: string;
  gte?: number;
  lte?: number;
  eq?: number | string;
}

export interface QueryGroupResult {
  key: string;
  n: number;
  wins: number;
  winRate: number;
  meanPnlPct: number;
  totalPnl: number;
}

export interface QueryResult {
  query: ResearchQuery;
  n: number;
  summary: Record<string, unknown>;
  groups?: QueryGroupResult[];
  samples?: Record<string, unknown>[];
  error?: string;
}

// ─── Loading ────────────────────────────────────────────────────────────────

export interface ResearchDataset {
  trades: LedgerTrade[];
  shadows: ShadowRecord[];
  hypotheses: HypothesisRecord[];
  valuationRows: Record<string, string>[];
  panelRows: Record<string, string>[];
  spotPanelRows: Record<string, string>[];
}

export interface ShadowRecord {
  id?: string;
  status?: string;
  signalType?: string;
  asset?: string;
  venue?: string;
  direction?: string;
  blockedAt?: string;
  blockedReason?: string;
  resolvedAt?: string;
  thesis?: string;
  learningExcluded?: boolean;
  hypotheticalResult?: { outcome?: string; pnl?: number; pnlPct?: number; closeReason?: string } | null;
}

export interface HypothesisRecord {
  id?: string;
  setupId?: string;
  status?: string;
  description?: string;
  prediction?: string;
  tests?: Array<{
    date?: string;
    outcome?: string;
    actualMove?: string;
    excludedFromSetupStats?: boolean;
    exclusionReason?: string;
    magnitude?: number;
    magnitudeUnit?: string;
  }>;
}

function readJsonArray<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function readCsvRows(path: string, maxRows?: number): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").split("\n").filter((l) => l.trim());
  const header = lines.shift();
  if (!header) return [];
  const cols = header.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const body = maxRows === undefined ? lines : lines.slice(-maxRows);
  return body.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? "").trim()]));
  });
}

export function loadResearchDataset(dataDir: string, maxValuationRows = 2400): ResearchDataset {
  return {
    trades: cleanLedgerTrades(join(dataDir, "trades-detailed.csv")),
    shadows: readJsonArray<ShadowRecord>(join(dataDir, "blocked-signals.json")),
    hypotheses: readJsonArray<HypothesisRecord>(join(dataDir, "hypotheses.json")),
    valuationRows: readCsvRows(join(dataDir, "daily-valuations.csv"), maxValuationRows),
    panelRows: readCsvRows(join(dataDir, "research-panel.csv")),
    spotPanelRows: readCsvRows(join(dataDir, "research-spot-panel.csv")),
  };
}

// ─── Parsing model output ───────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const MINEABLE_OUTCOME_QUALITIES = new Set(["clean", "terminal_yes", "terminal_no"]);
const SPOT_MINEABLE_OUTCOME_QUALITIES = new Set(["clean"]);
const MAX_PANEL_WHERE_CLAUSES = 4;

/**
 * The exam the spot scorer grades: a win is a move of at least this many
 * percent in the thesis direction over the horizon. Keep in lockstep with
 * SPOT_EXAM_THRESHOLD_PCT in scripts/lib/spot_panel_common.py.
 */
export const SPOT_EXAM_THRESHOLD_PCT: Record<number, number> = { 1: 0.5, 3: 1.0, 7: 2.0 };

function parsePanelWhere(raw: unknown): PanelWhereClause[] {
  if (!Array.isArray(raw)) return [];
  const clauses: PanelWhereClause[] = [];
  for (const item of raw.slice(0, MAX_PANEL_WHERE_CLAUSES)) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    const column = str(w.column);
    if (!column) continue;
    const clause: PanelWhereClause = { column };
    if (typeof w.gte === "number" && Number.isFinite(w.gte)) clause.gte = w.gte;
    if (typeof w.lte === "number" && Number.isFinite(w.lte)) clause.lte = w.lte;
    if (typeof w.eq === "number" && Number.isFinite(w.eq)) {
      clause.eq = w.eq;
    } else if (typeof w.eq === "string" && w.eq.trim()) {
      clause.eq = w.eq.trim();
    }
    clauses.push(clause);
  }
  return clauses;
}

/**
 * Extracts a `dataRequests` array from a model response. Unknown query kinds
 * and unknown fields are dropped rather than failing the batch, matching how
 * the rest of the nightly parsing degrades.
 */
export function parseDataRequests(raw: unknown): ResearchQuery[] {
  const list = Array.isArray(raw) ? raw : [];
  const queries: ResearchQuery[] = [];
  for (const item of list) {
    if (queries.length >= MAX_DATA_REQUESTS) break;
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const kind = str(q.kind);
    if (kind === "trades") {
      queries.push({
        kind, signalType: str(q.signalType), asset: str(q.asset), direction: str(q.direction),
        closedFrom: str(q.closedFrom), closedTo: str(q.closedTo),
        outcome: q.outcome === "win" || q.outcome === "loss" ? q.outcome : undefined,
        groupBy: ["signalType", "asset", "month", "closeReason"].includes(String(q.groupBy))
          ? q.groupBy as "signalType" : undefined,
      });
    } else if (kind === "shadows") {
      queries.push({
        kind, signalType: str(q.signalType), asset: str(q.asset), direction: str(q.direction),
        resolvedFrom: str(q.resolvedFrom), resolvedTo: str(q.resolvedTo),
        outcome: q.outcome === "win" || q.outcome === "loss" ? q.outcome : undefined,
        groupBy: ["signalType", "asset", "month"].includes(String(q.groupBy))
          ? q.groupBy as "signalType" : undefined,
      });
    } else if (kind === "hypothesis_tests") {
      queries.push({
        kind, setupId: str(q.setupId),
        outcome: q.outcome === "win" || q.outcome === "loss" ? q.outcome : undefined,
        includeUnscorable: q.includeUnscorable === true,
        groupBy: ["setupId", "exclusionReason"].includes(String(q.groupBy))
          ? q.groupBy as "setupId" : undefined,
      });
    } else if (kind === "market_stats") {
      const column = str(q.column);
      if (!column) continue;
      const windowRows = Number(q.windowRows);
      queries.push({ kind, column, windowRows: Number.isFinite(windowRows) ? windowRows : undefined });
    } else if (kind === "panel") {
      const side = q.side === "yes" || q.side === "no" ? q.side : undefined;
      const horizonDays = q.horizonDays === 3 || q.horizonDays === 7 ? q.horizonDays : undefined;
      if (!side || !horizonDays) continue;
      queries.push({
        kind,
        side,
        horizonDays,
        asset: str(q.asset),
        where: parsePanelWhere(q.where),
      });
    } else if (kind === "spot_panel") {
      const side = q.side === "long" || q.side === "short" ? q.side : undefined;
      const horizonDays = q.horizonDays === 1 || q.horizonDays === 3 || q.horizonDays === 7
        ? q.horizonDays
        : undefined;
      if (!side || !horizonDays) continue;
      queries.push({
        kind,
        side,
        horizonDays,
        asset: str(q.asset),
        where: parsePanelWhere(q.where),
      });
    }
  }
  return queries;
}

// ─── Execution ──────────────────────────────────────────────────────────────

function matches(value: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  return String(value ?? "").toUpperCase() === filter.toUpperCase();
}

function withinDate(value: string | undefined, from?: string, to?: string): boolean {
  const day = String(value ?? "").slice(0, 10);
  if (!day) return !from && !to;
  if (from && day < from.slice(0, 10)) return false;
  if (to && day > to.slice(0, 10)) return false;
  return true;
}

interface Scored { key: string; pnl: number; pnlPct: number; win: boolean }

function summarize(rows: Scored[]): Record<string, unknown> {
  const wins = rows.filter((r) => r.win).length;
  const pnls = rows.map((r) => r.pnl);
  const { mean, std } = sampleMoments(pnls);
  return {
    n: rows.length,
    wins,
    losses: rows.length - wins,
    winRate: rows.length ? Number((wins / rows.length).toFixed(4)) : 0,
    winRateWilson95Lower: Number(wilsonLowerBound(wins, rows.length).toFixed(4)),
    totalPnl: Number(pnls.reduce((s, v) => s + v, 0).toFixed(5)),
    meanPnl: Number(mean.toFixed(6)),
    stdPnl: Number(std.toFixed(6)),
    meanPnlPct: Number((rows.reduce((s, r) => s + r.pnlPct, 0) / (rows.length || 1)).toFixed(4)),
    pMeanPnlPositive: rows.length >= 2 ? Number((meanPositivePValue(pnls) ?? 1).toFixed(6)) : null,
  };
}

function group(rows: Scored[]): QueryGroupResult[] {
  const byKey = new Map<string, Scored[]>();
  for (const r of rows) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }
  return [...byKey.entries()]
    .map(([key, list]) => {
      const wins = list.filter((r) => r.win).length;
      return {
        key,
        n: list.length,
        wins,
        winRate: Number((wins / list.length).toFixed(4)),
        meanPnlPct: Number((list.reduce((s, r) => s + r.pnlPct, 0) / list.length).toFixed(4)),
        totalPnl: Number(list.reduce((s, r) => s + r.pnl, 0).toFixed(5)),
      };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 20);
}

function monthOf(value: string | undefined): string {
  return String(value ?? "").slice(0, 7) || "unknown";
}

function isMineablePanelRow(row: Record<string, string>, horizonDays: number): boolean {
  const quality = String(row[`outcome_quality_${horizonDays}d`] ?? "").trim().toLowerCase();
  return MINEABLE_OUTCOME_QUALITIES.has(quality);
}

function panelPnlPct(row: Record<string, string>, side: "yes" | "no", horizonDays: number): number | null {
  const raw = String(row[`${side}_pnl_pct_${horizonDays}d`] ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function matchesPanelWhere(row: Record<string, string>, clause: PanelWhereClause): boolean {
  const raw = String(row[clause.column] ?? "").trim();
  if (!raw) return false;
  const numericFilter = clause.gte !== undefined || clause.lte !== undefined
    || (clause.eq !== undefined && typeof clause.eq === "number");
  if (numericFilter) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return false;
    if (clause.gte !== undefined && value < clause.gte) return false;
    if (clause.lte !== undefined && value > clause.lte) return false;
    if (clause.eq !== undefined && typeof clause.eq === "number" && value !== clause.eq) return false;
    return true;
  }
  if (clause.eq !== undefined && typeof clause.eq === "string") {
    return raw === clause.eq;
  }
  return true;
}

/** Greedy per-contract spacing so forward windows do not overlap. */
export function dedupeNonOverlappingPanelRows(
  rows: Record<string, string>[],
  horizonDays: number,
): Record<string, string>[] {
  const byContract = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const marketId = String(row.market_id ?? "");
    const list = byContract.get(marketId) ?? [];
    list.push(row);
    byContract.set(marketId, list);
  }
  const kept: Record<string, string>[] = [];
  for (const contractRows of byContract.values()) {
    contractRows.sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
    let lastDayMs: number | null = null;
    for (const row of contractRows) {
      const dayMs = Date.parse(`${String(row.entry_date ?? "").slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(dayMs)) continue;
      if (lastDayMs === null || (dayMs - lastDayMs) / 86_400_000 >= horizonDays) {
        kept.push(row);
        lastDayMs = dayMs;
      }
    }
  }
  kept.sort((a, b) => {
    const byDate = String(a.entry_date).localeCompare(String(b.entry_date));
    return byDate !== 0 ? byDate : String(a.market_id).localeCompare(String(b.market_id));
  });
  return kept;
}

function filterPanelRows(
  rows: Record<string, string>[],
  query: Extract<ResearchQuery, { kind: "panel" }>,
): Record<string, string>[] {
  return rows.filter((row) =>
    isMineablePanelRow(row, query.horizonDays)
    && matches(row.asset, query.asset)
    && (query.where ?? []).every((clause) => matchesPanelWhere(row, clause)));
}

function summarizePanelPnls(pnls: number[]): Record<string, unknown> {
  const wins = pnls.filter((p) => p > 0).length;
  const { mean, std } = sampleMoments(pnls);
  return {
    n: pnls.length,
    wins,
    losses: pnls.length - wins,
    winRate: pnls.length ? Number((wins / pnls.length).toFixed(4)) : 0,
    meanPnlPct: Number(mean.toFixed(4)),
    stdPnlPct: Number(std.toFixed(4)),
  };
}

function panelSampleRows(
  rows: Record<string, string>[],
  side: "yes" | "no",
  horizonDays: number,
): Record<string, unknown>[] {
  return rows.slice(-MAX_SAMPLE_ROWS).map((row) => ({
    entry_date: row.entry_date,
    asset: row.asset,
    market_id: row.market_id,
    direction: row.direction,
    pnlPct: panelPnlPct(row, side, horizonDays),
    sell_yes_edge_pts: row.sell_yes_edge_pts ?? null,
    dte_days: row.dte_days ?? null,
  }));
}

// ─── Spot panel (asset-day forward returns) ─────────────────────────────────

function spotPanelPnlPct(
  row: Record<string, string>,
  side: "long" | "short",
  horizonDays: number,
): number | null {
  const raw = String(row[`move_pct_${horizonDays}d`] ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return side === "long" ? value : -value;
}

/** Greedy per-asset spacing so forward windows do not overlap. */
export function dedupeNonOverlappingSpotPanelRows(
  rows: Record<string, string>[],
  horizonDays: number,
): Record<string, string>[] {
  const byAsset = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const asset = String(row.asset ?? "");
    const list = byAsset.get(asset) ?? [];
    list.push(row);
    byAsset.set(asset, list);
  }
  const kept: Record<string, string>[] = [];
  for (const assetRows of byAsset.values()) {
    assetRows.sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));
    let lastDayMs: number | null = null;
    for (const row of assetRows) {
      const dayMs = Date.parse(`${String(row.entry_date ?? "").slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(dayMs)) continue;
      if (lastDayMs === null || (dayMs - lastDayMs) / 86_400_000 >= horizonDays) {
        kept.push(row);
        lastDayMs = dayMs;
      }
    }
  }
  kept.sort((a, b) => {
    const byDate = String(a.entry_date).localeCompare(String(b.entry_date));
    return byDate !== 0 ? byDate : String(a.asset).localeCompare(String(b.asset));
  });
  return kept;
}

function filterSpotPanelRows(
  rows: Record<string, string>[],
  query: Extract<ResearchQuery, { kind: "spot_panel" }>,
): Record<string, string>[] {
  return rows.filter((row) => {
    const quality = String(row[`outcome_quality_${query.horizonDays}d`] ?? "").trim().toLowerCase();
    return SPOT_MINEABLE_OUTCOME_QUALITIES.has(quality)
      && matches(row.asset, query.asset)
      && (query.where ?? []).every((clause) => matchesPanelWhere(row, clause));
  });
}

function examWinRate(pnls: number[], thresholdPct: number): number {
  if (pnls.length === 0) return 0;
  return Number((pnls.filter((p) => p >= thresholdPct).length / pnls.length).toFixed(4));
}

export function executeResearchQuery(query: ResearchQuery, data: ResearchDataset): QueryResult {
  if (query.kind === "trades") {
    const rows = data.trades.filter((t) =>
      matches(t.signalType, query.signalType)
      && matches(t.asset, query.asset)
      && matches(t.direction, query.direction)
      && withinDate(t.closedAt, query.closedFrom, query.closedTo)
      && (!query.outcome || (query.outcome === "win") === (t.pnl >= 0)));
    const scored: Scored[] = rows.map((t) => ({
      key: query.groupBy === "asset"
        ? t.asset
        : query.groupBy === "month"
          ? monthOf(t.closedAt)
          : query.groupBy === "closeReason"
            ? String((t as unknown as Record<string, unknown>).closeReason ?? "unknown")
            : t.signalType,
      pnl: t.pnl,
      pnlPct: t.pnlPct,
      win: t.pnl >= 0,
    }));
    return {
      query,
      n: rows.length,
      summary: summarize(scored),
      groups: query.groupBy ? group(scored) : undefined,
      samples: rows.slice(-MAX_SAMPLE_ROWS).map((t) => ({
        closedAt: t.closedAt.slice(0, 16), asset: t.asset, direction: t.direction,
        signalType: t.signalType, pnl: Number(t.pnl.toFixed(5)), pnlPct: Number(t.pnlPct.toFixed(2)),
      })),
    };
  }

  if (query.kind === "shadows") {
    const rows = data.shadows.filter((s) =>
      s.status === "resolved"
      && !s.learningExcluded
      && s.hypotheticalResult
      && matches(s.signalType, query.signalType)
      && matches(s.asset, query.asset)
      && matches(s.direction, query.direction)
      && withinDate(s.resolvedAt ?? s.blockedAt, query.resolvedFrom, query.resolvedTo));
    const filtered = rows.filter((s) => {
      if (!query.outcome) return true;
      const pnl = Number(s.hypotheticalResult?.pnl ?? 0);
      return (query.outcome === "win") === (pnl >= 0);
    });
    const scored: Scored[] = filtered.map((s) => ({
      key: query.groupBy === "asset"
        ? String(s.asset ?? "unknown")
        : query.groupBy === "month"
          ? monthOf(s.resolvedAt ?? s.blockedAt)
          : String(s.signalType ?? "unknown"),
      pnl: Number(s.hypotheticalResult?.pnl ?? 0),
      pnlPct: Number(s.hypotheticalResult?.pnlPct ?? 0),
      win: Number(s.hypotheticalResult?.pnl ?? 0) >= 0,
    }));
    return {
      query,
      n: filtered.length,
      summary: summarize(scored),
      groups: query.groupBy ? group(scored) : undefined,
      samples: filtered.slice(-MAX_SAMPLE_ROWS).map((s) => ({
        resolvedAt: String(s.resolvedAt ?? s.blockedAt ?? "").slice(0, 16),
        asset: s.asset, direction: s.direction, signalType: s.signalType,
        pnlPct: Number(Number(s.hypotheticalResult?.pnlPct ?? 0).toFixed(2)),
        closeReason: s.hypotheticalResult?.closeReason,
      })),
    };
  }

  if (query.kind === "hypothesis_tests") {
    const scored: Scored[] = [];
    const samples: Record<string, unknown>[] = [];
    for (const h of data.hypotheses) {
      if (query.setupId && h.setupId !== query.setupId) continue;
      for (const t of h.tests ?? []) {
        if (t.outcome === "pending") continue;
        const unscorable = Boolean(t.excludedFromSetupStats);
        if (unscorable && !query.includeUnscorable) continue;
        if (query.outcome && t.outcome !== query.outcome) continue;
        const magnitude = typeof t.magnitude === "number" ? t.magnitude : 0;
        scored.push({
          key: query.groupBy === "exclusionReason"
            ? String(t.exclusionReason ?? (unscorable ? "unscorable" : "scored"))
            : String(h.setupId ?? "unclassified"),
          pnl: magnitude,
          pnlPct: magnitude,
          win: t.outcome === "win",
        });
        if (samples.length < MAX_SAMPLE_ROWS) {
          samples.push({
            hypothesisId: h.id, setupId: h.setupId, date: t.date, outcome: t.outcome,
            magnitude: typeof t.magnitude === "number" ? Number(t.magnitude.toFixed(3)) : null,
            magnitudeUnit: t.magnitudeUnit ?? null,
            exclusionReason: t.exclusionReason ?? null,
            actualMove: String(t.actualMove ?? "").slice(0, 140),
          });
        }
      }
    }
    return {
      query,
      n: scored.length,
      // "pnl" here is the signed realized edge recorded on each test, so the
      // expectancy statistics carry over unchanged.
      summary: summarize(scored),
      groups: query.groupBy ? group(scored) : undefined,
      samples,
    };
  }

  if (query.kind === "panel") {
    if (data.panelRows.length === 0) {
      return {
        query,
        n: 0,
        summary: {},
        error: "research-panel.csv is missing or empty",
      };
    }
    const baseRows = dedupeNonOverlappingPanelRows(
      filterPanelRows(data.panelRows, { ...query, where: [] }),
      query.horizonDays,
    );
    const basePnls = baseRows
      .map((row) => panelPnlPct(row, query.side, query.horizonDays))
      .filter((v): v is number => v !== null);
    const baseRate = basePnls.length
      ? Number((basePnls.filter((p) => p > 0).length / basePnls.length).toFixed(4))
      : 0;

    const matchedRows = dedupeNonOverlappingPanelRows(
      filterPanelRows(data.panelRows, query),
      query.horizonDays,
    );
    const pnls = matchedRows
      .map((row) => panelPnlPct(row, query.side, query.horizonDays))
      .filter((v): v is number => v !== null);

    return {
      query,
      n: pnls.length,
      summary: {
        ...summarizePanelPnls(pnls),
        baseRate,
        baseN: basePnls.length,
        side: query.side,
        horizonDays: query.horizonDays,
        asset: query.asset ?? "ALL",
      },
      samples: panelSampleRows(matchedRows, query.side, query.horizonDays),
    };
  }

  if (query.kind === "spot_panel") {
    if (data.spotPanelRows.length === 0) {
      return {
        query,
        n: 0,
        summary: {},
        error: "research-spot-panel.csv is missing or empty",
      };
    }
    const threshold = SPOT_EXAM_THRESHOLD_PCT[query.horizonDays] ?? 2;
    const baseRows = dedupeNonOverlappingSpotPanelRows(
      filterSpotPanelRows(data.spotPanelRows, { ...query, where: [] }),
      query.horizonDays,
    );
    const basePnls = baseRows
      .map((row) => spotPanelPnlPct(row, query.side, query.horizonDays))
      .filter((v): v is number => v !== null);

    const matchedRows = dedupeNonOverlappingSpotPanelRows(
      filterSpotPanelRows(data.spotPanelRows, query),
      query.horizonDays,
    );
    const pnls = matchedRows
      .map((row) => spotPanelPnlPct(row, query.side, query.horizonDays))
      .filter((v): v is number => v !== null);

    return {
      query,
      n: pnls.length,
      summary: {
        ...summarizePanelPnls(pnls),
        // The exam the engine's spot scorer actually grades: a win is a move
        // of >= examThresholdPct in the thesis direction over the horizon.
        examThresholdPct: threshold,
        examWinRate: examWinRate(pnls, threshold),
        baseExamWinRate: examWinRate(basePnls, threshold),
        baseN: basePnls.length,
        side: query.side,
        horizonDays: query.horizonDays,
        asset: query.asset ?? "ALL",
      },
      samples: matchedRows.slice(-MAX_SAMPLE_ROWS).map((row) => ({
        entry_date: row.entry_date,
        asset: row.asset,
        pnlPct: spotPanelPnlPct(row, query.side, query.horizonDays),
        fund_ann: row.fund_ann ?? null,
        ret_24h_pct: row.ret_24h_pct ?? null,
        pct_vs_30d_sma: row.pct_vs_30d_sma ?? null,
      })),
    };
  }

  const windowRows = Math.max(1, Math.min(query.windowRows ?? 720, data.valuationRows.length));
  const slice = data.valuationRows.slice(-windowRows);
  // Number("") is 0, so empty cells must be rejected before conversion or a
  // sparse column reads as a long run of genuine zeros.
  const values = slice
    .map((r) => String(r[query.column] ?? "").trim())
    .filter((cell) => cell !== "")
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) {
    return { query, n: 0, summary: {}, error: `column "${query.column}" has no numeric data in the last ${windowRows} rows` };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { mean, std } = sampleMoments(values);
  const pct = (p: number) => Number(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(6));
  return {
    query,
    n: values.length,
    summary: {
      column: query.column,
      rows: values.length,
      first: Number(values[0].toFixed(6)),
      last: Number(values[values.length - 1].toFixed(6)),
      mean: Number(mean.toFixed(6)),
      std: Number(std.toFixed(6)),
      min: pct(0), p10: pct(0.1), median: pct(0.5), p90: pct(0.9), max: Number(sorted[sorted.length - 1].toFixed(6)),
    },
  };
}

export function executeResearchQueries(queries: ResearchQuery[], data: ResearchDataset): QueryResult[] {
  return queries.slice(0, MAX_DATA_REQUESTS).map((q) => {
    try {
      return executeResearchQuery(q, data);
    } catch (e: any) {
      return { query: q, n: 0, summary: {}, error: String(e?.message ?? e) };
    }
  });
}

// ─── Prompt surface ─────────────────────────────────────────────────────────

export function buildQueryCatalogPromptSection(): string {
  return `DATA RETRIEVAL (you may ask for raw evidence before answering):
Instead of answering immediately you may reply with ONLY this JSON to request data:
{"dataRequests": [ {"kind": "...", ...filters} ]}
You get at most ${MAX_DATA_REQUESTS} requests, once. The results are returned to you and you then produce the final advice JSON. Use this when a claim you want to make depends on evidence not already summarised above — for example which conditions the losing trades of a signal shared, or whether a pattern holds outside the window already reported.

Available query kinds:
  - {"kind":"trades", "signalType"?, "asset"?, "direction"?, "closedFrom"?:"YYYY-MM-DD", "closedTo"?, "outcome"?:"win"|"loss", "groupBy"?:"signalType"|"asset"|"month"|"closeReason"}
      Real closed live trades from the contamination-filtered ledger. Operational artifacts are already excluded.
  - {"kind":"shadows", "signalType"?, "asset"?, "direction"?, "resolvedFrom"?, "resolvedTo"?, "outcome"?, "groupBy"?:"signalType"|"asset"|"month"}
      Resolved shadow (paper) trades with their hypothetical outcomes.
  - {"kind":"hypothesis_tests", "setupId"?, "outcome"?, "includeUnscorable"?:true, "groupBy"?:"setupId"|"exclusionReason"}
      Individual shadow-test outcomes, including the signed realized edge (magnitude) per test.
  - {"kind":"market_stats", "column":"<valuation column>", "windowRows"?:720}
      Distribution of a market-data column over recent history (mean, std, percentiles).
  - {"kind":"panel", "side":"yes"|"no", "horizonDays":3|7, "asset"?, "where"?:[{"column":"<panel column>", "gte"?, "lte"?, "eq"?}]}
      Historical forward returns from the outcome panel (all listed contracts, not just shadow trades). Use this to pre-check a hypothesis idea — e.g. "when sell_yes_edge_pts >= 5 on BTC NO 7d, what was win rate vs the unfiltered base rate?" Rows must have mineable outcome_quality; entries are de-duplicated per contract so forward windows do not overlap. At most 4 where-clauses.
  - {"kind":"spot_panel", "side":"long"|"short", "horizonDays":1|3|7, "asset"?:"BTC|ETH|SOL|HYPE|GOLD|SILVER|OIL|AMZN|SPY", "where"?:[{"column":"<spot panel column>", "gte"?, "lte"?, "eq"?}]}
      Historical forward SPOT returns per asset-day (the non-Polymarket panel). Use this to pre-check a spot/perp thesis — e.g. "long BTC 3d when ret_24h_pct <= -2, how often did it beat the exam threshold vs base?" Columns: price, fund_ann, fund_z30, ret_24h_pct, pct_from_7d_high, pct_vs_30d_sma, pc_ratio, pc_pctile_30d, iv_term_spread_pts, realized_vol_30d_pct, day_of_week, is_weekend, macro_composite. Stale windows (closed markets) are excluded; entries de-duplicated per asset so forward windows do not overlap.

Every result includes n, win rate, Wilson 95% lower bound, total and mean PnL, a one-sided t-test p-value that mean PnL is positive, optional group breakdowns, and up to ${MAX_SAMPLE_ROWS} example rows. Panel results also include meanPnlPct, stdPnlPct, and baseRate (win rate of all mineable rows for the same asset/side/horizon without where-filters). Spot-panel results additionally include examThresholdPct (the move the engine's scorer requires for a win at that horizon: 0.5%/1d, 1%/3d, 2%/7d), examWinRate and baseExamWinRate — compare those two to judge real edge on the exam the test will actually sit.
If you do not need extra evidence, skip this and answer directly.`;
}

export function formatQueryResults(results: QueryResult[]): string {
  const blocks = results.map((r, i) => {
    const head = `[${i + 1}] ${JSON.stringify(r.query)}`;
    if (r.error) return `${head}\n  ERROR: ${r.error}`;
    const parts = [`${head}\n  summary: ${JSON.stringify(r.summary)}`];
    if (r.groups?.length) parts.push(`  groups: ${JSON.stringify(r.groups)}`);
    if (r.samples?.length) parts.push(`  samples: ${JSON.stringify(r.samples)}`);
    return parts.join("\n");
  });
  return `DATA REQUEST RESULTS:\n${blocks.join("\n\n")}\n\nNow produce the final advice JSON. Do not request more data.`;
}
