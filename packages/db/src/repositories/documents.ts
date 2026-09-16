import type { DocumentStatus } from "@audit/domain";
import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { documents } from "../schema.ts";

export type DocumentRow = typeof documents.$inferSelect;

export function createDocumentRepository(db: Database) {
  return {
    async create(input: {
      originalFilename: string;
      originalKey: string;
    }): Promise<DocumentRow> {
      const [row] = await db.insert(documents).values(input).returning();
      if (!row) throw new Error("Failed to create document");
      return row;
    },
    async getById(id: string): Promise<DocumentRow | null> {
      const [row] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, id));
      return row ?? null;
    },
    async list(): Promise<DocumentRow[]> {
      return db.select().from(documents).orderBy(desc(documents.createdAt));
    },
    async updateStatus(
      id: string,
      status: DocumentStatus,
      error?: string | null,
    ): Promise<void> {
      const values: {
        status: DocumentStatus;
        updatedAt: Date;
        error?: string | null;
      } = { status, updatedAt: new Date() };
      if (error !== undefined) values.error = error;
      await db.update(documents).set(values).where(eq(documents.id, id));
    },
    async setPageCount(id: string, pageCount: number): Promise<void> {
      await db
        .update(documents)
        .set({ pageCount, updatedAt: new Date() })
        .where(eq(documents.id, id));
    },
    async remove(id: string): Promise<void> {
      await db.delete(documents).where(eq(documents.id, id));
    },
  };
}
