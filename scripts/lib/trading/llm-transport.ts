/**
 * LLM provider routing and transport (July 2026 infrastructure plan, Phase 5).
 *
 * Model routing is per call site, not global: the hourly engine runs a cheap
 * model for close review / summarization, while the nightly research run can
 * use the strongest configured model for hypothesis generation and strategy
 * review. Both call sites share this transport so provider quirks live in
 * one place.
 *
 * Env resolution is backwards compatible with the pre-Phase-5 production
 * setup, where LLM_PROVIDER=deepseek ran with the DeepSeek key stored in
 * ANTHROPIC_API_KEY and the DeepSeek model name in ANTHROPIC_MODEL.
 */

export type LlmProvider = "deepseek" | "anthropic";
export type LlmCallSite = "hourly_engine" | "nightly_research";

export interface LlmRoute {
  callSite: LlmCallSite;
  provider: LlmProvider;
  model: string;
  apiKey: string;
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

function normalizeProvider(value: string | undefined): LlmProvider | null {
  if (value === "deepseek" || value === "anthropic") return value;
  return null;
}

/**
 * Resolve the provider/model/key for a call site. Returns null when no API
 * key is available for the resolved provider — callers must treat that as
 * "skip LLM work", never as an error that blocks the run.
 *
 * Per-site overrides win over the legacy globals:
 * - hourly_engine:    HOURLY_LLM_PROVIDER / HOURLY_LLM_MODEL
 * - nightly_research: NIGHTLY_LLM_PROVIDER / NIGHTLY_LLM_MODEL
 * Fallbacks: LLM_PROVIDER (default anthropic), ANTHROPIC_MODEL.
 * Keys: DEEPSEEK_API_KEY preferred for deepseek (legacy fallback:
 * ANTHROPIC_API_KEY); ANTHROPIC_API_KEY for anthropic.
 */
export function resolveLlmRoute(
  callSite: LlmCallSite,
  env: Record<string, string | undefined> = process.env,
): LlmRoute | null {
  const prefix = callSite === "hourly_engine" ? "HOURLY" : "NIGHTLY";
  const provider = normalizeProvider(env[`${prefix}_LLM_PROVIDER`])
    ?? normalizeProvider(env.LLM_PROVIDER)
    ?? "anthropic";
  const model = env[`${prefix}_LLM_MODEL`]
    ?? env.ANTHROPIC_MODEL
    ?? DEFAULT_ANTHROPIC_MODEL;
  const apiKey = provider === "deepseek"
    ? (env.DEEPSEEK_API_KEY ?? env.ANTHROPIC_API_KEY)
    : env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return { callSite, provider, model, apiKey };
}

export type LlmMessage = { role: "user" | "assistant"; content: string };

export interface LlmTextResponse {
  text: string;
  stopReason: string | null;
}

const DEFAULT_TIMEOUT_MS = 300_000;

function anthropicText(data: any): string {
  const content = Array.isArray(data?.content) ? data.content : [];
  return content
    .map((block: any) => typeof block?.text === "string" ? block.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function requestLlmText(
  route: LlmRoute,
  messages: LlmMessage[],
  opts: { timeoutMs?: number; maxTokens?: number; temperature?: number } = {},
): Promise<LlmTextResponse> {
  const timeoutMs = opts.timeoutMs ?? Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxTokens = opts.maxTokens ?? 16384;
  const temperature = opts.temperature ?? 0.2;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (route.provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${route.apiKey}`,
        },
        body: JSON.stringify({
          model: route.model,
          max_tokens: maxTokens,
          temperature,
          messages,
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek API error: ${res.status} ${res.statusText}`);
      const data = await res.json() as any;
      const choice = data?.choices?.[0];
      return {
        text: choice?.message?.content?.trim() ?? "",
        stopReason: choice?.finish_reason ?? null,
      };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": route.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: route.model,
        max_tokens: maxTokens,
        temperature,
        messages,
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
    const data = await res.json() as any;
    return { text: anthropicText(data), stopReason: data.stop_reason ?? null };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`LLM request timeout after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract the first balanced top-level JSON object from an LLM response,
 * tolerating markdown fences and surrounding prose.
 */
export function extractLlmJsonObject(text: string): string | null {
  const trimmed = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const candidates: number[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "{") candidates.push(i);
  }

  for (const start of candidates) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = inString;
        continue;
      }
      if (ch === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) return trimmed.slice(start, i + 1);
      }
    }
  }

  return null;
}
