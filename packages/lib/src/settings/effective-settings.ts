import {
  AI_PROVIDER_KEYS,
  type LlmProviderName,
  type OcrProviderName,
  type ProviderKey,
  type ProviderSettings,
  type StoredProviderSettings,
} from "@audit/domain";
import type { Env } from "../env.ts";

const ENV_KEY_FIELD = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
  opencode: "OPENCODE_API_KEY",
} as const satisfies Record<ProviderKey, keyof Env>;

export function applyEnvFallback(
  stored: StoredProviderSettings | null,
  env: Env,
  decrypt: (blob: string) => string,
): ProviderSettings {
  const keys = {} as Record<ProviderKey, string>;
  for (const provider of AI_PROVIDER_KEYS) {
    const encrypted = stored?.encryptedKeys?.[provider];
    if (encrypted) {
      keys[provider] = decrypt(encrypted);
      continue;
    }
    const envValue = env[ENV_KEY_FIELD[provider]];
    keys[provider] = typeof envValue === "string" ? envValue : "";
  }

  return {
    llmProvider: (stored?.llmProvider ?? env.LLM_PROVIDER) as LlmProviderName,
    llmModel: stored?.llmModel ?? env.LLM_MODEL,
    ocrProvider: (stored?.ocrProvider ?? env.OCR_PROVIDER) as OcrProviderName,
    ocrModel: stored?.ocrModel ?? env.OCR_MODEL,
    keys,
  };
}
