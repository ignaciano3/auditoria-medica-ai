import { describe, expect, test } from "bun:test";
import type { ProviderSettings } from "@audit/domain";
import { createOcrProviders, resolveOcrVisionConfig } from "./factory.ts";
import { OpenAIVisionOCRProvider } from "./openai-ocr-provider.ts";
import { TesseractOCRProvider } from "./tesseract-ocr-provider.ts";

function settings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    llmProvider: "heuristic",
    llmModel: "gpt-5.6-terra",
    ocrProvider: "opencode",
    ocrModel: "deepseek-v4-flash-vision-exp",
    keys: { openai: "", deepseek: "", qwen: "", opencode: "go-test" },
    ...overrides,
  };
}

describe("resolveOcrVisionConfig", () => {
  test("maps opencode to the Go endpoint with headers", () => {
    const config = resolveOcrVisionConfig(settings(), {
      sessionId: "document:abc",
    });
    expect(config.baseURL).toBe("https://opencode.ai/zen/go/v1");
    expect(config.apiKey).toBe("go-test");
    expect(config.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });

  test("maps openai without a base URL", () => {
    const config = resolveOcrVisionConfig(
      settings({
        ocrProvider: "openai",
        ocrModel: "gpt-5.6-luna",
        keys: { openai: "sk", deepseek: "", qwen: "", opencode: "" },
      }),
    );
    expect(config.baseURL).toBeUndefined();
    expect(config.apiKey).toBe("sk");
  });
});

describe("createOcrProviders", () => {
  test("returns tesseract only in local mode", () => {
    const providers = createOcrProviders(
      settings({ ocrProvider: "local", ocrModel: "gpt-5.6-luna" }),
    );
    expect(providers.ocr).toBeInstanceOf(TesseractOCRProvider);
    expect(providers.handwrittenOcr).toBeUndefined();
  });

  test("returns a vision provider for opencode", () => {
    expect(createOcrProviders(settings()).ocr).toBeInstanceOf(
      OpenAIVisionOCRProvider,
    );
  });

  test("returns tesseract plus a handwritten vision provider for the hybrid", () => {
    const providers = createOcrProviders(
      settings({
        ocrProvider: "tesseract",
        ocrModel: "gpt-5.6-luna",
        keys: { openai: "sk", deepseek: "", qwen: "", opencode: "" },
      }),
    );
    expect(providers.ocr).toBeInstanceOf(TesseractOCRProvider);
    expect(providers.handwrittenOcr).toBeInstanceOf(OpenAIVisionOCRProvider);
  });

  test("throws for a vision provider without a key", () => {
    expect(() =>
      createOcrProviders(
        settings({
          keys: { openai: "", deepseek: "", qwen: "", opencode: "" },
        }),
      ),
    ).toThrow();
  });
});
