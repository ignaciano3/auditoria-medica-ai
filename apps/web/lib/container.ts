import { createDocumentRepository, getDb } from "@audit/db";
import {
  type JobQueue,
  PgBossQueue,
  S3Storage,
  type StorageProvider,
  getEnv,
} from "@audit/lib";

type DocumentRepository = ReturnType<typeof createDocumentRepository>;

export type Container = {
  documents: DocumentRepository;
  storage: StorageProvider;
  queue: JobQueue;
};

let cached: Container | undefined;

export function getContainer(): Container {
  if (!cached) {
    const env = getEnv();
    cached = {
      documents: createDocumentRepository(getDb(env.DATABASE_URL)),
      storage: new S3Storage({
        endpoint: env.S3_ENDPOINT,
        bucket: env.S3_BUCKET,
        accessKey: env.S3_ACCESS_KEY,
        secretKey: env.S3_SECRET_KEY,
      }),
      queue: new PgBossQueue({ connectionString: env.DATABASE_URL }),
    };
  }
  return cached;
}

export function setContainer(container: Container): void {
  cached = container;
}

export function resetContainer(): void {
  cached = undefined;
}
