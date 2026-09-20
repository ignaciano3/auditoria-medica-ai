import type { ProviderSettings } from "@audit/domain";
import {
  applyEnvFallback,
  decryptSecret,
  getEnv,
  requireEncryptionKey,
} from "@audit/lib";
import { cacheLife, cacheTag } from "next/cache";
import { SETTINGS_TAG } from "./cache-tags.ts";
import { getContainer } from "./container.ts";
import { describeSettingsView, type SettingsView } from "./settings-view.ts";

export async function getSettingsView(): Promise<SettingsView> {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);
  const env = getEnv();
  const stored = await getContainer().appSettings.get();
  return describeSettingsView(stored, env);
}

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const env = getEnv();
  const stored = await getContainer().appSettings.get();
  const decrypt = (blob: string): string =>
    decryptSecret(
      blob,
      requireEncryptionKey({
        SETTINGS_ENCRYPTION_KEY: env.SETTINGS_ENCRYPTION_KEY,
      }),
    );
  return applyEnvFallback(stored, env, decrypt);
}
