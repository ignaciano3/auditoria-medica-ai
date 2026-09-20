import { LLM_PROVIDERS, OCR_PROVIDERS } from "@audit/domain";
import { PROVIDER_MODELS } from "@audit/lib";

export function buildProviderModels(): Record<string, string[]> {
  return {
    openai: [...PROVIDER_MODELS.openai],
    deepseek: [...PROVIDER_MODELS.deepseek],
    qwen: [...PROVIDER_MODELS.qwen],
    opencode: [...PROVIDER_MODELS.opencode],
  };
}

export function buildLlmProviderOptions(): string[] {
  return [...LLM_PROVIDERS];
}

export function buildOcrProviderOptions(): string[] {
  return [...OCR_PROVIDERS];
}
