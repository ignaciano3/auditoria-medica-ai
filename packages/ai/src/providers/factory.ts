import type { LLMProvider } from "../llm-provider.ts";
import { HeuristicLLMProvider } from "./heuristic/heuristic-provider.ts";
import { OpenAIProvider } from "./openai/openai-provider.ts";

export type LlmProviderName = "openai" | "deepseek" | "qwen" | "heuristic";

export type LlmEnv = {
  LLM_PROVIDER: LlmProviderName;
  LLM_MODEL: string;
  OPENAI_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  DASHSCOPE_API_KEY: string;
};

export type LlmClientConfig = ConstructorParameters<typeof OpenAIProvider>[0];

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export function resolveLlmConfig(env: LlmEnv): LlmClientConfig | null {
  switch (env.LLM_PROVIDER) {
    case "heuristic":
      return null;
    case "deepseek":
      return {
        apiKey: env.DEEPSEEK_API_KEY,
        baseURL: DEEPSEEK_BASE_URL,
        model: env.LLM_MODEL,
        extraBody: { thinking: { type: "disabled" } },
        reasoningEffort: "low",
      };
    case "qwen":
      return {
        apiKey: env.DASHSCOPE_API_KEY,
        baseURL: QWEN_BASE_URL,
        model: env.LLM_MODEL,
        extraBody: { enable_thinking: false },
        reasoningEffort: "low",
      };
    default:
      return {
        apiKey: env.OPENAI_API_KEY,
        model: env.LLM_MODEL,
        reasoningEffort: "low",
      };
  }
}

export function createLlmProvider(env: LlmEnv): LLMProvider {
  const config = resolveLlmConfig(env);
  return config ? new OpenAIProvider(config) : new HeuristicLLMProvider();
}
