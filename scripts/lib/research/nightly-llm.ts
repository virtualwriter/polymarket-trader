import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { extractLlmJsonObject, requestLlmText, resolveLlmRoute } from "../trading/llm-transport.js";

/**
 * Nightly research LLM step (July 2026 infrastructure plan, Phase 5).
 *
 * Hypothesis generation, hypothesis reviews, and learnable-parameter tuning
 * used to live inline in the hourly engine's mega-prompt. They now run once
 * a night, against the strongest configured model and the full (unscoped)
 * truth state, and write a single small advice file that the hourly engine
 * ingests through its own gates (`ingestNightlyLlmAdvice` in
 * trading-engine.ts: per-item hypothesis validation, the shadow-test
 * backlog gate, retired-setup blocking, locked signal-risk stripping, and
 * parameter bounds clamping). This module never trusts its own output to be
 * safe for the engine to apply blindly — it only has to produce a
 * well-formed advice file; the engine re-validates everything on ingest.
 */

export interface NightlyHypothesisSummary {
  id: string;
  status: string;
  description: string;
  winRate: number;
  tests?: unknown[];
  postMortem?: string | null;
  setupId?: string;
}

export interface NightlyResearchOpportunity {
  rank?: number;
  id: string;
  clusterKey?: string;
  opportunityScore?: number;
  confidenceScore?: number;
  evidence?: unknown;
  themeId?: string;
  title?: string;
}

export interface NightlyResearchThemeSummary {
  id: string;
  title?: string;
  status?: string;
  findingIds?: string[];
  findingCount?: number;
  avgOpportunityScore?: number;
}

export interface BuildNightlyResearchPromptInputs {
  truthState: unknown;
  engineState: unknown;
  lessons: unknown;
  hypotheses: NightlyHypothesisSummary[];
  learningParams: unknown;
  opportunities?: NightlyResearchOpportunity[];
  themes?: NightlyResearchThemeSummary[];
  /**
   * Setup family ids that are retired from live trading / new hypothesis
   * creation. Blocking itself is enforced at ingest by the hourly engine
   * (RETIRED_LLM_SETUP_IDS in ingestNightlyLlmAdvice) — this is only shown
   * to the model so it doesn't waste a proposal on a family that will be
   * silently dropped.
   */
  retiredSetupIds?: string[];
}

function jsonOrUnavailable(value: unknown, indent: number): string {
  if (value === null || value === undefined) return "(not available)";
  return JSON.stringify(value, null, indent);
}

function activeHypothesisOneLiner(h: NightlyHypothesisSummary): string {
  const testsCount = Array.isArray(h.tests) ? h.tests.length : 0;
  const winPct = Math.round((h.winRate ?? 0) * 100);
  return `  ${h.id} (${h.setupId ?? "unclassified"}) [${h.status}]: ${h.description.slice(0, 100)} — ${winPct}% win rate over ${testsCount} test(s)`;
}

function killedHypothesisOneLiner(h: NightlyHypothesisSummary): string {
  return `  ${h.id}: ${h.description.slice(0, 100)} — ${h.postMortem ?? "no postmortem"}`;
}

function scoreLabel(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "n/a";
}

function opportunityOneLiner(o: NightlyResearchOpportunity): string {
  const rank = typeof o.rank === "number" ? o.rank : "?";
  const theme = o.themeId ? ` themeId=${o.themeId}` : "";
  const evidence = o.evidence === undefined ? "n/a" : JSON.stringify(o.evidence);
  return `  ${rank}. ${o.id}${theme} clusterKey=${o.clusterKey ?? "n/a"} opportunityScore=${scoreLabel(o.opportunityScore)} confidenceScore=${scoreLabel(o.confidenceScore)} title=${o.title ?? "untitled"} evidence=${evidence}`;
}

function themeOneLiner(t: NightlyResearchThemeSummary): string {
  const findingIds = Array.isArray(t.findingIds) ? t.findingIds.slice(0, 12).join(",") : "";
  const tail = Array.isArray(t.findingIds) && t.findingIds.length > 12 ? ",..." : "";
  return `  ${t.id} [${t.status ?? "unknown"}]: ${t.title ?? "untitled"} findingCount=${t.findingCount ?? t.findingIds?.length ?? "n/a"} avgOpportunityScore=${scoreLabel(t.avgOpportunityScore)} findings=${findingIds}${tail}`;
}

/**
 * PURE — builds the nightly research prompt from already-loaded inputs.
 * No file I/O so it is directly unit-testable.
 */
export function buildNightlyResearchPrompt(inputs: BuildNightlyResearchPromptInputs): string {
  const retiredSetupIds = inputs.retiredSetupIds ?? [];
  const activeHypotheses = inputs.hypotheses.filter((h) => h.status === "active" || h.status === "promoted");
  const killedRecently = inputs.hypotheses.filter((h) => h.status === "killed").slice(-5);
  const opportunities = inputs.opportunities ?? [];
  const themes = inputs.themes ?? [];

  const activeLines = activeHypotheses.length > 0 ? activeHypotheses.map(activeHypothesisOneLiner).join("\n") : "  None yet";
  const killedLines = killedRecently.length > 0 ? killedRecently.map(killedHypothesisOneLiner).join("\n") : "  None";
  const opportunityLines = opportunities.length > 0 ? opportunities.map(opportunityOneLiner).join("\n") : "  None available. Prefer returning zero newHypotheses instead of inventing freeform ideas.";
  const themeLines = themes.length > 0 ? themes.map(themeOneLiner).join("\n") : "  None available";

  const retiredLine = retiredSetupIds.length > 0
    ? `Retired LLM setup families are blocked from live trading and new hypothesis creation: ${retiredSetupIds.join(", ")}. Do not recreate these broad families under a new name; propose only narrower replacement variants with distinct measurable inputs.`
    : "No setup families are currently retired.";

  return `You are the nightly research analyst for a quantitative paper trading system. The hourly engine only does mechanical execution and close review; you own learning — reviewing what is working, generating and reviewing hypotheses, and tuning learnable parameters. Nothing you propose executes a trade directly: new entries happen only once a hypothesis clears its shadow-test bar and is promoted to a live signal, and even then only through the hourly engine's own gates.

Your job this run is to:
1. Write a strategyReview: one short paragraph on what is working and what is failing, grounded in the truth state and lessons below.
2. Identify failureClusters: group recent losing patterns into named themes, each with supporting evidence and a recommendation.
3. Propose up to 10 newHypotheses from the ranked research opportunities only, and write hypothesisReviews for existing hypotheses you have new observations about.
4. Suggest parameterUpdates within the bounds below, only when the evidence supports a change.

CANONICAL ENGINE STATE:
${jsonOrUnavailable(inputs.engineState, 1)}

TRUTH BY SETUP FAMILY (full, canonical):
${jsonOrUnavailable(inputs.truthState, 1)}

NIGHTLY LESSONS:
${jsonOrUnavailable(inputs.lessons, 1)}

RANKED RESEARCH OPPORTUNITIES:
Score semantics (research_score_v3, in-sample discovery statistics): opportunityScore = 1 - p where p is the one-sided p-value that the cluster's expected per-trade PnL is positive (Student-t on per-trade PnL when available, else exact binomial on win rate) — e.g. 0.99 means 99% confident the cluster is genuinely profitable in-sample; below 0.5 means it likely loses money. confidenceScore = Wilson 95% lower confidence bound on the win rate — the true win rate is at least this with 95% confidence. evidence.qValue, when present, is the Benjamini-Hochberg false-discovery-rate-adjusted p-value across all clusters tested in the mining run; small qValue means the pattern survives multiple-comparisons correction. These are discovery statistics only — forward shadow tests remain the promotion gate.
${opportunityLines}

RESEARCH THEMES SUMMARY:
${themeLines}

ACTIVE / PROMOTED HYPOTHESES:
${activeLines}

RECENTLY KILLED HYPOTHESES:
${killedLines}

CURRENT LEARNABLE PARAMETERS:
${jsonOrUnavailable(inputs.learningParams, 2)}

IMPORTANT RULES:
- Each hypothesis MUST be specific and testable with a clear timeframe (1-30 days)
- Each hypothesis MUST define measurable conditions using column names from the data
- When RANKED RESEARCH OPPORTUNITIES contains FIND records, every newHypothesis MUST be authored from one of those findings, MUST include originFindingId exactly matching a listed FIND id, and MUST include themeId when the listed finding has one.
- Do NOT invent unrelated freeform ideas when ranked opportunities exist. Prefer up to 10 hypotheses total; if no ranked opportunities are listed, prefer returning zero newHypotheses.
- Prefer regime-relative conditions over hard-coded price levels so promoted setup families can generalize across BTC/HYPE/GOLD/OIL/AMZN price regimes. Use absolute spot thresholds only when the exact level is essential to the thesis.
- Supported derived condition keys:
  - <column>_pct_from_<N>h_high / <column>_pct_from_<N>d_high, e.g. btc_spot_pct_from_7d_high > -3
  - <column>_pct_from_<N>h_low / <column>_pct_from_<N>d_low, e.g. btc_spot_pct_from_3d_low > 2
  - <column>_pct_vs_<N>h_sma / <column>_pct_vs_<N>d_sma, e.g. btc_spot_pct_vs_24h_sma > 0
  - <column>_percentile_<N>h / <column>_percentile_<N>d, e.g. btc_ibit_pc_ratio_percentile_30d < 15
  - <column>_zscore_<N>h / <column>_zscore_<N>d, e.g. btc_pm_iv_zscore_30d < -2
  - <column>_change_pct_<N>h / <column>_change_pct_<N>d, e.g. btc_spot_change_pct_24h > 1.5
- For promoted setup-family variants, describe the reusable setup in relative terms such as "within 3% of 7d high", "bottom 15th percentile P/C ratio", "PM IV z-score below -2", or "spot above 24h SMA" instead of "BTC above 78k".
- Every newHypothesis MUST include a direction field: "long" if the spot/perp price is predicted to go up, "short" if predicted down, "neutral" for vol/IV/spread/basis theses that do NOT carry a directional spot view (e.g. "BTC IV expands as PM IV mean reverts" — the price could go either way). Direction is enforced as the authoritative signal when the hypothesis is later promoted; do NOT rely on the engine to infer direction from prose. If the thesis is contrarian, "long" still means buy spot (e.g. "P/C extreme high → contrarian long" is direction=long, not short).
- Similar hypotheses are grouped into setup families. Promotion/kill decisions happen at the setup-family level, not per wording variant. Prefer reviewing whether the parent setup is working over proposing near-duplicate threshold variants.
- ${retiredLine}
- Keep parameter updates inside these bounds:
  - macroMomentum24hThresholdPts: 2 to 20
  - contrarianTrendMarginPct: 0 to 5
  - positiveMomentum24hPct: 0 to 10
  - llmTradeExpiryDays: 3 to 30
  - momentumLongExpiryDays: 3 to 45
  - signalRisk.<signal>.targetPct: 0.5 to 15, or null for no upside take-profit cap
  - signalRisk.<signal>.stopPct: 0.5 to 10
- You may update signalRisk when realized wins are too small, losses are too large, or shadow/blocked learning shows a better payoff shape.
- Keep signalRisk updates incremental and explain them in journalEntry.
- Do NOT include parameterUpdates.signalRisk entries for these locked signals; their risk is fixed by their backtest convention and any proposed change will be silently dropped: ONE_TOUCH_HIGH_EDGE_NO.

Respond with ONLY valid JSON in this exact format:
{
  "strategyReview": "1 short paragraph on what is working and what is failing",
  "failureClusters": [{"theme": "short theme name", "evidence": "what the data shows", "recommendation": "what to do about it"}],
  "newHypotheses": [
    {
      "created": "YYYY-MM-DD",
      "description": "clear description of pattern",
      "conditions": {"column_name": "> value"},
      "prediction": "specific testable prediction",
      "timeframeDays": 7,
      "confidence": 0.6,
      "direction": "long",
      "originFindingId": "FIND-0003",
      "themeId": "THEME-0001",
      "source": "llm"
    }
  ],
  "hypothesisReviews": [{"id": "H-xxx", "observation": "what happened and why"}],
  "parameterUpdates": {
    "macroMomentum24hThresholdPts": 4,
    "contrarianTrendMarginPct": 0.5,
    "positiveMomentum24hPct": 1.5,
    "llmTradeExpiryDays": 14,
    "momentumLongExpiryDays": 21,
    "signalRisk": {
      "LLM_HYPOTHESIS": {"targetPct": 3.5, "stopPct": 2.5}
    }
  },
  "journalEntry": "Key observations and lessons from tonight's research..."
}`;
}

// ─── Parsing ────────────────────────────────────────────────────────────────
// Design note: array/record entries are validated and filtered per-item —
// a single out-of-bounds hypothesis, review, or parameter is dropped rather
// than failing the whole response, so a mostly-good response still writes a
// usable advice file. (The hourly engine re-validates every field again on
// ingest with its own stricter schema, so leniency here is safe.)

const hypothesisItemSchema = z.object({
  created: z.string().min(1),
  description: z.string().min(1),
  conditions: z.record(z.string(), z.string()),
  prediction: z.string().min(1),
  timeframeDays: z.number().int().min(1).max(30),
  confidence: z.number().min(0).max(1),
  direction: z.enum(["long", "short", "neutral"]),
  originFindingId: z.string().regex(/^FIND-\d{4}$/),
  themeId: z.string().regex(/^THEME-\d{4}$/).optional(),
  source: z.literal("llm"),
});
export type NightlyAdviceHypothesis = z.infer<typeof hypothesisItemSchema>;

const hypothesisReviewItemSchema = z.object({
  id: z.string().min(1),
  observation: z.string().min(1),
});
export type NightlyAdviceHypothesisReview = z.infer<typeof hypothesisReviewItemSchema>;

const failureClusterItemSchema = z.object({
  theme: z.string().min(1),
  evidence: z.string().min(1),
  recommendation: z.string().min(1),
});
export type NightlyAdviceFailureCluster = z.infer<typeof failureClusterItemSchema>;

const signalRiskUpdateSchema = z.object({
  targetPct: z.number().min(0.5).max(15).nullable().optional(),
  stopPct: z.number().min(0.5).max(10).optional(),
});

const parameterBoundsSchemas = {
  macroMomentum24hThresholdPts: z.number().min(2).max(20),
  contrarianTrendMarginPct: z.number().min(0).max(5),
  positiveMomentum24hPct: z.number().min(0).max(10),
  llmTradeExpiryDays: z.number().int().min(3).max(30),
  momentumLongExpiryDays: z.number().int().min(3).max(45),
} as const;

export interface NightlyAdviceParameterUpdates {
  macroMomentum24hThresholdPts?: number;
  contrarianTrendMarginPct?: number;
  positiveMomentum24hPct?: number;
  llmTradeExpiryDays?: number;
  momentumLongExpiryDays?: number;
  signalRisk?: Record<string, { targetPct?: number | null; stopPct?: number }>;
}

export interface NightlyAdvice {
  strategyReview?: string;
  failureClusters: NightlyAdviceFailureCluster[];
  newHypotheses: NightlyAdviceHypothesis[];
  hypothesisReviews: NightlyAdviceHypothesisReview[];
  parameterUpdates?: NightlyAdviceParameterUpdates;
  journalEntry?: string;
}

function filterValid<T>(schema: z.ZodType<T>, raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function sanitizeParameterUpdates(raw: unknown): NightlyAdviceParameterUpdates | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const out: NightlyAdviceParameterUpdates = {};

  for (const [key, schema] of Object.entries(parameterBoundsSchemas) as Array<[keyof typeof parameterBoundsSchemas, z.ZodTypeAny]>) {
    if (!(key in src)) continue;
    const parsed = schema.safeParse(src[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }

  if (src.signalRisk && typeof src.signalRisk === "object") {
    const signalRisk: Record<string, { targetPct?: number | null; stopPct?: number }> = {};
    for (const [signalType, update] of Object.entries(src.signalRisk as Record<string, unknown>)) {
      const parsed = signalRiskUpdateSchema.safeParse(update);
      if (parsed.success) signalRisk[signalType] = parsed.data;
    }
    if (Object.keys(signalRisk).length > 0) out.signalRisk = signalRisk;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Extracts + parses the LLM's JSON response into a NightlyAdvice object.
 * Never throws: malformed JSON or an unparseable top-level shape returns
 * `{advice: null, error}`; out-of-bounds array items or parameter fields
 * are individually dropped (see design note above) rather than failing the
 * whole response.
 */
export function parseNightlyAdvice(
  text: string,
  opts: { allowedOriginFindingIds?: Iterable<string> } = {},
): { advice: NightlyAdvice | null; error: string | null } {
  const jsonText = extractLlmJsonObject(text);
  if (!jsonText) return { advice: null, error: "No balanced JSON object found in response" };

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (e: any) {
    return { advice: null, error: e?.message ?? "JSON.parse failed" };
  }
  if (!raw || typeof raw !== "object") {
    return { advice: null, error: "Top-level JSON is not an object" };
  }
  const src = raw as Record<string, unknown>;
  const allowedOriginFindingIds = opts.allowedOriginFindingIds
    ? new Set(Array.from(opts.allowedOriginFindingIds))
    : null;
  const newHypotheses = filterValid(hypothesisItemSchema, src.newHypotheses)
    .filter((h) => !allowedOriginFindingIds || allowedOriginFindingIds.has(h.originFindingId));

  const advice: NightlyAdvice = {
    strategyReview: typeof src.strategyReview === "string" && src.strategyReview ? src.strategyReview : undefined,
    failureClusters: filterValid(failureClusterItemSchema, src.failureClusters),
    newHypotheses,
    hypothesisReviews: filterValid(hypothesisReviewItemSchema, src.hypothesisReviews),
    parameterUpdates: sanitizeParameterUpdates(src.parameterUpdates),
    journalEntry: typeof src.journalEntry === "string" && src.journalEntry ? src.journalEntry : undefined,
  };
  return { advice, error: null };
}

// ─── I/O wrapper ────────────────────────────────────────────────────────────

export interface RunNightlyLlmStepOptions {
  dataDir: string;
  retiredSetupIds?: string[];
  now?: Date;
}

export interface RunNightlyLlmStepResult {
  skipped: boolean;
  wrote: boolean;
  error?: string;
}

function readJsonOrNull(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function loadHypothesesSummaries(path: string): NightlyHypothesisSummary[] {
  const raw = readJsonOrNull(path);
  if (!Array.isArray(raw)) return [];
  return raw.filter((h): h is NightlyHypothesisSummary =>
    !!h && typeof h === "object"
    && typeof (h as any).id === "string"
    && typeof (h as any).status === "string"
    && typeof (h as any).description === "string");
}

function loadResearchThemesSummary(path: string): NightlyResearchThemeSummary[] {
  const raw = readJsonOrNull(path);
  const themes = raw && typeof raw === "object" && Array.isArray((raw as any).themes)
    ? (raw as any).themes
    : Array.isArray(raw) ? raw : [];
  return themes.filter((t: unknown): t is NightlyResearchThemeSummary =>
    !!t && typeof t === "object"
    && typeof (t as any).id === "string"
    && /^THEME-\d{4}$/.test((t as any).id));
}

function themeIdByFindingId(themes: NightlyResearchThemeSummary[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const theme of themes) {
    for (const findingId of theme.findingIds ?? []) {
      if (/^FIND-\d{4}$/.test(findingId)) out.set(findingId, theme.id);
    }
  }
  return out;
}

function loadRankedResearchOpportunities(path: string, themes: NightlyResearchThemeSummary[]): NightlyResearchOpportunity[] {
  const raw = readJsonOrNull(path);
  if (!raw || typeof raw !== "object") return [];
  const src = raw as Record<string, unknown>;
  const opportunities = Array.isArray(src.opportunities) ? src.opportunities : [];
  const topN = typeof src.topN === "number" && Number.isFinite(src.topN) ? Math.max(0, Math.floor(src.topN)) : opportunities.length;
  const themeByFinding = themeIdByFindingId(themes);
  return opportunities
    .slice(0, topN)
    .filter((item): item is Record<string, unknown> =>
      !!item && typeof item === "object"
      && typeof (item as any).id === "string"
      && /^FIND-\d{4}$/.test((item as any).id))
    .map((item) => {
      const id = item.id as string;
      const themeId = typeof item.themeId === "string" && /^THEME-\d{4}$/.test(item.themeId)
        ? item.themeId
        : themeByFinding.get(id);
      return {
        rank: typeof item.rank === "number" ? item.rank : undefined,
        id,
        clusterKey: typeof item.clusterKey === "string" ? item.clusterKey : undefined,
        opportunityScore: typeof item.opportunityScore === "number" ? item.opportunityScore : undefined,
        confidenceScore: typeof item.confidenceScore === "number" ? item.confidenceScore : undefined,
        evidence: item.evidence,
        themeId,
        title: typeof item.title === "string" ? item.title : undefined,
      };
    });
}

function buildRepairPrompt(parseError: string, previousText: string): string {
  return `Your previous response was not valid JSON and could not be parsed.

Parse error: ${parseError}

Return ONLY a corrected JSON object that follows the original schema exactly. Do not include markdown, comments, or explanation. Preserve the same analysis as much as possible.

Previous response:
${previousText.slice(0, 12000)}`;
}

function buildEmptyAdviceRepairPrompt(previousText: string, opportunityCount: number): string {
  return `Your previous response parsed as valid JSON but was an empty stub: no strategyReview, no newHypotheses, no hypothesisReviews, no failureClusters, and no journalEntry.

The original prompt listed ${opportunityCount} ranked research opportunities. Empty advice is not acceptable when opportunities are present. You MUST return a substantive JSON object that includes at least:
- a non-empty strategyReview, and
- up to 10 newHypotheses drawn from those ranked opportunities (or explicitly justify zero hypotheses inside strategyReview while still reviewing/hypothesizing something actionable)

Return ONLY a corrected JSON object that follows the original schema exactly. Do not include markdown, comments, or explanation.

Previous response:
${previousText.slice(0, 12000)}`;
}

/** True when advice has any non-empty actionable content beyond an empty shell. */
export function isSubstantiveNightlyAdvice(advice: NightlyAdvice): boolean {
  return Boolean(
    (advice.strategyReview && advice.strategyReview.trim())
    || (advice.journalEntry && advice.journalEntry.trim())
    || advice.newHypotheses.length > 0
    || advice.hypothesisReviews.length > 0
    || advice.failureClusters.length > 0
    || advice.parameterUpdates,
  );
}

function logLlmResponse(label: string, resp: { text: string; stopReason?: string | null }): void {
  const text = resp.text ?? "";
  const preview = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
  console.log(
    `[nightly-llm] ${label}: chars=${text.length} finish_reason=${resp.stopReason ?? "null"} raw=${JSON.stringify(preview)}`,
  );
}

/**
 * Async I/O wrapper: resolves the nightly_research route, loads inputs from
 * dataDir (tolerating missing files), calls the LLM with one repair
 * round-trip on parse failure or empty advice (when opportunities exist),
 * and atomically writes data/nightly-llm-advice.json. Never throws on
 * LLM/API failure — callers should treat a `{skipped:false, wrote:false}`
 * result as a step failure without crashing the orchestrator.
 */
export async function runNightlyLlmStep(opts: RunNightlyLlmStepOptions): Promise<RunNightlyLlmStepResult> {
  if (process.env.NIGHTLY_LLM_DISABLE === "1") {
    console.log("[nightly-llm] NIGHTLY_LLM_DISABLE=1; skipping.");
    return { skipped: true, wrote: false };
  }

  const route = resolveLlmRoute("nightly_research");
  if (!route) {
    console.log("[nightly-llm] no API key for nightly_research route; skipping");
    return { skipped: true, wrote: false };
  }

  const truthState = readJsonOrNull(join(opts.dataDir, "llm-truth-state.json"));
  const engineState = readJsonOrNull(join(opts.dataDir, "engine-state.json"));
  const lessons = readJsonOrNull(join(opts.dataDir, "lessons.json"));
  const learningParams = readJsonOrNull(join(opts.dataDir, "learning-params.json"));
  const hypotheses = loadHypothesesSummaries(join(opts.dataDir, "hypotheses.json"));
  const themes = loadResearchThemesSummary(join(opts.dataDir, "research-themes.json"));
  const opportunities = loadRankedResearchOpportunities(join(opts.dataDir, "research-opportunities.json"), themes);
  const allowedOriginFindingIds = new Set(opportunities.map((o) => o.id));

  const prompt = buildNightlyResearchPrompt({
    truthState,
    engineState,
    lessons,
    hypotheses,
    learningParams,
    opportunities,
    themes,
    retiredSetupIds: opts.retiredSetupIds ?? [],
  });
  console.log(`[nightly-llm] prompt: ${prompt.length} chars (provider=${route.provider}, model=${route.model}, opportunities=${opportunities.length}).`);

  try {
    // deepseek-v4-pro thinking tokens count against max_tokens; 8k truncated
    // mid-JSON on a normal night. 32k leaves headroom for CoT + full advice.
    const maxTokens = 32_768;
    const first = await requestLlmText(route, [{ role: "user", content: prompt }], { maxTokens });
    logLlmResponse("response#1", first);
    let lastText = first.text;
    let parsed = parseNightlyAdvice(first.text, { allowedOriginFindingIds });

    if (!parsed.advice) {
      console.log(`[nightly-llm] invalid JSON (${parsed.error}); requesting repair.${first.stopReason ? ` finish_reason=${first.stopReason}` : ""}`);
      const repaired = await requestLlmText(route, [
        { role: "user", content: prompt },
        { role: "assistant", content: first.text },
        { role: "user", content: buildRepairPrompt(parsed.error ?? "unknown parse error", first.text) },
      ], { maxTokens });
      logLlmResponse("response#2-parse-repair", repaired);
      lastText = repaired.text;
      parsed = parseNightlyAdvice(repaired.text, { allowedOriginFindingIds });
      if (!parsed.advice) {
        console.log(`[nightly-llm] repair failed: ${parsed.error}${repaired.stopReason ? ` finish_reason=${repaired.stopReason}` : ""}`);
        return { skipped: false, wrote: false, error: parsed.error ?? "unknown parse error" };
      }
      console.log("[nightly-llm] repaired JSON response parsed successfully.");
    }

    if (opportunities.length > 0 && parsed.advice && !isSubstantiveNightlyAdvice(parsed.advice)) {
      console.log(
        `[nightly-llm] empty advice while ${opportunities.length} opportunities present; requesting repair.`,
      );
      const repaired = await requestLlmText(route, [
        { role: "user", content: prompt },
        { role: "assistant", content: lastText },
        { role: "user", content: buildEmptyAdviceRepairPrompt(lastText, opportunities.length) },
      ], { maxTokens });
      logLlmResponse("response#2-empty-repair", repaired);
      parsed = parseNightlyAdvice(repaired.text, { allowedOriginFindingIds });
      if (!parsed.advice) {
        const err = parsed.error ?? "empty-advice repair produced unparseable JSON";
        console.log(`[nightly-llm] empty-advice repair failed: ${err}${repaired.stopReason ? ` finish_reason=${repaired.stopReason}` : ""}`);
        return { skipped: false, wrote: false, error: err };
      }
      if (!isSubstantiveNightlyAdvice(parsed.advice)) {
        const err = `empty advice after repair despite ${opportunities.length} ranked opportunities`;
        console.log(`[nightly-llm] ${err}`);
        return { skipped: false, wrote: false, error: err };
      }
      console.log("[nightly-llm] empty-advice repair produced substantive advice.");
    }

    const outFile = join(opts.dataDir, "nightly-llm-advice.json");
    const payload = {
      generatedAt: (opts.now ?? new Date()).toISOString(),
      provider: route.provider,
      model: route.model,
      ...parsed.advice,
    };
    const tmp = `${outFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n");
    renameSync(tmp, outFile);
    console.log(`[nightly-llm] wrote ${outFile} (newHypotheses=${parsed.advice!.newHypotheses.length}, hypothesisReviews=${parsed.advice!.hypothesisReviews.length}, failureClusters=${parsed.advice!.failureClusters.length}).`);
    return { skipped: false, wrote: true };
  } catch (e: any) {
    console.log(`[nightly-llm] error: ${e?.message ?? e}`);
    return { skipped: false, wrote: false, error: e?.message ?? String(e) };
  }
}
