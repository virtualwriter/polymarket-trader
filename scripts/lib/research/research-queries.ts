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
  };

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

function readCsvRows(path: string, maxRows: number): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").split("\n").filter((l) => l.trim());
  const header = lines.shift();
  if (!header) return [];
  const cols = header.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  return lines.slice(-maxRows).map((line) => {
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
  };
}

// ─── Parsing model output ───────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
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

Every result includes n, win rate, Wilson 95% lower bound, total and mean PnL, a one-sided t-test p-value that mean PnL is positive, optional group breakdowns, and up to ${MAX_SAMPLE_ROWS} example rows.
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
