import { describe, expect, test } from "bun:test";
import {
  buildOcrProviderOptions,
  buildProviderModels,
} from "./settings-options.ts";

describe("settings options", () => {
  test("includes the opencode model catalog", () => {
    const models = buildProviderModels();
    expect(models.opencode).toContain("deepseek-v4.1-flash");
    expect(models.opencode).not.toContain("glm-5.2");
  });

  test("lists OCR providers including local and tesseract", () => {
    const options = buildOcrProviderOptions();
    expect(options).toContain("local");
    expect(options).toContain("tesseract");
    expect(options).toContain("opencode");
  });
});
