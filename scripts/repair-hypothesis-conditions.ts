#!/usr/bin/env tsx
/**
 * One-off (idempotent) repair of research hypotheses whose conditions use
 * keys or expression syntax the engine cannot evaluate — the pre-catalog
 * vocabulary drift that left the post-Jul-24 FIND-linked batch without real
 * shadow tests.
 *
 * Dry run (default):  npx tsx scripts/repair-hypothesis-conditions.ts
 * Apply:              npx tsx scripts/repair-hypothesis-conditions.ts --apply
 *
 * Repair order per hypothesis:
 *   1. Alias renames from the condition catalog (contract_expiry_days →
 *      days_to_expiry, yes_spread → yesSpread, ...), keeping the expression.
 *   2. Expression normalization (en-dash ranges → "between A and B").
 *   3. Semantic proxy rewrites for concepts with no data source (informed-flow
 *      share keys → touch_direction / smart_flow_stance gates).
 *   4. Re-validate. Clean → save with conditionsBeforeRepair audit trail.
 *      Still unevaluable → kill with a postMortem so the nightly LLM can
 *      re-author the FIND under the validated catalog.
 *
 * Only touches active/promoted hypotheses from the research pipeline
 * (FIND-linked, llm, shadow_mined, informed_flow_study_v1 sources).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  CONDITION_KEY_ALIASES,
  suggestConditionKey,
  validateHypothesisConditions,
  formatConditionIssues,
} from "./lib/research/condition-catalog.js";
import type { Hypothesis } from "./lib/research/hypothesis-shadow-eval.js";

const HYPOTHESES_PATH = process.env.HYPOTHESES_PATH ?? "data/hypotheses.json";
const VALUATIONS_PATH = process.env.VALUATIONS_PATH ?? "data/daily-valuations.csv";
const APPLY = process.argv.includes("--apply");

/**
 * Semantic proxies for keys whose underlying concept has no engine data
 * source. Each maps to evaluable market-row gates preserving the thesis:
 * informed-flow "dumb money buying highs" ↔ above-strike touch contracts
 * where tracked smart wallets are not long YES.
 */
const PROXY_REWRITES: Record<string, Record<string, string>> = {
  dumb_share_highs: { touch_direction: ">= 1", smart_flow_stance: "<= 0" },
  dumb_wallet_yes_share_high: { touch_direction: ">= 1", smart_flow_stance: "<= 0" },
  smart_share_dips: { smart_flow_stance: "<= 0" },
};

/** Keys with no meaningful evaluable proxy: dropped (remaining conditions
 * still gate the hypothesis; if nothing evaluable remains it is killed). */
const DROP_KEYS = new Set(["strike_pct_vs_spot"]);

function loadValuationColumns(path: string): string[] {
  if (!existsSync(path)) return [];
  const header = readFileSync(path, "utf8").split("\n", 1)[0] ?? "";
  return header.split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

function conditionAssetPrefix(conditions: Record<string, string>): string | null {
  const raw = conditions.asset;
  if (!raw) return null;
  const first = String(raw).replace(/^in\s*\[?/i, "").split(/[,|\]]/)[0]?.trim().replace(/^["']|["']$/g, "");
  return first ? first.toLowerCase() : null;
}

/** Last number in the expression — for "> opt_iv_30d + 10" the intended
 * threshold is the trailing 10, not the 30 embedded in the column name. */
function extractThreshold(expression: string): string | null {
  const matches = String(expression).match(/-?\d+(?:\.\d+)?/g);
  return matches && matches.length > 0 ? matches[matches.length - 1] : null;
}

/** "above"/"= above"/"below" written against a direction-style key → the
 * engine's numeric touch_direction encoding. */
function touchDirectionExpression(expression: string): string | null {
  const value = String(expression).trim().toLowerCase().replace(/^(=|==)\s*/, "").replace(/^["']|["']$/g, "");
  if (value === "above") return ">= 1";
  if (value === "below") return "<= -1";
  return null;
}

interface RepairResult {
  conditions: Record<string, string>;
  changes: string[];
}

function repairConditions(
  original: Record<string, string>,
  valuationColumns: string[],
): RepairResult {
  const columns = new Set(valuationColumns);
  const changes: string[] = [];
  const repaired: Record<string, string> = {};

  const setIfAbsent = (key: string, expression: string, why: string) => {
    if (repaired[key] === undefined && original[key] === undefined) {
      repaired[key] = expression;
      changes.push(why);
    }
  };

  for (const [key, rawExpression] of Object.entries(original)) {
    let expression = String(rawExpression);

    // Expression normalization: en-dash / dash range → between syntax.
    const range = expression.trim().match(/^(-?\d+(?:\.\d+)?)\s*[–—]\s*(-?\d+(?:\.\d+)?)$/);
    if (range) {
      expression = `between ${range[1]} and ${range[2]}`;
      changes.push(`${key}: "${rawExpression}" → "${expression}"`);
    }

    if (DROP_KEYS.has(key)) {
      changes.push(`dropped ${key} (no evaluable proxy)`);
      continue;
    }

    const proxy = PROXY_REWRITES[key];
    if (proxy) {
      changes.push(`${key} → proxy {${Object.entries(proxy).map(([k, v]) => `${k}: "${v}"`).join(", ")}}`);
      for (const [proxyKey, proxyExpression] of Object.entries(proxy)) {
        setIfAbsent(proxyKey, proxyExpression, `added ${proxyKey}: "${proxyExpression}" (proxy for ${key})`);
      }
      continue;
    }

    // Direction-style keys with string expressions → numeric touch_direction.
    if (key === "direction" || key === "touch_direction" || key === "one_touch_direction") {
      const numeric = touchDirectionExpression(expression);
      if (numeric) {
        if (repaired.touch_direction === undefined) {
          repaired.touch_direction = numeric;
          changes.push(`${key}: "${rawExpression}" → touch_direction ${numeric}`);
        } else {
          changes.push(`dropped ${key}: "${rawExpression}" (touch_direction already set)`);
        }
        continue;
      }
    }

    // IV-spread expressed as a cross-column reference → points key.
    if ((key === "pm_iv" || key === "pm_iv - opt_iv_30d") && !columns.has(key)) {
      const threshold = extractThreshold(expression) ?? "10";
      setIfAbsent("pm_iv_minus_opt_iv_pts", `>= ${threshold}`, `${key}: "${rawExpression}" → pm_iv_minus_opt_iv_pts >= ${threshold}`);
      continue;
    }

    // Bare derived key missing its asset prefix (pm_iv_zscore_30d).
    const bareDerived = key.match(/^pm_iv_(zscore|percentile|change_pct)_(\d+[hd])$/);
    if (bareDerived && !columns.has("pm_iv")) {
      const assetPrefix = conditionAssetPrefix(original);
      const prefixed = assetPrefix ? `${assetPrefix}_pm_iv_${bareDerived[1]}_${bareDerived[2]}` : null;
      if (prefixed && columns.has(`${assetPrefix}_pm_iv`)) {
        repaired[prefixed] = expression;
        changes.push(`${key} → ${prefixed}`);
      } else {
        changes.push(`dropped ${key} (no asset prefix resolvable)`);
      }
      continue;
    }

    // Catalog alias renames (contract_expiry_days → days_to_expiry, ...).
    const issues = validateHypothesisConditions({ [key]: expression }, columns);
    const unknown = issues.find((issue) => issue.reason === "unknown_key");
    if (unknown) {
      const alias = CONDITION_KEY_ALIASES[key] ?? suggestConditionKey(key);
      if (alias) {
        // Asset-prefixed edge keys also need the asset scope preserved.
        const prefixMatch = key.match(/^([a-z0-9]+)_(?:one_touch_)?sell_yes_edge_pts$/);
        if (prefixMatch && !original.asset) {
          setIfAbsent("asset", prefixMatch[1].toUpperCase(), `added asset: "${prefixMatch[1].toUpperCase()}" (from ${key} prefix)`);
        }
        if (repaired[alias] === undefined && original[alias] === undefined) {
          repaired[alias] = expression;
          changes.push(`${key} → ${alias}`);
        } else {
          changes.push(`dropped ${key} (alias ${alias} already present)`);
        }
        continue;
      }
    }

    repaired[key] = expression;
  }

  return { conditions: repaired, changes };
}

function isResearchHypothesis(hypothesis: Hypothesis): boolean {
  if (hypothesis.status !== "active" && hypothesis.status !== "promoted") return false;
  if (hypothesis.originFindingId) return true;
  return ["llm", "shadow_mined", "informed_flow_study_v1"].includes(hypothesis.source);
}

function main() {
  const hypotheses = JSON.parse(readFileSync(HYPOTHESES_PATH, "utf8")) as Hypothesis[];
  const valuationColumns = loadValuationColumns(VALUATIONS_PATH);
  if (valuationColumns.length === 0) {
    console.error(`No valuation columns readable from ${VALUATIONS_PATH}; aborting (validation would reject every direct column key).`);
    process.exit(1);
  }

  let ok = 0;
  let repairedCount = 0;
  let killedCount = 0;
  const now = new Date().toISOString();

  for (const hypothesis of hypotheses) {
    if (!isResearchHypothesis(hypothesis)) continue;
    const issuesBefore = validateHypothesisConditions(hypothesis.conditions ?? {}, valuationColumns);
    if (issuesBefore.length === 0) { ok++; continue; }

    const completed = (hypothesis.tests ?? []).filter((t) => t.outcome !== "pending").length;
    const { conditions, changes } = repairConditions(hypothesis.conditions ?? {}, valuationColumns);
    const issuesAfter = validateHypothesisConditions(conditions, valuationColumns);

    if (issuesAfter.length === 0 && Object.keys(conditions).length > 0) {
      repairedCount++;
      console.log(`REPAIR ${hypothesis.id} (${hypothesis.originFindingId ?? hypothesis.source}, ${completed} completed tests)`);
      for (const change of changes) console.log(`  - ${change}`);
      if (APPLY) {
        (hypothesis as Record<string, unknown>).conditionsBeforeRepair = hypothesis.conditions;
        (hypothesis as Record<string, unknown>).conditionsRepairedAt = now;
        hypothesis.conditions = conditions;
      }
    } else {
      killedCount++;
      const remaining = formatConditionIssues(issuesAfter);
      console.log(`KILL   ${hypothesis.id} (${hypothesis.originFindingId ?? hypothesis.source}, ${completed} completed tests) — still unevaluable: ${remaining || "no conditions left"}`);
      if (APPLY) {
        hypothesis.status = "killed";
        hypothesis.postMortem = `Retired ${now.slice(0, 10)}: conditions used pre-catalog keys the engine cannot evaluate (${formatConditionIssues(issuesBefore)}). FIND remains open for catalog-validated re-authoring by the nightly LLM.`;
      }
    }
  }

  console.log(`\nSummary: ${ok} clean, ${repairedCount} repaired, ${killedCount} killed. Mode: ${APPLY ? "APPLY" : "dry-run"}.`);
  if (APPLY) {
    writeFileSync(HYPOTHESES_PATH, JSON.stringify(hypotheses, null, 2) + "\n");
    console.log(`Wrote ${HYPOTHESES_PATH}.`);
  }
}

main();
