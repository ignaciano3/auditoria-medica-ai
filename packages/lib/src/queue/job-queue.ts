export const PROCESS_DOCUMENT_JOB = "process-document";

export type ProcessDocumentJob = { documentId: string };

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(job: ProcessDocumentJob): Promise<void>;
  handle(handler: (job: ProcessDocumentJob) => Promise<void>): Promise<void>;
}
