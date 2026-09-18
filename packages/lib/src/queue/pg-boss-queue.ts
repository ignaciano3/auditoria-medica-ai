import { PgBoss } from "pg-boss";
import {
  type JobQueue,
  PROCESS_DOCUMENT_JOB,
  type QueueJob,
} from "./job-queue.ts";

export class QueuePublishError extends Error {
  constructor() {
    super("Failed to publish the job to the queue");
    this.name = "QueuePublishError";
  }
}

export class PgBossQueue implements JobQueue {
  private readonly boss: PgBoss;
  private startPromise: Promise<void> | undefined;

  constructor(options: { connectionString: string }) {
    this.boss = new PgBoss({ connectionString: options.connectionString });
  }

  start(): Promise<void> {
    this.startPromise ??= (async () => {
      try {
        await this.boss.start();
        await this.boss.createQueue(PROCESS_DOCUMENT_JOB);
      } catch (error) {
        this.startPromise = undefined;
        throw error;
      }
    })();
    return this.startPromise;
  }

  async stop(): Promise<void> {
    this.startPromise = undefined;
    await this.boss.stop();
  }

  async publish(job: QueueJob): Promise<void> {
    const jobId = await this.boss.send(PROCESS_DOCUMENT_JOB, job);
    if (jobId === null) throw new QueuePublishError();
  }

  async handle(handler: (job: QueueJob) => Promise<void>): Promise<void> {
    await this.boss.work<QueueJob>(PROCESS_DOCUMENT_JOB, async ([job]) => {
      if (job) await handler(job.data);
    });
  }
}
