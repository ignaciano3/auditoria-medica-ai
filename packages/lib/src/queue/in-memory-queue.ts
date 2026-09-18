import type { JobQueue, QueueJob } from "./job-queue.ts";

export class InMemoryQueue implements JobQueue {
  private handler: ((job: QueueJob) => Promise<void>) | null = null;

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async handle(handler: (job: QueueJob) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async publish(job: QueueJob): Promise<void> {
    if (this.handler) await this.handler(job);
  }
}
