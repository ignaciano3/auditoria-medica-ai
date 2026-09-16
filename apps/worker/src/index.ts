import { PgBossQueue, getEnv } from "@audit/lib";

function onJob(documentId: string): Promise<void> {
  process.stdout.write(
    `${JSON.stringify({ event: "job_received", documentId })}\n`,
  );
  return Promise.resolve();
}

async function main(): Promise<void> {
  const env = getEnv();
  const queue = new PgBossQueue({ connectionString: env.DATABASE_URL });
  await queue.start();
  await queue.handle(async (job) => {
    await onJob(job.documentId);
  });
  process.stdout.write(`${JSON.stringify({ event: "worker_ready" })}\n`);
}

await main();
