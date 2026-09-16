import { PgBoss } from "pg-boss";
import {
  type JobQueue,
  PROCESS_DOCUMENT_JOB,
  type ProcessDocumentJob,
} from "./job-queue.ts";

export class PgBossQueue implements JobQueue {
  private readonly boss: PgBoss;

  constructor(options: { connectionString: string }) {
    this.boss = new PgBoss({ connectionString: options.connectionString });
  }

  async start(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(PROCESS_DOCUMENT_JOB);
  }

  async stop(): Promise<void> {
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
