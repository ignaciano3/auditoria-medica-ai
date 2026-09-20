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

const CLASSIFY_SYSTEM_PROMPT =
  "You classify pages of Spanish clinical documents. Always assume the " +
  "document language is Spanish. Reply with JSON containing docType, " +
  "handwritten and dataBearing. Set handwritten=true when the page contains " +
  "significant handwriting: handwritten clinical notes, or forms and charts " +
  "filled in by hand such as vital signs, medication administration and " +
  "nursing records, even if the page also has printed headers. Set " +
  "handwritten=false only for fully printed pages.";

const TRANSCRIBE_SYSTEM_PROMPT =
  "Transcribe faithfully the text of this Spanish clinical document. Always " +
  "transcribe in Spanish. Do not interpret or add information. Ignore " +
  "signatures and stamps. Preserve the visual layout using Markdown: render " +
  "tables as GitHub-flavored Markdown tables (a header row, a | --- | " +
  "separator row, then one row per table row); render checkboxes and tick " +
  "boxes as Markdown task list items (- [x] when checked, - [ ] when " +
  "unchecked); keep headings and lists. Only structure what is present in " +
  "the page; never invent rows, columns or values.";

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
  private readonly defaultHeaders: Record<string, string> | undefined;
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
    defaultHeaders?: Record<string, string>;
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
    this.defaultHeaders = options.defaultHeaders;
  }

  private get client(): OpenAICompatibleClient {
    if (!this.cachedClient) {
      this.cachedClient =
        this.injectedClient ??
        (new OpenAI({
          apiKey: this.apiKey,
          ...(this.baseURL ? { baseURL: this.baseURL } : {}),
          ...(this.defaultHeaders
            ? { defaultHeaders: this.defaultHeaders }
            : {}),
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
            content: CLASSIFY_SYSTEM_PROMPT,
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
            content: TRANSCRIBE_SYSTEM_PROMPT,
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
