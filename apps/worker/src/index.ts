import {
  createDocumentPageRepository,
  createDocumentRepository,
  getDb,
} from "@audit/db";
import { OpenAIVisionOCRProvider, renderPdfPages } from "@audit/documents";
import { PgBossQueue, S3Storage, getEnv } from "@audit/lib";
import {
  type ProcessingLogger,
  createProcessDocument,
} from "./pipeline/process-document.ts";

const logger: ProcessingLogger = {
  info: (event) => {
    process.stdout.write(`${JSON.stringify({ level: "info", ...event })}\n`);
  },
  error: (event) => {
    process.stdout.write(`${JSON.stringify({ level: "error", ...event })}\n`);
  },
};

async function main(): Promise<void> {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const processDocument = createProcessDocument({
    documents: createDocumentRepository(db),
    pages: createDocumentPageRepository(db),
    storage: new S3Storage({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
    }),
    render: renderPdfPages,
    ocr: new OpenAIVisionOCRProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OCR_MODEL,
    }),
    logger,
  });

  const queue = new PgBossQueue({ connectionString: env.DATABASE_URL });
  await queue.start();
  await queue.handle(async (job) => {
    logger.info({ event: "job_received", documentId: job.documentId });
    await processDocument({ documentId: job.documentId });
  });
  process.stdout.write(`${JSON.stringify({ event: "worker_ready" })}\n`);
}

await main();
