import { HeuristicLLMProvider, OpenAIProvider } from "@audit/ai";
import {
  createClinicalRecordRepository,
  createDocumentPageRepository,
  createDocumentRepository,
  getDb,
} from "@audit/db";
import {
  LocalPageClassifier,
  type OCRProvider,
  OpenAIVisionOCRProvider,
  renderPdfPages,
  TesseractOCRProvider,
} from "@audit/documents";
import { getEnv, PgBossQueue, S3Storage } from "@audit/lib";
import { createExtractDocument } from "./pipeline/extract-document.ts";
import {
  createProcessDocument,
  type ProcessingLogger,
} from "./pipeline/process-document.ts";
import { createTranscribePage } from "./pipeline/transcribe-page.ts";

function createOcrProvider(env: ReturnType<typeof getEnv>): {
  ocr: OCRProvider;
  handwrittenOcr?: OCRProvider;
} {
  switch (env.OCR_PROVIDER) {
    case "local":
      return {
        ocr: new TesseractOCRProvider({
          classifier: new LocalPageClassifier(),
        }),
      };
    case "tesseract": {
      const vision = new OpenAIVisionOCRProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OCR_MODEL,
        classifyDetail: "low",
        transcribeDetail: "high",
        reasoningEffort: "low",
      });
      return {
        ocr: new TesseractOCRProvider({ classifier: vision }),
        handwrittenOcr: vision,
      };
    }
    default:
      return {
        ocr: new OpenAIVisionOCRProvider({
          apiKey: env.OPENAI_API_KEY,
          model: env.OCR_MODEL,
          classifyDetail: "low",
          transcribeDetail: "high",
          reasoningEffort: "low",
        }),
      };
  }
}

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
  const { ocr, handwrittenOcr } = createOcrProvider(env);
  const storage = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });
  const provider =
    env.LLM_PROVIDER === "heuristic"
      ? new HeuristicLLMProvider()
      : new OpenAIProvider({
          apiKey: env.OPENAI_API_KEY,
          model: env.LLM_MODEL,
          reasoningEffort: "low",
        });

  const documents = createDocumentRepository(db);
  const pages = createDocumentPageRepository(db);
  const clinicalRecords = createClinicalRecordRepository(db);

  const processDocument = createProcessDocument({
    documents,
    pages,
    storage,
    render: renderPdfPages,
    ocr,
    handwrittenOcr,
    provider,
    clinicalRecords,
    logger,
  });
  const transcribePage = createTranscribePage({
    pages,
    storage,
    ocr,
    handwrittenOcr,
    logger,
  });
  const extractDocument = createExtractDocument({
    documents,
    pages,
    provider,
    clinicalRecords,
    logger,
  });

  const queue = new PgBossQueue({ connectionString: env.DATABASE_URL });
  await queue.start();
  await queue.handle(async (job) => {
    logger.info({
      event: "job_received",
      kind: job.kind,
      documentId: job.documentId,
    });
    switch (job.kind) {
      case "process-document":
        await processDocument({ documentId: job.documentId });
        break;
      case "transcribe-page":
        await transcribePage({
          documentId: job.documentId,
          pageNumber: job.pageNumber,
        });
        break;
      case "extract-document":
        await extractDocument({ documentId: job.documentId });
        break;
    }
  });
  process.stdout.write(`${JSON.stringify({ event: "worker_ready" })}\n`);
}

await main();
