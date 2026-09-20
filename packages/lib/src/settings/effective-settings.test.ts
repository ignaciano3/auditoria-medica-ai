import { describe, expect, test } from "bun:test";
import type { StoredProviderSettings } from "@audit/domain";
import type { Env } from "../env.ts";
import { applyEnvFallback } from "./effective-settings.ts";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "documents",
    S3_ACCESS_KEY: "minio",
    S3_SECRET_KEY: "minio123",
    LLM_PROVIDER: "openai",
    LLM_MODEL: "gpt-5.6-terra",
    OCR_PROVIDER: "tesseract",
    OCR_MODEL: "gpt-5.6-luna",
    OPENAI_API_KEY: "env-openai",
    DEEPSEEK_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    OPENCODE_API_KEY: "env-opencode",
    SETTINGS_ENCRYPTION_KEY: "",
    DOCUMENT_RETENTION_DAYS: 30,
    ...overrides,
  };
}

const decrypt = (blob: string) => `dec:${blob}`;

describe("applyEnvFallback", () => {
  test("uses env values when nothing is stored", () => {
    const result = applyEnvFallback(null, makeEnv(), decrypt);
    expect(result.llmProvider).toBe("openai");
    expect(result.llmModel).toBe("gpt-5.6-terra");
    expect(result.ocrProvider).toBe("tesseract");
    expect(result.keys.openai).toBe("env-openai");
    expect(result.keys.opencode).toBe("env-opencode");
  });

  test("lets stored provider and model override env", () => {
    const stored: StoredProviderSettings = {
      llmProvider: "opencode",
      llmModel: "deepseek-v4.1-flash",
      ocrProvider: "opencode",
      ocrModel: "deepseek-v4-flash-vision-exp",
      encryptedKeys: { opencode: "blob" },
    };
    const result = applyEnvFallback(stored, makeEnv(), decrypt);
    expect(result.llmProvider).toBe("opencode");
    expect(result.llmModel).toBe("deepseek-v4.1-flash");
    expect(result.ocrProvider).toBe("opencode");
    expect(result.keys.opencode).toBe("dec:blob");
  });

  test("falls back to env for keys the stored row does not set", () => {
    const stored: StoredProviderSettings = {
      llmProvider: "opencode",
      llmModel: "deepseek-v4.1-flash",
      ocrProvider: "opencode",
      ocrModel: "deepseek-v4-flash-vision-exp",
      encryptedKeys: { opencode: "blob" },
    };
    const result = applyEnvFallback(stored, makeEnv(), decrypt);
    expect(result.keys.openai).toBe("env-openai");
  });

  test("treats a null stored key as not set", () => {
    const stored: StoredProviderSettings = {
      llmProvider: "openai",
      llmModel: "gpt-5.6-terra",
      ocrProvider: "local",
      ocrModel: "gpt-5.6-luna",
      encryptedKeys: { openai: null },
    };
    const result = applyEnvFallback(stored, makeEnv(), decrypt);
    expect(result.keys.openai).toBe("env-openai");
  });
});
