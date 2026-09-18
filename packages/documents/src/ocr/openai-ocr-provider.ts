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

export type ImageDetail = "low" | "high" | "auto" | "original";

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
  private readonly baseURL: string | undefined;
  private readonly extraBody: Record<string, unknown> | undefined;
  private readonly classifyDetail: ImageDetail;
  private readonly transcribeDetail: ImageDetail;
  private readonly reasoningEffort: string | null;
  private readonly injectedClient: OpenAICompatibleClient | undefined;
  private cachedClient: OpenAICompatibleClient | undefined;

  constructor(options: {
    apiKey: string;
    model: string;
    client?: OpenAICompatibleClient;
    baseURL?: string;
    extraBody?: Record<string, unknown>;
    classifyDetail?: ImageDetail;
    transcribeDetail?: ImageDetail;
    reasoningEffort?: string | null;
  }) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL;
    this.extraBody = options.extraBody;
    this.injectedClient = options.client;
    this.classifyDetail = options.classifyDetail ?? "low";
    this.transcribeDetail = options.transcribeDetail ?? "high";
    this.reasoningEffort =
      options.reasoningEffort === undefined ? "low" : options.reasoningEffort;
  }

  private get client(): OpenAICompatibleClient {
    if (!this.cachedClient) {
      this.cachedClient =
        this.injectedClient ??
        (new OpenAI({
          apiKey: this.apiKey,
          ...(this.baseURL ? { baseURL: this.baseURL } : {}),
        }) as unknown as OpenAICompatibleClient);
    }
    return this.cachedClient;
  }

  private buildRequest(body: Record<string, unknown>): Record<string, unknown> {
    const request: Record<string, unknown> = { model: this.model, ...body };
    if (this.reasoningEffort !== null) {
      request.reasoning_effort = this.reasoningEffort;
    }
    if (this.extraBody) {
      Object.assign(request, this.extraBody);
    }
    return request;
  }

  async classifyPage(input: PageImage): Promise<PageClassification> {
    const response = await this.client.chat.completions.create(
      this.buildRequest({
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
              {
                type: "image_url",
                image_url: {
                  url: toDataUrl(input.png),
                  detail: this.classifyDetail,
                },
              },
            ],
          },
        ],
      }),
    );
    return parseClassification(response.choices[0]?.message.content ?? null);
  }

  async transcribePage(input: PageImage): Promise<string> {
    const response = await this.client.chat.completions.create(
      this.buildRequest({
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
              {
                type: "image_url",
                image_url: {
                  url: toDataUrl(input.png),
                  detail: this.transcribeDetail,
                },
              },
            ],
          },
        ],
      }),
    );
    return response.choices[0]?.message.content ?? "";
  }
}
