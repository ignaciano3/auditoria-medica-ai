import { describe, expect, test } from "bun:test";
import type { ChatContext, LLMProvider } from "@audit/ai";
import type {
  ClinicalRecordWithFindings,
  ChatMessageRow as Row,
} from "@audit/db";
import type {
  ClinicalRecord,
  DocumentPage,
  DocumentStatus,
} from "@audit/domain";
import { ui } from "@audit/lib";
import { type ChatDeps, prepareChat, streamReply } from "./chat-service.ts";

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

const page: DocumentPage = {
  pageNumber: 5,
  text: "Levofloxacina 500 mg antibiótico",
  docType: "medsRecord",
  handwritten: false,
  dataBearing: true,
  status: "vision",
};

function fakeProvider(chunks: string[]): LLMProvider {
  return {
    extractClinicalRecord: () => Promise.reject(new Error("unused")),
    analyzeClinicalRecord: () => Promise.resolve([]),
    generateClinicalSummary: () => Promise.resolve(""),
    generateAuditSummary: () => Promise.resolve(""),
    answerClinicalQuestion: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function makeDeps(options: {
  status?: DocumentStatus;
  clinical?: ClinicalRecordWithFindings | null;
  pages?: DocumentPage[];
  chunks?: string[];
  added?: Array<{ role: string; content: string; citedPages: number[] }>;
}): ChatDeps {
  const added = options.added ?? [];
  return {
    documents: {
      getById: () =>
        Promise.resolve(
          options.status === undefined ? null : { status: options.status },
        ),
    },
    pages: { listForDocument: () => Promise.resolve(options.pages ?? [page]) },
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
        } as Row);
      },
    },
    provider: fakeProvider(options.chunks ?? ["Levofloxacina [p.5]"]),
  };
}

async function drain(
  generator: AsyncGenerator<string, Row, void>,
): Promise<{ deltas: string[]; final: Row }> {
  const deltas: string[] = [];
  while (true) {
    const { value, done } = await generator.next();
    if (done) return { deltas, final: value };
    deltas.push(value);
  }
}

describe("prepareChat", () => {
  test("rejects an empty question", async () => {
    const result = await prepareChat(makeDeps({ status: "ready" }), {
      documentId: "d1",
      question: "   ",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid", message: ui.chatInvalid },
    });
  });

  test("returns notFound when the document is missing", async () => {
    const result = await prepareChat(makeDeps({}), {
      documentId: "d1",
      question: "hola",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("notFound");
  });

  test("returns notReady while processing", async () => {
    const result = await prepareChat(makeDeps({ status: "analyzing" }), {
      documentId: "d1",
      question: "hola",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("notReady");
  });

  test("persists the user message and builds the context", async () => {
    const added: Array<{
      role: string;
      content: string;
      citedPages: number[];
    }> = [];
    const result = await prepareChat(makeDeps({ status: "ready", added }), {
      documentId: "d1",
      question: "  ¿Qué antibiótico?  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.pages.map((p) => p.pageNumber)).toEqual([5]);
    expect(result.context.question).toBe("¿Qué antibiótico?");
    expect(added).toEqual([
      { role: "user", content: "¿Qué antibiótico?", citedPages: [] },
    ]);
  });
});

describe("streamReply", () => {
  const context: ChatContext = {
    documentId: "d1",
    record,
    findings: [],
    pages: [{ pageNumber: 5, text: "Levofloxacina", score: 1 }],
    history: [],
    question: "q",
  };

  test("yields deltas and persists the validated assistant message", async () => {
    const added: Array<{
      role: string;
      content: string;
      citedPages: number[];
    }> = [];
    const result = await drain(streamReply(makeDeps({ added }), context));
    expect(result.deltas).toEqual(["Levofloxacina [p.5]"]);
    expect(added[0]).toEqual({
      role: "assistant",
      content: "Levofloxacina [p.5]",
      citedPages: [5],
    });
  });

  test("drops citations to pages that are not allowed", async () => {
    const added: Array<{
      role: string;
      content: string;
      citedPages: number[];
    }> = [];
    await drain(
      streamReply(makeDeps({ added, chunks: ["Se ve en [p.99]."] }), context),
    );
    expect(added[0]?.citedPages).toEqual([]);
  });

  test("throws without persisting when the provider is empty", async () => {
    const added: Array<{
      role: string;
      content: string;
      citedPages: number[];
    }> = [];
    const call = drain(streamReply(makeDeps({ added, chunks: [] }), context));
    await expect(call).rejects.toBeInstanceOf(Error);
    expect(added).toEqual([]);
  });
});
