export { type Database, getDb } from "./client.ts";
export {
  type ChatMessageRow,
  createChatMessageRepository,
} from "./repositories/chat-messages.ts";
export {
  type ClinicalRecordIndex,
  type ClinicalRecordRow,
  type ClinicalRecordWithFindings,
  createClinicalRecordRepository,
  type ExtractionCompleteness,
} from "./repositories/clinical-records.ts";
export {
  createDocumentPageRepository,
  type DocumentPageRow,
} from "./repositories/document-pages.ts";
export {
  createDocumentRepository,
  type DocumentRow,
} from "./repositories/documents.ts";
export {
  createFindingReviewRepository,
  type FindingReview,
} from "./repositories/finding-reviews.ts";
export {
  accessLog,
  chatMessages,
  clinicalRecords,
  documentPages,
  documents,
  findingsReview,
} from "./schema.ts";
