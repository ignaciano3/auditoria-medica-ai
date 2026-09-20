import { describe, expect, test } from "bun:test";
import type { ProviderKey } from "@audit/domain";
import { type Env, errors } from "@audit/lib";
import {
  describeSettingsView,
  missingEffectiveKey,
  validateSettingsInput,
} from "./settings-view.ts";

function configuredKeys(
  overrides: Partial<Record<ProviderKey, boolean>> = {},
): Record<ProviderKey, boolean> {
  return {
    openai: false,
    deepseek: false,
    qwen: false,
    opencode: false,
    ...overrides,
  };
}

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
    OPENAI_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    OPENCODE_API_KEY: "",
    SETTINGS_ENCRYPTION_KEY: "",
    DOCUMENT_RETENTION_DAYS: 30,
    ...overrides,
  };
}

const BASE = {
  llmProvider: "opencode",
  llmModel: "deepseek-v4.1-flash",
  ocrProvider: "opencode",
  ocrModel: "deepseek-v4-flash-vision-exp",
  keys: {},
};

describe("validateSettingsInput", () => {
  test("accepts a valid opencode selection", () => {
    expect(validateSettingsInput(BASE).ok).toBe(true);
  });

  test("accepts heuristic without a model check", () => {
    const result = validateSettingsInput({
      ...BASE,
      llmProvider: "heuristic",
      llmModel: "anything",
    });
    expect(result.ok).toBe(true);
  });

  test("accepts local OCR without a model check", () => {
    const result = validateSettingsInput({
      ...BASE,
      ocrProvider: "local",
      ocrModel: "anything",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects an unknown provider", () => {
    const result = validateSettingsInput({ ...BASE, llmProvider: "bogus" });
    expect(result).toEqual({
      ok: false,
      error: errors.settingsInvalidProvider,
    });
  });

  test("rejects a model that does not belong to the provider", () => {
    const result = validateSettingsInput({
      ...BASE,
      llmProvider: "openai",
      llmModel: "deepseek-v4.1-flash",
    });
    expect(result).toEqual({ ok: false, error: errors.settingsInvalidModel });
  });
});

describe("missingEffectiveKey", () => {
  test("returns null when an incoming key is provided", () => {
    const result = missingEffectiveKey(
      { ...BASE, keys: { opencode: "go-test" } },
      configuredKeys(),
    );
    expect(result).toBeNull();
  });

  test("returns the provider when no incoming or configured key exists", () => {
    const result = missingEffectiveKey({ ...BASE, keys: {} }, configuredKeys());
    expect(result).toBe("opencode");
  });

  test("honors an already-configured stored key with no incoming value", () => {
    const result = missingEffectiveKey(
      { ...BASE, keys: {} },
      configuredKeys({ opencode: true }),
    );
    expect(result).toBeNull();
  });

  test("honors a configured key derived from the env fallback", () => {
    const view = describeSettingsView(
      null,
      makeEnv({ OPENCODE_API_KEY: "env-opencode" }),
    );
    const result = missingEffectiveKey(
      { ...BASE, keys: {} },
      view.configuredKeys,
    );
    expect(result).toBeNull();
  });

  test("treats clearKeys without a replacement as missing even when configured", () => {
    const result = missingEffectiveKey(
      { ...BASE, keys: {}, clearKeys: ["opencode"] },
      configuredKeys({ opencode: true }),
    );
    expect(result).toBe("opencode");
  });

  test("requires no key for heuristic LLM and local OCR", () => {
    const result = missingEffectiveKey(
      {
        llmProvider: "heuristic",
        llmModel: "anything",
        ocrProvider: "local",
        ocrModel: "anything",
        keys: {},
      },
      configuredKeys(),
    );
    expect(result).toBeNull();
  });
});

describe("describeSettingsView", () => {
  test("prefills Go defaults when no stored row exists", () => {
    const view = describeSettingsView(null, makeEnv());
    expect(view.llmProvider).toBe("opencode");
    expect(view.llmModel).toBe("deepseek-v4.1-flash");
    expect(view.ocrProvider).toBe("opencode");
    expect(view.ocrModel).toBe("deepseek-v4-flash-vision-exp");
  });

  test("lets a stored row override the Go defaults", () => {
    const view = describeSettingsView(
      {
        llmProvider: "openai",
        llmModel: "gpt-5.6-terra",
        ocrProvider: "tesseract",
        ocrModel: "gpt-5.6-luna",
        encryptedKeys: {},
      },
      makeEnv(),
    );
    expect(view.llmProvider).toBe("openai");
    expect(view.ocrProvider).toBe("tesseract");
  });
});
