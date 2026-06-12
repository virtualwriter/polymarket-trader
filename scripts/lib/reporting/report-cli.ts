import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BuildCsvReportArgs, BuildMarkdownReportArgs } from "./report-builders.js";

export interface ReportCliArgs {
  outPath: string | null;
  format: string;
}

export interface ReportBuilders {
  buildCsvReport: (args: BuildCsvReportArgs) => string;
  buildMarkdownReport: (args: BuildMarkdownReportArgs) => string;
}

export function parseReportCliArgs(args: string[]): ReportCliArgs {
  const outArg = args.find((arg) => arg.startsWith("--out="));
  const outPath = outArg ? outArg.slice("--out=".length) : null;
  const formatArg = args.find((arg) => arg.startsWith("--format="));
  const format = formatArg?.slice("--format=".length) ?? (outPath?.endsWith(".csv") ? "csv" : "markdown");
  return { outPath, format };
}

export function buildReportForFormat(
  format: string,
  args: BuildCsvReportArgs & BuildMarkdownReportArgs,
  builders: ReportBuilders,
): string {
  return format === "csv" ? builders.buildCsvReport(args) : builders.buildMarkdownReport(args);
}

export function writeReportOutput(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content + "\n");
}
