# Timeline and Summaries — Design (Phase 4)

Date: 2026-09-20
Source spec: `MEDICAL_AUDIT_AI_MVP_SPEC.md` (§14, §22, §23, §26; §38 Phase 4), `docs/superpowers/specs/2026-09-16-medical-audit-ai-mvp-design.md` (§5, §9, §10, §14 P4)
Status: Approved design (pre-implementation plan)
Scope: Inert-data program slices C (Timeline) and D (Summaries)

## 1. Purpose

The pipeline persists a normalized `ClinicalRecord` (including `clinicalEvents`)
and `Finding[]`, but the UI renders neither a chronological timeline nor the
clinical/audit summaries required by spec §22–§26. The extracted `clinicalEvents`
are effectively inert, and the auditor has no at-a-glance view of the
hospitalization or its audit-relevant items.

This slice makes the timeline and both summaries visible, grounded, and
clickable back to source pages.

## 2. Context: inert-data program decomposition

The decomposition of persisted-but-unrendered data (from the findings-review
spec, §2) lists this work as slices **C** and **D**. They are combined here
because both are pure read-side projections of the same data and share the date
normalization utility.

| # | Slice | Scope |
|---|---|---|
| A | Findings review UI | Done |
| B | Full clinical record view | Done |
| C | **Timeline** (this spec) | Fusion of structured events + `clinicalEvents`, chronological, jump-to-page |
| D | **Summaries** (this spec) | Deterministic clinical summary + audit summary, rendered with evidence |
| E | Audit rules engine | `packages/audit`: deterministic rules + registry |
| F | Chat | Done |
| G | Lifecycle/hardening | `access_log` wiring, retention/TLS docs |

## 3. Confirmed decisions

Decided with the project owner during brainstorming:

| Question | Decision |
|---|---|
| Clinical summary | **Deterministic**, built server-side from the `ClinicalRecord`; fixed sections, every value linking to its source page. No LLM. |
| Audit summary | **Deterministic**, built from `ClinicalRecord` + `Finding[]`; counts/duration computed, findings grouped. No LLM. |
| Timeline source | **Structured fields + extracted `clinicalEvents` fused**, deduped, each entry with its `Source`. |
| Generation timing | **Derived on read** from persisted data. No DB migration, no pipeline/worker changes; works on existing documents. |
| UI | Timeline and summaries as **sections in the current single scroll**, above the clinical record. No navigation shell. |

`LLMProvider.generateClinicalSummary` / `generateAuditSummary` remain in the
interface (spec §17) but are **not called** in this phase.

## 4. Architecture

Pure, dependency-free functions in `@audit/domain` (which has no infra imports;
`@audit/lib` already depends on `domain`, so this is the correct direction). The
web app consumes them with existing UI primitives. No new runtime dependency, no
schema change, no API change.

```text
ClinicalRecord ─┬─> buildTimeline ────────────> TimelineGroup[]
                │
                ├─> buildClinicalSummary ─────> ClinicalSummary
                │
Finding[] ──────┴─> buildAuditSummary ────────> AuditSummary
                          (uses dates + timeline)

apps/web: timeline.tsx / clinical-summary.tsx / audit-summary.tsx
          → render with EvidenceLink (?page=N) and i18n labels
```

## 5. Date normalization (`packages/domain/src/dates.ts`)

First-class utility per the MVP design §5. Never invents a date.

```typescript
export type NormalizedDate = {
  original: string;
  iso?: string;
  hasYear: boolean;
};

export function normalizeDate(
  input: string,
  context?: { referenceYear?: number },
): NormalizedDate;

export function compareNormalizedDates(
  a: NormalizedDate | undefined,
  b: NormalizedDate | undefined,
): number;

export function hospitalizationDurationDays(
  admission?: string,
  discharge?: string,
): number | undefined;
```

Rules:

- Formats: `dd/mm/yyyy`, `dd/mm/yy`, `dd/mm`, and `yyyy-mm-dd` (also `-`
  separators). Whitespace trimmed.
- `iso` is set only for a **valid** calendar date (month 1–12; day valid for the
  month — `31/02` yields no `iso`). No dates are corrected or rolled over.
- 2-digit years map to `20yy`; 4-digit years pass through.
- Bare `dd/mm` has `hasYear: false`; if `context.referenceYear` is provided, an
  `iso` is produced with that year **for ordering only**. Without context, no
  `iso`.
- Unknown formats return `{ original, hasYear: false }`.
- `compareNormalizedDates`: entries with `iso` sort ascending; entries without
  `iso` sort after all dated entries.
- `hospitalizationDurationDays`: whole-day difference of the two normalized
  `iso` values (e.g. `13/02/2026` → `28/02/2026` = `15`). Unknown/undated or
  discharge-before-admission yields `undefined`; it does not invent or negate.

## 6. Timeline (`packages/domain/src/timeline.ts`)

```typescript
export type TimelineDetail =
  | { kind: "admission" }
  | { kind: "discharge" }
  | { kind: "medication"; name: string; change: "start" | "stop" }
  | { kind: "laboratory"; name: string; value: string; unit?: string }
  | { kind: "study"; studyType: string; result?: string }
  | { kind: "microbiology"; sample?: string; organism?: string; result?: string }
  | { kind: "documented"; description: string };

export type TimelineEntry = {
  id: string;
  type: ClinicalEventType;
  date?: string;
  normalized?: NormalizedDate;
  sources: Source[];
  detail: TimelineDetail;
};

export type TimelineGroup = {
  key: string;
  date?: string;
  undated: boolean;
  entries: TimelineEntry[];
};

export function buildTimeline(record: ClinicalRecord): TimelineGroup[];
```

`TimelineDetail` carries no Spanish; the UI composes the display string through
`@audit/lib/i18n` (`medication` → "Inicio de X" / "Fin de X", etc.). Only
`documented` carries free text, which comes verbatim from the model/document.

Building:

1. **Structured events** synthesized from the record, each with date text and
   `sources`:
   - `admission` from `hospitalization.admissionDate`;
   - `discharge` from `hospitalization.dischargeDate`;
   - `medication` `start`/`stop` from `medications[].startDate`/`endDate`
     (`name` = medication name);
   - `laboratory` from each `LabResult.date`;
   - `study` (type `imaging`) from each `Study.date`;
   - `microbiology` from each `MicrobiologyResult.date`.
2. **Documented events** from `record.clinicalEvents`, mapped to the same shapes
   (`kind: "documented"`, description verbatim).
3. **Fusion:** documented events of narrative types
   (`diagnosis`, `clinical_evolution`, `procedure`, `medication_change`, `other`)
   are always kept. Documented events of a type that structured data already
   covers are kept **only if no structured event of the mapped type shares the
   same source page** (avoids duplication while not dropping data the structured
   extraction missed). Mapping: `imaging`→`study`, `medication_start`→medication
   `start`, `medication_stop`→medication `stop`.
4. **Dedupe** by signature `(type, normalized detail description, date)`.
5. **Order**: normalize each entry's date with `referenceYear` taken from the
   admission date; sort with `compareNormalizedDates`; undated entries go to a
   final group.
6. **Group** by normalized `iso` (key `iso`, `date` `iso`), or one final
   `{ key: "undated", undated: true }` group. Group labels are formatted in the
   UI (`dd/mm`), never hardcoded here.
7. `id` is a stable content-derived id (reuse the `djb2`/signature approach from
   `finding.ts`) so React keys and anchors are stable across renders.

## 7. Summaries (`packages/domain/src/summary.ts`)

### 7.1 Clinical summary (spec §22)

```typescript
export type ClinicalSummary = {
  patient: Patient;
  admissionDate?: ExtractedValue<string>;
  dischargeDate?: ExtractedValue<string>;
  durationDays?: number;
  reason?: ExtractedValue<string>;
  diagnoses: ExtractedValue<string>[];
  pathological: ExtractedValue<string>[];
  allergies: ExtractedValue<string>[];
  evolution: TimelineEntry[];
  studies: Study[];
  microbiology: MicrobiologyResult[];
  treatment: Medication[];
  discharge?: DischargeInformation;
};

export function buildClinicalSummary(record: ClinicalRecord): ClinicalSummary;
```

A curated projection of the record plus `durationDays` and the timeline's
`clinical_evolution` entries. Every row keeps its `sources`, so the UI can link
each value to its page. Missing fields stay missing; nothing is synthesized.

### 7.2 Audit summary (spec §23)

```typescript
export type AuditSummary = {
  durationDays?: number;
  reason?: ExtractedValue<string>;
  majorEvents: TimelineEntry[];
  majorTreatments: Medication[];
  treatmentChanges: TimelineEntry[];
  relevantStudies: Study[];
  microbiology: MicrobiologyResult[];
  documentationGaps: Finding[];
  inconsistencies: Finding[];
  requiresReview: number;
};

export function buildAuditSummary(
  record: ClinicalRecord,
  findings: Finding[],
): AuditSummary;
```

- `durationDays` from `hospitalizationDurationDays`.
- `majorEvents` = timeline entries excluding pure medication start/stop noise
  (admission, discharge, diagnosis, evolution, procedure, lab, study, micro).
- `majorTreatments` = medications; `treatmentChanges` = timeline entries of type
  `medication_start`/`medication_stop`/`medication_change`.
- Findings split: `documentationGaps` = category `documentation`;
  `inconsistencies` = categories `temporal`, `contradiction`, `medication`,
  `audit`, `other`. `requiresReview` = findings length.
- The UI labels these sections as **documented facts**, **detected
  inconsistencies**, **missing documentation**, and **AI interpretation
  requiring human review**, matching §23. The findings-derived sections are
  explicitly marked as AI-generated; the record-derived sections are documented
  facts.

## 8. UI

New components in `apps/web/components/`, all server components (no client
state), inserted in `apps/web/app/documents/[id]/page.tsx` **above**
`ClinicalRecordView`:

- `timeline.tsx` — renders `TimelineGroup[]`; each entry shows its formatted
  date/group, the composed description, and an `EvidenceLink` per source
  (reusing `?page=N` navigation already wired to the PDF viewer).
- `clinical-summary.tsx` — renders `ClinicalSummary` using the existing
  `clinical-record-primitives.tsx` (`Section`, field grid, item) so evidence
  links and layout match the record view.
- `audit-summary.tsx` — renders `AuditSummary` with the four labelled groups;
  finding rows link to the finding cards (`#finding-<id>`).

Display-only: no review actions here (findings keep their own section).

Pure formatting helpers (date label `dd/mm`, `TimelineDetail` → display string
with i18n, empty-state decisions) live in `apps/web/lib/timeline-view.ts` and
`apps/web/lib/summary-view.ts`, unit-tested like `findings-view.ts`.

## 9. Copy / i18n

All user-facing strings go in `packages/lib/src/i18n/es.ts`. Reuse
`ui.summary`, `ui.timeline`. Add: summary section labels (`Motivo`, `Duración`,
`Antecedentes`, `Evolución`, `Estudios`, `Microbiología`, `Tratamiento`,
`Alta`), audit-summary labels (`Resumen de auditoría`, `Hechos documentados`,
`Inconsistencias detectadas`, `Documentación faltante`, `Interpretación de IA`,
`Requiere revisión humana`, `Días de internación`), timeline labels (`Ingreso`,
`Egreso`, `Inicio de {med}`, `Fin de {med}`, `Sin fecha`), and empty states
(`Sin eventos documentados`).

## 10. Error handling

Because this is a pure read-side projection over already-validated data:

- A malformed/undated value never throws; it degrades to an undated or omitted
  entry (never an invented date).
- `clinicalEvents = []` yields a timeline with only structured events.
- No record → sections are simply not rendered (existing behavior).
- Incomplete extraction continues to be communicated by the existing "Análisis
  incompleto" alert; summaries/timeline do not present missing data as present.

## 11. Testing

TDD with `bun test` per workspace.

- **`dates.test.ts`**: all formats; 2-digit year; valid vs invalid dates
  (`31/02`); bare `dd/mm` with and without `referenceYear`; sort order with
  undated last; duration calculation and its `undefined` cases.
- **`timeline.test.ts`**: structured synthesis per source field; fusion keeps
  narrative documented events; covered-type dedupe by page; signature dedupe;
  chronological order; undated group last; sources preserved; stable ids.
- **`summary.test.ts`**: duration; curated projection preserves missing fields;
  finding grouping by category; `requiresReview` count; no invented values.
- **Web helpers** (`timeline-view.test.ts`, `summary-view.test.ts`): date label
  formatting, detail-to-string composition, empty states.
- Optional component render test for the timeline, mirroring
  `pdf-viewer.test.tsx`.

Definition of done: `bun run lint`, `bun run typecheck`, `bun run test` pass at
the repo root.

## 12. Files touched

- `packages/domain/src/dates.ts` (+ `dates.test.ts`)
- `packages/domain/src/timeline.ts` (+ `timeline.test.ts`)
- `packages/domain/src/summary.ts` (+ `summary.test.ts`)
- `packages/domain/src/index.ts`
- `apps/web/lib/timeline-view.ts` (+ test), `apps/web/lib/summary-view.ts` (+ test)
- `apps/web/components/timeline.tsx`, `apps/web/components/clinical-summary.tsx`,
  `apps/web/components/audit-summary.tsx`
- `apps/web/app/documents/[id]/page.tsx`
- `packages/lib/src/i18n/es.ts`

## 13. Out of scope (follow-ups)

- Any LLM call for summaries; `generateClinicalSummary`/`generateAuditSummary`
  stay unused.
- DB migration or persisting derived timeline/summaries (revisit only if read
  cost becomes an issue).
- Bounding-box highlighting.
- The spec §24 left-navigation shell.
- Deterministic audit rules that would enrich `Finding[]` (slice E / Phase 5).
