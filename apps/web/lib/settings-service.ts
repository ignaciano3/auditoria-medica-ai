import { AI_PROVIDER_KEYS, type ProviderKey } from "@audit/domain";
import { type SettingsInput, validateSettingsInput } from "./settings-view.ts";

export type SettingsDeps = {
  appSettings: {
    upsert(input: {
      llmProvider: string;
      llmModel: string;
      ocrProvider: string;
      ocrModel: string;
      encryptedKeys: Partial<Record<ProviderKey, string | null>>;
    }): Promise<void>;
  };
  encrypt: (plaintext: string) => string;
};

export type SaveSettingsResult = { ok: true } | { ok: false; error: string };

export async function saveSettings(
  deps: SettingsDeps,
  input: SettingsInput,
): Promise<SaveSettingsResult> {
  const validation = validateSettingsInput(input);
  if (!validation.ok) return validation;

  const encryptedKeys: Partial<Record<ProviderKey, string | null>> = {};
  for (const provider of AI_PROVIDER_KEYS) {
    if (input.clearKeys?.includes(provider)) {
      encryptedKeys[provider] = null;
      continue;
    }
    const value = input.keys[provider]?.trim();
    if (value && value.length > 0) {
      encryptedKeys[provider] = deps.encrypt(value);
    }
  }

  await deps.appSettings.upsert({
    llmProvider: input.llmProvider,
    llmModel: input.llmModel,
    ocrProvider: input.ocrProvider,
    ocrModel: input.ocrModel,
    encryptedKeys,
  });
  return { ok: true };
}
