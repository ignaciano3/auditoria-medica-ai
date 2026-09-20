# Document Chat — Design (Slice F)

Date: 2026-09-20
Source spec: `MEDICAL_AUDIT_AI_MVP_SPEC.md` (§29, §30),
`docs/superpowers/specs/2026-09-16-medical-audit-ai-mvp-design.md` (§6.2, §7, §9),
`docs/superpowers/specs/2026-09-17-findings-review-ui-design.md` (§2)
Status: Approved design (pre-implementation plan)
Scope: Slice F of the inert-data program (see §2)
Depends on: slices A/B (`evidence-link.tsx`, `?page=N` handling) and the
`chat-panel.tsx` shell from `feat(web): tabbed viewer and chat panel shell`

## 1. Purpose

Commit `a0d1c8d` added a chat panel shell next to the document viewer: header
("Preguntarle a la historia clínica"), empty state with suggestions, input and
send button. It has no state and does nothing.

This slice makes it work: a grounded Spanish Q&A over the analyzed clinical
record. Answers are generated from a small retrieved context (structured record
+ findings + the most relevant page text), streamed token by token, cite source
pages, and are persisted so history survives reloads. It implements spec §29
(retrieval, never send the whole PDF) and §30 (evidence on every factual answer,
exact fallback when evidence is insufficient, Spanish only).

## 2. Context: inert-data program decomposition

From `2026-09-17-findings-review-ui-design.md` §2. This spec covers **F only**.

| # | Slice | Scope |
|---|---|---|
| A | Findings review UI | Findings, severity/category, evidence → page, review actions |
| B | Full clinical record view | Meds/labs/studies/micro, history, discharge, conflicts, evidence |
| C | Timeline | `clinicalEvents` chronological view, jump-to-page |
| D | Summaries | Worker generates + persists clinical & audit summary; render |
| E | Audit rules engine | `packages/audit`: deterministic rules + registry feeding findings |
| F | **Chat** (this spec) | Retrieval over page text + record lookup, provider method, persist, UI |
| G | Lifecycle/hardening | `access_log` wiring, retention/TLS docs, auth |

Out of scope for F: `access_log` wiring (G), auth/rate limiting (G), the left
navigation shell (G), sentence-level bounding-box highlighting (no provider
populates `Source.boundingBox`), embeddings/vector search, and any change to
extraction or the worker pipeline.

## 3. Confirmed decisions

Decided with the project owner during brainstorming:

| Question | Decision |
|---|---|
| Retrieval strategy | **Keyword/BM25 over `document_pages.text` + whole structured record/findings.** No embeddings, no pgvector. Per MVP design §9. |
| Response rendering | **Streaming token by token** via SSE; the client paints deltas as they arrive. |
| Context | **Record + findings + retrieved page text.** The chat can reason about detected findings ("¿qué debería revisar?") and cite both fields and pages. |
| Where generation runs | **In the web app** (SSE route handler + testable service). Provider factory shared from `@audit/ai`; keys already available to the web process via `@audit/lib` env. |
| Reasoning effort / provider | Same provider selection as extraction (`LLM_PROVIDER`), reused through the shared factory. `heuristic` must work end-to-end. |
| Chunk granularity | **Page-level** (one chunk per page), so a citation is always a page number. Paragraph chunking is a follow-up. |
| History source | Loaded **server-side from `chat_messages`**; the client only sends the new question (not prior turns). |

## 4. Architecture

Five layers, each testable in isolation:

```
page.tsx (server)         load history ──────────────► ChatPanel (client)
                                                          │ POST {message}
                                                          ▼
                         /api/documents/[id]/chat (route) ── SSE ──► ChatPanel
                                                          │
                                          chat-service.ts (orchestration)
                                          ├─ @audit/ai chat/retriever.ts (BM25, pure)
                                          ├─ LLMProvider.answerClinicalQuestion (stream)
                                          ├─ @audit/ai chat/citations.ts (parse/validate, pure)
                                          └─ @audit/db chat-messages repository
```

### 4.1 Retriever — `packages/ai/src/chat/retriever.ts`

Pure, no I/O, unit-tested.

```ts
export type RetrievedPage = {
  pageNumber: number;
  text: string;
  score: number;
};

export type RetrieveOptions = { maxPages?: number }; // default 6

export function tokenize(text: string): string[];
export function retrievePages(
  pages: DocumentPage[],
  question: string,
  options?: RetrieveOptions,
): RetrievedPage[];
```

- Corpus: pages whose `text.trim().length > 0`. `failed`/`skipped`/empty pages are
  excluded.
- `tokenize`: lowercase, NFD-normalize and strip diacritics, split on
  `/[^a-z0-9]+/`, drop tokens shorter than 2 chars and a small Spanish stopword
  list (`de, la, el, que, y, en, un, una, los, las, del, al, se, con, por, para,
  su, sus, es, son, fue, como, más, o, no, lo, le, les, ...`). Numbers are kept.
- Scoring: BM25 (`k1 = 1.2`, `b = 0.75`) over the page corpus with the question
  tokens. Document frequency and average length come from the filtered corpus.
- Result: pages with `score > 0`, sorted by score descending (ties by ascending
  page number), truncated to `maxPages`. If no page shares a token with the
  question, returns `[]`; the record/findings context is still sent (§4.2).

### 4.2 Prompts — `packages/ai/src/chat/prompts.ts`

Follows `prompts/extraction.ts` conventions: English system instructions, Spanish
generated content.

```ts
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatContext = {
  documentId: string;
  record: ClinicalRecord;
  findings: Finding[];
  pages: RetrievedPage[];
  history: ChatTurn[];
  question: string;
};

export const INSUFFICIENT_EVIDENCE_REPLY =
  "No encontré información suficiente en la documentación analizada para determinarlo.";

export const CHAT_SYSTEM_PROMPT: string;
export function buildChatUserPrompt(context: ChatContext): string;
```

- `CHAT_SYSTEM_PROMPT` rules: answer only from the provided context; never invent;
  cite every factual claim inline with the marker `[p.N]` using **only** page
  numbers present in the context; when the context does not support an answer,
  reply with exactly `INSUFFICIENT_EVIDENCE_REPLY`; do not diagnose or recommend
  treatment; write in Spanish.
- `buildChatUserPrompt` serializes, in order: the clinical record as compact
  JSON, the findings list, each retrieved page as `[[page N]]\n<text>`, the
  conversation history (last turns), and the question. Only retrieved pages are
  included — never the whole document.

### 4.3 Provider — `packages/ai/src/llm-provider.ts`

Extend the interface (implemented by OpenAI, fake, and heuristic providers):

```ts
export interface LLMProvider {
  // ...existing methods...
  answerClinicalQuestion(context: ChatContext): AsyncIterable<string>;
}
```

- `OpenAIProvider.answerClinicalQuestion` builds the prompts and streams via
  `client.chat.completions.create({ stream: true })`. The internal
  `OpenAICompatibleClient` type is widened so `create` may return either the
  non-streaming response (existing calls) or an `AsyncIterable<ChatCompletionChunk>`
  (new call). Deltas come from `choices[0]?.delta?.content`.
- `FakeLLMProvider` gains an optional `answer` option and yields that text (single
  chunk) or `INSUFFICIENT_EVIDENCE_REPLY` when absent.
- `HeuristicLLMProvider` implements a deterministic answer: pick the highest
  scoring retrieved page and answer with a cautious Spanish sentence plus a
  `[p.N]` citation, else `INSUFFICIENT_EVIDENCE_REPLY`.
- `packages/ai/src/index.ts` exports the new types/helpers.

Shared factory:

- Move `resolveLlmConfig` and `createLlmProvider` from `apps/worker/src/providers.ts`
  into `@audit/ai` (`packages/ai/src/providers/factory.ts`, exported from index).
- To avoid coupling `@audit/ai` to `@audit/lib`, the factory takes a structural
  `LlmEnv` (`LLM_PROVIDER`, `LLM_MODEL`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`,
  `DASHSCOPE_API_KEY`). `Env` from `@audit/lib` satisfies it, so both the worker
  and the web call `createLlmProvider(getEnv())` unchanged.
- `apps/worker/src/providers.ts` keeps only the OCR factory and re-exports/delegates
  the LLM factory for its existing callers.

### 4.4 Persistence — `packages/db/src/repositories/chat-messages.ts`

The `chat_messages` table already exists (schema §6.2, migration `0000`). No
migration is needed; only a repository and TS types.

```ts
export type ChatRole = "user" | "assistant";
export type ChatMessageRow = {
  id: string;
  documentId: string;
  role: ChatRole;
  content: string;
  citedPages: number[];
  createdAt: Date;
};

export function createChatMessageRepository(db: Database): {
  listForDocument(documentId: string): Promise<ChatMessageRow[]>; // ascending createdAt
  add(input: {
    documentId: string;
    role: ChatRole;
    content: string;
    citedPages: number[];
  }): Promise<ChatMessageRow>;
};
```

- `ChatRole` is added to `packages/domain` (`chat.ts`, exported from index);
  `schema.ts` annotates `role` with `$type<ChatRole>()` and `citedPages` with
  `$type<number[]>()`. These are type-only and produce no migration.
- Export the repository from `packages/db/src/index.ts`.

### 4.5 Citations — `packages/ai/src/chat/citations.ts`

Pure, unit-tested, shared by the service (validation) and the UI (rendering).

```ts
export type CitationSegment =
  | { kind: "text"; text: string }
  | { kind: "page"; page: number };

export function parseCitations(text: string): number[];          // all [p.N] markers, in order
export function validateCitations(
  text: string,
  allowedPages: number[],
): number[];                                                     // markers ∩ allowedPages
export function splitCitations(
  text: string,
  allowedPages: number[],
): CitationSegment[];                                            // render-ready segments
```

- Regex `\[p\.(\d+)\]`. `validateCitations` keeps only markers whose page is in
  `allowedPages` (the retrieved pages), so a hallucinated page number can never
  be persisted or linked. `splitCitations` splits the text into literal segments
  and valid page segments (invalid markers are dropped), giving the UI one pure
  function to render. The stored content keeps the raw markers.

### 4.6 Orchestration — `apps/web/lib/chat-service.ts`

Dependencies injected (mirrors `findings-service.ts`), so it is unit-testable with
fakes:

```ts
export type ChatDeps = {
  documents: { getById(id): Promise<{ status: DocumentStatus } | null> };
  pages: { listForDocument(id): Promise<DocumentPage[]> };
  clinicalRecords: { getByDocument(id): Promise<ClinicalRecordWithFindings | null> };
  chatMessages: {
    listForDocument(id): Promise<ChatMessageRow[]>;
    add(input: { documentId; role; content; citedPages }): Promise<ChatMessageRow>;
  };
  provider: LLMProvider;
};

export type ChatErrorCode = "notFound" | "notReady" | "invalid" | "failed";
export type ChatError = { code: ChatErrorCode; message: string };

export type PrepareResult =
  | { ok: true; context: ChatContext }
  | { ok: false; error: ChatError };

export function prepareChat(
  deps: ChatDeps,
  input: { documentId: string; question: string },
): Promise<PrepareResult>;

export async function* streamReply(
  deps: ChatDeps,
  context: ChatContext,
): AsyncGenerator<string, ChatMessageRow, void>;
```

`prepareChat`:

1. Validate `question` (trimmed, non-empty, length ≤ 2000); else `invalid`.
2. `documents.getById`; missing → `notFound`; `status !== "ready"` → `notReady`.
3. In parallel: `pages.listForDocument`, `clinicalRecords.getByDocument`,
   `chatMessages.listForDocument`. Missing record → `notReady`.
4. `retrievePages(pages, question)`; build `history` from the persisted messages
   (cap at the last 10, oldest dropped) and the `ChatContext`.
5. Persist the **user** message (`role: "user"`, `citedPages: []`).
6. Return `{ ok: true, context }`.

`streamReply`:

1. Iterate `deps.provider.answerClinicalQuestion(context)`; yield each delta while
   accumulating the full text.
2. If the accumulated text is empty/whitespace → throw `ChatError` `failed`.
3. `validateCitations(text, context.pages.map(p => p.pageNumber))`; persist the
   **assistant** message (`content` = full raw text, `citedPages` = validated).
4. Return the persisted `ChatMessageRow`.

A provider failure mid-stream propagates; the assistant message is not persisted.

### 4.7 API route — `apps/web/app/api/documents/[id]/chat/route.ts`

`POST` only.

1. Parse the body with zod: `{ message: string }`, trimmed length 1..2000.
   Invalid → `400 { error }` using the i18n `chatError`.
2. `prepareChat(getContainer-ish deps, { documentId: id, question })`. Map errors:
   `notFound → 404`, `notReady → 409`, `invalid → 400`; all return JSON with the
   Spanish message.
3. Stream via a `ReadableStream` with headers `Content-Type: text/event-stream`,
   `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`,
   `X-Accel-Buffering: no`.
   - Per delta: `data: {"delta":"..."}\n\n`.
   - On success: `data: {"done":true,"message":{...row}}\n\n`, then close.
   - On error: `data: {"error":"<chatError>"}\n\n`, then close.
4. The route builds `ChatDeps` from `getContainer()` plus
   `createLlmProvider(getEnv())`. To do this, `apps/web/lib/container.ts` adds
   `chatMessages: createChatMessageRepository(db)` to `Container`. The route does
   not log question or answer content.

## 5. UI — `apps/web/components/chat-panel.tsx`

Becomes a `"use client"` component.

Props (from `page.tsx`):

```ts
export function ChatPanel({
  documentId,
  initialMessages,
  ready,
}: {
  documentId: string;
  initialMessages: ChatMessageView[];   // { id, role, content, citedPages }
  ready: boolean;
});
```

- `ChatMessageView` is the serialized row (`createdAt` not rendered).
- State: `messages`, `input`, `sending`, `error`.
- Renders: scrollable message list; user messages right-aligned, assistant
  messages left-aligned. Assistant content is rendered from
  `splitCitations(content, citedPages)`; each `{ kind: "page" }` segment becomes
  an `EvidenceLink` (`?page=N`, existing component) inline with the surrounding
  text.
- Empty state and suggestions render only when there are no messages; clicking a
  suggestion fills the input and submits.
- Input submits on Enter (without Shift); send button disabled while `sending` or
  when the trimmed input is empty.
- `submit()`: `fetch` POST, read `response.body.getReader()`, decode incrementally,
  split on `\n\n`, parse `data:` payloads. `delta` appends to a live assistant
  bubble; `done` replaces it with the persisted message and clears `sending`;
  `error` shows `ui.chatError` and removes the live bubble.
- `!ready`: input and button disabled, showing `ui.chatNotReady`.
- Auto-scroll to the bottom as content grows.

### 5.1 Page wiring — `apps/web/app/documents/[id]/page.tsx`

The page already awaits `container.pages`/clinical data; it additionally reads
`container.chatMessages.listForDocument(id)` and renders:

```tsx
<ChatPanel
  documentId={doc.id}
  initialMessages={messages.map(serializeChatMessage)}
  ready={doc.status === "ready"}
/>
```

A small `serializeChatMessage` (mirroring `serialize-document.ts`) maps the row to
`ChatMessageView`, converting `createdAt` to ISO or dropping it.

## 6. Copy — `packages/lib/src/i18n/es.ts`

Existing chat strings are reused (`askRecord`, `chatPlaceholder`, `chatSend`,
`chatEmptyTitle`, `chatEmptyBody`, `chatSuggestions`). Add:

- `chatError`: "No se pudo obtener la respuesta. Intentá de nuevo."
- `chatNotReady`: "El documento todavía se está procesando. Vas a poder preguntar cuando esté listo."
- `chatThinking`: "Buscando en el documento…" (streaming indicator).

The evidence sentence "Las respuestas citan la página de donde sale la
información." already exists in `chatEmptyBody`. The exact fallback string lives
in `@audit/ai` (`INSUFFICIENT_EVIDENCE_REPLY`), not in UI copy.

## 7. Error handling

- Missing document → `404`; not `ready` → `409`; invalid input → `400`. Body uses
  the Spanish `chatError`/`chatNotReady`.
- Provider failure or empty output → SSE `error` event; the client shows
  `chatError` and discards the incomplete assistant bubble. No assistant message
  is persisted (the user message already is).
- Citation to a non-retrieved page is dropped before persistence and rendering.
- No clinical content (question, answer, page text) is written to logs.
- `LLM_PROVIDER=heuristic` produces a valid answer without external calls.

## 8. Testing

TDD, `bun test` per workspace. No component-render framework exists; web tests
exercise pure helpers and injected services (as in `findings-service.test.ts` and
`pdf-viewer.test.tsx`).

- `packages/ai`:
  - `chat/retriever.test.ts`: ranking favors the page with more question terms;
    accents/case handled; stopwords ignored; no overlap → `[]`; `maxPages` cap;
    empty/failed pages excluded.
  - `chat/citations.test.ts`: parses multiple markers in order; validates against
    allowed pages; drops unknown pages; `splitCitations` returns ordered text/page
    segments and drops invalid markers; handles text without markers.
  - `chat/prompts.test.ts`: user prompt contains the record, findings, retrieved
    pages, history and question, and does not include unretrieved page text;
    system prompt contains the fallback string.
  - `providers/*`: `answerClinicalQuestion` streams (OpenAI with an injected
    async-iterable client); fake and heuristic providers yield text/fallback.
- `packages/db`: `repositories/chat-messages.test.ts` (gated by
  `TEST_DATABASE_URL`, like other repository tests): `add` returns the row and
  `listForDocument` returns messages in ascending order.
- `apps/web`: `lib/chat-service.test.ts` with fake deps and a fake streaming
  provider — happy path yields deltas and persists user+assistant with validated
  `citedPages`; `notFound`/`notReady`/`invalid` paths; empty provider output →
  `failed` and no assistant row; non-retrieved citation dropped.
- `packages/lib`: `i18n/es.test.ts` asserts the new strings exist and are
  non-empty.
- Optional: a route test mirroring `apps/web/app/api/documents/route.test.ts` for
  the `400/404/409` paths.
- Definition of done: `bun run lint`, `bun run typecheck`, `bun run test` pass at
  the repo root.

## 9. Files touched

New:

- `packages/ai/src/chat/retriever.ts` (+ test)
- `packages/ai/src/chat/citations.ts` (+ test)
- `packages/ai/src/chat/prompts.ts` (+ test)
- `packages/ai/src/providers/factory.ts` (+ test)
- `packages/db/src/repositories/chat-messages.ts` (+ test)
- `packages/domain/src/chat.ts`
- `apps/web/lib/chat-service.ts` (+ test)
- `apps/web/lib/serialize-chat-message.ts` (if extracted)
- `apps/web/app/api/documents/[id]/chat/route.ts`

Modified:

- `packages/ai/src/llm-provider.ts` (new method)
- `packages/ai/src/providers/openai/openai-provider.ts` (+ streaming type)
- `packages/ai/src/providers/fake/fake-provider.ts`
- `packages/ai/src/providers/heuristic/heuristic-provider.ts`
- `packages/ai/src/index.ts`
- `packages/domain/src/index.ts`
- `packages/db/src/schema.ts` (`$type` annotations, type-only)
- `packages/db/src/index.ts`
- `apps/worker/src/providers.ts` (delegate LLM factory)
- `apps/web/lib/container.ts` (add `chatMessages` repository)
- `apps/web/components/chat-panel.tsx` (client component)
- `apps/web/app/documents/[id]/page.tsx` (load history, pass props)
- `packages/lib/src/i18n/es.ts` (+ `es.test.ts`)

No migration. No changes to extraction, OCR, or the worker pipeline.

## 10. Follow-ups (not in F)

- Paragraph/sentence-level retrieval chunks and bounding-box highlighting.
- Embeddings/pgvector if keyword retrieval proves insufficient.
- Slices C/D/E data (timeline, persisted summaries, rule findings) as richer chat
  context. Findings already flow in when present.
- Slice G: `access_log` entry per chat turn, auth, rate limiting, per-document
  chat retention.
- Token-budget-aware history/context trimming for very long documents.
