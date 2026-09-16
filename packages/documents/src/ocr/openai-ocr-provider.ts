import { PAGE_DOC_TYPES } from "@audit/domain";
import OpenAI from "openai";
import { z } from "zod";
import type {
  OCRProvider,
  PageClassification,
  PageImage,
} from "./ocr-provider.ts";

type ChatCompletionResponse = {
  choices: Array<{ message: { content: string | null } }>;
};

export type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (
        input: Record<string, unknown>,
      ) => Promise<ChatCompletionResponse>;
    };
  };
};

const pageClassificationSchema = z.object({
  docType: z.enum(PAGE_DOC_TYPES),
  handwritten: z.boolean(),
  dataBearing: z.boolean(),
});

const FALLBACK_CLASSIFICATION: PageClassification = {
  docType: "other",
  handwritten: false,
  dataBearing: true,
};

function toDataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

function parseClassification(content: string | null): PageClassification {
  if (!content) return FALLBACK_CLASSIFICATION;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return FALLBACK_CLASSIFICATION;
  }
  const parsed = pageClassificationSchema.safeParse(raw);
  if (!parsed.success) return FALLBACK_CLASSIFICATION;
  return parsed.data;
}

export class OpenAIVisionOCRProvider implements OCRProvider {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly injectedClient: OpenAICompatibleClient | undefined;
  private cachedClient: OpenAICompatibleClient | undefined;

  constructor(options: {
    apiKey: string;
    model: string;
    client?: OpenAICompatibleClient;
  }) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.injectedClient = options.client;
  }

  private get client(): OpenAICompatibleClient {
    if (!this.cachedClient) {
      this.cachedClient =
        this.injectedClient ??
        (new OpenAI({
          apiKey: this.apiKey,
        }) as unknown as OpenAICompatibleClient);
    }
    return this.cachedClient;
  }

  async classifyPage(input: PageImage): Promise<PageClassification> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify clinical document pages in Spanish. Reply with JSON containing docType, handwritten and dataBearing.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Classify this page." },
            { type: "image_url", image_url: { url: toDataUrl(input.png) } },
          ],
        },
      ],
    });
    return parseClassification(response.choices[0]?.message.content ?? null);
  }

  async transcribePage(input: PageImage): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Transcribe faithfully the text of the Spanish clinical document. Do not interpret or add information. Ignore signatures and stamps.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this page." },
            { type: "image_url", image_url: { url: toDataUrl(input.png) } },
          ],
        },
      ],
    });
    return response.choices[0]?.message.content ?? "";
  }
}
