import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Database, getDb } from "../client.ts";
import { resolveTestDatabaseUrl } from "../testing/test-database.ts";
import { createDocumentRepository } from "./documents.ts";
import { createFindingReviewRepository } from "./finding-reviews.ts";

const url = resolveTestDatabaseUrl();
const maybe = url ? describe : describe.skip;

maybe("finding reviews repository", () => {
  let db: Database;
  let reviews: ReturnType<typeof createFindingReviewRepository>;
  let documents: ReturnType<typeof createDocumentRepository>;

  beforeAll(() => {
    db = getDb(url as string);
    reviews = createFindingReviewRepository(db);
    documents = createDocumentRepository(db);
  });

  afterAll(async () => {
    await (
      db as unknown as { $client?: { end?: () => Promise<void> } }
    ).$client?.end?.();
  });

  async function createDocument(): Promise<string> {
    const document = await documents.create({
      originalFilename: "historia.pdf",
      originalKey: "documents/abc/original.pdf",
    });
    return document.id;
  }

  test("inserts then updates a review without duplicating rows", async () => {
    const documentId = await createDocument();

    await reviews.setStatus(documentId, "fnd-1", "reviewed", "ok");
    let listed = await reviews.listForDocument(documentId);
    expect(listed).toEqual([
      { findingId: "fnd-1", status: "reviewed", note: "ok" },
    ]);

    await reviews.setStatus(documentId, "fnd-1", "dismissed", null);
    listed = await reviews.listForDocument(documentId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual({
      findingId: "fnd-1",
      status: "dismissed",
      note: null,
    });

    await documents.remove(documentId);
  });

  test("isolates reviews by document", async () => {
    const documentId = await createDocument();
    const otherId = await createDocument();

    await reviews.setStatus(otherId, "fnd-2", "pending", null);
    expect(await reviews.listForDocument(documentId)).toEqual([]);
    expect(await reviews.listForDocument(otherId)).toEqual([
      { findingId: "fnd-2", status: "pending", note: null },
    ]);

    await documents.remove(documentId);
    await documents.remove(otherId);
  });
});
