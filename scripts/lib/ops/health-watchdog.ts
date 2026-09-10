/**
 * Operational dead-man's switch, run from the hourly trading engine.
 *
 * The failure modes this exists for are the SILENT ones: the nightly LLM step
 * skipping because API credits ran out (by design it logs "skipped" and the
 * job exits 0), the TradingView cookie expiring (options-IV columns just stop
 * populating), the market scanner dying (valuations go stale), and slow disk
 * exhaustion. None of these crash anything — they quietly starve the research
 * loop, and historically got discovered days later by reading logs.
 *
 * Alerts go to Telegram (same TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID the daily
 * report and registry guards use) and are deduped to one per alert key per
 * 24h via data/health-watchdog-state.json. No token configured → console only.
 *
 * Known limitation, accepted: this runs inside the hourly engine, so if the
 * engine itself stops, so does the watchdog. The daily email report going
 * quiet is the operator-visible backstop for that failure.
 */

import { existsSync, readFileSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Two consecutive missed 00:05 nightly runs before we call it dead. */
export const NIGHTLY_STALE_HOURS = 49;
/** Consecutive daily-valuations snapshots with no options IV before blaming
 * the cookie. The scanner snapshots hourly and IV has populated on every row
 * historically, so 6 empty rows ≈ 6 hours — long enough to skip transient
 * TradingView outages, short enough to catch an expired cookie same-day. */
export const TRADINGVIEW_STALE_ROWS = 6;
export const DISK_USED_PCT_ALERT = 90;
export const HYPOTHESES_MAX_BYTES = 10 * 1024 * 1024;
export const VALUATIONS_STALE_DAYS = 2;
/** Re-alert at most once per key per this window. */
const ALERT_DEDUPE_HOURS = 24;

// Columns whose values come from the TradingView futures-options fetch. If
// every one of them is empty across the last N rows, the cookie is the prime
// suspect (the scanner logs a warning but otherwise degrades silently).
const TRADINGVIEW_IV_COLUMNS = ["btc_opt_iv_30d", "gold_opt_iv_30d", "oil_opt_iv_30d"];

export interface WatchdogAlert {
  key: string;
  message: string;
}

export interface WatchdogInputs {
  now: Date;
  /** name → age in hours, or null when the file is missing. */
  nightlyArtifactAgesHours: Record<string, number | null>;
  /** Last few daily-valuations rows, oldest first. */
  recentValuationRows: Array<Record<string, string | number>>;
  diskUsedPct: number | null;
  hypothesesFileBytes: number | null;
}

/** Pure decision logic — everything filesystem-shaped is gathered by the caller. */
export function computeWatchdogAlerts(inputs: WatchdogInputs): WatchdogAlert[] {
  const alerts: WatchdogAlert[] = [];

  // ── Nightly research dead-man ──────────────────────────────────────────
  const ages = inputs.nightlyArtifactAgesHours;
  const entries = Object.entries(ages);
  const stale = entries.filter(([, age]) => age === null || age > NIGHTLY_STALE_HOURS);
  if (entries.length > 0 && stale.length === entries.length) {
    alerts.push({
      key: "nightly_job_dead",
      message: `Nightly research job appears DEAD: all artifacts stale (${entries
        .map(([name, age]) => `${name}=${age === null ? "missing" : `${age.toFixed(0)}h`}`)
        .join(", ")}). Check: systemctl status polymarket-nightly-research.timer && journalctl -u polymarket-nightly-research -n 100`,
    });
  } else {
    for (const [name, age] of stale) {
      alerts.push({
        key: `nightly_stale_${name}`,
        message: `Nightly artifact ${name} is ${age === null ? "missing" : `${age.toFixed(0)}h old`} (>${NIGHTLY_STALE_HOURS}h = 2+ skipped nights). Most likely LLM API credits exhausted or the step is erroring — the job exits 0 on skip. Check: journalctl -u polymarket-nightly-research -n 100`,
      });
    }
  }

  // ── TradingView cookie ─────────────────────────────────────────────────
  const recent = inputs.recentValuationRows.slice(-TRADINGVIEW_STALE_ROWS);
  if (recent.length >= TRADINGVIEW_STALE_ROWS) {
    const anyIv = recent.some((row) =>
      TRADINGVIEW_IV_COLUMNS.some((col) => {
        const v = row[col];
        return v !== undefined && v !== "" && Number.isFinite(Number(v));
      }),
    );
    if (!anyIv) {
      alerts.push({
        key: "tradingview_cookie",
        message: `No options IV in the last ${TRADINGVIEW_STALE_ROWS} hourly valuation snapshots (${TRADINGVIEW_IV_COLUMNS.join(", ")} all empty). TRADINGVIEW_COOKIE has likely expired — refresh it in /etc/polymarket-trader.env.`,
      });
    }
  }

  // ── Market scanner freshness ───────────────────────────────────────────
  const latestRow = inputs.recentValuationRows[inputs.recentValuationRows.length - 1];
  const latestDate = String(latestRow?.date ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(latestDate)) {
    const ageDays = (inputs.now.getTime() - new Date(`${latestDate}T00:00:00Z`).getTime()) / 86_400_000;
    if (ageDays > VALUATIONS_STALE_DAYS) {
      alerts.push({
        key: "valuations_stale",
        message: `Latest daily-valuations row is ${latestDate} (${ageDays.toFixed(1)} days old). The market scanner snapshot may have stopped — every panel-conditioned strategy is flying blind.`,
      });
    }
  }

  // ── Disk / state growth ────────────────────────────────────────────────
  if (inputs.diskUsedPct !== null && inputs.diskUsedPct >= DISK_USED_PCT_ALERT) {
    alerts.push({
      key: "disk_full",
      message: `Disk ${inputs.diskUsedPct.toFixed(0)}% full (alert at ${DISK_USED_PCT_ALERT}%). State writes and journal archives will start failing silently.`,
    });
  }
  if (inputs.hypothesesFileBytes !== null && inputs.hypothesesFileBytes > HYPOTHESES_MAX_BYTES) {
    alerts.push({
      key: "hypotheses_growth",
      message: `hypotheses.json is ${(inputs.hypothesesFileBytes / 1024 / 1024).toFixed(1)}MB (alert at ${(HYPOTHESES_MAX_BYTES / 1024 / 1024).toFixed(0)}MB). Archival/compaction may have stopped keeping up.`,
    });
  }

  return alerts;
}

interface WatchdogState {
  lastSent: Record<string, string>;
}

function loadState(path: string): WatchdogState {
  if (!existsSync(path)) return { lastSent: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<WatchdogState>;
    return { lastSent: parsed.lastSent ?? {} };
  } catch {
    return { lastSent: {} };
  }
}

/** Alerts not sent within the dedupe window; caller persists the state after sending. */
export function filterUnsentAlerts(alerts: WatchdogAlert[], state: WatchdogState, now: Date): WatchdogAlert[] {
  return alerts.filter((alert) => {
    const last = state.lastSent[alert.key];
    if (!last) return true;
    const lastMs = new Date(last).getTime();
    return !Number.isFinite(lastMs) || now.getTime() - lastMs > ALERT_DEDUPE_HOURS * 3_600_000;
  });
}

async function sendTelegram(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_WATCHDOG_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface RunWatchdogOptions {
  dataDir: string;
  /** daily-valuations rows the engine already loaded this run (oldest first). */
  valRows: Array<Record<string, string | number>>;
  now?: Date;
}

export interface RunWatchdogResult {
  alerts: WatchdogAlert[];
  sent: number;
  notes: string[];
}

const NIGHTLY_ARTIFACTS = ["nightly-llm-advice.json", "nightly-explorer-advice.json", "research-yield-scoreboard.json"];

/**
 * Gather inputs, compute alerts, send the un-deduped ones to Telegram, and
 * persist the dedupe state. Never throws — a broken watchdog must not take
 * the trading run down with it.
 */
export async function runHealthWatchdog(opts: RunWatchdogOptions): Promise<RunWatchdogResult> {
  const now = opts.now ?? new Date();
  const notes: string[] = [];
  try {
    const nightlyArtifactAgesHours: Record<string, number | null> = {};
    for (const name of NIGHTLY_ARTIFACTS) {
      const path = join(opts.dataDir, name);
      nightlyArtifactAgesHours[name] = existsSync(path)
        ? (now.getTime() - statSync(path).mtimeMs) / 3_600_000
        : null;
    }

    let diskUsedPct: number | null = null;
    try {
      const fs = statfsSync(opts.dataDir);
      const total = fs.blocks * fs.bsize;
      const avail = fs.bavail * fs.bsize;
      if (total > 0) diskUsedPct = (1 - avail / total) * 100;
    } catch { /* platform without statfs — skip the disk check */ }

    const hypothesesPath = join(opts.dataDir, "hypotheses.json");
    const hypothesesFileBytes = existsSync(hypothesesPath) ? statSync(hypothesesPath).size : null;

    const alerts = computeWatchdogAlerts({
      now,
      nightlyArtifactAgesHours,
      recentValuationRows: opts.valRows.slice(-10),
      diskUsedPct,
      hypothesesFileBytes,
    });

    const statePath = join(opts.dataDir, "health-watchdog-state.json");
    const state = loadState(statePath);
    const toSend = filterUnsentAlerts(alerts, state, now);

    let sent = 0;
    for (const alert of toSend) {
      const delivered = await sendTelegram(`⚠️ polymarket-trader watchdog\n${alert.message}`);
      if (delivered) {
        sent++;
        state.lastSent[alert.key] = now.toISOString();
      } else {
        notes.push(`watchdog: alert '${alert.key}' NOT delivered (Telegram unconfigured or unreachable): ${alert.message}`);
      }
    }
    if (sent > 0) writeFileSync(statePath, JSON.stringify(state, null, 2));
    if (alerts.length > 0) {
      notes.push(`watchdog: ${alerts.length} active alert(s) [${alerts.map((a) => a.key).join(", ")}], ${sent} sent, ${alerts.length - toSend.length} deduped`);
    }
    return { alerts, sent, notes };
  } catch (err) {
    notes.push(`watchdog: failed harmlessly: ${err instanceof Error ? err.message : String(err)}`);
    return { alerts: [], sent: 0, notes };
  }
}
