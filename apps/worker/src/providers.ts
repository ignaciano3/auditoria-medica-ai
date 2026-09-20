import {
  LocalPageClassifier,
  type OCRProvider,
  OpenAIVisionOCRProvider,
  TesseractOCRProvider,
} from "@audit/documents";
import type { Env } from "@audit/lib";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

type OcrVisionConfig = ConstructorParameters<typeof OpenAIVisionOCRProvider>[0];

export function resolveOcrVisionConfig(env: Env): OcrVisionConfig {
  const base = {
    model: env.OCR_MODEL,
    classifyDetail: "high" as const,
    transcribeDetail: "high" as const,
    reasoningEffort: "low",
  };
  switch (env.OCR_PROVIDER) {
    case "deepseek":
      return {
        ...base,
        apiKey: env.DEEPSEEK_API_KEY,
        baseURL: DEEPSEEK_BASE_URL,
        extraBody: { thinking: { type: "disabled" } },
      };
    case "qwen":
      return {
        ...base,
        apiKey: env.DASHSCOPE_API_KEY,
        baseURL: QWEN_BASE_URL,
        extraBody: { enable_thinking: false },
      };
    default:
      return { ...base, apiKey: env.OPENAI_API_KEY };
  }
}

export interface OcrProviders {
  ocr: OCRProvider;
  handwrittenOcr?: OCRProvider;
}

export function createOcrProviders(env: Env): OcrProviders {
  switch (env.OCR_PROVIDER) {
    case "local":
      return {
        ocr: new TesseractOCRProvider({
          classifier: new LocalPageClassifier(),
        }),
      };
    case "tesseract": {
      const vision = new OpenAIVisionOCRProvider(resolveOcrVisionConfig(env));
      return {
        ocr: new TesseractOCRProvider({ classifier: vision }),
        handwrittenOcr: vision,
      };
    }
    default:
      return {
        ocr: new OpenAIVisionOCRProvider(resolveOcrVisionConfig(env)),
      };
  }
}

export { createLlmProvider, resolveLlmConfig } from "@audit/ai";
