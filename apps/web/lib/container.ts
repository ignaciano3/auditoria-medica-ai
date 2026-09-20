import {
  createChatMessageRepository,
  createClinicalRecordRepository,
  createDocumentPageRepository,
  createDocumentRepository,
  createFindingReviewRepository,
  getDb,
} from "@audit/db";
import {
  getEnv,
  type JobQueue,
  PgBossQueue,
  S3Storage,
  type StorageProvider,
} from "@audit/lib";

type DocumentRepository = ReturnType<typeof createDocumentRepository>;
type DocumentPageRepository = ReturnType<typeof createDocumentPageRepository>;
type ClinicalRecordRepository = ReturnType<
  typeof createClinicalRecordRepository
>;
type FindingReviewRepository = ReturnType<typeof createFindingReviewRepository>;
type ChatMessageRepository = ReturnType<typeof createChatMessageRepository>;

export type Container = {
  documents: DocumentRepository;
  pages: DocumentPageRepository;
  clinicalRecords: ClinicalRecordRepository;
  findingReviews: FindingReviewRepository;
  chatMessages: ChatMessageRepository;
  storage: StorageProvider;
  queue: JobQueue;
};

let cached: Container | undefined;

export function getContainer(): Container {
  if (!cached) {
    const env = getEnv();
    const db = getDb(env.DATABASE_URL);
    cached = {
      documents: createDocumentRepository(db),
      pages: createDocumentPageRepository(db),
      clinicalRecords: createClinicalRecordRepository(db),
      findingReviews: createFindingReviewRepository(db),
      chatMessages: createChatMessageRepository(db),
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
