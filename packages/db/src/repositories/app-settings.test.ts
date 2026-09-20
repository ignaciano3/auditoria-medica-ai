import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Database, getDb } from "../client.ts";
import { appSettings } from "../schema.ts";
import { createAppSettingsRepository } from "./app-settings.ts";

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("app settings repository", () => {
  let db: Database;
  let repo: ReturnType<typeof createAppSettingsRepository>;

  beforeAll(async () => {
    db = getDb(url as string);
    repo = createAppSettingsRepository(db);
    await db.delete(appSettings);
  });

  afterAll(async () => {
    await (
      db as unknown as { $client?: { end?: () => Promise<void> } }
    ).$client?.end?.();
  });

  test("upserts and reads back the singleton row", async () => {
    await repo.upsert({
      llmProvider: "opencode",
      llmModel: "deepseek-v4.1-flash",
      ocrProvider: "opencode",
      ocrModel: "deepseek-v4-flash-vision-exp",
      encryptedKeys: { opencode: "blob-opencode", openai: "blob-openai" },
    });
    const row = await repo.get();
    expect(row?.llmProvider).toBe("opencode");
    expect(row?.encryptedKeys.opencode).toBe("blob-opencode");
    expect(row?.encryptedKeys.openai).toBe("blob-openai");
    expect(row?.encryptedKeys.deepseek).toBeUndefined();
  });

  test("leaves an unset key unchanged and clears a null key", async () => {
    await repo.upsert({
      llmProvider: "opencode",
      llmModel: "deepseek-v4.1-flash",
      ocrProvider: "opencode",
      ocrModel: "deepseek-v4-flash-vision-exp",
      encryptedKeys: { deepseek: "blob-deepseek" },
    });
    await repo.upsert({
      llmProvider: "opencode",
      llmModel: "deepseek-v4.1-flash",
      ocrProvider: "opencode",
      ocrModel: "deepseek-v4-flash-vision-exp",
      encryptedKeys: { openai: null },
    });
    const row = await repo.get();
    expect(row?.encryptedKeys.deepseek).toBe("blob-deepseek");
    expect(row?.encryptedKeys.openai).toBeUndefined();
    expect(row?.encryptedKeys.opencode).toBe("blob-opencode");
  });
});
