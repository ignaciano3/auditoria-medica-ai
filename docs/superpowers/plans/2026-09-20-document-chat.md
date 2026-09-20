# Document Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the document chat panel answer grounded Spanish questions about an analyzed clinical record, streaming the answer and citing source pages.

**Architecture:** A pure BM25 retriever + citation helpers in `@audit/ai`, a streaming `LLMProvider` method implemented by the OpenAI/fake/heuristic providers, a `chat_messages` repository in `@audit/db`, a testable orchestration service in `apps/web/lib/chat-service.ts`, an SSE route handler, and a client `ChatPanel` that paints deltas.

**Tech Stack:** TypeScript, Bun (tests/workspaces), Turbo, Drizzle + PostgreSQL, Next.js 16 App Router (route handlers + React client components), OpenAI-compatible SDK, Zod.

**Spec:** `docs/superpowers/specs/2026-09-20-document-chat-design.md`

## Global Constraints

- All user-facing strings are Spanish, centralized in `packages/lib/src/i18n/es.ts`.
- The system must never send the whole PDF: only retrieved page text (`[p.N]` citations) plus the structured record and findings.
- Exact Spanish fallback string, copied verbatim: `No encontré información suficiente en la documentación analizada para determinarlo.`
- A citation `[p.N]` survives only when `N` is a BM25-retrieved page **or** a page present in a record/finding `Source`.
- No clinical content (question, answer, page text) is written to logs.
- DB schema `$type` annotations are type-only; **no migration**.
- Integration DB tests are gated by `TEST_DATABASE_URL` (skip when unset).
- Never commit secrets.
- Definition of done at repo root: `bun run lint`, `bun run typecheck`, `bun run test` all pass.

---

## File Structure

New:

- `packages/domain/src/chat.ts` — `ChatRole`.
- `packages/db/src/repositories/chat-messages.ts` — chat message repository.
- `packages/ai/src/chat/retriever.ts` — tokenizer + BM25.
- `packages/ai/src/chat/citations.ts` — parse/validate/split/allowed citation pages.
- `packages/ai/src/chat/prompts.ts` — `ChatContext`, `ChatTurn`, system/user prompts.
- `packages/ai/src/providers/factory.ts` — shared LLM provider factory.
- `apps/web/lib/chat-service.ts` — `prepareChat`, `streamReply`, `ChatDeps`.
- `apps/web/lib/serialize-chat-message.ts` — `ChatMessageView` + serializer.
- `apps/web/app/api/documents/[id]/chat/route.ts` — SSE endpoint.

Modified:

- `packages/ai/src/llm-provider.ts` — add `answerClinicalQuestion`.
- `packages/ai/src/providers/openai/openai-provider.ts` — streaming.
- `packages/ai/src/providers/fake/fake-provider.ts`, `.../heuristic/heuristic-provider.ts` — implement method.
- `packages/ai/src/index.ts` — export chat modules + factory.
- `packages/ai/package.json` — subpath export `./chat/citations`.
- `packages/domain/src/index.ts` — export `ChatRole`.
- `packages/db/src/schema.ts` — `$type` annotations.
- `packages/db/src/index.ts` — export repository.
- `apps/worker/src/providers.ts` — re-export shared factory.
- `apps/web/package.json` — add `@audit/ai` dependency.
- `apps/web/lib/container.ts` — add `chatMessages`.
- `apps/web/components/evidence-link.tsx` — optional `label`.
- `apps/web/components/chat-panel.tsx` — client component.
- `apps/web/app/documents/[id]/page.tsx` — load history, pass props.
- `packages/lib/src/i18n/es.ts` — chat strings.
- Existing `LLMProvider` test doubles: `packages/ai/src/extraction/map-extract.test.ts`, `apps/worker/src/pipeline/process-document.test.ts`, `apps/worker/src/pipeline/extract-document.test.ts`.

---

### Task 1: Chat role, schema types, and chat message repository

**Files:**
- Create: `packages/domain/src/chat.ts`
- Create: `packages/db/src/repositories/chat-messages.ts`
- Create: `packages/db/src/repositories/chat-messages.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/src/schema.ts:113-124`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ChatRole = "user" | "assistant"` (from `@audit/domain`)
  - `type ChatMessageRow = { id: string; documentId: string; role: ChatRole; content: string; citedPages: number[]; createdAt: Date }`
  - `createChatMessageRepository(db)` with `listForDocument(documentId): Promise<ChatMessageRow[]>` and `add(input): Promise<ChatMessageRow>`

- [ ] **Step 1: Add the domain type**

Create `packages/domain/src/chat.ts`:

```ts
export type ChatRole = "user" | "assistant";
```

Export it from `packages/domain/src/index.ts` (add after the `document.ts` export block):

```ts
export type { ChatRole } from "./chat.ts";
```

- [ ] **Step 2: Annotate the schema (type-only)**

In `packages/db/src/schema.ts`, add `ChatRole` to the `@audit/domain` type import, then change the `chatMessages` columns:

```ts
  role: text("role").$type<ChatRole>().notNull(),
  content: text("content").notNull(),
  citedPages: jsonb("cited_pages").$type<number[]>().notNull().default([]),
```

- [ ] **Step 3: Write the failing repository test**

Create `packages/db/src/repositories/chat-messages.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Database, getDb } from "../client.ts";
import { createChatMessageRepository } from "./chat-messages.ts";
import { createDocumentRepository } from "./documents.ts";

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("chat message repository", () => {
  let db: Database;
  let documents: ReturnType<typeof createDocumentRepository>;
  let repo: ReturnType<typeof createChatMessageRepository>;
  let documentId: string;

  beforeAll(async () => {
    db = getDb(url as string);
    documents = createDocumentRepository(db);
    repo = createChatMessageRepository(db);
    const doc = await documents.create({
      originalFilename: "chat.pdf",
      originalKey: "documents/chat/original.pdf",
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    if (documentId) await documents.remove(documentId);
  });

  test("adds and lists messages in ascending order", async () => {
    const first = await repo.add({
      documentId,
      role: "user",
      content: "¿Qué medicación recibió?",
      citedPages: [],
    });
    const second = await repo.add({
      documentId,
      role: "assistant",
      content: "Levofloxacina [p.1]",
      citedPages: [1],
    });

    const list = await repo.listForDocument(documentId);
    expect(list.map((m) => m.id)).toEqual([first.id, second.id]);
    expect(list[1]?.role).toBe("assistant");
    expect(list[1]?.citedPages).toEqual([1]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bun test packages/db/src/repositories/chat-messages.test.ts`
Expected: FAIL — `createChatMessageRepository` is not exported / does not exist.

- [ ] **Step 5: Implement the repository**

Create `packages/db/src/repositories/chat-messages.ts`:

```ts
import type { ChatRole } from "@audit/domain";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { chatMessages } from "../schema.ts";

export type ChatMessageRow = {
  id: string;
  documentId: string;
  role: ChatRole;
  content: string;
  citedPages: number[];
  createdAt: Date;
};

function toRow(row: typeof chatMessages.$inferSelect): ChatMessageRow {
  return {
    id: row.id,
    documentId: row.documentId,
    role: row.role,
    content: row.content,
    citedPages: row.citedPages,
    createdAt: row.createdAt,
  };
}

export function createChatMessageRepository(db: Database) {
  return {
    async listForDocument(documentId: string): Promise<ChatMessageRow[]> {
      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.documentId, documentId))
        .orderBy(asc(chatMessages.createdAt));
      return rows.map(toRow);
    },
    async add(input: {
      documentId: string;
      role: ChatRole;
      content: string;
      citedPages: number[];
    }): Promise<ChatMessageRow> {
      const [row] = await db.insert(chatMessages).values(input).returning();
      if (!row) throw new Error("Failed to add chat message");
      return toRow(row);
    },
  };
}
```

Export from `packages/db/src/index.ts` (after the clinical records export block):

```ts
export {
  type ChatMessageRow,
  createChatMessageRepository,
} from "./repositories/chat-messages.ts";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test packages/db/src/repositories/chat-messages.test.ts`
Expected: PASS when `TEST_DATABASE_URL` is set; otherwise the suite is skipped (still exit 0).

- [ ] **Step 7: Typecheck and commit**

Run: `bun run typecheck`
Expected: PASS.

```bash
git add packages/domain/src/chat.ts packages/domain/src/index.ts packages/db/src/schema.ts packages/db/src/repositories/chat-messages.ts packages/db/src/repositories/chat-messages.test.ts packages/db/src/index.ts
git commit -m "feat(db): add chat message repository and ChatRole"
```

---

### Task 2: BM25 retriever

**Files:**
- Create: `packages/ai/src/chat/retriever.ts`
- Create: `packages/ai/src/chat/retriever.test.ts`
- Modify: `packages/ai/src/index.ts`

**Interfaces:**
- Consumes: `DocumentPage` from `@audit/domain`.
- Produces:
  - `type RetrievedPage = { pageNumber: number; text: string; score: number }`
  - `tokenize(text: string): string[]`
  - `retrievePages(pages: DocumentPage[], question: string, options?: { maxPages?: number }): RetrievedPage[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/chat/retriever.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { DocumentPage } from "@audit/domain";
import { retrievePages, tokenize } from "./retriever.ts";

function page(pageNumber: number, text: string): DocumentPage {
  return {
    pageNumber,
    text,
    docType: "evolution",
    handwritten: false,
    dataBearing: true,
    status: "vision",
  };
}

describe("tokenize", () => {
  test("lowercases, strips accents and drops stopwords and short tokens", () => {
    expect(tokenize("¿Qué MEDICACIÓN recibió el paciente de la guardia?"))
      .toEqual(["medicacion", "recibio", "paciente", "guardia"]);
  });
});

describe("retrievePages", () => {
  test("ranks the page sharing more question terms first", () => {
    const result = retrievePages(
      [
        page(1, "Evolución general del paciente sin cambios."),
        page(2, "Levofloxacina: se inicia antibiótico."),
        page(3, "Antibiótico de amplio espectro."),
      ],
      "¿Qué antibiótico levofloxacina recibió?",
    );
    expect(result.map((r) => r.pageNumber)).toEqual([2, 3]);
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0);
  });

  test("ignores empty, failed and skipped pages", () => {
    const failed = { ...page(2, "levofloxacina"), status: "failed" as const };
    const skipped = { ...page(3, "levofloxacina"), status: "skipped" as const };
    const result = retrievePages(
      [page(1, ""), failed, skipped, page(4, "levofloxacina")],
      "levofloxacina",
    );
    expect(result.map((r) => r.pageNumber)).toEqual([4]);
  });

  test("returns [] when nothing overlaps", () => {
    const result = retrievePages([page(1, "control de signos vitales")], "marfan");
    expect(result).toEqual([]);
  });

  test("caps the number of pages", () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      page(i + 1, `antibiotico ${i}`),
    );
    expect(retrievePages(pages, "antibiotico", { maxPages: 3 })).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/ai/src/chat/retriever.test.ts`
Expected: FAIL — cannot resolve `./retriever.ts`.

- [ ] **Step 3: Implement the retriever**

Create `packages/ai/src/chat/retriever.ts`:

```ts
import type { DocumentPage } from "@audit/domain";

export type RetrievedPage = {
  pageNumber: number;
  text: string;
  score: number;
};

export type RetrieveOptions = { maxPages?: number };

const K1 = 1.2;
const B = 0.75;
const DEFAULT_MAX_PAGES = 6;

const STOPWORDS = new Set([
  "de", "la", "el", "que", "y", "en", "un", "una", "los", "las", "del",
  "al", "se", "con", "por", "para", "su", "sus", "es", "son", "fue", "como",
  "mas", "no", "lo", "le", "les", "o", "a", "e", "the", "of", "to",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export function retrievePages(
  pages: DocumentPage[],
  question: string,
  options: RetrieveOptions = {},
): RetrievedPage[] {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const corpus = pages.filter(
    (pageItem) =>
      pageItem.text.trim().length > 0 &&
      pageItem.status !== "failed" &&
      pageItem.status !== "skipped",
  );
  if (corpus.length === 0) return [];

  const queryTokens = tokenize(question);
  if (queryTokens.length === 0) return [];

  const documentTokens = corpus.map((pageItem) => tokenize(pageItem.text));
  const averageLength =
    documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) /
    corpus.length;

  const documentFrequency = new Map<string, number>();
  for (const tokens of documentTokens) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const scored = corpus.map((pageItem, index) => {
    const tokens = documentTokens[index] ?? [];
    const termFrequency = new Map<string, number>();
    for (const term of tokens) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }
    let score = 0;
    for (const term of queryTokens) {
      const frequency = termFrequency.get(term) ?? 0;
      if (frequency === 0) continue;
      const n = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (corpus.length - n + 0.5) / (n + 0.5));
      const denominator =
        frequency + K1 * (1 - B + (B * tokens.length) / averageLength);
      score += idf * ((frequency * (K1 + 1)) / denominator);
    }
    return { pageNumber: pageItem.pageNumber, text: pageItem.text, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
    .slice(0, maxPages);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/ai/src/chat/retriever.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and commit**

Add to `packages/ai/src/index.ts`:

```ts
export {
  type RetrieveOptions,
  type RetrievedPage,
  retrievePages,
  tokenize,
} from "./chat/retriever.ts";
```

```bash
git add packages/ai/src/chat/retriever.ts packages/ai/src/chat/retriever.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): add BM25 page retriever for chat"
```

---

### Task 3: Citation parsing, validation, and allowed pages

**Files:**
- Create: `packages/ai/src/chat/citations.ts`
- Create: `packages/ai/src/chat/citations.test.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `packages/ai/package.json`

**Interfaces:**
- Consumes: `ClinicalRecord`, `Finding` from `@audit/domain`; `RetrievedPage` from `./retriever.ts`.
- Produces:
  - `type CitationSegment = { kind: "text"; text: string } | { kind: "page"; page: number }`
  - `parseCitations(text: string): number[]`
  - `validateCitations(text: string, allowedPages: number[]): number[]`
  - `splitCitations(text: string, allowedPages: number[]): CitationSegment[]`
  - `sourcePagesFromContext(record: ClinicalRecord, findings: Finding[]): number[]`
  - `allowedCitationPages(input: { pages: RetrievedPage[]; record: ClinicalRecord; findings: Finding[] }): number[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/chat/citations.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, Finding } from "@audit/domain";
import {
  allowedCitationPages,
  parseCitations,
  sourcePagesFromContext,
  splitCitations,
  validateCitations,
} from "./citations.ts";

function record(): ClinicalRecord {
  return {
    patient: {
      name: { value: "Ana", sources: [{ documentId: "d", pageNumber: 2, text: "Ana" }] },
    },
    hospitalization: { diagnoses: [] },
    history: { pathological: [], allergies: [], usualMedications: [] },
    medications: [
      {
        name: {
          value: "Levofloxacina",
          sources: [{ documentId: "d", pageNumber: 5, text: "levo" }],
        },
        sources: [{ documentId: "d", pageNumber: 5, text: "levo" }],
      },
    ],
    laboratory: [],
    studies: [],
    microbiology: [],
    clinicalEvents: [],
  };
}

const findings: Finding[] = [
  {
    id: "f1",
    severity: "high",
    category: "contradiction",
    title: "Contradicción",
    explanation: "Dos fechas.",
    evidence: [
      {
        source: { documentId: "d", pageNumber: 9, text: "fecha" },
        relevance: "Fecha contradictoria.",
      },
    ],
    requiresHumanReview: true,
  },
];

describe("parseCitations", () => {
  test("returns markers in order", () => {
    expect(parseCitations("a [p.3] b [p.1] c")).toEqual([3, 1]);
  });
  test("returns [] when there are no markers", () => {
    expect(parseCitations("sin citas")).toEqual([]);
  });
});

describe("validateCitations", () => {
  test("keeps only allowed pages, unique and ascending", () => {
    expect(validateCitations("[p.3] [p.1] [p.9]", [1, 3])).toEqual([1, 3]);
  });
});

describe("splitCitations", () => {
  test("splits text and valid pages, dropping invalid markers", () => {
    expect(splitCitations("Tomó [p.5] y [p.99] mejoró", [5])).toEqual([
      { kind: "text", text: "Tomó " },
      { kind: "page", page: 5 },
      { kind: "text", text: " y  mejoró" },
    ]);
  });
});

describe("sourcePagesFromContext", () => {
  test("collects page numbers from record and findings sources", () => {
    expect(sourcePagesFromContext(record(), findings)).toEqual([2, 5, 9]);
  });
});

describe("allowedCitationPages", () => {
  test("unions retrieved pages with record/finding source pages", () => {
    const pages = [{ pageNumber: 4, text: "x", score: 1 }];
    expect(allowedCitationPages({ pages, record: record(), findings })).toEqual([
      2, 4, 5, 9,
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/ai/src/chat/citations.test.ts`
Expected: FAIL — cannot resolve `./citations.ts`.

- [ ] **Step 3: Implement the citation helpers**

Create `packages/ai/src/chat/citations.ts`:

```ts
import type { ClinicalRecord, Finding } from "@audit/domain";
import type { RetrievedPage } from "./retriever.ts";

const CITATION_PATTERN = /\[p\.(\d+)\]/g;

export type CitationSegment =
  | { kind: "text"; text: string }
  | { kind: "page"; page: number };

function uniquePositive(pages: number[]): number[] {
  return [
    ...new Set(pages.filter((page) => Number.isInteger(page) && page > 0)),
  ].sort((a, b) => a - b);
}

export function parseCitations(text: string): number[] {
  const pages: number[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const page = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(page) && page > 0) pages.push(page);
  }
  return pages;
}

export function validateCitations(
  text: string,
  allowedPages: number[],
): number[] {
  const allowed = new Set(allowedPages);
  return uniquePositive(parseCitations(text).filter((page) => allowed.has(page)));
}

export function splitCitations(
  text: string,
  allowedPages: number[],
): CitationSegment[] {
  const allowed = new Set(allowedPages);
  const segments: CitationSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, index) });
    }
    const page = Number.parseInt(match[1] ?? "", 10);
    if (allowed.has(page)) segments.push({ kind: "page", page });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  const merged: CitationSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (segment.kind === "text" && last?.kind === "text") {
      last.text += segment.text;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

function collectPageNumbers(value: unknown, out: number[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPageNumbers(item, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    const recordValue = value as Record<string, unknown>;
    const page = recordValue.pageNumber;
    if (typeof page === "number" && Number.isInteger(page) && page > 0) {
      out.push(page);
    }
    for (const child of Object.values(recordValue)) {
      collectPageNumbers(child, out);
    }
  }
}

export function sourcePagesFromContext(
  record: ClinicalRecord,
  findings: Finding[],
): number[] {
  const pages: number[] = [];
  collectPageNumbers(record, pages);
  collectPageNumbers(findings, pages);
  return uniquePositive(pages);
}

export function allowedCitationPages(input: {
  pages: RetrievedPage[];
  record: ClinicalRecord;
  findings: Finding[];
}): number[] {
  return uniquePositive([
    ...input.pages.map((page) => page.pageNumber),
    ...sourcePagesFromContext(input.record, input.findings),
  ]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/ai/src/chat/citations.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and add the client-safe subpath**

Add to `packages/ai/src/index.ts`:

```ts
export {
  type CitationSegment,
  allowedCitationPages,
  parseCitations,
  sourcePagesFromContext,
  splitCitations,
  validateCitations,
} from "./chat/citations.ts";
```

In `packages/ai/package.json`, extend `exports` (the client imports this subpath so the OpenAI SDK never enters the browser bundle):

```json
  "exports": {
    ".": "./src/index.ts",
    "./chat/citations": "./src/chat/citations.ts"
  },
```

- [ ] **Step 6: Commit**

Run: `bun test packages/ai/src/chat/citations.test.ts`
Expected: PASS.

```bash
git add packages/ai/src/chat/citations.ts packages/ai/src/chat/citations.test.ts packages/ai/src/index.ts packages/ai/package.json
git commit -m "feat(ai): add chat citation parsing and validation"
```

---

### Task 4: Chat prompts and context

**Files:**
- Create: `packages/ai/src/chat/prompts.ts`
- Create: `packages/ai/src/chat/prompts.test.ts`
- Modify: `packages/ai/src/index.ts`

**Interfaces:**
- Consumes: `ClinicalRecord`, `Finding` from `@audit/domain`; `RetrievedPage` from `./retriever.ts`.
- Produces:
  - `type ChatTurn = { role: "user" | "assistant"; content: string }`
  - `type ChatContext = { documentId: string; record: ClinicalRecord; findings: Finding[]; pages: RetrievedPage[]; history: ChatTurn[]; question: string }`
  - `const INSUFFICIENT_EVIDENCE_REPLY: string`
  - `const CHAT_SYSTEM_PROMPT: string`
  - `buildChatUserPrompt(context: ChatContext): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/chat/prompts.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ClinicalRecord } from "@audit/domain";
import {
  buildChatUserPrompt,
  type ChatContext,
  CHAT_SYSTEM_PROMPT,
  INSUFFICIENT_EVIDENCE_REPLY,
} from "./prompts.ts";

const record: ClinicalRecord = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
};

const context: ChatContext = {
  documentId: "d1",
  record,
  findings: [],
  pages: [{ pageNumber: 5, text: "Levofloxacina 500 mg", score: 2 }],
  history: [{ role: "user", content: "¿Qué antibiótico?" }],
  question: "¿Cuándo se inició?",
};

describe("chat prompts", () => {
  test("the system prompt carries the exact fallback sentence", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain(INSUFFICIENT_EVIDENCE_REPLY);
  });

  test("the user prompt contains record, pages, history and question", () => {
    const prompt = buildChatUserPrompt(context);
    expect(prompt).toContain('"hospitalization"');
    expect(prompt).toContain("[[page 5]]");
    expect(prompt).toContain("Levofloxacina 500 mg");
    expect(prompt).toContain("¿Qué antibiótico?");
    expect(prompt).toContain("¿Cuándo se inició?");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test packages/ai/src/chat/prompts.test.ts`
Expected: FAIL — cannot resolve `./prompts.ts`.

- [ ] **Step 3: Implement the prompts**

Create `packages/ai/src/chat/prompts.ts`:

```ts
import type { ClinicalRecord, Finding } from "@audit/domain";
import type { RetrievedPage } from "./retriever.ts";

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

export const CHAT_SYSTEM_PROMPT = [
  "You answer questions about a Spanish clinical record for a medical auditor.",
  "Answer only from the context provided by the user. Never invent information.",
  "Cite every factual claim inline with a marker like [p.N].",
  "Use only page numbers that appear in the provided pages list.",
  "If the context does not support an answer, reply with exactly:",
  INSUFFICIENT_EVIDENCE_REPLY,
  "Do not make a diagnosis that is not documented.",
  "Do not recommend treatment.",
  "Write your answer in Spanish.",
].join("\n");

export function buildChatUserPrompt(context: ChatContext): string {
  const findings =
    context.findings.length > 0
      ? context.findings
          .map((item) => `- [${item.severity}] ${item.title}: ${item.explanation}`)
          .join("\n")
      : "Ninguno.";
  const pages =
    context.pages.length > 0
      ? context.pages
          .map((page) => `[[page ${page.pageNumber}]]\n${page.text}`)
          .join("\n\n")
      : "Ninguna.";
  const history =
    context.history.length > 0
      ? context.history
          .map(
            (turn) =>
              `${turn.role === "user" ? "Usuario" : "Asistente"}: ${turn.content}`,
          )
          .join("\n")
      : "Ninguna.";

  return [
    "Registro clínico estructurado (JSON):",
    JSON.stringify(context.record),
    "",
    "Hallazgos detectados:",
    findings,
    "",
    "Páginas relevantes del documento:",
    pages,
    "",
    "Conversación previa:",
    history,
    "",
    `Pregunta: ${context.question}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/ai/src/chat/prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Export and commit**

Add to `packages/ai/src/index.ts`:

```ts
export {
  buildChatUserPrompt,
  type ChatContext,
  type ChatTurn,
  CHAT_SYSTEM_PROMPT,
  INSUFFICIENT_EVIDENCE_REPLY,
} from "./chat/prompts.ts";
```

```bash
git add packages/ai/src/chat/prompts.ts packages/ai/src/chat/prompts.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): add chat context and prompts"
```

---

### Task 5: Streaming `answerClinicalQuestion` on every provider

**Files:**
- Modify: `packages/ai/src/llm-provider.ts`
- Modify: `packages/ai/src/providers/openai/openai-provider.ts`
- Modify: `packages/ai/src/providers/openai/openai-provider.test.ts`
- Modify: `packages/ai/src/providers/fake/fake-provider.ts`
- Modify: `packages/ai/src/providers/fake/fake-provider.test.ts`
- Modify: `packages/ai/src/providers/heuristic/heuristic-provider.ts`
- Modify: `packages/ai/src/providers/heuristic/heuristic-provider.test.ts`
- Modify: `packages/ai/src/extraction/map-extract.test.ts`
- Modify: `apps/worker/src/pipeline/process-document.test.ts`
- Modify: `apps/worker/src/pipeline/extract-document.test.ts`

**Interfaces:**
- Consumes: `ChatContext`, `CHAT_SYSTEM_PROMPT`, `buildChatUserPrompt`, `INSUFFICIENT_EVIDENCE_REPLY` from Task 4.
- Produces: `LLMProvider.answerClinicalQuestion(context: ChatContext): AsyncIterable<string>`.

- [ ] **Step 1: Extend the interface**

In `packages/ai/src/llm-provider.ts`:

```ts
import type { ClinicalRecord, DocumentPage, Finding } from "@audit/domain";
import type { ChatContext } from "./chat/prompts.ts";

export interface LLMProvider {
  extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord>;
  analyzeClinicalRecord(record: ClinicalRecord): Promise<Finding[]>;
  generateClinicalSummary(record: ClinicalRecord): Promise<string>;
  generateAuditSummary(
    record: ClinicalRecord,
    findings: Finding[],
  ): Promise<string>;
  answerClinicalQuestion(context: ChatContext): AsyncIterable<string>;
}
```

- [ ] **Step 2: Write the failing OpenAI streaming test**

Append to `packages/ai/src/providers/openai/openai-provider.test.ts` (add `ChatContext` and `ChatTurn`-free imports; the existing `record` fixtures stay):

```ts
async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of iterable) text += chunk;
  return text;
}

function streamingClient(chunks: string[]): {
  client: OpenAICompatibleClient;
  requests: Array<Record<string, unknown>>;
} {
  const requests: Array<Record<string, unknown>> = [];
  const client: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: async (input) => {
          requests.push(input);
          return (async function* () {
            for (const chunk of chunks) {
              yield { choices: [{ delta: { content: chunk } }] };
            }
          })();
        },
      },
    },
  };
  return { client, requests };
}

describe("OpenAIProvider.answerClinicalQuestion", () => {
  const context = {
    documentId: "d1",
    record: validRecord,
    findings: [],
    pages: [{ pageNumber: 5, text: "Levofloxacina", score: 1 }],
    history: [],
    question: "¿Qué antibiótico recibió?",
  } as Parameters<OpenAIProvider["answerClinicalQuestion"]>[0];

  test("streams the answer chunks in order with stream: true", async () => {
    const fake = streamingClient(["Tomó ", "levofloxacina [p.5]."]);
    const text = await collect(
      provider(fake.client).answerClinicalQuestion(context),
    );
    expect(text).toBe("Tomó levofloxacina [p.5].");
    expect(fake.requests[0]?.stream).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test packages/ai/src/providers/openai/openai-provider.test.ts`
Expected: FAIL — `answerClinicalQuestion` does not exist / type error.

- [ ] **Step 4: Implement streaming in the OpenAI provider**

In `packages/ai/src/providers/openai/openai-provider.ts`:

1. Add imports:

```ts
import {
  buildChatUserPrompt,
  type ChatContext,
  CHAT_SYSTEM_PROMPT,
} from "../../chat/prompts.ts";
```

2. Widen the client types:

```ts
type ChatCompletionChunk = {
  choices: Array<{ delta?: { content?: string | null } }>;
};

type ChatCompletionResponse = {
  choices: Array<{ message: { content: string | null } }>;
};

export type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (
        input: Record<string, unknown>,
      ) => Promise<ChatCompletionResponse | AsyncIterable<ChatCompletionChunk>>;
    };
  };
};
```

3. In `complete`, cast the awaited result back to the non-streaming shape:

```ts
    const response = (await this.client.chat.completions.create(
      request,
    )) as ChatCompletionResponse;
    return response.choices[0]?.message.content ?? null;
```

4. Add a private stream helper and the public method (after `generateAuditSummary`):

```ts
  private async *completeStream(
    system: string,
    user: string,
  ): AsyncIterable<string> {
    const request: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: true,
    };
    if (this.reasoningEffort !== null) {
      request.reasoning_effort = this.reasoningEffort;
    }
    if (this.extraBody) {
      Object.assign(request, this.extraBody);
    }
    const stream = (await this.client.chat.completions.create(
      request,
    )) as AsyncIterable<ChatCompletionChunk>;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async *answerClinicalQuestion(context: ChatContext): AsyncIterable<string> {
    yield* this.completeStream(
      CHAT_SYSTEM_PROMPT,
      buildChatUserPrompt(context),
    );
  }
```

- [ ] **Step 5: Implement the fake and heuristic providers**

In `packages/ai/src/providers/fake/fake-provider.ts`, import the types and add an `answer` option + method:

```ts
import type { ChatContext } from "../../chat/prompts.ts";
import { INSUFFICIENT_EVIDENCE_REPLY } from "../../chat/prompts.ts";

// add to constructor options: answer?: string
// store: this.answer = options.answer ?? INSUFFICIENT_EVIDENCE_REPLY;

  async *answerClinicalQuestion(_context: ChatContext): AsyncIterable<string> {
    yield this.answer;
  }
```

In `packages/ai/src/providers/heuristic/heuristic-provider.ts`, add:

```ts
import {
  type ChatContext,
  INSUFFICIENT_EVIDENCE_REPLY,
} from "../../chat/prompts.ts";

  async *answerClinicalQuestion(context: ChatContext): AsyncIterable<string> {
    const page = context.pages[0];
    if (!page) {
      yield INSUFFICIENT_EVIDENCE_REPLY;
      return;
    }
    yield `La documentación analizada contiene información en la página ${page.pageNumber} [p.${page.pageNumber}].`;
  }
```

- [ ] **Step 6: Write the fake/heuristic streaming tests**

Append to `packages/ai/src/providers/fake/fake-provider.test.ts`:

```ts
test("streams the configured answer", async () => {
  const provider = new FakeLLMProvider({ record, answer: "Respuesta [p.1]" });
  let text = "";
  for await (const chunk of provider.answerClinicalQuestion({
    documentId: "d1",
    record,
    findings: [],
    pages: [],
    history: [],
    question: "q",
  })) {
    text += chunk;
  }
  expect(text).toBe("Respuesta [p.1]");
});
```

Append to `packages/ai/src/providers/heuristic/heuristic-provider.test.ts`:

```ts
test("answers with a page citation when a page is retrieved", async () => {
  const provider = new HeuristicLLMProvider();
  let text = "";
  for await (const chunk of provider.answerClinicalQuestion({
    documentId: "d1",
    record: { patient: {}, hospitalization: { diagnoses: [] }, history: { pathological: [], allergies: [], usualMedications: [] }, medications: [], laboratory: [], studies: [], microbiology: [], clinicalEvents: [] },
    findings: [],
    pages: [{ pageNumber: 3, text: "x", score: 1 }],
    history: [],
    question: "q",
  })) {
    text += chunk;
  }
  expect(text).toContain("[p.3]");
});
```

(`record` in the heuristic test file already exists as a fixture — reuse it instead of the inline object if present.)

- [ ] **Step 7: Update the existing test doubles**

`packages/ai/src/extraction/map-extract.test.ts` — add to `class TaggingProvider implements LLMProvider`:

```ts
  async *answerClinicalQuestion(): AsyncIterable<string> {
    yield "";
  }
```

`apps/worker/src/pipeline/process-document.test.ts` and `apps/worker/src/pipeline/extract-document.test.ts` — add to the `const provider: LLMProvider = { ... }` object literal:

```ts
    async *answerClinicalQuestion() {
      yield "";
    },
```

- [ ] **Step 8: Run the provider and extraction tests**

Run: `bun test packages/ai/src/providers apps/worker/src/pipeline`
Expected: PASS.

Run: `bun run typecheck`
Expected: PASS (all `LLMProvider` implementations now satisfy the interface).

- [ ] **Step 9: Commit**

```bash
git add packages/ai/src/llm-provider.ts packages/ai/src/providers/openai packages/ai/src/providers/fake packages/ai/src/providers/heuristic packages/ai/src/extraction/map-extract.test.ts apps/worker/src/pipeline/process-document.test.ts apps/worker/src/pipeline/extract-document.test.ts
git commit -m "feat(ai): stream clinical question answers from providers"
```

---

### Task 6: Shared provider factory, web dependency, and container repo

**Files:**
- Create: `packages/ai/src/providers/factory.ts`
- Create: `packages/ai/src/providers/factory.test.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `apps/worker/src/providers.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/lib/container.ts`

**Interfaces:**
- Consumes: `OpenAIProvider`, `HeuristicLLMProvider`, `LLMProvider`.
- Produces:
  - `type LlmEnv = { LLM_PROVIDER: "openai" | "deepseek" | "qwen" | "heuristic"; LLM_MODEL: string; OPENAI_API_KEY: string; DEEPSEEK_API_KEY: string; DASHSCOPE_API_KEY: string }`
  - `resolveLlmConfig(env: LlmEnv): LlmClientConfig | null`
  - `createLlmProvider(env: LlmEnv): LLMProvider`
  - `Container.chatMessages`

- [ ] **Step 1: Write the failing factory test**

Create `packages/ai/src/providers/factory.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { HeuristicLLMProvider, OpenAIProvider } from "../index.ts";
import { createLlmProvider, resolveLlmConfig } from "./factory.ts";

const base = {
  LLM_MODEL: "gpt-5.6-terra",
  OPENAI_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  DASHSCOPE_API_KEY: "",
} as const;

describe("resolveLlmConfig", () => {
  test("returns null for heuristic", () => {
    expect(
      resolveLlmConfig({ ...base, LLM_PROVIDER: "heuristic" }),
    ).toBeNull();
  });
  test("maps deepseek to its endpoint", () => {
    const config = resolveLlmConfig({
      ...base,
      LLM_PROVIDER: "deepseek",
      LLM_MODEL: "deepseek-flash",
      DEEPSEEK_API_KEY: "k",
    });
    expect(config?.baseURL).toBe("https://api.deepseek.com");
    expect(config?.apiKey).toBe("k");
  });
});

describe("createLlmProvider", () => {
  test("returns heuristic without an LLM config", () => {
    expect(
      createLlmProvider({ ...base, LLM_PROVIDER: "heuristic" }),
    ).toBeInstanceOf(HeuristicLLMProvider);
  });
  test("returns the OpenAI provider otherwise", () => {
    expect(
      createLlmProvider({ ...base, LLM_PROVIDER: "openai", OPENAI_API_KEY: "k" }),
    ).toBeInstanceOf(OpenAIProvider);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/ai/src/providers/factory.test.ts`
Expected: FAIL — cannot resolve `./factory.ts`.

- [ ] **Step 3: Implement the factory**

Create `packages/ai/src/providers/factory.ts`:

```ts
import type { LLMProvider } from "../llm-provider.ts";
import { HeuristicLLMProvider } from "./heuristic/heuristic-provider.ts";
import { OpenAIProvider } from "./openai/openai-provider.ts";

export type LlmProviderName = "openai" | "deepseek" | "qwen" | "heuristic";

export type LlmEnv = {
  LLM_PROVIDER: LlmProviderName;
  LLM_MODEL: string;
  OPENAI_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  DASHSCOPE_API_KEY: string;
};

export type LlmClientConfig = ConstructorParameters<typeof OpenAIProvider>[0];

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export function resolveLlmConfig(env: LlmEnv): LlmClientConfig | null {
  switch (env.LLM_PROVIDER) {
    case "heuristic":
      return null;
    case "deepseek":
      return {
        apiKey: env.DEEPSEEK_API_KEY,
        baseURL: DEEPSEEK_BASE_URL,
        model: env.LLM_MODEL,
        extraBody: { thinking: { type: "disabled" } },
        reasoningEffort: "low",
      };
    case "qwen":
      return {
        apiKey: env.DASHSCOPE_API_KEY,
        baseURL: QWEN_BASE_URL,
        model: env.LLM_MODEL,
        extraBody: { enable_thinking: false },
        reasoningEffort: "low",
      };
    default:
      return {
        apiKey: env.OPENAI_API_KEY,
        model: env.LLM_MODEL,
        reasoningEffort: "low",
      };
  }
}

export function createLlmProvider(env: LlmEnv): LLMProvider {
  const config = resolveLlmConfig(env);
  return config ? new OpenAIProvider(config) : new HeuristicLLMProvider();
}
```

Add to `packages/ai/src/index.ts`:

```ts
export {
  createLlmProvider,
  type LlmClientConfig,
  type LlmEnv,
  type LlmProviderName,
  resolveLlmConfig,
} from "./providers/factory.ts";
```

- [ ] **Step 4: Delegate the worker factory**

Replace the LLM parts of `apps/worker/src/providers.ts`. Remove the `OpenAIProvider`/`HeuristicLLMProvider`/`LLMProvider` imports and the `resolveLlmConfig`/`createLlmProvider` functions. Keep `DEEPSEEK_BASE_URL`/`QWEN_BASE_URL` (now used only by the OCR functions), `resolveOcrVisionConfig` and `createOcrProviders` unchanged, and append the re-export:

```ts
export { createLlmProvider, resolveLlmConfig } from "@audit/ai";
```

`apps/worker/src/providers.test.ts` imports these names from `./providers.ts` and must keep passing without edits.

- [ ] **Step 5: Run the worker and factory tests**

Run: `bun test packages/ai/src/providers/factory.test.ts apps/worker/src/providers.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `@audit/ai` to the web app and install**

In `apps/web/package.json` `dependencies`, add (keeping keys sorted):

```json
    "@audit/ai": "workspace:*",
```

Run (repo root): `bun install`
Expected: lockfile updates, no errors.

- [ ] **Step 7: Wire the repository into the container**

In `apps/web/lib/container.ts`, import `createChatMessageRepository` from `@audit/db`, add the type alias and the field:

```ts
type ChatMessageRepository = ReturnType<typeof createChatMessageRepository>;

export type Container = {
  documents: DocumentRepository;
  pages: DocumentPageRepository;
  clinicalRecords: ClinicalRecordRepository;
  findingReviews: FindingReviewRepository;
  chatMessages: ChatMessageRepository;
  storage: StorageProvider;
  queue: JobQueue;
};
```

and inside `getContainer()`:

```ts
      chatMessages: createChatMessageRepository(db),
```

- [ ] **Step 8: Typecheck and commit**

Run: `bun run typecheck`
Expected: PASS.

```bash
git add packages/ai/src/providers/factory.ts packages/ai/src/providers/factory.test.ts packages/ai/src/index.ts apps/worker/src/providers.ts apps/web/package.json apps/web/lib/container.ts bun.lock
git commit -m "refactor(ai): share LLM provider factory and wire chat repo"
```

---

### Task 7: Spanish chat copy

**Files:**
- Modify: `packages/lib/src/i18n/es.ts`
- Modify: `packages/lib/src/i18n/es.test.ts`

**Interfaces:**
- Produces (all strings on `ui`): `chatThinking`, `chatError`, `chatNotReady`, `chatInvalid`.

- [ ] **Step 1: Write the failing test**

In `packages/lib/src/i18n/es.test.ts`, extend the existing chat `describe` block:

```ts
  test("provides chat status and error copy", () => {
    expect(ui.chatThinking.length).toBeGreaterThan(0);
    expect(ui.chatError.length).toBeGreaterThan(0);
    expect(ui.chatNotReady.length).toBeGreaterThan(0);
    expect(ui.chatInvalid.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/lib/src/i18n/es.test.ts`
Expected: FAIL — properties do not exist on `ui`.

- [ ] **Step 3: Add the strings**

In `packages/lib/src/i18n/es.ts`, inside `export const ui = { ... }`, after the `chatSuggestions` entry:

```ts
  chatThinking: "Buscando en el documento…",
  chatError: "No se pudo obtener la respuesta. Intentá de nuevo.",
  chatNotReady:
    "El documento todavía se está procesando. Vas a poder preguntar cuando esté listo.",
  chatInvalid: "La pregunta no es válida.",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/lib/src/i18n/es.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/lib/src/i18n/es.ts packages/lib/src/i18n/es.test.ts
git commit -m "feat(i18n): add chat status and error copy"
```

---

### Task 8: Chat orchestration service

**Files:**
- Create: `apps/web/lib/chat-service.ts`
- Create: `apps/web/lib/chat-service.test.ts`

**Interfaces:**
- Consumes: `retrievePages`, `allowedCitationPages`, `validateCitations`, `ChatContext`, `ChatTurn`, `LLMProvider` from `@audit/ai`; `ChatMessageRow`, `ClinicalRecordWithFindings` from `@audit/db`; `DocumentPage`, `DocumentStatus` from `@audit/domain`; `ui`, `errors` from `@audit/lib`.
- Produces:
  - `type ChatDeps`
  - `type ChatError = { code: "notFound" | "notReady" | "invalid" | "failed"; message: string }`
  - `prepareChat(deps, input): Promise<{ ok: true; context: ChatContext } | { ok: false; error: ChatError }>`
  - `streamReply(deps, context): AsyncGenerator<string, ChatMessageRow, void>`

- [ ] **Step 1: Write the failing service tests**

Create `apps/web/lib/chat-service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ChatContext, LLMProvider } from "@audit/ai";
import type {
  ChatMessageRow as Row,
  ClinicalRecordWithFindings,
} from "@audit/db";
import type {
  ClinicalRecord,
  DocumentPage,
  DocumentStatus,
} from "@audit/domain";
import { ui } from "@audit/lib";
import { type ChatDeps, prepareChat, streamReply } from "./chat-service.ts";

const record: ClinicalRecord = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
};

const page: DocumentPage = {
  pageNumber: 5,
  text: "Levofloxacina 500 mg antibiótico",
  docType: "medsRecord",
  handwritten: false,
  dataBearing: true,
  status: "vision",
};

function fakeProvider(chunks: string[]): LLMProvider {
  return {
    extractClinicalRecord: () => Promise.reject(new Error("unused")),
    analyzeClinicalRecord: () => Promise.resolve([]),
    generateClinicalSummary: () => Promise.resolve(""),
    generateAuditSummary: () => Promise.resolve(""),
    answerClinicalQuestion: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function makeDeps(options: {
  status?: DocumentStatus;
  clinical?: ClinicalRecordWithFindings | null;
  pages?: DocumentPage[];
  chunks?: string[];
  added?: Array<{ role: string; content: string; citedPages: number[] }>;
}): ChatDeps {
  const added = options.added ?? [];
  return {
    documents: {
      getById: () =>
        Promise.resolve(
          options.status === undefined ? null : { status: options.status },
        ),
    },
    pages: { listForDocument: () => Promise.resolve(options.pages ?? [page]) },
    clinicalRecords: {
      getByDocument: () =>
        Promise.resolve(
          options.clinical === undefined
            ? {
                record,
                findings: [],
                extractionIncomplete: false,
                failedChunkCount: 0,
              }
            : options.clinical,
        ),
    },
    chatMessages: {
      listForDocument: () => Promise.resolve([]),
      add: (input) => {
        added.push({
          role: input.role,
          content: input.content,
          citedPages: input.citedPages,
        });
        return Promise.resolve({
          id: `m-${added.length}`,
          documentId: input.documentId,
          role: input.role,
          content: input.content,
          citedPages: input.citedPages,
          createdAt: new Date(),
        } as Row);
      },
    },
    provider: fakeProvider(options.chunks ?? ["Levofloxacina [p.5]"]),
  };
}

async function drain(
  generator: AsyncGenerator<string, Row, void>,
): Promise<{ deltas: string[]; final: Row }> {
  const deltas: string[] = [];
  while (true) {
    const { value, done } = await generator.next();
    if (done) return { deltas, final: value };
    deltas.push(value);
  }
}

describe("prepareChat", () => {
  test("rejects an empty question", async () => {
    const result = await prepareChat(makeDeps({ status: "ready" }), {
      documentId: "d1",
      question: "   ",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid", message: ui.chatInvalid },
    });
  });

  test("returns notFound when the document is missing", async () => {
    const result = await prepareChat(makeDeps({}), {
      documentId: "d1",
      question: "hola",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("notFound");
  });

  test("returns notReady while processing", async () => {
    const result = await prepareChat(makeDeps({ status: "analyzing" }), {
      documentId: "d1",
      question: "hola",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("notReady");
  });

  test("persists the user message and builds the context", async () => {
    const added: Array<{ role: string; content: string; citedPages: number[] }> = [];
    const result = await prepareChat(
      makeDeps({ status: "ready", added }),
      { documentId: "d1", question: "  ¿Qué antibiótico?  " },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.pages.map((p) => p.pageNumber)).toEqual([5]);
    expect(result.context.question).toBe("¿Qué antibiótico?");
    expect(added).toEqual([
      { role: "user", content: "¿Qué antibiótico?", citedPages: [] },
    ]);
  });
});

describe("streamReply", () => {
  const context: ChatContext = {
    documentId: "d1",
    record,
    findings: [],
    pages: [{ pageNumber: 5, text: "Levofloxacina", score: 1 }],
    history: [],
    question: "q",
  };

  test("yields deltas and persists the validated assistant message", async () => {
    const added: Array<{ role: string; content: string; citedPages: number[] }> = [];
    const result = await drain(
      streamReply(makeDeps({ added }), context),
    );
    expect(result.deltas).toEqual(["Levofloxacina [p.5]"]);
    expect(added[1]).toEqual({
      role: "assistant",
      content: "Levofloxacina [p.5]",
      citedPages: [5],
    });
  });

  test("drops citations to pages that are not allowed", async () => {
    const added: Array<{ role: string; content: string; citedPages: number[] }> = [];
    await drain(
      streamReply(
        makeDeps({ added, chunks: ["Se ve en [p.99]."] }),
        context,
      ),
    );
    expect(added[1]?.citedPages).toEqual([]);
  });

  test("throws without persisting when the provider is empty", async () => {
    const added: Array<{ role: string; content: string; citedPages: number[] }> = [];
    const call = drain(streamReply(makeDeps({ added, chunks: [] }), context));
    await expect(call).rejects.toBeInstanceOf(Error);
    expect(added).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test apps/web/lib/chat-service.test.ts`
Expected: FAIL — cannot resolve `./chat-service.ts`.

- [ ] **Step 3: Implement the service**

Create `apps/web/lib/chat-service.ts`:

```ts
import {
  allowedCitationPages,
  type ChatContext,
  type ChatTurn,
  type LLMProvider,
  retrievePages,
  validateCitations,
} from "@audit/ai";
import type { ChatMessageRow, ClinicalRecordWithFindings } from "@audit/db";
import type { DocumentPage, DocumentStatus } from "@audit/domain";
import { errors, ui } from "@audit/lib";

const MAX_QUESTION_LENGTH = 2000;
const MAX_HISTORY_TURNS = 10;

export type ChatDeps = {
  documents: {
    getById(id: string): Promise<{ status: DocumentStatus } | null>;
  };
  pages: { listForDocument(id: string): Promise<DocumentPage[]> };
  clinicalRecords: {
    getByDocument(id: string): Promise<ClinicalRecordWithFindings | null>;
  };
  chatMessages: {
    listForDocument(id: string): Promise<ChatMessageRow[]>;
    add(input: {
      documentId: string;
      role: "user" | "assistant";
      content: string;
      citedPages: number[];
    }): Promise<ChatMessageRow>;
  };
  provider: LLMProvider;
};

export type ChatErrorCode = "notFound" | "notReady" | "invalid" | "failed";
export type ChatError = { code: ChatErrorCode; message: string };

export type PrepareResult =
  | { ok: true; context: ChatContext }
  | { ok: false; error: ChatError };

function toHistory(messages: ChatMessageRow[]): ChatTurn[] {
  return messages
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({ role: message.role, content: message.content }));
}

export async function prepareChat(
  deps: ChatDeps,
  input: { documentId: string; question: string },
): Promise<PrepareResult> {
  const question = input.question.trim();
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: { code: "invalid", message: ui.chatInvalid } };
  }

  const doc = await deps.documents.getById(input.documentId);
  if (!doc) {
    return { ok: false, error: { code: "notFound", message: errors.notFound } };
  }
  if (doc.status !== "ready") {
    return { ok: false, error: { code: "notReady", message: ui.chatNotReady } };
  }

  const [pages, clinical, messages] = await Promise.all([
    deps.pages.listForDocument(input.documentId),
    deps.clinicalRecords.getByDocument(input.documentId),
    deps.chatMessages.listForDocument(input.documentId),
  ]);
  if (!clinical) {
    return { ok: false, error: { code: "notReady", message: ui.chatNotReady } };
  }

  const context: ChatContext = {
    documentId: input.documentId,
    record: clinical.record,
    findings: clinical.findings,
    pages: retrievePages(pages, question),
    history: toHistory(messages),
    question,
  };

  await deps.chatMessages.add({
    documentId: input.documentId,
    role: "user",
    content: question,
    citedPages: [],
  });

  return { ok: true, context };
}

export async function* streamReply(
  deps: ChatDeps,
  context: ChatContext,
): AsyncGenerator<string, ChatMessageRow, void> {
  let content = "";
  for await (const delta of deps.provider.answerClinicalQuestion(context)) {
    content += delta;
    yield delta;
  }
  if (content.trim().length === 0) {
    throw new Error(ui.chatError);
  }
  const citedPages = validateCitations(content, allowedCitationPages(context));
  return deps.chatMessages.add({
    documentId: context.documentId,
    role: "assistant",
    content,
    citedPages,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/web/lib/chat-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chat-service.ts apps/web/lib/chat-service.test.ts
git commit -m "feat(web): add chat orchestration service"
```

---

### Task 9: Serializer and SSE route handler

**Files:**
- Create: `apps/web/lib/serialize-chat-message.ts`
- Create: `apps/web/app/api/documents/[id]/chat/route.ts`
- Create: `apps/web/app/api/documents/[id]/chat/route.test.ts`

**Interfaces:**
- Consumes: `prepareChat`, `streamReply`, `ChatDeps` from Task 8; `ChatMessageRow` from `@audit/db`; `createLlmProvider` from `@audit/ai`; `getEnv`, `ui` from `@audit/lib`; `getContainer()` from `apps/web/lib/container.ts`.
- Produces:
  - `type ChatMessageView = { id: string; role: "user" | "assistant"; content: string; citedPages: number[] }`
  - `serializeChatMessage(row: ChatMessageRow): ChatMessageView`
  - `parseChatBody(body: unknown): string | null`
  - `POST(request, { params })`

- [ ] **Step 1: Create the serializer**

Create `apps/web/lib/serialize-chat-message.ts`:

```ts
import type { ChatMessageRow } from "@audit/db";

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedPages: number[];
};

export function serializeChatMessage(row: ChatMessageRow): ChatMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citedPages: row.citedPages,
  };
}
```

- [ ] **Step 2: Write the failing body-parser test**

Create `apps/web/app/api/documents/[id]/chat/route.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseChatBody } from "./route.ts";

describe("parseChatBody", () => {
  test("returns the trimmed message", () => {
    expect(parseChatBody({ message: "  hola  " })).toBe("hola");
  });
  test("rejects missing and empty messages", () => {
    expect(parseChatBody({})).toBeNull();
    expect(parseChatBody({ message: "   " })).toBeNull();
    expect(parseChatBody(null)).toBeNull();
  });
  test("rejects over-long messages", () => {
    expect(parseChatBody({ message: "x".repeat(2001) })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test apps/web/app/api/documents/[id]/chat/route.test.ts`
Expected: FAIL — cannot resolve `./route.ts`.

- [ ] **Step 4: Implement the route**

Create `apps/web/app/api/documents/[id]/chat/route.ts`:

```ts
import { createLlmProvider } from "@audit/ai";
import { getEnv, ui } from "@audit/lib";
import { NextResponse } from "next/server";
import { type ChatDeps, prepareChat, streamReply } from "../../../../../lib/chat-service.ts";
import { getContainer } from "../../../../../lib/container.ts";

const MAX_QUESTION_LENGTH = 2000;

export function parseChatBody(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const message = (body as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const question = message.trim();
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
    return null;
  }
  return question;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: ui.chatInvalid }, { status: 400 });
  }
  const question = parseChatBody(body);
  if (question === null) {
    return NextResponse.json({ error: ui.chatInvalid }, { status: 400 });
  }

  const container = getContainer();
  const deps: ChatDeps = {
    documents: container.documents,
    pages: container.pages,
    clinicalRecords: container.clinicalRecords,
    chatMessages: container.chatMessages,
    provider: createLlmProvider(getEnv()),
  };

  const prepared = await prepareChat(deps, { documentId: id, question });
  if (!prepared.ok) {
    const status =
      prepared.error.code === "notFound"
        ? 404
        : prepared.error.code === "notReady"
          ? 409
          : 400;
    return NextResponse.json({ error: prepared.error.message }, { status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const iterator = streamReply(deps, prepared.context);
        while (true) {
          const { value, done } = await iterator.next();
          if (done) {
            send({ done: true, message: value });
            break;
          }
          send({ delta: value });
        }
      } catch {
        send({ error: ui.chatError });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 5: Run the test and typecheck**

Run: `bun test apps/web/app/api/documents/[id]/chat/route.test.ts`
Expected: PASS.

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/serialize-chat-message.ts apps/web/app/api/documents/[id]/chat/route.ts apps/web/app/api/documents/[id]/chat/route.test.ts
git commit -m "feat(web): add document chat SSE endpoint"
```

---

### Task 10: Client chat panel and page wiring

**Files:**
- Modify: `apps/web/components/evidence-link.tsx`
- Modify: `apps/web/components/chat-panel.tsx`
- Modify: `apps/web/app/documents/[id]/page.tsx`

**Interfaces:**
- Consumes: `splitCitations` from `@audit/ai/chat/citations`; `ui` from `@audit/lib/i18n`; `ChatMessageView`, `serializeChatMessage` from Task 9; `EvidenceLink` with new `label` prop.
- Produces: `<ChatPanel documentId initialMessages ready />`.

- [ ] **Step 1: Add an optional label to the evidence link**

In `apps/web/components/evidence-link.tsx`, add a `label` prop to `EvidenceLink`:

```tsx
export function EvidenceLink({
  documentId,
  page,
  hash = viewerAnchorId,
  label,
}: {
  documentId: string;
  page: number;
  hash?: string | undefined;
  label?: string | undefined;
}) {
  const pathname = `/documents/${documentId}` as Route;
  const href = { pathname, query: { page }, hash };

  return (
    <Link
      className={buttonVariants({ variant: "secondary", size: "sm" })}
      href={href}
    >
      {label ?? findings.viewPage(page)}
    </Link>
  );
}
```

- [ ] **Step 2: Replace the chat panel with the client implementation**

Overwrite `apps/web/components/chat-panel.tsx`:

```tsx
"use client";

import { splitCitations } from "@audit/ai/chat/citations";
import { ui } from "@audit/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageView } from "../lib/serialize-chat-message.ts";
import { EvidenceLink } from "./evidence-link.tsx";
import { Button } from "./ui/button.tsx";

type StreamPayload =
  | { delta: string }
  | { done: true; message: ChatMessageView }
  | { error: string };

export function ChatPanel({
  documentId,
  initialMessages,
  ready,
}: {
  documentId: string;
  initialMessages: ChatMessageView[];
  ready: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const submit = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (trimmed.length === 0 || sending) return;
      setError(null);
      setSending(true);
      setInput("");
      const userMessage: ChatMessageView = {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        citedPages: [],
      };
      const assistantId = `local-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", content: "", citedPages: [] },
      ]);

      try {
        const response = await fetch(`/api/documents/${documentId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        if (!response.ok || !response.body) throw new Error(ui.chatError);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data:")) continue;
            const payload = JSON.parse(line.slice(5).trim()) as StreamPayload;
            if ("delta" in payload) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + payload.delta }
                    : message,
                ),
              );
            } else if ("done" in payload) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId ? payload.message : message,
                ),
              );
            } else if ("error" in payload) {
              throw new Error(payload.error);
            }
          }
        }
      } catch {
        setError(ui.chatError);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setSending(false);
      }
    },
    [documentId, sending],
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {ui.askRecord}
        </h2>
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-2 text-center">
            <p className="text-sm font-semibold text-foreground">
              {ui.chatEmptyTitle}
            </p>
            <p className="text-sm text-muted-foreground">{ui.chatEmptyBody}</p>
            <div className="mt-2 flex flex-col gap-2">
              {ui.chatSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={!ready || sending}
                  onClick={() => void submit(suggestion)}
                  className="cursor-pointer rounded-lg border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatBubble
              key={message.id}
              documentId={documentId}
              message={message}
            />
          ))
        )}
        {sending ? (
          <p className="text-xs text-muted-foreground">{ui.chatThinking}</p>
        ) : null}
        {error !== null ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!ready || sending}
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          placeholder={ready ? ui.chatPlaceholder : ui.chatNotReady}
          aria-label={ui.chatPlaceholder}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!ready || sending || input.trim().length === 0}
        >
          {ui.chatSend}
        </Button>
      </form>
    </section>
  );
}

function ChatBubble({
  documentId,
  message,
}: {
  documentId: string;
  message: ChatMessageView;
}) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-lg bg-brand px-3 py-2 text-sm text-brand-foreground"
            : "max-w-[85%] whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
        }
      >
        {isUser ? (
          message.content
        ) : (
          <AssistantContent documentId={documentId} message={message} />
        )}
      </div>
    </div>
  );
}

function AssistantContent({
  documentId,
  message,
}: {
  documentId: string;
  message: ChatMessageView;
}) {
  const segments = splitCitations(message.content, message.citedPages);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <EvidenceLink
            key={index}
            documentId={documentId}
            page={segment.page}
            label={`[${segment.page}]`}
          />
        ),
      )}
    </>
  );
}
```

- [ ] **Step 3: Wire the page**

In `apps/web/app/documents/[id]/page.tsx`:
1. Add imports:

```ts
import { serializeChatMessage } from "../../../lib/serialize-chat-message.ts";
```

2. After `const pages = await container.pages.listForDocument(id);`, load history:

```ts
  const chatMessages = await container.chatMessages.listForDocument(id);
```

3. Replace `<ChatPanel />` with:

```tsx
          <ChatPanel
            documentId={doc.id}
            initialMessages={chatMessages.map(serializeChatMessage)}
            ready={doc.status === "ready"}
          />
```

- [ ] **Step 4: Typecheck, lint and test**

Run: `bun run typecheck`
Expected: PASS.

Run: `bun run lint`
Expected: PASS (fix any Biome issues with `bun run lint:fix` if needed).

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/evidence-link.tsx apps/web/components/chat-panel.tsx "apps/web/app/documents/[id]/page.tsx"
git commit -m "feat(web): implement grounded streaming chat panel"
```

---

### Task 11: Full verification and manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite**

Run (repo root): `bun run lint && bun run typecheck && bun run test`
Expected: all PASS.

- [ ] **Step 2: Manual smoke test with the running stack**

Start the stack (`bun --env-file=.env run turbo run dev`, with Postgres/MinIO up and a processed document) and verify:

1. A `ready` document shows the chat panel enabled; a non-ready document shows a disabled input.
2. Asking "¿Qué medicamentos toma el paciente?" streams a Spanish answer that cites pages.
3. Clicking a `[N]` citation navigates to `?page=N` and the viewer moves to that page.
4. Reloading the page shows the persisted conversation.
5. With `LLM_PROVIDER=heuristic`, the answer still returns and cites a page.
6. No clinical text appears in the server logs.

- [ ] **Step 3: Confirm the definition of done**

All three root commands pass, and the manual smoke test behaves as described. If any step fails, fix it and re-run before declaring the task complete.

---

## Self-Review

**Spec coverage:**

- §4.1 retriever → Task 2. §4.2 prompts → Task 4. §4.3 provider + factory → Tasks 5, 6. §4.4 persistence (`chat_messages`, `ChatRole`) → Task 1. §4.5 citations (+ allowed pages) → Task 3. §4.6 orchestration → Task 8. §4.7 route → Task 9. §5 UI + §5.1 page wiring → Tasks 9, 10. §6 copy → Task 7. §7 error handling → Tasks 8, 9. §8 testing → every task. §9 file list → File Structure.
- i18n naming: the spec listed `ui.chatError`, `ui.chatNotReady`, `ui.chatThinking`; the plan adds `ui.chatInvalid` as the fourth string and uses `errors.notFound` for the missing-document case. This is a refinement, not a contradiction.

**Placeholder scan:** no TBD/TODO; every code step contains the full code.

**Type consistency:** `RetrievedPage` (Task 2) is consumed unchanged in Tasks 3, 4, 8. `ChatContext`/`ChatTurn` (Task 4) are consumed in Tasks 5, 8. `ChatMessageRow` (Task 1) is consumed in Tasks 8, 9, 10. `ChatDeps`/`prepareChat`/`streamReply` (Task 8) are consumed in Task 9. `ChatMessageView`/`serializeChatMessage` (Task 9) are consumed in Task 10. `splitCitations` is exported from the `@audit/ai/chat/citations` subpath (Task 3) and imported in Task 10 (not from the barrel, to keep the OpenAI SDK out of the client bundle).
