import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildReportForFormat, parseReportCliArgs, writeReportOutput } from "./report-cli.js";

describe("report CLI helpers", () => {
  it("infers CSV from --out and lets --format override output extension", () => {
    expect(parseReportCliArgs(["--out=/tmp/report.csv"])).toEqual({
      outPath: "/tmp/report.csv",
      format: "csv",
    });
    expect(parseReportCliArgs(["--out=/tmp/report.csv", "--format=markdown"])).toEqual({
      outPath: "/tmp/report.csv",
      format: "markdown",
    });
    expect(parseReportCliArgs([])).toEqual({
      outPath: null,
      format: "markdown",
    });
  });

  it("selects the CSV builder only for exact csv format", () => {
    const builders = {
      buildCsvReport: () => "csv-report",
      buildMarkdownReport: () => "markdown-report",
    };
    expect(buildReportForFormat("csv", {} as never, builders)).toBe("csv-report");
    expect(buildReportForFormat("json", {} as never, builders)).toBe("markdown-report");
  });

  it("writes report output with the legacy trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "trader-report-"));
    try {
      const path = join(dir, "nested", "report.md");
      writeReportOutput(path, "hello");
      expect(readFileSync(path, "utf8")).toBe("hello\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
