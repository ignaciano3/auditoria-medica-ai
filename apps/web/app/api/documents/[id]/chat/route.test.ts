import { describe, expect, test } from "bun:test";
import type { ChatContext, ChatIntent, LLMProvider } from "@audit/ai";
import type {
  ChatMessageRow,
  ClinicalRecordIndex,
  ClinicalRecordWithFindings,
} from "@audit/db";
import type {
  ClinicalRecord,
  DocumentPage,
  DocumentStatus,
  Finding,
} from "@audit/domain";
import type { ChatDeps } from "../../../../../lib/chat-service.ts";
import { createOutcomeResponse, parseChatBody } from "./route.ts";

describe("parseChatBody", () => {
  test("returns the trimmed message", () => {
    expect(parseChatBody({ message: "  hola  " })).toBe("hola");
  });
  test("rejects missing and empty messages", () => {
    expect(parseChatBody({})).toBeNull();
    expect(parseChatBody({ message: "   " })).toBeNull();
    expect(parseChatBody(null)).toBeNull();
  });
  test("rejects over-long messages", () => {
    expect(parseChatBody({ message: "x".repeat(2001) })).toBeNull();
  });
});

const record: ClinicalRecord = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
};

function pageOf(pageNumber: number, text: string): DocumentPage {
  return {
    pageNumber,
    text,
    docType: "evolution",
    handwritten: false,
    dataBearing: true,
    status: "vision",
  };
}

function makeDeps(options: {
  pages?: DocumentPage[];
  clinical?: ClinicalRecordWithFindings | null;
  added?: Array<{ role: string; content: string; citedPages: number[] }>;
}): ChatDeps {
  const pages = options.pages ?? [pageOf(3, "Paciente Ansel")];
  const added = options.added ?? [];
  const provider: LLMProvider = {
    extractClinicalRecord: () => Promise.reject(new Error("unused")),
    analyzeClinicalRecord: () => Promise.resolve([]),
    generateClinicalSummary: () => Promise.resolve(""),
    generateAuditSummary: () => Promise.resolve(""),
    proposeTranscriptionEdit: () => Promise.reject(new Error("unused")),
    answerClinicalQuestion: async function* () {
      yield "";
    },
  };
  return {
    documents: {
      getById: () => Promise.resolve({ status: "ready" as DocumentStatus }),
    },
    pages: {
      listForDocument: () => Promise.resolve(pages),
      getPage: (_documentId, pageNumber) =>
        Promise.resolve(
          pages.find((item) => item.pageNumber === pageNumber) ?? null,
        ),
      updateText: (_documentId: string, _pageNumber: number, _text: string) =>
        Promise.resolve(),
    },
    clinicalRecords: {
      getByDocument: () =>
        Promise.resolve(
          options.clinical === undefined
            ? {
                record,
                findings: [],
                extractionIncomplete: false,
                failedChunkCount: 0,
              }
            : options.clinical,
        ),
      updateRecord: (
        _documentId: string,
        _record: ClinicalRecord,
        _findings: Finding[],
        _indexed: ClinicalRecordIndex,
      ) => Promise.resolve(),
    },
    chatMessages: {
      listForDocument: () => Promise.resolve([]),
      add: (input) => {
        added.push({
          role: input.role,
          content: input.content,
          citedPages: input.citedPages,
        });
        return Promise.resolve({
          id: `m-${added.length}`,
          documentId: input.documentId,
          role: input.role,
          content: input.content,
          citedPages: input.citedPages,
          createdAt: new Date(),
        } as ChatMessageRow);
      },
    },
    provider,
  };
}

const context = {
  documentId: "d1",
  record,
  findings: [],
  pages: [],
  history: [],
  question: "corrige Ansel",
} as unknown as ChatContext;

describe("createOutcomeResponse", () => {
  test("returns the proposal without persisting an assistant row", async () => {
    const added: Array<{
      role: string;
      content: string;
      citedPages: number[];
    }> = [];
    const deps = makeDeps({ added });
    const intent: ChatIntent = {
      kind: "edit",
      pageNumber: 3,
      incorrect: "Ansel",
      correct: "Ariel",
    };
    const response = await createOutcomeResponse(
      deps,
      "d1",
      {
        context,
        pages: [pageOf(3, "Paciente Ansel")],
      },
      intent,
    );
    const text = await response.text();
    expect(text).toContain("proposal");
    expect(added).toHaveLength(0);
  });

  test("persists one assistant message when the edit cannot be located", async () => {
    const added: Array<{
      role: string;
      content: string;
      citedPages: number[];
    }> = [];
    const deps = makeDeps({ added });
    const intent: ChatIntent = {
      kind: "edit",
      pageNumber: 3,
      incorrect: "Zzz",
      correct: "Ariel",
    };
    const response = await createOutcomeResponse(
      deps,
      "d1",
      {
        context,
        pages: [pageOf(3, "Paciente Ansel")],
      },
      intent,
    );
    const text = await response.text();
    expect(text).toContain("message");
    expect(added).toHaveLength(1);
    expect(added[0]?.role).toBe("assistant");
  });
});
