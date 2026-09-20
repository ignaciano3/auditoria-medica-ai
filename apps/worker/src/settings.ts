import type { ProviderSettings, StoredProviderSettings } from "@audit/domain";
import {
  applyEnvFallback,
  decryptSecret,
  type Env,
  requireEncryptionKey,
} from "@audit/lib";

export type SettingsDeps = {
  repo: { get(): Promise<StoredProviderSettings | null> };
  env: Env;
  decrypt: (blob: string) => string;
};

export class SettingsDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsDecryptionError";
  }
}

export function buildDecryptor(
  encryptionKey: string,
): (blob: string) => string {
  if (encryptionKey.trim().length === 0) {
    return () => {
      throw new SettingsDecryptionError(
        "SETTINGS_ENCRYPTION_KEY is required to read stored keys",
      );
    };
  }
  const key = requireEncryptionKey({
    SETTINGS_ENCRYPTION_KEY: encryptionKey,
  });
  return (blob: string) => {
    try {
      return decryptSecret(blob, key);
    } catch {
      throw new SettingsDecryptionError("Failed to decrypt a stored key");
    }
  };
}

export async function loadEffectiveSettings(
  deps: SettingsDeps,
): Promise<ProviderSettings> {
  const stored = await deps.repo.get();
  return applyEnvFallback(stored, deps.env, deps.decrypt);
}

export function createSettingsCache(
  loader: () => Promise<ProviderSettings>,
  ttlMs: number,
  now: () => number = () => Date.now(),
): { get(): Promise<ProviderSettings> } {
  let cached: { value: ProviderSettings; at: number } | undefined;
  return {
    async get(): Promise<ProviderSettings> {
      const current = now();
      if (cached && current - cached.at < ttlMs) {
        return cached.value;
      }
      const value = await loader();
      cached = { value, at: current };
      return value;
    },
  };
}
