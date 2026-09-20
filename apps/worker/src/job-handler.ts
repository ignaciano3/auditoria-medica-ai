import type { LLMProvider } from "@audit/ai";
import type { OCRProvider } from "@audit/documents";
import type { DocumentStatus, ProviderSettings } from "@audit/domain";
import { errors, type QueueJob } from "@audit/lib";
import type { ProcessingLogger } from "./pipeline/process-document.ts";

export type JobRuntime = {
  sessionId: string;
  provider: LLMProvider;
  ocr: OCRProvider;
  handwrittenOcr?: OCRProvider | undefined;
};

export type JobHandlerDeps = {
  documents: {
    updateStatus(
      id: string,
      status: DocumentStatus,
      error?: string | null,
    ): Promise<void>;
  };
  loadSettings: () => Promise<ProviderSettings>;
  createProvider: (
    settings: ProviderSettings,
    ctx: { sessionId: string },
  ) => LLMProvider;
  createOcr: (
    settings: ProviderSettings,
    ctx: { sessionId: string },
  ) => { ocr: OCRProvider; handwrittenOcr?: OCRProvider | undefined };
  dispatch: (job: QueueJob, runtime: JobRuntime) => Promise<void>;
  logger: ProcessingLogger;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createJobHandler(
  deps: JobHandlerDeps,
): (job: QueueJob) => Promise<void> {
  return async function handleJob(job) {
    deps.logger.info({
      event: "job_received",
      kind: job.kind,
      documentId: job.documentId,
    });

    let runtime: JobRuntime;
    try {
      const settings = await deps.loadSettings();
      const sessionId = `document:${job.documentId}`;
      runtime = {
        sessionId,
        provider: deps.createProvider(settings, { sessionId }),
        ...deps.createOcr(settings, { sessionId }),
      };
    } catch (error) {
      deps.logger.error({
        event: "job_setup_failed",
        kind: job.kind,
        documentId: job.documentId,
        message: errorMessage(error),
      });
      if (job.kind !== "transcribe-page") {
        await deps.documents
          .updateStatus(job.documentId, "error", errors.processingFailed)
          .catch(() => undefined);
      }
      throw error;
    }

    await deps.dispatch(job, runtime);
  };
}
