import {
  allowedCitationPages,
  buildEditProposal,
  type ChatContext,
  type ChatIntent,
  type ChatTurn,
  type EditProposal,
  type LLMProvider,
  replaceLiteral,
  replaceLiteralDeep,
  retrievePages,
  validateCitations,
} from "@audit/ai";
import type {
  ChatMessageRow,
  ClinicalRecordIndex,
  ClinicalRecordWithFindings,
} from "@audit/db";
import {
  type ClinicalRecord,
  clinicalRecordSchema,
  type DocumentPage,
  type DocumentStatus,
  type Finding,
  findingSchema,
} from "@audit/domain";
import { errors, ui } from "@audit/lib";

export const MAX_QUESTION_LENGTH = 2000;
const MAX_HISTORY_TURNS = 10;

export type ChatDeps = {
  documents: {
    getById(id: string): Promise<{ status: DocumentStatus } | null>;
  };
  pages: {
    listForDocument(id: string): Promise<DocumentPage[]>;
    getPage(
      documentId: string,
      pageNumber: number,
    ): Promise<DocumentPage | null>;
    updateText(
      documentId: string,
      pageNumber: number,
      text: string,
    ): Promise<void>;
  };
  clinicalRecords: {
    getByDocument(id: string): Promise<ClinicalRecordWithFindings | null>;
    updateRecord(
      documentId: string,
      record: ClinicalRecord,
      findings: Finding[],
      indexed: ClinicalRecordIndex,
    ): Promise<void>;
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
  | { ok: true; context: ChatContext; pages: DocumentPage[] }
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

  return { ok: true, context, pages };
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

export type ChatOutcome =
  | { kind: "question" }
  | { kind: "proposal"; proposal: EditProposal }
  | { kind: "message"; content: string };

export async function classifyIntent(
  deps: ChatDeps,
  context: ChatContext,
): Promise<ChatIntent> {
  try {
    return await deps.provider.proposeTranscriptionEdit({
      question: context.question,
      history: context.history,
      pages: context.pages,
    });
  } catch {
    return { kind: "question" };
  }
}

export function planChatOutcome(
  pages: DocumentPage[],
  intent: ChatIntent,
): ChatOutcome {
  if (intent.kind === "question") return { kind: "question" };
  const built = buildEditProposal(pages, intent);
  if (!built.ok) {
    return {
      kind: "message",
      content: built.reason === "noMatch" ? ui.editNoMatch : ui.editNotLocated,
    };
  }
  return { kind: "proposal", proposal: built.proposal };
}

export type CorrectionDeps = Pick<ChatDeps, "pages" | "clinicalRecords">;

export type CorrectionResult =
  | { ok: true; newText: string; recordChanged: boolean }
  | { ok: false; reason: "notFound" | "noMatch" | "invalid" };

function indexRecord(record: ClinicalRecord): ClinicalRecordIndex {
  const indexed: ClinicalRecordIndex = {};
  if (record.patient.name !== undefined) {
    indexed.patientName = record.patient.name.value;
  }
  if (record.hospitalization.admissionDate !== undefined) {
    indexed.admissionDate = record.hospitalization.admissionDate.value;
  }
  if (record.hospitalization.dischargeDate !== undefined) {
    indexed.dischargeDate = record.hospitalization.dischargeDate.value;
  }
  return indexed;
}

export async function applyTranscriptionCorrection(
  deps: CorrectionDeps,
  input: {
    documentId: string;
    pageNumber: number;
    incorrect: string;
    correct: string;
  },
): Promise<CorrectionResult> {
  const page = await deps.pages.getPage(input.documentId, input.pageNumber);
  if (!page) return { ok: false, reason: "notFound" };

  const replaced = replaceLiteral(page.text, input.incorrect, input.correct);
  if (replaced.occurrences === 0) return { ok: false, reason: "noMatch" };

  const clinical = await deps.clinicalRecords.getByDocument(input.documentId);
  let patchedRecord: ClinicalRecord | null = null;
  let patchedFindings: Finding[] | null = null;
  let indexed: ClinicalRecordIndex | null = null;
  let recordChanged = false;
  if (clinical !== null) {
    const recordResult = replaceLiteralDeep(
      clinical.record,
      input.incorrect,
      input.correct,
    );
    const findingsResult = replaceLiteralDeep(
      clinical.findings,
      input.incorrect,
      input.correct,
    );
    recordChanged = recordResult.occurrences + findingsResult.occurrences > 0;
    const parsed = clinicalRecordSchema.safeParse(recordResult.value);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    patchedRecord = parsed.data as ClinicalRecord;
    const parsedFindings: Finding[] = [];
    for (const item of findingsResult.value as unknown[]) {
      const parsedFinding = findingSchema.safeParse(item);
      if (!parsedFinding.success) return { ok: false, reason: "invalid" };
      parsedFindings.push(parsedFinding.data as Finding);
    }
    patchedFindings = parsedFindings;
    indexed = indexRecord(patchedRecord);
  }

  await deps.pages.updateText(
    input.documentId,
    input.pageNumber,
    replaced.text,
  );
  if (recordChanged && patchedRecord && patchedFindings && indexed) {
    await deps.clinicalRecords.updateRecord(
      input.documentId,
      patchedRecord,
      patchedFindings,
      indexed,
    );
  }
  return {
    ok: true,
    newText: replaced.text,
    recordChanged,
  };
}
