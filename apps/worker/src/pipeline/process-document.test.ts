import { describe, expect, test } from "bun:test";
import {
  emptyClinicalRecord,
  FakeLLMProvider,
  type LLMProvider,
} from "@audit/ai";
import type { ClinicalRecordIndex } from "@audit/db";
import type { PageClassification, PageImage } from "@audit/documents";
import type {
  ClinicalRecord,
  DocumentPage,
  DocumentStatus,
  Finding,
  Source,
} from "@audit/domain";
import { errors, processing } from "@audit/lib";
import {
  createProcessDocument,
  ExtractionFailedError,
} from "./process-document.ts";

type Update = { status: DocumentStatus; error: string | null };

type Upserted = {
  documentId: string;
  record: ClinicalRecord;
  findings: Finding[];
  indexed: ClinicalRecordIndex;
  extraction: {
    extractionIncomplete: boolean;
    failedChunkCount: number;
  };
};

const evolution: PageClassification = {
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
};

const ghostSource = (pageNumber: number, text: string): Source => ({
  documentId: "",
  pageNumber,
  text,
});

function extractedRecord(): ClinicalRecord {
  const record = emptyClinicalRecord();
  record.patient.name = { value: "Ana", sources: [ghostSource(1, "Ana")] };
  record.hospitalization.diagnoses = [
    { value: "Sepsis", sources: [ghostSource(1, "sepsis")] },
  ];
  return record;
}

const findingFixture: Finding[] = [
  {
    id: "f1",
    severity: "high",
    category: "contradiction",
    title: "Contradicción",
    explanation: "Dos fechas.",
    evidence: [{ source: ghostSource(1, "fecha"), relevance: "r" }],
    requiresHumanReview: true,
  },
];

function collectDocumentIds(value: unknown): string[] {
  if (Array.isArray(value))
    return value.flatMap((item) => collectDocumentIds(item));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const own =
      typeof record.documentId === "string" ? [record.documentId] : [];
    return [
      ...own,
      ...Object.values(record).flatMap((child) => collectDocumentIds(child)),
    ];
  }
  return [];
}

const defaultRender = () =>
  Promise.resolve([
    { pageNumber: 1, png: new Uint8Array([1]), width: 10, height: 10 },
    { pageNumber: 2, png: new Uint8Array([2]), width: 10, height: 10 },
  ]);

function renderPageCount(count: number) {
  return Promise.resolve(
    Array.from({ length: count }, (_value, index) => ({
      pageNumber: index + 1,
      png: new Uint8Array([index]),
      width: 10,
      height: 10,
    })),
  );
}

function makeDeps(options: {
  render?: () => Promise<
    Array<{
      pageNumber: number;
      png: Uint8Array;
      width: number;
      height: number;
    }>
  >;
  storageGet?: () => Promise<Uint8Array>;
  storagePut?: (key: string) => Promise<void>;
  classifyPage?: (input: PageImage) => Promise<PageClassification>;
  transcribePage?: (input: PageImage) => Promise<string>;
  handwrittenTranscribePage?: (input: PageImage) => Promise<string>;
  record?: ClinicalRecord;
  findings?: Finding[];
  analyzeError?: Error;
  extractError?: Error;
  extractErrorCall?: number;
}) {
  const updates: Update[] = [];
  const saved: DocumentPage[][] = [];
  const storedKeys: string[] = [];
  const pageCounts: number[] = [];
  const infoEvents: Array<Record<string, unknown>> = [];
  const errorEvents: Array<Record<string, unknown>> = [];
  const upserted: Upserted[] = [];
  const extractCalls: DocumentPage[][] = [];
  const analyzeCalls: ClinicalRecord[] = [];
  let extractCallIndex = 0;

  const base = new FakeLLMProvider({
    record: options.record ?? extractedRecord(),
    findings: options.findings ?? findingFixture,
  });
  const provider: LLMProvider = {
    async extractClinicalRecord(pages) {
      const callIndex = extractCallIndex;
      extractCallIndex += 1;
      extractCalls.push(pages);
      if (
        options.extractError &&
        (options.extractErrorCall === undefined ||
          options.extractErrorCall === callIndex)
      ) {
        throw options.extractError;
      }
      return base.extractClinicalRecord(pages);
    },
    async analyzeClinicalRecord(record) {
      analyzeCalls.push(record);
      if (options.analyzeError) throw options.analyzeError;
      return base.analyzeClinicalRecord(record);
    },
    generateClinicalSummary: (record) => base.generateClinicalSummary(record),
    generateAuditSummary: (record, findings) =>
      base.generateAuditSummary(record, findings),
  };

  const processDocument = createProcessDocument({
    documents: {
      getById: () =>
        Promise.resolve({
          id: "d1",
          originalKey: "documents/d1/original.pdf",
        }),
      updateStatus: (_id, status, error) => {
        updates.push({ status, error: error ?? null });
        return Promise.resolve();
      },
      setPageCount: (_id, pageCount) => {
        pageCounts.push(pageCount);
        return Promise.resolve();
      },
    },
    pages: {
      replaceForDocument: (_id, pages) => {
        saved.push(pages);
        return Promise.resolve();
      },
    },
    storage: {
      get: options.storageGet ?? (() => Promise.resolve(new Uint8Array([1]))),
      put: (key) => {
        storedKeys.push(key);
        return options.storagePut?.(key) ?? Promise.resolve();
      },
      delete: () => Promise.resolve(),
    },
    render: options.render ?? defaultRender,
    ocr: {
      classifyPage: options.classifyPage ?? (() => Promise.resolve(evolution)),
      transcribePage:
        options.transcribePage ?? (() => Promise.resolve("texto")),
    },
    handwrittenOcr: options.handwrittenTranscribePage
      ? {
          classifyPage: () => Promise.resolve(evolution),
          transcribePage: options.handwrittenTranscribePage,
        }
      : undefined,
    provider,
    clinicalRecords: {
      upsert: (documentId, record, findings, indexed, extraction) => {
        upserted.push({ documentId, record, findings, indexed, extraction });
        return Promise.resolve();
      },
    },
    logger: {
      info: (event) => {
        infoEvents.push(event);
      },
      error: (event) => {
        errorEvents.push(event);
      },
    },
  });

  return {
    processDocument,
    updates,
    saved,
    storedKeys,
    pageCounts,
    infoEvents,
    errorEvents,
    upserted,
    extractCalls,
    analyzeCalls,
  };
}

describe("createProcessDocument", () => {
  test("renders, classifies, transcribes, and marks the document ready", async () => {
    const deps = makeDeps({
      classifyPage: ({ pageNumber }) =>
        Promise.resolve(
          pageNumber === 2
            ? { docType: "flowsheet", handwritten: true, dataBearing: false }
            : evolution,
        ),
    });

    await deps.processDocument({ documentId: "d1" });

    const statuses = deps.updates.map((update) => update.status);
    expect(statuses).toEqual(["processing", "extracting", "ready"]);
    expect(deps.pageCounts).toEqual([2]);
    expect(deps.saved).toHaveLength(1);

    expect(deps.storedKeys).toEqual([
      "documents/d1/pages/1.png",
      "documents/d1/pages/2.png",
    ]);

    const pages = deps.saved[0] ?? [];
    expect(pages).toHaveLength(2);

    expect(pages[0]).toMatchObject({
      pageNumber: 1,
      status: "vision",
      text: "texto",
      imageKey: "documents/d1/pages/1.png",
    });

    expect(pages[1]).toMatchObject({
      pageNumber: 2,
      status: "skipped",
      skipReason: processing.flowsheetSkipped,
      imageKey: "documents/d1/pages/2.png",
    });
  });

  test("persists the reduced record, stamps provenance, and marks ready", async () => {
    const deps = makeDeps({});

    await deps.processDocument({ documentId: "d1" });

    expect(deps.updates.map((update) => update.status)).toEqual([
      "processing",
      "extracting",
      "ready",
    ]);
    expect(deps.extractCalls).toHaveLength(1);
    expect(deps.analyzeCalls).toHaveLength(1);
    expect(deps.upserted).toHaveLength(1);

    const persisted = deps.upserted[0];
    expect(persisted?.documentId).toBe("d1");
    expect(persisted?.record.patient.name?.value).toBe("Ana");
    expect(persisted?.findings).toHaveLength(1);
    expect(persisted?.indexed.patientName).toBe("Ana");
    expect(persisted?.extraction).toEqual({
      extractionIncomplete: false,
      failedChunkCount: 0,
    });

    const recordIds = collectDocumentIds(persisted?.record);
    expect(recordIds.length).toBeGreaterThan(0);
    expect(recordIds.every((id) => id === "d1")).toBe(true);
    expect(recordIds.includes("")).toBe(false);

    const findingIds = collectDocumentIds(persisted?.findings);
    expect(findingIds.length).toBeGreaterThan(0);
    expect(findingIds.every((id) => id === "d1")).toBe(true);
  });

  test("fails the document when every extraction chunk fails", async () => {
    const deps = makeDeps({ extractError: new Error("chunk boom") });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toThrow(
      ExtractionFailedError,
    );

    expect(deps.updates.map((update) => update.status)).not.toContain("ready");
    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.extractionFailed);
    expect(deps.extractCalls).toHaveLength(1);
    expect(deps.analyzeCalls).toHaveLength(0);
    expect(deps.upserted).toHaveLength(0);
    expect(
      deps.errorEvents.some((event) => event.event === "chunk_failed"),
    ).toBe(true);
  });

  test("persists a partial record when only some chunks fail", async () => {
    const deps = makeDeps({
      render: () => renderPageCount(5),
      extractError: new Error("chunk boom"),
      extractErrorCall: 0,
    });

    await deps.processDocument({ documentId: "d1" });

    expect(deps.extractCalls).toHaveLength(2);
    expect(deps.updates.map((update) => update.status)).toEqual([
      "processing",
      "extracting",
      "ready",
    ]);
    expect(deps.upserted).toHaveLength(1);
    expect(deps.upserted[0]?.record.patient.name?.value).toBe("Ana");
    expect(deps.upserted[0]?.extraction).toEqual({
      extractionIncomplete: true,
      failedChunkCount: 1,
    });
  });

  test("skips non-data-bearing pages with a reason", async () => {
    const deps = makeDeps({
      classifyPage: () =>
        Promise.resolve({
          docType: "other",
          handwritten: false,
          dataBearing: false,
        }),
    });

    await deps.processDocument({ documentId: "d1" });

    const pages = deps.saved[0] ?? [];
    expect(pages[0]?.status).toBe("skipped");
    expect(pages[0]?.skipReason).toBe(processing.notDataBearing);
    expect(pages[1]?.status).toBe("skipped");
  });

  test("errors with the no-extractable-text message and skips the provider", async () => {
    const deps = makeDeps({
      classifyPage: () =>
        Promise.resolve({
          docType: "other",
          handwritten: false,
          dataBearing: false,
        }),
    });

    await deps.processDocument({ documentId: "d1" });

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.noExtractableText);
    expect(deps.updates.map((update) => update.status)).not.toContain(
      "extracting",
    );
    expect(deps.extractCalls).toHaveLength(0);
    expect(deps.analyzeCalls).toHaveLength(0);
    expect(deps.upserted).toHaveLength(0);
  });

  test("errors with the no-extractable-text message when every page fails", async () => {
    const deps = makeDeps({
      transcribePage: () => Promise.reject(new Error("ocr down")),
    });

    await deps.processDocument({ documentId: "d1" });

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.noExtractableText);
    expect(deps.extractCalls).toHaveLength(0);
  });

  test("marks a failed page and keeps processing the rest", async () => {
    const deps = makeDeps({
      transcribePage: ({ pageNumber }) =>
        pageNumber === 1
          ? Promise.reject(new Error("ocr down"))
          : Promise.resolve("texto"),
    });

    await deps.processDocument({ documentId: "d1" });

    const pages = deps.saved[0] ?? [];
    expect(pages[0]?.status).toBe("failed");
    expect(pages[0]?.imageKey).toBe("documents/d1/pages/1.png");
    expect(pages[1]?.status).toBe("vision");
    expect(deps.updates.map((update) => update.status)).toEqual([
      "processing",
      "extracting",
      "ready",
    ]);
  });

  test("persists empty findings and stays ready when analysis fails", async () => {
    const deps = makeDeps({ analyzeError: new Error("analysis down") });

    await deps.processDocument({ documentId: "d1" });

    expect(deps.updates.map((update) => update.status)).toEqual([
      "processing",
      "extracting",
      "ready",
    ]);
    expect(deps.upserted).toHaveLength(1);
    expect(deps.upserted[0]?.findings).toEqual([]);
    expect(deps.upserted[0]?.extraction).toEqual({
      extractionIncomplete: true,
      failedChunkCount: 0,
    });
    expect(
      deps.errorEvents.some((event) => event.event === "findings_failed"),
    ).toBe(true);
  });

  test("fails the document when the extracted record is invalid", async () => {
    const invalid = emptyClinicalRecord();
    invalid.patient.age = { value: 60, sources: [] };
    const deps = makeDeps({ record: invalid });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toThrow();

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.processingFailed);
    expect(deps.upserted).toHaveLength(0);
  });

  test("marks the document as error and rethrows when rendering fails", async () => {
    const failure = new Error("render boom");
    const deps = makeDeps({
      render: () => Promise.reject(failure),
    });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toBe(
      failure,
    );

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.processingFailed);
    expect(deps.saved).toHaveLength(0);
  });

  test("marks the document as error and rethrows when download fails", async () => {
    const failure = new Error("storage boom");
    const deps = makeDeps({
      storageGet: () => Promise.reject(failure),
    });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toBe(
      failure,
    );

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.processingFailed);
    expect(deps.saved).toHaveLength(0);
  });

  test("marks the document as error and rethrows when storing a page fails", async () => {
    const failure = new Error("put boom");
    const deps = makeDeps({
      storagePut: () => Promise.reject(failure),
    });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toBe(
      failure,
    );

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.processingFailed);
    expect(deps.saved).toHaveLength(0);
  });

  test("assigns stable content-derived finding ids across runs", async () => {
    const first = makeDeps({});
    const second = makeDeps({});

    await first.processDocument({ documentId: "d1" });
    await second.processDocument({ documentId: "d1" });

    const firstIds = first.upserted[0]?.findings.map((finding) => finding.id);
    const secondIds = second.upserted[0]?.findings.map((finding) => finding.id);

    expect(firstIds).toHaveLength(1);
    expect(firstIds?.[0]?.startsWith("fnd-")).toBe(true);
    expect(firstIds).toEqual(secondIds);
  });

  test("does not depend on the order findings come back from the provider", async () => {
    const alpha: Finding = {
      id: "provider-a",
      severity: "high",
      category: "temporal",
      title: "Alfa",
      explanation: "e",
      evidence: [{ source: ghostSource(1, "a"), relevance: "r" }],
      requiresHumanReview: true,
    };
    const beta: Finding = {
      id: "provider-b",
      severity: "low",
      category: "medication",
      title: "Beta",
      explanation: "e",
      evidence: [{ source: ghostSource(2, "b"), relevance: "r" }],
      requiresHumanReview: true,
    };

    const forward = makeDeps({ findings: [alpha, beta] });
    const backward = makeDeps({ findings: [beta, alpha] });

    await forward.processDocument({ documentId: "d1" });
    await backward.processDocument({ documentId: "d1" });

    const forwardIds = (forward.upserted[0]?.findings ?? [])
      .map((finding) => finding.id)
      .sort();
    const backwardIds = (backward.upserted[0]?.findings ?? [])
      .map((finding) => finding.id)
      .sort();

    expect(forwardIds).toEqual(backwardIds);
  });

  test("routes handwritten pages to the handwritten transcriber", async () => {
    const deps = makeDeps({
      classifyPage: ({ pageNumber }) =>
        Promise.resolve(
          pageNumber === 1
            ? { docType: "evolution", handwritten: true, dataBearing: true }
            : evolution,
        ),
      transcribePage: () => Promise.resolve("printed"),
      handwrittenTranscribePage: () => Promise.resolve("manuscrito"),
    });

    await deps.processDocument({ documentId: "d1" });

    const pages = deps.saved[0] ?? [];
    expect(pages[0]?.text).toBe("manuscrito");
    expect(pages[1]?.text).toBe("printed");
  });

  test("uses the default OCR for handwritten pages without a handwritten transcriber", async () => {
    const deps = makeDeps({
      classifyPage: () =>
        Promise.resolve({
          docType: "evolution",
          handwritten: true,
          dataBearing: true,
        }),
      transcribePage: () => Promise.resolve("tesseract"),
    });

    await deps.processDocument({ documentId: "d1" });

    const pages = deps.saved[0] ?? [];
    expect(pages.map((page) => page.text)).toEqual(["tesseract", "tesseract"]);
  });

  test("logs render and classification phases before transcribing", async () => {
    const deps = makeDeps({});

    await deps.processDocument({ documentId: "d1" });

    const events = deps.infoEvents.map((event) => event.event);
    expect(events).toContain("document_rendered");
    expect(events).toContain("classification_started");
  });

  test("logs every classified page so progress is visible", async () => {
    const deps = makeDeps({});

    await deps.processDocument({ documentId: "d1" });

    const classified = deps.infoEvents.filter(
      (event) => event.event === "page_classified",
    );
    expect(classified.map((event) => event.pageNumber)).toEqual([1, 2]);
  });

  test("logs classification failures with the error message", async () => {
    const deps = makeDeps({
      classifyPage: () => Promise.reject(new Error("429 no credits")),
    });

    await deps.processDocument({ documentId: "d1" });

    const failures = deps.errorEvents.filter(
      (event) => event.event === "page_classification_failed",
    );
    expect(failures.map((event) => event.pageNumber)).toEqual([1, 2]);
    expect(failures[0]?.message).toBe("429 no credits");
  });

  test("logs the failure reason when processing fails", async () => {
    const deps = makeDeps({
      render: () => Promise.reject(new Error("render boom")),
    });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toThrow();

    const failed = deps.errorEvents.find(
      (event) => event.event === "document_failed",
    );
    expect(failed?.message).toBe("render boom");
  });
});
