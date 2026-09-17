# Full Clinical Record View — Design (Slice B)

Date: 2026-09-17
Source spec: `MEDICAL_AUDIT_AI_MVP_SPEC.md` (§4, §25, §27),
`docs/superpowers/specs/2026-09-16-medical-audit-ai-mvp-design.md` (§6, §10),
`docs/superpowers/specs/2026-09-17-findings-review-ui-design.md` (§2)
Status: Approved design (pre-implementation plan)
Scope: Slice B of the inert-data program (see §2)
Depends on: Slice A (`findings-review-ui-design.md`) landing first

## 1. Purpose

The pipeline extracts and persists a full `ClinicalRecord` (patient, hospitalization,
history, medications, laboratory, studies, microbiology, discharge), each field
carrying `Source` evidence. The UI only renders patient name/age/sex, admission
date, discharge date, reason, diagnoses, and counts of the remaining arrays.

This slice renders **all persisted clinical record data**, each field traceable to
its source page, and surfaces admission/discharge date conflicts and birth date
cautiously. It is **read-only**: no new extraction, no new persistence, no schema
changes.

## 2. Context: inert-data program decomposition

From `2026-09-17-findings-review-ui-design.md` §2. This spec covers **B only**.

| # | Slice | Scope |
|---|---|---|
| A | Findings review UI | Render findings; severity/category; evidence → page; Revisado/Descartar/nota |
| B | **Full clinical record view** (this spec) | Meds/labs/studies/micro details, history/allergies, discharge, date conflicts, birthDate; per-field evidence |
| C | Timeline | `clinicalEvents` chronological view, jump-to-page |
| D | Summaries | Worker generates + persists clinical & audit summary; render |
| E | Audit rules engine | `packages/audit`: deterministic rules + registry feeding findings |
| F | Chat | Retrieval over page text + record lookup, provider method, persist, UI |
| G | Lifecycle/hardening | `access_log` wiring, page metadata display, retention/TLS docs |

Out of scope for B: timeline/`clinicalEvents` (C), hospital-duration and
overview stat cards (§25, D), left-navigation shell from design §10 (G),
summaries (D), chat (F), bounding-box highlighting (no provider populates
`Source.boundingBox`), and any change to extraction or persistence.

## 3. Confirmed decisions

Decided with the project owner during brainstorming:

| Question | Decision |
|---|---|
| Layout | **Expand sections on the existing document page** (single scrollable column). No left navigation (G). |
| Evidence interaction | **`?page=N` links**, same mechanism as A. No per-field hash anchor. |
| Evidence primitive | B **depends on A landing first** and centralizes a shared evidence-link component (A currently inlines it in `finding-card.tsx`). |
| Detail density | **Collapsible sections (`<details>`), all items rendered**, per-section counts. No pagination, no "show more" cap. |
| Conflicts & birthDate | **Dedicated conflict warnings** for admission/discharge conflicts + a `Fecha de nacimiento` row, with cautious Spanish copy. |
| Scope | Read-only rendering of persisted data; no new extraction/persistence; A/C/D/F/G excluded. |

## 4. Data currently dropped

`apps/web/components/clinical-record-view.tsx` renders a subset. B must cover the
following, all already present in the persisted `ClinicalRecord`:

- `patient.birthDate` — never rendered.
- `hospitalization.dischargeDiagnosis` — never rendered.
- `hospitalization.admissionDateConflicts`, `dischargeDateConflicts` — never rendered.
- `history.pathological`, `history.allergies`, `history.usualMedications` — never rendered.
- `medications` — only a count; no dose/route/frequency/dates/status/sources.
- `laboratory` — only a count; no date/test/value/unit/range/sources.
- `studies` — only a count; no date/type/indication/result/sources.
- `microbiology` — only a count; no date/sample/organism/result/sensitivity/sources.
- `discharge` — never rendered.
- Per-field `Source` evidence — never rendered anywhere in the record.

`clinicalEvents` is intentionally excluded (slice C).

## 5. Architecture

No worker, domain, or DB changes. B is a web-only rendering slice that consumes
the `ClinicalRecord` already fetched by `page.tsx`.

### 5.1 Pure helpers — `apps/web/lib/clinical-record-view.ts`

Extracted from the current component and unit-tested (mirrors `findings-view.ts`
from A and `pdf-viewer-utils.ts`):

- `displayValue(value: string | number | undefined): string | undefined` — trims
  to `undefined` for empty/whitespace; `String(value)` for numbers. (Moved from
  `clinical-record-view.tsx`.)
- `sourcePages(sources: Source[]): number[]` — unique, ascending, positive page
  numbers.
- `mergeSourcePages(...groups: Source[][]): number[]` — union of `sourcePages`
  across groups, then unique/ascending. Used to combine a list item's top-level
  `sources` with the `sources` of each populated `ExtractedValue` inside it.
- `countsBySection(record: ClinicalRecord): SectionCounts` where `SectionCounts`
  is `{ pathological; allergies; usualMedications; medications; laboratory;
  studies; microbiology }` — all `number`, used for the collapsible summary badges.

Evidence granularity rule:

- **Scalar top-level field** (e.g. `patient.name`, `hospitalization.reason`,
  `discharge.followUp`) → evidence links from that field's own `sources`.
- **Item in a list** (medication, lab, study, microbiology result, history
  entry, diagnosis, conflict) → evidence links from `mergeSourcePages(item.sources,
  ...populated field sources)` so a page cited by any part of the item is reachable
  exactly once.

### 5.2 Shared evidence primitive — `apps/web/components/evidence-link.tsx`

A dependency-free component (no `"use client"`, so usable from both server and
client trees) that renders one page link:

- `EvidenceLink({ documentId, page, hash? })` → `next/link` to
  `/documents/[id]?page=<page>` (optional `hash`). Label reuses A's
  `findings.viewPage(page)` formatter (`"Ver página <page>"`) so there is a
  single source of truth for the link text.
- `EvidenceLinks({ documentId, sources, hash? })` → renders the `EvidenceLink`s
  for `sourcePages(sources)` separated by a space; renders `null` when empty so
  callers can omit the evidence row cleanly.

Slice A's `finding-card.tsx` is updated to use `EvidenceLink` (passing
`hash={`finding-${finding.id}`}`), removing its inline `Link`.

### 5.3 Record primitives — `apps/web/components/clinical-record-primitives.tsx`

Small server components composing the shared primitives:

- `CollapsibleSection({ title, count?, defaultOpen?, children })` — native
  `<details>`/`<summary>` (keyboard accessible, no client JS). Renders
  `title (count)` when `count` is provided. Default open: `true` for Patient,
  Hospitalization, History, Discharge; `false` for Medications, Laboratory,
  Studies, Microbiology.
- `RecordField({ label, value, documentId, sources })` — a `<dt>`/`<dd>` pair
  that renders `displayValue(value)` plus `<EvidenceLinks>`; renders nothing when
  the value is absent (callers decide empty-section copy).
- `RecordEmpty()` — the per-section empty state using `clinicalRecord.noInfo`.
- `MedicationStatusLabel({ status })` — maps `MedicationStatus` to Spanish.

### 5.4 Sections — `apps/web/components/clinical-record-sections.tsx`

One component per section, all server components, rendered in clinical order by
the orchestrator:

1. **Patient** — name, age, sex, birthDate.
2. **Hospitalization** — admissionDate, dischargeDate, reason, diagnoses (each
   with its sources), dischargeDiagnosis, plus a conflict block (see §7).
3. **History** — pathological, allergies, usualMedications (each entry with its
   sources; usual medications reuse the medication row layout).
4. **Medications** — list rows: name, dose, route, frequency, startDate, endDate,
   status, evidence.
5. **Laboratory** — list rows: date, name, value, unit, referenceRange, evidence.
6. **Studies** — list rows: date, type, indication, result, evidence.
7. **Microbiology** — list rows: date, sample, organism, result, sensitivity,
   evidence.
8. **Discharge** — date, conditionAtDischarge, diagnosis, treatment, instructions,
   warningSigns, followUp, evidence.

Long arrays render every item; the section count in the `<summary>` prevents
silent hiding.

### 5.5 Orchestrator — `apps/web/components/clinical-record-view.tsx`

Keeps its current props (plus `documentId` for evidence links) and the existing
"Análisis incompleto" alert at the top, then renders the eight sections in
order. It no longer holds the per-field `display` helper (moved to §5.1) and no
longer renders the count-only "Resumen" card.

Prop change:

```ts
export function ClinicalRecordView({
  documentId,
  record,
  incomplete,
  failedPages,
  failedChunks,
}: {
  documentId: string;
  record: ClinicalRecord;
  incomplete: boolean;
  failedPages: number[];
  failedChunks: number;
})
```

## 6. Page wiring

`apps/web/app/documents/[id]/page.tsx` passes the document id through:

```tsx
<ClinicalRecordView
  documentId={doc.id}
  record={clinical.record}
  incomplete={clinical.extractionIncomplete || failedPages.length > 0}
  failedPages={failedPages}
  failedChunks={clinical.failedChunkCount}
/>
```

No new fetches: `clinical.record` already contains every field B renders.
`FindingsSection` (A) and `PdfViewer` remain where they are. Evidence links reuse
A's `?page=N` handling and `PdfViewer`'s `useEffect` re-sync on `initialPage`;
B adds no new navigation logic.

## 7. Date conflicts

`hospitalization.admissionDateConflicts` and `dischargeDateConflicts` are
`ExtractedValue<string>[]`. Each non-empty array renders a cautious warning in
the Hospitalization section:

- Heading: `Fechas de ingreso contradictorias` / `Fechas de alta contradictorias`.
- Each conflicting value with its own `EvidenceLinks`.
- Copy is neutral and never asserts an error (e.g. "La documentación registra
  más de una fecha. Revisar la documentación original."). Definition and copy
  live in i18n; no `Finding` is created by B (rule engine is slice E).

## 8. Copy

All strings Spanish, centralized in `packages/lib/src/i18n/es.ts`. Extend
`clinicalRecord` and add:

- Patient: `birthDate`.
- Hospitalization: `dischargeDiagnosis`, `admissionDateConflicts`,
  `dischargeDateConflicts`, `dateConflictNote`.
- History: `history`, `pathological`, `allergies`, `usualMedications`.
- Item field labels: `dose`, `route`, `frequency`, `startDate`, `endDate`,
  `status`, `date`, `name`, `value`, `unit`, `referenceRange`, `type`,
  `indication`, `result`, `sample`, `organism`, `sensitivity`.
- Medication status: `medicationStatus.active|stopped|unknown` →
  `Activa | Suspendida | Desconocida`.
- Discharge: `discharge`, `conditionAtDischarge`, `treatment`, `instructions`,
  `warningSigns`, `followUp`.
- Evidence: `evidence: "Evidencia"` under `clinicalRecord` (section-level label).
  Page-link text is not duplicated here — `EvidenceLink` reuses A's
  `findings.viewPage` (§5.2).

## 9. Error handling

- A section with no populated fields renders `RecordEmpty` (no missing-value
  noise).
- A field with an empty/whitespace value is omitted rather than shown blank.
- A list item whose every field is empty is still rendered (it came from the
  record) with its evidence; this is a rendering edge case, not an error.
- `clinical === null` → the whole view is not rendered (existing behavior in
  `page.tsx`).
- Incomplete extraction → the existing "Análisis incompleto" alert remains at
  the top of the view.

## 10. Testing

TDD, `bun test` per workspace; no component-render test framework exists (web
tests exercise pure helpers, as in `pdf-viewer.test.tsx`).

- **Web pure helpers** (`apps/web/lib/clinical-record-view.test.ts`):
  - `displayValue`: trims whitespace → `undefined`; preserves numbers and
    non-empty strings.
  - `sourcePages`: dedupes, sorts ascending, ignores non-positive/invalid pages.
  - `mergeSourcePages`: unions across groups and dedupes.
  - `countsBySection`: counts each array; zero for an empty record.
- **i18n** (`packages/lib/src/i18n/es.test.ts`): new labels exist and every
  `MedicationStatus`/field label is Spanish.
- **Component wiring**: covered indirectly by `typecheck` (props satisfy the
  shared primitives) plus a manual smoke test.
- No new dependencies.

Manual smoke (running stack): a document with meds/labs/studies/micro renders
all items; each "Ver página N" moves the PDF viewer to page N; a record with
date conflicts shows the warning with evidence; an empty record shows per-section
empty states; `<details>` sections expand/collapse.

Definition of done: `bun run lint`, `bun run typecheck`, `bun run test` pass at
the repo root.

## 11. Files touched

- `packages/lib/src/i18n/es.ts` (+ `es.test.ts`)
- `apps/web/lib/clinical-record-view.ts` (+ test)
- `apps/web/components/evidence-link.tsx`
- `apps/web/components/clinical-record-primitives.tsx`
- `apps/web/components/clinical-record-sections.tsx`
- `apps/web/components/clinical-record-view.tsx`
- `apps/web/components/finding-card.tsx` (reuse `EvidenceLink`; from A)
- `apps/web/app/documents/[id]/page.tsx` (pass `documentId`)

No changes to `packages/domain`, `packages/db`, `apps/worker`, or the API route.

## 12. Follow-ups (not in B)

- Slice C: `clinicalEvents` timeline with jump-to-page.
- Slice D: persisted clinical/audit summaries and the §25 overview (duration,
  severity distribution).
- Slice E: deterministic rules producing date-conflict findings (B only warns).
- Slice G: §10 left-navigation shell and `document_pages` metadata display.
- Bounding-box highlighting once a provider populates `Source.boundingBox`.
