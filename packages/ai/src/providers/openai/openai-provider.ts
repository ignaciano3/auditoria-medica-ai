import {
  type ClinicalRecord,
  clinicalRecordSchema,
  type DocumentPage,
  type Finding,
  findingSchema,
} from "@audit/domain";
import OpenAI from "openai";
import { z } from "zod";
import type { LLMProvider } from "../../llm-provider.ts";
import {
  ANALYSIS_CORRECTION_PROMPT,
  ANALYSIS_SYSTEM_PROMPT,
  AUDIT_SUMMARY_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
  buildAuditSummaryUserPrompt,
  buildClinicalSummaryUserPrompt,
  buildExtractionUserPrompt,
  CLINICAL_SUMMARY_SYSTEM_PROMPT,
  EXTRACTION_CORRECTION_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
} from "../../prompts/extraction.ts";

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

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RetryContext = {
  previous: string | null;
  correction: string;
};

export class LLMExtractionError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`LLM extraction failed for ${operation}`);
    this.name = "LLMExtractionError";
    this.operation = operation;
  }
}

function parseValidated<S extends z.ZodType>(
  schema: S,
  content: string | null,
): { ok: true; data: z.output<S> } | { ok: false } {
  if (content === null) return { ok: false };
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  return { ok: true, data: parsed.data };
}

function parseClinicalRecord(
  content: string | null,
): ClinicalRecord | undefined {
  const parsed = parseValidated(clinicalRecordSchema, content);
  return parsed.ok ? (parsed.data as ClinicalRecord) : undefined;
}

function parseFindings(content: string | null): Finding[] | undefined {
  const parsed = parseValidated(z.array(findingSchema), content);
  return parsed.ok ? (parsed.data as Finding[]) : undefined;
}

export class OpenAIProvider implements LLMProvider {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string | undefined;
  private readonly extraBody: Record<string, unknown> | undefined;
  private readonly reasoningEffort: string | null;
  private readonly injectedClient: OpenAICompatibleClient | undefined;
  private cachedClient: OpenAICompatibleClient | undefined;

  constructor(options: {
    apiKey: string;
    model: string;
    client?: OpenAICompatibleClient;
    baseURL?: string;
    extraBody?: Record<string, unknown>;
    reasoningEffort?: string | null;
  }) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL;
    this.extraBody = options.extraBody;
    this.injectedClient = options.client;
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

  private async complete(
    system: string,
    user: string,
    retry?: RetryContext,
    jsonObject = false,
  ): Promise<string | null> {
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    if (retry) {
      if (retry.previous !== null) {
        messages.push({ role: "assistant", content: retry.previous });
      }
      messages.push({ role: "user", content: retry.correction });
    }
    const request: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    if (this.reasoningEffort !== null) {
      request.reasoning_effort = this.reasoningEffort;
    }
    if (jsonObject) {
      request.response_format = { type: "json_object" };
    }
    if (this.extraBody) {
      Object.assign(request, this.extraBody);
    }
    const response = await this.client.chat.completions.create(request);
    return response.choices[0]?.message.content ?? null;
  }

  private async completeValidated<T>(
    parse: (content: string | null) => T | undefined,
    operation: string,
    system: string,
    user: string,
    correction: string,
    jsonObject = false,
  ): Promise<T> {
    const first = await this.complete(system, user, undefined, jsonObject);
    const firstParsed = parse(first);
    if (firstParsed !== undefined) return firstParsed;
    const second = await this.complete(
      system,
      user,
      { previous: first, correction },
      jsonObject,
    );
    const secondParsed = parse(second);
    if (secondParsed !== undefined) return secondParsed;
    throw new LLMExtractionError(operation);
  }

  private async completeText(
    operation: string,
    system: string,
    user: string,
  ): Promise<string> {
    const content = await this.complete(system, user);
    if (content === null || content.trim().length === 0) {
      throw new LLMExtractionError(operation);
    }
    return content;
  }

  async extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord> {
    return this.completeValidated(
      parseClinicalRecord,
      "extractClinicalRecord",
      EXTRACTION_SYSTEM_PROMPT,
      buildExtractionUserPrompt(pages),
      EXTRACTION_CORRECTION_PROMPT,
      true,
    );
  }

  async analyzeClinicalRecord(record: ClinicalRecord): Promise<Finding[]> {
    return this.completeValidated(
      parseFindings,
      "analyzeClinicalRecord",
      ANALYSIS_SYSTEM_PROMPT,
      buildAnalysisUserPrompt(record),
      ANALYSIS_CORRECTION_PROMPT,
    );
  }

  async generateClinicalSummary(record: ClinicalRecord): Promise<string> {
    return this.completeText(
      "generateClinicalSummary",
      CLINICAL_SUMMARY_SYSTEM_PROMPT,
      buildClinicalSummaryUserPrompt(record),
    );
  }

  async generateAuditSummary(
    record: ClinicalRecord,
    findings: Finding[],
  ): Promise<string> {
    return this.completeText(
      "generateAuditSummary",
      AUDIT_SUMMARY_SYSTEM_PROMPT,
      buildAuditSummaryUserPrompt(record, findings),
    );
  }
}
