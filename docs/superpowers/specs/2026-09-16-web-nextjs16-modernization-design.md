# Web — Next.js 16 modernization to current scaffold standards

Date: 2026-09-16
Scope: `apps/web`
Status: Approved design (pre-implementation plan)

## 1. Purpose

`apps/web` is the user-facing Next.js App Router application (Spanish UI +
API routes). A fresh `create-next-app` scaffold lives at `apps/my-app` with the
current Next.js 16 conventions. This document defines the work to bring `web`
up to those standards: tooling/config parity, Tailwind CSS 4, system fonts,
and a hybrid Server Component + Server Action rendering model built on Cache
Components.

`web` already satisfies the Next.js 16 breaking changes (async `params`,
Turbopack by default, no `middleware`, no `next lint`). The work is therefore
conventions, styling, and rendering model — not a version migration.

## 2. Confirmed decisions

Decided with the project owner during brainstorming:

| Area | Decision |
|---|---|
| Scope | Tooling/config parity **and** Tailwind 4 **and** rendering modernization **and** fonts. |
| Rendering | **Hybrid RSC:** Server Components read initial data; client components remain only where interactive (uploader, polling list, PDF viewer). |
| Caching | **Cache Components** (`cacheComponents: true`) with `<Suspense>`. No `export const dynamic = "force-dynamic"` anywhere. |
| Mutations | **Server Actions** for upload/delete; **keep all API routes** (polling, page images, health, worker/documented contract). |
| Styling | **Full Tailwind utility classes**; bespoke classes are removed from `globals.css`. |
| Fonts | **System font stack** via CSS. No `next/font`, no Geist dependency. |
| Cache directive | **No `use cache`** for document data — statuses change live and the worker (separate process) cannot invalidate Next's cache. |
| Data layer | Unchanged: `@audit/db`, `@audit/domain`, `@audit/lib` workspace packages via `lib/container.ts`. |

## 3. Current state vs scaffold

| Area | `apps/web` (before) | `apps/my-app` (scaffold) | Target for `web` |
|---|---|---|---|
| Next.js | 16.3.4 | 16.3.5 | 16.3.5 |
| React | 19.2.8 | 19.2.8 | 19.2.8 |
| `next.config` | `next.config.js`, empty | `next.config.ts`, `reactCompiler: true` | `next.config.ts` + `reactCompiler`, `typedRoutes`, `cacheComponents` |
| React Compiler | off | on | on |
| Styling | plain CSS classes | Tailwind 4 | Tailwind 4 |
| Biome | root/shared only | local `biome.json` w/ Next/React domains | local `biome.json` extending `@audit/config` |
| Fonts | none | `next/font` Geist | system font stack (intentional deviation) |
| Typed routes | manual types | `LayoutProps`/`PageProps` | `PageProps`/`LayoutProps`, `typedRoutes` |
| Rendering | all client + `fetch` + polling | server page by default | hybrid RSC + Suspense |
| Agent docs | none | `AGENTS.md` + `CLAUDE.md` | same |

## 4. Target configuration

### 4.1 `next.config.ts` (replaces `next.config.js`)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  typedRoutes: true,
};

export default nextConfig;
```

### 4.2 `apps/web/package.json`

- Bump `next` `16.3.4 → 16.3.5`.
- Add devDependencies: `babel-plugin-react-compiler`, `tailwindcss@^4`,
  `@tailwindcss/postcss@^4`.
- Keep all existing scripts (`dev`, `build`, `start`, `lint`, `format`,
  `typecheck`, `test`) and workspace dependencies.

### 4.3 `apps/web/postcss.config.mjs` (new)

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

### 4.4 `apps/web/tsconfig.json`

- Add `.next/dev/types/**/*.ts` and `**/*.mts` to `include`.
- Keep `extends: "@audit/config/nextjs.json"`, the `next` plugin,
  `strictNullChecks`, and `types: ["bun"]`.

### 4.5 `apps/web/biome.json` (new)

Extends `@audit/config/biome.json` and adds:

- `linter.domains.next: "recommended"`, `linter.domains.react: "recommended"`.
- `css.parser.tailwindDirectives: true`.
- `files.ignoreUnknown: true`.

The shared root/packages config is left untouched. Local config extends it, so
the root `biome` version (2.5.14) remains authoritative; the scaffold's older
pinned 2.4.2 is **not** copied.

### 4.6 Agent docs

- New `apps/web/AGENTS.md` containing the `nextjs-agent-rules` managed block
  (Next.js re-adds/manages it on `next dev`).
- New `apps/web/CLAUDE.md` containing `@AGENTS.md`, matching the scaffold.

## 5. Styling: Tailwind 4 + system fonts

### 5.1 `app/globals.css`

Reduced to:

- `@import "tailwindcss";`
- `@theme inline` tokens: `--color-background`, `--color-foreground`,
  `--font-sans` (system stack), `--font-mono` (system mono stack).
- `:root` values + `@media (prefers-color-scheme: dark)` overrides (keep the
  existing OS-based dark mode; no toggle).
- Minimal base `body` rule (background, color, `font-family`).

All existing bespoke classes are removed: `.page`, `.card`, `.card-title`,
`.upload-button`, `.upload-input`, `.muted`, `.success`, `.error`,
`.document-list`, `.document-item`, `.document-name`, `.status-badge`,
`.status-ready`, `.status-error`, `.document-header`, `.pdf-viewer`,
`.pdf-toolbar`, `.pdf-page-indicator`, `.pdf-page`, `.record-view`,
`.record-fields`, `.record-list`.

### 5.2 Components

- Every `className` is rewritten as Tailwind utilities.
- `DocumentStatusBadge` maps `DocumentStatus` to utility classes via a small
  record (replacing `.status-ready` / `.status-error`).
- Semantics are preserved exactly: `data-page`, `aria-live`, `aria-label`,
  `role="alert"`, `<output>`, `<label>` wrappers, and `<input>` accessibility
  classes. Only visual classes change.

### 5.3 Fonts

System stacks in `globals.css`, mapped through `@theme`:

- `--font-sans`: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- `--font-mono`: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

No `next/font`, no network requirement at build.

## 6. Rendering and data flow

`cacheComponents: true` makes routes dynamic by default and implements Partial
Prerendering. Uncached data is streamed through `<Suspense>`; cached data is
opt-in with `use cache`. We stream (not cache) because document statuses
transition live.

### 6.1 Home — `app/page.tsx`

Server Component (no `"use client"`). Static shell = heading + `DocumentUploader`
+ Suspense fallback; the document list streams in:

```tsx
export default function Home() {
  return (
    <main className="...">
      <h1>{ui.appTitle}</h1>
      <DocumentUploader />
      <Suspense fallback={<p className="...">{ui.loading}</p>}>
        <DocumentListSection />
      </Suspense>
    </main>
  );
}

async function DocumentListSection() {
  const docs = (await getContainer().documents.list()).map(serializeDocument);
  return <DocumentList initialDocuments={docs} />;
}
```

### 6.2 Detail — `app/documents/[id]/page.tsx`

The page is non-async and awaits `params` **inside** the boundary so the App
Shell prerenders for unknown ids:

```tsx
export default function DocumentDetailPage({ params }: PageProps<"/documents/[id]">) {
  return (
    <Suspense fallback={<output className="...">{ui.loading}</output>}>
      <DocumentContent params={params} />
    </Suspense>
  );
}

async function DocumentContent({ params }: Pick<PageProps<"/documents/[id]">, "params">) {
  const { id } = await params;
  // read document + record + pages via getContainer(); notFound() if missing;
  // render ClinicalRecordView (server) + PdfViewer (client)
}
```

- `notFound()` replaces the client error state for a missing document.
- No `generateStaticParams`: unlisted ids render on request / upgrade after
  first visit. This route does not use ISR.
- No `export const dynamic`.

### 6.3 Route handlers

- Remove `export const dynamic = "force-dynamic"` from:
  - `app/api/documents/route.ts`
  - `app/api/documents/[id]/route.ts`
  - `app/api/documents/[id]/pages/[page]/route.ts`
  (These exports error under `cacheComponents`.)
- Keep `export const runtime = "nodejs"`.
- `GET /api/documents` and the page-image `GET` read uncached data and
  therefore bail out of prerendering automatically (dynamic at request time).
  Their handlers contain no `try/catch` that would swallow the bail-out.
- `POST /api/documents`, `DELETE /api/documents/[id]`, `GET /api/health` are
  unaffected. `health` becomes a static prerender, which is acceptable for a
  liveness probe.

## 7. Mutations and API surface

### 7.1 Shared service — `lib/documents-service.ts` (new)

Extract the upload/delete logic currently inlined in the API route handlers so
both the actions and the routes share one implementation:

- `createUploadedDocument(file: File): Promise<{ id: string; status: DocumentStatus }>`
  — validate, store the original in S3, create the row, enqueue the job, and
  clean up on failure.
- `deleteDocumentById(id: string): Promise<boolean>` — look up, remove the row,
  delete the S3 object.

`validateUpload`, `maxUploadBytes`, and `UploadMeta` stay exported from
`app/api/documents/route.ts` (the route re-exports/uses the service) so
`app/api/documents/route.test.ts` keeps importing them unchanged.

### 7.2 Server actions — `lib/actions.ts` (new, `"use server"`)

- `uploadDocument(formData: FormData)` → calls `createUploadedDocument`, then
  `revalidatePath("/")`. Returns a discriminated result for the uploader's
  state machine.
- `deleteDocument(id: string)` → calls `deleteDocumentById`, then
  `revalidatePath("/")`.

### 7.3 Client components

- `DocumentUploader` calls the `uploadDocument` action (instead of
  `fetch POST`), keeping its `idle | uploading | success | error` state machine
  and Spanish messages. Resets the file input in `finally`. It no longer takes
  an `onUploaded` callback.
- `DocumentList` is seeded from the `initialDocuments` prop and keeps polling
  `GET /api/documents` at the existing interval (`pollIntervalMs`) so statuses
  converge (`uploaded → processing → … → ready`). After an upload, the action's
  `revalidatePath("/")` refreshes the server-rendered data.
- The old `refreshKey` wiring between `page.tsx` and `DocumentList` is removed.

API routes remain documented in `README.md` and unchanged in behavior.

## 8. Component inventory

| File | After |
|---|---|
| `app/layout.tsx` | Server; `LayoutProps<"/">`; metadata unchanged; `<html lang="es">` |
| `app/page.tsx` | Server; Suspense + `DocumentListSection` |
| `app/documents/[id]/page.tsx` | Server; `PageProps`; Suspense + `DocumentContent` |
| `components/document-uploader.tsx` | Client; calls server action |
| `components/document-list.tsx` | Client; `initialDocuments` + polling |
| `components/pdf-viewer.tsx` | Client (unchanged behavior) |
| `components/pdf-viewer-utils.ts` | unchanged |
| `components/document-status.ts` | unchanged |
| `components/document-status-badge.tsx` | Server; Tailwind class map |
| `components/clinical-record-view.tsx` | Server (drop `"use client"`) |
| `lib/container.ts` | unchanged |
| `lib/serialize-document.ts` | unchanged |
| `lib/documents-service.ts` | new |
| `lib/actions.ts` | new |

## 9. Testing

- Existing tests remain and must pass unchanged:
  `app/resolution.test.ts`, `app/api/documents/route.test.ts`,
  `components/document-status.test.tsx`, `components/pdf-viewer.test.tsx`.
- `validateUpload` keeps its existing coverage. If the refactor introduces any
  new pure helper with non-trivial logic, it gets a unit test first (TDD);
  trivial class maps and styling do not warrant tests.
- Server Components and Server Actions are not unit-tested (consistent with
  the current suite, which tests pure logic). Correctness is covered by
  `next build` (which exercises prerendering/validation) plus the manual smoke.
- `bun test --pass-with-no-tests` remains the runner.

## 10. Verification

1. Per app: `bun run --cwd apps/web lint`, `typecheck`, `test`, `build`.
   - `build` must succeed **without a live database**, because all DB reads sit
     behind `<Suspense>` and are excluded from the prerendered shell.
2. Root: `bun run lint && bun run typecheck && bun run test && bun run build`.
3. Manual smoke: `bun run dev` with the Docker backends up — upload a PDF, watch
   the list transition `uploaded → processing → extracting → ready`, open the
   detail page, exercise page navigation and zoom.

## 11. Risks and out of scope

Risks:

- **React Compiler** increases dev/build time (Babel). If the cost is severe,
  it can be disabled independently without affecting the rest of this design.
- **Cache Components** is strict: it surfaces dev-time insights for uncached
  access and forbids `dynamic`/`revalidate`/`fetchCache` segment configs.
  Route files must be cleaned up before it will build.
- **Tailwind port** has no visual regression tests; the port must preserve
  semantics/ARIA, and a manual visual check is required.
- The **system font stack** intentionally deviates from the scaffold's Geist.

Out of scope:

- Authentication, new features, or any change to `worker`, `packages/*`, or
  `docker/`.
- `use cache` / ISR tuning, cache handlers, or partial prefetching.
- Deleting or changing API route contracts; removing `force-dynamic` only.

## 12. Cleanup: remove the scaffold

Once `apps/web` reaches parity and passes the verification in §10, delete the
`apps/my-app` scaffold. It is an untracked reference copy used only to compare
against current `create-next-app` standards; nothing in the monorepo depends on
it. Removing it also requires no workspace, task, or lockfile changes (the
`apps/*` glob simply stops matching it). This is the final step of the work.

