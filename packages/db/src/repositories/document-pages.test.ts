import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DocumentPage } from "@audit/domain";
import { type Database, getDb } from "../client.ts";
import { createDocumentPageRepository } from "./document-pages.ts";
import { createDocumentRepository } from "./documents.ts";

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("document pages repository", () => {
  let db: Database;
  let pages: ReturnType<typeof createDocumentPageRepository>;
  let documents: ReturnType<typeof createDocumentRepository>;
  let documentId = "";
  let otherDocumentId = "";

  beforeAll(async () => {
    db = getDb(url as string);
    pages = createDocumentPageRepository(db);
    documents = createDocumentRepository(db);
    const doc = await documents.create({
      originalFilename: "historia.pdf",
      originalKey: "documents/abc/original.pdf",
    });
    documentId = doc.id;
    const other = await documents.create({
      originalFilename: "otra.pdf",
      originalKey: "documents/def/original.pdf",
    });
    otherDocumentId = other.id;
  });

  afterAll(async () => {
    if (documentId) await documents.remove(documentId);
    if (otherDocumentId) await documents.remove(otherDocumentId);
    await (
      db as unknown as { $client?: { end?: () => Promise<void> } }
    ).$client?.end?.();
  });

  function page(overrides: Partial<DocumentPage> = {}): DocumentPage {
    return {
      pageNumber: 1,
      text: "",
      docType: "evolution",
      handwritten: false,
      dataBearing: true,
      status: "pending",
      ...overrides,
    };
  }

  test("saves a page and lists it for the document", async () => {
    await pages.savePage(
      documentId,
      page({
        text: "hola",
        status: "vision",
        imageKey: "documents/abc/pages/1.png",
      }),
    );
    const list = await pages.listForDocument(documentId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      pageNumber: 1,
      text: "hola",
      status: "vision",
      imageKey: "documents/abc/pages/1.png",
    });
  });

  test("updates the page in place when saved again", async () => {
    await pages.savePage(documentId, page({ text: "actualizado" }));
    const list = await pages.listForDocument(documentId);
    expect(list).toHaveLength(1);
    expect(list[0]?.text).toBe("actualizado");
  });

  test("clears only the pages of the given document", async () => {
    await pages.savePage(documentId, page({ pageNumber: 2, text: "dos" }));
    await pages.savePage(
      otherDocumentId,
      page({ text: "otra", status: "vision" }),
    );

    await pages.clearForDocument(documentId);

    expect(await pages.listForDocument(documentId)).toHaveLength(0);
    expect(await pages.listForDocument(otherDocumentId)).toHaveLength(1);
  });
});
