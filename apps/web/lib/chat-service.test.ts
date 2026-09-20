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
import { ui } from "@audit/lib";
import {
  applyTranscriptionCorrection,
  type ChatDeps,
  classifyIntent,
  planChatOutcome,
  prepareChat,
  streamReply,
} from "./chat-service.ts";

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

function fakeProvider(
  chunks: string[],
  intent: ChatIntent = { kind: "question" },
): LLMProvider {
  return {
    extractClinicalRecord: () => Promise.reject(new Error("unused")),
    analyzeClinicalRecord: () => Promise.resolve([]),
    generateClinicalSummary: () => Promise.resolve(""),
    generateAuditSummary: () => Promise.resolve(""),
    proposeTranscriptionEdit: () => Promise.resolve(intent),
    answerClinicalQuestion: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  };
}

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
  status?: DocumentStatus;
  clinical?: ClinicalRecordWithFindings | null;
  pages?: DocumentPage[];
  chunks?: string[];
  intent?: ChatIntent;
  added?: Array<{ role: string; content: string; citedPages: number[] }>;
  written?: Array<{ documentId: string; pageNumber: number; text: string }>;
  recordUpdates?: Array<{
    record: ClinicalRecord;
    findings: Finding[];
    indexed: ClinicalRecordIndex;
  }>;
}): ChatDeps {
  const added = options.added ?? [];
  const pagesList = options.pages ?? [page];
  return {
    documents: {
      getById: () =>
        Promise.resolve(
          options.status === undefined ? null : { status: options.status },
        ),
    },
    pages: {
      listForDocument: () => Promise.resolve(pagesList),
      getPage: (_documentId, pageNumber) =>
        Promise.resolve(
          pagesList.find((item) => item.pageNumber === pageNumber) ?? null,
        ),
      updateText: (documentId, pageNumber, text) => {
        options.written?.push({ documentId, pageNumber, text });
        return Promise.resolve();
      },
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
      updateRecord: (_documentId, updated, findings, indexed) => {
        options.recordUpdates?.push({ record: updated, findings, indexed });
        return Promise.resolve();
      },
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
    provider: fakeProvider(
      options.chunks ?? ["Levofloxacina [p.5]"],
      options.intent,
    ),
  };
}

const context: ChatContext = {
  documentId: "d1",
  record,
  findings: [],
  pages: [{ pageNumber: 5, text: "Levofloxacina", score: 1 }],
  history: [],
  question: "q",
};

async function drain(
  generator: AsyncGenerator<string, ChatMessageRow, void>,
): Promise<{ deltas: string[]; final: ChatMessageRow }> {
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
    expect(result.pages.map((p) => p.pageNumber)).toEqual([5]);
    expect(result.context.pages.map((p) => p.pageNumber)).toEqual([5]);
    expect(result.context.question).toBe("¿Qué antibiótico?");
    expect(added).toEqual([
      { role: "user", content: "¿Qué antibiótico?", citedPages: [] },
    ]);
  });
});

describe("streamReply", () => {
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

describe("classifyIntent", () => {
  test("returns the provider intent", async () => {
    const intent = await classifyIntent(
      makeDeps({
        status: "ready",
        intent: { kind: "edit", incorrect: "Ansel", correct: "Ariel" },
      }),
      context,
    );
    expect(intent).toEqual({
      kind: "edit",
      incorrect: "Ansel",
      correct: "Ariel",
    });
  });

  test("falls back to a question when the provider throws", async () => {
    const deps = makeDeps({ status: "ready" });
    deps.provider.proposeTranscriptionEdit = () =>
      Promise.reject(new Error("provider down"));
    await expect(classifyIntent(deps, context)).resolves.toEqual({
      kind: "question",
    });
  });
});

describe("planChatOutcome", () => {
  const pages = [pageOf(3, "Paciente Ansel")];

  test("passes questions through", () => {
    expect(planChatOutcome(pages, { kind: "question" })).toEqual({
      kind: "question",
    });
  });

  test("resolves an edit into a proposal", () => {
    const outcome = planChatOutcome(pages, {
      kind: "edit",
      pageNumber: 3,
      incorrect: "Ansel",
      correct: "Ariel",
    });
    expect(outcome.kind).toBe("proposal");
    if (outcome.kind === "proposal") {
      expect(outcome.proposal.resultingText).toBe("Paciente Ariel");
      expect(outcome.proposal.occurrences).toBe(1);
    }
  });

  test("explains an edit that cannot be located", () => {
    expect(
      planChatOutcome(pages, {
        kind: "edit",
        incorrect: "Zzz",
        correct: "Ariel",
      }),
    ).toEqual({ kind: "message", content: ui.editNotLocated });
  });

  test("explains a literal absent from the named page", () => {
    expect(
      planChatOutcome(pages, {
        kind: "edit",
        pageNumber: 3,
        incorrect: "Zzz",
        correct: "Ariel",
      }),
    ).toEqual({ kind: "message", content: ui.editNoMatch });
  });
});

describe("applyTranscriptionCorrection", () => {
  const pages = [pageOf(3, "Paciente Ansel")];
  const clinical: ClinicalRecordWithFindings = {
    record: {
      ...record,
      patient: {
        name: {
          value: "Ansel",
          sources: [{ documentId: "d1", pageNumber: 3, text: "Ansel" }],
        },
      },
    },
    findings: [
      {
        id: "f1",
        severity: "high",
        category: "other",
        title: "Ansel",
        explanation: "El nombre Ansel se repite.",
        evidence: [
          {
            source: { documentId: "d1", pageNumber: 3, text: "Ansel" },
            relevance: "Nombre dudoso.",
          },
        ],
        requiresHumanReview: true,
      },
    ],
    extractionIncomplete: false,
    failedChunkCount: 0,
  };
  const input = {
    documentId: "d1",
    pageNumber: 3,
    incorrect: "Ansel",
    correct: "Ariel",
  };

  test("corrects the page and propagates to the record and findings", async () => {
    const written: Array<{
      documentId: string;
      pageNumber: number;
      text: string;
    }> = [];
    const recordUpdates: Array<{
      record: ClinicalRecord;
      findings: Finding[];
      indexed: ClinicalRecordIndex;
    }> = [];
    const result = await applyTranscriptionCorrection(
      makeDeps({ status: "ready", pages, clinical, written, recordUpdates }),
      input,
    );
    expect(result).toEqual({
      ok: true,
      newText: "Paciente Ariel",
      recordChanged: true,
    });
    expect(written).toEqual([
      { documentId: "d1", pageNumber: 3, text: "Paciente Ariel" },
    ]);
    expect(recordUpdates[0]?.record.patient.name?.value).toBe("Ariel");
    expect(recordUpdates[0]?.findings[0]?.title).toBe("Ariel");
    expect(recordUpdates[0]?.indexed.patientName).toBe("Ariel");
  });

  test("does not write the record when only the page contains the literal", async () => {
    const written: Array<{
      documentId: string;
      pageNumber: number;
      text: string;
    }> = [];
    const recordUpdates: Array<{
      record: ClinicalRecord;
      findings: Finding[];
      indexed: ClinicalRecordIndex;
    }> = [];
    const storedPages = [pageOf(3, "Paciente Ansel")];
    const storedClinical: ClinicalRecordWithFindings = {
      record: {
        ...record,
        patient: {
          name: {
            value: "Otro",
            sources: [{ documentId: "d1", pageNumber: 3, text: "Otro" }],
          },
        },
      },
      findings: [],
      extractionIncomplete: false,
      failedChunkCount: 0,
    };
    const result = await applyTranscriptionCorrection(
      makeDeps({
        status: "ready",
        pages: storedPages,
        clinical: storedClinical,
        written,
        recordUpdates,
      }),
      input,
    );
    expect(result).toEqual({
      ok: true,
      newText: "Paciente Ariel",
      recordChanged: false,
    });
    expect(written).toHaveLength(1);
    expect(recordUpdates).toHaveLength(0);
  });

  test("refuses a literal that is not on the page and writes nothing", async () => {
    const written: Array<{
      documentId: string;
      pageNumber: number;
      text: string;
    }> = [];
    const result = await applyTranscriptionCorrection(
      makeDeps({ status: "ready", pages, clinical, written }),
      { ...input, incorrect: "Zzz" },
    );
    expect(result).toEqual({ ok: false, reason: "noMatch" });
    expect(written).toHaveLength(0);
  });

  test("refuses a missing page", async () => {
    const result = await applyTranscriptionCorrection(
      makeDeps({ status: "ready", pages, clinical }),
      { ...input, pageNumber: 9 },
    );
    expect(result).toEqual({ ok: false, reason: "notFound" });
  });

  test("corrects the page even when there is no stored record", async () => {
    const written: Array<{
      documentId: string;
      pageNumber: number;
      text: string;
    }> = [];
    const result = await applyTranscriptionCorrection(
      makeDeps({ status: "ready", pages, clinical: null, written }),
      input,
    );
    expect(result).toEqual({
      ok: true,
      newText: "Paciente Ariel",
      recordChanged: false,
    });
    expect(written).toHaveLength(1);
  });

  test("refuses and writes nothing when the patched record is invalid", async () => {
    const written: Array<{
      documentId: string;
      pageNumber: number;
      text: string;
    }> = [];
    const recordUpdates: Array<{
      record: ClinicalRecord;
      findings: Finding[];
      indexed: ClinicalRecordIndex;
    }> = [];
    const invalidClinical = {
      record: {
        patient: {},
        hospitalization: { diagnoses: [] },
        history: { pathological: [], allergies: [], usualMedications: [] },
        medications: [{ name: { value: "Ansel", sources: [] }, sources: [] }],
        laboratory: [],
        studies: [],
        microbiology: [],
        clinicalEvents: [],
      },
      findings: [],
      extractionIncomplete: false,
      failedChunkCount: 0,
    } as unknown as ClinicalRecordWithFindings;
    const result = await applyTranscriptionCorrection(
      makeDeps({
        status: "ready",
        pages,
        clinical: invalidClinical,
        written,
        recordUpdates,
      }),
      input,
    );
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(written).toHaveLength(0);
    expect(recordUpdates).toHaveLength(0);
  });
});
