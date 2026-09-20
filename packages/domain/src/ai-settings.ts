export const AI_PROVIDER_KEYS = [
  "openai",
  "deepseek",
  "qwen",
  "opencode",
] as const;

export type ProviderKey = (typeof AI_PROVIDER_KEYS)[number];

export const LLM_PROVIDERS = [
  "openai",
  "deepseek",
  "qwen",
  "opencode",
  "heuristic",
] as const;

export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

export const OCR_PROVIDERS = [
  "openai",
  "deepseek",
  "qwen",
  "opencode",
  "tesseract",
  "local",
] as const;

export type OcrProviderName = (typeof OCR_PROVIDERS)[number];

export type ProviderSettings = {
  llmProvider: LlmProviderName;
  llmModel: string;
  ocrProvider: OcrProviderName;
  ocrModel: string;
  keys: Record<ProviderKey, string>;
};

export type StoredProviderSettings = {
  llmProvider: string;
  llmModel: string;
  ocrProvider: string;
  ocrModel: string;
  encryptedKeys: Partial<Record<ProviderKey, string | null>>;
};

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";

export const OPENCODE_USER_AGENT = "auditoria-medica-ai/1.0";

export function opencodeDefaultHeaders(
  sessionId: string,
): Record<string, string> {
  return {
    "User-Agent": OPENCODE_USER_AGENT,
    "x-opencode-session": sessionId,
  };
}
