import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Database, getDb } from "../client.ts";
import { createChatMessageRepository } from "./chat-messages.ts";
import { createDocumentRepository } from "./documents.ts";

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("chat message repository", () => {
  let db: Database;
  let documents: ReturnType<typeof createDocumentRepository>;
  let repo: ReturnType<typeof createChatMessageRepository>;
  let documentId: string;

  beforeAll(async () => {
    db = getDb(url as string);
    documents = createDocumentRepository(db);
    repo = createChatMessageRepository(db);
    const doc = await documents.create({
      originalFilename: "chat.pdf",
      originalKey: "documents/chat/original.pdf",
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    if (documentId) await documents.remove(documentId);
  });

  test("adds and lists messages in ascending order", async () => {
    const first = await repo.add({
      documentId,
      role: "user",
      content: "¿Qué medicación recibió?",
      citedPages: [],
    });
    const second = await repo.add({
      documentId,
      role: "assistant",
      content: "Levofloxacina [p.1]",
      citedPages: [1],
    });

    const list = await repo.listForDocument(documentId);
    expect(list.map((m) => m.id)).toEqual([first.id, second.id]);
    expect(list[1]?.role).toBe("assistant");
    expect(list[1]?.citedPages).toEqual([1]);
  });
});
