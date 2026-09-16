export { type Database, getDb } from "./client.ts";
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
