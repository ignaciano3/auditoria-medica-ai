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
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
    });
    expect(result.OCR_PROVIDER).toBe("tesseract");
  });

  test("accepts the heuristic LLM provider", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "openai",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
    });
    expect(result.LLM_PROVIDER).toBe("heuristic");
  });

  test("accepts the tesseract OCR provider", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "tesseract",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
    });
    expect(result.OCR_PROVIDER).toBe("tesseract");
  });

  test("accepts fully local providers without an OpenAI key", () => {
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

  test("rejects a retired or unknown model", () => {
    expect(() =>
      parseEnv({
        ...BASE,
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-5.5",
        OCR_PROVIDER: "local",
        OCR_MODEL: "gpt-5.6-luna",
        OPENAI_API_KEY: "sk-test",
      }),
    ).toThrow();
  });

  test("rejects an OpenAI provider without an OpenAI key", () => {
    expect(() =>
      parseEnv({
        ...BASE,
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-5.6-terra",
        OCR_PROVIDER: "local",
        OCR_MODEL: "gpt-5.6-luna",
      }),
    ).toThrow();
  });

  test("rejects a missing required value", () => {
    expect(() => parseEnv({})).toThrow();
  });
});
