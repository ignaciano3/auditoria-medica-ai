import { describe, expect, test } from "bun:test";
import type { StoredProviderSettings } from "@audit/domain";
import type { Env } from "@audit/lib";
import {
  buildDecryptor,
  createSettingsCache,
  loadEffectiveSettings,
  SettingsDecryptionError,
  type SettingsDeps,
} from "./settings.ts";

function makeEnv(): Env {
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
    OPENCODE_API_KEY: "",
    SETTINGS_ENCRYPTION_KEY: "",
    DOCUMENT_RETENTION_DAYS: 30,
  };
}

function makeDeps(stored: StoredProviderSettings | null): SettingsDeps {
  return {
    repo: { get: async () => stored },
    env: makeEnv(),
    decrypt: (blob: string) => `dec:${blob}`,
  };
}

describe("loadEffectiveSettings", () => {
  test("uses env when nothing is stored", async () => {
    const result = await loadEffectiveSettings(makeDeps(null));
    expect(result.llmProvider).toBe("openai");
    expect(result.keys.openai).toBe("env-openai");
  });

  test("decrypts a stored key over the env fallback", async () => {
    const result = await loadEffectiveSettings(
      makeDeps({
        llmProvider: "opencode",
        llmModel: "deepseek-v4.1-flash",
        ocrProvider: "opencode",
        ocrModel: "deepseek-v4-flash-vision-exp",
        encryptedKeys: { opencode: "blob", openai: "blob-openai" },
      }),
    );
    expect(result.llmProvider).toBe("opencode");
    expect(result.keys.opencode).toBe("dec:blob");
    expect(result.keys.openai).toBe("dec:blob-openai");
  });
});

describe("buildDecryptor", () => {
  test("throws a typed error when the encryption key is missing", () => {
    const decrypt = buildDecryptor("");
    expect(() => decrypt("blob")).toThrow(SettingsDecryptionError);
  });

  test("throws a typed error on a malformed stored blob", () => {
    const decrypt = buildDecryptor(Buffer.alloc(32, 1).toString("base64"));
    expect(() => decrypt("not-an-encrypted-blob")).toThrow(
      SettingsDecryptionError,
    );
  });
});

describe("createSettingsCache", () => {
  test("reuses the value within the TTL and reloads after it", async () => {
    let calls = 0;
    let now = 0;
    const cache = createSettingsCache(
      async () => {
        calls += 1;
        return { llmProvider: "openai" } as never;
      },
      10,
      () => now,
    );

    await cache.get();
    await cache.get();
    expect(calls).toBe(1);

    now = 11;
    await cache.get();
    expect(calls).toBe(2);
  });
});
