import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { csvCell, csvLine, parseCsvLine, readCsvRecords } from "./csv.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function tempFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "reporting-csv-"));
  tempDirs.push(dir);
  const file = join(dir, "rows.csv");
  writeFileSync(file, contents);
  return file;
}

describe("reporting csv helpers", () => {
  it("parses quoted commas and escaped quotes", () => {
    expect(parseCsvLine('id,notes,amount')).toEqual(["id", "notes", "amount"]);
    expect(parseCsvLine('T1,"hello, ""world""",1.23')).toEqual(["T1", 'hello, "world"', "1.23"]);
  });

  it("maps records by header and fills missing cells", () => {
    const file = tempFile('id,notes,amount\nT1,"hello, world",1.23\nT2,missing\n');

    expect(readCsvRecords(file)).toEqual([
      { id: "T1", notes: "hello, world", amount: "1.23" },
      { id: "T2", notes: "missing", amount: "" },
    ]);
  });

  it("returns an empty array for missing or headerless files", () => {
    expect(readCsvRecords(join(tmpdir(), "missing-reporting-csv.csv"))).toEqual([]);
    expect(readCsvRecords(tempFile("\n\n"))).toEqual([]);
  });

  it("escapes output cells and lines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
    expect(csvCell('hello, "world"')).toBe('"hello, ""world"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvLine(["id", 'hello, "world"', 1.23, undefined])).toBe('id,"hello, ""world""",1.23,');
  });
});
