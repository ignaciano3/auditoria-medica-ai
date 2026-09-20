import {
  chunkPages,
  type LLMProvider,
  mapExtract,
  type RetryOptions,
  reduceRecords,
  stampFindingProvenance,
  stampProvenance,
} from "@audit/ai";
import type { ClinicalRecordIndex } from "@audit/db";
import {
  assignStableFindingIds,
  type ClinicalRecord,
  clinicalRecordSchema,
  type DocumentPage,
  type DocumentStatus,
  type Finding,
} from "@audit/domain";
import { errors } from "@audit/lib";

export class ExtractionFailedError extends Error {
  constructor() {
    super("All extraction chunks failed");
    this.name = "ExtractionFailedError";
  }
}

export type ProcessingLogger = {
  info(event: Record<string, unknown>): void;
  error(event: Record<string, unknown>): void;
};

export const noopLogger: ProcessingLogger = {
  info: () => undefined,
  error: () => undefined,
};

export type ExtractionDeps = {
  documents: {
    updateStatus(
      id: string,
      status: DocumentStatus,
      error?: string | null,
    ): Promise<void>;
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
  retry?: RetryOptions;
};

export async function runExtraction(
  deps: ExtractionDeps,
  documentId: string,
  pages: DocumentPage[],
): Promise<void> {
  const logger = deps.logger ?? noopLogger;
  const dataBearingPages = pages.filter(
    (page) =>
      page.dataBearing && (page.status === "vision" || page.status === "text"),
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

  const chunks = chunkPages(pages);
  let failedChunks = 0;
  const records = await mapExtract(chunks, deps.provider, {
    ...deps.retry,
    onChunkError: (chunkIndex, error) => {
      failedChunks += 1;
      logger.error({
        event: "chunk_failed",
        documentId,
        chunkIndex,
        errorName: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });
  if (chunks.length > 0 && failedChunks === chunks.length) {
    throw new ExtractionFailedError();
  }
  const merged = stampProvenance(reduceRecords(records), documentId);
  const validated = clinicalRecordSchema.parse(merged) as ClinicalRecord;

  let extractionIncomplete = failedChunks > 0;
  let findings: Finding[] = [];
  try {
    findings = await deps.provider.analyzeClinicalRecord(validated);
  } catch {
    extractionIncomplete = true;
    logger.error({ event: "findings_failed", documentId });
  }
  findings = stampFindingProvenance(findings, documentId);
  findings = assignStableFindingIds(findings);

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

  await deps.clinicalRecords.upsert(documentId, validated, findings, indexed, {
    extractionIncomplete,
    failedChunkCount: failedChunks,
  });
  await deps.documents.updateStatus(documentId, "ready");
  logger.info({ event: "document_ready", documentId });
}
