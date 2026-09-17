import { HeuristicLLMProvider, OpenAIProvider } from "@audit/ai";
import {
  createClinicalRecordRepository,
  createDocumentPageRepository,
  createDocumentRepository,
  getDb,
} from "@audit/db";
import {
  OpenAIVisionOCRProvider,
  renderPdfPages,
  TesseractOCRProvider,
} from "@audit/documents";
import { getEnv, PgBossQueue, S3Storage } from "@audit/lib";
import {
  createProcessDocument,
  type ProcessingLogger,
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
    ocr:
      env.OCR_PROVIDER === "tesseract"
        ? new TesseractOCRProvider({
            classifier: new OpenAIVisionOCRProvider({
              apiKey: env.OPENAI_API_KEY,
              model: env.OCR_MODEL,
            }),
          })
        : new OpenAIVisionOCRProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.OCR_MODEL,
          }),
    provider:
      env.LLM_PROVIDER === "heuristic"
        ? new HeuristicLLMProvider()
        : new OpenAIProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.LLM_MODEL,
          }),
    clinicalRecords: createClinicalRecordRepository(db),
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
