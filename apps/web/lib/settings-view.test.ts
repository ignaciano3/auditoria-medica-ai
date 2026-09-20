import { describe, expect, test } from "bun:test";
import { errors } from "@audit/lib";
import { validateSettingsInput } from "./settings-view.ts";

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
