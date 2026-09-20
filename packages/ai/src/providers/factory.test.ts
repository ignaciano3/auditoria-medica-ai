import { describe, expect, test } from "bun:test";
import { HeuristicLLMProvider, OpenAIProvider } from "../index.ts";
import { createLlmProvider, resolveLlmConfig } from "./factory.ts";

const base = {
  LLM_MODEL: "gpt-5.6-terra",
  OPENAI_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  DASHSCOPE_API_KEY: "",
} as const;

describe("resolveLlmConfig", () => {
  test("returns null for heuristic", () => {
    expect(resolveLlmConfig({ ...base, LLM_PROVIDER: "heuristic" })).toBeNull();
  });
  test("maps deepseek to its endpoint", () => {
    const config = resolveLlmConfig({
      ...base,
      LLM_PROVIDER: "deepseek",
      LLM_MODEL: "deepseek-flash",
      DEEPSEEK_API_KEY: "k",
    });
    expect(config?.baseURL).toBe("https://api.deepseek.com");
    expect(config?.apiKey).toBe("k");
  });
});

describe("createLlmProvider", () => {
  test("returns heuristic without an LLM config", () => {
    expect(
      createLlmProvider({ ...base, LLM_PROVIDER: "heuristic" }),
    ).toBeInstanceOf(HeuristicLLMProvider);
  });
  test("returns the OpenAI provider otherwise", () => {
    expect(
      createLlmProvider({
        ...base,
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "k",
      }),
    ).toBeInstanceOf(OpenAIProvider);
  });
});
