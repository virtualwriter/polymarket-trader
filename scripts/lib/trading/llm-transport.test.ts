import { describe, expect, it } from "vitest";
import { extractLlmJsonObject, resolveLlmRoute } from "./llm-transport.js";

describe("resolveLlmRoute", () => {
  it("uses legacy VPS compat: deepseek provider with key/model in ANTHROPIC_* vars", () => {
    const route = resolveLlmRoute("hourly_engine", {
      LLM_PROVIDER: "deepseek",
      ANTHROPIC_API_KEY: "k",
      ANTHROPIC_MODEL: "deepseek-v4-pro",
    });

    expect(route).toEqual({
      callSite: "hourly_engine",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      apiKey: "k",
    });
  });

  it("prefers per-site overrides and DEEPSEEK_API_KEY for hourly deepseek", () => {
    const route = resolveLlmRoute("hourly_engine", {
      HOURLY_LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "dk",
      HOURLY_LLM_MODEL: "deepseek-chat",
      ANTHROPIC_API_KEY: "ak",
    });

    expect(route).toEqual({
      callSite: "hourly_engine",
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "dk",
    });
  });

  it("nightly per-site override beats global LLM_PROVIDER", () => {
    const route = resolveLlmRoute("nightly_research", {
      NIGHTLY_LLM_PROVIDER: "anthropic",
      NIGHTLY_LLM_MODEL: "claude-opus-4-8",
      ANTHROPIC_API_KEY: "ak",
      LLM_PROVIDER: "deepseek",
    });

    expect(route).toEqual({
      callSite: "nightly_research",
      provider: "anthropic",
      model: "claude-opus-4-8",
      apiKey: "ak",
    });
  });

  it("nightly falls back to global LLM_PROVIDER when no per-site override", () => {
    const route = resolveLlmRoute("nightly_research", {
      LLM_PROVIDER: "deepseek",
      ANTHROPIC_API_KEY: "k",
    });

    expect(route).toEqual({
      callSite: "nightly_research",
      provider: "deepseek",
      model: "claude-sonnet-4-6",
      apiKey: "k",
    });
  });

  it("returns null when no API key is available", () => {
    expect(resolveLlmRoute("hourly_engine", {})).toBeNull();
    expect(resolveLlmRoute("hourly_engine", { LLM_PROVIDER: "anthropic" })).toBeNull();
  });

  it("falls through invalid provider to default anthropic", () => {
    const route = resolveLlmRoute("hourly_engine", {
      LLM_PROVIDER: "not-a-provider",
      ANTHROPIC_API_KEY: "ak",
    });

    expect(route).toEqual({
      callSite: "hourly_engine",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "ak",
    });
  });

  it("uses default anthropic model when nothing is set", () => {
    const route = resolveLlmRoute("hourly_engine", {
      ANTHROPIC_API_KEY: "ak",
    });

    expect(route?.model).toBe("claude-sonnet-4-6");
  });
});

describe("extractLlmJsonObject", () => {
  it("returns a plain JSON object as-is", () => {
    const json = '{"foo": 1, "bar": "baz"}';
    expect(extractLlmJsonObject(json)).toBe(json);
  });

  it("extracts JSON wrapped in markdown fences", () => {
    const json = '{"answer": true}';
    expect(extractLlmJsonObject("```json\n" + json + "\n```")).toBe(json);
  });

  it("extracts a balanced object from surrounding prose", () => {
    const json = '{"x": 42}';
    expect(extractLlmJsonObject("Here is the result:\n" + json + "\nDone.")).toBe(json);
  });

  it("does not break on braces inside string values", () => {
    const json = '{"a": "has } brace"}';
    expect(extractLlmJsonObject(json)).toBe(json);
  });

  it("returns null when no object is present", () => {
    expect(extractLlmJsonObject("no json here")).toBeNull();
    expect(extractLlmJsonObject("")).toBeNull();
  });
});
