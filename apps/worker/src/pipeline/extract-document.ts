import type { LLMProvider } from "@audit/ai";
import type { ClinicalRecordIndex } from "@audit/db";
import type {
  ClinicalRecord,
  DocumentPage,
  DocumentStatus,
  Finding,
} from "@audit/domain";
import { errors } from "@audit/lib";
import {
  ExtractionFailedError,
  noopLogger,
  type ProcessingLogger,
  runExtraction,
} from "./extraction.ts";

export type ExtractDocumentDeps = {
  documents: {
    getById(id: string): Promise<{ id: string } | null>;
    updateStatus(
      id: string,
      status: DocumentStatus,
      error?: string | null,
    ): Promise<void>;
  };
  pages: {
    listForDocument(documentId: string): Promise<DocumentPage[]>;
  };
  provider: LLMProvider;
  clinicalRecords: {
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
  logger?: ProcessingLogger;
};

export function createExtractDocument(deps: ExtractDocumentDeps) {
  const logger = deps.logger ?? noopLogger;

  return async function extractDocument(job: {
    documentId: string;
  }): Promise<void> {
    const { documentId } = job;
    const document = await deps.documents.getById(documentId);
    if (!document) throw new Error("Document not found");

    try {
      const pages = await deps.pages.listForDocument(documentId);
      await runExtraction(deps, documentId, pages);
    } catch (error) {
      logger.error({ event: "document_failed", documentId });
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
