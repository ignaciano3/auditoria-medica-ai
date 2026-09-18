import type { OCRProvider } from "@audit/documents";
import type { DocumentPage, PageStatus } from "@audit/domain";
import type { StorageProvider } from "@audit/lib";
import { noopLogger, type ProcessingLogger } from "./extraction.ts";

export type TranscribePageDeps = {
  pages: {
    getPage(
      documentId: string,
      pageNumber: number,
    ): Promise<DocumentPage | null>;
    markStatus(
      documentId: string,
      pageNumber: number,
      status: PageStatus,
      text?: string,
    ): Promise<void>;
  };
  storage: StorageProvider;
  ocr: OCRProvider;
  handwrittenOcr?: OCRProvider | undefined;
  logger?: ProcessingLogger;
};

export function createTranscribePage(deps: TranscribePageDeps) {
  const logger = deps.logger ?? noopLogger;

  return async function transcribePage(job: {
    documentId: string;
    pageNumber: number;
  }): Promise<void> {
    const { documentId, pageNumber } = job;
    const page = await deps.pages.getPage(documentId, pageNumber);
    if (!page) throw new Error("Page not found");
    if (page.imageKey === undefined) throw new Error("Page image not found");

    const png = await deps.storage.get(page.imageKey);
    const provider =
      page.handwritten && deps.handwrittenOcr ? deps.handwrittenOcr : deps.ocr;

    await deps.pages.markStatus(documentId, pageNumber, "pending");
    try {
      const text = await provider.transcribePage({ pageNumber, png });
      await deps.pages.markStatus(documentId, pageNumber, "vision", text);
      logger.info({ event: "page_transcribed", documentId, pageNumber });
    } catch (error) {
      await deps.pages.markStatus(documentId, pageNumber, "failed");
      logger.error({ event: "page_failed", documentId, pageNumber });
      throw error;
    }
  };
}
