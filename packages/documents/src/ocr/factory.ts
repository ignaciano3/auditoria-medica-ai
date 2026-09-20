import { randomUUID } from "node:crypto";
import {
  OPENCODE_GO_BASE_URL,
  opencodeDefaultHeaders,
  type ProviderKey,
  type ProviderSettings,
} from "@audit/domain";
import { LocalPageClassifier } from "./local-page-classifier.ts";
import type { OCRProvider } from "./ocr-provider.ts";
import {
  type ImageDetail,
  OpenAIVisionOCRProvider,
} from "./openai-ocr-provider.ts";
import { TesseractOCRProvider } from "./tesseract-ocr-provider.ts";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export type OcrVisionConfig = ConstructorParameters<
  typeof OpenAIVisionOCRProvider
>[0];

export class OcrProviderKeyError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Missing API key for provider ${provider}`);
    this.name = "OcrProviderKeyError";
    this.provider = provider;
  }
}

function requireKey(settings: ProviderSettings, provider: ProviderKey): string {
  const key = settings.keys[provider];
  if (!key || key.trim().length === 0) {
    throw new OcrProviderKeyError(provider);
  }
  return key;
}

export function resolveOcrVisionConfig(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
): OcrVisionConfig {
  const base = {
    model: settings.ocrModel,
    classifyDetail: "high" as ImageDetail,
    transcribeDetail: "high" as ImageDetail,
    reasoningEffort: "low",
  };
  switch (settings.ocrProvider) {
    case "opencode":
      return {
        ...base,
        apiKey: requireKey(settings, "opencode"),
        baseURL: OPENCODE_GO_BASE_URL,
        defaultHeaders: opencodeDefaultHeaders(opts?.sessionId ?? randomUUID()),
      };
    case "deepseek":
      return {
        ...base,
        apiKey: requireKey(settings, "deepseek"),
        baseURL: DEEPSEEK_BASE_URL,
        extraBody: { thinking: { type: "disabled" } },
      };
    case "qwen":
      return {
        ...base,
        apiKey: requireKey(settings, "qwen"),
        baseURL: QWEN_BASE_URL,
        extraBody: { enable_thinking: false },
      };
    default:
      return { ...base, apiKey: requireKey(settings, "openai") };
  }
}

export interface OcrProviders {
  ocr: OCRProvider;
  handwrittenOcr?: OCRProvider;
}

export function createOcrProviders(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
): OcrProviders {
  switch (settings.ocrProvider) {
    case "local":
      return {
        ocr: new TesseractOCRProvider({
          classifier: new LocalPageClassifier(),
        }),
      };
    case "tesseract": {
      const vision = new OpenAIVisionOCRProvider(
        resolveOcrVisionConfig(settings, opts),
      );
      return {
        ocr: new TesseractOCRProvider({ classifier: vision }),
        handwrittenOcr: vision,
      };
    }
    default:
      return {
        ocr: new OpenAIVisionOCRProvider(
          resolveOcrVisionConfig(settings, opts),
        ),
      };
  }
}
