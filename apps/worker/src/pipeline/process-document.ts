import {
  type LLMProvider,
  chunkPages,
  mapExtract,
  reduceRecords,
  stampFindingProvenance,
  stampProvenance,
} from "@audit/ai";
import type { ClinicalRecordIndex } from "@audit/db";
import {
  type OCRProvider,
  classifyPages,
  renderPdfPages,
} from "@audit/documents";
import {
  type ClinicalRecord,
  type DocumentPage,
  type DocumentStatus,
  type Finding,
  clinicalRecordSchema,
} from "@audit/domain";
import {
  type ProcessDocumentJob,
  type StorageProvider,
  errors,
  processing,
} from "@audit/lib";

type RenderedPage = {
  pageNumber: number;
  png: Uint8Array;
  width: number;
  height: number;
};

type RenderPages = (bytes: Uint8Array) => Promise<RenderedPage[]>;

export type ProcessingLogger = {
  info(event: Record<string, unknown>): void;
  error(event: Record<string, unknown>): void;
};

type DocumentRecord = { id: string; originalKey: string };

type DocumentsDependency = {
  getById(id: string): Promise<DocumentRecord | null>;
  updateStatus(
    id: string,
    status: DocumentStatus,
    error?: string | null,
  ): Promise<void>;
  setPageCount(id: string, pageCount: number): Promise<void>;
};

type PagesDependency = {
  replaceForDocument(documentId: string, pages: DocumentPage[]): Promise<void>;
};

type ClinicalRecordsDependency = {
  upsert(
    documentId: string,
    record: ClinicalRecord,
    findings: Finding[],
    indexed: ClinicalRecordIndex,
  ): Promise<void>;
};

export type ProcessDocumentDeps = {
  documents: DocumentsDependency;
  pages: PagesDependency;
  storage: StorageProvider;
  ocr: OCRProvider;
  provider: LLMProvider;
  clinicalRecords: ClinicalRecordsDependency;
  render?: RenderPages;
  logger?: ProcessingLogger;
};

const noopLogger: ProcessingLogger = {
  info: () => undefined,
  error: () => undefined,
};

function pageImageKey(documentId: string, pageNumber: number): string {
  return `documents/${documentId}/pages/${pageNumber}.png`;
}

async function resolvePage(
  deps: ProcessDocumentDeps,
  logger: ProcessingLogger,
  documentId: string,
  page: DocumentPage,
  png: Uint8Array,
  key: string,
): Promise<DocumentPage> {
  if (page.docType === "flowsheet") {
    const skipped: DocumentPage = {
      ...page,
      imageKey: key,
      status: "skipped",
      skipReason: processing.flowsheetSkipped,
    };
    logger.info({
      event: "page_processed",
      documentId,
      pageNumber: page.pageNumber,
      status: skipped.status,
    });
    return skipped;
  }
  if (!page.dataBearing) {
    const skipped: DocumentPage = {
      ...page,
      imageKey: key,
      status: "skipped",
      skipReason: processing.notDataBearing,
    };
    logger.info({
      event: "page_processed",
      documentId,
      pageNumber: page.pageNumber,
      status: skipped.status,
    });
    return skipped;
  }
  const text = await deps.ocr.transcribePage({
    pageNumber: page.pageNumber,
    png,
  });
  const transcribed: DocumentPage = {
    ...page,
    imageKey: key,
    status: "vision",
    text,
  };
  logger.info({
    event: "page_processed",
    documentId,
    pageNumber: page.pageNumber,
    status: transcribed.status,
  });
  return transcribed;
}

async function processAllPages(
  deps: ProcessDocumentDeps,
  logger: ProcessingLogger,
  documentId: string,
  classified: DocumentPage[],
  rendered: RenderedPage[],
): Promise<DocumentPage[]> {
  const pngByPage = new Map(
    rendered.map((page) => [page.pageNumber, page.png]),
  );
  const processedPages: DocumentPage[] = [];

  for (const page of classified) {
    const key = pageImageKey(documentId, page.pageNumber);
    const png = pngByPage.get(page.pageNumber);
    if (!png) throw new Error("Missing rendered page");
    await deps.storage.put(key, png, "image/png");
    try {
      processedPages.push(
        await resolvePage(deps, logger, documentId, page, png, key),
      );
    } catch {
      processedPages.push({ ...page, imageKey: key, status: "failed" });
      logger.error({
        event: "page_failed",
        documentId,
        pageNumber: page.pageNumber,
      });
    }
  }

  return processedPages;
}

export function createProcessDocument(
  deps: ProcessDocumentDeps,
): (job: ProcessDocumentJob) => Promise<void> {
  const render = deps.render ?? renderPdfPages;
  const logger = deps.logger ?? noopLogger;

  return async function processDocument(job) {
    const { documentId } = job;
    try {
      const document = await deps.documents.getById(documentId);
      if (!document) throw new Error("Document not found");
      await deps.documents.updateStatus(documentId, "processing");

      const bytes = await deps.storage.get(document.originalKey);
      const rendered = await render(bytes);
      await deps.documents.setPageCount(documentId, rendered.length);

      const classified = await classifyPages(rendered, deps.ocr);
      const processedPages = await processAllPages(
        deps,
        logger,
        documentId,
        classified,
        rendered,
      );

      await deps.pages.replaceForDocument(documentId, processedPages);

      const dataBearingPages = processedPages.filter(
        (page) =>
          page.dataBearing &&
          (page.status === "vision" || page.status === "text"),
      );
      if (dataBearingPages.length === 0) {
        logger.error({ event: "no_extractable_text", documentId });
        await deps.documents.updateStatus(
          documentId,
          "error",
          errors.noExtractableText,
        );
        return;
      }

      await deps.documents.updateStatus(documentId, "extracting");

      const chunks = chunkPages(processedPages);
      const records = await mapExtract(chunks, deps.provider, {
        onChunkError: (chunkIndex) => {
          logger.error({ event: "chunk_failed", documentId, chunkIndex });
        },
      });
      const merged = stampProvenance(reduceRecords(records), documentId);
      const validated = clinicalRecordSchema.parse(merged) as ClinicalRecord;

      let findings: Finding[] = [];
      try {
        findings = await deps.provider.analyzeClinicalRecord(validated);
      } catch {
        logger.error({ event: "findings_failed", documentId });
      }
      findings = stampFindingProvenance(findings, documentId);

      const indexed: ClinicalRecordIndex = {};
      if (validated.patient.name !== undefined) {
        indexed.patientName = validated.patient.name.value;
      }
      if (validated.hospitalization.admissionDate !== undefined) {
        indexed.admissionDate = validated.hospitalization.admissionDate.value;
      }
      if (validated.hospitalization.dischargeDate !== undefined) {
        indexed.dischargeDate = validated.hospitalization.dischargeDate.value;
      }

      await deps.clinicalRecords.upsert(
        documentId,
        validated,
        findings,
        indexed,
      );
      await deps.documents.updateStatus(documentId, "ready");
      logger.info({ event: "document_ready", documentId });
    } catch (error) {
      logger.error({ event: "document_failed", documentId });
      await deps.documents
        .updateStatus(documentId, "error", errors.processingFailed)
        .catch(() => undefined);
      throw error;
    }
  };
}
