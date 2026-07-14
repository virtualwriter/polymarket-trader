import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nightly-research artifact contract (July 2026 infrastructure plan, Phase 4).
 *
 * data/learning-journal.md grows forever (one section appended per hourly
 * engine run). Left unbounded it eventually becomes slow to read/append and
 * risks repeating the same kind of unbounded-growth outage the calibration
 * log caused. The nightly job keeps the journal small by archiving
 * everything except a recent tail, while preserving full history on disk
 * under data/journal-archive/.
 */
export interface CompactJournalOptions {
  maxBytes: number;
  keepLines: number;
  todayIso: string;
}

export interface CompactJournalResult {
  compacted: string;
  archived: string;
}

function journalArchiveMarker(todayIso: string): string {
  return `<!-- compacted ${todayIso}: older entries archived to data/journal-archive/ -->`;
}

/**
 * Pure core: given the full journal text, decide whether compaction is
 * needed and, if so, split it into the new (small) journal content and the
 * archived middle section. Returns null when the content is already under
 * the byte threshold (no-op).
 */
export function compactJournal(content: string, opts: CompactJournalOptions): CompactJournalResult | null {
  if (Buffer.byteLength(content, "utf8") <= opts.maxBytes) return null;

  const hadTrailingNewline = content.endsWith("\n");
  const lines = hadTrailingNewline ? content.slice(0, -1).split("\n") : content.split("\n");
  const header = lines[0] ?? "";
  const rest = lines.slice(1);

  const keepLines = Math.max(0, opts.keepLines);
  const splitAt = Math.max(0, rest.length - keepLines);
  const middle = rest.slice(0, splitAt);
  const tail = rest.slice(splitAt);

  const compacted = [header, journalArchiveMarker(opts.todayIso), ...tail].join("\n") + "\n";
  const archived = middle.length > 0 ? middle.join("\n") + "\n" : "";

  return { compacted, archived };
}

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_KEEP_LINES = 400;

export interface CompactJournalFileResult {
  compacted: boolean;
  archivedBytes: number;
  archivePath: string | null;
}

/** Thin I/O wrapper around compactJournal: reads, archives (append-or-create), and atomically rewrites. */
export function compactJournalFile(
  journalPath: string,
  archiveDir: string,
  opts: { maxBytes?: number; keepLines?: number; now?: Date } = {},
): CompactJournalFileResult {
  if (!existsSync(journalPath)) {
    return { compacted: false, archivedBytes: 0, archivePath: null };
  }

  const content = readFileSync(journalPath, "utf8");
  const now = opts.now ?? new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const result = compactJournal(content, {
    maxBytes: opts.maxBytes ?? DEFAULT_MAX_BYTES,
    keepLines: opts.keepLines ?? DEFAULT_KEEP_LINES,
    todayIso,
  });
  if (!result) {
    return { compacted: false, archivedBytes: 0, archivePath: null };
  }

  mkdirSync(archiveDir, { recursive: true });
  const archivePath = join(archiveDir, `learning-journal-${todayIso}.md`);
  const existingArchive = existsSync(archivePath) ? readFileSync(archivePath, "utf8") : "";
  const needsSeparator = existingArchive.length > 0 && !existingArchive.endsWith("\n");
  writeFileSync(archivePath, existingArchive + (needsSeparator ? "\n" : "") + result.archived);

  const tmpPath = `${journalPath}.tmp`;
  writeFileSync(tmpPath, result.compacted);
  renameSync(tmpPath, journalPath);

  return { compacted: true, archivedBytes: Buffer.byteLength(result.archived, "utf8"), archivePath };
}
