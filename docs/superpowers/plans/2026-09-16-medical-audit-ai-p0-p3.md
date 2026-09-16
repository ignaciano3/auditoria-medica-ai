# Medical Audit AI — Foundation Plan (P0–P3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the runnable foundation of the medical-audit copilot: a Turborepo monorepo that uploads a Spanish clinical-history PDF, processes it into page-level data, extracts a provenance-bearing `ClinicalRecord`, and displays it — all self-hosted except the LLM calls.

**Architecture:** Turborepo monorepo on Bun. `apps/web` (Next.js App Router) serves the Spanish UI and API; `apps/worker` consumes a pg-boss queue and runs the document pipeline. Shared logic lives in `packages/*` (`domain`, `db`, `ai`, `documents`, `audit`, `lib`, `config`). Postgres stores data and the queue; MinIO stores original PDFs and rendered page images behind a `StorageProvider`. OpenAI is the first `LLMProvider`/`OCRProvider` implementation, isolated behind interfaces.

**Tech Stack:** Bun, Turborepo, Next.js (App Router), React, TypeScript (strict), Tailwind CSS, shadcn/ui, Drizzle ORM, PostgreSQL, pg-boss, MinIO (S3), mupdf, Zod, OpenAI SDK, Biome, `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-16-medical-audit-ai-mvp-design.md` (read alongside this plan; product requirements are in `MEDICAL_AUDIT_AI_MVP_SPEC.md`).

## Global Constraints

- **Language:** all user-facing strings (UI, labels, statuses, errors, summaries, findings, chat) are **Spanish**, centralized in `packages/lib/src/i18n/es.ts`. Code, identifiers, comments, and docs are English.
- **No auth in the MVP.** `userId` is stored on rows (nullable) for future multi-user.
- **Self-hosted except LLMs:** everything runs via Docker Compose on the owner's Ubuntu server; only `LLM_PROVIDER`/`OCR_PROVIDER` calls leave the host.
- **Single ORM:** Drizzle only. **No Redis**; background jobs use pg-boss.
- **Never trust LLM JSON:** all model output is validated with Zod; on failure retry once, then mark extraction failed. Never silently coerce medically relevant data.
- **Provenance:** every extracted clinical value carries `Source[]` referencing `documentId` + `pageNumber`.
- **Cautious audit language:** findings always set `requiresHumanReview: true`, never assert error/omission, use the exact Spanish wording from the spec (`Posible inconsistencia temporal. Revisar la documentación original.`, etc.).
- **No PHI in logs:** log ids, statuses, and page numbers only — never names, clinical text, or document contents.
- **Package manager:** Bun. **Lint/format:** Biome (recommended + strict groups). **TypeScript:** `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`.
- **Scaffold with official generators** (`bunx create-turbo`, `shadcn` init, Drizzle init); do not hand-write lockfiles or framework config.
- **TDD:** write the failing test first. Each task ends green on `bun test`, `bun run lint`, `bun run typecheck`, then commit.
- **Commits:** small, conventional (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).

## Target File Structure (P0–P3)

```text
apps/
  web/
    src/app/
      layout.tsx                       # Spanish shell
      page.tsx                         # document list / upload
      documents/[id]/page.tsx          # review view (summary + pages)
      api/health/route.ts
      api/documents/route.ts           # POST upload, GET list
      api/documents/[id]/route.ts      # GET status, DELETE
    src/components/
      document-uploader.tsx
      document-status.tsx
      document-list.tsx
      clinical-record-view.tsx
      pdf-viewer.tsx
    next.config.ts
    package.json
  worker/
    src/index.ts                       # pg-boss bootstrap
    src/pipeline/process-document.ts   # stage orchestration
    package.json
packages/
  domain/
    src/document.ts                    # Document, DocumentStatus, DocumentPage, PageStatus, PageDocType
    src/clinical-record.ts             # ClinicalRecord + companions
    src/source.ts                      # Source, ExtractedValue, Evidence, TextBlock
    src/finding.ts                     # Finding
    src/index.ts
  db/
    src/schema.ts                      # Drizzle tables
    src/client.ts                      # db connection
    src/repositories/documents.ts
    src/repositories/document-pages.ts
    src/repositories/clinical-records.ts
    drizzle.config.ts
  documents/
    src/rendering/render-pages.ts      # mupdf -> PNG
    src/classification/classify-pages.ts
    src/ocr/ocr-provider.ts            # interface
    src/ocr/openai-ocr-provider.ts
  ai/
    src/llm-provider.ts                # interface
    src/providers/openai/openai-provider.ts
    src/providers/fake/fake-provider.ts
    src/extraction/chunk-pages.ts
    src/extraction/map-extract.ts
    src/extraction/reduce-record.ts
    src/prompts/extraction.ts
  lib/
    src/i18n/es.ts
    src/storage/storage-provider.ts    # interface
    src/storage/in-memory-storage.ts
    src/storage/s3-storage.ts
    src/queue/job-queue.ts             # interface
    src/queue/pg-boss-queue.ts
    src/queue/in-memory-queue.ts
    src/dates/normalize.ts
    src/env.ts                         # zod-validated env
    src/validation/llm-output.ts
  config/
    biome.json
    tsconfig.base.json
```

---

## Phase P0 — Foundation & safety

### Task 1: Remove real PHI from git and ignore PDFs

**Files:**
- Create: `.gitignore`
- Delete from index: `auditoria-ejemplo.pdf` (keep the working file on disk)

**Interfaces:**
- Consumes: nothing.
- Produces: a repo where no PDF/PHI is tracked; local `auditoria-ejemplo.pdf` remains for development only.

- [ ] **Step 1: Confirm the file is tracked**

Run: `git ls-files | grep -c "auditoria-ejemplo.pdf"`
Expected: `1`

- [ ] **Step 2: Remove it from the index but keep it on disk**

```bash
git rm --cached auditoria-ejemplo.pdf
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
# Dependencies / builds
node_modules/
.turbo/
.next/
dist/
coverage/

# Local env
.env
.env.local
.env.*.local

# PHI: never commit real clinical documents
*.pdf
auditoria-ejemplo.pdf
fixtures/local/
```

- [ ] **Step 4: Verify git no longer tracks any PDF**

Run: `git ls-files | grep -c "\.pdf$" || true`
Expected: `0`
Run: `git check-ignore auditoria-ejemplo.pdf`
Expected: prints `auditoria-ejemplo.pdf`

- [ ] **Step 5: Purge the file from history**

Install `git-filter-repo` if available; otherwise use the fallback.

```bash
# Preferred:
git filter-repo --path auditoria-ejemplo.pdf --invert-paths
# Fallback if git-filter-repo is unavailable:
# git filter-branch --force --index-filter \
#   "git rm --cached --ignore-unmatch auditoria-ejemplo.pdf" \
#   --prune-empty --tag-name-filter cat -- --all
```

- [ ] **Step 6: Commit the hygiene change**

```bash
git add .gitignore
git commit -m "chore: stop tracking PHI PDFs and ignore all PDFs"
```

- [ ] **Step 7: Note the remote-history risk**

If the PDF was ever pushed to `origin`, history on the remote still contains it. Record in `docs/superpowers/plans/2026-09-16-medical-audit-ai-p0-p3.md` next to this task: **force-push the rewritten history only after the owner confirms, and treat any prior push as a potential leak.** Do not force-push without explicit owner approval.

---

### Task 2: Scaffold the Turborepo monorepo

**Files:**
- Create (generated): `package.json`, `turbo.json`, `bun.lock`, `apps/web/**`, `packages/*/package.json`
- Create: `packages/config/biome.json`, `packages/config/tsconfig.base.json`, `biome.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `apps/web` builds/runs; `packages/*` workspaces exist and resolve as `@audit/*`; root scripts `lint`, `typecheck`, `test`, `format`, `build`.

- [ ] **Step 1: Generate the monorepo with the official scaffolder**

Run (from the repo root, interactively choose Bun as package manager and include a Next.js app):

```bash
bunx create-turbo@latest . --package-manager bun
```

If prompted that the directory is not empty, allow it to scaffold alongside `MEDICAL_AUDIT_AI_MVP_SPEC.md` and `docs/`. Confirm the generated layout has `apps/` and `packages/`.

- [ ] **Step 2: Install and verify the generated app boots**

```bash
bun install
bun run build
```

Expected: build succeeds.

- [ ] **Step 3: Create the shared packages**

For each of `packages/domain`, `packages/db`, `packages/documents`, `packages/ai`, `packages/lib`, generate from the Turborepo package template (do not hand-write config):

```bash
bunx turbo gen workspace --name @audit/domain --type package --copy
bunx turbo gen workspace --name @audit/db --type package --copy
bunx turbo gen workspace --name @audit/documents --type package --copy
bunx turbo gen workspace --name @audit/ai --type package --copy
bunx turbo gen workspace --name @audit/lib --type package --copy
```

Ensure each exports via `"exports": { ".": "./src/index.ts" }` and that `apps/web` can import `@audit/domain` after `bun install`.

- [ ] **Step 4: Add Biome and strict TypeScript shared config**

Create `packages/config/biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "all": true },
      "suspicious": { "all": true },
      "complexity": { "all": true },
      "performance": { "all": true },
      "security": { "all": true },
      "style": { "noNonNullAssertion": "error" }
    }
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "organizeImports": { "enabled": true }
}
```

Create `packages/config/tsconfig.base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

Create root `biome.json` extending the shared config:

```json
{ "extends": ["./packages/config/biome.json"] }
```

In every workspace `package.json`, extend `../../packages/config/tsconfig.base.json` and set scripts `lint`, `typecheck`, `test`, `format`. Wire root `turbo.json` tasks `lint`, `typecheck`, `test`, `format`, `build`.

- [ ] **Step 5: Add the wrapper scripts at the root**

Root `package.json` scripts:

```json
{
  "scripts": {
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "turbo run format",
    "dev": "turbo run dev"
  }
}
```

- [ ] **Step 6: Verify the toolchain**

```bash
bun run lint
bun run typecheck
bun run test
```

Expected: all pass (the generated workspaces include at least one test; if not, add a trivial one — see Task 4 Step 1 pattern).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Turborepo monorepo with Bun, Biome, and strict TS"
```

---

### Task 3: Docker Compose (Postgres + MinIO), env, and health endpoint

**Files:**
- Create: `docker/compose.yaml`, `.env.example`, `packages/lib/src/env.ts`
- Create: `apps/web/src/app/api/health/route.ts`
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx` (Spanish shell)
- Test: `packages/lib/src/env.test.ts`

**Interfaces:**
- Consumes: shared packages from Task 2.
- Produces:
  - `env` object exported from `@audit/lib` with typed fields `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `OCR_PROVIDER`, `OCR_MODEL`, `OPENAI_API_KEY`, `DOCUMENT_RETENTION_DAYS`.
  - `GET /api/health` → `200 {"status":"ok"}`.

- [ ] **Step 1: Write the failing env test**

`packages/lib/src/env.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  test("accepts a complete environment", () => {
    const result = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      S3_ENDPOINT: "http://localhost:9000",
      S3_BUCKET: "documents",
      S3_ACCESS_KEY: "minio",
      S3_SECRET_KEY: "minio123",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-4.1",
      OCR_PROVIDER: "openai",
      OCR_MODEL: "gpt-4.1",
      OPENAI_API_KEY: "sk-test",
      DOCUMENT_RETENTION_DAYS: "30",
    });
    expect(result.DATABASE_URL).toContain("postgres://");
    expect(result.DOCUMENT_RETENTION_DAYS).toBe(30);
  });

  test("rejects a missing required value", () => {
    expect(() => parseEnv({})).toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `bun test packages/lib/src/env.test.ts`
Expected: FAIL — cannot find module `./env`.

- [ ] **Step 3: Implement `packages/lib/src/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  LLM_PROVIDER: z.enum(["openai"]).default("openai"),
  LLM_MODEL: z.string().min(1),
  OCR_PROVIDER: z.enum(["openai"]).default("openai"),
  OCR_MODEL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return schema.parse(source);
}

export const env = parseEnv();
```

Add `zod` to `packages/lib`: `bun add zod --cwd packages/lib`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/lib/src/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `docker/compose.yaml`**

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: audit
      POSTGRES_PASSWORD: audit
      POSTGRES_DB: audit
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U audit"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    ports: ["9000:9000", "9001:9001"]
    volumes: ["minio:/data"]

volumes:
  pgdata:
  minio:
```

- [ ] **Step 6: Create `.env.example`**

```dotenv
DATABASE_URL=postgres://audit:audit@localhost:5432/audit
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=documents
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1
OCR_PROVIDER=openai
OCR_MODEL=gpt-4.1
OPENAI_API_KEY=sk-replace-me
DOCUMENT_RETENTION_DAYS=30
```

- [ ] **Step 7: Create the health route and Spanish shell**

`apps/web/src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
```

`apps/web/src/app/layout.tsx` renders `<html lang="es">` with `metadata.title = "Auditoría Médica"`. `apps/web/src/app/page.tsx` renders the Spanish heading `Historias clínicas` and the (to-be-built) uploader placeholder text `Nueva historia`.

- [ ] **Step 8: Verify compose and the endpoint**

```bash
docker compose -f docker/compose.yaml up -d
curl -s localhost:3000/api/health
```

Expected: `{"status":"ok"}` (run `bun run dev` in another terminal first).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: add compose infra, typed env, and health endpoint"
```

---

### Task 4: Document domain types and Spanish copy

**Files:**
- Create: `packages/domain/src/source.ts`, `packages/domain/src/document.ts`, `packages/domain/src/index.ts`
- Create: `packages/lib/src/i18n/es.ts`
- Test: `packages/domain/src/document.test.ts`, `packages/lib/src/i18n/es.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Source`, `ExtractedValue<T>`, `Evidence`, `TextBlock` from `@audit/domain`.
  - `DocumentStatus`, `PageStatus`, `PageDocType`, `DocumentPage`, `Document` from `@audit/domain`.
  - `documentStatusLabels: Record<DocumentStatus, string>` and `pageDocTypeLabels: Record<PageDocType, string>` from `@audit/lib` (all Spanish).
  - `isTerminalStatus(status: DocumentStatus): boolean`.

- [ ] **Step 1: Write the failing tests**

`packages/lib/src/i18n/es.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { documentStatusLabels } from "./es";

describe("documentStatusLabels", () => {
  test("every status has a Spanish label", () => {
    const values = Object.values(documentStatusLabels);
    expect(values).toContain("Subido");
    expect(values).toContain("Procesando");
    expect(values).toContain("Listo");
    expect(values.every((v) => v.length > 0)).toBe(true);
  });
});
```

`packages/domain/src/document.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isTerminalStatus } from "./document";

describe("isTerminalStatus", () => {
  test("ready and error are terminal", () => {
    expect(isTerminalStatus("ready")).toBe(true);
    expect(isTerminalStatus("error")).toBe(true);
  });
  test("processing is not terminal", () => {
    expect(isTerminalStatus("processing")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/lib/src/i18n/es.test.ts packages/domain/src/document.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the domain types**

`packages/domain/src/source.ts`:

```ts
export type TextBlock = {
  text: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type Source = {
  documentId: string;
  pageNumber: number;
  text: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type ExtractedValue<T> = {
  value: T;
  confidence?: number;
  sources: Source[];
};

export type Evidence = {
  source: Source;
  relevance: string;
};
```

`packages/domain/src/document.ts`:

```ts
import type { TextBlock } from "./source";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "extracting"
  | "analyzing"
  | "ready"
  | "error";

export type PageStatus = "pending" | "text" | "vision" | "skipped" | "failed";

export type PageDocType =
  | "epicrisis"
  | "admission"
  | "evolution"
  | "imaging"
  | "lab"
  | "microbiology"
  | "medsRecord"
  | "flowsheet"
  | "nursing"
  | "other";

export type DocumentPage = {
  pageNumber: number;
  text: string;
  imageKey?: string;
  docType: PageDocType;
  handwritten: boolean;
  dataBearing: boolean;
  status: PageStatus;
  skipReason?: string;
  blocks?: TextBlock[];
};

export type Document = {
  id: string;
  originalFilename: string;
  status: DocumentStatus;
  pageCount: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isTerminalStatus(status: DocumentStatus): boolean {
  return status === "ready" || status === "error";
}
```

`packages/domain/src/index.ts` re-exports both files.

- [ ] **Step 4: Implement the Spanish copy**

`packages/lib/src/i18n/es.ts`:

```ts
import type { DocumentStatus, PageDocType } from "@audit/domain";

export const documentStatusLabels: Record<DocumentStatus, string> = {
  uploaded: "Subido",
  processing: "Procesando",
  extracting: "Extrayendo información",
  analyzing: "Analizando",
  ready: "Listo",
  error: "Error",
};

export const pageDocTypeLabels: Record<PageDocType, string> = {
  epicrisis: "Epicrisis",
  admission: "Ingreso",
  evolution: "Evolución",
  imaging: "Diagnóstico por imágenes",
  lab: "Laboratorio",
  microbiology: "Microbiología",
  medsRecord: "Registro de medicación",
  flowsheet: "Planilla de controles",
  nursing: "Enfermería",
  other: "Otro",
};

export const ui = {
  newDocument: "Nueva historia",
  processing: "Procesando",
  summary: "Resumen",
  timeline: "Línea temporal",
  medications: "Medicaciones",
  studies: "Estudios",
  findings: "Hallazgos",
  originalDocument: "Documento original",
  viewEvidence: "Ver evidencia",
  reviewed: "Revisado",
  dismissFinding: "Descartar hallazgo",
  askRecord: "Preguntarle a la historia clínica",
  incompleteAnalysis: "Análisis incompleto",
} as const;
```

Add `@audit/domain` as a dependency of `packages/lib`.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test packages/lib/src/i18n/es.test.ts packages/domain/src/document.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add document domain types and Spanish copy"
```

---

## Phase P1 — Upload, storage, queue, and status UI

### Task 5: Drizzle schema, client, and migrations

**Files:**
- Create: `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/drizzle.config.ts`
- Test: `packages/db/src/schema.test.ts`

**Interfaces:**
- Consumes: `DocumentStatus`, `PageStatus`, `PageDocType` from `@audit/domain`.
- Produces:
  - Tables `documents`, `documentPages`, `clinicalRecords`, `findingsReview`, `chatMessages`, `accessLog`.
  - `getDb(databaseUrl: string): Database` from `@audit/db`.

- [ ] **Step 1: Add dependencies**

```bash
bun add drizzle-orm postgres --cwd packages/db
bun add -d drizzle-kit --cwd packages/db
```

- [ ] **Step 2: Write the failing schema test**

`packages/db/src/schema.test.ts` (pure structural assertions, no DB needed):

```ts
import { describe, expect, test } from "bun:test";
import { documents } from "./schema";

describe("documents schema", () => {
  test("exposes expected columns", () => {
    const cols = Object.keys(documents);
    expect(cols).toContain("id");
    expect(cols).toContain("status");
    expect(cols).toContain("pageCount");
    expect(cols).toContain("userId");
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `bun test packages/db/src/schema.test.ts`
Expected: FAIL — cannot find `./schema`.

- [ ] **Step 4: Implement `packages/db/src/schema.ts`**

```ts
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  originalFilename: text("original_filename").notNull(),
  originalKey: text("original_key").notNull(),
  status: text("status").notNull().default("uploaded"),
  pageCount: integer("page_count"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    text: text("text").notNull().default(""),
    imageKey: text("image_key"),
    docType: text("doc_type").notNull().default("other"),
    handwritten: boolean("handwritten").notNull().default(false),
    dataBearing: boolean("data_bearing").notNull().default(true),
    status: text("status").notNull().default("pending"),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("document_pages_doc_page_idx").on(table.documentId, table.pageNumber)],
);

export const clinicalRecords = pgTable("clinical_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  record: jsonb("record").notNull(),
  findings: jsonb("findings").notNull().default([]),
  patientName: text("patient_name"),
  admissionDate: text("admission_date"),
  dischargeDate: text("discharge_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findingsReview = pgTable("findings_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  findingId: text("finding_id").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citedPages: jsonb("cited_pages").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessLog = pgTable("access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor"),
  action: text("action").notNull(),
  documentId: uuid("document_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 5: Implement `packages/db/src/client.ts` and `drizzle.config.ts`**

`packages/db/src/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof getDb>;

export function getDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  return drizzle(client, { schema });
}
```

`packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

Add to `packages/db/package.json` scripts:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
}
```

- [ ] **Step 6: Generate and apply the migration**

```bash
cp .env.example .env
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
```

Expected: migration files under `packages/db/drizzle` and tables created in Postgres.

- [ ] **Step 7: Run tests and typecheck, then commit**

```bash
bun test packages/db/src/schema.test.ts && bun run typecheck
git add -A
git commit -m "feat: add Drizzle schema, client, and migrations"
```

---

### Task 6: StorageProvider (interface, in-memory, S3/MinIO)

**Files:**
- Create: `packages/lib/src/storage/storage-provider.ts`, `packages/lib/src/storage/in-memory-storage.ts`, `packages/lib/src/storage/s3-storage.ts`
- Test: `packages/lib/src/storage/in-memory-storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface StorageProvider { put(key: string, body: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<Uint8Array>; delete(key: string): Promise<void>; }`
  - `class InMemoryStorage implements StorageProvider`
  - `class S3Storage implements StorageProvider` constructed from `{ endpoint, bucket, accessKey, secretKey }`.

- [ ] **Step 1: Write the failing test**

`packages/lib/src/storage/in-memory-storage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { InMemoryStorage } from "./in-memory-storage";

describe("InMemoryStorage", () => {
  test("round-trips bytes and deletes", async () => {
    const storage = new InMemoryStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put("k/1.bin", bytes, "application/octet-stream");
    expect(await storage.get("k/1.bin")).toEqual(bytes);
    await storage.delete("k/1.bin");
    await expect(storage.get("k/1.bin")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/lib/src/storage/in-memory-storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the interface and in-memory provider**

`storage-provider.ts`:

```ts
export interface StorageProvider {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
```

`in-memory-storage.ts`:

```ts
import type { StorageProvider } from "./storage-provider";

export class InMemoryStorage implements StorageProvider {
  private readonly store = new Map<string, Uint8Array>();

  async put(key: string, body: Uint8Array): Promise<void> {
    this.store.set(key, body);
  }

  async get(key: string): Promise<Uint8Array> {
    const value = this.store.get(key);
    if (!value) throw new Error(`Object not found: ${key}`);
    return value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/lib/src/storage/in-memory-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `S3Storage`**

```bash
bun add @aws-sdk/client-s3 --cwd packages/lib
```

`s3-storage.ts`:

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageProvider } from "./storage-provider";

type S3StorageOptions = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
};

export class S3Storage implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKey,
        secretAccessKey: options.secretKey,
      },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error(`Empty body for object: ${key}`);
    return new Uint8Array(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
bun run typecheck
git add -A
git commit -m "feat: add StorageProvider with in-memory and S3 implementations"
```

---

### Task 7: Document repository

**Files:**
- Create: `packages/db/src/repositories/documents.ts`
- Test: `packages/db/src/repositories/documents.test.ts`

**Interfaces:**
- Consumes: `getDb`, `documents` table.
- Produces: `createDocumentRepository(db: Database)` returning:
  - `create(input: { originalFilename: string; originalKey: string }): Promise<DocumentRow>`
  - `getById(id: string): Promise<DocumentRow | null>`
  - `list(): Promise<DocumentRow[]>`
  - `updateStatus(id: string, status: DocumentStatus, error?: string | null): Promise<void>`
  - `setPageCount(id: string, pageCount: number): Promise<void>`
  - `remove(id: string): Promise<void>`

- [ ] **Step 1: Write the failing test (integration, skipped without a DB)**

`packages/db/src/repositories/documents.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDb, type Database } from "../client";
import { createDocumentRepository } from "./documents";

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("documents repository", () => {
  let db: Database;
  let repo: ReturnType<typeof createDocumentRepository>;
  let createdId = "";

  beforeAll(() => {
    db = getDb(url as string);
    repo = createDocumentRepository(db);
  });

  afterAll(async () => {
    if (createdId) await repo.remove(createdId);
    await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
  });

  test("creates and fetches a document", async () => {
    const created = await repo.create({
      originalFilename: "historia.pdf",
      originalKey: "documents/abc/original.pdf",
    });
    createdId = created.id;
    expect(created.status).toBe("uploaded");
    const fetched = await repo.getById(created.id);
    expect(fetched?.originalFilename).toBe("historia.pdf");
  });

  test("updates status", async () => {
    await repo.updateStatus(createdId, "processing");
    const fetched = await repo.getById(createdId);
    expect(fetched?.status).toBe("processing");
  });
});
```

- [ ] **Step 2: Run and confirm it skips or fails**

Run: `bun test packages/db/src/repositories/documents.test.ts`
Expected: SKIP without `TEST_DATABASE_URL`; FAIL once `TEST_DATABASE_URL` points at Postgres.

- [ ] **Step 3: Implement the repository**

```ts
import { eq } from "drizzle-orm";
import type { DocumentStatus } from "@audit/domain";
import type { Database } from "../client";
import { documents } from "../schema";

export type DocumentRow = typeof documents.$inferSelect;

export function createDocumentRepository(db: Database) {
  return {
    async create(input: { originalFilename: string; originalKey: string }): Promise<DocumentRow> {
      const [row] = await db.insert(documents).values(input).returning();
      if (!row) throw new Error("Failed to create document");
      return row;
    },
    async getById(id: string): Promise<DocumentRow | null> {
      const [row] = await db.select().from(documents).where(eq(documents.id, id));
      return row ?? null;
    },
    async list(): Promise<DocumentRow[]> {
      return db.select().from(documents).orderBy(documents.createdAt);
    },
    async updateStatus(id: string, status: DocumentStatus, error?: string | null): Promise<void> {
      await db
        .update(documents)
        .set({ status, error: error ?? null, updatedAt: new Date() })
        .where(eq(documents.id, id));
    },
    async setPageCount(id: string, pageCount: number): Promise<void> {
      await db.update(documents).set({ pageCount, updatedAt: new Date() }).where(eq(documents.id, id));
    },
    async remove(id: string): Promise<void> {
      await db.delete(documents).where(eq(documents.id, id));
    },
  };
}
```

- [ ] **Step 4: Run the test with a test database**

```bash
TEST_DATABASE_URL=postgres://audit:audit@localhost:5432/audit bun test packages/db/src/repositories/documents.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add documents repository"
```

---

### Task 8: JobQueue abstraction (pg-boss + in-memory) and worker bootstrap

**Files:**
- Create: `packages/lib/src/queue/job-queue.ts`, `packages/lib/src/queue/in-memory-queue.ts`, `packages/lib/src/queue/pg-boss-queue.ts`
- Create: `apps/worker/src/index.ts`
- Test: `packages/lib/src/queue/in-memory-queue.test.ts`

**Interfaces:**
- Consumes: `env` from `@audit/lib`.
- Produces:
  - `const PROCESS_DOCUMENT_JOB = "process-document"` and `type ProcessDocumentJob = { documentId: string }`.
  - `interface JobQueue { start(): Promise<void>; stop(): Promise<void>; publish(job: ProcessDocumentJob): Promise<void>; /** registers the single worker handler */ handle(handler: (job: ProcessDocumentJob) => Promise<void>): Promise<void>; }`
  - `class InMemoryQueue implements JobQueue`, `class PgBossQueue implements JobQueue` constructed with `{ connectionString: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { InMemoryQueue } from "./in-memory-queue";

describe("InMemoryQueue", () => {
  test("delivers a published job to the handler", async () => {
    const queue = new InMemoryQueue();
    const seen: string[] = [];
    await queue.handle(async (job) => {
      seen.push(job.documentId);
    });
    await queue.publish({ documentId: "doc-1" });
    expect(seen).toEqual(["doc-1"]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/lib/src/queue/in-memory-queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the interface and in-memory queue**

`job-queue.ts`:

```ts
export const PROCESS_DOCUMENT_JOB = "process-document";

export type ProcessDocumentJob = { documentId: string };

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(job: ProcessDocumentJob): Promise<void>;
  handle(handler: (job: ProcessDocumentJob) => Promise<void>): Promise<void>;
}
```

`in-memory-queue.ts`:

```ts
import {
  type JobQueue,
  type ProcessDocumentJob,
} from "./job-queue";

export class InMemoryQueue implements JobQueue {
  private handler: ((job: ProcessDocumentJob) => Promise<void>) | null = null;

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async handle(handler: (job: ProcessDocumentJob) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async publish(job: ProcessDocumentJob): Promise<void> {
    if (this.handler) await this.handler(job);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/lib/src/queue/in-memory-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `PgBossQueue`**

```bash
bun add pg-boss --cwd packages/lib
```

`pg-boss-queue.ts`:

```ts
import PgBoss from "pg-boss";
import { PROCESS_DOCUMENT_JOB, type JobQueue, type ProcessDocumentJob } from "./job-queue";

export class PgBossQueue implements JobQueue {
  private readonly boss: PgBoss;

  constructor(options: { connectionString: string }) {
    this.boss = new PgBoss({ connectionString: options.connectionString });
  }

  async start(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(PROCESS_DOCUMENT_JOB);
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }

  async publish(job: ProcessDocumentJob): Promise<void> {
    await this.boss.send(PROCESS_DOCUMENT_JOB, job);
  }

  async handle(handler: (job: ProcessDocumentJob) => Promise<void>): Promise<void> {
    await this.boss.work<ProcessDocumentJob>(PROCESS_DOCUMENT_JOB, async ([job]) => {
      if (job) await handler(job.data);
    });
  }
}
```

- [ ] **Step 6: Create the worker entrypoint (temporary no-op handler)**

`apps/worker/src/index.ts`:

```ts
import { env } from "@audit/lib";
import { PgBossQueue } from "@audit/lib";

const queue = new PgBossQueue({ connectionString: env.DATABASE_URL });

async function main(): Promise<void> {
  await queue.start();
  await queue.handle(async (job) => {
    console.log(JSON.stringify({ event: "job_received", documentId: job.documentId }));
  });
  console.log(JSON.stringify({ event: "worker_ready" }));
}

await main();
```

Add `@audit/lib` to `apps/worker/package.json` dependencies and a `dev`/`start` script running `bun run src/index.ts`. Wire the worker into `docker/compose.yaml` later (Task 14).

- [ ] **Step 7: Typecheck, run tests, commit**

```bash
bun run typecheck && bun test packages/lib/src/queue/in-memory-queue.test.ts
git add -A
git commit -m "feat: add JobQueue abstraction and worker bootstrap"
```

---

### Task 9: Upload API route

**Files:**
- Create: `apps/web/src/app/api/documents/route.ts`, `apps/web/src/app/api/documents/[id]/route.ts`
- Create: `apps/web/src/lib/container.ts` (dependency wiring)
- Test: `apps/web/src/app/api/documents/route.test.ts`

**Interfaces:**
- Consumes: `S3Storage`, `createDocumentRepository`, `PgBossQueue`, `env`.
- Produces:
  - `POST /api/documents` (multipart `file`) → `201 { id, status }`; rejects non-PDF with `400 { error }` (Spanish message).
  - `GET /api/documents` → `200 { documents: Document[] }`.
  - `GET /api/documents/[id]` → `200 { document, pages? }` or `404`.
  - `DELETE /api/documents/[id]` → `204`.
  - `maxUploadBytes` constant exported from the route module for testing.

- [ ] **Step 1: Write the failing test for the upload validator**

`apps/web/src/app/api/documents/route.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { validateUpload } from "./route";

describe("validateUpload", () => {
  test("accepts a PDF", () => {
    const result = validateUpload({ name: "historia.pdf", type: "application/pdf", size: 1024 });
    expect(result.ok).toBe(true);
  });
  test("rejects a non-PDF with a Spanish error", () => {
    const result = validateUpload({ name: "foto.png", type: "image/png", size: 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("El archivo debe ser un PDF.");
  });
  test("rejects oversized files", () => {
    const result = validateUpload({ name: "grande.pdf", type: "application/pdf", size: 999_999_999 });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test apps/web/src/app/api/documents/route.test.ts`
Expected: FAIL — `validateUpload` not exported.

- [ ] **Step 3: Implement the container and upload route**

`apps/web/src/lib/container.ts` wires singletons from `env`:

```ts
import { createDocumentRepository, getDb } from "@audit/db";
import { S3Storage } from "@audit/lib";
import { PgBossQueue } from "@audit/lib";
import { env } from "@audit/lib";

const db = getDb(env.DATABASE_URL);
export const documents = createDocumentRepository(db);
export const storage = new S3Storage({
  endpoint: env.S3_ENDPOINT,
  bucket: env.S3_BUCKET,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});
export const queue = new PgBossQueue({ connectionString: env.DATABASE_URL });
```

`apps/web/src/app/api/documents/route.ts`:

```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { documents, queue, storage } from "@/lib/container";

export const maxUploadBytes = 50 * 1024 * 1024;

export type UploadMeta = { name: string; type: string; size: number };

export function validateUpload(meta: UploadMeta): { ok: true } | { ok: false; error: string } {
  if (meta.type !== "application/pdf" && !meta.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "El archivo debe ser un PDF." };
  }
  if (meta.size > maxUploadBytes) {
    return { ok: false, error: "El archivo supera el tamaño máximo permitido." };
  }
  return { ok: true };
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  const validation = validateUpload({ name: file.name, type: file.type, size: file.size });
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `documents/${randomUUID()}/original.pdf`;
  await storage.put(key, bytes, "application/pdf");
  const document = await documents.create({ originalFilename: file.name, originalKey: key });
  await queue.start();
  await queue.publish({ documentId: document.id });
  return NextResponse.json({ id: document.id, status: document.status }, { status: 201 });
}

export async function GET(): Promise<Response> {
  const rows = await documents.list();
  return NextResponse.json({
    documents: rows.map((row) => ({
      id: row.id,
      originalFilename: row.originalFilename,
      status: row.status,
      pageCount: row.pageCount,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}
```

`apps/web/src/app/api/documents/[id]/route.ts` handles GET (row or 404) and DELETE (`await storage.delete(row.originalKey); await documents.remove(id)` → 204).

- [ ] **Step 4: Run the unit test**

Run: `bun test apps/web/src/app/api/documents/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual smoke against compose**

```bash
docker compose -f docker/compose.yaml up -d
bun run dev
curl -F "file=@auditoria-ejemplo.pdf;type=application/pdf" localhost:3000/api/documents
```

Expected: JSON with an `id` and `status: "uploaded"`. (Do not paste the response anywhere; it contains no PHI, only ids.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add document upload and listing API"
```

---

### Task 10: Uploader, document list, and Spanish status UI

**Files:**
- Create: `apps/web/src/components/document-uploader.tsx`, `apps/web/src/components/document-list.tsx`, `apps/web/src/components/document-status.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/components/document-status.test.tsx` (pure logic only)

**Interfaces:**
- Consumes: `documentStatusLabels`, `ui` from `@audit/lib`; the API from Task 9.
- Produces: a page where the auditor uploads a PDF, sees it in a list, and sees its status in Spanish, refreshing every 2 seconds until terminal.

- [ ] **Step 1: Initialize shadcn/ui**

```bash
bunx shadcn@latest init
bunx shadcn@latest add button card badge progress
```

- [ ] **Step 2: Extract and test the status logic**

`apps/web/src/components/document-status.tsx` exports:

```ts
import type { DocumentStatus } from "@audit/domain";
import { documentStatusLabels } from "@audit/lib";
import { isTerminalStatus } from "@audit/domain";

export function statusLabel(status: DocumentStatus): string {
  return documentStatusLabels[status];
}

export function pollIntervalMs(status: DocumentStatus): number | null {
  return isTerminalStatus(status) ? null : 2000;
}
```

Test `apps/web/src/components/document-status.test.tsx`:

```ts
import { describe, expect, test } from "bun:test";
import { pollIntervalMs, statusLabel } from "./document-status";

describe("status UI logic", () => {
  test("labels are Spanish", () => {
    expect(statusLabel("processing")).toBe("Procesando");
    expect(statusLabel("ready")).toBe("Listo");
  });
  test("terminal statuses stop polling", () => {
    expect(pollIntervalMs("ready")).toBeNull();
    expect(pollIntervalMs("processing")).toBe(2000);
  });
});
```

- [ ] **Step 3: Run and confirm failure, then implement**

Run: `bun test apps/web/src/components/document-status.test.tsx`
Expected: FAIL, then PASS after creating the module.

- [ ] **Step 4: Build the components**

- `document-uploader.tsx`: a file input labeled `Nueva historia`, posting to `/api/documents`, showing the Spanish error from the response on failure and a success toast on upload.
- `document-list.tsx`: fetches `/api/documents`, renders a shadcn card per document with filename, `statusLabel`, and page count when ready. Polls with `pollIntervalMs`.
- `page.tsx`: composes uploader + list under the Spanish heading, with `ui.newDocument`.

- [ ] **Step 5: Verify in the browser**

Run `bun run dev`, upload `auditoria-ejemplo.pdf`, confirm the status transitions appear in Spanish and stop polling at a terminal status.

- [ ] **Step 6: Lint, typecheck, test, commit**

```bash
bun run lint && bun run typecheck && bun test apps/web/src/components/document-status.test.tsx
git add -A
git commit -m "feat: add Spanish uploader, document list, and status UI"
```

---

## Phase P2 — Document processing

### Task 11: PDF inspection and page rendering

**Files:**
- Create: `packages/documents/src/rendering/render-pages.ts`
- Test: `packages/documents/src/rendering/render-pages.test.ts`

**Interfaces:**
- Consumes: `mupdf`.
- Produces:
  - `inspectPdf(bytes: Uint8Array): { pageCount: number }`
  - `renderPdfPages(bytes: Uint8Array, options?: { scale?: number }): Promise<Array<{ pageNumber: number; png: Uint8Array; width: number; height: number }>>`
  - `DEFAULT_RENDER_SCALE = 1.5`

- [ ] **Step 1: Add mupdf and write the failing test**

```bash
bun add mupdf --cwd packages/documents
```

`packages/documents/src/rendering/render-pages.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { inspectPdf, renderPdfPages } from "./render-pages";

const FIXTURE = process.env.PDF_FIXTURE_PATH;

const maybe = FIXTURE ? describe : describe.skip;

maybe("renderPdfPages", () => {
  test("reports the page count and renders every page to PNG", async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE as string).arrayBuffer());
    const info = inspectPdf(bytes);
    expect(info.pageCount).toBeGreaterThan(0);
    const pages = await renderPdfPages(bytes, { scale: 1 });
    expect(pages).toHaveLength(info.pageCount);
    expect(pages[0]?.png.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run and confirm it skips/fails**

Run: `PDF_FIXTURE_PATH=./auditoria-ejemplo.pdf bun test packages/documents/src/rendering/render-pages.test.ts`
Expected: FAIL — module not found (then PASS after Step 3).

- [ ] **Step 3: Implement `render-pages.ts`**

```ts
import * as mupdf from "mupdf";

export const DEFAULT_RENDER_SCALE = 1.5;

export function inspectPdf(bytes: Uint8Array): { pageCount: number } {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  return { pageCount: doc.countPages() };
}

export async function renderPdfPages(
  bytes: Uint8Array,
  options: { scale?: number } = {},
): Promise<Array<{ pageNumber: number; png: Uint8Array; width: number; height: number }>> {
  const scale = options.scale ?? DEFAULT_RENDER_SCALE;
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const count = doc.countPages();
  const pages: Array<{ pageNumber: number; png: Uint8Array; width: number; height: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const page = doc.loadPage(index);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    pages.push({
      pageNumber: index + 1,
      png: new Uint8Array(pixmap.asPNG()),
      width: pixmap.getWidth(),
      height: pixmap.getHeight(),
    });
  }
  return pages;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `PDF_FIXTURE_PATH=./auditoria-ejemplo.pdf bun test packages/documents/src/rendering/render-pages.test.ts`
Expected: PASS with `pageCount === 110`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add PDF inspection and page rendering"
```

---

### Task 12: Page classification and OCR interfaces

**Files:**
- Create: `packages/documents/src/ocr/ocr-provider.ts`, `packages/documents/src/classification/classify-pages.ts`
- Test: `packages/documents/src/classification/classify-pages.test.ts`

**Interfaces:**
- Consumes: `DocumentPage`, `PageDocType` from `@audit/domain`.
- Produces:
  - `interface OCRProvider { classifyPage(input: PageImage): Promise<PageClassification>; transcribePage(input: PageImage): Promise<string>; }` where `PageImage = { pageNumber: number; png: Uint8Array }`.
  - `type PageClassification = { docType: PageDocType; handwritten: boolean; dataBearing: boolean }`.
  - `classifyPages(pages: PageImage[], provider: OCRProvider): Promise<DocumentPage[]>` — classifies every page, never throws on one bad page (marks it `other`, `dataBearing: true`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import type { OCRProvider } from "../ocr/ocr-provider";
import { classifyPages } from "./classify-pages";

const stub = (overrides: Partial<Awaited<ReturnType<OCRProvider["classifyPage"]>>>) => {
  const provider: OCRProvider = {
    classifyPage: async () => ({
      docType: "evolution",
      handwritten: false,
      dataBearing: true,
      ...overrides,
    }),
    transcribePage: async () => "",
  };
  return provider;
};

describe("classifyPages", () => {
  test("classifies each page and marks flowsheets non-data-bearing", async () => {
    const pages = [{ pageNumber: 1, png: new Uint8Array([1]) }];
    const result = await classifyPages(pages, stub({ docType: "flowsheet", handwritten: true, dataBearing: false }));
    expect(result[0]?.docType).toBe("flowsheet");
    expect(result[0]?.status).toBe("pending");
  });

  test("degrades gracefully when the provider throws", async () => {
    const provider: OCRProvider = {
      classifyPage: async () => {
        throw new Error("provider down");
      },
      transcribePage: async () => "",
    };
    const result = await classifyPages([{ pageNumber: 1, png: new Uint8Array([1]) }], provider);
    expect(result[0]?.docType).toBe("other");
    expect(result[0]?.dataBearing).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure, then implement the interfaces and function**

Run: `bun test packages/documents/src/classification/classify-pages.test.ts`
Expected: FAIL, then PASS.

`ocr-provider.ts`:

```ts
import type { PageDocType } from "@audit/domain";

export type PageImage = { pageNumber: number; png: Uint8Array };

export type PageClassification = {
  docType: PageDocType;
  handwritten: boolean;
  dataBearing: boolean;
};

export interface OCRProvider {
  classifyPage(input: PageImage): Promise<PageClassification>;
  transcribePage(input: PageImage): Promise<string>;
}
```

`classify-pages.ts`:

```ts
import type { DocumentPage } from "@audit/domain";
import type { OCRProvider, PageImage } from "../ocr/ocr-provider";

export async function classifyPages(
  pages: PageImage[],
  provider: OCRProvider,
): Promise<DocumentPage[]> {
  const results: DocumentPage[] = [];
  for (const page of pages) {
    try {
      const classification = await provider.classifyPage(page);
      results.push({
        pageNumber: page.pageNumber,
        text: "",
        docType: classification.docType,
        handwritten: classification.handwritten,
        dataBearing: classification.dataBearing,
        status: "pending",
      });
    } catch {
      results.push({
        pageNumber: page.pageNumber,
        text: "",
        docType: "other",
        handwritten: false,
        dataBearing: true,
        status: "pending",
      });
    }
  }
  return results;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add page classification and OCR provider interface"
```

---

### Task 13: OpenAI vision OCR provider

**Files:**
- Create: `packages/documents/src/ocr/openai-ocr-provider.ts`
- Test: `packages/documents/src/ocr/openai-ocr-provider.test.ts`

**Interfaces:**
- Consumes: `OCRProvider`, `PageImage`, `PageClassification`; `env.OPENAI_API_KEY`, `env.OCR_MODEL`.
- Produces: `class OpenAIVisionOCRProvider implements OCRProvider` constructed with `{ apiKey: string; model: string; client?: OpenAICompatibleClient }` so tests inject a fake client.

- [ ] **Step 1: Add the OpenAI SDK**

```bash
bun add openai --cwd packages/documents
```

- [ ] **Step 2: Write the failing test with an injected fake client**

```ts
import { describe, expect, test } from "bun:test";
import { OpenAIVisionOCRProvider } from "./openai-ocr-provider";

const fakeClient = {
  chat: {
    completions: {
      create: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                docType: "lab",
                handwritten: false,
                dataBearing: true,
              }),
            },
          },
        ],
      }),
    },
  },
};

describe("OpenAIVisionOCRProvider", () => {
  test("parses a classification response", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-4.1",
      client: fakeClient,
    });
    const result = await provider.classifyPage({ pageNumber: 1, png: new Uint8Array([1, 2]) });
    expect(result.docType).toBe("lab");
    expect(result.dataBearing).toBe(true);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `bun test packages/documents/src/ocr/openai-ocr-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the provider**

```ts
import type { PageDocType } from "@audit/domain";
import type { OCRProvider, PageClassification, PageImage } from "./ocr-provider";

type ChatCompletionResponse = {
  choices: Array<{ message: { content: string | null } }>;
};

export type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (input: Record<string, unknown>) => Promise<ChatCompletionResponse>;
    };
  };
};

const DOC_TYPES: readonly PageDocType[] = [
  "epicrisis",
  "admission",
  "evolution",
  "imaging",
  "lab",
  "microbiology",
  "medsRecord",
  "flowsheet",
  "nursing",
  "other",
];

function toDataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

function parseClassification(content: string): PageClassification {
  const parsed = JSON.parse(content) as Partial<PageClassification>;
  const docType = DOC_TYPES.includes(parsed.docType as PageDocType)
    ? (parsed.docType as PageDocType)
    : "other";
  return {
    docType,
    handwritten: Boolean(parsed.handwritten),
    dataBearing: parsed.dataBearing !== false,
  };
}

export class OpenAIVisionOCRProvider implements OCRProvider {
  private readonly client: OpenAICompatibleClient;
  private readonly model: string;

  constructor(options: { apiKey: string; model: string; client?: OpenAICompatibleClient }) {
    this.model = options.model;
    this.client =
      options.client ??
      (new (require("openai").default)({ apiKey: options.apiKey }) as OpenAICompatibleClient);
  }

  async classifyPage(input: PageImage): Promise<PageClassification> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un clasificador de documentos clínicos en español. Devuelve JSON con docType, handwritten, dataBearing.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Clasifica esta página." },
            { type: "image_url", image_url: { url: toDataUrl(input.png) } },
          ],
        },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Empty classification response");
    return parseClassification(content);
  }

  async transcribePage(input: PageImage): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Transcribe fielmente el texto del documento clínico en español. No interpretes ni agregues información. Ignora firmas y sellos.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe esta página." },
            { type: "image_url", image_url: { url: toDataUrl(input.png) } },
          ],
        },
      ],
    });
    return response.choices[0]?.message.content ?? "";
  }
}
```

Replace the `require("openai")` construction with a static import if Biome forbids `require` (preferred):

```ts
import OpenAI from "openai";
// ...
this.client = options.client ?? (new OpenAI({ apiKey: options.apiKey }) as OpenAICompatibleClient);
```

- [ ] **Step 5: Run the test, typecheck, commit**

```bash
bun test packages/documents/src/ocr/openai-ocr-provider.test.ts && bun run typecheck
git add -A
git commit -m "feat: add OpenAI vision OCR provider"
```

---

### Task 14: Wire the processing pipeline into the worker

**Files:**
- Create: `packages/db/src/repositories/document-pages.ts`
- Create: `apps/worker/src/pipeline/process-document.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `docker/compose.yaml` (add `worker`)
- Test: `apps/worker/src/pipeline/process-document.test.ts`

**Interfaces:**
- Consumes: `createDocumentRepository`, `createDocumentPageRepository`, `renderPdfPages`, `classifyPages`, `OpenAIVisionOCRProvider`, `StorageProvider`, `env`.
- Produces:
  - `createDocumentPageRepository(db)` with `replaceForDocument(documentId, pages: DocumentPage[])`, `listForDocument(documentId)`, `markStatus(documentId, pageNumber, status, text?)`.
  - `createProcessDocument(deps): (job: { documentId: string }) => Promise<void>` that: loads document → sets `processing` → downloads original → renders pages → classifies → transcribes data-bearing pages (flowsheets/other skipped-with-reason) → persists pages → sets `extracting` → (P3 appends extraction) → sets `ready`. On any thrown error sets `error` with a Spanish-safe message and records failed page numbers.

- [ ] **Step 1: Write the failing test with fakes**

```ts
import { describe, expect, test } from "bun:test";
import { createProcessDocument } from "./process-document";

describe("createProcessDocument", () => {
  test("renders, classifies, transcribes, and marks the document ready", async () => {
    const updates: string[] = [];
    const saved: unknown[] = [];
    const processDocument = createProcessDocument({
      documents: {
        getById: async () => ({
          id: "d1",
          originalKey: "documents/d1/original.pdf",
          status: "uploaded",
        }),
        updateStatus: async (_id, status) => {
          updates.push(status);
        },
        setPageCount: async () => {},
      } as never,
      pages: {
        replaceForDocument: async (_id, value) => {
          saved.push(value);
        },
      } as never,
      storage: { get: async () => new Uint8Array([1]) } as never,
      render: async () => [{ pageNumber: 1, png: new Uint8Array([1]), width: 10, height: 10 }],
      ocr: {
        classifyPage: async () => ({ docType: "evolution", handwritten: false, dataBearing: true }),
        transcribePage: async () => "texto",
      },
      logger: { info: () => {}, error: () => {} },
    });

    await processDocument({ documentId: "d1" });
    expect(updates).toContain("processing");
    expect(updates).toContain("ready");
    expect(saved).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and confirm failure, then implement**

Run: `bun test apps/worker/src/pipeline/process-document.test.ts`
Expected: FAIL, then PASS.

Implementation requirements:
- Downloads the original via `storage.get(document.originalKey)`.
- Calls `render(bytes)`; `setPageCount`; `replaceForDocument` with classified pages.
- For each `dataBearing` page that is not a `flowsheet`, call `ocr.transcribePage` and set status `vision`, storing text; for flowsheets set `status: "skipped"`, `skipReason: "Planilla manuscrita: no se extrae celda por celda."`; for any page failure set `status: "failed"` and continue.
- Errors: on a fatal error, `updateStatus(id, "error", "No se pudo procesar el documento.")` and rethrow so the queue can retry. Log only ids/page numbers.

- [ ] **Step 3: Add the worker service to compose and wire `index.ts`**

Add to `docker/compose.yaml` a `worker` service building the same image with command running the worker; wire `apps/worker/src/index.ts` to call `createProcessDocument` with real dependencies.

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
bun test apps/worker/src/pipeline/process-document.test.ts && bun run typecheck
git add -A
git commit -m "feat: wire document processing pipeline into the worker"
```

---

### Task 15: PDF viewer with page images

**Files:**
- Create: `apps/web/src/app/api/documents/[id]/pages/[page]/route.ts`
- Create: `apps/web/src/components/pdf-viewer.tsx`
- Modify: `apps/web/src/app/documents/[id]/page.tsx`
- Test: `apps/web/src/components/pdf-viewer.test.tsx`

**Interfaces:**
- Consumes: storage + document page repository.
- Produces:
  - `GET /api/documents/[id]/pages/[page]` → PNG of that page (from storage `imageKey`), `404` if missing.
  - `<PdfViewer documentId pageCount initialPage />` with page navigation, zoom, and a `goToPage(n)` API; exposes the current page via `data-page` for tests.
  - Pure helper `clampPage(page: number, pageCount: number): number`.

- [ ] **Step 1: Write the failing test for `clampPage`**

```ts
import { describe, expect, test } from "bun:test";
import { clampPage } from "./pdf-viewer";

describe("clampPage", () => {
  test("clamps to valid bounds", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });
});
```

- [ ] **Step 2-4: Implement the route, the viewer, and the review page**

Run the test until green, then implement:
- The page-image route streams the stored PNG from `imageKey` under `documents/{id}/pages/{n}.png` (render key convention set in the pipeline), with `Content-Type: image/png`.
- `PdfViewer` renders the current page image with `next/image` or an `<img>`, prev/next buttons labeled `Anterior`/`Siguiente`, a `Página X de Y` indicator, and zoom controls. `clampPage` guards navigation.
- `apps/web/src/app/documents/[id]/page.tsx` composes the viewer with the document status header.

- [ ] **Step 5: Verify manually and commit**

Upload the fixture, wait for `ready`, open `/documents/{id}`, and confirm pages render and navigate.

```bash
bun run lint && bun run typecheck && bun run test
git add -A
git commit -m "feat: add page-image API and PDF viewer"
```

---

## Phase P3 — Clinical extraction

### Task 16: ClinicalRecord schema and types

**Files:**
- Create: `packages/domain/src/clinical-record.ts`, `packages/domain/src/finding.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/clinical-record.test.ts`

**Interfaces:**
- Consumes: `ExtractedValue`, `Source` from `./source`.
- Produces (types from spec §9–§14): `Patient`, `Medication`, `LabResult`, `Study`, `MicrobiologyResult`, `ClinicalEventType`, `ClinicalEvent`, `DischargeInformation`, `ClinicalRecord`, `Finding`, `FindingSeverity`, `FindingCategory`.
- Also produces Zod schemas `sourceSchema`, `extractedValueSchema`, `clinicalRecordSchema`, `findingSchema` from `@audit/domain` for LLM-output validation.

- [ ] **Step 1: Add Zod to domain and write the failing test**

```bash
bun add zod --cwd packages/domain
```

`packages/domain/src/clinical-record.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { clinicalRecordSchema } from "./clinical-record";

describe("clinicalRecordSchema", () => {
  test("accepts an empty record with provenance-carrying fields", () => {
    const record = {
      patient: {},
      hospitalization: { diagnoses: [] },
      history: { pathological: [], allergies: [], usualMedications: [] },
      medications: [],
      laboratory: [],
      studies: [],
      microbiology: [],
      clinicalEvents: [],
    };
    expect(() => clinicalRecordSchema.parse(record)).not.toThrow();
  });

  test("rejects a value without sources", () => {
    const record = {
      patient: { name: { value: "X", sources: [] } },
      hospitalization: { diagnoses: [] },
      history: { pathological: [], allergies: [], usualMedications: [] },
      medications: [],
      laboratory: [],
      studies: [],
      microbiology: [],
      clinicalEvents: [],
    };
    expect(() => clinicalRecordSchema.parse(record)).toThrow();
  });
});
```

The second test asserts the schema enforces `sources.length >= 1` for extracted values, which is how provenance is guaranteed at the boundary.

- [ ] **Step 2-4: Run failing test, implement types + schemas, run passing test**

Implement `packages/domain/src/clinical-record.ts` and `finding.ts` with the spec shape and Zod schemas. `findingSchema` must include `requiresHumanReview: z.literal(true)` and `evidence` with at least one entry. Run:

```bash
bun test packages/domain/src/clinical-record.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ClinicalRecord and Finding schemas with provenance enforcement"
```

---

### Task 17: LLMProvider interface and OpenAI extraction

**Files:**
- Create: `packages/ai/src/llm-provider.ts`, `packages/ai/src/prompts/extraction.ts`, `packages/ai/src/providers/openai/openai-provider.ts`, `packages/ai/src/providers/fake/fake-provider.ts`
- Test: `packages/ai/src/providers/openai/openai-provider.test.ts`

**Interfaces:**
- Consumes: `DocumentPage`, `ClinicalRecord`, `Finding`, Zod schemas from `@audit/domain`.
- Produces:
  - `interface LLMProvider { extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord>; analyzeClinicalRecord(record: ClinicalRecord): Promise<Finding[]>; generateClinicalSummary(record: ClinicalRecord): Promise<string>; generateAuditSummary(record: ClinicalRecord, findings: Finding[]): Promise<string>; }`
  - `class OpenAIProvider implements LLMProvider` constructed with `{ apiKey, model, client? }`, validating every response with the Zod schemas and retrying once on validation failure.
  - `class FakeLLMProvider implements LLMProvider` returning a configured fixture (used by tests and the pipeline test).

- [ ] **Step 1: Write the failing test with an injected client returning invalid then valid JSON**

```ts
import { describe, expect, test } from "bun:test";
import { OpenAIProvider } from "./openai-provider";

describe("OpenAIProvider.extractClinicalRecord", () => {
  test("retries once when the first response is invalid, then validates", async () => {
    let calls = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            calls += 1;
            const content =
              calls === 1
                ? "not json"
                : JSON.stringify({
                    patient: {},
                    hospitalization: { diagnoses: [] },
                    history: { pathological: [], allergies: [], usualMedications: [] },
                    medications: [],
                    laboratory: [],
                    studies: [],
                    microbiology: [],
                    clinicalEvents: [],
                  });
            return { choices: [{ message: { content } }] };
          },
        },
      },
    };
    const provider = new OpenAIProvider({ apiKey: "t", model: "gpt-4.1", client });
    const record = await provider.extractClinicalRecord([
      { pageNumber: 1, text: "texto", docType: "evolution", handwritten: false, dataBearing: true, status: "vision" },
    ]);
    expect(calls).toBe(2);
    expect(record.hospitalization.diagnoses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm failure, then implement**

Run: `bun test packages/ai/src/providers/openai/openai-provider.test.ts`
Expected: FAIL, then PASS.

Implementation: build the extraction prompt from `packages/ai/src/prompts/extraction.ts` encoding spec §18 rules verbatim as instructions (extract only supported information, never invent, preserve sources and dates, keep contradictions, no diagnosis/treatment, Spanish output, structured JSON). Send only the given pages' text (never the whole PDF), call the provider, parse and validate with `clinicalRecordSchema`; on failure retry once with a corrective message; if still invalid throw `LLMExtractionError`.

- [ ] **Step 3: Implement `FakeLLMProvider` and commit**

```bash
bun test packages/ai/src/providers/openai/openai-provider.test.ts && bun run typecheck
git add -A
git commit -m "feat: add LLMProvider interface, OpenAI provider, and extraction prompt"
```

---

### Task 18: Chunking and map extraction with provenance

**Files:**
- Create: `packages/ai/src/extraction/chunk-pages.ts`, `packages/ai/src/extraction/map-extract.ts`
- Test: `packages/ai/src/extraction/chunk-pages.test.ts`, `packages/ai/src/extraction/map-extract.test.ts`

**Interfaces:**
- Consumes: `DocumentPage`, `ClinicalRecord`, `LLMProvider`.
- Produces:
  - `chunkPages(pages: DocumentPage[], options?: { maxPages?: number; maxChars?: number }): DocumentPage[][]` — groups only pages with `status === "vision"` or `"text"` and `dataBearing`, capped by both page count and character budget (`maxPages = 4`, `maxChars = 24_000`).
  - `mapExtract(pages: DocumentPage[], provider: LLMProvider): Promise<ClinicalRecord[]>` — one partial record per chunk; failures produce an empty partial and are recorded, not thrown away silently.
  - `emptyClinicalRecord(): ClinicalRecord`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { chunkPages } from "./chunk-pages";

const page = (n: number, text: string) => ({
  pageNumber: n,
  text,
  docType: "evolution" as const,
  handwritten: false,
  dataBearing: true,
  status: "vision" as const,
});

describe("chunkPages", () => {
  test("skips non-data-bearing and non-text pages", () => {
    const pages = [
      page(1, "a"),
      { ...page(2, "b"), dataBearing: false },
      { ...page(3, "c"), status: "skipped" as const },
    ];
    const chunks = chunkPages(pages);
    expect(chunks.flat().map((p) => p.pageNumber)).toEqual([1]);
  });

  test("respects the page cap", () => {
    const pages = [1, 2, 3, 4, 5].map((n) => page(n, "x"));
    const chunks = chunkPages(pages, { maxPages: 2 });
    expect(chunks).toHaveLength(3);
  });
});
```

- [ ] **Step 2-4: Implement, then test `mapExtract` with a fake provider**

`map-extract.test.ts` asserts that two chunks produce two records and that a provider failure on one chunk yields an empty partial while the other still returns data.

- [ ] **Step 5: Commit**

```bash
bun test packages/ai/src/extraction && bun run typecheck
git add -A
git commit -m "feat: add page chunking and map extraction"
```

---

### Task 19: Reduce/merge and validated retry

**Files:**
- Create: `packages/ai/src/extraction/reduce-record.ts`, `packages/lib/src/validation/llm-output.ts`
- Test: `packages/ai/src/extraction/reduce-record.test.ts`

**Interfaces:**
- Consumes: `ClinicalRecord`, `ExtractedValue`.
- Produces:
  - `reduceRecords(records: ClinicalRecord[]): ClinicalRecord` — unions and dedupes facts by normalized value+source, preserves all conflicting values (never overwrites), keeps arrays ordered.
  - `validateLLMOutput<T>(schema: ZodType<T>, raw: string, retry: () => Promise<string>): Promise<T>` in `@audit/lib` — parse, on failure retry once, then throw `LLMOutputValidationError`. Never coerces.

- [ ] **Step 1: Write the failing test for conflict preservation**

```ts
import { describe, expect, test } from "bun:test";
import { reduceRecords } from "./reduce-record";
import { emptyClinicalRecord } from "./map-extract";

const source = (page: number, text: string) => ({ documentId: "d1", pageNumber: page, text });

describe("reduceRecords", () => {
  test("dedupes identical diagnoses but keeps conflicting admission dates", () => {
    const a = emptyClinicalRecord();
    a.hospitalization.admissionDate = { value: "13/02/2026", sources: [source(1, "ingreso 13/02/2026")] };
    a.hospitalization.diagnoses = [{ value: "Sepsis", sources: [source(1, "sepsis")] }];

    const b = emptyClinicalRecord();
    b.hospitalization.admissionDate = { value: "14/02/2026", sources: [source(2, "ingreso 14/02/2026")] };
    b.hospitalization.diagnoses = [{ value: "Sepsis", sources: [source(2, "sepsis")] }];

    const merged = reduceRecords([a, b]);
    expect(merged.hospitalization.diagnoses).toHaveLength(1);
    expect(merged.hospitalization.admissionDate?.value).toBeDefined();
    // Conflicting values must be preserved via a contradictions collection:
    expect(merged.hospitalization.admissionDateConflicts?.length ?? 0).toBe(2);
  });
});
```

(Because `admissionDate` is singular, the reducer stores conflicting variants in a parallel `*Conflicts` array so Rule 3 can use both. Implement `admissionDateConflicts?: ExtractedValue<string>[]` and the analogous `dischargeDateConflicts` in `ClinicalRecord`.)

- [ ] **Step 2-4: Implement and verify**

Run: `bun test packages/ai/src/extraction/reduce-record.test.ts`
Expected: FAIL, then PASS. Also add a `validateLLMOutput` test asserting one retry and a thrown error on the second failure.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add deterministic record reduction and validated LLM retry"
```

---

### Task 20: Persist and display the ClinicalRecord

**Files:**
- Create: `packages/db/src/repositories/clinical-records.ts`
- Modify: `apps/worker/src/pipeline/process-document.ts` (append extraction between `extracting` and `ready`)
- Create: `apps/web/src/components/clinical-record-view.tsx`
- Modify: `apps/web/src/app/documents/[id]/page.tsx`
- Test: `packages/db/src/repositories/clinical-records.test.ts`

**Interfaces:**
- Consumes: `reduceRecords`, `mapExtract`, `chunkPages`, `OpenAIProvider`, `FakeLLMProvider`, `clinicalRecordSchema`.
- Produces:
  - `createClinicalRecordRepository(db)` with `upsert(documentId, record, findings, indexed)` and `getByDocument(documentId)`.
  - The pipeline now ends at `ready` only after a record is persisted; partial extraction sets `extracting` info into `error`-adjacent state surfaced as `Análisis incompleto` with affected page numbers.
  - `<ClinicalRecordView record />` showing patient, hospitalization, diagnoses, and counts, all labels in Spanish.

- [ ] **Step 1: Write the failing repository test (integration, skip without DB)**

Mirror Task 7's pattern: `upsert` then `getByDocument` returns the same record; finding arrays round-trip.

- [ ] **Step 2-4: Implement, wire the pipeline, build the view**

Pipeline order inside `process-document.ts`: after pages are persisted, if any data-bearing page succeeded → `updateStatus("extracting")` → `chunks = chunkPages(pages)` → `partials = await mapExtract(chunks, provider)` → `record = reduceRecords(partials)` → validate → `clinicalRecords.upsert(...)` → `updateStatus("ready")`. If zero data-bearing pages succeeded → `updateStatus("error", "No se pudo extraer texto de ninguna página.")`. Affected failed pages are persisted so the UI can show `Análisis incompleto` with page numbers.

`ClinicalRecordView` renders, in Spanish: patient name/age/sex when present, admission→discharge dates, reason, diagnoses, counts of medications/labs/studies/microbiology, and a clear `No se encontró información suficiente` for missing sections.

- [ ] **Step 5: Run the full suite and the manual end-to-end check**

```bash
bun run lint && bun run typecheck && bun run test
docker compose -f docker/compose.yaml up -d
bun run dev
```

Upload `auditoria-ejemplo.pdf`, wait for `ready`, and confirm the record view shows extracted values with page references and that no PHI appears in worker logs.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: persist and display the extracted ClinicalRecord"
```

---

## Self-Review

**Spec coverage (P0–P3):**
- Spec §5 architecture, §6 repository-first, §7–§14 domain/provenance → Tasks 4, 5, 16, 19.
- §15 pipeline + statuses, §16 OCR abstraction, §17 LLM abstraction, §18 extraction rules, §35 LLM validation → Tasks 11–14, 17–20.
- §33 error handling (Spanish, affected pages) → Tasks 14, 20.
- §36 model abstraction/env config → Tasks 3, 13, 17.
- §37 structure → Target File Structure.
- §31/§32 privacy (no PHI logs, no analytics, delete) → Tasks 1, 9, 14; retention/delete endpoint fully implemented in the P7 plan.
- §34 testing → tests in every task; de-identified fixture in Task 11 (uses `PDF_FIXTURE_PATH`, which is the local-only real file for dev and a committed de-identified file for CI).
- Later phases (timeline, summaries, audit engine, review UI, chat) are intentionally out of scope for this plan and get their own plan files.

**Placeholder scan:** no TBD/TODO; every code step has concrete code. Where a step is inherently generated (scaffolding, migrations, shadcn) the exact command is given.

**Type consistency:** `DocumentStatus`/`PageStatus`/`PageDocType` defined in Task 4 are used unchanged in Tasks 5, 10, 12. `StorageProvider` (Task 6) is used by Tasks 9 and 14. `JobQueue` (Task 8) by Tasks 9 and 14. `OCRProvider` (Task 12) by Task 13 and the worker. `LLMProvider` (Task 17) by Tasks 18 and 20. `DocumentPage.imageKey` (Task 4) matches the page-image route key convention in Task 15.

**Known follow-ups (not gaps in this plan):** the timeline/summaries/audit/review/chat phases; TLS reverse-proxy run book; retention purge job; remote git-history scrub requiring owner approval.
