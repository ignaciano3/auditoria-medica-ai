import type { JobQueue, ProcessDocumentJob } from "./job-queue.ts";

export class InMemoryQueue implements JobQueue {
  private handler: ((job: ProcessDocumentJob) => Promise<void>) | null = null;

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async handle(
    handler: (job: ProcessDocumentJob) => Promise<void>,
  ): Promise<void> {
    this.handler = handler;
  }

  async publish(job: ProcessDocumentJob): Promise<void> {
    if (this.handler) await this.handler(job);
  }
}
