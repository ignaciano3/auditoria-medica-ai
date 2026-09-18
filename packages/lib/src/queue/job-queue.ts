export const PROCESS_DOCUMENT_JOB = "process-document";

export type ProcessDocumentJob = {
  kind: "process-document";
  documentId: string;
};

export type TranscribePageJob = {
  kind: "transcribe-page";
  documentId: string;
  pageNumber: number;
};

export type ExtractDocumentJob = {
  kind: "extract-document";
  documentId: string;
};

export type QueueJob =
  | ProcessDocumentJob
  | TranscribePageJob
  | ExtractDocumentJob;

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(job: QueueJob): Promise<void>;
  handle(handler: (job: QueueJob) => Promise<void>): Promise<void>;
}
