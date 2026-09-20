import type { LLMProvider, RetryOptions } from "@audit/ai";
import type { ClinicalRecordIndex } from "@audit/db";
import {
  classifyPage,
  type OCRProvider,
  renderPdfPages,
} from "@audit/documents";
import type {
  ClinicalRecord,
  DocumentPage,
  DocumentStatus,
  Finding,
} from "@audit/domain";
import { errors, processing, type StorageProvider } from "@audit/lib";
import {
  ExtractionFailedError,
  noopLogger,
  type ProcessingLogger,
  runExtraction,
} from "./extraction.ts";

export { ExtractionFailedError, type ProcessingLogger } from "./extraction.ts";

type RenderedPage = {
  pageNumber: number;
  png: Uint8Array;
  width: number;
  height: number;
};

type RenderPages = (bytes: Uint8Array) => Promise<RenderedPage[]>;

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
  listForDocument(documentId: string): Promise<DocumentPage[]>;
  savePage(documentId: string, page: DocumentPage): Promise<void>;
};

type ClinicalRecordsDependency = {
  upsert(
    documentId: string,
    record: ClinicalRecord,
    findings: Finding[],
    indexed: ClinicalRecordIndex,
    extraction: {
      extractionIncomplete: boolean;
      failedChunkCount: number;
    },
  ): Promise<void>;
};

export type ProcessDocumentDeps = {
  documents: DocumentsDependency;
  pages: PagesDependency;
  storage: StorageProvider;
  ocr: OCRProvider;
  handwrittenOcr?: OCRProvider | undefined;
  provider: LLMProvider;
  clinicalRecords: ClinicalRecordsDependency;
  render?: RenderPages;
  logger?: ProcessingLogger;
  retry?: RetryOptions;
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
  const transcriptionProvider =
    page.handwritten && deps.handwrittenOcr ? deps.handwrittenOcr : deps.ocr;
  const text = await transcriptionProvider.transcribePage({
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
  rendered: RenderedPage[],
  existingPageNumbers: ReadonlySet<number>,
): Promise<DocumentPage[]> {
  const processedPages: DocumentPage[] = [];

  for (const page of rendered) {
    if (existingPageNumbers.has(page.pageNumber)) continue;
    const key = pageImageKey(documentId, page.pageNumber);
    const { pageNumber, png } = page;
    await deps.storage.put(key, png, "image/png");
    const classified = await classifyPage({ pageNumber, png }, deps.ocr, {
      onPageClassified: (classifiedPage, classification) => {
        logger.info({
          event: "page_classified",
          documentId,
          pageNumber: classifiedPage,
          docType: classification.docType,
          handwritten: classification.handwritten,
          dataBearing: classification.dataBearing,
        });
      },
      onPageError: (failedPage, error) => {
        logger.error({
          event: "page_classification_failed",
          documentId,
          pageNumber: failedPage,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    });
    let resolved: DocumentPage;
    try {
      resolved = await resolvePage(
        deps,
        logger,
        documentId,
        classified,
        png,
        key,
      );
    } catch {
      resolved = { ...classified, imageKey: key, status: "failed" };
      logger.error({
        event: "page_failed",
        documentId,
        pageNumber,
      });
    }
    processedPages.push(resolved);
    await deps.pages.savePage(documentId, resolved);
  }

  return processedPages;
}

export function createProcessDocument(
  deps: ProcessDocumentDeps,
): (job: { documentId: string }) => Promise<void> {
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
      const existingPages = await deps.pages.listForDocument(documentId);
      const existingPageNumbers = new Set(
        existingPages.map((page) => page.pageNumber),
      );
      await deps.documents.setPageCount(documentId, rendered.length);
      logger.info({
        event: "document_rendered",
        documentId,
        pageCount: rendered.length,
        resumedPageCount: existingPageNumbers.size,
      });

      logger.info({
        event: "classification_started",
        documentId,
        pageCount: rendered.length,
      });
      const processedPages = await processAllPages(
        deps,
        logger,
        documentId,
        rendered,
        existingPageNumbers,
      );

      const allPages = [...existingPages, ...processedPages].sort(
        (a, b) => a.pageNumber - b.pageNumber,
      );
      await runExtraction(deps, documentId, allPages);
    } catch (error) {
      logger.error({
        event: "document_failed",
        documentId,
        message: error instanceof Error ? error.message : String(error),
      });
      const message =
        error instanceof ExtractionFailedError
          ? errors.extractionFailed
          : errors.processingFailed;
      await deps.documents
        .updateStatus(documentId, "error", message)
        .catch(() => undefined);
      throw error;
    }
  };
}
