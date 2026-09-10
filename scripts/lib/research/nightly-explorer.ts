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
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  executeResearchQueries,
  formatQueryResults,
  loadResearchDataset,
  SCAN_DATASET_NAMES,
  type ResearchDataset,
  type ResearchQuery,
} from "./research-queries.js";
import { extractDataRequests } from "./nightly-llm.js";
import { buildConditionCatalogPromptSection } from "./condition-catalog.js";
import { resolveLlmRoute, requestLlmText, extractLlmJsonObject, type LlmMessage, type LlmRoute } from "../trading/llm-transport.js";

export const EXPLORER_MAX_ROUNDS = 3;
export const EXPLORER_MAX_QUERIES_PER_ROUND = 8;
export const EXPLORER_MAX_PROPOSED_HYPOTHESES = 3;
export const EXPLORER_MAX_PROPOSED_STRATS = 5;

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
  rounds: number;
  queriesRun: number;
  observations: Array<{ finding: string; evidence: string }>;
  proposedHypotheses: unknown[];
  proposedStratifications: Array<{ features: string[]; rationale: string }>;
}

export function buildExplorerPrompt(inventoryText: string, valuationColumns: string[]): string {
  return `You are the nightly DATA EXPLORER for a quantitative paper trading system. You are not the disciplined researcher — that run already happened tonight. Your job is different: roam the raw archives freely and find repeatable patterns nobody told the miners to look for.

You have full read access to every research dataset through the query language below. The dataset schemas are listed under DATASET INVENTORY. Standing instructions:

1. EXPLORE FIRST. Use dataset_scan with groupBy to cut the data in unusual ways: cross features that the miners never combine, look at day-of-week effects, funding regimes, liquidity tiers, macro states, close reasons, venue differences. Chase anything with a big group mean and a real sample size.
2. REPEATABLE RULES ONLY. A finding must be a rule over many rows (contract-days, asset-days, trades) — never a story about one market or one week. Groups below the minimum sample size are suppressed by the engine; do not try to reason around that.
3. FOLLOW UP. You get up to ${EXPLORER_MAX_ROUNDS} query rounds of up to ${EXPLORER_MAX_QUERIES_PER_ROUND} queries each. When a cut looks promising, drill in: tighten the where-clause, check it on a second dataset or side, check the base rate of the pool it came from. A pattern that only exists in one grouping is probably noise.
4. BE HONEST ABOUT NULLS. Reporting "I scanned X and found nothing" is a valid, useful observation. Do not dress up noise as discovery.

${inventoryText}

WHAT YOU MAY PROPOSE (final response):
{
  "observations": [ {"finding": "<one-sentence pattern>", "evidence": "<the group stats that support it, with n>"} ],
  "proposedHypotheses": [ up to ${EXPLORER_MAX_PROPOSED_HYPOTHESES} objects: {"description", "prediction", "conditions": {<catalog keys only>}, "timeframeDays": <1-7>, "direction": "long"|"short"|"neutral", "confidence": <0.6-1>, "source": "llm"} ],
  "proposedStratifications": [ up to ${EXPLORER_MAX_PROPOSED_STRATS} objects: {"features": [2-3 of: dir, edge, dte, price, spread, liq, stance, ivgap, nogap, dow, fund, money, macro, spotret], "rationale": "<why this combo>"} ]
}

Rules for proposedHypotheses:
- conditions MUST use only keys from the CONDITION KEY CATALOG below — these are the only expressions the engine can evaluate. If your pattern has no catalog key, put it in observations and propose a stratification instead.
- Polymarket contract theses: the prediction must be about contract P&L over the horizon ("buying NO ... is profitable over 3 days"), direction "neutral" unless there is a genuine spot view.
- Spot theses: include the exam threshold in the prediction ("rises > 1%" for 3d) and an explicit direction.
- Prefer 2-3 day horizons; a 7d thesis tests slowly.
- Your hypotheses are tagged origin=explorer and face the full shadow-test gauntlet. Propose your best 0-${EXPLORER_MAX_PROPOSED_HYPOTHESES}, not a quota.

Rules for proposedStratifications: they extend the panel miner's search space and are tested with the same holdout + false-discovery correction as built-in cuts. Propose combos your scans suggest are informative, not exhaustive lists.

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
      ? ((item as any).features as unknown[]).filter((f): f is string => typeof f === "string" && KNOWN_PANEL_FEATURES.has(f))
      : [];
    if (features.length < 2 || features.length > 3) continue;
    const key = [...features].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ features, rationale: String((item as any).rationale ?? "").slice(0, 240) });
  }
  return out;
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
  const prompt = buildExplorerPrompt(inventory, valuationColumns);
  log(`prompt: ${prompt.length} chars (provider=${route.provider}, model=${route.model}).`);

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

    const advice: ExplorerAdvice = {
      generatedAt: new Date().toISOString(),
      rounds,
      queriesRun,
      observations,
      proposedHypotheses,
      proposedStratifications,
    };
    writeFileSync(join(opts.dataDir, "nightly-explorer-advice.json"), JSON.stringify(advice, null, 2) + "\n");
    if (proposedStratifications.length > 0) {
      writeFileSync(
        join(opts.dataDir, "miner-proposed-strats.json"),
        JSON.stringify({ proposedAt: advice.generatedAt, proposals: proposedStratifications }, null, 2) + "\n",
      );
    }
    log(`wrote nightly-explorer-advice.json (observations=${observations.length}, hypotheses=${proposedHypotheses.length}, strats=${proposedStratifications.length}, rounds=${rounds}, queries=${queriesRun})`);
    return { skipped: false, wrote: true };
  } catch (e: any) {
    log(`failed: ${e?.message ?? e}`);
    return { skipped: false, wrote: false, error: String(e?.message ?? e) };
  }
}
