import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env.ts";

describe("parseEnv", () => {
  test("accepts a complete environment", () => {
    const result = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      S3_ENDPOINT: "http://localhost:9000",
      S3_BUCKET: "documents",
      S3_ACCESS_KEY: "minio",
      S3_SECRET_KEY: "minio123",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-4.1",
      OCR_PROVIDER: "openai",
      OCR_MODEL: "gpt-4.1",
      OPENAI_API_KEY: "sk-test",
      DOCUMENT_RETENTION_DAYS: "30",
    });
    expect(result.DATABASE_URL).toContain("postgres://");
    expect(result.DOCUMENT_RETENTION_DAYS).toBe(30);
  });

  test("accepts the tesseract OCR provider", () => {
    const result = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      S3_ENDPOINT: "http://localhost:9000",
      S3_BUCKET: "documents",
      S3_ACCESS_KEY: "minio",
      S3_SECRET_KEY: "minio123",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-4.1",
      OCR_PROVIDER: "tesseract",
      OCR_MODEL: "gpt-4.1-mini",
      OPENAI_API_KEY: "sk-test",
    });
    expect(result.OCR_PROVIDER).toBe("tesseract");
  });

  test("rejects a missing required value", () => {
    expect(() => parseEnv({})).toThrow();
  });
});
