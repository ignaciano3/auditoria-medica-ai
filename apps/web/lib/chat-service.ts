import {
  allowedCitationPages,
  type ChatContext,
  type ChatTurn,
  type LLMProvider,
  retrievePages,
  validateCitations,
} from "@audit/ai";
import type { ChatMessageRow, ClinicalRecordWithFindings } from "@audit/db";
import type { DocumentPage, DocumentStatus } from "@audit/domain";
import { errors, ui } from "@audit/lib";

export const MAX_QUESTION_LENGTH = 2000;
const MAX_HISTORY_TURNS = 10;

export type ChatDeps = {
  documents: {
    getById(id: string): Promise<{ status: DocumentStatus } | null>;
  };
  pages: { listForDocument(id: string): Promise<DocumentPage[]> };
  clinicalRecords: {
    getByDocument(id: string): Promise<ClinicalRecordWithFindings | null>;
  };
  chatMessages: {
    listForDocument(id: string): Promise<ChatMessageRow[]>;
    add(input: {
      documentId: string;
      role: "user" | "assistant";
      content: string;
      citedPages: number[];
    }): Promise<ChatMessageRow>;
  };
  provider: LLMProvider;
};

export type ChatErrorCode = "notFound" | "notReady" | "invalid" | "failed";
export type ChatError = { code: ChatErrorCode; message: string };

export type PrepareResult =
  | { ok: true; context: ChatContext }
  | { ok: false; error: ChatError };

function toHistory(messages: ChatMessageRow[]): ChatTurn[] {
  return messages
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({ role: message.role, content: message.content }));
}

export async function prepareChat(
  deps: ChatDeps,
  input: { documentId: string; question: string },
): Promise<PrepareResult> {
  const question = input.question.trim();
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: { code: "invalid", message: ui.chatInvalid } };
  }

  const doc = await deps.documents.getById(input.documentId);
  if (!doc) {
    return { ok: false, error: { code: "notFound", message: errors.notFound } };
  }
  if (doc.status !== "ready") {
    return { ok: false, error: { code: "notReady", message: ui.chatNotReady } };
  }

  const [pages, clinical, messages] = await Promise.all([
    deps.pages.listForDocument(input.documentId),
    deps.clinicalRecords.getByDocument(input.documentId),
    deps.chatMessages.listForDocument(input.documentId),
  ]);
  if (!clinical) {
    return { ok: false, error: { code: "notReady", message: ui.chatNotReady } };
  }

  const context: ChatContext = {
    documentId: input.documentId,
    record: clinical.record,
    findings: clinical.findings,
    pages: retrievePages(pages, question),
    history: toHistory(messages),
    question,
  };

  await deps.chatMessages.add({
    documentId: input.documentId,
    role: "user",
    content: question,
    citedPages: [],
  });

  return { ok: true, context };
}

export async function* streamReply(
  deps: ChatDeps,
  context: ChatContext,
): AsyncGenerator<string, ChatMessageRow, void> {
  let content = "";
  for await (const delta of deps.provider.answerClinicalQuestion(context)) {
    content += delta;
    yield delta;
  }
  if (content.trim().length === 0) {
    throw new Error(ui.chatError);
  }
  const citedPages = validateCitations(content, allowedCitationPages(context));
  return await deps.chatMessages.add({
    documentId: context.documentId,
    role: "assistant",
    content,
    citedPages,
  });
}
