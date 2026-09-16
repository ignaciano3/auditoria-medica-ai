import type { DocumentRow } from "@audit/db";
import type { Document } from "@audit/domain";

export function serializeDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    status: row.status,
    pageCount: row.pageCount,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
