import { existsSync, readFileSync } from "node:fs";

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cell += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }

  cells.push(cell);
  return cells;
}

export function readCsvRecords(file: string): Record<string, string>[] {
  if (!existsSync(file)) return [];
  let lines: string[];
  try {
    lines = readFileSync(file, "utf-8").split("\n").filter((line) => line.trim());
  } catch {
    return [];
  }
  const [headerLine, ...rows] = lines;
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine);
  return rows.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ""]));
  });
}
