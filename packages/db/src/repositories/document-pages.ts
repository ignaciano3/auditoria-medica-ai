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

function toInsertValues(
  documentId: string,
  page: DocumentPage,
): typeof documentPages.$inferInsert {
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
}

export function createDocumentPageRepository(db: Database) {
  return {
    async clearForDocument(documentId: string): Promise<void> {
      await db
        .delete(documentPages)
        .where(eq(documentPages.documentId, documentId));
    },
    async savePage(documentId: string, page: DocumentPage): Promise<void> {
      const value = toInsertValues(documentId, page);
      await db
        .insert(documentPages)
        .values(value)
        .onConflictDoUpdate({
          target: [documentPages.documentId, documentPages.pageNumber],
          set: {
            text: value.text,
            docType: value.docType,
            handwritten: value.handwritten,
            dataBearing: value.dataBearing,
            status: value.status,
            imageKey: value.imageKey ?? null,
            skipReason: value.skipReason ?? null,
          },
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
    async listImageKeys(documentId: string): Promise<string[]> {
      const rows = await db
        .select({ imageKey: documentPages.imageKey })
        .from(documentPages)
        .where(eq(documentPages.documentId, documentId));
      return rows
        .map((row) => row.imageKey)
        .filter((key): key is string => key !== null);
    },
    async getPage(
      documentId: string,
      pageNumber: number,
    ): Promise<DocumentPage | null> {
      const rows = await db
        .select()
        .from(documentPages)
        .where(
          and(
            eq(documentPages.documentId, documentId),
            eq(documentPages.pageNumber, pageNumber),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? toDocumentPage(row) : null;
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
    async updateText(
      documentId: string,
      pageNumber: number,
      text: string,
    ): Promise<void> {
      await db
        .update(documentPages)
        .set({ text })
        .where(
          and(
            eq(documentPages.documentId, documentId),
            eq(documentPages.pageNumber, pageNumber),
          ),
        );
    },
  };
}
