import {
  AI_PROVIDER_KEYS,
  LLM_PROVIDERS,
  OCR_PROVIDERS,
  type ProviderKey,
  type StoredProviderSettings,
} from "@audit/domain";
import { type Env, errors, PROVIDER_MODELS } from "@audit/lib";

export type SettingsInput = {
  llmProvider: string;
  llmModel: string;
  ocrProvider: string;
  ocrModel: string;
  keys: Partial<Record<ProviderKey, string>>;
  clearKeys?: ProviderKey[];
};

export type SettingsView = {
  llmProvider: string;
  llmModel: string;
  ocrProvider: string;
  ocrModel: string;
  configuredKeys: Record<ProviderKey, boolean>;
  encryptionKeyPresent: boolean;
};

export type ValidationResult =
  | { ok: true; value: SettingsInput }
  | { ok: false; error: string };

const GO_DEFAULTS = {
  llmProvider: "opencode",
  llmModel: "deepseek-v4.1-flash",
  ocrProvider: "opencode",
  ocrModel: "deepseek-v4-flash-vision-exp",
} as const;

function modelsFor(provider: string): readonly string[] {
  if (provider in PROVIDER_MODELS) {
    return PROVIDER_MODELS[provider as keyof typeof PROVIDER_MODELS];
  }
  return [];
}

export function validateSettingsInput(input: SettingsInput): ValidationResult {
  if (!(LLM_PROVIDERS as readonly string[]).includes(input.llmProvider)) {
    return { ok: false, error: errors.settingsInvalidProvider };
  }
  if (!(OCR_PROVIDERS as readonly string[]).includes(input.ocrProvider)) {
    return { ok: false, error: errors.settingsInvalidProvider };
  }
  if (
    input.llmProvider !== "heuristic" &&
    !modelsFor(input.llmProvider).includes(input.llmModel)
  ) {
    return { ok: false, error: errors.settingsInvalidModel };
  }
  const ocrModelProvider =
    input.ocrProvider === "tesseract" ? "openai" : input.ocrProvider;
  if (
    ocrModelProvider !== "local" &&
    !modelsFor(ocrModelProvider).includes(input.ocrModel)
  ) {
    return { ok: false, error: errors.settingsInvalidModel };
  }
  return { ok: true, value: input };
}

const ENV_KEY_FIELD = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
  opencode: "OPENCODE_API_KEY",
} as const satisfies Record<ProviderKey, keyof Env>;

function hasIncomingKey(input: SettingsInput, provider: ProviderKey): boolean {
  const value = input.keys?.[provider];
  return typeof value === "string" && value.trim().length > 0;
}

function effectiveKeyPresent(
  input: SettingsInput,
  env: Env,
  provider: ProviderKey,
): boolean {
  if (input.clearKeys?.includes(provider)) {
    return hasIncomingKey(input, provider);
  }
  const envValue = env[ENV_KEY_FIELD[provider]];
  return (
    hasIncomingKey(input, provider) ||
    (typeof envValue === "string" && envValue.trim().length > 0)
  );
}

export function missingEffectiveKey(
  input: SettingsInput,
  env: Env,
): ProviderKey | null {
  const required: ProviderKey[] = [];
  if (input.llmProvider !== "heuristic") {
    required.push(input.llmProvider as ProviderKey);
  }
  const ocrProvider =
    input.ocrProvider === "tesseract" ? "openai" : input.ocrProvider;
  if (ocrProvider !== "local") {
    required.push(ocrProvider as ProviderKey);
  }
  for (const provider of required) {
    if (!effectiveKeyPresent(input, env, provider)) return provider;
  }
  return null;
}

export function describeSettingsView(
  stored: StoredProviderSettings | null,
  env: Env,
): SettingsView {
  const configuredKeys = {} as Record<ProviderKey, boolean>;
  for (const provider of AI_PROVIDER_KEYS) {
    const encrypted = stored?.encryptedKeys?.[provider];
    const envValue = env[ENV_KEY_FIELD[provider]];
    configuredKeys[provider] =
      Boolean(encrypted) ||
      (typeof envValue === "string" && envValue.trim().length > 0);
  }
  const selection = stored ?? GO_DEFAULTS;
  return {
    llmProvider: selection.llmProvider,
    llmModel: selection.llmModel,
    ocrProvider: selection.ocrProvider,
    ocrModel: selection.ocrModel,
    configuredKeys,
    encryptionKeyPresent: env.SETTINGS_ENCRYPTION_KEY.trim().length > 0,
  };
}
