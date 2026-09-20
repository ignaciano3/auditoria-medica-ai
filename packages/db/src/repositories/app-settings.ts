import type { ProviderKey, StoredProviderSettings } from "@audit/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { appSettings } from "../schema.ts";

const COLUMNS = {
  openai: "openaiApiKeyEnc",
  deepseek: "deepseekApiKeyEnc",
  qwen: "dashscopeApiKeyEnc",
  opencode: "opencodeApiKeyEnc",
} as const satisfies Record<ProviderKey, string>;

export function createAppSettingsRepository(db: Database) {
  return {
    async get(): Promise<StoredProviderSettings | null> {
      const [row] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.id, 1));
      if (!row) return null;
      const encryptedKeys: StoredProviderSettings["encryptedKeys"] = {};
      if (row.openaiApiKeyEnc !== null) {
        encryptedKeys.openai = row.openaiApiKeyEnc;
      }
      if (row.deepseekApiKeyEnc !== null) {
        encryptedKeys.deepseek = row.deepseekApiKeyEnc;
      }
      if (row.dashscopeApiKeyEnc !== null) {
        encryptedKeys.qwen = row.dashscopeApiKeyEnc;
      }
      if (row.opencodeApiKeyEnc !== null) {
        encryptedKeys.opencode = row.opencodeApiKeyEnc;
      }
      return {
        llmProvider: row.llmProvider,
        llmModel: row.llmModel,
        ocrProvider: row.ocrProvider,
        ocrModel: row.ocrModel,
        encryptedKeys,
      };
    },
    async upsert(input: {
      llmProvider: string;
      llmModel: string;
      ocrProvider: string;
      ocrModel: string;
      encryptedKeys: Partial<Record<ProviderKey, string | null>>;
    }): Promise<void> {
      const keyColumns: Record<string, string | null> = {};
      for (const provider of Object.keys(COLUMNS) as ProviderKey[]) {
        const value = input.encryptedKeys[provider];
        if (value !== undefined) {
          keyColumns[COLUMNS[provider]] = value;
        }
      }
      await db
        .insert(appSettings)
        .values({
          id: 1,
          llmProvider: input.llmProvider,
          llmModel: input.llmModel,
          ocrProvider: input.ocrProvider,
          ocrModel: input.ocrModel,
          ...keyColumns,
        })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: {
            llmProvider: input.llmProvider,
            llmModel: input.llmModel,
            ocrProvider: input.ocrProvider,
            ocrModel: input.ocrModel,
            updatedAt: new Date(),
            ...keyColumns,
          },
        });
    },
  };
}
