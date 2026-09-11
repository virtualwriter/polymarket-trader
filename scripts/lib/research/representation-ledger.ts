/**
 * Representation ledger: the lifecycle record for every derived feature the
 * explorer has ever proposed (the external assessor's "second learning-to-
 * learn axis", adopted Sep 2026).
 *
 * The point is to measure whether REPRESENTATION INVENTION is productive
 * before deciding whether it deserves more autonomy (the "trusted primitive"
 * registry stays unbuilt until this ledger has data to set thresholds from).
 * Tracked per representation, keyed by its mathematical signature
 * (transform + input columns, not the explorer's chosen name):
 *
 *   proposed -> rejected_validation | accepted -> holdout_confirmed
 *
 * plus the economics: cumulative strata tested through the feature (the FDR
 * budget it consumed) against holdout-confirmed survivors it produced.
 *
 * Sources, both written earlier in the same nightly pipeline:
 * - data/miner-proposed-features.json  (explorer proposals)
 * - data/panel-mine-report.json        (miner acceptance/rejection + per-
 *   feature stats; the miner runs BEFORE this step each night, consuming the
 *   previous night's proposals — the ledger merges by signature, so the
 *   one-night offset never misattributes anything)
 *
 * Mining stats are applied idempotently per report generatedAt: reruns of the
 * nightly job cannot double-count budget.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type RepresentationStatus =
  | "proposed"
  | "rejected_validation"
  | "accepted"
  | "holdout_confirmed";

export interface RepresentationEntry {
  /** Mathematical identity: "ratio(volume,liquidity)". */
  key: string;
  /** Miner-side feature name (x_-prefixed), latest seen. */
  name: string;
  transform: string;
  columns: string[];
  rationale?: string;
  firstProposedAt: string;
  lastProposedAt: string;
  timesProposed: number;
  status: RepresentationStatus;
  /** Mine-report generatedAt last applied — the idempotency cursor. */
  lastMinedAt?: string;
  minedRuns: number;
  /** Cumulative strata tested involving this feature: its consumed FDR budget. */
  testsSpentTotal: number;
  /** Cumulative holdout-confirmed candidates involving this feature. */
  survivorsTotal: number;
  bestQ?: number | null;
  edges?: number[];
}

export interface RepresentationLedger {
  updatedAt: string;
  lifecycle: string;
  entries: RepresentationEntry[];
}

export interface RepresentationSummary {
  totalProposed: number;
  accepted: number;
  rejectedValidation: number;
  holdoutConfirmed: number;
  testsSpentTotal: number;
  survivorsTotal: number;
  /** Budget consumed per holdout-confirmed representation (lower = better). */
  testsPerConfirmedRepresentation: number | null;
}

const STATUS_RANK: Record<RepresentationStatus, number> = {
  proposed: 0,
  rejected_validation: 1,
  accepted: 2,
  holdout_confirmed: 3,
};

export function representationKey(transform: string, columns: string[]): string {
  return `${transform}(${columns.join(",")})`;
}

interface ProposalsFile {
  proposedAt?: string;
  proposals?: Array<{
    name?: string;
    transform?: string;
    columns?: string[];
    edges?: number[];
    rationale?: string;
  }>;
}

interface MineReport {
  generatedAt?: string;
  proposedDerivedFeatures?: Array<{ name?: string; transform?: string; columns?: string[]; edges?: number[] }>;
  rejectedDerivedFeatures?: string[];
  derivedFeatureStats?: Array<{ name?: string; strataTested?: number; survivors?: number; bestQ?: number | null }>;
}

function minerName(rawName: string): string {
  const name = rawName.trim().toLowerCase();
  return name.startsWith("x_") ? name : `x_${name}`;
}

function upgradeStatus(entry: RepresentationEntry, next: RepresentationStatus): void {
  // rejected_validation may overwrite plain "proposed" but never an
  // acceptance: a feature that mined once and later fails validation on a
  // changed panel keeps the higher status (history over recency).
  if (STATUS_RANK[next] > STATUS_RANK[entry.status]) entry.status = next;
}

/** Pure merge: current ledger + tonight's proposals + latest mine report. */
export function mergeLedger(
  entries: RepresentationEntry[],
  proposals: ProposalsFile | null,
  report: MineReport | null,
): RepresentationEntry[] {
  const byKey = new Map<string, RepresentationEntry>(entries.map((e) => [e.key, e]));
  const byName = new Map<string, RepresentationEntry>(entries.map((e) => [e.name, e]));

  const proposedAt = proposals?.proposedAt ?? "";
  for (const p of proposals?.proposals ?? []) {
    if (!p || typeof p.transform !== "string" || !Array.isArray(p.columns) || typeof p.name !== "string") continue;
    const key = representationKey(p.transform, p.columns);
    const name = minerName(p.name);
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        key,
        name,
        transform: p.transform,
        columns: [...p.columns],
        ...(p.rationale ? { rationale: String(p.rationale).slice(0, 240) } : {}),
        firstProposedAt: proposedAt,
        lastProposedAt: proposedAt,
        timesProposed: 1,
        status: "proposed",
        minedRuns: 0,
        testsSpentTotal: 0,
        survivorsTotal: 0,
      };
      byKey.set(key, entry);
      byName.set(name, entry);
    } else if (proposedAt && entry.lastProposedAt !== proposedAt) {
      entry.timesProposed++;
      entry.lastProposedAt = proposedAt;
      entry.name = name;
      byName.set(name, entry);
    }
    if (Array.isArray(p.edges) && p.edges.length > 0) entry.edges = p.edges;
  }

  const generatedAt = report?.generatedAt ?? "";
  if (generatedAt) {
    for (const accepted of report?.proposedDerivedFeatures ?? []) {
      if (typeof accepted?.name !== "string") continue;
      let entry = byName.get(accepted.name);
      if (!entry && typeof accepted.transform === "string" && Array.isArray(accepted.columns)) {
        // Report for a proposal whose file was already overwritten: recover
        // the identity from the report itself.
        const key = representationKey(accepted.transform, accepted.columns);
        entry = byKey.get(key) ?? {
          key,
          name: accepted.name,
          transform: accepted.transform,
          columns: [...accepted.columns],
          firstProposedAt: generatedAt,
          lastProposedAt: generatedAt,
          timesProposed: 1,
          status: "proposed",
          minedRuns: 0,
          testsSpentTotal: 0,
          survivorsTotal: 0,
        };
        byKey.set(entry.key, entry);
        byName.set(entry.name, entry);
      }
      if (!entry) continue;
      upgradeStatus(entry, "accepted");
      if (Array.isArray(accepted.edges) && accepted.edges.length > 0) entry.edges = accepted.edges;
    }

    for (const rejectedName of report?.rejectedDerivedFeatures ?? []) {
      const entry = byName.get(String(rejectedName));
      if (entry) upgradeStatus(entry, "rejected_validation");
    }

    for (const stat of report?.derivedFeatureStats ?? []) {
      if (typeof stat?.name !== "string") continue;
      const entry = byName.get(stat.name);
      if (!entry) continue;
      if (entry.lastMinedAt === generatedAt) continue; // idempotent per run
      entry.lastMinedAt = generatedAt;
      entry.minedRuns++;
      entry.testsSpentTotal += Math.max(0, Number(stat.strataTested ?? 0));
      const survivors = Math.max(0, Number(stat.survivors ?? 0));
      entry.survivorsTotal += survivors;
      if (survivors > 0) upgradeStatus(entry, "holdout_confirmed");
      const q = stat.bestQ;
      if (typeof q === "number" && Number.isFinite(q)) {
        entry.bestQ = entry.bestQ === undefined || entry.bestQ === null ? q : Math.min(entry.bestQ, q);
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function summarizeLedger(entries: RepresentationEntry[]): RepresentationSummary {
  const summary: RepresentationSummary = {
    totalProposed: entries.length,
    accepted: 0,
    rejectedValidation: 0,
    holdoutConfirmed: 0,
    testsSpentTotal: 0,
    survivorsTotal: 0,
    testsPerConfirmedRepresentation: null,
  };
  for (const e of entries) {
    if (e.status === "accepted") summary.accepted++;
    else if (e.status === "rejected_validation") summary.rejectedValidation++;
    else if (e.status === "holdout_confirmed") { summary.holdoutConfirmed++; summary.accepted++; }
    summary.testsSpentTotal += e.testsSpentTotal;
    summary.survivorsTotal += e.survivorsTotal;
  }
  if (summary.holdoutConfirmed > 0) {
    summary.testsPerConfirmedRepresentation = Number(
      (summary.testsSpentTotal / summary.holdoutConfirmed).toFixed(1),
    );
  }
  return summary;
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export interface UpdateLedgerResult {
  entries: number;
  summary: RepresentationSummary;
}

export function updateRepresentationLedger(dataDir: string, now: Date = new Date()): UpdateLedgerResult {
  const ledgerPath = join(dataDir, "representation-ledger.json");
  const existing = readJsonFile<RepresentationLedger>(ledgerPath);
  const proposals = readJsonFile<ProposalsFile>(join(dataDir, "miner-proposed-features.json"));
  const report = readJsonFile<MineReport>(join(dataDir, "panel-mine-report.json"));

  const entries = mergeLedger(existing?.entries ?? [], proposals, report);
  const summary = summarizeLedger(entries);

  writeFileSync(ledgerPath, JSON.stringify({
    updatedAt: now.toISOString(),
    lifecycle: "proposed -> rejected_validation | accepted -> holdout_confirmed (trusted-primitive registry deliberately deferred until this ledger has data to set thresholds from)",
    entries,
  } satisfies RepresentationLedger, null, 2) + "\n");

  return { entries: entries.length, summary };
}
