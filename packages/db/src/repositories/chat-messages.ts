import type { ChatRole } from "@audit/domain";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { chatMessages } from "../schema.ts";

export type ChatMessageRow = {
  id: string;
  documentId: string;
  role: ChatRole;
  content: string;
  citedPages: number[];
  createdAt: Date;
};

function toRow(row: typeof chatMessages.$inferSelect): ChatMessageRow {
  return {
    id: row.id,
    documentId: row.documentId,
    role: row.role,
    content: row.content,
    citedPages: row.citedPages,
    createdAt: row.createdAt,
  };
}

export function createChatMessageRepository(db: Database) {
  return {
    async listForDocument(documentId: string): Promise<ChatMessageRow[]> {
      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.documentId, documentId))
        .orderBy(asc(chatMessages.createdAt));
      return rows.map(toRow);
    },
    async add(input: {
      documentId: string;
      role: ChatRole;
      content: string;
      citedPages: number[];
    }): Promise<ChatMessageRow> {
      const [row] = await db.insert(chatMessages).values(input).returning();
      if (!row) throw new Error("Failed to add chat message");
      return toRow(row);
    },
  };
}
