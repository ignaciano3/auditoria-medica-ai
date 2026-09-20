import { randomUUID } from "node:crypto";
import {
  OPENCODE_GO_BASE_URL,
  opencodeDefaultHeaders,
  type ProviderKey,
  type ProviderSettings,
} from "@audit/domain";
import { HeuristicLLMProvider } from "./heuristic/heuristic-provider.ts";
import { OpenAIProvider } from "./openai/openai-provider.ts";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export class MissingProviderKeyError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Missing API key for provider ${provider}`);
    this.name = "MissingProviderKeyError";
    this.provider = provider;
  }
}

export type LlmClientConfig = ConstructorParameters<typeof OpenAIProvider>[0];

function requireKey(settings: ProviderSettings, provider: ProviderKey): string {
  const key = settings.keys[provider];
  if (!key || key.trim().length === 0) {
    throw new MissingProviderKeyError(provider);
  }
  return key;
}

export function resolveLlmConfig(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
): LlmClientConfig | null {
  switch (settings.llmProvider) {
    case "heuristic":
      return null;
    case "opencode":
      return {
        apiKey: requireKey(settings, "opencode"),
        baseURL: OPENCODE_GO_BASE_URL,
        model: settings.llmModel,
        reasoningEffort: null,
        defaultHeaders: opencodeDefaultHeaders(opts?.sessionId ?? randomUUID()),
      };
    case "deepseek":
      return {
        apiKey: requireKey(settings, "deepseek"),
        baseURL: DEEPSEEK_BASE_URL,
        model: settings.llmModel,
        extraBody: { thinking: { type: "disabled" } },
        reasoningEffort: "low",
      };
    case "qwen":
      return {
        apiKey: requireKey(settings, "qwen"),
        baseURL: QWEN_BASE_URL,
        model: settings.llmModel,
        extraBody: { enable_thinking: false },
        reasoningEffort: "low",
      };
    default:
      return {
        apiKey: requireKey(settings, "openai"),
        model: settings.llmModel,
        reasoningEffort: "low",
      };
  }
}

export function createLlmProvider(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
) {
  const config = resolveLlmConfig(settings, opts);
  return config ? new OpenAIProvider(config) : new HeuristicLLMProvider();
}
