import type { DocumentPage, PageStatus } from "@audit/domain";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { documentPages } from "../schema.ts";

export type DocumentPageRow = typeof documentPages.$inferSelect;

function toDocumentPage(row: DocumentPageRow): DocumentPage {
  const page: DocumentPage = {
    pageNumber: row.pageNumber,
    text: row.text,
    docType: row.docType,
    handwritten: row.handwritten,
    dataBearing: row.dataBearing,
    status: row.status,
  };
  if (row.imageKey !== null) page.imageKey = row.imageKey;
  if (row.skipReason !== null) page.skipReason = row.skipReason;
  return page;
}

export function createDocumentPageRepository(db: Database) {
  return {
    async replaceForDocument(
      documentId: string,
      pages: DocumentPage[],
    ): Promise<void> {
      const values = pages.map((page) => {
        const value: typeof documentPages.$inferInsert = {
          documentId,
          pageNumber: page.pageNumber,
          text: page.text,
          docType: page.docType,
          handwritten: page.handwritten,
          dataBearing: page.dataBearing,
          status: page.status,
        };
        if (page.imageKey !== undefined) value.imageKey = page.imageKey;
        if (page.skipReason !== undefined) value.skipReason = page.skipReason;
        return value;
      });
      await db.transaction(async (tx) => {
        await tx
          .delete(documentPages)
          .where(eq(documentPages.documentId, documentId));
        if (values.length > 0) {
          await tx.insert(documentPages).values(values);
        }
      });
    },
    async listForDocument(documentId: string): Promise<DocumentPage[]> {
      const rows = await db
        .select()
        .from(documentPages)
        .where(eq(documentPages.documentId, documentId))
        .orderBy(asc(documentPages.pageNumber));
      return rows.map(toDocumentPage);
    },
    async markStatus(
      documentId: string,
      pageNumber: number,
      status: PageStatus,
      text?: string,
    ): Promise<void> {
      const values: { status: PageStatus; text?: string } = { status };
      if (text !== undefined) values.text = text;
      await db
        .update(documentPages)
        .set(values)
        .where(
          and(
            eq(documentPages.documentId, documentId),
            eq(documentPages.pageNumber, pageNumber),
          ),
        );
    },
  };
}
