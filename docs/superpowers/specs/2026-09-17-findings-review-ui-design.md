# Findings Review UI — Design

Date: 2026-09-17
Source spec: `MEDICAL_AUDIT_AI_MVP_SPEC.md`, `docs/superpowers/specs/2026-09-16-medical-audit-ai-mvp-design.md` (§10, §14 P6)
Status: Approved design (pre-implementation plan)
Scope: Slice A of the inert-data program (see §2)

## 1. Purpose

The pipeline already detects possible inconsistencies ("findings") and persists
them in `clinical_records.findings`, but the UI never renders them. The
`findings_review` table exists with no repository, action, or UI.

This slice makes findings visible and reviewable end to end: a reviewer can see
each finding, read its evidence, jump to the cited page, and mark it
`reviewed`/`dismissed` with an optional note, persisted to `findings_review`.

## 2. Context: inert-data program decomposition

An audit of persisted-but-unrendered data produced these independent slices.
This spec covers **A only**; B–G get their own spec → plan → implementation.

| # | Slice | Scope |
|---|---|---|
| A | **Findings review UI** (this spec) | Render findings; severity/category; evidence → page; Revisado/Descartar/nota |
| B | Full clinical record view | Meds/labs/studies/micro details, history/allergies, discharge, date conflicts, birthDate; per-field evidence |
| C | Timeline | `clinicalEvents` chronological view, jump-to-page |
| D | Summaries | Worker generates + persists clinical & audit summary; render |
| E | Audit rules engine | `packages/audit`: deterministic rules + registry feeding findings |
| F | Chat | Retrieval over page text + record lookup, provider method, persist, UI |
| G | Lifecycle/hardening | `access_log` wiring, page metadata display, retention/TLS docs |

Out of scope for A: left navigation shell from design §10, per-field evidence
for the clinical record (B), deterministic rules (E), summaries (D), chat (F).

## 3. Confirmed decisions

Decided with the project owner during brainstorming:

| Question | Decision |
|---|---|
| Review state across re-analysis/retries | **Stable content-derived finding ids** so review state survives reprocessing |
| Evidence navigation | **`?page=N#finding-<id>` URL param**; no bounding-box highlight |
| Presentation | **All findings visible, sorted by severity**, status badges, filter (Todos/Pendientes/Revisados/Descartados) + severity/status counts |
| Architecture | A1: stable id at pipeline finalization + repository + server actions + client list island |

## 4. Finding identity

Provider-assigned ids are not reusable as keys: the OpenAI provider takes `id`
from the model output (not stable across runs), and heuristic ids are positional
(`...-${n}`). `clinical_records.upsert` replaces the `findings` JSONB on every
process, so review rows keyed by an unstable id would orphan.

`packages/domain/src/finding.ts` gains:

- `export const FINDING_REVIEW_STATUSES = ["pending", "reviewed", "dismissed"] as const;`
- `export type FindingReviewStatus = (typeof FINDING_REVIEW_STATUSES)[number];`
- `export function findingSignature(finding: Finding): string` — pure; normalizes
  `category` + `title` (lowercase, NFD-strip diacritics, remove non-alphanumerics,
  collapse whitespace) and appends the sorted evidence `source.pageNumber`s.
- `export function assignStableFindingIds(findings: Finding[]): Finding[]` — pure;
  sorts findings by signature, sets `id = "fnd-" + djb2Hex(signature)`, appends
  `-2`, `-3` … on collision. Dependency-free (small FNV/djb2 hash in-file), so it
  is deterministic and does not require `crypto`.

Placement: the worker calls `assignStableFindingIds` **after**
`stampFindingProvenance` (page numbers/source document id final) and before
`clinicalRecords.upsert`. Providers are unchanged; their `id` is overwritten.

Guarantee: identical clinical content + provider output yields identical ids
across runs. If an LLM rephrases a finding's title between runs, that finding's
id changes and its review state effectively resets — documented and accepted.

Review rows are **not** pruned when findings change. Orphaned rows are harmless
(never rendered) and preserve an audit trail. Pruning is a follow-up, not part of
A.

## 5. Persistence and plumbing

### 5.1 Schema and migration

`packages/db/src/schema.ts`, `findings_review`:

- type `status` as `FindingReviewStatus` via `.$type<FindingReviewStatus>()`
  (column stays `text`, default `"pending"`).
- add `uniqueIndex("findings_review_document_finding_idx").on(documentId, findingId)`
  so `setStatus` can upsert.

Migration `packages/db/drizzle/0002_*.sql` generated with `drizzle-kit generate`.
There is no `created_at` column today; `updated_at` (already present) is
sufficient for A.

### 5.2 Repository

New `packages/db/src/repositories/finding-reviews.ts`:

- `listForDocument(documentId): Promise<FindingReview[]>` → `{ findingId, status, note }[]`
- `setStatus(documentId, findingId, status, note?): Promise<void>` — insert with
  `.onConflictDoUpdate({ target: [documentId, findingId], set: { status, note, updatedAt: new Date() } })`

Exported from `packages/db/src/index.ts`. `FindingReview` is a small row type
local to the repository (mirrors `ClinicalRecordIndex` style), not a domain type.

### 5.3 Container and actions

- `apps/web/lib/container.ts`: add `findingReviews: createFindingReviewRepository(db)`.
- `apps/web/lib/actions.ts`: add
  `setFindingReview(input): Promise<FindingReviewActionResult>` where
  `input = { documentId, findingId, status, note? }` and
  `FindingReviewActionResult = { ok: true } | { ok: false; error: string }`.
  - Validation is extracted to a pure `validateReviewInput(input)` helper in
    `apps/web/lib/findings-view.ts` so it is unit-testable: status must be one of
    `FINDING_REVIEW_STATUSES`; `note` trimmed, optional, max 2000 chars;
    `documentId`/`findingId` non-empty.
  - On success calls the repo and `revalidatePath("/documents/[id]", "page")`.
  - Mirrors the existing `deleteDocument` action shape.

### 5.4 API route

`apps/web/app/api/documents/[id]/route.ts` `GET` currently returns `record` but
omits `findings`. Add `findings` and `reviews` for response parity with the page.

## 6. UI

### 6.1 Components

- `apps/web/components/findings-section.tsx` (`"use client"`): receives
  `documentId`, `findings: Finding[]`, `reviews: FindingReview[]`. Renders the
  severity/status count header, the status filter, and the list (or an empty
  state). Filter state is local.
- `apps/web/components/finding-card.tsx` (`"use client"`): severity badge,
  category label, title, explanation, optional recommendation, evidence list,
  status badge, and actions `Revisado` / `Descartar` / note textarea + save.
  Seeds local state from props, updates optimistically, and reverts + shows an
  error if the server action fails.
- `apps/web/lib/findings-view.ts`: pure helpers, unit-tested (mirrors
  `pdf-viewer-utils.ts`):
  - `sortFindings(findings)` — severity rank `high > medium > low > info`, then category, then title.
  - `filterFindings(findings, reviews, filter)` — `filter ∈ all | pending | reviewed | dismissed`; a finding with no review row counts as `pending`.
  - `reviewStatusOf(reviews, findingId)` — defaults to `"pending"`.
  - `countBySeverity(findings)`, `countByStatus(findings, reviews)`.
  - `validateReviewInput(input)`.

### 6.2 Page wiring

`apps/web/app/documents/[id]/page.tsx`: fetch reviews alongside record/pages;
build `reviews`; render `<FindingsSection documentId findings={clinical.findings} reviews={reviews} />`
after `<ClinicalRecordView>`. Findings are no longer dropped.

### 6.3 Copy

All strings Spanish, centralized in `packages/lib/src/i18n/es.ts`. Reuse
`ui.findings`, `ui.reviewed`, `ui.dismissFinding`, `ui.viewEvidence`. Add:
severity labels, category labels, `pending`/`reviewed`/`dismissed` labels, filter
labels, note label + `Guardar nota`/saved confirmation, `noFindings`,
`findingsLoadError`/`reviewFailed`.

## 7. Evidence navigation

- Evidence item links to `/documents/[id]?page=N#finding-<findingId>` via
  `next/link` with `query`/`hash`.
- `page.tsx` reads async `searchParams.page`, clamps it, and passes it as
  `initialPage` to `PdfViewer` (default 1).
- `pdf-viewer.tsx` gains a `useEffect` that re-syncs the page when `initialPage`
  changes (today `useState` only seeds on mount), so same-route query navigation
  moves the viewer.
- Finding cards carry `id="finding-<findingId>"` and a scroll margin so the hash
  lands on the card.
- No bounding-box highlight: no provider populates `Source.boundingBox`.

## 8. Error handling

- Invalid status or over-long note → action returns `{ ok: false, error }`; the
  card surfaces it and does not change state.
- Repository throw → the card catches, reverts the optimistic update, and shows a
  generic error.
- Findings generation failed upstream → `findings = []`, empty state, and the
  existing "Análisis incompleto" alert already communicates incompleteness.
- Colliding stable ids are resolved deterministically inside
  `assignStableFindingIds`.

## 9. Testing

Tests are written with each change (TDD), using `bun test` per workspace.

- **Domain unit:** signature normalization (accents, case, punctuation, whitespace);
  reorder-independence; collision uniqueness; id format/prefix; page number
  affects the signature.
- **Worker unit** (`process-document.test.ts`): persisted findings have stable
  ids derived from content; two runs with identical provider output produce the
  same ids; reordering the provider output produces the same ids.
- **DB repository** (gated by `TEST_DATABASE_URL`, `describe.skip` otherwise, like
  `clinical-records.test.ts`): insert then update status; note set/cleared;
  `listForDocument` isolates by document; upsert does not duplicate rows.
- **Web pure helpers** (`findings-view.test.ts`): sort order, filter semantics
  (including default-pending), counts, `validateReviewInput`.
- **API/route** covered indirectly by the pure validation + serialization; no new
  test framework.
- No new dependencies.

Definition of done: `bun run lint`, `bun run typecheck`, `bun run test` pass at
the repo root.

## 10. Files touched

- `packages/domain/src/finding.ts` (+ `finding.test.ts`), `packages/domain/src/index.ts`
- `packages/db/src/schema.ts`, `packages/db/drizzle/0002_*.sql`,
  `packages/db/src/repositories/finding-reviews.ts` (+ test), `packages/db/src/index.ts`
- `apps/worker/src/pipeline/process-document.ts` (+ test)
- `apps/web/lib/container.ts`, `apps/web/lib/actions.ts`,
  `apps/web/lib/findings-view.ts` (+ test)
- `apps/web/components/findings-section.tsx`, `apps/web/components/finding-card.tsx`,
  `apps/web/components/pdf-viewer.tsx`
- `apps/web/app/documents/[id]/page.tsx`, `apps/web/app/api/documents/[id]/route.ts`
- `packages/lib/src/i18n/es.ts`

## 11. Follow-ups (not in A)

- Prune `findings_review` rows whose `finding_id` no longer exists (if history
  retention is not desired).
- Slice B: full clinical record view + per-field evidence.
- Move findings into the spec §10 left-nav shell once B/G establish navigation.
