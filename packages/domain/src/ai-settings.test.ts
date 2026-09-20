import { describe, expect, test } from "bun:test";
import {
  AI_PROVIDER_KEYS,
  OPENCODE_GO_BASE_URL,
  opencodeDefaultHeaders,
} from "./ai-settings.ts";

describe("ai-settings", () => {
  test("lists the hosted API-key providers", () => {
    expect(AI_PROVIDER_KEYS).toEqual([
      "openai",
      "deepseek",
      "qwen",
      "opencode",
    ]);
  });

  test("exposes the OpenCode Go endpoint", () => {
    expect(OPENCODE_GO_BASE_URL).toBe("https://opencode.ai/zen/go/v1");
  });

  test("builds OpenCode Go request headers with a session id", () => {
    expect(opencodeDefaultHeaders("document:abc")).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });
});
