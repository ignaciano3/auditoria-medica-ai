export { type Database, getDb } from "./client.ts";
export {
  createDocumentPageRepository,
  type DocumentPageRow,
} from "./repositories/document-pages.ts";
export {
  createDocumentRepository,
  type DocumentRow,
} from "./repositories/documents.ts";
export {
  accessLog,
  chatMessages,
  clinicalRecords,
  documentPages,
  documents,
  findingsReview,
} from "./schema.ts";
