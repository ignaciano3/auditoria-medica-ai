import { describe, expect, test } from "bun:test";
import type { ProviderKey } from "@audit/domain";
import type { SaveSettingsResult } from "./settings-service.ts";
import { saveSettings } from "./settings-service.ts";

type UpsertInput = {
  llmProvider: string;
  llmModel: string;
  ocrProvider: string;
  ocrModel: string;
  encryptedKeys: Partial<Record<ProviderKey, string | null>>;
};

function makeDeps() {
  const calls: UpsertInput[] = [];
  const deps = {
    appSettings: {
      upsert: async (input: UpsertInput) => {
        calls.push(input);
      },
    },
    encrypt: (value: string) => `enc:${value}`,
  };
  return { deps, calls };
}

const VALID = {
  llmProvider: "opencode",
  llmModel: "deepseek-v4.1-flash",
  ocrProvider: "opencode",
  ocrModel: "deepseek-v4-flash-vision-exp",
};

describe("saveSettings", () => {
  test("encrypts provided keys and upserts", async () => {
    const { deps, calls } = makeDeps();
    const result: SaveSettingsResult = await saveSettings(deps, {
      ...VALID,
      keys: { opencode: "go-test", openai: "  sk  " },
    });
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.encryptedKeys).toEqual({
      opencode: "enc:go-test",
      openai: "enc:sk",
    });
  });

  test("clears a key when requested", async () => {
    const { deps, calls } = makeDeps();
    await saveSettings(deps, { ...VALID, keys: {}, clearKeys: ["openai"] });
    expect(calls[0]?.encryptedKeys).toEqual({ openai: null });
  });

  test("rejects an invalid model without writing", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveSettings(deps, {
      ...VALID,
      llmProvider: "openai",
      llmModel: "deepseek-v4.1-flash",
      keys: {},
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
