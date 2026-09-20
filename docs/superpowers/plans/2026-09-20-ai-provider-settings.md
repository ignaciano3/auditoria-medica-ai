# AI Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` page that lets a self-hoster choose the LLM and OCR provider/model and store API keys encrypted in Postgres, taking effect on the next job without a worker restart, with OpenCode Go as the intended primary provider.

**Architecture:** A singleton `app_settings` row holds provider/model selections plus AES-256-GCM-encrypted key blobs. Pure helpers in `@audit/lib` encrypt/decrypt and merge stored settings over env fallback. Provider construction moves out of the worker into shared factories (`@audit/ai` for LLM, `@audit/documents` for OCR) that take a structural `ProviderSettings` object. The worker loads settings per job behind a 10s TTL cache; the web app exposes a server-action-backed form that is write-only for secrets.

**Tech Stack:** Bun 1.3.14, Node >=24, TypeScript 7 (strict), Biome, Zod, Drizzle ORM + Postgres, Next.js 16.3.5 (App Router, React 19), `openai` SDK.

**Spec:** `docs/superpowers/specs/2026-09-20-ai-provider-settings-design.md`

## Global Constraints

- Node >=24, Bun 1.3.14. Run focused tests with `bun test <path>` from the repo root; full suites with `bun run test`.
- TypeScript strict, Biome for lint/format. Definition of done for every task: `bun run lint`, `bun run typecheck`, `bun run test` pass at the repo root.
- UI copy is Spanish and lives in `packages/lib/src/i18n/es.ts`; do not hardcode user-facing Spanish in components.
- Never log API keys, decrypted secrets, or clinical content. Log provider names and document ids only.
- No code comments unless a linter directive requires them; the repo has a no-comments style.
- Next.js 16.3.5 has documented breaking changes. Before writing any file under `apps/web/`, read the relevant guide in `apps/web/node_modules/next/dist/docs/` (per `apps/web/AGENTS.md`).
- Commits per task, conventional-commit style matching the repo (`feat(...)`, `docs(...)`, `test(...)`).
- OpenCode Go base URL is `https://opencode.ai/zen/go/v1`; there is no v2 API.
- `@audit/ai` must NOT depend on `@audit/lib` or `@audit/documents`; `@audit/lib` must NOT depend on `@audit/db` or `@audit/ai`. Shared types live in `@audit/domain`.

---

### Task 1: Shared provider types and env catalog/relaxation

**Files:**
- Create: `packages/domain/src/ai-settings.ts`
- Create: `packages/domain/src/ai-settings.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/lib/src/env.ts`
- Modify: `packages/lib/src/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProviderSettings`, `StoredProviderSettings`, `ProviderKey`, `LlmProviderName`, `OcrProviderName`, `AI_PROVIDER_KEYS`, `LLM_PROVIDERS`, `OCR_PROVIDERS`, `OPENCODE_GO_BASE_URL`, `OPENCODE_USER_AGENT`, `opencodeDefaultHeaders(sessionId)` from `@audit/domain`; `PROVIDER_MODELS` (now includes `opencode`), `Env` (now includes `OPENCODE_API_KEY`, `SETTINGS_ENCRYPTION_KEY`) from `@audit/lib`.

- [ ] **Step 1: Write the failing test for domain provider types**

Create `packages/domain/src/ai-settings.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  AI_PROVIDER_KEYS,
  OPENCODE_GO_BASE_URL,
  opencodeDefaultHeaders,
} from "./ai-settings.ts";

describe("ai-settings", () => {
  test("lists the hosted API-key providers", () => {
    expect(AI_PROVIDER_KEYS).toEqual(["openai", "deepseek", "qwen", "opencode"]);
  });

  test("exposes the OpenCode Go endpoint", () => {
    expect(OPENCODE_GO_BASE_URL).toBe("https://opencode.ai/zen/go/v1");
  });

  test("builds OpenCode Go request headers with a session id", () => {
    expect(opencodeDefaultHeaders("document:abc")).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/domain/src/ai-settings.test.ts`
Expected: FAIL — cannot resolve `./ai-settings.ts`.

- [ ] **Step 3: Create the domain types module**

Create `packages/domain/src/ai-settings.ts`:

```ts
export const AI_PROVIDER_KEYS = [
  "openai",
  "deepseek",
  "qwen",
  "opencode",
] as const;

export type ProviderKey = (typeof AI_PROVIDER_KEYS)[number];

export const LLM_PROVIDERS = [
  "openai",
  "deepseek",
  "qwen",
  "opencode",
  "heuristic",
] as const;

export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

export const OCR_PROVIDERS = [
  "openai",
  "deepseek",
  "qwen",
  "opencode",
  "tesseract",
  "local",
] as const;

export type OcrProviderName = (typeof OCR_PROVIDERS)[number];

export type ProviderSettings = {
  llmProvider: LlmProviderName;
  llmModel: string;
  ocrProvider: OcrProviderName;
  ocrModel: string;
  keys: Record<ProviderKey, string>;
};

export type StoredProviderSettings = {
  llmProvider: string;
  llmModel: string;
  ocrProvider: string;
  ocrModel: string;
  encryptedKeys: Partial<Record<ProviderKey, string | null>>;
};

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";

export const OPENCODE_USER_AGENT = "auditoria-medica-ai/1.0";

export function opencodeDefaultHeaders(
  sessionId: string,
): Record<string, string> {
  return {
    "User-Agent": OPENCODE_USER_AGENT,
    "x-opencode-session": sessionId,
  };
}
```

- [ ] **Step 4: Export the new module from the domain index**

In `packages/domain/src/index.ts`, add at the end:

```ts
export {
  AI_PROVIDER_KEYS,
  type LlmProviderName,
  LLM_PROVIDERS,
  type OcrProviderName,
  OCR_PROVIDERS,
  OPENCODE_GO_BASE_URL,
  OPENCODE_USER_AGENT,
  opencodeDefaultHeaders,
  type ProviderKey,
  type ProviderSettings,
  type StoredProviderSettings,
} from "./ai-settings.ts";
```

- [ ] **Step 5: Run the domain test to verify it passes**

Run: `bun test packages/domain/src/ai-settings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing env tests**

Replace `packages/lib/src/env.test.ts` entirely with this content (the key-presence tests move to Task 5, where provider resolution validates keys; env parsing now allows empty keys so the DB can supply them):

```ts
import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env.ts";

const BASE = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "documents",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio123",
} as const;

describe("parseEnv", () => {
  test("accepts a complete environment", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "openai",
      OCR_MODEL: "gpt-5.6-luna",
      OPENAI_API_KEY: "sk-test",
      DOCUMENT_RETENTION_DAYS: "30",
    });
    expect(result.DATABASE_URL).toContain("postgres://");
    expect(result.DOCUMENT_RETENTION_DAYS).toBe(30);
  });

  test("defaults to the tesseract OCR provider", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.OCR_PROVIDER).toBe("tesseract");
  });

  test("accepts the heuristic LLM provider", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "local",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.LLM_PROVIDER).toBe("heuristic");
  });

  test("accepts fully local providers without keys", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "heuristic",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "local",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.OCR_PROVIDER).toBe("local");
    expect(result.OPENAI_API_KEY).toBe("");
  });

  test("allows an empty OpenAI key because settings may supply it", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.6-terra",
      OCR_PROVIDER: "local",
      OCR_MODEL: "gpt-5.6-luna",
    });
    expect(result.OPENAI_API_KEY).toBe("");
  });

  test("accepts the opencode provider and its key variable", () => {
    const result = parseEnv({
      ...BASE,
      LLM_PROVIDER: "opencode",
      LLM_MODEL: "deepseek-v4.1-flash",
      OCR_PROVIDER: "opencode",
      OCR_MODEL: "deepseek-v4-flash-vision-exp",
      OPENCODE_API_KEY: "go-test",
      SETTINGS_ENCRYPTION_KEY: "a".repeat(32),
    });
    expect(result.LLM_PROVIDER).toBe("opencode");
    expect(result.OPENCODE_API_KEY).toBe("go-test");
    expect(result.SETTINGS_ENCRYPTION_KEY).toBe("a".repeat(32));
  });

  test("rejects a retired or unknown model", () => {
    expect(() =>
      parseEnv({
        ...BASE,
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-5.5",
        OCR_PROVIDER: "local",
        OCR_MODEL: "gpt-5.6-luna",
      }),
    ).toThrow();
  });

  test("rejects a missing required value", () => {
    expect(() => parseEnv({})).toThrow();
  });
});

describe("parseEnv provider selection", () => {
  const LOCAL = {
    ...BASE,
    OCR_PROVIDER: "local",
    OCR_MODEL: "gpt-5.6-luna",
  } as const;

  test("accepts the deepseek LLM provider with its own key", () => {
    const result = parseEnv({
      ...LOCAL,
      LLM_PROVIDER: "deepseek",
      LLM_MODEL: "deepseek-flash",
      DEEPSEEK_API_KEY: "ds-test",
    });
    expect(result.LLM_PROVIDER).toBe("deepseek");
  });

  test("accepts the qwen LLM provider with its own key", () => {
    const result = parseEnv({
      ...LOCAL,
      LLM_PROVIDER: "qwen",
      LLM_MODEL: "qwen3.8-flash",
      DASHSCOPE_API_KEY: "ds-test",
    });
    expect(result.LLM_PROVIDER).toBe("qwen");
  });

  test("rejects a model that does not belong to the selected LLM provider", () => {
    expect(() =>
      parseEnv({
        ...LOCAL,
        LLM_PROVIDER: "qwen",
        LLM_MODEL: "deepseek-flash",
      }),
    ).toThrow();
  });

  test("rejects a model that does not belong to the selected OCR provider", () => {
    expect(() =>
      parseEnv({
        ...BASE,
        LLM_PROVIDER: "heuristic",
        LLM_MODEL: "gpt-5.6-terra",
        OCR_PROVIDER: "qwen",
        OCR_MODEL: "gpt-5.6-luna",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 7: Run the env tests to verify they fail**

Run: `bun test packages/lib/src/env.test.ts`
Expected: FAIL — `opencode` not in the provider enum; missing key still throws.

- [ ] **Step 8: Update `packages/lib/src/env.ts`**

Replace the top of the file through the end of `schema` with the following. Keep the `Provider`/`SupportedModel` exports and `ocrModelProvider` helper; remove `KEY_FIELD` and the key-presence block from `superRefine`.

```ts
import { z } from "zod";

export const PROVIDER_MODELS = {
  openai: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra"],
  deepseek: ["deepseek-flash", "deepseek-v4-pro"],
  qwen: ["qwen3.8-flash", "qwen3.8-max", "qwen3-vl-plus"],
  opencode: [
    "deepseek-v4.1-flash",
    "deepseek-v4-flash-vision-exp",
    "glm-5.3-flash",
    "glm-5.3",
    "kimi-k3",
    "longcat-2.0",
    "mimo-v2.5",
    "mimo-v2.5-pro",
    "hy4-preview",
  ],
} as const;

export type Provider = keyof typeof PROVIDER_MODELS;

export type SupportedModel = (typeof PROVIDER_MODELS)[Provider][number];

function supportsModel(provider: Provider, model: string): boolean {
  return (PROVIDER_MODELS[provider] as readonly string[]).includes(model);
}

function ocrModelProvider(
  provider: "openai" | "deepseek" | "qwen" | "opencode" | "tesseract" | "local",
): Provider | undefined {
  if (provider === "local") return undefined;
  if (provider === "tesseract") return "openai";
  return provider;
}

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    LLM_PROVIDER: z
      .enum(["openai", "deepseek", "qwen", "opencode", "heuristic"])
      .default("openai"),
    LLM_MODEL: z.string().min(1),
    OCR_PROVIDER: z
      .enum(["openai", "deepseek", "qwen", "opencode", "tesseract", "local"])
      .default("tesseract"),
    OCR_MODEL: z.string().min(1),
    OPENAI_API_KEY: z.string().default(""),
    DEEPSEEK_API_KEY: z.string().default(""),
    DASHSCOPE_API_KEY: z.string().default(""),
    OPENCODE_API_KEY: z.string().default(""),
    SETTINGS_ENCRYPTION_KEY: z.string().default(""),
    DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  })
  .superRefine((env, ctx) => {
    if (
      env.LLM_PROVIDER !== "heuristic" &&
      !supportsModel(env.LLM_PROVIDER, env.LLM_MODEL)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_MODEL"],
        message: `LLM_MODEL must be one of ${PROVIDER_MODELS[env.LLM_PROVIDER].join(", ")} for LLM_PROVIDER ${env.LLM_PROVIDER}`,
      });
    }

    const ocrProvider = ocrModelProvider(env.OCR_PROVIDER);
    if (ocrProvider && !supportsModel(ocrProvider, env.OCR_MODEL)) {
      ctx.addIssue({
        code: "custom",
        path: ["OCR_MODEL"],
        message: `OCR_MODEL must be one of ${PROVIDER_MODELS[ocrProvider].join(", ")} for OCR_PROVIDER ${env.OCR_PROVIDER}`,
      });
    }
  });
```

Leave `export type Env = z.infer<typeof schema>;`, `parseEnv`, and `getEnv` unchanged below.

- [ ] **Step 9: Run the env tests to verify they pass**

Run: `bun test packages/lib/src/env.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 10: Typecheck and lint the touched packages**

Run: `bun run --cwd packages/domain typecheck && bun run --cwd packages/lib typecheck && bun run --cwd packages/lib lint`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/domain/src/ai-settings.ts packages/domain/src/ai-settings.test.ts packages/domain/src/index.ts packages/lib/src/env.ts packages/lib/src/env.test.ts
git commit -m "feat(settings): add shared provider types and opencode catalog"
```

---

### Task 2: Encryption helper

**Files:**
- Create: `packages/lib/src/crypto/secrets.ts`
- Create: `packages/lib/src/crypto/secrets.test.ts`
- Modify: `packages/lib/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseEncryptionKey(raw: string): Buffer`, `requireEncryptionKey(source?: Record<string, string | undefined>): Buffer`, `encryptSecret(plaintext: string, key: Buffer): string`, `decryptSecret(blob: string, key: Buffer): string` from `@audit/lib`.

- [ ] **Step 1: Write the failing test**

Create `packages/lib/src/crypto/secrets.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  requireEncryptionKey,
} from "./secrets.ts";

const KEY = Buffer.alloc(32, 7);

describe("parseEncryptionKey", () => {
  test("decodes a 32-byte base64 key", () => {
    const raw = Buffer.alloc(32, 1).toString("base64");
    expect(parseEncryptionKey(raw).length).toBe(32);
  });

  test("decodes a 64-char hex key", () => {
    expect(parseEncryptionKey("a".repeat(64)).length).toBe(32);
  });

  test("rejects a key of the wrong length", () => {
    expect(() => parseEncryptionKey("short")).toThrow();
  });
});

describe("requireEncryptionKey", () => {
  test("reads SETTINGS_ENCRYPTION_KEY from the source", () => {
    const raw = Buffer.alloc(32, 3).toString("base64");
    expect(requireEncryptionKey({ SETTINGS_ENCRYPTION_KEY: raw }).length).toBe(
      32,
    );
  });

  test("throws when the variable is missing", () => {
    expect(() => requireEncryptionKey({})).toThrow();
  });
});

describe("encryptSecret / decryptSecret", () => {
  test("round-trips a value", () => {
    const blob = encryptSecret("sk-secret", KEY);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(decryptSecret(blob, KEY)).toBe("sk-secret");
  });

  test("produces a different ciphertext for the same plaintext", () => {
    expect(encryptSecret("x", KEY)).not.toBe(encryptSecret("x", KEY));
  });

  test("fails to decrypt with the wrong key", () => {
    const blob = encryptSecret("sk-secret", KEY);
    expect(() => decryptSecret(blob, Buffer.alloc(32, 9))).toThrow();
  });

  test("rejects a malformed blob", () => {
    expect(() => decryptSecret("not-a-blob", KEY)).toThrow();
    expect(() => decryptSecret("v2:a:b:c", KEY)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/lib/src/crypto/secrets.test.ts`
Expected: FAIL — cannot resolve `./secrets.ts`.

- [ ] **Step 3: Implement the helper**

Create `packages/lib/src/crypto/secrets.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function parseEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("SETTINGS_ENCRYPTION_KEY is empty");
  }
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("SETTINGS_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function requireEncryptionKey(
  source: Record<string, string | undefined> = process.env,
): Buffer {
  return parseEncryptionKey(source.SETTINGS_ENCRYPTION_KEY ?? "");
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(blob: string, key: Buffer): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid encrypted secret format");
  }
  const ivPart = parts[1];
  const tagPart = parts[2];
  const cipherPart = parts[3];
  if (ivPart === undefined || tagPart === undefined || cipherPart === undefined) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  if (tag.length !== TAG_BYTES) {
    throw new Error("Invalid encrypted secret tag");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Export from the lib index**

In `packages/lib/src/index.ts`, add:

```ts
export {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  requireEncryptionKey,
} from "./crypto/secrets.ts";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test packages/lib/src/crypto/secrets.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/lib/src/crypto/secrets.ts packages/lib/src/crypto/secrets.test.ts packages/lib/src/index.ts
git commit -m "feat(settings): add AES-256-GCM secret helper"
```

---

### Task 3: Effective settings merge

**Files:**
- Create: `packages/lib/src/settings/effective-settings.ts`
- Create: `packages/lib/src/settings/effective-settings.test.ts`
- Modify: `packages/lib/src/index.ts`

**Interfaces:**
- Consumes: `ProviderSettings`, `StoredProviderSettings`, `ProviderKey`, `AI_PROVIDER_KEYS` from `@audit/domain`; `Env` from `../env.ts`.
- Produces: `applyEnvFallback(stored: StoredProviderSettings | null, env: Env, decrypt: (blob: string) => string): ProviderSettings` from `@audit/lib`.

- [ ] **Step 1: Write the failing test**

Create `packages/lib/src/settings/effective-settings.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { StoredProviderSettings } from "@audit/domain";
import type { Env } from "../env.ts";
import { applyEnvFallback } from "./effective-settings.ts";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "documents",
    S3_ACCESS_KEY: "minio",
    S3_SECRET_KEY: "minio123",
    LLM_PROVIDER: "openai",
    LLM_MODEL: "gpt-5.6-terra",
    OCR_PROVIDER: "tesseract",
    OCR_MODEL: "gpt-5.6-luna",
    OPENAI_API_KEY: "env-openai",
    DEEPSEEK_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    OPENCODE_API_KEY: "env-opencode",
    SETTINGS_ENCRYPTION_KEY: "",
    DOCUMENT_RETENTION_DAYS: 30,
    ...overrides,
  };
}

const decrypt = (blob: string) => `dec:${blob}`;

describe("applyEnvFallback", () => {
  test("uses env values when nothing is stored", () => {
    const result = applyEnvFallback(null, makeEnv(), decrypt);
    expect(result.llmProvider).toBe("openai");
    expect(result.llmModel).toBe("gpt-5.6-terra");
    expect(result.ocrProvider).toBe("tesseract");
    expect(result.keys.openai).toBe("env-openai");
    expect(result.keys.opencode).toBe("env-opencode");
  });

  test("lets stored provider and model override env", () => {
    const stored: StoredProviderSettings = {
      llmProvider: "opencode",
      llmModel: "deepseek-v4.1-flash",
      ocrProvider: "opencode",
      ocrModel: "deepseek-v4-flash-vision-exp",
      encryptedKeys: { opencode: "blob" },
    };
    const result = applyEnvFallback(stored, makeEnv(), decrypt);
    expect(result.llmProvider).toBe("opencode");
    expect(result.llmModel).toBe("deepseek-v4.1-flash");
    expect(result.ocrProvider).toBe("opencode");
    expect(result.keys.opencode).toBe("dec:blob");
  });

  test("falls back to env for keys the stored row does not set", () => {
    const stored: StoredProviderSettings = {
      llmProvider: "opencode",
      llmModel: "deepseek-v4.1-flash",
      ocrProvider: "opencode",
      ocrModel: "deepseek-v4-flash-vision-exp",
      encryptedKeys: { opencode: "blob" },
    };
    const result = applyEnvFallback(stored, makeEnv(), decrypt);
    expect(result.keys.openai).toBe("env-openai");
  });

  test("treats a null stored key as not set", () => {
    const stored: StoredProviderSettings = {
      llmProvider: "openai",
      llmModel: "gpt-5.6-terra",
      ocrProvider: "local",
      ocrModel: "gpt-5.6-luna",
      encryptedKeys: { openai: null },
    };
    const result = applyEnvFallback(stored, makeEnv(), decrypt);
    expect(result.keys.openai).toBe("env-openai");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/lib/src/settings/effective-settings.test.ts`
Expected: FAIL — cannot resolve `./effective-settings.ts`.

- [ ] **Step 3: Implement the merge**

Create `packages/lib/src/settings/effective-settings.ts`:

```ts
import {
  AI_PROVIDER_KEYS,
  type LlmProviderName,
  type OcrProviderName,
  type ProviderKey,
  type ProviderSettings,
  type StoredProviderSettings,
} from "@audit/domain";
import type { Env } from "../env.ts";

const ENV_KEY_FIELD = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
  opencode: "OPENCODE_API_KEY",
} as const satisfies Record<ProviderKey, keyof Env>;

export function applyEnvFallback(
  stored: StoredProviderSettings | null,
  env: Env,
  decrypt: (blob: string) => string,
): ProviderSettings {
  const keys = {} as Record<ProviderKey, string>;
  for (const provider of AI_PROVIDER_KEYS) {
    const encrypted = stored?.encryptedKeys?.[provider];
    if (encrypted) {
      keys[provider] = decrypt(encrypted);
      continue;
    }
    const envValue = env[ENV_KEY_FIELD[provider]];
    keys[provider] = typeof envValue === "string" ? envValue : "";
  }

  return {
    llmProvider: (stored?.llmProvider ??
      env.LLM_PROVIDER) as LlmProviderName,
    llmModel: stored?.llmModel ?? env.LLM_MODEL,
    ocrProvider: (stored?.ocrProvider ??
      env.OCR_PROVIDER) as OcrProviderName,
    ocrModel: stored?.ocrModel ?? env.OCR_MODEL,
    keys,
  };
}
```

- [ ] **Step 4: Export from the lib index**

In `packages/lib/src/index.ts`, add:

```ts
export { applyEnvFallback } from "./settings/effective-settings.ts";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test packages/lib/src/settings/effective-settings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/lib/src/settings/effective-settings.ts packages/lib/src/settings/effective-settings.test.ts packages/lib/src/index.ts
git commit -m "feat(settings): merge stored settings over env fallback"
```

---

### Task 4: App settings table and repository

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0003_*.sql` (via `db:generate`)
- Create: `packages/db/src/repositories/app-settings.ts`
- Create: `packages/db/src/repositories/app-settings.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `ProviderKey`, `StoredProviderSettings` from `@audit/domain`.
- Produces: `appSettings` table from `@audit/db`; `createAppSettingsRepository(db)` returning `{ get(): Promise<StoredProviderSettings | null>; upsert(input: { llmProvider: string; llmModel: string; ocrProvider: string; ocrModel: string; encryptedKeys: Partial<Record<ProviderKey, string | null>> }): Promise<void> }` from `@audit/db`.

- [ ] **Step 1: Add the table to the schema**

In `packages/db/src/schema.ts`, add after `accessLog`:

```ts
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  llmProvider: text("llm_provider").notNull(),
  llmModel: text("llm_model").notNull(),
  ocrProvider: text("ocr_provider").notNull(),
  ocrModel: text("ocr_model").notNull(),
  openaiApiKeyEnc: text("openai_api_key_enc"),
  deepseekApiKeyEnc: text("deepseek_api_key_enc"),
  dashscopeApiKeyEnc: text("dashscope_api_key_enc"),
  opencodeApiKeyEnc: text("opencode_api_key_enc"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

`integer`, `text`, `timestamp`, and `pgTable` are already imported at the top of the file.

- [ ] **Step 2: Generate the migration**

Run: `bun run --cwd packages/db db:generate`
Expected: a new `packages/db/drizzle/0003_*.sql` containing a `CREATE TABLE ... "app_settings"` statement, plus updated `packages/db/drizzle/meta/_journal.json` and a new snapshot.

If the generator cannot run offline, hand-write `packages/db/drizzle/0003_app_settings.sql` with:

```sql
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"llm_provider" text NOT NULL,
	"llm_model" text NOT NULL,
	"ocr_provider" text NOT NULL,
	"ocr_model" text NOT NULL,
	"openai_api_key_enc" text,
	"deepseek_api_key_enc" text,
	"dashscope_api_key_enc" text,
	"opencode_api_key_enc" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

and append an entry for it to `packages/db/drizzle/meta/_journal.json` with `"idx": 3` and tag `0003_app_settings`.

- [ ] **Step 3: Write the failing repository test**

Create `packages/db/src/repositories/app-settings.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Database, getDb } from "../client.ts";
import { createAppSettingsRepository } from "./app-settings.ts";

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("app settings repository", () => {
  let db: Database;
  let repo: ReturnType<typeof createAppSettingsRepository>;

  beforeAll(() => {
    db = getDb(url as string);
    repo = createAppSettingsRepository(db);
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
```

- [ ] **Step 4: Run the test to verify it fails (or is skipped without a DB)**

Run: `bun test packages/db/src/repositories/app-settings.test.ts`
Expected: FAIL — cannot resolve `./app-settings.ts`. With `TEST_DATABASE_URL` set against a migrated DB, it must fail at import; without it, the suite skips.

- [ ] **Step 5: Implement the repository**

Create `packages/db/src/repositories/app-settings.ts`:

```ts
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
      return {
        llmProvider: row.llmProvider,
        llmModel: row.llmModel,
        ocrProvider: row.ocrProvider,
        ocrModel: row.ocrModel,
        encryptedKeys: {
          openai: row.openaiApiKeyEnc ?? undefined,
          deepseek: row.deepseekApiKeyEnc ?? undefined,
          qwen: row.dashscopeApiKeyEnc ?? undefined,
          opencode: row.opencodeApiKeyEnc ?? undefined,
        },
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
```

`COLUMNS` maps the domain `ProviderKey` `qwen` to the column `dashscopeApiKeyEnc` (named after `DASHSCOPE_API_KEY`). The `as const satisfies Record<ProviderKey, string>` annotation keeps `keyof` aligned with the domain type and lets the loop index it safely.

- [ ] **Step 6: Export from the db index**

In `packages/db/src/index.ts`, add `appSettings` to the schema export list and add:

```ts
export { createAppSettingsRepository } from "./repositories/app-settings.ts";
```

- [ ] **Step 7: Run the repository test**

Run: `bun test packages/db/src/repositories/app-settings.test.ts`
Expected: PASS with `TEST_DATABASE_URL` pointing at a migrated database; skipped otherwise.

- [ ] **Step 8: Apply migrations against the local database and typecheck**

Run: `bun run --cwd packages/db db:migrate && bun run --cwd packages/db typecheck`
Expected: migration applies; no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/repositories/app-settings.ts packages/db/src/repositories/app-settings.test.ts packages/db/src/index.ts packages/db/drizzle
git commit -m "feat(settings): persist encrypted provider settings"
```

---

### Task 5: LLM provider factory (OpenCode Go + headers)

**Files:**
- Create: `packages/ai/src/providers/factory.ts`
- Create: `packages/ai/src/providers/factory.test.ts`
- Create: `packages/ai/src/providers/openai/openai-provider-headers.test.ts`
- Modify: `packages/ai/src/providers/openai/openai-provider.ts`
- Modify: `packages/ai/src/index.ts`

**Interfaces:**
- Consumes: `ProviderSettings`, `ProviderKey`, `OPENCODE_GO_BASE_URL`, `opencodeDefaultHeaders` from `@audit/domain`.
- Produces: `MissingProviderKeyError`, `resolveLlmConfig(settings, opts?)`, `createLlmProvider(settings, opts?)` from `@audit/ai`.

- [ ] **Step 1: Write the failing factory test**

Create `packages/ai/src/providers/factory.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ProviderSettings } from "@audit/domain";
import { HeuristicLLMProvider } from "../heuristic/heuristic-provider.ts";
import {
  createLlmProvider,
  MissingProviderKeyError,
  resolveLlmConfig,
} from "./factory.ts";
import { OpenAIProvider } from "./openai/openai-provider.ts";

function settings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    llmProvider: "opencode",
    llmModel: "deepseek-v4.1-flash",
    ocrProvider: "local",
    ocrModel: "gpt-5.6-luna",
    keys: { openai: "", deepseek: "", qwen: "", opencode: "go-test" },
    ...overrides,
  };
}

describe("resolveLlmConfig", () => {
  test("returns null for the heuristic provider", () => {
    expect(resolveLlmConfig(settings({ llmProvider: "heuristic" }))).toBeNull();
  });

  test("maps opencode to the Go endpoint with session headers", () => {
    const config = resolveLlmConfig(settings(), { sessionId: "document:abc" });
    expect(config?.baseURL).toBe("https://opencode.ai/zen/go/v1");
    expect(config?.apiKey).toBe("go-test");
    expect(config?.model).toBe("deepseek-v4.1-flash");
    expect(config?.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });

  test("maps openai without a base URL", () => {
    const config = resolveLlmConfig(
      settings({
        llmProvider: "openai",
        llmModel: "gpt-5.6-terra",
        keys: { openai: "sk", deepseek: "", qwen: "", opencode: "" },
      }),
    );
    expect(config?.baseURL).toBeUndefined();
  });

  test("maps deepseek to its endpoint and non-thinking mode", () => {
    const config = resolveLlmConfig(
      settings({
        llmProvider: "deepseek",
        llmModel: "deepseek-flash",
        keys: { openai: "", deepseek: "ds", qwen: "", opencode: "" },
      }),
    );
    expect(config?.baseURL).toBe("https://api.deepseek.com");
    expect(config?.extraBody).toEqual({ thinking: { type: "disabled" } });
  });

  test("throws MissingProviderKeyError for a hosted provider without a key", () => {
    expect(() =>
      resolveLlmConfig(
        settings({
          keys: { openai: "", deepseek: "", qwen: "", opencode: "" },
        }),
      ),
    ).toThrow(MissingProviderKeyError);
  });
});

describe("createLlmProvider", () => {
  test("returns the heuristic provider when selected", () => {
    expect(
      createLlmProvider(settings({ llmProvider: "heuristic" })),
    ).toBeInstanceOf(HeuristicLLMProvider);
  });

  test("returns an OpenAI-compatible provider for opencode", () => {
    expect(createLlmProvider(settings())).toBeInstanceOf(OpenAIProvider);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/ai/src/providers/factory.test.ts`
Expected: FAIL — cannot resolve `./factory.ts`.

- [ ] **Step 3: Implement the factory**

Create `packages/ai/src/providers/factory.ts`:

```ts
import { randomUUID } from "node:crypto";
import {
  OPENCODE_GO_BASE_URL,
  opencodeDefaultHeaders,
  type ProviderKey,
  type ProviderSettings,
} from "@audit/domain";
import { HeuristicLLMProvider } from "../heuristic/heuristic-provider.ts";
import { OpenAIProvider } from "./openai/openai-provider.ts";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export class MissingProviderKeyError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Missing API key for provider ${provider}`);
    this.name = "MissingProviderKeyError";
    this.provider = provider;
  }
}

export type LlmClientConfig = ConstructorParameters<typeof OpenAIProvider>[0];

function requireKey(settings: ProviderSettings, provider: ProviderKey): string {
  const key = settings.keys[provider];
  if (!key || key.trim().length === 0) {
    throw new MissingProviderKeyError(provider);
  }
  return key;
}

export function resolveLlmConfig(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
): LlmClientConfig | null {
  switch (settings.llmProvider) {
    case "heuristic":
      return null;
    case "opencode":
      return {
        apiKey: requireKey(settings, "opencode"),
        baseURL: OPENCODE_GO_BASE_URL,
        model: settings.llmModel,
        reasoningEffort: null,
        defaultHeaders: opencodeDefaultHeaders(opts?.sessionId ?? randomUUID()),
      };
    case "deepseek":
      return {
        apiKey: requireKey(settings, "deepseek"),
        baseURL: DEEPSEEK_BASE_URL,
        model: settings.llmModel,
        extraBody: { thinking: { type: "disabled" } },
        reasoningEffort: "low",
      };
    case "qwen":
      return {
        apiKey: requireKey(settings, "qwen"),
        baseURL: QWEN_BASE_URL,
        model: settings.llmModel,
        extraBody: { enable_thinking: false },
        reasoningEffort: "low",
      };
    default:
      return {
        apiKey: requireKey(settings, "openai"),
        model: settings.llmModel,
        reasoningEffort: "low",
      };
  }
}

export function createLlmProvider(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
) {
  const config = resolveLlmConfig(settings, opts);
  return config ? new OpenAIProvider(config) : new HeuristicLLMProvider();
}
```

- [ ] **Step 4: Add `defaultHeaders` to `OpenAIProvider`**

In `packages/ai/src/providers/openai/openai-provider.ts`, add a field and constructor option.

Add to the class fields (near line 92):

```ts
  private readonly defaultHeaders: Record<string, string> | undefined;
```

Add to the constructor options type (near line 100):

```ts
    defaultHeaders?: Record<string, string>;
```

Set it in the constructor body (near line 106):

```ts
    this.defaultHeaders = options.defaultHeaders;
```

Update the lazily constructed client (near line 116) to:

```ts
        (new OpenAI({
          apiKey: this.apiKey,
          ...(this.baseURL ? { baseURL: this.baseURL } : {}),
          ...(this.defaultHeaders
            ? { defaultHeaders: this.defaultHeaders }
            : {}),
        }) as unknown as OpenAICompatibleClient);
```

- [ ] **Step 5: Write the failing headers-forwarding test**

Create `packages/ai/src/providers/openai/openai-provider-headers.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

const constructedClients: Array<Record<string, unknown>> = [];

mock.module("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "Resumen clínico." } }],
        }),
      },
    };

    constructor(options: Record<string, unknown>) {
      constructedClients.push(options);
    }
  },
}));

const { OpenAIProvider } = await import("../../index.ts");

const record = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
} as Parameters<
  InstanceType<typeof OpenAIProvider>["generateClinicalSummary"]
>[0];

describe("OpenAIProvider default headers", () => {
  test("forwards defaultHeaders to the OpenAI SDK client", async () => {
    const provider = new OpenAIProvider({
      apiKey: "t",
      model: "deepseek-v4.1-flash",
      baseURL: "https://opencode.ai/zen/go/v1",
      defaultHeaders: {
        "User-Agent": "auditoria-medica-ai/1.0",
        "x-opencode-session": "document:abc",
      },
    });
    await provider.generateClinicalSummary(record);
    expect(constructedClients[0]?.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });
});
```

- [ ] **Step 6: Export the factory from the ai index**

In `packages/ai/src/index.ts`, add:

```ts
export {
  createLlmProvider,
  type LlmClientConfig,
  MissingProviderKeyError,
  resolveLlmConfig,
} from "./providers/factory.ts";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test packages/ai/src/providers/factory.test.ts packages/ai/src/providers/openai/openai-provider-headers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/ai/src/providers/factory.ts packages/ai/src/providers/factory.test.ts packages/ai/src/providers/openai/openai-provider.ts packages/ai/src/providers/openai/openai-provider-headers.test.ts packages/ai/src/index.ts
git commit -m "feat(settings): add LLM provider factory with OpenCode Go"
```

---

### Task 6: OCR provider factory in `@audit/documents`

**Files:**
- Create: `packages/documents/src/ocr/factory.ts`
- Create: `packages/documents/src/ocr/factory.test.ts`
- Create: `packages/documents/src/ocr/openai-ocr-provider-headers.test.ts`
- Modify: `packages/documents/src/ocr/openai-ocr-provider.ts`
- Modify: `packages/documents/src/index.ts`

**Interfaces:**
- Consumes: `ProviderSettings`, `ProviderKey`, `OPENCODE_GO_BASE_URL`, `opencodeDefaultHeaders` from `@audit/domain`.
- Produces: `OcrProviders`, `resolveOcrVisionConfig(settings, opts?)`, `createOcrProviders(settings, opts?)` from `@audit/documents`.

- [ ] **Step 1: Write the failing factory test**

Create `packages/documents/src/ocr/factory.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ProviderSettings } from "@audit/domain";
import { createOcrProviders, resolveOcrVisionConfig } from "./factory.ts";
import { OpenAIVisionOCRProvider } from "./openai-ocr-provider.ts";
import { TesseractOCRProvider } from "./tesseract-ocr-provider.ts";

function settings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    llmProvider: "heuristic",
    llmModel: "gpt-5.6-terra",
    ocrProvider: "opencode",
    ocrModel: "deepseek-v4-flash-vision-exp",
    keys: { openai: "", deepseek: "", qwen: "", opencode: "go-test" },
    ...overrides,
  };
}

describe("resolveOcrVisionConfig", () => {
  test("maps opencode to the Go endpoint with headers", () => {
    const config = resolveOcrVisionConfig(settings(), {
      sessionId: "document:abc",
    });
    expect(config.baseURL).toBe("https://opencode.ai/zen/go/v1");
    expect(config.apiKey).toBe("go-test");
    expect(config.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });

  test("maps openai without a base URL", () => {
    const config = resolveOcrVisionConfig(
      settings({
        ocrProvider: "openai",
        ocrModel: "gpt-5.6-luna",
        keys: { openai: "sk", deepseek: "", qwen: "", opencode: "" },
      }),
    );
    expect(config.baseURL).toBeUndefined();
    expect(config.apiKey).toBe("sk");
  });
});

describe("createOcrProviders", () => {
  test("returns tesseract only in local mode", () => {
    const providers = createOcrProviders(
      settings({ ocrProvider: "local", ocrModel: "gpt-5.6-luna" }),
    );
    expect(providers.ocr).toBeInstanceOf(TesseractOCRProvider);
    expect(providers.handwrittenOcr).toBeUndefined();
  });

  test("returns a vision provider for opencode", () => {
    expect(createOcrProviders(settings()).ocr).toBeInstanceOf(
      OpenAIVisionOCRProvider,
    );
  });

  test("returns tesseract plus a handwritten vision provider for the hybrid", () => {
    const providers = createOcrProviders(
      settings({
        ocrProvider: "tesseract",
        ocrModel: "gpt-5.6-luna",
        keys: { openai: "sk", deepseek: "", qwen: "", opencode: "" },
      }),
    );
    expect(providers.ocr).toBeInstanceOf(TesseractOCRProvider);
    expect(providers.handwrittenOcr).toBeInstanceOf(OpenAIVisionOCRProvider);
  });

  test("throws for a vision provider without a key", () => {
    expect(() =>
      createOcrProviders(
        settings({
          keys: { openai: "", deepseek: "", qwen: "", opencode: "" },
        }),
      ),
    ).toThrow();
  });
});
```

Note: the local-mode test uses `TesseractOCRProvider` with `LocalPageClassifier`, which the factory constructs internally; the test asserts the type only.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/documents/src/ocr/factory.test.ts`
Expected: FAIL — cannot resolve `./factory.ts`.

- [ ] **Step 3: Implement the OCR factory**

Create `packages/documents/src/ocr/factory.ts`:

```ts
import { randomUUID } from "node:crypto";
import {
  OPENCODE_GO_BASE_URL,
  opencodeDefaultHeaders,
  type ProviderKey,
  type ProviderSettings,
} from "@audit/domain";
import { LocalPageClassifier } from "./local-page-classifier.ts";
import {
  type ImageDetail,
  OpenAIVisionOCRProvider,
} from "./openai-ocr-provider.ts";
import type { OCRProvider } from "./ocr-provider.ts";
import { TesseractOCRProvider } from "./tesseract-ocr-provider.ts";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export type OcrVisionConfig = ConstructorParameters<
  typeof OpenAIVisionOCRProvider
>[0];

export class OcrProviderKeyError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Missing API key for provider ${provider}`);
    this.name = "OcrProviderKeyError";
    this.provider = provider;
  }
}

function requireKey(settings: ProviderSettings, provider: ProviderKey): string {
  const key = settings.keys[provider];
  if (!key || key.trim().length === 0) {
    throw new OcrProviderKeyError(provider);
  }
  return key;
}

export function resolveOcrVisionConfig(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
): OcrVisionConfig {
  const base = {
    model: settings.ocrModel,
    classifyDetail: "high" as ImageDetail,
    transcribeDetail: "high" as ImageDetail,
    reasoningEffort: "low",
  };
  switch (settings.ocrProvider) {
    case "opencode":
      return {
        ...base,
        apiKey: requireKey(settings, "opencode"),
        baseURL: OPENCODE_GO_BASE_URL,
        defaultHeaders: opencodeDefaultHeaders(
          opts?.sessionId ?? randomUUID(),
        ),
      };
    case "deepseek":
      return {
        ...base,
        apiKey: requireKey(settings, "deepseek"),
        baseURL: DEEPSEEK_BASE_URL,
        extraBody: { thinking: { type: "disabled" } },
      };
    case "qwen":
      return {
        ...base,
        apiKey: requireKey(settings, "qwen"),
        baseURL: QWEN_BASE_URL,
        extraBody: { enable_thinking: false },
      };
    default:
      return { ...base, apiKey: requireKey(settings, "openai") };
  }
}

export interface OcrProviders {
  ocr: OCRProvider;
  handwrittenOcr?: OCRProvider;
}

export function createOcrProviders(
  settings: ProviderSettings,
  opts?: { sessionId?: string },
): OcrProviders {
  switch (settings.ocrProvider) {
    case "local":
      return {
        ocr: new TesseractOCRProvider({
          classifier: new LocalPageClassifier(),
        }),
      };
    case "tesseract": {
      const vision = new OpenAIVisionOCRProvider(
        resolveOcrVisionConfig(settings, opts),
      );
      return {
        ocr: new TesseractOCRProvider({ classifier: vision }),
        handwrittenOcr: vision,
      };
    }
    default:
      return {
        ocr: new OpenAIVisionOCRProvider(
          resolveOcrVisionConfig(settings, opts),
        ),
      };
  }
}
```

Verify the exact export names `ImageDetail` and `OCRProvider` by reading `packages/documents/src/ocr/openai-ocr-provider.ts` and `ocr-provider.ts`; adjust imports if the names differ (for example `TesseractOCRProvider` options type is not needed here).

- [ ] **Step 4: Add `defaultHeaders` to `OpenAIVisionOCRProvider`**

In `packages/documents/src/ocr/openai-ocr-provider.ts`, mirror Task 5 Step 4: add a `private readonly defaultHeaders: Record<string, string> | undefined;` field, a `defaultHeaders?: Record<string, string>;` constructor option, assign `this.defaultHeaders = options.defaultHeaders;`, and spread `...(this.defaultHeaders ? { defaultHeaders: this.defaultHeaders } : {})` into the `new OpenAI({...})` call inside the lazy `client` getter.

- [ ] **Step 5: Write the failing headers-forwarding test**

Create `packages/documents/src/ocr/openai-ocr-provider-headers.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

const constructedClients: Array<Record<string, unknown>> = [];

mock.module("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  docType: "other",
                  handwritten: false,
                  dataBearing: true,
                }),
              },
            },
          ],
        }),
      },
    };

    constructor(options: Record<string, unknown>) {
      constructedClients.push(options);
    }
  },
}));

const { OpenAIVisionOCRProvider } = await import("./openai-ocr-provider.ts");

describe("OpenAIVisionOCRProvider default headers", () => {
  test("forwards defaultHeaders to the OpenAI SDK client", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "t",
      model: "deepseek-v4-flash-vision-exp",
      baseURL: "https://opencode.ai/zen/go/v1",
      defaultHeaders: {
        "User-Agent": "auditoria-medica-ai/1.0",
        "x-opencode-session": "document:abc",
      },
    });
    await provider.classifyPage({
      pageNumber: 1,
      png: new Uint8Array([137, 80, 78, 71]),
    });
    expect(constructedClients[0]?.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });
});
```

The public method is confirmed as `classifyPage(input: PageImage)` where `PageImage` is `{ pageNumber: number; png: Uint8Array }`; calling it forces the lazy client to be built. The mock returns a valid classification JSON so the call resolves.

- [ ] **Step 6: Export the factory from the documents index**

In `packages/documents/src/index.ts`, add:

```ts
export {
  createOcrProviders,
  type OcrProviders,
  OcrProviderKeyError,
  resolveOcrVisionConfig,
} from "./ocr/factory.ts";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test packages/documents/src/ocr/factory.test.ts packages/documents/src/ocr/openai-ocr-provider-headers.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/documents/src/ocr/factory.ts packages/documents/src/ocr/factory.test.ts packages/documents/src/ocr/openai-ocr-provider.ts packages/documents/src/ocr/openai-ocr-provider-headers.test.ts packages/documents/src/index.ts
git commit -m "feat(settings): add OCR provider factory with OpenCode Go"
```

---

### Task 7: Worker per-job settings resolution

**Files:**
- Create: `apps/worker/src/settings.ts`
- Create: `apps/worker/src/settings.test.ts`
- Modify: `apps/worker/src/index.ts`
- Delete: `apps/worker/src/providers.ts`
- Delete: `apps/worker/src/providers.test.ts`

**Interfaces:**
- Consumes: `createAppSettingsRepository` and `getDb` from `@audit/db`; `applyEnvFallback`, `decryptSecret`, `getEnv`, `requireEncryptionKey`, `type Env` from `@audit/lib`; `ProviderSettings`, `StoredProviderSettings` from `@audit/domain`; `createLlmProvider` from `@audit/ai`; `createOcrProviders` from `@audit/documents`.
- Produces: `loadEffectiveSettings(deps): Promise<ProviderSettings>`, `createSettingsCache(loader, ttlMs): { get(): Promise<ProviderSettings> }` from `apps/worker/src/settings.ts`.

- [ ] **Step 1: Write the failing loader test**

Create `apps/worker/src/settings.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { StoredProviderSettings } from "@audit/domain";
import type { Env } from "@audit/lib";
import {
  createSettingsCache,
  loadEffectiveSettings,
  type SettingsDeps,
} from "./settings.ts";

function makeEnv(): Env {
  return {
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "documents",
    S3_ACCESS_KEY: "minio",
    S3_SECRET_KEY: "minio123",
    LLM_PROVIDER: "openai",
    LLM_MODEL: "gpt-5.6-terra",
    OCR_PROVIDER: "tesseract",
    OCR_MODEL: "gpt-5.6-luna",
    OPENAI_API_KEY: "env-openai",
    DEEPSEEK_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    OPENCODE_API_KEY: "",
    SETTINGS_ENCRYPTION_KEY: "",
    DOCUMENT_RETENTION_DAYS: 30,
  };
}

function makeDeps(stored: StoredProviderSettings | null): SettingsDeps {
  return {
    repo: { get: async () => stored },
    env: makeEnv(),
    decrypt: (blob: string) => `dec:${blob}`,
  };
}

describe("loadEffectiveSettings", () => {
  test("uses env when nothing is stored", async () => {
    const result = await loadEffectiveSettings(makeDeps(null));
    expect(result.llmProvider).toBe("openai");
    expect(result.keys.openai).toBe("env-openai");
  });

  test("decrypts a stored key over the env fallback", async () => {
    const result = await loadEffectiveSettings(
      makeDeps({
        llmProvider: "opencode",
        llmModel: "deepseek-v4.1-flash",
        ocrProvider: "opencode",
        ocrModel: "deepseek-v4-flash-vision-exp",
        encryptedKeys: { opencode: "blob", openai: "blob-openai" },
      }),
    );
    expect(result.llmProvider).toBe("opencode");
    expect(result.keys.opencode).toBe("dec:blob");
    expect(result.keys.openai).toBe("dec:blob-openai");
  });
});

describe("createSettingsCache", () => {
  test("reuses the value within the TTL and reloads after it", async () => {
    let calls = 0;
    let now = 0;
    const cache = createSettingsCache(async () => {
      calls += 1;
      return { llmProvider: "openai" } as never;
    }, 10, () => now);

    await cache.get();
    await cache.get();
    expect(calls).toBe(1);

    now = 11;
    await cache.get();
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/worker/src/settings.test.ts`
Expected: FAIL — cannot resolve `./settings.ts`.

- [ ] **Step 3: Implement the loader and cache**

Create `apps/worker/src/settings.ts`:

```ts
import {
  applyEnvFallback,
  decryptSecret,
  type Env,
  requireEncryptionKey,
} from "@audit/lib";
import type { ProviderSettings, StoredProviderSettings } from "@audit/domain";

export type SettingsDeps = {
  repo: { get(): Promise<StoredProviderSettings | null> };
  env: Env;
  decrypt: (blob: string) => string;
};

export function buildDecryptor(
  encryptionKey: string,
): (blob: string) => string {
  if (encryptionKey.trim().length === 0) {
    return () => {
      throw new Error("SETTINGS_ENCRYPTION_KEY is required to read stored keys");
    };
  }
  const key = requireEncryptionKey({
    SETTINGS_ENCRYPTION_KEY: encryptionKey,
  });
  return (blob: string) => decryptSecret(blob, key);
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
```

- [ ] **Step 4: Run the loader test to verify it passes**

Run: `bun test apps/worker/src/settings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewire the worker entrypoint**

Replace `apps/worker/src/index.ts` with:

```ts
import {
  createAppSettingsRepository,
  createClinicalRecordRepository,
  createDocumentPageRepository,
  createDocumentRepository,
  getDb,
} from "@audit/db";
import { createLlmProvider } from "@audit/ai";
import { createOcrProviders, renderPdfPages } from "@audit/documents";
import { getEnv, PgBossQueue, S3Storage } from "@audit/lib";
import { createExtractDocument } from "./pipeline/extract-document.ts";
import {
  createProcessDocument,
  type ProcessingLogger,
} from "./pipeline/process-document.ts";
import { createTranscribePage } from "./pipeline/transcribe-page.ts";
import {
  buildDecryptor,
  createSettingsCache,
  loadEffectiveSettings,
} from "./settings.ts";

const logger: ProcessingLogger = {
  info: (event) => {
    process.stdout.write(`${JSON.stringify({ level: "info", ...event })}\n`);
  },
  error: (event) => {
    process.stdout.write(`${JSON.stringify({ level: "error", ...event })}\n`);
  },
};

async function main(): Promise<void> {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const storage = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });

  const settingsRepo = createAppSettingsRepository(db);
  const decrypt = buildDecryptor(env.SETTINGS_ENCRYPTION_KEY);
  const settingsCache = createSettingsCache(
    () => loadEffectiveSettings({ repo: settingsRepo, env, decrypt }),
    10_000,
  );

  const documents = createDocumentRepository(db);
  const pages = createDocumentPageRepository(db);
  const clinicalRecords = createClinicalRecordRepository(db);

  const queue = new PgBossQueue({ connectionString: env.DATABASE_URL });
  await queue.start();
  await queue.handle(async (job) => {
    logger.info({
      event: "job_received",
      kind: job.kind,
      documentId: job.documentId,
    });
    const settings = await settingsCache.get();
    const sessionId = `document:${job.documentId}`;
    const provider = createLlmProvider(settings, { sessionId });
    const { ocr, handwrittenOcr } = createOcrProviders(settings, { sessionId });

    switch (job.kind) {
      case "process-document":
        await createProcessDocument({
          documents,
          pages,
          storage,
          render: renderPdfPages,
          ocr,
          handwrittenOcr,
          provider,
          clinicalRecords,
          logger,
        })({ documentId: job.documentId });
        break;
      case "transcribe-page":
        await createTranscribePage({
          pages,
          storage,
          ocr,
          handwrittenOcr,
          logger,
        })({ documentId: job.documentId, pageNumber: job.pageNumber });
        break;
      case "extract-document":
        await createExtractDocument({
          documents,
          pages,
          provider,
          clinicalRecords,
          logger,
        })({ documentId: job.documentId });
        break;
    }
  });
  process.stdout.write(`${JSON.stringify({ event: "worker_ready" })}\n`);
}

await main();
```

Confirm the exact parameter shapes of `createProcessDocument`, `createTranscribePage`, and `createExtractDocument` by reading their definitions in `apps/worker/src/pipeline/`; adjust the call arguments if a dep is optional or required differently. The provider/OCR deps are the only ones that changed from boot-time to per-job.

- [ ] **Step 6: Remove the old worker provider module and its tests**

Run:

```bash
git rm apps/worker/src/providers.ts apps/worker/src/providers.test.ts
```

The LLM factory tests now live in `packages/ai/src/providers/factory.test.ts`; the OCR factory tests in `packages/documents/src/ocr/factory.test.ts`.

- [ ] **Step 7: Typecheck the worker and run its tests**

Run: `bun run --cwd apps/worker typecheck && bun test apps/worker`
Expected: no type errors; worker tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/settings.ts apps/worker/src/settings.test.ts apps/worker/src/index.ts
git commit -m "feat(settings): resolve providers per job from stored settings"
```

---

### Task 8: Web settings service, view helpers, action, and i18n

**Files:**
- Create: `apps/web/lib/settings-view.ts`
- Create: `apps/web/lib/settings-view.test.ts`
- Create: `apps/web/lib/settings-service.ts`
- Create: `apps/web/lib/settings-service.test.ts`
- Create: `apps/web/lib/provider-settings.ts`
- Modify: `apps/web/lib/container.ts`
- Modify: `apps/web/lib/actions.ts`
- Modify: `packages/lib/src/i18n/es.ts`
- Modify: `packages/lib/src/i18n/es.test.ts` (create if absent)

**Interfaces:**
- Consumes: `ProviderKey`, `AI_PROVIDER_KEYS`, `LLM_PROVIDERS`, `OCR_PROVIDERS`, `type ProviderSettings`, `type StoredProviderSettings` from `@audit/domain`; `PROVIDER_MODELS`, `type Env`, `getEnv`, `errors`, `settings` copy from `@audit/lib`; `createAppSettingsRepository` from `@audit/db`.
- Produces: `SettingsInput`, `SettingsView`, `validateSettingsInput`, `describeSettingsView` from `apps/web/lib/settings-view.ts`; `saveSettings(deps, input)` from `apps/web/lib/settings-service.ts`; `getSettingsView()` from `apps/web/lib/provider-settings.ts`; `saveAiSettings` server action.

- [ ] **Step 1: Add the Spanish copy**

In `packages/lib/src/i18n/es.ts`, add `settings` and extend `errors`:

```ts
export const settings = {
  title: "Configuración de IA",
  description:
    "Elegí el proveedor y modelo para extracción y OCR, y guardá tus claves de API.",
  llmSection: "Extracción (LLM)",
  ocrSection: "OCR / transcripción",
  provider: "Proveedor",
  model: "Modelo",
  keysSection: "Claves de API",
  keyOpenai: "OpenAI",
  keyDeepseek: "DeepSeek",
  keyQwen: "Qwen (DashScope)",
  keyOpencode: "OpenCode Go",
  configured: "Configurada",
  keyPlaceholder: "Pegá la clave para reemplazarla",
  clearKey: "Borrar clave",
  save: "Guardar",
  saving: "Guardando…",
  saved: "Configuración guardada. Se aplica al próximo procesamiento.",
  goWarning:
    "OpenCode Go está pensado para agentes de programación, no para pipelines de documentos médicos. El tráfico se monitorea por abuso y puede ser limitado.",
  goRetention:
    "La retención de datos varía por modelo de Go; algunos retienen hasta 30 días. No envíes datos que no debas exponer.",
  noEncryptionKey:
    "Falta SETTINGS_ENCRYPTION_KEY en el entorno: no se pueden guardar claves.",
  invalidProvider: "Proveedor no válido.",
  invalidModel: "El modelo no corresponde al proveedor seleccionado.",
  saveFailed: "No se pudo guardar la configuración.",
} as const;
```

Add to the `errors` object:

```ts
  settingsNoEncryptionKey:
    "Falta SETTINGS_ENCRYPTION_KEY en el entorno: no se pueden guardar claves.",
  settingsInvalidProvider: "Proveedor no válido.",
  settingsInvalidModel: "El modelo no corresponde al proveedor seleccionado.",
  settingsSaveFailed: "No se pudo guardar la configuración.",
```

- [ ] **Step 2: Write the failing view/service tests**

Create `apps/web/lib/settings-view.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { errors } from "@audit/lib";
import { validateSettingsInput } from "./settings-view.ts";

const BASE = {
  llmProvider: "opencode",
  llmModel: "deepseek-v4.1-flash",
  ocrProvider: "opencode",
  ocrModel: "deepseek-v4-flash-vision-exp",
  keys: {},
};

describe("validateSettingsInput", () => {
  test("accepts a valid opencode selection", () => {
    expect(validateSettingsInput(BASE).ok).toBe(true);
  });

  test("accepts heuristic without a model check", () => {
    const result = validateSettingsInput({
      ...BASE,
      llmProvider: "heuristic",
      llmModel: "anything",
    });
    expect(result.ok).toBe(true);
  });

  test("accepts local OCR without a model check", () => {
    const result = validateSettingsInput({
      ...BASE,
      ocrProvider: "local",
      ocrModel: "anything",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects an unknown provider", () => {
    const result = validateSettingsInput({ ...BASE, llmProvider: "bogus" });
    expect(result).toEqual({ ok: false, error: errors.settingsInvalidProvider });
  });

  test("rejects a model that does not belong to the provider", () => {
    const result = validateSettingsInput({
      ...BASE,
      llmProvider: "openai",
      llmModel: "deepseek-v4.1-flash",
    });
    expect(result).toEqual({ ok: false, error: errors.settingsInvalidModel });
  });
});
```

Create `apps/web/lib/settings-service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ProviderKey } from "@audit/domain";
import type { SaveSettingsResult } from "./settings-service.ts";
import { saveSettings } from "./settings-service.ts";

type UpsertInput = {
  llmProvider: string;
  llmModel: string;
  ocrProvider: string;
  ocrModel: string;
  encryptedKeys: Partial<Record<ProviderKey, string | null>>;
};

function makeDeps() {
  const calls: UpsertInput[] = [];
  const deps = {
    appSettings: {
      upsert: async (input: UpsertInput) => {
        calls.push(input);
      },
    },
    encrypt: (value: string) => `enc:${value}`,
  };
  return { deps, calls };
}

const VALID = {
  llmProvider: "opencode",
  llmModel: "deepseek-v4.1-flash",
  ocrProvider: "opencode",
  ocrModel: "deepseek-v4-flash-vision-exp",
};

describe("saveSettings", () => {
  test("encrypts provided keys and upserts", async () => {
    const { deps, calls } = makeDeps();
    const result: SaveSettingsResult = await saveSettings(deps, {
      ...VALID,
      keys: { opencode: "go-test", openai: "  sk  " },
    });
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.encryptedKeys).toEqual({
      opencode: "enc:go-test",
      openai: "enc:sk",
    });
  });

  test("clears a key when requested", async () => {
    const { deps, calls } = makeDeps();
    await saveSettings(deps, { ...VALID, keys: {}, clearKeys: ["openai"] });
    expect(calls[0]?.encryptedKeys).toEqual({ openai: null });
  });

  test("rejects an invalid model without writing", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveSettings(deps, {
      ...VALID,
      llmProvider: "openai",
      llmModel: "deepseek-v4.1-flash",
      keys: {},
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test apps/web/lib/settings-view.test.ts apps/web/lib/settings-service.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement the view helpers**

Create `apps/web/lib/settings-view.ts`:

```ts
import {
  AI_PROVIDER_KEYS,
  LLM_PROVIDERS,
  OCR_PROVIDERS,
  type ProviderKey,
  type StoredProviderSettings,
} from "@audit/domain";
import { errors, type Env, PROVIDER_MODELS } from "@audit/lib";

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
  return {
    llmProvider: stored?.llmProvider ?? env.LLM_PROVIDER,
    llmModel: stored?.llmModel ?? env.LLM_MODEL,
    ocrProvider: stored?.ocrProvider ?? env.OCR_PROVIDER,
    ocrModel: stored?.ocrModel ?? env.OCR_MODEL,
    configuredKeys,
    encryptionKeyPresent: env.SETTINGS_ENCRYPTION_KEY.trim().length > 0,
  };
}
```

- [ ] **Step 5: Implement the service**

Create `apps/web/lib/settings-service.ts`:

```ts
import { AI_PROVIDER_KEYS, type ProviderKey } from "@audit/domain";
import { validateSettingsInput, type SettingsInput } from "./settings-view.ts";

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
```

- [ ] **Step 6: Run the view/service tests to verify they pass**

Run: `bun test apps/web/lib/settings-view.test.ts apps/web/lib/settings-service.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Implement the server view loader**

Create `apps/web/lib/provider-settings.ts`:

```ts
import { getEnv } from "@audit/lib";
import { getContainer } from "./container.ts";
import { describeSettingsView, type SettingsView } from "./settings-view.ts";

export async function getSettingsView(): Promise<SettingsView> {
  const env = getEnv();
  const stored = await getContainer().appSettings.get();
  return describeSettingsView(stored, env);
}
```

- [ ] **Step 8: Add the repository to the container**

In `apps/web/lib/container.ts`, import `createAppSettingsRepository` from `@audit/db` and add it to the `Container` type and the cached object:

```ts
import {
  createAppSettingsRepository,
  // ...existing imports...
} from "@audit/db";
```

Add to the `Container` type:

```ts
  appSettings: ReturnType<typeof createAppSettingsRepository>;
```

Add inside the `cached = { ... }` object:

```ts
      appSettings: createAppSettingsRepository(db),
```

- [ ] **Step 9: Add the server action**

In `apps/web/lib/actions.ts`, add imports and the action:

```ts
import {
  encryptSecret,
  errors,
  getEnv,
  requireEncryptionKey,
} from "@audit/lib";
import { saveSettings, type SaveSettingsResult } from "./settings-service.ts";
import type { SettingsInput } from "./settings-view.ts";
```

```ts
export async function saveAiSettings(
  input: SettingsInput,
): Promise<SaveSettingsResult> {
  let encrypt: (plaintext: string) => string;
  try {
    const key = requireEncryptionKey(getEnv());
    encrypt = (plaintext) => encryptSecret(plaintext, key);
  } catch {
    return { ok: false, error: errors.settingsNoEncryptionKey };
  }
  try {
    const result = await saveSettings(
      { appSettings: getContainer().appSettings, encrypt },
      input,
    );
    if (result.ok) revalidatePath("/settings");
    return result;
  } catch {
    return { ok: false, error: errors.settingsSaveFailed };
  }
}
```

`errors` and `revalidatePath` may already be imported at the top of `actions.ts`; merge imports rather than duplicating. Because `actions.ts` starts with `"use server"`, every export must be an async function; the `SettingsInput` and `SaveSettingsResult` imports are types only, which is fine.

- [ ] **Step 10: Typecheck the web app**

Run: `bun run --cwd apps/web typecheck`
Expected: no type errors. (If `next typegen` is required first and fails, run `bun run --cwd apps/web typecheck` again; consult `apps/web/node_modules/next/dist/docs/` if the action signature is rejected.)

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/settings-view.ts apps/web/lib/settings-view.test.ts apps/web/lib/settings-service.ts apps/web/lib/settings-service.test.ts apps/web/lib/provider-settings.ts apps/web/lib/container.ts apps/web/lib/actions.ts packages/lib/src/i18n/es.ts packages/lib/src/i18n/es.test.ts
git commit -m "feat(settings): add settings service, action and copy"
```

---

### Task 9: Settings page and form

**Files:**
- Create: `apps/web/app/settings/page.tsx`
- Create: `apps/web/components/settings-form.tsx`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/lib/settings-options.ts`
- Create: `apps/web/lib/settings-options.test.ts`

**Interfaces:**
- Consumes: `getSettingsView` from `apps/web/lib/provider-settings.ts`; `saveAiSettings` from `apps/web/lib/actions.ts`; `PROVIDER_MODELS` from `@audit/lib`; `settings` copy from `@audit/lib/i18n`.
- Produces: pure `buildProviderModels(): Record<string, string[]>` and `buildOcrProviderOptions(): string[]` from `apps/web/lib/settings-options.ts`.

- [ ] **Step 1: Write the failing options test**

Create `apps/web/lib/settings-options.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildOcrProviderOptions, buildProviderModels } from "./settings-options.ts";

describe("settings options", () => {
  test("includes the opencode model catalog", () => {
    const models = buildProviderModels();
    expect(models.opencode).toContain("deepseek-v4.1-flash");
    expect(models.opencode).not.toContain("glm-5.2");
  });

  test("lists OCR providers including local and tesseract", () => {
    const options = buildOcrProviderOptions();
    expect(options).toContain("local");
    expect(options).toContain("tesseract");
    expect(options).toContain("opencode");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/web/lib/settings-options.test.ts`
Expected: FAIL — cannot resolve `./settings-options.ts`.

- [ ] **Step 3: Implement the options helpers**

Create `apps/web/lib/settings-options.ts`:

```ts
import { LLM_PROVIDERS, OCR_PROVIDERS } from "@audit/domain";
import { PROVIDER_MODELS } from "@audit/lib";

export function buildProviderModels(): Record<string, string[]> {
  return {
    openai: [...PROVIDER_MODELS.openai],
    deepseek: [...PROVIDER_MODELS.deepseek],
    qwen: [...PROVIDER_MODELS.qwen],
    opencode: [...PROVIDER_MODELS.opencode],
  };
}

export function buildLlmProviderOptions(): string[] {
  return [...LLM_PROVIDERS];
}

export function buildOcrProviderOptions(): string[] {
  return [...OCR_PROVIDERS];
}
```

- [ ] **Step 4: Run the options test to verify it passes**

Run: `bun test apps/web/lib/settings-options.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the server page**

Create `apps/web/app/settings/page.tsx`:

```tsx
import { settings } from "@audit/lib/i18n";
import Link from "next/link";
import { SettingsForm } from "../../components/settings-form.tsx";
import { getSettingsView } from "../../lib/provider-settings.ts";
import {
  buildLlmProviderOptions,
  buildOcrProviderOptions,
  buildProviderModels,
} from "../../lib/settings-options.ts";

export default async function SettingsPage() {
  const view = await getSettingsView();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-8 sm:px-4">
      <div className="flex flex-col gap-1">
        <Link
          className="text-sm text-muted-foreground transition-colors hover:text-brand"
          href="/"
        >
          ← {settings.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{settings.title}</h1>
        <p className="text-sm text-muted-foreground">{settings.description}</p>
      </div>
      <SettingsForm
        initial={view}
        providerModels={buildProviderModels()}
        llmProviders={buildLlmProviderOptions()}
        ocrProviders={buildOcrProviderOptions()}
      />
    </main>
  );
}
```

- [ ] **Step 6: Create the client form**

Create `apps/web/components/settings-form.tsx`:

```tsx
"use client";

import { settings } from "@audit/lib/i18n";
import { type FormEvent, useState } from "react";
import { saveAiSettings } from "../lib/actions.ts";
import type { SettingsView } from "../lib/settings-view.ts";
import { Button } from "./ui/button.tsx";
import { Callout } from "./ui/callout.tsx";
import { Card } from "./ui/card.tsx";

type KeyField = "openai" | "deepseek" | "qwen" | "opencode";

const KEY_LABELS: Record<KeyField, string> = {
  openai: settings.keyOpenai,
  deepseek: settings.keyDeepseek,
  qwen: settings.keyQwen,
  opencode: settings.keyOpencode,
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function SettingsForm({
  initial,
  providerModels,
  llmProviders,
  ocrProviders,
}: {
  initial: SettingsView;
  providerModels: Record<string, string[]>;
  llmProviders: string[];
  ocrProviders: string[];
}) {
  const [llmProvider, setLlmProvider] = useState(initial.llmProvider);
  const [llmModel, setLlmModel] = useState(initial.llmModel);
  const [ocrProvider, setOcrProvider] = useState(initial.ocrProvider);
  const [ocrModel, setOcrModel] = useState(initial.ocrModel);
  const [keys, setKeys] = useState<Record<KeyField, string>>({
    openai: "",
    deepseek: "",
    qwen: "",
    opencode: "",
  });
  const [clearKeys, setClearKeys] = useState<KeyField[]>([]);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const llmModels = llmProvider === "heuristic" ? [] : providerModels[llmProvider] ?? [];
  const ocrModelKey = ocrProvider === "tesseract" ? "openai" : ocrProvider;
  const ocrModels =
    ocrProvider === "local" ? [] : providerModels[ocrModelKey] ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "saving" });
    const result = await saveAiSettings({
      llmProvider,
      llmModel,
      ocrProvider,
      ocrModel,
      keys,
      clearKeys,
    });
    if (!result.ok) {
      setState({ kind: "error", message: result.error });
      return;
    }
    setState({ kind: "saved" });
    setKeys({ openai: "", deepseek: "", qwen: "", opencode: "" });
    setClearKeys([]);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {state.kind === "error" ? (
        <Callout tone="danger" role="alert">
          <p>{state.message}</p>
        </Callout>
      ) : null}
      {state.kind === "saved" ? (
        <Callout tone="success" role="status">
          <p>{settings.saved}</p>
        </Callout>
      ) : null}

      <Callout tone="warning">
        <p>{settings.goWarning}</p>
        <p>{settings.goRetention}</p>
      </Callout>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{settings.llmSection}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{settings.provider}</span>
          <select
            className="h-10 rounded-md border border-border bg-surface px-3"
            value={llmProvider}
            onChange={(event) => {
              const next = event.target.value;
              setLlmProvider(next);
              const models = next === "heuristic" ? [] : providerModels[next] ?? [];
              setLlmModel(models[0] ?? "");
            }}
          >
            {llmProviders.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        {llmModels.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{settings.model}</span>
            <select
              className="h-10 rounded-md border border-border bg-surface px-3"
              value={llmModel}
              onChange={(event) => setLlmModel(event.target.value)}
            >
              {llmModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{settings.ocrSection}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{settings.provider}</span>
          <select
            className="h-10 rounded-md border border-border bg-surface px-3"
            value={ocrProvider}
            onChange={(event) => {
              const next = event.target.value;
              setOcrProvider(next);
              const key = next === "tesseract" ? "openai" : next;
              const models = next === "local" ? [] : providerModels[key] ?? [];
              setOcrModel(models[0] ?? "");
            }}
          >
            {ocrProviders.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        {ocrModels.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{settings.model}</span>
            <select
              className="h-10 rounded-md border border-border bg-surface px-3"
              value={ocrModel}
              onChange={(event) => setOcrModel(event.target.value)}
            >
              {ocrModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{settings.keysSection}</h2>
        {!initial.encryptionKeyPresent ? (
          <Callout tone="danger">
            <p>{settings.noEncryptionKey}</p>
          </Callout>
        ) : null}
        {(Object.keys(KEY_LABELS) as KeyField[]).map((provider) => (
          <label key={provider} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {KEY_LABELS[provider]}
              {initial.configuredKeys[provider] ? ` · ${settings.configured}` : ""}
            </span>
            <input
              className="h-10 rounded-md border border-border bg-surface px-3"
              type="password"
              autoComplete="off"
              placeholder={settings.keyPlaceholder}
              value={keys[provider]}
              onChange={(event) =>
                setKeys((prev) => ({ ...prev, [provider]: event.target.value }))
              }
            />
            {initial.configuredKeys[provider] ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearKeys.includes(provider)}
                  onChange={(event) =>
                    setClearKeys((prev) =>
                      event.target.checked
                        ? [...prev, provider]
                        : prev.filter((item) => item !== provider),
                    )
                  }
                />
                {settings.clearKey}
              </span>
            ) : null}
          </label>
        ))}
      </Card>

      <Button type="submit" variant="primary" disabled={state.kind === "saving"}>
        {state.kind === "saving" ? settings.saving : settings.save}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Link to settings from the header**

In `apps/web/app/layout.tsx`, import `settings` from `@audit/lib/i18n` and add a link next to the theme toggle:

```tsx
            <div className="ml-auto flex items-center gap-3">
              <Link
                className="text-sm text-muted-foreground transition-colors hover:text-brand"
                href="/settings"
              >
                {settings.title}
              </Link>
              <ThemeToggle />
            </div>
```

- [ ] **Step 8: Typecheck, lint, and build the web app**

Run: `bun run --cwd apps/web typecheck && bun run --cwd apps/web lint`
Expected: no errors. Then run `bun run --cwd apps/web build` to confirm the route compiles.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/settings/page.tsx apps/web/components/settings-form.tsx apps/web/app/layout.tsx apps/web/lib/settings-options.ts apps/web/lib/settings-options.test.ts
git commit -m "feat(settings): add AI provider settings page"
```

---

### Task 10: Environment docs, compose passthrough, and end-to-end verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docker/compose.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: documented `OPENCODE_API_KEY` and `SETTINGS_ENCRYPTION_KEY`; worker compose passing `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `OPENCODE_API_KEY`, and `SETTINGS_ENCRYPTION_KEY`.

- [ ] **Step 1: Update `.env.example`**

Add after the existing provider key block:

```bash
# OpenCode Go subscription (https://opencode.ai/auth). OpenAI-compatible endpoint:
# https://opencode.ai/zen/go/v1. Intended primary provider; see README note.
OPENCODE_API_KEY=

# 32-byte key (base64 or 64-char hex) that encrypts API keys stored from /settings.
# Generate one with: openssl rand -base64 32
SETTINGS_ENCRYPTION_KEY=
```

Add to the "Required for the matching provider" comment block:

```bash
# OPENCODE_API_KEY  -> LLM_PROVIDER=opencode or OCR_PROVIDER=opencode
```

- [ ] **Step 2: Pass the variables to the worker in compose**

In `docker/compose.yaml`, under the `worker` service `environment`, add:

```yaml
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
      DASHSCOPE_API_KEY: ${DASHSCOPE_API_KEY:-}
      OPENCODE_API_KEY: ${OPENCODE_API_KEY:-}
      SETTINGS_ENCRYPTION_KEY: ${SETTINGS_ENCRYPTION_KEY:-}
```

- [ ] **Step 3: Update the README**

In `README.md`:

- Add `OPENCODE_API_KEY` and `SETTINGS_ENCRYPTION_KEY` rows to the environment-variable table.
- Add a short "Configuración de IA" subsection: the app reads provider settings from `/settings`; stored keys are AES-256-GCM encrypted in Postgres; changes apply on the next job; `SETTINGS_ENCRYPTION_KEY` is required to save keys (`openssl rand -base64 32`).
- Add a warning: OpenCode Go is intended for coding agents; this pipeline's traffic may be monitored/limited, and per-model retention varies.
- Note that the settings page has no authentication and relies on the tailnet being trusted.

- [ ] **Step 4: Run the full verification gate**

Run: `bun run lint && bun run typecheck && bun run test`
Expected: all pass.

- [ ] **Step 5: Manual end-to-end check**

1. Set `SETTINGS_ENCRYPTION_KEY` and `OPENCODE_API_KEY` in `.env`; run `set -a; source .env; set +a`.
2. Start Postgres/MinIO and apply migrations: `docker compose --env-file .env -f docker/compose.yaml up -d --build`.
3. Start the web app: `bun run --cwd apps/web build && bun run --cwd apps/web start -- -H 0.0.0.0 -p 3000`.
4. Open `/settings`, choose LLM `opencode` / `deepseek-v4.1-flash` and OCR `opencode` / `deepseek-v4-flash-vision-exp`, paste the Go key, save. Confirm the success callout and that the key field now shows "Configurada".
5. Upload `auditoria-ejemplo.pdf` and confirm processing completes with Go (check worker logs for `job_received` with `kind: "process-document"` and no `MissingProviderKeyError`).
6. Verify the stored key is not readable through any endpoint: `curl -s localhost:3000/settings` must not contain the key value.
7. Confirm only ids/states appear in worker/web logs (no key material, no clinical text).

- [ ] **Step 6: Commit**

```bash
git add .env.example README.md docker/compose.yaml
git commit -m "docs(settings): document OpenCode Go and encryption key"
```

---

## Self-Review

**Spec coverage:**
- §3 decisions (Postgres singleton, next-job effect, AES-256-GCM, no auth, Go primary, existing providers, no Anthropic) → Tasks 1, 3, 4, 5, 6, 7, 8, 9.
- §4.1 catalog + §4.2 key fields + §4.3 headers → Tasks 1, 5, 6.
- §5.1 crypto → Task 2; §5.2 env → Task 1; §5.3 data model → Task 4; §5.4 factory + merge → Tasks 3, 5, 6; §5.5 worker per-job cache → Task 7.
- §6 server action (no read endpoint) → Task 8; §7 UI → Task 9; §8 risks (Go policy + retention callout, vision manual check, PHI note, no auth) → Tasks 9, 10 and the manual step in Task 10; §9 testing → distributed across tasks; §10 files → all tasks; §11 follow-ups → not implemented (correct).
- Note: the spec placed `ProviderSettings` in the ai factory and had the worker move both factories into `@audit/ai`. To respect the dependency rules (ai must not depend on documents; lib must not depend on db), the plan places shared types in `@audit/domain`, the LLM factory in `@audit/ai`, and the OCR factory in `@audit/documents`. Behavior is unchanged.

**Placeholder scan:** No TBD/TODO. Every code step contains complete code. Tasks 6 and 7 include a "read the file and adjust names if they differ" note where the exact private interface was not fully inspected; the required names are given.

**Type consistency:** `ProviderSettings`/`ProviderKey`/`StoredProviderSettings` are defined once in `@audit/domain` and reused. `resolveLlmConfig`/`createLlmProvider` and `resolveOcrVisionConfig`/`createOcrProviders` keep the same names and shapes across Tasks 5–7. `saveSettings` (service) vs `saveAiSettings` (action) are consistently distinguished. `encryptedKeys` uses `string | null | undefined` semantics consistently (null = clear, undefined = unchanged).
