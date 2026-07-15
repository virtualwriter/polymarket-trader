/**
 * Telegram command bot for the paper trader.
 *
 * This is intentionally a narrow control layer around existing state files. It
 * does not run the trader, call the LLM, or execute arbitrary shell commands.
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

type JsonObject = Record<string, unknown>;

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string };
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

type PendingAction = {
  id: string;
  type: "close_shadow";
  chatId: string;
  instrumentId: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const RUNTIME_DIR = join(ROOT, ".runtime");
const ACTIONS_FILE = join(RUNTIME_DIR, "telegram-actions.json");
const OFFSET_FILE = join(RUNTIME_DIR, "telegram-offset.json");
const TELEGRAM_API = "https://api.telegram.org";
const MAX_TELEGRAM_MESSAGE = 3900;
const TELEGRAM_LLM_MAX_CONTEXT_CHARS = Number(process.env.TELEGRAM_LLM_MAX_CONTEXT_CHARS ?? 48_000);
const TELEGRAM_LLM_MAX_TOKENS = Number(process.env.TELEGRAM_LLM_MAX_TOKENS ?? 900);
const LLM_PROVIDER = process.env.LLM_PROVIDER ?? "anthropic";
const LLM_REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 120_000);

config({ path: resolve(ROOT, ".env") });
config({ path: resolve(ROOT, "config.env") });

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function obj(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function arr(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(obj) : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function fmtNum(value: unknown, digits = 2): string {
  const parsed = num(value);
  return parsed === null ? "n/a" : parsed.toFixed(digits);
}

function fmtPct(value: unknown): string {
  const parsed = num(value);
  return parsed === null ? "n/a" : `${parsed >= 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function utcNow(): string {
  return new Date().toISOString();
}

function loadActions(): PendingAction[] {
  const actions = readJson<PendingAction[]>(ACTIONS_FILE, []);
  const now = Date.now();
  return actions.filter((action) => Date.parse(action.expiresAt) > now);
}

function saveActions(actions: PendingAction[]): void {
  writeJson(ACTIONS_FILE, actions);
}

function loadOffset(): number {
  return num(readJson<JsonObject>(OFFSET_FILE, {}).offset) ?? 0;
}

function saveOffset(offset: number): void {
  writeJson(OFFSET_FILE, { offset, updatedAt: utcNow() });
}

function actionId(): string {
  return `tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function dataPath(file: string): string {
  return join(DATA_DIR, file);
}

function heatmapPath(): string {
  const latest = join(ROOT, "relative-value", "latest.json");
  const live = join(ROOT, "relative-value", "latest-live.json");
  const latestGenerated = Date.parse(str(readJson<JsonObject>(latest, {}).generatedAt));
  const liveGenerated = Date.parse(str(readJson<JsonObject>(live, {}).generatedAt));
  if (existsSync(live) && Number.isFinite(liveGenerated) && (!Number.isFinite(latestGenerated) || liveGenerated >= latestGenerated)) {
    return live;
  }
  return latest;
}

function findHeatmapRow(instrumentId: string): JsonObject | null {
  const [eventSlug, marketId] = instrumentId.split("::");
  if (!eventSlug || !marketId) return null;
  const heatmap = readJson<JsonObject>(heatmapPath(), {});
  return arr(heatmap.rows).find((row) =>
    str(row.event_slug) === eventSlug && str(row.market_id) === marketId
  ) ?? null;
}

function shadowInstrumentMatches(positionInstrumentId: string, target: string): boolean {
  if (!target) return false;
  if (target.includes("::")) return positionInstrumentId === target;
  return positionInstrumentId.startsWith(`${target}::`);
}

function markShadowExit(shadow: JsonObject): { exitPrice: number; pnl: number; pnlPct: number } {
  const position = obj(shadow.position);
  const entry = num(position.entryPrice) ?? 0;
  const current = num(position.currentPrice) ?? entry;
  const size = num(position.size) ?? 0;
  const shares = entry > 0 ? size / entry : 0;
  const pnl = shares * (current - entry) + (num(position.fundingPnlAccrued) ?? 0);
  const pnlPct = size > 0 ? (pnl / size) * 100 : 0;
  return { exitPrice: current, pnl, pnlPct };
}

function humanPosition(position: JsonObject): string {
  const asset = str(position.asset, "?");
  const direction = str(position.direction, "?");
  const venue = str(position.venue, "?");
  const signalType = str(position.signalType, "?");
  return `${asset} ${direction} ${venue}/${signalType}`;
}

function commandHelp(): string {
  return [
    "Trader bot commands:",
    "/status - portfolio, freshness, candidates",
    "/open - live open positions",
    "/heatmap <asset> - top heatmap rows for an asset",
    "/noedge - open shadow trades whose current held-side edge is weak/inverted",
    "/shadows [open|resolved|all|<instrument_id>] [asset] - shadow trade history",
    "/manual_touch_pnl - resolved manual IV-touch shadow P&L",
    "/trades_pnl [signal_substring] [days] - closed live trade P&L by signal type",
    "/why_no_trade <asset> - explain blockers from current artifacts, no LLM",
    "/ask <question> - explicit LLM answer using current trader artifacts",
    "/review <asset> - explicit LLM review for one asset",
    "/llm_budget - latest local LLM state if present",
    "/hourly_status - latest trader artifact freshness",
    "/close_shadow <instrument_id> [reason] - preview a manual shadow close",
    "/confirm <action_id> - execute a pending confirmed action",
    "/cancel <action_id> - cancel a pending action",
  ].join("\n");
}

function statusReport(): string {
  const engine = readJson<JsonObject>(dataPath("engine-state.json"), {});
  const candidates = readJson<JsonObject>(dataPath("candidate-actions.json"), {});
  const portfolio = obj(engine.portfolio);
  const freshness = obj(engine.dataFreshness);
  const openPositions = arr(engine.openPositions);
  const entryCandidates = arr(candidates.entryCandidates);

  return [
    "Trader status",
    `Generated: ${str(engine.generatedAt, "n/a")}`,
    `Latest valuation: ${str(freshness.latestValuationAt, "n/a")}`,
    `Latest instrument snapshot: ${str(freshness.latestInstrumentSnapshotAt, "n/a")}`,
    "",
    `Cash: $${fmtNum(portfolio.cash)}`,
    `Open positions: ${fmtNum(portfolio.openPositions, 0)}`,
    `Unrealized P&L: $${fmtNum(portfolio.unrealizedPnl, 4)}`,
    `Realized P&L: $${fmtNum(portfolio.realizedPnl, 4)}`,
    `Win rate: ${fmtNum(portfolio.winRatePct, 1)}%`,
    "",
    `Entry candidates: ${entryCandidates.length}`,
    ...entryCandidates.slice(0, 5).map((candidate) =>
      `- ${str(candidate.asset)} ${str(candidate.direction)} ${str(candidate.type)} conf=${fmtNum(candidate.confidence, 3)}`
    ),
    "",
    `Open live positions shown by engine: ${openPositions.length}`,
  ].join("\n");
}

function openPositionsReport(): string {
  const engine = readJson<JsonObject>(dataPath("engine-state.json"), {});
  const positions = arr(engine.openPositions);
  if (positions.length === 0) return "No open live positions in engine-state.json.";
  return [
    "Open live positions",
    ...positions.map((position) =>
      `- ${str(position.positionId)} ${str(position.asset)} ${str(position.direction)} ${str(position.venue)}/${str(position.signalType)} P&L ${fmtPct(position.pnlPct)} mark=${fmtNum(position.currentPrice, 4)} underlying=${fmtNum(position.underlyingPrice, 4)}`
    ),
  ].join("\n");
}

function heatmapReport(assetArg: string | undefined): string {
  const asset = assetArg?.toUpperCase();
  if (!asset) return "Usage: /heatmap HYPE";
  const heatmap = readJson<JsonObject>(heatmapPath(), {});
  const rows = arr(heatmap.rows)
    .filter((row) => str(row.asset).toUpperCase() === asset)
    .sort((a, b) => Math.abs(num(b.edge_score) ?? 0) - Math.abs(num(a.edge_score) ?? 0))
    .slice(0, 12);
  if (rows.length === 0) return `No heatmap rows found for ${asset}.`;
  return [
    `${asset} heatmap`,
    `Snapshot: ${str(heatmap.snapshotTimestamp, "n/a")} generated ${str(heatmap.generatedAt, "n/a")}`,
    ...rows.map((row) => {
      const expr = str(row.best_expression, "n/a");
      const q = str(row.contract_question).replace(/\s+/g, " ");
      return `- ${str(row.direction)} ${fmtNum(row.strike, 2)} ${expr} edge=${fmtNum(row.edge_score, 2)}pts optTouch=${fmtNum(row.options_touch_adjusted_prob, 3)} pmYES=${fmtNum(row.pm_yes_price, 3)} spread=${fmtNum(row.pm_spread, 3)} ${q}`;
    }),
  ].join("\n");
}

function noEdgeReport(): string {
  const shadows = readJson<JsonObject[]>(dataPath("blocked-signals.json"), []);
  const rows = shadows
    .filter((shadow) => str(shadow.status) === "open")
    .map((shadow) => {
      const position = obj(shadow.position);
      const instrumentId = str(position.instrumentId);
      const row = findHeatmapRow(instrumentId);
      if (!row) return null;
      const heldSide = str(position.instrumentType) === "pm_no" || str(position.direction) === "short" || str(position.instrumentLabel).includes(" NO ")
        ? "NO"
        : "YES";
      const heldEdge = heldSide === "NO" ? num(row.sell_yes_edge_pts) : num(row.buy_yes_edge_pts);
      if (heldEdge === null || heldEdge > 2) return null;
      const mark = markShadowExit(shadow);
      return { shadow, position, row, heldSide, heldEdge, pnlPct: mark.pnlPct };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.heldEdge - b.heldEdge)
    .slice(0, 12);

  if (rows.length === 0) return "No open non-package shadows currently show weak or inverted held-side edge in the heatmap.";
  return [
    "Open shadows with weak/inverted current edge",
    ...rows.map(({ position, heldSide, heldEdge, pnlPct, row }) =>
      `- ${str(position.instrumentId)} ${str(row.asset)} ${heldSide} heldEdge=${heldEdge.toFixed(2)}pts P&L=${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% best=${str(row.best_expression)}`
    ),
  ].join("\n");
}

function shadowSortTime(shadow: JsonObject): number {
  const candidates = [
    str(shadow.resolvedAt),
    str(obj(shadow.position).openedAt),
    str(shadow.blockedAt),
  ];
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function shadowLine(shadow: JsonObject): string {
  const position = obj(shadow.position);
  const result = obj(shadow.hypotheticalResult);
  const mark = markShadowExit(shadow);
  const status = str(shadow.status, "?");
  const resultPnlPct = result.pnlPct !== undefined ? fmtPct(result.pnlPct) : `${mark.pnlPct >= 0 ? "+" : ""}${mark.pnlPct.toFixed(2)}% mark`;
  const closeReason = str(result.closeReason);
  const time = status === "resolved" ? str(shadow.resolvedAt, "n/a") : str(position.openedAt, str(shadow.blockedAt, "n/a"));
  return [
    `- ${time.slice(0, 16)}`,
    status,
    str(shadow.asset, "?"),
    str(shadow.signalType, "?"),
    str(shadow.blockedReason, "?"),
    str(position.instrumentId, "n/a"),
    `entry=${fmtNum(position.entryPrice, 4)}`,
    `mark=${fmtNum(position.currentPrice, 4)}`,
    `pnl=${resultPnlPct}`,
    closeReason ? `reason=${closeReason}` : "",
  ].filter(Boolean).join(" | ");
}

function shadowsReport(args: string[]): string {
  const shadows = readJson<JsonObject[]>(dataPath("blocked-signals.json"), []);
  const first = args[0]?.trim();
  const second = args[1]?.trim();
  const modes = new Set(["open", "resolved", "all"]);
  const mode = first && modes.has(first.toLowerCase()) ? first.toLowerCase() : null;
  const instrument = first && !mode ? first : null;
  const asset = (mode ? second : second)?.toUpperCase();

  if (first === "help") {
    return [
      "Usage:",
      "/shadows open [asset]",
      "/shadows resolved [asset]",
      "/shadows all [asset]",
      "/shadows <instrument_id>",
    ].join("\n");
  }

  let rows = shadows;
  if (mode && mode !== "all") rows = rows.filter((shadow) => str(shadow.status) === mode);
  if (instrument) rows = rows.filter((shadow) => shadowInstrumentMatches(str(obj(shadow.position).instrumentId), instrument));
  if (asset) rows = rows.filter((shadow) => str(shadow.asset).toUpperCase() === asset);

  rows = rows.slice().sort((a, b) => shadowSortTime(b) - shadowSortTime(a));
  const openCount = shadows.filter((shadow) => str(shadow.status) === "open").length;
  const resolvedCount = shadows.filter((shadow) => str(shadow.status) === "resolved").length;
  const scope = instrument ? instrument : [mode ?? "recent", asset].filter(Boolean).join(" ");
  if (rows.length === 0) return `No shadow trades found for ${scope || "query"}. Open=${openCount}, resolved=${resolvedCount}.`;

  const limit = instrument ? 20 : 15;
  return [
    `Shadow trades: ${scope || "recent"} (${rows.length} match${rows.length === 1 ? "" : "es"}; showing ${Math.min(limit, rows.length)})`,
    `Totals: open=${openCount}, resolved=${resolvedCount}`,
    ...rows.slice(0, limit).map(shadowLine),
  ].join("\n");
}

function manualTouchPnlSummary(): JsonObject {
  const shadows = readJson<JsonObject[]>(dataPath("blocked-signals.json"), [])
    .filter((shadow) => str(shadow.status) === "resolved")
    .filter((shadow) => str(shadow.blockedReason) === "manual_shadow_trade")
    .filter((shadow) => str(shadow.signalType).startsWith("USER_PM_IV_TOUCH_"));
  const bySignal: Record<string, JsonObject> = {};
  const byAsset: Record<string, JsonObject> = {};
  const bySource: Record<string, JsonObject> = {};
  let wins = 0;
  let pnl = 0;
  let pnlPct = 0;

  function addBucket(bucket: Record<string, JsonObject>, key: string, rowPnl: number, rowPnlPct: number): void {
    const current = bucket[key] ?? { count: 0, wins: 0, pnl: 0, pnlPctSum: 0 };
    current.count = (num(current.count) ?? 0) + 1;
    current.wins = (num(current.wins) ?? 0) + (rowPnl >= 0 ? 1 : 0);
    current.pnl = (num(current.pnl) ?? 0) + rowPnl;
    current.pnlPctSum = (num(current.pnlPctSum) ?? 0) + rowPnlPct;
    bucket[key] = current;
  }

  for (const shadow of shadows) {
    const result = obj(shadow.hypotheticalResult);
    const rowPnl = num(result.pnl) ?? 0;
    const rowPnlPct = num(result.pnlPct) ?? 0;
    wins += rowPnl >= 0 ? 1 : 0;
    pnl += rowPnl;
    pnlPct += rowPnlPct;
    addBucket(bySignal, str(shadow.signalType, "unknown"), rowPnl, rowPnlPct);
    addBucket(byAsset, str(shadow.asset, "unknown"), rowPnl, rowPnlPct);
    addBucket(bySource, str(shadow.entrySource, "legacy_unspecified"), rowPnl, rowPnlPct);
  }

  function finalize(bucket: Record<string, JsonObject>): Record<string, JsonObject> {
    return Object.fromEntries(Object.entries(bucket).map(([key, value]) => {
      const count = num(value.count) ?? 0;
      return [key, {
        count,
        wins: num(value.wins) ?? 0,
        losses: count - (num(value.wins) ?? 0),
        pnl: Number((num(value.pnl) ?? 0).toFixed(4)),
        avgPnlPct: count > 0 ? Number(((num(value.pnlPctSum) ?? 0) / count).toFixed(2)) : 0,
      }];
    }));
  }

  return {
    count: shadows.length,
    wins,
    losses: shadows.length - wins,
    totalPnl: Number(pnl.toFixed(4)),
    avgPnlPct: shadows.length > 0 ? Number((pnlPct / shadows.length).toFixed(2)) : 0,
    bySource: finalize(bySource),
    bySignal: finalize(bySignal),
    byAsset: finalize(byAsset),
    latest: shadows
      .slice()
      .sort((a, b) => shadowSortTime(b) - shadowSortTime(a))
      .slice(0, 12)
      .map((shadow) => {
        const position = obj(shadow.position);
        const result = obj(shadow.hypotheticalResult);
        return {
          resolvedAt: shadow.resolvedAt,
          asset: shadow.asset,
          signalType: shadow.signalType,
          instrumentId: position.instrumentId,
          closeReason: result.closeReason,
          pnl: result.pnl,
          pnlPct: result.pnlPct,
        };
      }),
  };
}

function manualTouchPnlReport(): string {
  const summary = manualTouchPnlSummary();
  const count = num(summary.count) ?? 0;
  if (count === 0) return "No resolved manual IV-touch shadow trades found.";
  const bySignal = obj(summary.bySignal);
  const byAsset = obj(summary.byAsset);
  const bySource = obj(summary.bySource);
  const lines = [
    "Manual IV-touch shadow P&L",
    `Resolved: ${count}; wins=${fmtNum(summary.wins, 0)} losses=${fmtNum(summary.losses, 0)}`,
    `Total P&L: $${fmtNum(summary.totalPnl, 4)}`,
    `Avg P&L/trade: ${fmtPct(summary.avgPnlPct)}`,
    "",
    "By source:",
    ...Object.entries(bySource).map(([key, value]) => {
      const row = obj(value);
      return `- ${key}: ${fmtNum(row.wins, 0)}/${fmtNum(row.count, 0)} wins, P&L $${fmtNum(row.pnl, 4)}, avg ${fmtPct(row.avgPnlPct)}`;
    }),
    "",
    "By signal:",
    ...Object.entries(bySignal).map(([key, value]) => {
      const row = obj(value);
      return `- ${key}: ${fmtNum(row.wins, 0)}/${fmtNum(row.count, 0)} wins, P&L $${fmtNum(row.pnl, 4)}, avg ${fmtPct(row.avgPnlPct)}`;
    }),
    "",
    "By asset:",
    ...Object.entries(byAsset).map(([key, value]) => {
      const row = obj(value);
      return `- ${key}: ${fmtNum(row.wins, 0)}/${fmtNum(row.count, 0)} wins, P&L $${fmtNum(row.pnl, 4)}, avg ${fmtPct(row.avgPnlPct)}`;
    }),
  ];
  return lines.join("\n");
}

function whyNoTradeReport(assetArg: string | undefined): string {
  const asset = assetArg?.toUpperCase();
  if (!asset) return "Usage: /why_no_trade HYPE";
  const engine = readJson<JsonObject>(dataPath("engine-state.json"), {});
  const candidates = readJson<JsonObject>(dataPath("candidate-actions.json"), {});
  const openPositions = arr(engine.openPositions).filter((position) => str(position.asset).toUpperCase() === asset);
  const entryCandidates = arr(candidates.entryCandidates).filter((candidate) => str(candidate.asset).toUpperCase() === asset);
  const health = arr(engine.signalHealth).filter((row) => {
    const disabledAssets = Array.isArray(row.disabledAssets) ? row.disabledAssets.map(String) : [];
    return disabledAssets.includes(asset);
  });
  const heatmap = readJson<JsonObject>(heatmapPath(), {});
  const rows = arr(heatmap.rows).filter((row) => str(row.asset).toUpperCase() === asset);
  const eligible = rows.filter((row) => str(row.eligible_for_shadow).toLowerCase() === "true" || row.eligible_for_shadow === true);

  return [
    `${asset} no-trade check (artifact-only, no LLM)`,
    `Entry candidates: ${entryCandidates.length}`,
    ...entryCandidates.slice(0, 5).map((candidate) => `- candidate ${str(candidate.type)} ${str(candidate.direction)} conf=${fmtNum(candidate.confidence, 3)} ${str(candidate.thesis).slice(0, 140)}`),
    `Open live positions in same asset: ${openPositions.length}`,
    ...openPositions.map((position) => `- ${str(position.positionId)} ${str(position.direction)} ${str(position.signalType)} P&L ${fmtPct(position.pnlPct)}`),
    `Heatmap rows: ${rows.length}; eligible_for_shadow: ${eligible.length}`,
    ...rows
      .sort((a, b) => Math.abs(num(b.edge_score) ?? 0) - Math.abs(num(a.edge_score) ?? 0))
      .slice(0, 5)
      .map((row) => `- ${str(row.direction)} ${fmtNum(row.strike, 2)} best=${str(row.best_expression)} edge=${fmtNum(row.edge_score, 2)}pts flags=${str(row.flags) || "none"}`),
    health.length ? `Disabled signal/asset notes: ${health.map((row) => str(row.type)).join(", ")}` : "No disabled signal-health entries explicitly list this asset.",
  ].join("\n");
}

function llmBudgetReport(): string {
  const llmState = readJson<JsonObject>(dataPath("llm-state.json"), {});
  if (Object.keys(llmState).length === 0) {
    return "No local data/llm-state.json found. The next trader dry/run will recreate it if LLM cadence state is enabled.";
  }
  return [
    "LLM state",
    `Last call: ${str(llmState.lastCallAt, "n/a")}`,
    `Skips since last call: ${fmtNum(llmState.skipsSinceLastCall, 0)}`,
    `Daily call counts: ${JSON.stringify(llmState.dailyCallCounts ?? {})}`,
    `Recent skip reasons: ${Array.isArray(llmState.recentSkipReasons) ? llmState.recentSkipReasons.slice(0, 4).join(" | ") : "n/a"}`,
  ].join("\n");
}

function hourlyStatusReport(): string {
  const engine = readJson<JsonObject>(dataPath("engine-state.json"), {});
  const candidates = readJson<JsonObject>(dataPath("candidate-actions.json"), {});
  const execution = readJson<JsonObject>(dataPath("execution-plan.json"), {});
  const freshness = obj(engine.dataFreshness);
  return [
    "Hourly artifact status",
    `Engine generated: ${str(engine.generatedAt, "n/a")}`,
    `Candidates generated: ${str(candidates.generatedAt, "n/a")}`,
    `Execution plan generated: ${str(execution.generatedAt, "n/a")}`,
    `Latest valuation: ${str(freshness.latestValuationAt, "n/a")}`,
    `Latest instrument snapshot: ${str(freshness.latestInstrumentSnapshotAt, "n/a")}`,
    `Entry candidates: ${arr(candidates.entryCandidates).length}`,
    `Mechanical exits: ${arr(candidates.mechanicalExits).length}`,
    `LLM close eligibility rows: ${arr(candidates.llmCloseEligibility).length}`,
  ].join("\n");
}

function compactHeatmapRows(asset?: string): JsonObject[] {
  const heatmap = readJson<JsonObject>(heatmapPath(), {});
  return arr(heatmap.rows)
    .filter((row) => !asset || str(row.asset).toUpperCase() === asset.toUpperCase())
    .sort((a, b) => Math.abs(num(b.edge_score) ?? 0) - Math.abs(num(a.edge_score) ?? 0))
    .slice(0, asset ? 16 : 24)
    .map((row) => ({
      asset: row.asset,
      event_slug: row.event_slug,
      market_id: row.market_id,
      question: row.contract_question,
      direction: row.direction,
      strike: row.strike,
      dte_days: row.dte_days,
      spot: row.spot,
      best_expression: row.best_expression,
      edge_score: row.edge_score,
      buy_yes_edge_pts: row.buy_yes_edge_pts,
      sell_yes_edge_pts: row.sell_yes_edge_pts,
      option_iv: row.option_iv,
      options_touch_adjusted_prob: row.options_touch_adjusted_prob,
      pm_yes_price: row.pm_yes_price,
      pm_spread: row.pm_spread,
      liquidity: row.liquidity,
      eligible_for_shadow: row.eligible_for_shadow,
      flags: row.flags,
    }));
}

function compactOpenShadows(asset?: string): JsonObject[] {
  return readJson<JsonObject[]>(dataPath("blocked-signals.json"), [])
    .filter((shadow) => str(shadow.status) === "open")
    .filter((shadow) => !asset || str(shadow.asset).toUpperCase() === asset.toUpperCase())
    .slice(0, asset ? 20 : 35)
    .map((shadow) => {
      const position = obj(shadow.position);
      const mark = markShadowExit(shadow);
      return {
        id: shadow.id,
        blockedReason: shadow.blockedReason,
        signalType: shadow.signalType,
        asset: shadow.asset,
        direction: shadow.direction,
        instrumentId: position.instrumentId,
        instrumentLabel: position.instrumentLabel,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        pnlPct: Number(mark.pnlPct.toFixed(2)),
      };
    });
}

// Mechanical rules for strategies the operator commonly asks about, sourced
// from scripts/trading-engine.ts. Keep in sync when engine constants change.
const STRATEGY_REFERENCE: JsonObject = {
  WEEKEND_HL_FUNDING_REVERSION_LONG: {
    universe: "Hyperliquid Builder DEX stock perps (HYPE_STOCK_BUILDER_ASSETS)",
    window: "US-equity-closed window only: Fri 4:00pm ET through Mon 9:30am ET (America/New_York). Hourly cron at :27, so first entry is Fri 4:27pm ET.",
    entry: "Annualized funding in mid band [-100%, -50%] (shorts paying longs). Open LONG at 5x leverage, standard trade size. Band tightened 2026-06-01 after backtest: shallow band (-30%..-50%) was net-negative, deep band (<-100%) flat, mid band +1.07% avg/trade.",
    exit: "First of: (1) window closes / US market reopens -> close_reason expiry or weekend_window_closed; (2) funding normalizes to >= +10% annualized -> weekend_funding_normalized; (3) margin P&L target +3% hit; (4) max hold 24h expiry. No stop loss (stop set to 100%).",
    source: "scripts/trading-engine.ts (WEEKEND_HL_FUNDING_* constants, weekendHyperliquidFundingCandidates, weekendHyperliquidFundingExitHit, isStockPerpFundingWindowOpen)",
  },
  note: "Rules for other signal types live in scripts/trading-engine.ts on this host; they are not included in these artifacts.",
};

type LedgerTrade = {
  id: string;
  openedAt: string;
  closedAt: string;
  asset: string;
  venue: string;
  direction: string;
  signalType: string;
  pnl: number;
  pnlPct: number;
  marketPnl: number;
  fundingPnl: number;
  closeReason: string;
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function readClosedTradesLedger(): LedgerTrade[] {
  const path = dataPath("trades-detailed.csv");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const idxes = {
    id: col("id"),
    openedAt: col("opened_at"),
    closedAt: col("closed_at"),
    asset: col("asset"),
    venue: col("venue"),
    direction: col("direction"),
    signalType: col("signal_type"),
    pnl: col("pnl"),
    pnlPct: col("pnl_pct"),
    marketPnl: col("market_pnl"),
    fundingPnl: col("funding_pnl"),
    closeReason: col("close_reason"),
  };
  return lines.slice(1)
    .map(parseCsvLine)
    .map((fields) => ({
      id: fields[idxes.id] ?? "",
      openedAt: fields[idxes.openedAt] ?? "",
      closedAt: fields[idxes.closedAt] ?? "",
      asset: fields[idxes.asset] ?? "",
      venue: fields[idxes.venue] ?? "",
      direction: fields[idxes.direction] ?? "",
      signalType: fields[idxes.signalType] ?? "",
      pnl: num(fields[idxes.pnl]) ?? 0,
      pnlPct: num(fields[idxes.pnlPct]) ?? 0,
      marketPnl: num(fields[idxes.marketPnl]) ?? 0,
      fundingPnl: num(fields[idxes.fundingPnl]) ?? 0,
      closeReason: fields[idxes.closeReason] ?? "",
    }))
    .filter((trade) => trade.closedAt !== "")
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
}

// Loaded fresh per report call (not cached) so a relabel_evidence.py --apply
// run while the bot is already running is picked up on the very next command,
// without needing a bot restart. Tolerates a missing file (Phase 0/1 hosts
// that have never tainted a trade).
function loadTaintedTradeIds(): Set<string> {
  const path = dataPath("operationally-tainted-trades.json");
  if (!existsSync(path)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    return new Set(Object.keys(parsed ?? {}));
  } catch {
    return new Set();
  }
}

// data_quality_artifact rows are operational errors / bad marks, explicitly
// excluded from counted P&L per operator. They are reported separately, never
// silently dropped.
function isDataQualityArtifact(trade: LedgerTrade): boolean {
  return trade.closeReason === "data_quality_artifact";
}

// Trades relabeled via scripts/relabel_evidence.py (data/operationally-tainted-trades.json)
// without necessarily changing close_reason — see scripts/portfolio-ledger.ts
// isContaminatedTrade for the canonical definition this mirrors.
function isTaintListExcluded(trade: LedgerTrade, taintedIds: Set<string>): boolean {
  return taintedIds.has(trade.id);
}

function isExcludedFromPnl(trade: LedgerTrade, taintedIds: Set<string>): boolean {
  return isDataQualityArtifact(trade) || isTaintListExcluded(trade, taintedIds);
}

function rollupTradesBySignal(trades: LedgerTrade[]): Record<string, JsonObject> {
  const buckets: Record<string, { count: number; wins: number; pnl: number; marketPnl: number; fundingPnl: number; pnlPctSum: number }> = {};
  for (const trade of trades) {
    const key = trade.signalType || "unknown";
    const bucket = buckets[key] ?? { count: 0, wins: 0, pnl: 0, marketPnl: 0, fundingPnl: 0, pnlPctSum: 0 };
    bucket.count += 1;
    bucket.wins += trade.pnl >= 0 ? 1 : 0;
    bucket.pnl += trade.pnl;
    bucket.marketPnl += trade.marketPnl;
    bucket.fundingPnl += trade.fundingPnl;
    bucket.pnlPctSum += trade.pnlPct;
    buckets[key] = bucket;
  }
  return Object.fromEntries(Object.entries(buckets).map(([key, bucket]) => [key, {
    count: bucket.count,
    wins: bucket.wins,
    losses: bucket.count - bucket.wins,
    pnl: Number(bucket.pnl.toFixed(4)),
    marketPnl: Number(bucket.marketPnl.toFixed(4)),
    fundingPnl: Number(bucket.fundingPnl.toFixed(4)),
    avgPnlPct: bucket.count > 0 ? Number((bucket.pnlPctSum / bucket.count).toFixed(2)) : 0,
  }]));
}

function closedTradesContext(asset?: string): JsonObject {
  const assetUpper = asset?.toUpperCase();
  const taintedIds = loadTaintedTradeIds();
  const ledger = readClosedTradesLedger()
    .filter((trade) => !assetUpper || trade.asset.toUpperCase() === assetUpper);
  const excludedDataQuality = ledger.filter(isDataQualityArtifact);
  const excludedTaint = ledger.filter((trade) => !isDataQualityArtifact(trade) && isTaintListExcluded(trade, taintedIds));
  const all = ledger.filter((trade) => !isExcludedFromPnl(trade, taintedIds));
  const weekAgo = Date.now() - 7 * 86_400_000;
  const last7d = all.filter((trade) => Date.parse(trade.closedAt) >= weekAgo);
  const recent = all.slice(-100).reverse().map((trade) =>
    `${trade.closedAt.slice(0, 10)} ${trade.asset} ${trade.direction} ${trade.venue} ${trade.signalType} pnl=${trade.pnl.toFixed(4)} (mkt=${trade.marketPnl.toFixed(4)} fund=${trade.fundingPnl.toFixed(4)}) opened=${trade.openedAt.slice(0, 10)} ${trade.closeReason}`
  );
  return {
    note: "Closed live trades from trades-detailed.csv, grouped by signal_type. WEEKEND_HL_FUNDING_REVERSION_LONG is the weekend Hyperliquid funding-reversion strategy. Dates are UTC. recentClosedTrades is newest-first. Rows with close_reason data_quality_artifact (operational errors / bad marks) are excluded from all P&L figures and summarized in excludedDataQualityArtifacts; rows whose id is in data/operationally-tainted-trades.json (relabeled evidence, see scripts/relabel_evidence.py) are excluded separately and summarized in excludedTaintListTrades.",
    totalClosedTrades: all.length,
    allTimeBySignalType: rollupTradesBySignal(all),
    last7DaysBySignalType: rollupTradesBySignal(last7d),
    excludedDataQualityArtifacts: {
      count: excludedDataQuality.length,
      pnlNotCounted: Number(excludedDataQuality.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(4)),
      bySignalType: rollupTradesBySignal(excludedDataQuality),
    },
    excludedTaintListTrades: {
      count: excludedTaint.length,
      pnlNotCounted: Number(excludedTaint.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(4)),
      bySignalType: rollupTradesBySignal(excludedTaint),
    },
    recentClosedTrades: recent,
  };
}

function tradesPnlReport(args: string[]): string {
  const filter = args[0]?.toLowerCase() ?? "";
  const days = num(args[1]);
  const cutoff = days !== null && days > 0 ? Date.now() - days * 86_400_000 : null;
  const taintedIds = loadTaintedTradeIds();
  const matched = readClosedTradesLedger()
    .filter((trade) => !filter || trade.signalType.toLowerCase().includes(filter))
    .filter((trade) => cutoff === null || Date.parse(trade.closedAt) >= cutoff);
  const excludedDataQuality = matched.filter(isDataQualityArtifact);
  const excludedTaint = matched.filter((trade) => !isDataQualityArtifact(trade) && isTaintListExcluded(trade, taintedIds));
  const trades = matched.filter((trade) => !isExcludedFromPnl(trade, taintedIds));
  if (trades.length === 0) {
    return `No closed trades found${filter ? ` for signal ~"${filter}"` : ""}${days ? ` in last ${days}d` : ""}. Usage: /trades_pnl [signal_substring] [days]`;
  }
  const rollup = rollupTradesBySignal(trades);
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const wins = trades.filter((trade) => trade.pnl >= 0).length;
  return [
    `Closed trades P&L${filter ? ` (signal ~"${filter}")` : ""}${days ? ` (last ${days}d)` : " (all time)"}`,
    `Trades: ${trades.length}; wins=${wins} losses=${trades.length - wins}`,
    `Total P&L: $${totalPnl.toFixed(4)}`,
    ...(excludedDataQuality.length > 0 || excludedTaint.length > 0
      ? [`Excluded ${excludedDataQuality.length} data_quality_artifact row(s) (P&L $${excludedDataQuality.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(4)} not counted) and ${excludedTaint.length} taint-list row(s) (P&L $${excludedTaint.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(4)} not counted)`]
      : []),
    "",
    "By signal:",
    ...Object.entries(rollup).map(([key, value]) => {
      const row = obj(value);
      return `- ${key}: ${fmtNum(row.wins, 0)}/${fmtNum(row.count, 0)} wins, P&L $${fmtNum(row.pnl, 4)} (mkt $${fmtNum(row.marketPnl, 4)} + fund $${fmtNum(row.fundingPnl, 4)}), avg ${fmtPct(row.avgPnlPct)}`;
    }),
    "",
    "Recent:",
    ...trades.slice(-10).reverse().map((trade) =>
      `- ${trade.closedAt.slice(0, 10)} ${trade.asset} ${trade.direction} ${trade.signalType} $${trade.pnl.toFixed(4)} ${trade.closeReason}`
    ),
  ].join("\n");
}

function traderContext(asset?: string): JsonObject {
  const engine = readJson<JsonObject>(dataPath("engine-state.json"), {});
  const candidates = readJson<JsonObject>(dataPath("candidate-actions.json"), {});
  const execution = readJson<JsonObject>(dataPath("execution-plan.json"), {});
  const heatmap = readJson<JsonObject>(heatmapPath(), {});
  const assetUpper = asset?.toUpperCase();
  return {
    generatedAt: new Date().toISOString(),
    scopeAsset: assetUpper ?? null,
    strategyReference: STRATEGY_REFERENCE,
    closedTrades: closedTradesContext(assetUpper),
    manualIvTouchPnl: manualTouchPnlSummary(),
    engineGeneratedAt: engine.generatedAt,
    dataFreshness: engine.dataFreshness,
    portfolio: engine.portfolio,
    openPositions: arr(engine.openPositions)
      .filter((position) => !assetUpper || str(position.asset).toUpperCase() === assetUpper)
      .slice(0, 20),
    entryCandidates: arr(candidates.entryCandidates)
      .filter((candidate) => !assetUpper || str(candidate.asset).toUpperCase() === assetUpper)
      .slice(0, 12),
    llmCloseEligibility: arr(candidates.llmCloseEligibility)
      .filter((row) => !assetUpper || str(row.asset).toUpperCase() === assetUpper)
      .slice(0, 20),
    executionPlan: {
      generatedAt: execution.generatedAt,
      dryRun: execution.dryRun,
      llmDryRun: execution.llmDryRun,
      llmCloses: arr(execution.llmCloses).length,
      entrySignals: arr(execution.entrySignals).length,
    },
    heatmap: {
      snapshotTimestamp: heatmap.snapshotTimestamp,
      generatedAt: heatmap.generatedAt,
      rows: compactHeatmapRows(assetUpper),
    },
    openShadows: compactOpenShadows(assetUpper),
  };
}

function responseText(data: JsonObject, provider: string): string {
  if (provider === "deepseek") {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    return String((choice?.message as Record<string, unknown> | undefined)?.content ?? "");
  }
  const content = Array.isArray(data.content) ? data.content : [];
  return content
    .map((part) => obj(part))
    .filter((part) => part.type === "text")
    .map((part) => str(part.text))
    .join("\n")
    .trim();
}

async function requestLlm(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return `LLM not run: ANTHROPIC_API_KEY is not set. This command is explicit and token-spending, so it will only run when the key is configured.`;
  }
  const provider = (process.env.LLM_PROVIDER ?? "anthropic") as string;
  const model = process.env.TELEGRAM_LLM_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
  try {
    let url: string;
    let headers: Record<string, string>;
    let body: unknown;

    if (provider === "deepseek") {
      url = "https://api.deepseek.com/chat/completions";
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };
      body = {
        model,
        max_tokens: TELEGRAM_LLM_MAX_TOKENS,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      };
    } else {
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      body = {
        model,
        max_tokens: TELEGRAM_LLM_MAX_TOKENS,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      };
    }

    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${provider === "deepseek" ? "DeepSeek" : "Anthropic"} API ${response.status}: ${await response.text()}`);
    }
    return responseText(await response.json() as JsonObject, provider) || "LLM returned an empty response.";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return `LLM request timed out after ${Math.round(LLM_REQUEST_TIMEOUT_MS / 1000)}s.`;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function truncateContext(text: string): string {
  if (text.length <= TELEGRAM_LLM_MAX_CONTEXT_CHARS) return text;
  return `${text.slice(0, TELEGRAM_LLM_MAX_CONTEXT_CHARS)}\n...[truncated]`;
}

async function askLlmReport(question: string): Promise<string> {
  if (!question.trim()) return "Usage: /ask <question>";
  if (/\bmanual\b/i.test(question) && /\btouch\b/i.test(question) && /\b(p&l|pnl|profit|loss|performance)\b/i.test(question)) {
    return manualTouchPnlReport();
  }
  const context = truncateContext(JSON.stringify(traderContext(), null, 2));
  const prompt = `You are a cautious trading-operations assistant for a paper Polymarket trader.

Answer the user's question using only the current artifacts below. Do not claim to have run live commands. Do not recommend live execution unless the user explicitly asks. If the artifacts are stale or insufficient, say so. Be concise and practical.

User question:
${question}

Current trader artifacts:
${context}`;
  return await requestLlm(prompt);
}

async function reviewAssetReport(assetArg: string | undefined): Promise<string> {
  const asset = assetArg?.toUpperCase();
  if (!asset) return "Usage: /review HYPE";
  const context = truncateContext(JSON.stringify(traderContext(asset), null, 2));
  const prompt = `You are reviewing one asset in a paper Polymarket trader.

Asset: ${asset}

Use only the current artifacts below. Give:
1. whether there is an actionable setup,
2. the strongest current heatmap rows and caveats,
3. why the trader may or may not be trading it,
4. any open-position or shadow-trade risk.

Do not place trades, do not ask to run the trader, and do not invent missing data. Keep it concise.

Current ${asset} artifacts:
${context}`;
  return await requestLlm(prompt);
}

function closeShadowPreview(chatId: string, instrumentId: string | undefined, reasonArg: string | undefined): string {
  if (!instrumentId) return "Usage: /close_shadow <instrument_id> [reason]";
  const reason = reasonArg || "thesis_validated";
  const shadows = readJson<JsonObject[]>(dataPath("blocked-signals.json"), []);
  const matches = shadows.filter((shadow) =>
    str(shadow.status) === "open" &&
    shadowInstrumentMatches(str(obj(shadow.position).instrumentId), instrumentId)
  );
  if (matches.length === 0) return `No open shadows matched ${instrumentId}.`;
  const action: PendingAction = {
    id: actionId(),
    type: "close_shadow",
    chatId,
    instrumentId,
    reason,
    createdAt: utcNow(),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const actions = [...loadActions().filter((pending) => pending.id !== action.id), action];
  saveActions(actions);

  return [
    `Preview close_shadow ${instrumentId}`,
    `Matches: ${matches.length}`,
    `Reason: ${reason}`,
    ...matches.slice(0, 8).map((shadow) => {
      const position = obj(shadow.position);
      const mark = markShadowExit(shadow);
      return `- ${str(shadow.id)} ${humanPosition(position)} entry=${fmtNum(position.entryPrice, 4)} mark=${fmtNum(position.currentPrice, 4)} P&L=${mark.pnlPct >= 0 ? "+" : ""}${mark.pnlPct.toFixed(2)}%`;
    }),
    "",
    `Confirm within 15 minutes with: /confirm ${action.id}`,
  ].join("\n");
}

function resolvedReason(requestedReason: string, pnl: number): string {
  if (requestedReason === "thesis_validated") {
    return pnl >= 0 ? "thesis_validated_profitable" : "thesis_compressed_loss";
  }
  return requestedReason;
}

function confirmAction(chatId: string, id: string | undefined): string {
  if (!id) return "Usage: /confirm <action_id>";
  const actions = loadActions();
  const action = actions.find((pending) => pending.id === id && pending.chatId === chatId);
  if (!action) return `No pending action found for ${id}.`;

  if (action.type === "close_shadow") {
    const shadows = readJson<JsonObject[]>(dataPath("blocked-signals.json"), []);
    const now = utcNow();
    let closed = 0;
    for (const shadow of shadows) {
      if (str(shadow.status) !== "open") continue;
      const position = obj(shadow.position);
      if (!shadowInstrumentMatches(str(position.instrumentId), action.instrumentId)) continue;
      const mark = markShadowExit(shadow);
      const closeReason = resolvedReason(action.reason, mark.pnl);
      shadow.status = "resolved";
      shadow.resolvedAt = now;
      shadow.hypotheticalResult = {
        closeReason,
        closeTrigger: "manual_close",
        closeNote: `Operator close via Telegram (${action.reason}).`,
        exitPrice: Number(mark.exitPrice.toFixed(6)),
        pnl: Number(mark.pnl.toFixed(4)),
        pnlPct: Number(mark.pnlPct.toFixed(2)),
        marketPnl: Number(mark.pnl.toFixed(4)),
        fundingPnl: Number((num(position.fundingPnlAccrued) ?? 0).toFixed(4)),
        outcome: mark.pnl >= 0 ? "win" : "loss",
      };
      shadow.thesis = `${str(shadow.thesis).trim()} [CLOSED ${now.slice(0, 10)} via Telegram: ${closeReason}]`;
      closed += 1;
    }
    if (closed > 0) writeJson(dataPath("blocked-signals.json"), shadows);
    saveActions(actions.filter((pending) => pending.id !== id));
    return `Closed ${closed} open shadow(s) for ${action.instrumentId}. Review with: git diff -- data/blocked-signals.json`;
  }

  return `Unsupported action type for ${id}.`;
}

function cancelAction(chatId: string, id: string | undefined): string {
  if (!id) return "Usage: /cancel <action_id>";
  const actions = loadActions();
  const before = actions.length;
  const next = actions.filter((pending) => !(pending.id === id && pending.chatId === chatId));
  saveActions(next);
  return before === next.length ? `No pending action found for ${id}.` : `Cancelled ${id}.`;
}

function parseCommand(text: string): { command: string; args: string[] } {
  const [first = "", ...args] = text.trim().split(/\s+/);
  const command = first.split("@")[0].toLowerCase();
  return { command, args };
}

async function handleCommand(chatId: string, text: string): Promise<string> {
  const { command, args } = parseCommand(text);
  switch (command) {
    case "/start":
    case "/help":
      return commandHelp();
    case "/status":
      return statusReport();
    case "/open":
      return openPositionsReport();
    case "/heatmap":
      return heatmapReport(args[0]);
    case "/noedge":
      return noEdgeReport();
    case "/shadows":
      return shadowsReport(args);
    case "/manual_touch_pnl":
      return manualTouchPnlReport();
    case "/trades_pnl":
      return tradesPnlReport(args);
    case "/why_no_trade":
      return whyNoTradeReport(args[0]);
    case "/ask":
      return await askLlmReport(args.join(" "));
    case "/review":
      return await reviewAssetReport(args[0]);
    case "/llm_budget":
      return llmBudgetReport();
    case "/hourly_status":
      return hourlyStatusReport();
    case "/close_shadow":
      return closeShadowPreview(chatId, args[0], args[1]);
    case "/confirm":
      return confirmAction(chatId, args[0]);
    case "/cancel":
      return cancelAction(chatId, args[0]);
    default:
      return `Unknown command: ${command}\n\n${commandHelp()}`;
  }
}

function allowedChatIds(): Set<string> {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || "";
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

async function telegramCall<T>(token: string, method: string, payload: JsonObject): Promise<T> {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${method} failed: HTTP ${response.status} ${await response.text()}`);
  return await response.json() as T;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  for (let i = 0; i < text.length || i === 0; i += MAX_TELEGRAM_MESSAGE) {
    const chunk = text.slice(i, i + MAX_TELEGRAM_MESSAGE) || "(empty)";
    await telegramCall(token, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    });
  }
}

async function runBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const allowed = allowedChatIds();
  if (allowed.size === 0) throw new Error("Set TELEGRAM_CHAT_ID or TELEGRAM_ALLOWED_CHAT_IDS");
  let offset = Number(process.env.TELEGRAM_START_OFFSET ?? loadOffset());
  console.log(`Telegram trader bot running for ${allowed.size} allowed chat(s).`);

  while (true) {
    const result = await telegramCall<{ ok: boolean; result: TelegramUpdate[] }>(token, "getUpdates", {
      offset: offset || undefined,
      timeout: 25,
      allowed_updates: ["message", "channel_post"],
    });
    for (const update of result.result ?? []) {
      offset = Math.max(offset, update.update_id + 1);
      saveOffset(offset);
      const message = update.message ?? update.channel_post;
      const text = message?.text?.trim();
      const chatId = message ? String(message.chat.id) : "";
      if (!message || !text) continue;
      if (!allowed.has(chatId)) {
        console.warn(`Ignoring message from unauthorized chat ${chatId}`);
        continue;
      }
      try {
        await sendTelegram(token, chatId, await handleCommand(chatId, text));
      } catch (error) {
        await sendTelegram(token, chatId, `Command failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const onceIdx = process.argv.indexOf("--once");
  if (onceIdx !== -1) {
    const text = process.argv.slice(onceIdx + 1).join(" ");
    console.log(await handleCommand("local", text || "/help"));
    return;
  }
  await runBot();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
