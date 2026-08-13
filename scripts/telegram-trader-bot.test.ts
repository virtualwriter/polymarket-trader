import { describe, expect, it } from "vitest";

import { chunkTelegramMessage } from "./telegram-trader-bot.js";

describe("chunkTelegramMessage", () => {
  it("returns a placeholder for empty text so the send never posts nothing", () => {
    expect(chunkTelegramMessage("")).toEqual(["(empty)"]);
  });

  it("leaves a short report as a single message", () => {
    expect(chunkTelegramMessage("line one\nline two", 100)).toEqual(["line one\nline two"]);
  });

  it("breaks on a line boundary rather than mid-sentence", () => {
    const text = `${"a".repeat(60)}\n${"b".repeat(60)}`;
    const chunks = chunkTelegramMessage(text, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(`${"a".repeat(60)}\n`);
    expect(chunks[1]).toBe("b".repeat(60));
  });

  it("loses no characters when splitting", () => {
    const text = Array.from({ length: 400 }, (_, i) => `row ${i} of the report`).join("\n");
    expect(chunkTelegramMessage(text, 500).join("")).toBe(text);
  });

  it("respects the limit on every chunk", () => {
    const text = Array.from({ length: 400 }, (_, i) => `row ${i} of the report`).join("\n");
    for (const chunk of chunkTelegramMessage(text, 500)) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it("falls back to a hard cut when a single line exceeds the limit", () => {
    const chunks = chunkTelegramMessage("x".repeat(250), 100);
    expect(chunks).toEqual(["x".repeat(100), "x".repeat(100), "x".repeat(50)]);
  });

  it("does not emit a tiny chunk when the only newline sits near the start", () => {
    const text = `ab\n${"c".repeat(300)}`;
    const chunks = chunkTelegramMessage(text, 100);
    expect(chunks[0]).toHaveLength(100);
  });
});
