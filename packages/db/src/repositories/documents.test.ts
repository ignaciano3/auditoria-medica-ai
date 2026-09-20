import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Database, getDb } from "../client.ts";
import { resolveTestDatabaseUrl } from "../testing/test-database.ts";
import { createDocumentRepository } from "./documents.ts";

const url = resolveTestDatabaseUrl();
const maybe = url ? describe : describe.skip;

maybe("documents repository", () => {
  let db: Database;
  let repo: ReturnType<typeof createDocumentRepository>;
  let createdId = "";

  beforeAll(() => {
    db = getDb(url as string);
    repo = createDocumentRepository(db);
  });

  afterAll(async () => {
    if (createdId) await repo.remove(createdId);
    await (
      db as unknown as { $client?: { end?: () => Promise<void> } }
    ).$client?.end?.();
  });

  test("creates and fetches a document", async () => {
    const created = await repo.create({
      originalFilename: "historia.pdf",
      originalKey: "documents/abc/original.pdf",
    });
    createdId = created.id;
    expect(created.status).toBe("uploaded");
    const fetched = await repo.getById(created.id);
    expect(fetched?.originalFilename).toBe("historia.pdf");
  });

  test("updates status", async () => {
    await repo.updateStatus(createdId, "processing");
    const fetched = await repo.getById(createdId);
    expect(fetched?.status).toBe("processing");
  });
});
