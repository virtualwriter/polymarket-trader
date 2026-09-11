/**
 * Nightly data explorer — the free-roaming counterpart to the disciplined
 * nightly research run.
 *
 * The regular nightly LLM may only author hypotheses from ranked, mined FINDs
 * or diagnosed family failures. That discipline killed slop, but it also
 * capped discovery at whatever the human-defined miners already stratify: by
 * September 2026 the miners were re-confirming the same six clusters nightly
 * and new-FIND registration had flatlined at zero for two weeks.
 *
 * This module gives one LLM session per night open-ended access to every
 * research dataset through the `dataset_scan` query kind: it can learn each
 * dataset's schema, filter on any column, group by any column, and follow
 * hunches across multiple query rounds. It cannot trade, cannot change
 * parameters, and its proposals face the same ingest gates as everything else
 * (catalog-valid conditions, verdict-time cap, too-rare trigger check, shadow
 * tests, promotion gate). Only the requirement to trace to a ranked FIND is
 * waived, under a small per-night budget enforced at ingest.
 *
 * Outputs:
 * - data/nightly-explorer-advice.json — observations + up to
 *   EXPLORER_MAX_PROPOSED_HYPOTHESES freeform hypotheses (ingested by the
 *   hourly engine, tagged origin="explorer").
 * - data/miner-proposed-strats.json — proposed new panel-miner
 *   stratifications (feature-name combos); the Python miner validates them
 *   against its own feature registry and runs them through the identical
 *   base-rate/holdout/BH pipeline.
 * - data/sports-proposals.json — falsifiable rules over the sports/weather
 *   datasets, consumed by sports-arb's prospective evaluators (the PM
 *   gauntlet cannot validate those domains).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  executeResearchQueries,
  formatQueryResults,
  loadResearchDataset,
  SCAN_DATASET_NAMES,
  SPORTS_DATASET_NAMES,
  parsePanelWhere,
  type PanelWhereClause,
  type ResearchDataset,
  type ResearchQuery,
} from "./research-queries.js";
import { extractDataRequests } from "./nightly-llm.js";
import { buildConditionCatalogPromptSection } from "./condition-catalog.js";
import { resolveLlmRoute, requestLlmText, extractLlmJsonObject, type LlmMessage, type LlmRoute } from "../trading/llm-transport.js";

export const EXPLORER_MAX_ROUNDS = 4;
export const EXPLORER_MAX_QUERIES_PER_ROUND = 8;
export const EXPLORER_MAX_PROPOSED_HYPOTHESES = 3;
export const EXPLORER_MAX_PROPOSED_STRATS = 8;
export const EXPLORER_MAX_PROPOSED_FEATURES = 4;
export const EXPLORER_MAX_SPORTS_PROPOSALS = 4;

/** transform name → number of input columns (mirror of
 * DERIVED_TRANSFORM_ARITY in scripts/mine_panel_findings.py). */
const DERIVED_TRANSFORM_ARITY: Record<string, number> = {
  ratio: 2, diff: 2, product: 2, abs: 1, log10: 1,
};

/** Raw numeric panel columns a derived feature may read (mirror of
 * DERIVABLE_NUMERIC_COLUMNS in scripts/mine_panel_findings.py, which is the
 * enforcing side — this copy pre-filters junk and feeds the prompt). */
const DERIVABLE_PANEL_COLUMNS = [
  "strike", "spot", "dte_days", "yes_ask", "yes_bid", "pm_spread",
  "liquidity", "volume", "sell_yes_edge_pts", "buy_yes_edge_pts",
  "adjusted_no_gap_pts", "pm_iv", "option_iv", "pm_iv_minus_opt_iv_pts",
  "edge_pts_per_dte", "pm_to_underlying_cap_ratio", "settlement_overround",
  "settlement_skew_yes", "smart_flow_net_yes", "perp_funding_ann",
  "perp_basis_pct", "moneyness_pct", "btc_funding_ann", "spot_ret_24h_pct",
  "macro_composite", "macro_coverage", "fed_score", "iran_score",
  "oil_macro_score",
] as const;
const DERIVABLE_PANEL_COLUMN_SET = new Set<string>(DERIVABLE_PANEL_COLUMNS);

/**
 * Nightly focus rotation: each night one under-explored territory gets a
 * mandatory deep dive, so within a week every never-mined archive has had a
 * dedicated session instead of waiting for the model to wander there. The
 * PM panel is deliberately absent — the disciplined miners already own it,
 * and unsteered scans kept rediscovering its known edge.
 */
export const EXPLORER_FOCUS_ROTATION: ReadonlyArray<{ name: string; brief: string }> = [
  { name: "funding_history", brief: "the raw Hyperliquid funding archive: funding regimes, persistence, extremes by asset — then verify any spot-return implication on the spot_panel via fund_ann/fund_z30" },
  { name: "macro", brief: "the daily macro dataset crossed against panel and spot_panel outcomes: do macro states change which contract or spot cuts win?" },
  { name: "spot_panel", brief: "spot forward returns: funding x day-of-week, momentum vs mean-reversion by asset, vol regimes (realized_vol_30d_pct, iv_term_spread_pts)" },
  { name: "trades_and_shadows", brief: "the live trade ledger and resolved shadow cohort: close-reason patterns, day-of-week or venue asymmetries, signal types whose blocked shadows outperform" },
  { name: "valuations", brief: "the daily valuations history: cross-venue IV gaps, basis, and derived columns as regime markers for the panels" },
  { name: "panel_interactions", brief: "the PM outcome panel, but ONLY feature interactions the miners never cross (fund, money, macro, spotret, liq, dow crossed with each other or with price/dte) — single-feature or known-cluster cuts are null results tonight" },
  { name: "sports", brief: "the weather and softball datasets (settled sports/weather outcomes from the sports-arb collectors): where do the predictor snapshots beat the market's implied prices, which signal configs settle profitably, which conditions flip the sign? Route anything you find to sportsProposals — the PM gauntlet cannot test it" },
];

export function explorerFocusForDate(date: Date): { name: string; brief: string } {
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  return EXPLORER_FOCUS_ROTATION[dayIndex % EXPLORER_FOCUS_ROTATION.length];
}

const EXPLORER_TIMEOUT_MS = Number(process.env.NIGHTLY_EXPLORER_TIMEOUT_MS ?? 900_000);
const EXPLORER_MAX_TOKENS = 32_768;

/**
 * Known short names of panel-miner features (mirror of PANEL_FEATURES in
 * scripts/lib/panel_common.py). The miner re-validates against its own
 * registry — this list only pre-filters obvious junk so the proposals file
 * stays clean.
 */
const KNOWN_PANEL_FEATURES = new Set([
  "dir", "edge", "dte", "price", "spread", "liq", "stance", "ivgap", "nogap",
  "dow", "fund", "money", "macro", "spotret",
]);

export interface ExplorerAdvice {
  generatedAt: string;
  /** Which rotation territory this session was mandated to dig into. */
  focus: string;
  rounds: number;
  queriesRun: number;
  observations: Array<{ finding: string; evidence: string }>;
  proposedHypotheses: unknown[];
  proposedStratifications: Array<{ features: string[]; rationale: string }>;
  proposedFeatures: FeatureProposal[];
  sportsProposals: SportsProposal[];
}

export interface FeatureProposal {
  name: string;
  transform: string;
  columns: string[];
  edges?: number[];
  rationale: string;
}

/**
 * A falsifiable rule over FUTURE rows of a sports dataset: "on settled rows
 * matching `where`, the mean of `metric` will be positive/negative." The PM
 * gauntlet cannot validate these; sports-arb's prospective evaluators consume
 * them from data/sports-proposals.json and track them against rows that did
 * not exist when the proposal was made.
 */
export interface SportsProposal {
  dataset: string;
  where: PanelWhereClause[];
  metric: string;
  direction: "positive" | "negative";
  rationale: string;
}

export function buildExplorerPrompt(
  inventoryText: string,
  valuationColumns: string[],
  opts: { focus?: { name: string; brief: string }; knownClusters?: string[] } = {},
): string {
  const knownSection = opts.knownClusters && opts.knownClusters.length > 0
    ? `\nALREADY KNOWN — REDISCOVERING THESE IS A NULL RESULT:
The disciplined miners have already registered these edge clusters. Confirming them again teaches us nothing; a scan that lands on one should be noted in one line and abandoned. Novelty means a pattern OUTSIDE this list.
${opts.knownClusters.map((c) => `- ${c}`).join("\n")}\n`
    : "";
  const focusSection = opts.focus
    ? `\nTONIGHT'S MANDATORY FOCUS: ${opts.focus.name}
Spend at least half of your queries on: ${opts.focus.brief}. The focus rotates nightly so every archive gets deep coverage; whatever else you chase, this territory must get a real dive tonight, and a well-evidenced null ("scanned X cuts, nothing beat base") is an acceptable outcome.\n`
    : "";
  return `You are the nightly DATA EXPLORER for a quantitative paper trading system. You are not the disciplined researcher — that run already happened tonight. Your job is different: roam the raw archives freely and find repeatable patterns nobody told the miners to look for.

You have full read access to every research dataset through the query language below. The dataset schemas are listed under DATASET INVENTORY. Standing instructions:

1. EXPLORE FIRST. Use dataset_scan with groupBy to cut the data in unusual ways: cross features that the miners never combine, look at day-of-week effects, funding regimes, liquidity tiers, macro states, close reasons, venue differences. Chase anything with a big group mean and a real sample size.
2. REPEATABLE RULES ONLY. A finding must be a rule over many rows (contract-days, asset-days, trades) — never a story about one market or one week. Groups below the minimum sample size are suppressed by the engine; do not try to reason around that.
3. FOLLOW UP. You get up to ${EXPLORER_MAX_ROUNDS} query rounds of up to ${EXPLORER_MAX_QUERIES_PER_ROUND} queries each. When a cut looks promising, drill in: tighten the where-clause, check it on a second dataset or side, check the base rate of the pool it came from. A pattern that only exists in one grouping is probably noise.
4. BE HONEST ABOUT NULLS. Reporting "I scanned X and found nothing" is a valid, useful observation. Do not dress up noise as discovery.
5. HUNT INTERACTIONS. The highest-value discovery is a conditional effect: a cut that only works in a funding regime, on certain weekdays, in a liquidity tier, or under a macro state. Single-feature effects are mostly already mined.
${knownSection}${focusSection}
${inventoryText}

WHAT YOU MAY PROPOSE (final response):
{
  "observations": [ {"finding": "<one-sentence pattern>", "evidence": "<the group stats that support it, with n>"} ],
  "proposedHypotheses": [ up to ${EXPLORER_MAX_PROPOSED_HYPOTHESES} objects: {"description", "prediction", "conditions": {<catalog keys only>}, "timeframeDays": <1-7>, "direction": "long"|"short"|"neutral", "confidence": <0.6-1>, "source": "llm"} ],
  "proposedStratifications": [ up to ${EXPLORER_MAX_PROPOSED_STRATS} objects: {"features": [2-3 of: dir, edge, dte, price, spread, liq, stance, ivgap, nogap, dow, fund, money, macro, spotret — or the x_<name> of a derived feature you propose below], "rationale": "<why this combo>"} ],
  "proposedFeatures": [ up to ${EXPLORER_MAX_PROPOSED_FEATURES} objects: {"name": "<short_snake_case>", "transform": "ratio"|"diff"|"product"|"abs"|"log10", "columns": [1-2 raw panel columns], "edges": [optional 1-4 ascending bucket edges], "rationale": "<why this representation should carry signal>"} ],
  "sportsProposals": [ up to ${EXPLORER_MAX_SPORTS_PROPOSALS} objects: {"dataset": "weather"|"softball", "where": [1-4 clauses {"column", "gte"?, "lte"?, "eq"?}], "metric": "<numeric column of that dataset>", "direction": "positive"|"negative", "rationale": "<the scan evidence, with n>"} ]
}

Rules for proposedHypotheses:
- conditions MUST use only keys from the CONDITION KEY CATALOG below — these are the only expressions the engine can evaluate. If your pattern has no catalog key, put it in observations and propose a stratification instead.
- Polymarket contract theses: the prediction must be about contract P&L over the horizon ("buying NO ... is profitable over 3 days"), direction "neutral" unless there is a genuine spot view.
- Spot theses: include the exam threshold in the prediction ("rises > 1%" for 3d) and an explicit direction.
- Prefer 2-3 day horizons; a 7d thesis tests slowly.
- Your hypotheses are tagged origin=explorer and face the full shadow-test gauntlet. Propose your best 0-${EXPLORER_MAX_PROPOSED_HYPOTHESES}, not a quota.

Rules for proposedStratifications: they extend the panel miner's search space and are tested with the same holdout + false-discovery correction as built-in cuts. Propose combos your scans suggest are informative, not exhaustive lists.

Rules for proposedFeatures (NEW REPRESENTATIONS — the strongest thing you can propose):
- A derived feature is a NEW column over the PM panel computed from raw columns, e.g. ratio(volume, liquidity) as a turnover proxy, or diff(pm_iv, option_iv) scaled differently than the built-in gap. The miner materializes it, buckets it (your edges, or terciles if you omit them), and stratifies it — alone and in any combo you propose referencing its x_<name> — under the identical holdout + BH rigor as every built-in feature.
- Allowed raw columns: ${DERIVABLE_PANEL_COLUMNS.join(", ")}.
- Propose a feature only when your scans give a REASON to believe the combination carries signal the raw columns miss (a ratio that normalizes scale, an interaction your grouped scans showed). Speculative features burn shared false-discovery budget: every extra representation makes every other finding's q-value worse.
- Derived features have no engine catalog key yet, so their findings surface as coverage-gap evidence in the mine report rather than instantly authorable FINDs. That is the point: prove the representation matters first.

Rules for sportsProposals (weather / softball findings — DIFFERENT VALIDATION VENUE):
- This trading engine holds Polymarket crypto contracts; it has no weather or sports instruments, so NOTHING you find on the weather/softball datasets may become a proposedHypothesis, proposedStratification, or proposedFeature. The only legitimate output for a sports finding is a sportsProposal.
- A sportsProposal is a falsifiable rule about FUTURE rows: "on settled rows matching these where-clauses, mean(metric) will be positive/negative." The sports-arb side evaluates it prospectively on rows that did not exist tonight (weather settles ~daily per city, so a rule reaching ~20 matched rows gets a verdict in a few weeks).
- Make the where-clauses tight enough to mean something and loose enough to trigger: a rule matching one row a month never resolves. Cite the historical n and group stats in the rationale.
- These proposals burn no PM false-discovery budget, but junk still costs evaluator capacity: propose only rules your scans actually support.

${buildConditionCatalogPromptSection(valuationColumns)}

To query, reply with ONLY: {"dataRequests": [ ... ]}
The most useful kind is dataset_scan. groupBy and metric are plain strings naming a single column. Worked example:
{"dataRequests": [
  {"kind": "dataset_scan", "dataset": "panel", "where": [{"column": "dte_days", "lte": 30}], "groupBy": "yes_ask", "metric": "no_pnl_pct_7d"},
  {"kind": "dataset_scan", "dataset": "trades", "groupBy": "close_reason"}
]}
The first returns mean/win-share of 7-day NO P&L per yes_ask quintile among sub-30-DTE contracts; the second groups closed live trades by close reason with default metric pnl_pct. A grouped result returns "groups"; if you get back only a schema summary, your groupBy/metric did not parse — fix the shape and retry. The panel/spot_panel kinds from the classic query language also work when you want base-rate comparison and dedupe.
When you are done exploring, reply with ONLY the final JSON object described above.`;
}

function log(msg: string): void {
  console.log(`[nightly-explorer] ${msg}`);
}

async function timedCall(label: string, route: LlmRoute, messages: LlmMessage[]): Promise<string> {
  const startedAt = Date.now();
  const resp = await requestLlmText(route, messages, { maxTokens: EXPLORER_MAX_TOKENS, timeoutMs: EXPLORER_TIMEOUT_MS });
  log(`${label}: chars=${resp.text.length} finish_reason=${resp.stopReason ?? "null"} elapsed=${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  return resp.text;
}

export function sanitizeStratProposals(raw: unknown): Array<{ features: string[]; rationale: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ features: string[]; rationale: string }> = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= EXPLORER_MAX_PROPOSED_STRATS) break;
    if (!item || typeof item !== "object") continue;
    const features = Array.isArray((item as any).features)
      ? ((item as any).features as unknown[]).filter((f): f is string =>
          typeof f === "string" && (KNOWN_PANEL_FEATURES.has(f) || /^x_[a-z][a-z0-9_]*$/.test(f)))
      : [];
    if (features.length < 2 || features.length > 3) continue;
    const key = [...features].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ features, rationale: String((item as any).rationale ?? "").slice(0, 240) });
  }
  return out;
}

export function sanitizeFeatureProposals(raw: unknown): FeatureProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: FeatureProposal[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= EXPLORER_MAX_PROPOSED_FEATURES) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const transform = String(rec.transform ?? "");
    const arity = DERIVED_TRANSFORM_ARITY[transform];
    if (arity === undefined) continue;
    const columns = Array.isArray(rec.columns)
      ? (rec.columns as unknown[]).filter((c): c is string => typeof c === "string" && DERIVABLE_PANEL_COLUMN_SET.has(c))
      : [];
    if (columns.length !== arity) continue;
    const name = String(rec.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 25);
    if (!/^[a-z][a-z0-9_]*$/.test(name)) continue;
    const key = `${transform}|${columns.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let edges: number[] | undefined;
    if (Array.isArray(rec.edges)) {
      const parsed = (rec.edges as unknown[]).map(Number).filter((n) => Number.isFinite(n));
      if (
        parsed.length >= 1 && parsed.length <= 4 &&
        parsed.length === (rec.edges as unknown[]).length &&
        parsed.every((v, i) => i === 0 || parsed[i - 1] < v)
      ) {
        edges = parsed;
      }
    }
    out.push({ name, transform, columns, ...(edges ? { edges } : {}), rationale: String(rec.rationale ?? "").slice(0, 240) });
  }
  return out;
}

const SPORTS_DATASET_SET = new Set<string>(SPORTS_DATASET_NAMES);
const SANE_COLUMN_RE = /^[a-z][a-z0-9_]{0,40}$/;

export function sanitizeSportsProposals(raw: unknown): SportsProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: SportsProposal[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= EXPLORER_MAX_SPORTS_PROPOSALS) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const dataset = String(rec.dataset ?? "");
    if (!SPORTS_DATASET_SET.has(dataset)) continue;
    const metric = String(rec.metric ?? "").trim();
    if (!SANE_COLUMN_RE.test(metric)) continue;
    const direction = rec.direction === "negative" ? "negative" : rec.direction === "positive" ? "positive" : null;
    if (!direction) continue;
    const where = parsePanelWhere(rec.where).filter((c) => SANE_COLUMN_RE.test(c.column));
    // A proposal with no conditions is just "the dataset mean" — not a rule.
    if (where.length === 0) continue;
    const key = `${dataset}|${metric}|${direction}|${JSON.stringify(where)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ dataset, where, metric, direction, rationale: String(rec.rationale ?? "").slice(0, 240) });
  }
  return out;
}

/**
 * Already-registered edge clusters from the ranked opportunities file: shown
 * to the explorer so rediscovering them reads as a null result, steering the
 * session toward genuine novelty.
 */
export function loadKnownClusters(opportunitiesPath: string): string[] {
  if (!existsSync(opportunitiesPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(opportunitiesPath, "utf-8"));
    const ops = Array.isArray(raw?.opportunities) ? raw.opportunities : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      const clusterKey = typeof op.clusterKey === "string" ? op.clusterKey : "";
      const title = typeof op.title === "string" ? op.title : "";
      const key = clusterKey || title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(title ? title.slice(0, 140) : clusterKey);
      if (out.length >= 15) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function buildDatasetInventory(data: ResearchDataset): string {
  const schemaQueries: ResearchQuery[] = SCAN_DATASET_NAMES.map((dataset) => ({ kind: "dataset_scan", dataset }));
  const results = executeResearchQueries(schemaQueries, data, schemaQueries.length);
  return `DATASET INVENTORY (schemas — columns, row counts, date ranges):\n${
    results.map((r) => JSON.stringify(r.summary)).join("\n")
  }`;
}

export interface RunExplorerStepResult {
  skipped: boolean;
  wrote: boolean;
  error?: string;
}

export async function runNightlyExplorerStep(opts: { dataDir: string }): Promise<RunExplorerStepResult> {
  if (process.env.NIGHTLY_EXPLORER_DISABLE === "1") {
    log("NIGHTLY_EXPLORER_DISABLE=1; skipping.");
    return { skipped: true, wrote: false };
  }
  const route = resolveLlmRoute("nightly_research");
  if (!route) {
    log("no API key for nightly_research route; skipping");
    return { skipped: true, wrote: false };
  }

  const data = loadResearchDataset(opts.dataDir);
  const inventory = buildDatasetInventory(data);
  const valuationColumns = data.valuationRows.length > 0 ? Object.keys(data.valuationRows[data.valuationRows.length - 1]) : [];
  const focus = explorerFocusForDate(new Date());
  const knownClusters = loadKnownClusters(join(opts.dataDir, "research-opportunities.json"));
  const prompt = buildExplorerPrompt(inventory, valuationColumns, { focus, knownClusters });
  log(`prompt: ${prompt.length} chars (provider=${route.provider}, model=${route.model}, focus=${focus.name}, knownClusters=${knownClusters.length}).`);

  const messages: LlmMessage[] = [{ role: "user", content: prompt }];
  let queriesRun = 0;
  let rounds = 0;
  let finalText: string | null = null;

  try {
    let text = await timedCall("response#1", route, messages);
    while (rounds < EXPLORER_MAX_ROUNDS) {
      const requested = extractDataRequests(text, EXPLORER_MAX_QUERIES_PER_ROUND);
      if (requested.length === 0) {
        finalText = text;
        break;
      }
      rounds++;
      queriesRun += requested.length;
      log(`round ${rounds}: model requested ${requested.length} queries: ${requested.map((q) => q.kind).join(", ")}`);
      const results = executeResearchQueries(requested, data, EXPLORER_MAX_QUERIES_PER_ROUND);
      const body = formatQueryResults(results, { withFinalInstruction: false });
      const followup = rounds >= EXPLORER_MAX_ROUNDS
        ? `${body}\n\nThis was your final query round. Produce the final JSON now.`
        : `${body}\n\nYou may run ${EXPLORER_MAX_ROUNDS - rounds} more query round(s) with {"dataRequests":[...]} — drill into anything promising before concluding — or produce the final JSON now.`;
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: followup });
      text = await timedCall(`response#${rounds + 1}`, route, messages);
    }
    if (finalText === null) finalText = text;

    const jsonText = extractLlmJsonObject(finalText);
    let parsed: Record<string, unknown> | null = null;
    if (jsonText) {
      try {
        const obj = JSON.parse(jsonText);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) parsed = obj as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
    if (!parsed) {
      log("final response did not parse as JSON; nothing written");
      return { skipped: false, wrote: false, error: "final response not parseable" };
    }

    const observations = Array.isArray(parsed.observations)
      ? (parsed.observations as unknown[])
        .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
        .slice(0, 12)
        .map((o) => ({ finding: String(o.finding ?? "").slice(0, 400), evidence: String(o.evidence ?? "").slice(0, 400) }))
        .filter((o) => o.finding)
      : [];
    const proposedHypotheses = Array.isArray(parsed.proposedHypotheses)
      ? parsed.proposedHypotheses.slice(0, EXPLORER_MAX_PROPOSED_HYPOTHESES)
      : [];
    const proposedStratifications = sanitizeStratProposals(parsed.proposedStratifications);
    const proposedFeatures = sanitizeFeatureProposals(parsed.proposedFeatures);
    const sportsProposals = sanitizeSportsProposals(parsed.sportsProposals);

    const advice: ExplorerAdvice = {
      generatedAt: new Date().toISOString(),
      focus: focus.name,
      rounds,
      queriesRun,
      observations,
      proposedHypotheses,
      proposedStratifications,
      proposedFeatures,
      sportsProposals,
    };
    writeFileSync(join(opts.dataDir, "nightly-explorer-advice.json"), JSON.stringify(advice, null, 2) + "\n");
    if (proposedStratifications.length > 0) {
      writeFileSync(
        join(opts.dataDir, "miner-proposed-strats.json"),
        JSON.stringify({ proposedAt: advice.generatedAt, proposals: proposedStratifications }, null, 2) + "\n",
      );
    }
    if (proposedFeatures.length > 0) {
      writeFileSync(
        join(opts.dataDir, "miner-proposed-features.json"),
        JSON.stringify({ proposedAt: advice.generatedAt, proposals: proposedFeatures }, null, 2) + "\n",
      );
    }
    if (sportsProposals.length > 0) {
      // Consumed by sports-arb's prospective evaluators (which keep their own
      // dedupe ledger keyed on rule signature — this file is stateless).
      writeFileSync(
        join(opts.dataDir, "sports-proposals.json"),
        JSON.stringify({ proposedAt: advice.generatedAt, proposals: sportsProposals }, null, 2) + "\n",
      );
    }
    log(`wrote nightly-explorer-advice.json (observations=${observations.length}, hypotheses=${proposedHypotheses.length}, strats=${proposedStratifications.length}, features=${proposedFeatures.length}, sports=${sportsProposals.length}, rounds=${rounds}, queries=${queriesRun})`);
    return { skipped: false, wrote: true };
  } catch (e: any) {
    log(`failed: ${e?.message ?? e}`);
    return { skipped: false, wrote: false, error: String(e?.message ?? e) };
  }
}
