# AI Provider Settings — Design

Date: 2026-09-20
Source context: `MEDICAL_AUDIT_AI_MVP_SPEC.md`, `docs/superpowers/specs/2026-09-20-document-chat-design.md` §4.3 (shared provider factory)
Status: Approved design (pre-implementation plan)
Depends on: nothing implemented; builds on the existing env-driven provider resolution in `apps/worker/src/providers.ts` and `packages/lib/src/env.ts`

## 1. Purpose

Today the AI provider (LLM and OCR) is chosen only from environment variables and is
resolved once at worker boot (`apps/worker/src/index.ts:27-36`). There is no way to
change providers, models, or keys without editing `.env` and restarting the worker.

This work adds a `/settings` page where a self-hoster can choose the LLM provider and
model, choose the OCR provider and model, and store API keys. Keys are encrypted at
rest in Postgres and never returned to the browser. The setting takes effect on the
next processed page/document without a worker restart.

The motivating goal is to use an **OpenCode Go subscription** ($10/month flat) as the
primary provider instead of paying per token, while keeping the existing
OpenAI/DeepSeek/Qwen API-key providers and the offline `heuristic`/`local` providers
selectable.

## 2. Feasibility findings (verified 2026-09-20)

- **OpenCode Go is usable programmatically.** It exposes an OpenAI-compatible
  endpoint at `https://opencode.ai/zen/go/v1` and is BYOK: any client that supports a
  custom OpenAI-compatible base URL can use it. The existing `OpenAIProvider`
  (`packages/ai/src/providers/openai/openai-provider.ts`) already accepts `baseURL` +
  `apiKey`, so Go needs no new adapter — only a new catalog entry and headers.
- **No `go/v2` exists.** `opencode.ai/v2` is the docs-site version, not an API
  version. The API path remains `https://opencode.ai/zen/go/v1` (OpenAI-compatible
  `POST /chat/completions`).
- **Claude Pro/Max subscriptions cannot be used.** Anthropic's Feb 2026 terms
  explicitly prohibit Free/Pro/Max OAuth tokens in third-party tools and the Agent
  SDK, and the policy is enforced. Claude is out of scope; only an Anthropic API key
  would work, and that is deferred (see §11).

## 3. Confirmed decisions

Decided with the project owner during brainstorming:

| Question | Decision |
|---|---|
| Where settings live | **Postgres**, one singleton row. |
| When changes apply | **Next job**, no worker restart (Approach A). |
| Secrets | **AES-256-GCM encrypted at rest**; write-only from the UI (never returned to the browser). |
| Access control | **No app auth.** Relies on the tailnet being trusted; the encryption key lives in `.env`. A future slice adds auth. |
| Subscription provider | **OpenCode Go is the intended primary provider** for LLM and OCR. |
| Other providers | Existing `openai`, `deepseek`, `qwen` API-key providers and `heuristic`/`tesseract`/`local` remain selectable. |
| Anthropic / Claude | **Out of scope** for now. |
| Config surface | A `/settings` page using a **server action**; no secret-bearing read endpoint. |

## 4. Provider catalog and routing facts

### 4.1 `PROVIDER_MODELS` (additions/corrections)

`packages/lib/src/env.ts` gains an `opencode` provider. Current lists:

```ts
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
```

Only OpenCode Go's `chat/completions` models are listed, and within each family only
the newest line, to keep the selector free of superseded models:

- **DeepSeek:** `deepseek-v4.1-flash` (newest). `deepseek-v4-flash` (retired) and
  `deepseek-v4-pro` (previous generation, being phased out) are dropped.
  `deepseek-v4-flash-vision-exp` is kept because it is the only vision option on Go,
  so it is required for OCR.
- **GLM:** `glm-5.3` (newest) and its `glm-5.3-flash` tier; `glm-5.2`/`glm-5.1` dropped.
- **Kimi:** `kimi-k3`; `kimi-k2.7-code`/`kimi-k2.6` dropped.
- **LongCat:** `longcat-2.0` (only one).
- **MiMo:** `mimo-v2.5` and `mimo-v2.5-pro` (same generation, different tier).
- **Hy:** `hy4-preview` (newest); `hy3` dropped.

Go also serves `grok-4.6`, `gpt-5.6-luna`, the `muse-spark-*` models via `/responses`,
and Qwen/MiniMax via `/messages`; those are **not** reachable through the OpenAI
`chat.completions` client and are deliberately excluded so the UI never offers a
broken choice.

- DeepSeek direct uses the name `deepseek-flash` (runs DeepSeek-V4.1-Flash, vision
  supported). OpenCode Go uses `deepseek-v4.1-flash` (with a dot). They are different
  ids for the same model family.
- The only vision model on Go is `deepseek-v4-flash-vision-exp`, so it is the OCR
  model when `OCR_PROVIDER=opencode`.

### 4.2 Provider key fields

```ts
const KEY_FIELD = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
  opencode: "OPENCODE_API_KEY",
} as const satisfies Record<Provider, string>;
```

### 4.3 Client headers (OpenCode Go)

Go's docs require clients to identify with their own user agent and send a stable
session id in `x-opencode-session`. `OpenAIProvider` gains an optional
`defaultHeaders?: Record<string, string>` passed to the OpenAI client. For `opencode`
the factory sets:

- `User-Agent: auditoria-medica-ai/1.0` (honest identification, not a spoofed
  coding-agent name)
- `x-opencode-session: <sessionId>`, where `sessionId` defaults to a per-provider
  instance UUID and can be overridden per job with `document:<documentId>`

## 5. Architecture

```
/settings (server component) ──reads effective config (booleans, no secrets)──► settings-form (client)
        │ saveAiSettings (server action)                                              │
        ▼                                                                             │
packages/lib crypto (AES-256-GCM)  ◄── encrypt provided keys                          │
        │                                                                             │
        ▼                                                                             │
packages/db app_settings repository (singleton row, encrypted columns)                │
        │                                                                             │
        ├── web/worker settings loader: read row ─ decrypt ─ merge over env ──────────┘
        │
        ▼
@audit/ai factory: ProviderSettings ──► LLMProvider / OCRProvider
```

### 5.1 `packages/lib` — secrets helper

New `packages/lib/src/crypto/secrets.ts` (exported from `packages/lib/src/index.ts`):

```ts
export function requireEncryptionKey(source?: Record<string, string | undefined>): Buffer; // reads SETTINGS_ENCRYPTION_KEY
export function encryptSecret(plaintext: string, key: Buffer): string; // "v1:<ivB64>:<tagB64>:<cipherB64>"
export function decryptSecret(blob: string, key: Buffer): string;      // throws on malformed/tampered input
```

- AES-256-GCM, 12-byte random IV, 16-byte auth tag, key = 32 bytes decoded from
  `SETTINGS_ENCRYPTION_KEY` (base64 or hex).
- `decryptSecret` rejects unknown versions and authentication failures; it never
  logs plaintext or the key.

### 5.2 `packages/lib/src/env.ts` changes

- Add `OPENCODE_API_KEY: z.string().default("")`.
- Add `SETTINGS_ENCRYPTION_KEY: z.string().default("")`.
- Add `opencode` to the provider enum and `KEY_FIELD`.
- **Relax key requirements.** The current `superRefine` fails parsing when the
  selected provider's key is empty. Because a key may now come from the database
  instead of the environment, that check moves to provider resolution (§5.4). The
  model/provider consistency checks stay in `env.ts`.
- Keep `LLM_PROVIDER`/`OCR_PROVIDER`/`LLM_MODEL`/`OCR_MODEL` and their defaults: when
  no settings row exists, behavior is identical to today (env is the fallback).

### 5.3 Settings data model — `packages/db`

New table in `packages/db/src/schema.ts` (with a generated Drizzle migration under
`packages/db/drizzle/`):

```ts
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),        // singleton row, always id = 1
  llmProvider: text("llm_provider").notNull(),
  llmModel: text("llm_model").notNull(),
  ocrProvider: text("ocr_provider").notNull(),
  ocrModel: text("ocr_model").notNull(),
  openaiApiKeyEnc: text("openai_api_key_enc"),
  deepseekApiKeyEnc: text("deepseek_api_key_enc"),
  dashscopeApiKeyEnc: text("dashscope_api_key_enc"),
  opencodeApiKeyEnc: text("opencode_api_key_enc"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Repository `packages/db/src/repositories/app-settings.ts`:

```ts
export type StoredAppSettings = {
  llmProvider: string; llmModel: string;
  ocrProvider: string; ocrModel: string;
  encryptedKeys: { openai?: string; deepseek?: string; dashscope?: string; opencode?: string };
  updatedAt: Date;
};

export function createAppSettingsRepository(db: Database): {
  get(): Promise<StoredAppSettings | null>;
  upsert(input: {
    llmProvider: string; llmModel: string;
    ocrProvider: string; ocrModel: string;
    encryptedKeys: Partial<Record<"openai" | "deepseek" | "dashscope" | "opencode", string | null>>;
  }): Promise<void>;
};
```

`upsert` writes the singleton row; a key present with `null` clears it, a key absent
leaves the stored value unchanged. Export the table and repository from
`packages/db/src/index.ts`.

### 5.4 Provider resolution — `packages/ai/src/providers/factory.ts`

Move `resolveLlmConfig`, `createLlmProvider`, `resolveOcrVisionConfig`, and
`createOcrProviders` out of `apps/worker/src/providers.ts` into `@audit/ai` (this also
satisfies the plan in `2026-09-20-document-chat-design.md` §4.3, so the web app can
build providers too). Signatures take a structural settings object, not `Env`:

```ts
export type ProviderKey = "openai" | "deepseek" | "qwen" | "opencode";

export type ProviderSettings = {
  llmProvider: "openai" | "deepseek" | "qwen" | "opencode" | "heuristic";
  llmModel: string;
  ocrProvider: "openai" | "deepseek" | "qwen" | "opencode" | "tesseract" | "local";
  ocrModel: string;
  keys: Record<ProviderKey, string>;
};

export function createLlmProvider(settings: ProviderSettings, opts?: { sessionId?: string }): LLMProvider;
export function createOcrProviders(settings: ProviderSettings, opts?: { sessionId?: string }): OcrProviders;
```

- `opencode` case: `baseURL: "https://opencode.ai/zen/go/v1"`,
  `apiKey: settings.keys.opencode`, `model: settings.llmModel`, Go headers (§4.3).
  No provider-specific `extraBody` (Go fronts several model families; a DeepSeek-only
  `thinking` flag would be rejected by GLM/Kimi). `reasoningEffort` is omitted (`null`)
  for `opencode`.
- Existing `openai`/`deepseek`/`qwen` cases keep their current `baseURL`, `extraBody`,
  and `reasoningEffort`.
- The factory validates that a non-`heuristic`/non-local selection has a non-empty
  key, throwing a typed `MissingProviderKeyError` naming the provider (never the
  value). This replaces the env-level key check.
- `apps/worker/src/providers.ts` becomes a thin re-export/delegation for existing
  callers and tests.

The pure merge lives in `packages/lib/src/settings/effective-settings.ts` (so no
`@audit/ai` ↔ `@audit/lib` coupling); each app has a thin loader that reads the DB row,
wires the decryptor, and calls it:

```ts
// packages/lib/src/settings/effective-settings.ts (pure)
export function applyEnvFallback(
  stored: StoredAppSettings | null,
  env: Env,
  decrypt: (blob: string) => string,
): ProviderSettings;

// apps/worker/src/settings.ts and apps/web/lib/provider-settings.ts (thin wrappers)
export function loadEffectiveSettings(): Promise<ProviderSettings>;
```

Rule: columns from `stored` override env for provider/model; for each key, a stored
encrypted value wins, otherwise fall back to the matching env var. A key is only ever
stored as ciphertext or SQL `NULL` (cleared) — never an empty string. If `stored` has
an encrypted value but `SETTINGS_ENCRYPTION_KEY` is missing or decryption fails, the
loader throws a typed error rather than silently falling back.

### 5.5 Worker per-job resolution — `apps/worker/src/index.ts`

Replace boot-time provider construction with a short-TTL settings cache:

```ts
const settingsCache = createSettingsCache(
  () => loadEffectiveSettings({ repo: appSettings, env, decrypt }),
  10_000, // ms
);
```

The job handler calls `settingsCache.get()` and builds `createLlmProvider(settings,
{ sessionId: `document:${job.documentId}` })` / `createOcrProviders(...)` per job.
A change saved in the UI is therefore picked up within ~10s, i.e. on the next job.
If a stored key cannot be decrypted or a required key is missing, the job fails fast
and logs the provider name and document id only (no key material, no PHI).

## 6. API and server action

No public read endpoint: secrets must never leave the server. The `/settings` server
component reads the stored row and passes only non-secret values to the form.

Server action in `apps/web/lib/actions.ts`:

```ts
export type SaveSettingsResult = { ok: true } | { ok: false; error: string };
export async function saveAiSettings(input: SettingsInput): Promise<SaveSettingsResult>;
```

`SettingsInput`:

```ts
type SettingsInput = {
  llmProvider: string; llmModel: string;
  ocrProvider: string; ocrModel: string;
  keys: Partial<Record<ProviderKey, string>>; // omit/empty = leave unchanged
  clearKeys?: ProviderKey[];                 // explicit removal
};
```

Steps:

1. Validate with Zod: providers in the allowed enums; `llmModel` in
   `PROVIDER_MODELS[llmProvider]` (skipped for `heuristic`); `ocrModel` consistent
   with `ocrProvider` (Go/OpenAI/DeepSeek/Qwen model lists, no model check for
   `local`). Invalid → `{ ok: false, error }` with a Spanish message.
2. Encrypt each provided key with `requireEncryptionKey()`. If the key env var is
   absent, return an actionable error (`settings.noEncryptionKey`).
3. `container.appSettings.upsert(...)`.
4. `revalidatePath("/settings")`.

On success the form shows a confirmation; the change applies on the next job.

## 7. UI

`apps/web/app/settings/page.tsx` (server component) and
`apps/web/components/settings-form.tsx` (`"use client"`).

- The page reads the stored row (or the env fallback) and renders the form with
  provider/model selectors for **LLM** and **OCR**, and key inputs for OpenAI,
  DeepSeek, DashScope/Qwen, and OpenCode Go.
- A key input is a password field. If a key is already configured, show a
  "Configurada" placeholder and allow replacing or clearing it; the actual value is
  never sent to the client.
- When no row exists, the form proposes Go defaults
  (`llmProvider=opencode`, `llmModel=deepseek-v4.1-flash`,
  `ocrProvider=opencode`, `ocrModel=deepseek-v4-flash-vision-exp`) so the user saves
  once to make Go primary.
- OCR provider choices include `local` and `tesseract` (no network / hybrid) and the
  vision-capable hosted providers.
- A `callout` documents the OpenCode Go policy risk (§8.1).
- Reuse `card`, `button`, `callout`, and `section` primitives; Spanish copy from
  `packages/lib/src/i18n/es.ts` (new `settings.*` strings). Add a link from the home
  page.
- Implementation note: this is Next.js 16.3.5 with documented breaking changes. Before
  writing UI code, read `apps/web/node_modules/next/dist/docs/` (per
  `apps/web/AGENTS.md`).

## 8. Risks and manual verification

1. **OpenCode Go usage policy (accepted risk).** Go's docs state it is designed for
   OpenCode and other coding agents, that traffic is monitored for abuse, and that
   clients should send coding-agent-style traffic with their own UA and an
   `x-opencode-session` header. This app is a medical OCR/extraction pipeline, not a
   coding agent. The owner chose to proceed with Go as primary; the spec and the
   settings page must state this risk so it is a conscious choice. Go also enforces
   per-model monthly/weekly/5-hour usage caps.
2. **Vision format on Go (manual verification).** `OpenAIVisionOCRProvider` sends
   images in OpenAI `chat.completions` content format. Verify with a live request that
   `deepseek-v4-flash-vision-exp` accepts it. If not, Go remains the LLM provider and
   OCR falls back to OpenAI/`tesseract`/`local`. This is a manual check; it cannot be
   unit-tested.
3. **PHI and retention.** Go's per-model retention differs (DeepSeek/GLM/Kimi 0-day;
   Grok/Luna 30-day). Sending PHI to a hosted model is an existing property of this
   app; the settings page should note retention alongside the policy callout.
4. **No auth.** Anyone on the tailnet can read the settings page (not the key values)
   and change providers. Accepted for now; auth is a future slice.

## 9. Testing

TDD, `bun test` per workspace; integration tests gated by `TEST_DATABASE_URL` as
elsewhere.

- `packages/lib`:
  - `crypto/secrets.test.ts`: round-trip; wrong key/auth-tag failure; malformed blob
    rejected; unknown version rejected; ciphertext differs across calls (random IV).
  - `env.test.ts`: updated for `opencode`, `OPENCODE_API_KEY`,
    `SETTINGS_ENCRYPTION_KEY`, and relaxed keys (key-presence assertions move to the
    factory tests).
  - `settings/effective-settings.test.ts`: stored values override env; a stored key
    wins over env; a `null`/absent stored key falls back to env; a decryption failure
    throws (no silent fallback).
- `packages/ai`:
  - `providers/factory.test.ts`: `opencode` resolves to `OpenAIProvider` with the Go
    `baseURL` and headers; `heuristic` resolves to `HeuristicLLMProvider`; each hosted
    provider without a key throws `MissingProviderKeyError`; existing
    openai/deepseek/qwen/ocr cases preserved (migrated from
    `apps/worker/src/providers.test.ts`).
  - `openai-provider` test: `defaultHeaders` are forwarded to the client.
- `packages/db`: `repositories/app-settings.test.ts` (gated): `upsert` then `get`
  round-trips; absent key leaves the stored value; `null` clears it.
- `apps/web`: `lib/settings-service.test.ts` (injected deps with a fake encryptor):
  valid save encrypts and upserts; invalid model/provider returns an error and does
  not write; missing encryption key returns the actionable error; clear-key path.
- `packages/lib/src/i18n/es.test.ts`: new `settings.*` strings exist and are
  non-empty.
- Definition of done: `bun run lint`, `bun run typecheck`, `bun run test` pass at the
  repo root. Manual: save OpenCode Go settings and process one document end-to-end.

## 10. Files touched

New:

- `packages/lib/src/crypto/secrets.ts` (+ test)
- `packages/lib/src/settings/effective-settings.ts` (+ test)
- `packages/ai/src/providers/factory.ts` (+ test)
- `packages/db/src/repositories/app-settings.ts` (+ test)
- `packages/db/drizzle/0003_*.sql` (generated)
- `apps/worker/src/settings.ts` (thin loader + TTL cache)
- `apps/web/lib/provider-settings.ts` (thin loader)
- `apps/web/lib/settings-service.ts` (+ test)
- `apps/web/app/settings/page.tsx`
- `apps/web/components/settings-form.tsx`

Modified:

- `packages/lib/src/env.ts` (+ `opencode`, new key vars, relaxed key checks)
- `packages/lib/src/index.ts` (export crypto/settings helpers)
- `packages/lib/src/i18n/es.ts` (+ `settings.*`, + `es.test.ts`)
- `packages/ai/src/providers/openai/openai-provider.ts` (`defaultHeaders`)
- `packages/ai/src/index.ts` (export factory)
- `packages/db/src/schema.ts` (+ `app_settings`)
- `packages/db/src/index.ts` (+ table, repository)
- `apps/worker/src/providers.ts` (delegate to the shared factory)
- `apps/worker/src/index.ts` (per-job settings cache)
- `apps/worker/src/providers.test.ts` (migrated/updated)
- `apps/web/lib/container.ts` (+ `appSettings` repository)
- `apps/web/lib/actions.ts` (+ `saveAiSettings`)
- `apps/web/app/page.tsx` (link to `/settings`)
- `.env.example`, `README.md`, `docker/compose.yaml` (`OPENCODE_API_KEY`,
  `SETTINGS_ENCRYPTION_KEY` passthrough)

## 11. Follow-ups (not in this slice)

- Anthropic API-key provider (for Claude), if wanted.
- App authentication (gating `/settings` and the rest of the UI) — the current
  no-auth posture is the main security gap.
- Key rotation / re-encryption tooling and an audit trail for settings changes.
- Per-document provider override, and surfacing estimated monthly Go usage.
