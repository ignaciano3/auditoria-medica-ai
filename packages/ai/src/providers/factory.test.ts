import { describe, expect, test } from "bun:test";
import type { ProviderSettings } from "@audit/domain";
import {
  createLlmProvider,
  MissingProviderKeyError,
  resolveLlmConfig,
} from "./factory.ts";
import { HeuristicLLMProvider } from "./heuristic/heuristic-provider.ts";
import { OpenAIProvider } from "./openai/openai-provider.ts";

function settings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    llmProvider: "opencode",
    llmModel: "deepseek-v4.1-flash",
    ocrProvider: "local",
    ocrModel: "gpt-5.6-luna",
    keys: { openai: "", deepseek: "", qwen: "", opencode: "go-test" },
    ...overrides,
  };
}

describe("resolveLlmConfig", () => {
  test("returns null for the heuristic provider", () => {
    expect(resolveLlmConfig(settings({ llmProvider: "heuristic" }))).toBeNull();
  });

  test("maps opencode to the Go endpoint with session headers", () => {
    const config = resolveLlmConfig(settings(), { sessionId: "document:abc" });
    expect(config?.baseURL).toBe("https://opencode.ai/zen/go/v1");
    expect(config?.apiKey).toBe("go-test");
    expect(config?.model).toBe("deepseek-v4.1-flash");
    expect(config?.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });

  test("maps openai without a base URL", () => {
    const config = resolveLlmConfig(
      settings({
        llmProvider: "openai",
        llmModel: "gpt-5.6-terra",
        keys: { openai: "sk", deepseek: "", qwen: "", opencode: "" },
      }),
    );
    expect(config?.baseURL).toBeUndefined();
  });

  test("maps deepseek to its endpoint and non-thinking mode", () => {
    const config = resolveLlmConfig(
      settings({
        llmProvider: "deepseek",
        llmModel: "deepseek-flash",
        keys: { openai: "", deepseek: "ds", qwen: "", opencode: "" },
      }),
    );
    expect(config?.baseURL).toBe("https://api.deepseek.com");
    expect(config?.extraBody).toEqual({ thinking: { type: "disabled" } });
  });

  test("throws MissingProviderKeyError for a hosted provider without a key", () => {
    expect(() =>
      resolveLlmConfig(
        settings({
          keys: { openai: "", deepseek: "", qwen: "", opencode: "" },
        }),
      ),
    ).toThrow(MissingProviderKeyError);
  });
});

describe("createLlmProvider", () => {
  test("returns the heuristic provider when selected", () => {
    expect(
      createLlmProvider(settings({ llmProvider: "heuristic" })),
    ).toBeInstanceOf(HeuristicLLMProvider);
  });

  test("returns an OpenAI-compatible provider for opencode", () => {
    expect(createLlmProvider(settings())).toBeInstanceOf(OpenAIProvider);
  });
});
