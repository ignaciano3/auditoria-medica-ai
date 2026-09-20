import { createLlmProvider } from "@audit/ai";
import {
  createAppSettingsRepository,
  createClinicalRecordRepository,
  createDocumentPageRepository,
  createDocumentRepository,
  getDb,
} from "@audit/db";
import { createOcrProviders, renderPdfPages } from "@audit/documents";
import { getEnv, PgBossQueue, S3Storage } from "@audit/lib";
import { createExtractDocument } from "./pipeline/extract-document.ts";
import {
  createProcessDocument,
  type ProcessingLogger,
} from "./pipeline/process-document.ts";
import { createTranscribePage } from "./pipeline/transcribe-page.ts";
import {
  buildDecryptor,
  createSettingsCache,
  loadEffectiveSettings,
} from "./settings.ts";

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
  const storage = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });

  const settingsRepo = createAppSettingsRepository(db);
  const decrypt = buildDecryptor(env.SETTINGS_ENCRYPTION_KEY);
  const settingsCache = createSettingsCache(
    () => loadEffectiveSettings({ repo: settingsRepo, env, decrypt }),
    10_000,
  );

  const documents = createDocumentRepository(db);
  const pages = createDocumentPageRepository(db);
  const clinicalRecords = createClinicalRecordRepository(db);

  const queue = new PgBossQueue({ connectionString: env.DATABASE_URL });
  await queue.start();
  await queue.handle(async (job) => {
    logger.info({
      event: "job_received",
      kind: job.kind,
      documentId: job.documentId,
    });
    const settings = await settingsCache.get();
    const sessionId = `document:${job.documentId}`;
    const provider = createLlmProvider(settings, { sessionId });
    const { ocr, handwrittenOcr } = createOcrProviders(settings, { sessionId });

    switch (job.kind) {
      case "process-document":
        await createProcessDocument({
          documents,
          pages,
          storage,
          render: renderPdfPages,
          ocr,
          handwrittenOcr,
          provider,
          clinicalRecords,
          logger,
        })({ documentId: job.documentId });
        break;
      case "transcribe-page":
        await createTranscribePage({
          pages,
          storage,
          ocr,
          handwrittenOcr,
          logger,
        })({ documentId: job.documentId, pageNumber: job.pageNumber });
        break;
      case "extract-document":
        await createExtractDocument({
          documents,
          pages,
          provider,
          clinicalRecords,
          logger,
        })({ documentId: job.documentId });
        break;
    }
  });
  process.stdout.write(`${JSON.stringify({ event: "worker_ready" })}\n`);
}

await main();
