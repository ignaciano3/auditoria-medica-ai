import { describe, expect, test } from "bun:test";
import {
  emptyClinicalRecord,
  FakeLLMProvider,
  type LLMProvider,
} from "@audit/ai";
import type {
  ClinicalRecord,
  DocumentPage,
  DocumentStatus,
  Finding,
} from "@audit/domain";
import { errors } from "@audit/lib";
import {
  createExtractDocument,
  type ExtractDocumentDeps,
} from "./extract-document.ts";
import { ExtractionFailedError } from "./extraction.ts";

const visionPage: DocumentPage = {
  pageNumber: 1,
  text: "Ana ingresó por sepsis.",
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
  status: "vision",
};

const skippedPage: DocumentPage = {
  pageNumber: 2,
  text: "",
  docType: "flowsheet",
  handwritten: true,
  dataBearing: false,
  status: "skipped",
};

type Update = { status: DocumentStatus; error: string | null };

function extractedRecord(): ClinicalRecord {
  const record = emptyClinicalRecord();
  record.patient.name = {
    value: "Ana",
    sources: [{ documentId: "", pageNumber: 1, text: "Ana" }],
  };
  return record;
}

function makeDeps(
  options: {
    documentMissing?: boolean;
    pages?: DocumentPage[];
    extractError?: Error;
  } = {},
) {
  const updates: Update[] = [];
  const upserted: Array<{ documentId: string; findings: Finding[] }> = [];
  const errorEvents: Array<Record<string, unknown>> = [];

  const base = new FakeLLMProvider({
    record: extractedRecord(),
    findings: [],
  });
  const provider: LLMProvider = {
    async extractClinicalRecord(pages) {
      if (options.extractError) throw options.extractError;
      return base.extractClinicalRecord(pages);
    },
    analyzeClinicalRecord: (record) => base.analyzeClinicalRecord(record),
    generateClinicalSummary: (record) => base.generateClinicalSummary(record),
    generateAuditSummary: (record, findings) =>
      base.generateAuditSummary(record, findings),
    async *answerClinicalQuestion() {
      yield "";
    },
    proposeTranscriptionEdit: async () => ({ kind: "question" }),
  };

  const deps: ExtractDocumentDeps = {
    documents: {
      getById: () =>
        Promise.resolve(options.documentMissing ? null : { id: "d1" }),
      updateStatus: (_id, status, error) => {
        updates.push({ status, error: error ?? null });
        return Promise.resolve();
      },
    },
    pages: {
      listForDocument: () =>
        Promise.resolve(options.pages ?? [visionPage, skippedPage]),
    },
    provider,
    retry: { sleep: () => Promise.resolve() },
    clinicalRecords: {
      upsert: (documentId, _record, findings) => {
        upserted.push({ documentId, findings });
        return Promise.resolve();
      },
    },
    logger: {
      info: () => undefined,
      error: (event) => {
        errorEvents.push(event);
      },
    },
  };

  return { deps, updates, upserted, errorEvents };
}

describe("createExtractDocument", () => {
  test("re-extracts the current pages and marks the document ready", async () => {
    const { deps, updates, upserted } = makeDeps();

    await createExtractDocument(deps)({ documentId: "d1" });

    expect(updates.map((update) => update.status)).toEqual([
      "extracting",
      "ready",
    ]);
    expect(upserted).toHaveLength(1);
    expect(upserted[0]?.documentId).toBe("d1");
  });

  test("throws when the document does not exist and does not extract", async () => {
    const { deps, updates, upserted } = makeDeps({ documentMissing: true });

    await expect(
      createExtractDocument(deps)({ documentId: "d1" }),
    ).rejects.toThrow("Document not found");

    expect(updates).toHaveLength(0);
    expect(upserted).toHaveLength(0);
  });

  test("marks the document as error and rethrows when every chunk fails", async () => {
    const { deps, updates, upserted } = makeDeps({
      extractError: new Error("chunk boom"),
    });

    await expect(
      createExtractDocument(deps)({ documentId: "d1" }),
    ).rejects.toThrow(ExtractionFailedError);

    const last = updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.extractionFailed);
    expect(upserted).toHaveLength(0);
  });

  test("errors with the no-extractable-text message when no page is usable", async () => {
    const { deps, updates, upserted } = makeDeps({ pages: [skippedPage] });

    await createExtractDocument(deps)({ documentId: "d1" });

    const last = updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.noExtractableText);
    expect(updates.map((update) => update.status)).not.toContain("extracting");
    expect(upserted).toHaveLength(0);
  });
});
