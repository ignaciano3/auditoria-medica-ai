import { describe, expect, test } from "bun:test";
import { HeuristicLLMProvider, OpenAIProvider } from "@audit/ai";
import {
  OpenAIVisionOCRProvider,
  TesseractOCRProvider,
} from "@audit/documents";
import { parseEnv } from "@audit/lib";
import {
  createLlmProvider,
  createOcrProviders,
  resolveLlmConfig,
  resolveOcrVisionConfig,
} from "./providers.ts";

const BASE = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "documents",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio123",
} as const;

const LOCAL_OCR = {
  OCR_PROVIDER: "local",
  OCR_MODEL: "gpt-5.6-luna",
} as const;

describe("resolveLlmConfig", () => {
  test("returns null for the heuristic provider", () => {
    const env = parseEnv({
      ...BASE,
      ...LOCAL_OCR,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
    });
    expect(resolveLlmConfig(env)).toBeNull();
  });

  test("uses no base URL for the OpenAI provider", () => {
    const env = parseEnv({
      ...BASE,
      ...LOCAL_OCR,
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.6-terra",
      OPENAI_API_KEY: "sk-test",
    });
    const config = resolveLlmConfig(env);
    expect(config?.apiKey).toBe("sk-test");
    expect(config?.baseURL).toBeUndefined();
  });

  test("maps deepseek to its endpoint, key and non-thinking mode", () => {
    const env = parseEnv({
      ...BASE,
      ...LOCAL_OCR,
      LLM_PROVIDER: "deepseek",
      LLM_MODEL: "deepseek-flash",
      DEEPSEEK_API_KEY: "ds-test",
    });
    const config = resolveLlmConfig(env);
    expect(config?.baseURL).toBe("https://api.deepseek.com");
    expect(config?.apiKey).toBe("ds-test");
    expect(config?.model).toBe("deepseek-flash");
    expect(config?.extraBody).toEqual({ thinking: { type: "disabled" } });
  });

  test("maps qwen to its endpoint, key and disables thinking", () => {
    const env = parseEnv({
      ...BASE,
      ...LOCAL_OCR,
      LLM_PROVIDER: "qwen",
      LLM_MODEL: "qwen3.8-flash",
      DASHSCOPE_API_KEY: "ds-test",
    });
    const config = resolveLlmConfig(env);
    expect(config?.baseURL).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    );
    expect(config?.apiKey).toBe("ds-test");
    expect(config?.extraBody).toEqual({ enable_thinking: false });
  });
});

describe("resolveOcrVisionConfig", () => {
  test("uses no base URL for the OpenAI vision provider", () => {
    const env = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "openai",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
    });
    const config = resolveOcrVisionConfig(env);
    expect(config.apiKey).toBe("sk-test");
    expect(config.baseURL).toBeUndefined();
  });

  test("maps a deepseek OCR provider to its endpoint", () => {
    const env = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "deepseek",
      OCR_MODEL: "deepseek-flash",
      DEEPSEEK_API_KEY: "ds-test",
    });
    const config = resolveOcrVisionConfig(env);
    expect(config.baseURL).toBe("https://api.deepseek.com");
    expect(config.apiKey).toBe("ds-test");
  });

  test("maps a qwen OCR provider to its endpoint and disables thinking", () => {
    const env = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "qwen",
      OCR_MODEL: "qwen3.8-flash",
      DASHSCOPE_API_KEY: "ds-test",
    });
    const config = resolveOcrVisionConfig(env);
    expect(config.baseURL).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    );
    expect(config.extraBody).toEqual({ enable_thinking: false });
  });

  test("uses the OpenAI endpoint for the tesseract hybrid classifier", () => {
    const env = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "tesseract",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
    });
    const config = resolveOcrVisionConfig(env);
    expect(config.apiKey).toBe("sk-test");
    expect(config.baseURL).toBeUndefined();
  });
});

describe("createLlmProvider", () => {
  test("returns the heuristic provider when selected", () => {
    const env = parseEnv({
      ...BASE,
      ...LOCAL_OCR,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
    });
    expect(createLlmProvider(env)).toBeInstanceOf(HeuristicLLMProvider);
  });

  test("returns an OpenAI-compatible provider for hosted providers", () => {
    const env = parseEnv({
      ...BASE,
      ...LOCAL_OCR,
      LLM_PROVIDER: "deepseek",
      LLM_MODEL: "deepseek-flash",
      DEEPSEEK_API_KEY: "ds-test",
    });
    expect(createLlmProvider(env)).toBeInstanceOf(OpenAIProvider);
  });
});

describe("createOcrProviders", () => {
  test("returns tesseract only in local mode", () => {
    const env = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "local",
      OCR_MODEL: "gpt-5.6-luna",
    });
    const providers = createOcrProviders(env);
    expect(providers.ocr).toBeInstanceOf(TesseractOCRProvider);
    expect(providers.handwrittenOcr).toBeUndefined();
  });

  test("returns a vision provider for qwen", () => {
    const env = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "qwen",
      OCR_MODEL: "qwen3.8-flash",
      DASHSCOPE_API_KEY: "ds-test",
    });
    expect(createOcrProviders(env).ocr).toBeInstanceOf(OpenAIVisionOCRProvider);
  });

  test("returns tesseract plus a handwritten vision provider for the hybrid", () => {
    const env = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "tesseract",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
    });
    const providers = createOcrProviders(env);
    expect(providers.ocr).toBeInstanceOf(TesseractOCRProvider);
    expect(providers.handwrittenOcr).toBeInstanceOf(OpenAIVisionOCRProvider);
  });
});
