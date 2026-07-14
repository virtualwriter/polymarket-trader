import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compactJournal, compactJournalFile } from "./journal-compaction.js";

const HEADER = "# Trading Engine Learning Journal";

function buildJournal(entryCount: number): string {
  const lines = [HEADER];
  for (let i = 1; i <= entryCount; i++) lines.push(`entry ${i}`);
  return lines.join("\n") + "\n";
}

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "journal-compaction-"));
  tempDirs.push(dir);
  return dir;
}

describe("compactJournal", () => {
  it("is a no-op when content is at or under the byte threshold", () => {
    const content = buildJournal(10);
    expect(compactJournal(content, { maxBytes: 1_000_000, keepLines: 400, todayIso: "2026-07-14" })).toBeNull();
    expect(compactJournal(content, { maxBytes: Buffer.byteLength(content, "utf8"), keepLines: 400, todayIso: "2026-07-14" })).toBeNull();
  });

  it("keeps header + marker + last N lines and archives exactly the removed middle", () => {
    const content = buildJournal(50);
    const result = compactJournal(content, { maxBytes: 10, keepLines: 5, todayIso: "2026-07-14" });
    expect(result).not.toBeNull();
    const { compacted, archived } = result!;

    const compactedLines = compacted.split("\n");
    expect(compactedLines[compactedLines.length - 1]).toBe("");
    const body = compactedLines.slice(0, -1);
    expect(body[0]).toBe(HEADER);
    expect(body[1]).toBe("<!-- compacted 2026-07-14: older entries archived to data/journal-archive/ -->");
    expect(body.slice(2)).toEqual(["entry 46", "entry 47", "entry 48", "entry 49", "entry 50"]);

    const originalLines = content.slice(0, -1).split("\n");
    const expectedArchived = originalLines.slice(1, originalLines.length - 5).join("\n") + "\n";
    expect(archived).toBe(expectedArchived);
    expect(archived).toContain("entry 1\n");
    expect(archived).not.toContain("entry 46");
  });

  it("archives everything and keeps an empty tail when keepLines is 0", () => {
    const content = buildJournal(5);
    const result = compactJournal(content, { maxBytes: 1, keepLines: 0, todayIso: "2026-07-14" });
    expect(result).not.toBeNull();
    expect(result!.compacted).toBe(`${HEADER}\n<!-- compacted 2026-07-14: older entries archived to data/journal-archive/ -->\n`);
    expect(result!.archived).toBe("entry 1\nentry 2\nentry 3\nentry 4\nentry 5\n");
  });
});

describe("compactJournalFile", () => {
  it("logs a no-op (returns compacted:false) when the journal is missing or under threshold", () => {
    const dir = tempDir();
    const missing = join(dir, "missing.md");
    expect(compactJournalFile(missing, join(dir, "archive"))).toEqual({ compacted: false, archivedBytes: 0, archivePath: null });

    const smallJournal = join(dir, "learning-journal.md");
    writeFileSync(smallJournal, buildJournal(5));
    expect(compactJournalFile(smallJournal, join(dir, "archive"), { maxBytes: 1_000_000 }))
      .toEqual({ compacted: false, archivedBytes: 0, archivePath: null });
  });

  it("rewrites the journal atomically and appends to an existing archive file on repeated runs", () => {
    const dir = tempDir();
    const journalPath = join(dir, "learning-journal.md");
    const archiveDir = join(dir, "journal-archive");
    const now = new Date("2026-07-14T12:00:00.000Z");

    writeFileSync(journalPath, buildJournal(50));
    const first = compactJournalFile(journalPath, archiveDir, { maxBytes: 10, keepLines: 5, now });
    expect(first.compacted).toBe(true);
    expect(first.archivePath).toBe(join(archiveDir, "learning-journal-2026-07-14.md"));
    expect(existsSync(first.archivePath!)).toBe(true);
    const afterFirst = readFileSync(journalPath, "utf8");
    expect(afterFirst.split("\n")[0]).toBe(HEADER);
    expect(afterFirst).toContain("entry 50");
    expect(afterFirst).not.toContain("entry 44\n");

    const archiveAfterFirst = readFileSync(first.archivePath!, "utf8");
    expect(archiveAfterFirst).toContain("entry 1\n");

    writeFileSync(journalPath, buildJournal(60).replace(HEADER, `${HEADER}\n<!-- compacted 2026-07-14: older entries archived to data/journal-archive/ -->`));
    const second = compactJournalFile(journalPath, archiveDir, { maxBytes: 10, keepLines: 5, now });
    expect(second.compacted).toBe(true);
    const archiveAfterSecond = readFileSync(second.archivePath!, "utf8");
    expect(archiveAfterSecond.length).toBeGreaterThan(archiveAfterFirst.length);
    expect(archiveAfterSecond.startsWith(archiveAfterFirst)).toBe(true);
  });
});
