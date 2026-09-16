import { PgBoss } from "pg-boss";
import {
  type JobQueue,
  PROCESS_DOCUMENT_JOB,
  type ProcessDocumentJob,
} from "./job-queue.ts";

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

  async publish(job: ProcessDocumentJob): Promise<void> {
    await this.boss.send(PROCESS_DOCUMENT_JOB, job);
  }

  async handle(
    handler: (job: ProcessDocumentJob) => Promise<void>,
  ): Promise<void> {
    await this.boss.work<ProcessDocumentJob>(
      PROCESS_DOCUMENT_JOB,
      async ([job]) => {
        if (job) await handler(job.data);
      },
    );
  }
}
