# Web — Next.js 16 Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/web` up to the current `create-next-app` (Next.js 16) standards: config parity, Tailwind CSS 4, system fonts, hybrid Server Component + Server Action rendering with Cache Components.

**Architecture:** Server Components read initial data through the existing `lib/container.ts` repositories. Uncached DB reads stream through `<Suspense>` (Cache Components / PPR); mutations become Server Actions that `revalidatePath`. All API routes are kept for polling, page images, health, and the documented contract. Styling moves from bespoke CSS classes to Tailwind utilities.

**Tech Stack:** Next.js `16.3.5`, React `19.2.8`, TypeScript `7.0.2`, Bun `1.3.14`, Biome, Tailwind CSS 4, `babel-plugin-react-compiler`, Turborepo.

**Spec:** `docs/superpowers/specs/2026-09-16-web-nextjs16-modernization-design.md`

## Global Constraints

- App is `apps/web`; run every app command with `bun run --cwd apps/web <script>`.
- All commands below run from the repo root unless stated otherwise.
- `package.json` in `apps/web` has `"type": "module"`; `next.config.ts` uses ESM `export default`.
- TypeScript is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `verbatimModuleSyntax`, `allowImportingTsExtensions`). Relative imports **must** include the `.ts` / `.tsx` extension. Type-only imports **must** use `import type` / `export type`.
- **Do not add code comments** anywhere.
- All user-facing copy comes from `@audit/lib` / `@audit/lib/i18n`; keep it Spanish.
- Keep workspace dependencies and every existing script in `apps/web/package.json`.
- Keep all API routes and their behavior; only `force-dynamic` exports are removed (Task 6).
- Do not touch `apps/worker`, `packages/*`, or `docker/`.
- The scaffold `apps/my-app` is deleted only in the final task.
- Node `>=24`, Bun `1.3.14`.

---

### Task 1: Tooling and config parity

**Files:**
- Create: `apps/web/next.config.ts`
- Delete: `apps/web/next.config.js`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Create: `apps/web/biome.json`
- Create: `apps/web/AGENTS.md`
- Create: `apps/web/CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `reactCompiler` + `typedRoutes` enabled; `typecheck` runs `next typegen` first so `PageProps`/`LayoutProps` globals exist for `tsc`.

- [ ] **Step 1: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
};

export default nextConfig;
```

- [ ] **Step 2: Delete `apps/web/next.config.js`**

```bash
git rm apps/web/next.config.js
```

- [ ] **Step 3: Update `apps/web/package.json`**

Change the `next` dependency to `"next": "16.3.5"`, add `"babel-plugin-react-compiler": "1.0.0"` to `devDependencies`, and change the `typecheck` script so route types are generated first:

```json
"typecheck": "next typegen && tsc --noEmit"
```

- [ ] **Step 4: Update `apps/web/tsconfig.json` `include`**

Replace the `include` array with:

```json
"include": [
  "**/*.ts",
  "**/*.tsx",
  "next-env.d.ts",
  "next.config.ts",
  ".next/types/**/*.ts",
  ".next/dev/types/**/*.ts",
  "**/*.mts"
]
```

Keep `extends: "../../packages/config/nextjs.json"`, the `next` plugin, `strictNullChecks`, and `types: ["bun"]`.

- [ ] **Step 5: Create `apps/web/biome.json`**

```json
{
  "root": false,
  "extends": ["../../packages/config/biome.json"],
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!**/.next", "!**/dist"]
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "linter": {
    "domains": {
      "next": "recommended",
      "react": "recommended"
    }
  }
}
```

- [ ] **Step 6: Create `apps/web/AGENTS.md`**

```md
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
```

- [ ] **Step 7: Create `apps/web/CLAUDE.md`**

```md
@AGENTS.md
```

- [ ] **Step 8: Install and verify**

Run:

```bash
bun install
bun run --cwd apps/web lint
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
```

Expected: all pass. If `biome check` reports errors from the newly enabled Next/React domains, fix them in the flagged files, then re-run. If `typecheck` reports the dynamic `Link` in `components/document-list.tsx`, this is not expected (verified) — leave it as a template literal.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/biome.json apps/web/AGENTS.md apps/web/CLAUDE.md apps/web/next.config.ts bun.lock
git add -u apps/web/next.config.js
git commit -m "chore(web): adopt Next.js 16 config, typed routes, and React Compiler"
```

Note: `bun.lock` may already contain unrelated pending changes in the working tree; include it with this commit because the dependency bump updates it.

---

### Task 2: Tailwind CSS 4 and system fonts

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/postcss.config.mjs`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: Task 1 config.
- Produces: Tailwind theme tokens `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono`. Existing bespoke classes are kept for now; they are removed in Task 9.

- [ ] **Step 1: Add Tailwind devDependencies**

In `apps/web/package.json` `devDependencies`, add:

```json
"@tailwindcss/postcss": "^4",
"tailwindcss": "^4"
```

- [ ] **Step 2: Create `apps/web/postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 3: Prepend Tailwind and the token block to `apps/web/app/globals.css`**

Add at the very top of the file (before the existing `:root`), and move the font stacks into `:root`:

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans-stack);
  --font-mono: var(--font-mono-stack);
}
```

Change the existing `:root` block to add the two stacks:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
  --font-sans-stack: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono-stack: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

Add `font-family: var(--font-sans-stack);` to the existing `body` rule. Leave all existing class rules (`.page`, `.card`, …) in place.

- [ ] **Step 4: Install and verify**

```bash
bun install
bun run --cwd apps/web lint
bun run --cwd apps/web build
```

Expected: build passes (Tailwind preflight coexists with the existing CSS).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/postcss.config.mjs apps/web/app/globals.css bun.lock
git commit -m "chore(web): add Tailwind CSS 4 and system font tokens"
```

---

### Task 3: Extract the document service (TDD)

**Files:**
- Create: `apps/web/lib/documents-service.test.ts`
- Create: `apps/web/lib/documents-service.ts`
- Modify: `apps/web/app/api/documents/route.ts`
- Modify: `apps/web/app/api/documents/[id]/route.ts`

**Interfaces:**
- Consumes: `Container` from `apps/web/lib/container.ts` (structurally assignable to `DocumentServiceDeps`).
- Produces:
  - `validateUpload(meta: UploadMeta): UploadValidation`
  - `maxUploadBytes: number`
  - `createUploadedDocument(deps: DocumentServiceDeps, file: File): Promise<CreateUploadedDocumentResult>`
  - `deleteDocumentById(deps: DocumentServiceDeps, id: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/documents-service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { StorageProvider } from "@audit/lib";
import { errors, InMemoryQueue, InMemoryStorage } from "@audit/lib";
import {
  createUploadedDocument,
  type DocumentServiceDeps,
  deleteDocumentById,
  validateUpload,
} from "./documents-service.ts";

function pdfFile(name = "historia.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function makeDeps(): {
  deps: DocumentServiceDeps;
  storage: InMemoryStorage;
  removed: string[];
} {
  const storage = new InMemoryStorage();
  const removed: string[] = [];
  const deps: DocumentServiceDeps = {
    storage,
    queue: new InMemoryQueue(),
    documents: {
      async create(input) {
        return { id: input.id, status: "uploaded" as const };
      },
      async getById() {
        return { originalKey: "documents/known/original.pdf" };
      },
      async remove(id) {
        removed.push(id);
      },
    },
  };
  return { deps, storage, removed };
}

describe("validateUpload", () => {
  test("accepts a PDF", () => {
    expect(
      validateUpload({ name: "historia.pdf", type: "application/pdf", size: 1024 })
        .ok,
    ).toBe(true);
  });

  test("rejects a non-PDF", () => {
    const result = validateUpload({
      name: "foto.png",
      type: "image/png",
      size: 1024,
    });
    expect(result).toEqual({ ok: false, error: errors.notPdf });
  });

  test("rejects oversized files", () => {
    expect(
      validateUpload({
        name: "grande.pdf",
        type: "application/pdf",
        size: 999_999_999,
      }).ok,
    ).toBe(false);
  });
});

describe("createUploadedDocument", () => {
  test("stores the PDF and returns the created document", async () => {
    const { deps, storage } = makeDeps();
    const result = await createUploadedDocument(deps, pdfFile());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("uploaded");
      const stored = await storage.get(`documents/${result.id}/original.pdf`);
      expect(stored).toBeInstanceOf(Uint8Array);
    }
  });

  test("cleans up and reports a storage failure", async () => {
    const { deps, removed } = makeDeps();
    const failing: DocumentServiceDeps = {
      ...deps,
      storage: {
        put: async () => {
          throw new Error("boom");
        },
        get: async () => new Uint8Array(),
        delete: async () => {},
      } satisfies StorageProvider,
    };
    const result = await createUploadedDocument(failing, pdfFile());
    expect(result).toEqual({
      ok: false,
      error: errors.uploadFailed,
      reason: "storage",
    });
    expect(removed).toHaveLength(1);
  });
});

describe("deleteDocumentById", () => {
  test("returns false when the document is missing", async () => {
    const { deps } = makeDeps();
    const missing: DocumentServiceDeps = {
      ...deps,
      documents: { ...deps.documents, getById: async () => null },
    };
    expect(await deleteDocumentById(missing, "nope")).toBe(false);
  });

  test("removes the row and the stored object", async () => {
    const { deps, removed } = makeDeps();
    expect(await deleteDocumentById(deps, "known")).toBe(true);
    expect(removed).toEqual(["known"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test apps/web/lib/documents-service.test.ts
```

Expected: FAIL — cannot resolve `./documents-service.ts`.

- [ ] **Step 3: Create `apps/web/lib/documents-service.ts`**

```ts
import type { DocumentStatus } from "@audit/domain";
import type { JobQueue, StorageProvider } from "@audit/lib";
import { errors } from "@audit/lib";

export const maxUploadBytes = 50 * 1024 * 1024;

export type UploadMeta = { name: string; type: string; size: number };

export type UploadValidation = { ok: true } | { ok: false; error: string };

export function validateUpload(meta: UploadMeta): UploadValidation {
  if (
    meta.type !== "application/pdf" ||
    !meta.name.toLowerCase().endsWith(".pdf")
  ) {
    return { ok: false, error: errors.notPdf };
  }
  if (meta.size > maxUploadBytes) {
    return { ok: false, error: errors.tooLarge };
  }
  if (meta.size <= 0) {
    return { ok: false, error: errors.invalidFile };
  }
  return { ok: true };
}

export type DocumentServiceDeps = {
  storage: StorageProvider;
  queue: JobQueue;
  documents: {
    create(input: {
      id: string;
      originalFilename: string;
      originalKey: string;
    }): Promise<{ id: string; status: DocumentStatus }>;
    getById(id: string): Promise<{ originalKey: string } | null>;
    remove(id: string): Promise<void>;
  };
};

export type CreateUploadedDocumentResult =
  | { ok: true; id: string; status: DocumentStatus }
  | { ok: false; error: string; reason: "invalid" | "storage" };

export async function createUploadedDocument(
  deps: DocumentServiceDeps,
  file: File,
): Promise<CreateUploadedDocumentResult> {
  const validation = validateUpload({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error, reason: "invalid" };
  }

  const id = crypto.randomUUID();
  const key = `documents/${id}/original.pdf`;
  try {
    await deps.storage.put(
      key,
      new Uint8Array(await file.arrayBuffer()),
      "application/pdf",
    );
    const document = await deps.documents.create({
      id,
      originalFilename: file.name,
      originalKey: key,
    });
    await deps.queue.start();
    await deps.queue.publish({ documentId: document.id });
    return { ok: true, id: document.id, status: document.status };
  } catch {
    await deps.storage.delete(key).catch(() => undefined);
    await deps.documents.remove(id).catch(() => undefined);
    return { ok: false, error: errors.uploadFailed, reason: "storage" };
  }
}

export async function deleteDocumentById(
  deps: DocumentServiceDeps,
  id: string,
): Promise<boolean> {
  const row = await deps.documents.getById(id);
  if (!row) return false;
  await deps.documents.remove(id);
  await deps.storage.delete(row.originalKey).catch(() => undefined);
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test apps/web/lib/documents-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Refactor `apps/web/app/api/documents/route.ts` to use the service**

Replace the top of the file and the `POST` body. The full file becomes:

```ts
import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../lib/container.ts";
import {
  createUploadedDocument,
  maxUploadBytes,
  type UploadMeta,
  validateUpload,
} from "../../../lib/documents-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { maxUploadBytes, type UploadMeta, validateUpload };

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: errors.noFile }, { status: 400 });
  }
  const result = await createUploadedDocument(getContainer(), file);
  if (!result.ok) {
    const status = result.reason === "invalid" ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(
    { id: result.id, status: result.status },
    { status: 201 },
  );
}

export async function GET(): Promise<Response> {
  const rows = await getContainer().documents.list();
  return NextResponse.json({
    documents: rows.map((row) => {
      return {
        id: row.id,
        originalFilename: row.originalFilename,
        status: row.status,
        pageCount: row.pageCount,
        error: row.error,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
  });
}
```

- [ ] **Step 6: Refactor `apps/web/app/api/documents/[id]/route.ts` `DELETE`**

Add the import and replace the `DELETE` handler. The full file becomes:

```ts
import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../../lib/container.ts";
import { deleteDocumentById } from "../../../../lib/documents-service.ts";
import { serializeDocument } from "../../../../lib/serialize-document.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const container = getContainer();
  const row = await container.documents.getById(id);
  if (!row) {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  const [clinical, pages] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
  ]);
  return NextResponse.json({
    document: serializeDocument(row),
    record: clinical?.record ?? null,
    extractionIncomplete: clinical?.extractionIncomplete ?? false,
    failedChunkCount: clinical?.failedChunkCount ?? 0,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      status: page.status,
      docType: page.docType,
    })),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const removed = await deleteDocumentById(getContainer(), id);
  if (!removed) {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
```

Note: `GET` now inlines the document serialization to avoid importing `serializeDocument` twice; if you prefer, keep the original `serializeDocument` call — either is fine, as long as `GET` returns the same shape.

- [ ] **Step 7: Run the full web check**

```bash
bun run --cwd apps/web test
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
```

Expected: all pass; `app/api/documents/route.test.ts` still imports and tests `validateUpload` from `./route.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/documents-service.ts apps/web/lib/documents-service.test.ts apps/web/app/api/documents/route.ts "apps/web/app/api/documents/[id]/route.ts"
git commit -m "refactor(web): extract shared document service with tests"
```

---

### Task 4: Server actions and uploader wiring

**Files:**
- Create: `apps/web/lib/actions.ts`
- Modify: `apps/web/components/document-uploader.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `createUploadedDocument`, `deleteDocumentById` from Task 3; `getContainer` from `lib/container.ts`.
- Produces: `uploadDocument(formData: FormData): Promise<UploadActionResult>`, `deleteDocument(id: string): Promise<void>`, `type UploadActionResult = { ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Create `apps/web/lib/actions.ts`**

```ts
"use server";

import { errors } from "@audit/lib";
import { revalidatePath } from "next/cache";
import { getContainer } from "./container.ts";
import { createUploadedDocument, deleteDocumentById } from "./documents-service.ts";

export type UploadActionResult = { ok: true } | { ok: false; error: string };

export async function uploadDocument(
  formData: FormData,
): Promise<UploadActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: errors.noFile };
  }
  const result = await createUploadedDocument(getContainer(), file);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<void> {
  const removed = await deleteDocumentById(getContainer(), id);
  if (removed) revalidatePath("/");
}
```

- [ ] **Step 2: Rewrite `apps/web/components/document-uploader.tsx` to call the action**

```tsx
"use client";

import { errors, ui } from "@audit/lib/i18n";
import { type ChangeEvent, useRef, useState } from "react";
import { uploadDocument } from "../lib/actions.ts";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function DocumentUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setState({ kind: "uploading" });
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await uploadDocument(body);
      if (!result.ok) {
        setState({ kind: "error", message: result.error });
        return;
      }
      setState({ kind: "success" });
    } catch {
      setState({ kind: "error", message: errors.uploadFailed });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">{ui.newDocument}</h2>
      <label className="upload-button">
        {ui.upload}
        <input
          ref={inputRef}
          className="upload-input"
          type="file"
          accept="application/pdf"
          disabled={state.kind === "uploading"}
          onChange={handleFileChange}
        />
      </label>
      {state.kind === "uploading" ? (
        <p className="muted">{ui.uploading}</p>
      ) : null}
      {state.kind === "success" ? (
        <output className="success">{ui.uploadSuccess}</output>
      ) : null}
      {state.kind === "error" ? (
        <p className="error" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Simplify `apps/web/app/page.tsx` (drop `refreshKey`, no `onUploaded`)**

```tsx
"use client";

import { ui } from "@audit/lib/i18n";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";

export default function Home() {
  return (
    <main className="page">
      <h1>{ui.appTitle}</h1>
      <DocumentUploader />
      <DocumentList />
    </main>
  );
}
```

`DocumentList` keeps its optional `refreshKey` prop; it is simply unused here (removed in Task 5).

- [ ] **Step 4: Verify**

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
bun run --cwd apps/web test
bun run --cwd apps/web build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/actions.ts apps/web/components/document-uploader.tsx apps/web/app/page.tsx
git commit -m "feat(web): upload documents through a server action"
```

---

### Task 5: Convert pages to Server Components with Suspense

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/document-list.tsx`
- Modify: `apps/web/app/documents/[id]/page.tsx`
- Modify: `apps/web/components/clinical-record-view.tsx`

**Interfaces:**
- Consumes: `getContainer`, `serializeDocument`, `deleteDocumentById` (unused here), `Document`, `ClinicalRecord`.
- Produces: `DocumentList` now takes `{ initialDocuments: Document[] }` and no `refreshKey`; detail page uses `PageProps<"/documents/[id]">`.

- [ ] **Step 1: Rewrite `apps/web/app/page.tsx` as a Server Component**

```tsx
import { ui } from "@audit/lib/i18n";
import { Suspense } from "react";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";
import { getContainer } from "../lib/container.ts";
import { serializeDocument } from "../lib/serialize-document.ts";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="page">
      <h1>{ui.appTitle}</h1>
      <DocumentUploader />
      <Suspense fallback={<p className="muted">{ui.loading}</p>}>
        <DocumentListSection />
      </Suspense>
    </main>
  );
}

async function DocumentListSection() {
  const rows = await getContainer().documents.list();
  const documents = rows.map((row) => serializeDocument(row));
  return <DocumentList initialDocuments={documents} />;
}
```

`export const dynamic = "force-dynamic"` is temporary and removed in Task 6.

- [ ] **Step 2: Rewrite `apps/web/components/document-list.tsx`**

```tsx
"use client";

import type { Document } from "@audit/domain";
import { ui } from "@audit/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pollIntervalMs } from "./document-status.ts";
import { DocumentStatusBadge } from "./document-status-badge.tsx";

type DocumentsState =
  | { kind: "loaded"; documents: Document[] }
  | { kind: "error" };

export function DocumentList({
  initialDocuments,
}: {
  initialDocuments: Document[];
}) {
  const [state, setState] = useState<DocumentsState>({
    kind: "loaded",
    documents: initialDocuments,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      if (!response.ok) throw new Error("documents request failed");
      const payload = (await response.json()) as { documents: Document[] };
      if (!mountedRef.current) return;
      setState({ kind: "loaded", documents: payload.documents });
    } catch {
      if (!mountedRef.current) return;
      setState((current) =>
        current.kind === "loaded" && current.documents.length > 0
          ? current
          : { kind: "error" },
      );
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const documents = state.kind === "loaded" ? state.documents : [];

  useEffect(() => {
    const intervals = documents
      .map((doc) => pollIntervalMs(doc.status))
      .filter((ms): ms is number => ms !== null);
    if (intervals.length === 0) return;
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, Math.min(...intervals));
    return () => clearInterval(timer);
  }, [documents, load]);

  if (state.kind === "error") {
    return (
      <p className="error" role="alert">
        {ui.loadError}
      </p>
    );
  }
  if (documents.length === 0) {
    return <p className="muted">{ui.noDocuments}</p>;
  }
  return (
    <ul className="document-list">
      {documents.map((doc) => (
        <li key={doc.id} className="document-item">
          <Link className="document-name" href={`/documents/${doc.id}`}>
            {doc.originalFilename}
          </Link>
          <DocumentStatusBadge status={doc.status} />
          {doc.status === "ready" && doc.pageCount !== null ? (
            <span className="muted">
              {doc.pageCount} {ui.pages}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Rewrite `apps/web/app/documents/[id]/page.tsx` as a Server Component**

```tsx
import { ui } from "@audit/lib/i18n";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClinicalRecordView } from "../../../components/clinical-record-view.tsx";
import { DocumentStatusBadge } from "../../../components/document-status-badge.tsx";
import { PdfViewer } from "../../../components/pdf-viewer.tsx";
import { getContainer } from "../../../lib/container.ts";
import { serializeDocument } from "../../../lib/serialize-document.ts";

export const dynamic = "force-dynamic";

export default function DocumentDetailPage({ params }: PageProps<"/documents/[id]">) {
  return (
    <main className="page">
      <Suspense fallback={<output className="muted">{ui.loading}</output>}>
        <DocumentContent params={params} />
      </Suspense>
    </main>
  );
}

async function DocumentContent({
  params,
}: Pick<PageProps<"/documents/[id]">, "params">) {
  const { id } = await params;
  const container = getContainer();
  const row = await container.documents.getById(id);
  if (!row) notFound();

  const [clinical, pages] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
  ]);
  const doc = serializeDocument(row);
  const failedPages = pages
    .filter((page) => page.status === "failed")
    .map((page) => page.pageNumber);
  const pageCount = doc.pageCount;

  return (
    <>
      <header className="document-header">
        <h1>{doc.originalFilename}</h1>
        <DocumentStatusBadge status={doc.status} />
      </header>
      {doc.status === "error" && doc.error !== null ? (
        <p className="error" role="alert">
          {doc.error}
        </p>
      ) : null}
      {clinical !== null ? (
        <ClinicalRecordView
          record={clinical.record}
          incomplete={clinical.extractionIncomplete || failedPages.length > 0}
          failedPages={failedPages}
          failedChunks={clinical.failedChunkCount}
        />
      ) : null}
      {pageCount !== null && pageCount > 0 ? (
        <PdfViewer documentId={doc.id} pageCount={pageCount} initialPage={1} />
      ) : (
        <p className="muted">{pageCount === null ? ui.loading : ui.noPages}</p>
      )}
    </>
  );
}
```

`export const dynamic = "force-dynamic"` is temporary and removed in Task 6.

- [ ] **Step 4: Make `clinical-record-view.tsx` a Server Component**

Delete the first line `"use client";` from `apps/web/components/clinical-record-view.tsx`. No other change.

- [ ] **Step 5: Verify**

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
bun run --cwd apps/web test
bun run --cwd apps/web build
```

Expected: all pass. `next typegen` runs as part of `typecheck`, providing the `PageProps` global.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/page.tsx apps/web/components/document-list.tsx "apps/web/app/documents/[id]/page.tsx" apps/web/components/clinical-record-view.tsx
git commit -m "refactor(web): render pages as Server Components with Suspense"
```

---

### Task 6: Enable Cache Components

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/documents/[id]/page.tsx`
- Modify: `apps/web/app/api/documents/route.ts`
- Modify: `apps/web/app/api/documents/[id]/route.ts`
- Modify: `apps/web/app/api/documents/[id]/pages/[page]/route.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `cacheComponents: true`; no route segment exports `dynamic`, `revalidate`, or `fetchCache`.

- [ ] **Step 1: Add `cacheComponents` to `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  typedRoutes: true,
};

export default nextConfig;
```

- [ ] **Step 2: Remove the temporary `force-dynamic` exports from the two pages**

Delete the line `export const dynamic = "force-dynamic";` from:
- `apps/web/app/page.tsx`
- `apps/web/app/documents/[id]/page.tsx`

- [ ] **Step 3: Remove `force-dynamic` from the three route handlers**

Delete the line `export const dynamic = "force-dynamic";` from:
- `apps/web/app/api/documents/route.ts`
- `apps/web/app/api/documents/[id]/route.ts`
- `apps/web/app/api/documents/[id]/pages/[page]/route.ts`

Keep `export const runtime = "nodejs";` in those files.

- [ ] **Step 4: Verify a build without a database**

```bash
bun run --cwd apps/web lint
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
```

Expected: `build` succeeds with no database running. The pages' DB reads sit behind `<Suspense>` (fallback in the static shell); `GET /api/documents` and the page-image `GET` stop prerendering because they access database/storage I/O (Next.js route-handlers model). `GET /api/health` becomes a static prerender.

If the build errors on `export const runtime = "nodejs"`, remove that line from the three route files and re-run the build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.ts apps/web/app/page.tsx "apps/web/app/documents/[id]/page.tsx" apps/web/app/api/documents/route.ts "apps/web/app/api/documents/[id]/route.ts" "apps/web/app/api/documents/[id]/pages/[page]/route.ts"
git commit -m "feat(web): enable Cache Components and stream dynamic data"
```

---

### Task 7: Tailwind migration — home, list, uploader, badge

**Files:**
- Modify: `apps/web/components/document-status.ts`
- Modify: `apps/web/components/document-status.test.tsx`
- Modify: `apps/web/components/document-status-badge.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/document-list.tsx`
- Modify: `apps/web/components/document-uploader.tsx`

**Interfaces:**
- Consumes: `DocumentStatus` from `@audit/domain`.
- Produces: `statusBadgeClass(status: DocumentStatus): string`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/components/document-status.test.tsx` (inside the existing `describe("status UI logic", …)` block):

```ts
test("ready and error badges override the default", () => {
  expect(statusBadgeClass("ready")).toContain("bg-[#1a7f37]");
  expect(statusBadgeClass("error")).toContain("bg-[#d1242f]");
  expect(statusBadgeClass("processing")).toBe("");
});
```

Update the import at the top of the file to include `statusBadgeClass`:

```ts
import { pollIntervalMs, statusBadgeClass, statusLabel } from "./document-status.ts";
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test apps/web/components/document-status.test.tsx
```

Expected: FAIL — `statusBadgeClass` is not exported.

- [ ] **Step 3: Add `statusBadgeClass` to `apps/web/components/document-status.ts`**

```ts
import type { DocumentStatus } from "@audit/domain";
import { isTerminalStatus } from "@audit/domain";
import { documentStatusLabels } from "@audit/lib/i18n";

const badgeOverrides: Record<DocumentStatus, string> = {
  uploaded: "",
  processing: "",
  extracting: "",
  analyzing: "",
  ready: "bg-[#1a7f37] text-white",
  error: "bg-[#d1242f] text-white",
};

export function statusLabel(status: DocumentStatus): string {
  return documentStatusLabels[status];
}

export function statusBadgeClass(status: DocumentStatus): string {
  return badgeOverrides[status];
}

export function pollIntervalMs(status: DocumentStatus): number | null {
  return isTerminalStatus(status) ? null : 2000;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test apps/web/components/document-status.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Rewrite `apps/web/components/document-status-badge.tsx`**

```tsx
import type { DocumentStatus } from "@audit/domain";
import { statusBadgeClass, statusLabel } from "./document-status.ts";

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full bg-foreground/12 px-2 py-0.5 text-[13px] ${statusBadgeClass(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
```

- [ ] **Step 6: Rewrite `apps/web/app/page.tsx` with Tailwind classes**

Keep the Server Component logic from Task 5; change only the class names:

```tsx
import { ui } from "@audit/lib/i18n";
import { Suspense } from "react";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";
import { getContainer } from "../lib/container.ts";
import { serializeDocument } from "../lib/serialize-document.ts";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-8">
      <h1 className="text-2xl font-semibold">{ui.appTitle}</h1>
      <DocumentUploader />
      <Suspense fallback={<p className="text-foreground/60">{ui.loading}</p>}>
        <DocumentListSection />
      </Suspense>
    </main>
  );
}

async function DocumentListSection() {
  const rows = await getContainer().documents.list();
  const documents = rows.map((row) => serializeDocument(row));
  return <DocumentList initialDocuments={documents} />;
}
```

- [ ] **Step 7: Rewrite `apps/web/components/document-list.tsx` with Tailwind classes**

```tsx
"use client";

import type { Document } from "@audit/domain";
import { ui } from "@audit/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pollIntervalMs } from "./document-status.ts";
import { DocumentStatusBadge } from "./document-status-badge.tsx";

type DocumentsState =
  | { kind: "loaded"; documents: Document[] }
  | { kind: "error" };

export function DocumentList({
  initialDocuments,
}: {
  initialDocuments: Document[];
}) {
  const [state, setState] = useState<DocumentsState>({
    kind: "loaded",
    documents: initialDocuments,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      if (!response.ok) throw new Error("documents request failed");
      const payload = (await response.json()) as { documents: Document[] };
      if (!mountedRef.current) return;
      setState({ kind: "loaded", documents: payload.documents });
    } catch {
      if (!mountedRef.current) return;
      setState((current) =>
        current.kind === "loaded" && current.documents.length > 0
          ? current
          : { kind: "error" },
      );
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const documents = state.kind === "loaded" ? state.documents : [];

  useEffect(() => {
    const intervals = documents
      .map((doc) => pollIntervalMs(doc.status))
      .filter((ms): ms is number => ms !== null);
    if (intervals.length === 0) return;
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, Math.min(...intervals));
    return () => clearInterval(timer);
  }, [documents, load]);

  if (state.kind === "error") {
    return (
      <p className="text-[#d1242f]" role="alert">
        {ui.loadError}
      </p>
    );
  }
  if (documents.length === 0) {
    return <p className="text-foreground/60">{ui.noDocuments}</p>;
  }
  return (
    <ul className="flex list-none flex-col gap-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center gap-3 rounded-lg border border-foreground/15 px-4 py-3"
        >
          <Link
            className="flex-1 [overflow-wrap:anywhere]"
            href={`/documents/${doc.id}`}
          >
            {doc.originalFilename}
          </Link>
          <DocumentStatusBadge status={doc.status} />
          {doc.status === "ready" && doc.pageCount !== null ? (
            <span className="text-foreground/60">
              {doc.pageCount} {ui.pages}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: Rewrite `apps/web/components/document-uploader.tsx` with Tailwind classes**

Keep the action wiring from Task 4; change only the returned JSX:

```tsx
"use client";

import { errors, ui } from "@audit/lib/i18n";
import { type ChangeEvent, useRef, useState } from "react";
import { uploadDocument } from "../lib/actions.ts";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function DocumentUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setState({ kind: "uploading" });
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await uploadDocument(body);
      if (!result.ok) {
        setState({ kind: "error", message: result.error });
        return;
      }
      setState({ kind: "success" });
    } catch {
      setState({ kind: "error", message: errors.uploadFailed });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-4">
      <h2 className="text-base font-semibold">{ui.newDocument}</h2>
      <label className="inline-block w-fit cursor-pointer rounded-md bg-foreground px-4 py-2 text-background focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foreground">
        {ui.upload}
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf"
          disabled={state.kind === "uploading"}
          onChange={handleFileChange}
        />
      </label>
      {state.kind === "uploading" ? (
        <p className="text-foreground/60">{ui.uploading}</p>
      ) : null}
      {state.kind === "success" ? (
        <output className="text-[#1a7f37]">{ui.uploadSuccess}</output>
      ) : null}
      {state.kind === "error" ? (
        <p className="text-[#d1242f]" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 9: Verify**

```bash
bun run --cwd apps/web lint
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/document-status.ts apps/web/components/document-status.test.tsx apps/web/components/document-status-badge.tsx apps/web/app/page.tsx apps/web/components/document-list.tsx apps/web/components/document-uploader.tsx
git commit -m "style(web): migrate home, list, uploader, and badge to Tailwind"
```

---

### Task 8: Tailwind migration — detail, viewer, record

**Files:**
- Modify: `apps/web/app/documents/[id]/page.tsx`
- Modify: `apps/web/components/pdf-viewer.tsx`
- Modify: `apps/web/components/clinical-record-view.tsx`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces: no interface change; class names only.

- [ ] **Step 1: Rewrite the `DocumentContent` JSX in `apps/web/app/documents/[id]/page.tsx`**

Keep everything above the `return` unchanged (imports, `PageProps`, `notFound`, data reads). Replace the returned JSX with:

```tsx
  return (
    <>
      <header className="flex items-center gap-3">
        <h1 className="flex-1 [overflow-wrap:anywhere]">
          {doc.originalFilename}
        </h1>
        <DocumentStatusBadge status={doc.status} />
      </header>
      {doc.status === "error" && doc.error !== null ? (
        <p className="text-[#d1242f]" role="alert">
          {doc.error}
        </p>
      ) : null}
      {clinical !== null ? (
        <ClinicalRecordView
          record={clinical.record}
          incomplete={clinical.extractionIncomplete || failedPages.length > 0}
          failedPages={failedPages}
          failedChunks={clinical.failedChunkCount}
        />
      ) : null}
      {pageCount !== null && pageCount > 0 ? (
        <PdfViewer documentId={doc.id} pageCount={pageCount} initialPage={1} />
      ) : (
        <p className="text-foreground/60">
          {pageCount === null ? ui.loading : ui.noPages}
        </p>
      )}
    </>
  );
```

Also update the page's `<main>` and fallback classes:

```tsx
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-8">
      <Suspense fallback={<output className="text-foreground/60">{ui.loading}</output>}>
        <DocumentContent params={params} />
      </Suspense>
    </main>
```

- [ ] **Step 2: Rewrite `apps/web/components/pdf-viewer.tsx` with Tailwind classes**

Keep all hooks and handlers unchanged; replace the returned JSX with:

```tsx
  return (
    <section className="flex flex-col gap-3" data-page={currentPage}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => goToPage(currentPage - 1)}
          disabled={!canGoPrevious}
        >
          {ui.previousPage}
        </button>
        <span className="flex-1 text-center" aria-live="polite">
          {pageIndicator(currentPage, pageCount)}
        </span>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => goToPage(currentPage + 1)}
          disabled={!canGoNext}
        >
          {ui.nextPage}
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={ui.zoomOut}
          disabled={!canZoomOut}
          onClick={() =>
            setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))
          }
        >
          -
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={ui.zoomIn}
          disabled={!canZoomIn}
          onClick={() =>
            setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))
          }
        >
          +
        </button>
      </div>
      <div className="overflow-auto rounded-lg border border-foreground/15 bg-foreground/5">
        <img
          className="mx-auto block h-auto max-w-none"
          src={`/api/documents/${documentId}/pages/${currentPage}`}
          alt={pageImageAlt(currentPage)}
          style={{ width: `${zoom * 100}%` }}
        />
      </div>
    </section>
  );
```

- [ ] **Step 3: Rewrite `apps/web/components/clinical-record-view.tsx` with Tailwind classes**

Keep all logic and rendering unchanged; replace every `className`:

- `<section className="record-view">` → `<section className="flex flex-col gap-6">`
- incomplete banner `<div className="error" role="alert">` → `<div className="text-[#d1242f]" role="alert">`
- each card `<section className="card">` → `<section className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-4">`
- each card title `<h2 className="card-title">` → `<h2 className="text-base font-semibold">`
- each fields list `<dl className="record-fields">` → `<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">`
- each `<dt>` has no class today; add `className="font-semibold"` to every `<dt>`
- empty paragraphs `<p className="muted">` → `<p className="text-foreground/60">`
- diagnoses list `<ul className="record-list">` → `<ul className="flex list-disc flex-col gap-1 pl-5">`

- [ ] **Step 4: Verify**

```bash
bun run --cwd apps/web lint
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/documents/[id]/page.tsx" apps/web/components/pdf-viewer.tsx apps/web/components/clinical-record-view.tsx
git commit -m "style(web): migrate detail, viewer, and record to Tailwind"
```

---

### Task 9: Remove bespoke CSS

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: Tasks 7–8 (no component references the bespoke classes).
- Produces: final `globals.css` with only Tailwind import, theme tokens, base rules.

- [ ] **Step 1: Confirm no bespoke class is referenced**

```bash
rg -n "className=\"(page|card|card-title|upload-button|upload-input|muted|success|error|document-list|document-item|document-name|status-badge|status-ready|status-error|document-header|pdf-viewer|pdf-toolbar|pdf-page-indicator|pdf-page|record-view|record-fields|record-list)\b" apps/web
```

Expected: no matches. (The `error` variant used by `role="alert"` styling is now `text-[#d1242f]`; do not confuse it with the `errors` i18n object.)

- [ ] **Step 2: Replace `apps/web/app/globals.css` with the final version**

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans-stack);
  --font-mono: var(--font-mono-stack);
}

:root {
  --background: #ffffff;
  --foreground: #171717;
  --font-sans-stack: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono-stack: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }

  html {
    color-scheme: dark;
  }
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans-stack);
}

a {
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 3: Verify**

```bash
bun run --cwd apps/web lint
bun run --cwd apps/web build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): remove bespoke CSS in favor of Tailwind"
```

---

### Task 10: Remove the scaffold and run the full verification

**Files:**
- Delete: `apps/my-app/` (untracked; no commit)
- Modify: `README.md` only if it references `my-app` (it does not today)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: no references to `my-app`; whole monorepo green.

- [ ] **Step 1: Confirm nothing references the scaffold**

```bash
rg -n "my-app" --glob '!apps/my-app/**' --glob '!bun.lock' .
```

Expected: no matches. If any appear, resolve them before deleting.

- [ ] **Step 2: Delete the scaffold**

```bash
rm -rf apps/my-app
```

Because `apps/my-app` is untracked, `git status` shows no change for it after deletion. Confirm:

```bash
git status --short
```

- [ ] **Step 3: Run the full monorepo verification**

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Expected: all four pass.

- [ ] **Step 4: Manual smoke (requires Docker backends)**

```bash
docker compose --env-file .env -f docker/compose.yaml up -d --build
bun run dev
```

Then, in the browser at `http://localhost:3000`:
- Upload a PDF and watch the list move `Subido → Procesando → Extrayendo información → Listo`.
- Open a document, navigate pages, and exercise zoom in/out.
- Confirm a missing document id renders the not-found page.

(No commit for this task: deleting an untracked directory produces no git change.)
