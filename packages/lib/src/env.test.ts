import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env.ts";

const BASE = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "documents",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio123",
} as const;

describe("parseEnv", () => {
  test("accepts a complete environment", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "openai",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
      DOCUMENT_RETENTION_DAYS: "30",
    });
    expect(result.DATABASE_URL).toContain("postgres://");
    expect(result.DOCUMENT_RETENTION_DAYS).toBe(30);
  });

  test("defaults to the tesseract OCR provider", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.OCR_PROVIDER).toBe("tesseract");
  });

  test("accepts the heuristic LLM provider", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "local",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.LLM_PROVIDER).toBe("heuristic");
  });

  test("accepts fully local providers without keys", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "local",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.OCR_PROVIDER).toBe("local");
    expect(result.OPENAI_API_KEY).toBe("");
  });

  test("allows an empty OpenAI key because settings may supply it", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "local",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.OPENAI_API_KEY).toBe("");
  });

  test("accepts the opencode provider and its key variable", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "opencode",
      LLM_MODEL: "deepseek-v4.1-flash",
      OCR_PROVIDER: "opencode",
      OCR_MODEL: "deepseek-v4-flash-vision-exp",
      OPENCODE_API_KEY: "go-test",
      SETTINGS_ENCRYPTION_KEY: "a".repeat(32),
    });
    expect(result.LLM_PROVIDER).toBe("opencode");
    expect(result.OPENCODE_API_KEY).toBe("go-test");
    expect(result.SETTINGS_ENCRYPTION_KEY).toBe("a".repeat(32));
  });

  test("rejects a retired or unknown model", () => {
    expect(() =>
      parseEnv({
        ...BASE,
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-5.5",
        OCR_PROVIDER: "local",
        OCR_MODEL: "gpt-5.6-luna",
      }),
    ).toThrow();
  });

  test("rejects a missing required value", () => {
    expect(() => parseEnv({})).toThrow();
  });
});

describe("parseEnv provider selection", () => {
  const LOCAL = {
    ...BASE,
    OCR_PROVIDER: "local",
    OCR_MODEL: "gpt-5.6-luna",
  } as const;

  test("accepts the deepseek LLM provider with its own key", () => {
    const result = parseEnv({
      ...LOCAL,
      LLM_PROVIDER: "deepseek",
      LLM_MODEL: "deepseek-flash",
      DEEPSEEK_API_KEY: "ds-test",
    });
    expect(result.LLM_PROVIDER).toBe("deepseek");
  });

  test("accepts the qwen LLM provider with its own key", () => {
    const result = parseEnv({
      ...LOCAL,
      LLM_PROVIDER: "qwen",
      LLM_MODEL: "qwen3.8-flash",
      DASHSCOPE_API_KEY: "ds-test",
    });
    expect(result.LLM_PROVIDER).toBe("qwen");
  });

  test("rejects a model that does not belong to the selected LLM provider", () => {
    expect(() =>
      parseEnv({
        ...LOCAL,
        LLM_PROVIDER: "qwen",
        LLM_MODEL: "deepseek-flash",
      }),
    ).toThrow();
  });

  test("rejects a model that does not belong to the selected OCR provider", () => {
    expect(() =>
      parseEnv({
        ...BASE,
        LLM_PROVIDER: "heuristic",
        LLM_MODEL: "gpt-5.6-terra",
        OCR_PROVIDER: "qwen",
        OCR_MODEL: "gpt-5.6-luna",
      }),
    ).toThrow();
  });
});
