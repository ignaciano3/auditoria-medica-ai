# Full Clinical Record View (Slice B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every persisted `ClinicalRecord` field with per-field source-page evidence, collapsible sections, date-conflict warnings, and birth date, replacing the subset-only `ClinicalRecordView`.

**Architecture:** Web-only read-only slice. Pure helpers (page number extraction, display formatting, section counts) live in `apps/web/lib/clinical-record-view.ts` and are unit-tested. A shared `EvidenceLink`/`EvidenceLinks` primitive (also adopted by Slice A's `finding-card.tsx`) links to `/documents/[id]?page=N`, reusing A's PDF-viewer query-param sync. Record primitives (collapsible section, field grid, item) compose into eight section components rendered by the existing `ClinicalRecordView` orchestrator. No domain, DB, worker, or schema changes.

**Tech Stack:** Bun workspaces + Turborepo, TypeScript (strict, `exactOptionalPropertyTypes`), Biome, Next.js 16 App Router (React 19 server components), Tailwind, `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-17-full-clinical-record-view-design.md`

**Depends on:** Slice A (`docs/superpowers/plans/2026-09-17-findings-review-ui.md`) landing on `main` first. Tasks 2–8 consume A's `findings` i18n object (`findings.viewPage`), the A-created `apps/web/components/finding-card.tsx`, and A's `?page=N` handling in `page.tsx` / `pdf-viewer.tsx`. Task 1 is independent of A.

## Global Constraints

- All user-facing strings are **Spanish**, centralized in `packages/lib/src/i18n/es.ts`. Code, identifiers, and docs are English.
- Read-only: no changes to `packages/domain`, `packages/db`, `apps/worker`, the API route, or the database schema.
- Biome is the linter/formatter (2-space indent, double quotes, semicolons, organized imports). Run `bunx turbo run lint --filter=@audit/web --filter=@audit/lib`.
- Strict TypeScript: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. No `any`. Optional props that may receive `undefined` are typed `foo?: T | undefined`.
- Do **not** add comments to code (project convention).
- **No new dependencies.**
- TDD: write the failing test, see it fail, implement minimally, see it pass, commit.
- Test file naming: `<module>.test.ts(x)` beside the module. `bun test` is the runner. There is no component-render test framework; component behavior is covered by `typecheck` plus manual smoke.
- Commit after every task with the given message.

---

### Task 1: Record view helpers (web, pure) — **independent of Slice A**

**Files:**
- Create: `apps/web/lib/clinical-record-view.ts`
- Test: `apps/web/lib/clinical-record-view.test.ts` (create)

**Interfaces:**
- Consumes: `ClinicalRecord`, `Source` from `@audit/domain`.
- Produces:
  - `displayValue(value: string | number | undefined): string | undefined`
  - `sourcePages(sources: Source[]): number[]` — unique ascending positive pages
  - `mergeSourcePages(...groups: Source[][]): number[]`
  - `type SectionCounts = { pathological; allergies; usualMedications; medications; laboratory; studies; microbiology }` (all `number`)
  - `countsBySection(record: ClinicalRecord): SectionCounts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/clinical-record-view.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, Source } from "@audit/domain";
import {
  countsBySection,
  displayValue,
  mergeSourcePages,
  sourcePages,
} from "./clinical-record-view.ts";

function source(pageNumber: number): Source {
  return { documentId: "d1", pageNumber, text: "t" };
}

function emptyRecord(): ClinicalRecord {
  return {
    patient: {},
    hospitalization: {
      diagnoses: [],
      admissionDateConflicts: [],
      dischargeDateConflicts: [],
    },
    history: { pathological: [], allergies: [], usualMedications: [] },
    medications: [],
    laboratory: [],
    studies: [],
    microbiology: [],
    clinicalEvents: [],
  };
}

describe("displayValue", () => {
  test("returns undefined for undefined", () => {
    expect(displayValue(undefined)).toBeUndefined();
  });

  test("returns undefined for blank strings", () => {
    expect(displayValue("   ")).toBeUndefined();
  });

  test("trims non-empty strings", () => {
    expect(displayValue("  hola  ")).toBe("hola");
  });

  test("stringifies numbers", () => {
    expect(displayValue(45)).toBe("45");
  });
});

describe("sourcePages", () => {
  test("dedupes and sorts page numbers ascending", () => {
    expect(sourcePages([source(3), source(1), source(3)])).toEqual([1, 3]);
  });

  test("ignores non-positive and non-integer pages", () => {
    expect(sourcePages([source(0), source(-2), source(1.5), source(2)])).toEqual([
      2,
    ]);
  });

  test("returns an empty array for no sources", () => {
    expect(sourcePages([])).toEqual([]);
  });
});

describe("mergeSourcePages", () => {
  test("unions groups and dedupes", () => {
    expect(
      mergeSourcePages([source(3)], [source(1), source(3)], []),
    ).toEqual([1, 3]);
  });
});

describe("countsBySection", () => {
  test("returns zero for an empty record", () => {
    expect(countsBySection(emptyRecord())).toEqual({
      pathological: 0,
      allergies: 0,
      usualMedications: 0,
      medications: 0,
      laboratory: 0,
      studies: 0,
      microbiology: 0,
    });
  });

  test("counts each section", () => {
    const record = emptyRecord();
    record.history.pathological = [{ value: "x", sources: [source(1)] }];
    record.medications = [
      { name: { value: "m", sources: [source(2)] }, sources: [source(2)] },
    ];
    record.laboratory = [
      {
        name: { value: "l", sources: [source(3)] },
        value: { value: "1", sources: [source(3)] },
        sources: [source(3)],
      },
    ];
    record.studies = [
      { type: { value: "s", sources: [source(4)] }, sources: [source(4)] },
    ];
    record.microbiology = [
      { organism: { value: "o", sources: [source(5)] }, sources: [source(5)] },
    ];
    expect(countsBySection(record)).toEqual({
      pathological: 1,
      allergies: 0,
      usualMedications: 0,
      medications: 1,
      laboratory: 1,
      studies: 1,
      microbiology: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/web/lib/clinical-record-view.test.ts`
Expected: FAIL — module `./clinical-record-view.ts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/lib/clinical-record-view.ts`:

```ts
import type { ClinicalRecord, Source } from "@audit/domain";

export function displayValue(
  value: string | number | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

export function sourcePages(sources: Source[]): number[] {
  const pages = new Set<number>();
  for (const source of sources) {
    if (Number.isInteger(source.pageNumber) && source.pageNumber > 0) {
      pages.add(source.pageNumber);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function mergeSourcePages(...groups: Source[][]): number[] {
  return sourcePages(groups.flat());
}

export type SectionCounts = {
  pathological: number;
  allergies: number;
  usualMedications: number;
  medications: number;
  laboratory: number;
  studies: number;
  microbiology: number;
};

export function countsBySection(record: ClinicalRecord): SectionCounts {
  return {
    pathological: record.history.pathological.length,
    allergies: record.history.allergies.length,
    usualMedications: record.history.usualMedications.length,
    medications: record.medications.length,
    laboratory: record.laboratory.length,
    studies: record.studies.length,
    microbiology: record.microbiology.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/web/lib/clinical-record-view.test.ts`
Expected: PASS (all cases).

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/clinical-record-view.ts apps/web/lib/clinical-record-view.test.ts
git commit -m "feat(web): add clinical record view helpers"
```

---

### Task 2: Spanish copy for the record (lib) — requires Slice A

**Files:**
- Modify: `packages/lib/src/i18n/es.ts`
- Modify: `packages/lib/src/index.ts`
- Test: `packages/lib/src/i18n/es.test.ts`

**Interfaces:**
- Produces: `clinicalRecord` extended with field/section labels; `medicationStatusLabels: Record<MedicationStatus, string>`; both exported from `@audit/lib/i18n` and `@audit/lib`.
- Consumes: A's `findings` i18n object (already present after A lands).

- [ ] **Step 1: Write the failing test**

Append to `packages/lib/src/i18n/es.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  clinicalRecord,
  medicationStatusLabels,
} from "./es.ts";

describe("clinicalRecord copy", () => {
  test("labels birth date and history in Spanish", () => {
    expect(clinicalRecord.birthDate).toBe("Fecha de nacimiento");
    expect(clinicalRecord.pathological).toBe("Antecedentes patológicos");
    expect(clinicalRecord.allergies).toBe("Alergias");
  });

  test("labels discharge and item fields in Spanish", () => {
    expect(clinicalRecord.discharge).toBe("Alta");
    expect(clinicalRecord.conditionAtDischarge).toBe("Condición al alta");
    expect(clinicalRecord.referenceRange).toBe("Valor de referencia");
    expect(clinicalRecord.sensitivity).toBe("Sensibilidad");
  });

  test("labels date conflicts and the cautious note", () => {
    expect(clinicalRecord.admissionDateConflicts).toBe(
      "Fechas de ingreso contradictorias",
    );
    expect(clinicalRecord.dischargeDateConflicts).toBe(
      "Fechas de alta contradictorias",
    );
    expect(clinicalRecord.dateConflictNote).toContain(
      "Revisar la documentación original",
    );
  });
});

describe("medicationStatusLabels", () => {
  test("maps every medication status to Spanish", () => {
    expect(medicationStatusLabels).toEqual({
      active: "Activa",
      stopped: "Suspendida",
      unknown: "Desconocida",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/lib/src/i18n/es.test.ts`
Expected: FAIL — `medicationStatusLabels` is not exported / labels missing.

- [ ] **Step 3: Extend the copy**

In `packages/lib/src/i18n/es.ts`, add `MedicationStatus` to the type import:

```ts
import type { DocumentStatus, MedicationStatus, PageDocType } from "@audit/domain";
```

Replace the `clinicalRecord` object with:

```ts
export const clinicalRecord = {
  patient: "Paciente",
  name: "Nombre",
  age: "Edad",
  sex: "Sexo",
  birthDate: "Fecha de nacimiento",
  hospitalization: "Internación",
  admissionDate: "Fecha de ingreso",
  dischargeDate: "Fecha de alta",
  reason: "Motivo de ingreso",
  diagnoses: "Diagnósticos",
  dischargeDiagnosis: "Diagnóstico de alta",
  admissionDateConflicts: "Fechas de ingreso contradictorias",
  dischargeDateConflicts: "Fechas de alta contradictorias",
  dateConflictNote:
    "La documentación registra más de una fecha. Revisar la documentación original.",
  history: "Antecedentes",
  pathological: "Antecedentes patológicos",
  allergies: "Alergias",
  usualMedications: "Medicación habitual",
  medications: "Medicaciones",
  laboratory: "Laboratorio",
  studies: "Estudios",
  microbiology: "Microbiología",
  discharge: "Alta",
  conditionAtDischarge: "Condición al alta",
  treatment: "Tratamiento",
  instructions: "Indicaciones",
  warningSigns: "Signos de alarma",
  followUp: "Seguimiento",
  dose: "Dosis",
  route: "Vía",
  frequency: "Frecuencia",
  startDate: "Inicio",
  endDate: "Fin",
  status: "Estado",
  date: "Fecha",
  value: "Valor",
  unit: "Unidad",
  referenceRange: "Valor de referencia",
  type: "Tipo",
  indication: "Indicación",
  result: "Resultado",
  sample: "Muestra",
  organism: "Microorganismo",
  sensitivity: "Sensibilidad",
  evidence: "Evidencia",
  noInfo: "No se encontró información suficiente",
} as const;

export const medicationStatusLabels: Record<MedicationStatus, string> = {
  active: "Activa",
  stopped: "Suspendida",
  unknown: "Desconocida",
};
```

- [ ] **Step 4: Export from the lib index**

In `packages/lib/src/index.ts`, find the i18n re-export block (it exports `documentStatusLabels`, `pageDocTypeLabels`, `clinicalRecord`, `ui`, `errors`, etc.) and add `medicationStatusLabels` (alphabetized).

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/lib/src/i18n/es.test.ts`
Expected: PASS.

Run: `bunx turbo run typecheck --filter=@audit/lib`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/lib/src/i18n/es.ts packages/lib/src/index.ts packages/lib/src/i18n/es.test.ts
git commit -m "feat(lib): add Spanish copy for the clinical record view"
```

---

### Task 3: Shared evidence link primitive (web) — requires Slice A

**Files:**
- Create: `apps/web/components/evidence-link.tsx`

**Interfaces:**
- Consumes: `findings.viewPage(page)` from `@audit/lib/i18n` (A); `sourcePages` from `./../lib/clinical-record-view.ts` (Task 1); `Source` from `@audit/domain`.
- Produces:
  - `EvidenceLink({ documentId, page, hash }: { documentId: string; page: number; hash?: string | undefined })`
  - `EvidenceLinks({ documentId, sources, hash }: { documentId: string; sources: Source[]; hash?: string | undefined })`

- [ ] **Step 1: Create the component**

Create `apps/web/components/evidence-link.tsx`:

```tsx
import type { Source } from "@audit/domain";
import { findings } from "@audit/lib/i18n";
import type { Route } from "next";
import Link from "next/link";
import { sourcePages } from "../lib/clinical-record-view.ts";

export function EvidenceLink({
  documentId,
  page,
  hash,
}: {
  documentId: string;
  page: number;
  hash?: string | undefined;
}) {
  const pathname = `/documents/${documentId}` as Route;
  const href =
    hash !== undefined
      ? { pathname, query: { page }, hash }
      : { pathname, query: { page } };

  return (
    <Link className="text-sm underline" href={href}>
      {findings.viewPage(page)}
    </Link>
  );
}

export function EvidenceLinks({
  documentId,
  sources,
  hash,
}: {
  documentId: string;
  sources: Source[];
  hash?: string | undefined;
}) {
  const pages = sourcePages(sources);
  if (pages.length === 0) return null;

  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {pages.map((page) => (
        <EvidenceLink
          key={page}
          documentId={documentId}
          page={page}
          hash={hash}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS. This task has no unit test (presentational; consistent with the repo's no-render-test convention).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/evidence-link.tsx
git commit -m "feat(web): add shared evidence page link"
```

---

### Task 4: Record primitives (web) — requires Tasks 1–3

**Files:**
- Create: `apps/web/components/clinical-record-primitives.tsx`

**Interfaces:**
- Consumes: `displayValue`, `sourcePages` (Task 1); `EvidenceLink`, `EvidenceLinks` (Task 3); `clinicalRecord`, `medicationStatusLabels` (Task 2).
- Produces:
  - `type RecordFieldSpec = { label: string; value: string | number | undefined; sources: Source[] }`
  - `CollapsibleSection({ title, count, defaultOpen, children })`
  - `RecordField({ label, value, documentId, sources })` — `<dt>`/`<dd>` or `null`
  - `RecordFields({ documentId, fields })` — `<dl>` of visible fields, or `null`
  - `RecordItem({ documentId, title, fields, sources })` — `<li>` with title, fields, merged evidence
  - `RecordEmpty()`
  - `MedicationStatusLabel({ status })`

- [ ] **Step 1: Create the primitives**

Create `apps/web/components/clinical-record-primitives.tsx`:

```tsx
import type { MedicationStatus, Source } from "@audit/domain";
import { clinicalRecord, medicationStatusLabels } from "@audit/lib/i18n";
import { Fragment, type ReactNode } from "react";
import { displayValue } from "../lib/clinical-record-view.ts";
import { EvidenceLinks } from "./evidence-link.tsx";

export type RecordFieldSpec = {
  label: string;
  value: string | number | undefined;
  sources: Source[];
};

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="rounded-lg border border-foreground/20 p-4"
      open={defaultOpen}
    >
      <summary className="cursor-pointer text-base font-semibold">
        {title}
        {count !== undefined ? ` (${count})` : ""}
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

export function RecordField({
  label,
  value,
  documentId,
  sources,
}: {
  label: string;
  value: string | number | undefined;
  documentId: string;
  sources: Source[];
}) {
  const text = displayValue(value);
  if (text === undefined) return null;

  return (
    <>
      <dt className="font-semibold text-foreground/70">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
        <span>{text}</span>
        <EvidenceLinks documentId={documentId} sources={sources} />
      </dd>
    </>
  );
}

export function RecordFields({
  documentId,
  fields,
}: {
  documentId: string;
  fields: RecordFieldSpec[];
}) {
  const visible = fields.filter(
    (field) => displayValue(field.value) !== undefined,
  );
  if (visible.length === 0) return null;

  return (
    <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1">
      {visible.map((field, index) => (
        <Fragment key={`${field.label}-${index}`}>
          <RecordField
            label={field.label}
            value={field.value}
            documentId={documentId}
            sources={field.sources}
          />
        </Fragment>
      ))}
    </dl>
  );
}

export function RecordItem({
  documentId,
  title,
  fields,
  sources,
}: {
  documentId: string;
  title?: string | undefined;
  fields: RecordFieldSpec[];
  sources: Source[];
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-foreground/15 p-3">
      {title !== undefined ? (
        <p className="font-semibold [overflow-wrap:anywhere]">{title}</p>
      ) : null}
      <RecordFields documentId={documentId} fields={fields} />
      <EvidenceLinks documentId={documentId} sources={sources} />
    </li>
  );
}

export function RecordEmpty() {
  return <p className="text-sm text-foreground/60">{clinicalRecord.noInfo}</p>;
}

export function MedicationStatusLabel({
  status,
}: {
  status: MedicationStatus | undefined;
}) {
  if (status === undefined) return null;
  return <>{medicationStatusLabels[status]}</>;
}
```

- [ ] **Step 2: Verify types**

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/clinical-record-primitives.tsx
git commit -m "feat(web): add clinical record primitives"
```

---

### Task 5: Section components (web) — requires Task 4

**Files:**
- Create: `apps/web/components/clinical-record-sections.tsx`

**Interfaces:**
- Consumes: all primitives (Task 4); `displayValue`, `mergeSourcePages` (Task 1); `clinicalRecord` (Task 2); domain types.
- Produces:
  - `PatientSection({ documentId, patient })`
  - `HospitalizationSection({ documentId, hospitalization })`
  - `HistorySection({ documentId, history })`
  - `MedicationsSection({ documentId, medications })`
  - `LaboratorySection({ documentId, laboratory })`
  - `StudiesSection({ documentId, studies })`
  - `MicrobiologySection({ documentId, microbiology })`
  - `DischargeSection({ documentId, discharge })`

- [ ] **Step 1: Create the sections**

Create `apps/web/components/clinical-record-sections.tsx`:

```tsx
import type {
  ClinicalRecord,
  ExtractedValue,
  Hospitalization,
  LabResult,
  MedicalHistory,
  Medication,
  MicrobiologyResult,
  Patient,
  Source,
  Study,
} from "@audit/domain";
import { clinicalRecord } from "@audit/lib/i18n";
import {
  displayValue,
  mergeSourcePages,
} from "../lib/clinical-record-view.ts";
import { EvidenceLinks } from "./evidence-link.tsx";
import {
  CollapsibleSection,
  MedicationStatusLabel,
  RecordEmpty,
  RecordFields,
  RecordItem,
  type RecordFieldSpec,
} from "./clinical-record-primitives.tsx";

function hasValue(value: string | number | undefined): boolean {
  return displayValue(value) !== undefined;
}

export function PatientSection({
  documentId,
  patient,
}: {
  documentId: string;
  patient: Patient;
}) {
  const fields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.name,
      value: patient.name?.value,
      sources: patient.name?.sources ?? [],
    },
    {
      label: clinicalRecord.age,
      value: patient.age?.value,
      sources: patient.age?.sources ?? [],
    },
    {
      label: clinicalRecord.sex,
      value: patient.sex?.value,
      sources: patient.sex?.sources ?? [],
    },
    {
      label: clinicalRecord.birthDate,
      value: patient.birthDate?.value,
      sources: patient.birthDate?.sources ?? [],
    },
  ];

  return (
    <CollapsibleSection title={clinicalRecord.patient} defaultOpen>
      {fields.some((field) => hasValue(field.value)) ? (
        <RecordFields documentId={documentId} fields={fields} />
      ) : (
        <RecordEmpty />
      )}
    </CollapsibleSection>
  );
}

function DateConflicts({
  documentId,
  label,
  conflicts,
}: {
  documentId: string;
  label: string;
  conflicts: ExtractedValue<string>[];
}) {
  if (conflicts.length === 0) return null;

  return (
    <div
      className="rounded-md border border-[#9a6700] p-3 text-sm text-[#9a6700]"
      role="alert"
    >
      <p className="font-semibold">{label}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {conflicts.map((conflict, index) => (
          <li
            key={`${conflict.value}-${index}`}
            className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
          >
            <span>{conflict.value}</span>
            <EvidenceLinks documentId={documentId} sources={conflict.sources} />
          </li>
        ))}
      </ul>
      <p className="mt-1">{clinicalRecord.dateConflictNote}</p>
    </div>
  );
}

export function HospitalizationSection({
  documentId,
  hospitalization,
}: {
  documentId: string;
  hospitalization: Hospitalization;
}) {
  const {
    admissionDate,
    dischargeDate,
    reason,
    diagnoses,
    dischargeDiagnosis,
    admissionDateConflicts,
    dischargeDateConflicts,
  } = hospitalization;

  const fields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.admissionDate,
      value: admissionDate?.value,
      sources: admissionDate?.sources ?? [],
    },
    {
      label: clinicalRecord.dischargeDate,
      value: dischargeDate?.value,
      sources: dischargeDate?.sources ?? [],
    },
    {
      label: clinicalRecord.reason,
      value: reason?.value,
      sources: reason?.sources ?? [],
    },
    {
      label: clinicalRecord.dischargeDiagnosis,
      value: dischargeDiagnosis?.value,
      sources: dischargeDiagnosis?.sources ?? [],
    },
  ];

  const hasAny =
    fields.some((field) => hasValue(field.value)) || diagnoses.length > 0;

  return (
    <CollapsibleSection title={clinicalRecord.hospitalization} defaultOpen>
      {hasAny ? (
        <div className="flex flex-col gap-3">
          <RecordFields documentId={documentId} fields={fields} />
          {diagnoses.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-foreground/70">
                {clinicalRecord.diagnoses}
              </h3>
              <ul className="flex list-none flex-col gap-1">
                {diagnoses.map((diagnosis, index) => (
                  <li
                    key={`${diagnosis.value}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                  >
                    <span>{diagnosis.value}</span>
                    <EvidenceLinks
                      documentId={documentId}
                      sources={diagnosis.sources}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <RecordEmpty />
      )}
      <DateConflicts
        documentId={documentId}
        label={clinicalRecord.admissionDateConflicts}
        conflicts={admissionDateConflicts}
      />
      <DateConflicts
        documentId={documentId}
        label={clinicalRecord.dischargeDateConflicts}
        conflicts={dischargeDateConflicts}
      />
    </CollapsibleSection>
  );
}

function medicationFields(medication: Medication): RecordFieldSpec[] {
  return [
    {
      label: clinicalRecord.dose,
      value: medication.dose?.value,
      sources: medication.dose?.sources ?? [],
    },
    {
      label: clinicalRecord.route,
      value: medication.route?.value,
      sources: medication.route?.sources ?? [],
    },
    {
      label: clinicalRecord.frequency,
      value: medication.frequency?.value,
      sources: medication.frequency?.sources ?? [],
    },
    {
      label: clinicalRecord.startDate,
      value: medication.startDate?.value,
      sources: medication.startDate?.sources ?? [],
    },
    {
      label: clinicalRecord.endDate,
      value: medication.endDate?.value,
      sources: medication.endDate?.sources ?? [],
    },
    {
      label: clinicalRecord.status,
      value:
        medication.status !== undefined
          ? medication.status
          : undefined,
      sources: [],
    },
  ];
}

function medicationSources(medication: Medication): Source[] {
  return mergeSourcePages(
    medication.sources,
    medication.name.sources,
    medication.dose?.sources ?? [],
    medication.route?.sources ?? [],
    medication.frequency?.sources ?? [],
    medication.startDate?.sources ?? [],
    medication.endDate?.sources ?? [],
  );
}

function MedicationItem({
  documentId,
  medication,
}: {
  documentId: string;
  medication: Medication;
}) {
  return (
    <RecordItem
      documentId={documentId}
      title={displayValue(medication.name.value)}
      fields={medicationFields(medication)}
      sources={medicationSources(medication)}
    />
  );
}

export function HistorySection({
  documentId,
  history,
}: {
  documentId: string;
  history: MedicalHistory;
}) {
  const groups: Array<{ label: string; entries: ExtractedValue<string>[] }> = [
    { label: clinicalRecord.pathological, entries: history.pathological },
    { label: clinicalRecord.allergies, entries: history.allergies },
  ];
  const hasAny =
    history.pathological.length > 0 ||
    history.allergies.length > 0 ||
    history.usualMedications.length > 0;

  return (
    <CollapsibleSection title={clinicalRecord.history} defaultOpen>
      {hasAny ? (
        <div className="flex flex-col gap-3">
          {groups.map((group) =>
            group.entries.length > 0 ? (
              <div key={group.label} className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-foreground/70">
                  {group.label}
                </h3>
                <ul className="flex list-none flex-col gap-1">
                  {group.entries.map((entry, index) => (
                    <li
                      key={`${entry.value}-${index}`}
                      className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                    >
                      <span>{entry.value}</span>
                      <EvidenceLinks
                        documentId={documentId}
                        sources={entry.sources}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {history.usualMedications.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-foreground/70">
                {clinicalRecord.usualMedications}
              </h3>
              <ul className="flex list-none flex-col gap-2">
                {history.usualMedications.map((medication, index) => (
                  <MedicationItem
                    key={`${medication.name.value}-${index}`}
                    documentId={documentId}
                    medication={medication}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <RecordEmpty />
      )}
    </CollapsibleSection>
  );
}

export function MedicationsSection({
  documentId,
  medications,
}: {
  documentId: string;
  medications: Medication[];
}) {
  return (
    <CollapsibleSection
      title={clinicalRecord.medications}
      count={medications.length}
    >
      {medications.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {medications.map((medication, index) => (
            <MedicationItem
              key={`${medication.name.value}-${index}`}
              documentId={documentId}
              medication={medication}
            />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function labSources(result: LabResult): Source[] {
  return mergeSourcePages(
    result.sources,
    result.name.sources,
    result.value.sources,
    result.date?.sources ?? [],
    result.unit?.sources ?? [],
    result.referenceRange?.sources ?? [],
  );
}

export function LaboratorySection({
  documentId,
  laboratory,
}: {
  documentId: string;
  laboratory: LabResult[];
}) {
  return (
    <CollapsibleSection
      title={clinicalRecord.laboratory}
      count={laboratory.length}
    >
      {laboratory.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {laboratory.map((result, index) => (
            <RecordItem
              key={`${result.name.value}-${index}`}
              documentId={documentId}
              title={displayValue(result.name.value)}
              fields={[
                {
                  label: clinicalRecord.date,
                  value: result.date?.value,
                  sources: result.date?.sources ?? [],
                },
                {
                  label: clinicalRecord.value,
                  value: result.value.value,
                  sources: result.value.sources,
                },
                {
                  label: clinicalRecord.unit,
                  value: result.unit?.value,
                  sources: result.unit?.sources ?? [],
                },
                {
                  label: clinicalRecord.referenceRange,
                  value: result.referenceRange?.value,
                  sources: result.referenceRange?.sources ?? [],
                },
              ]}
              sources={labSources(result)}
            />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function studySources(study: Study): Source[] {
  return mergeSourcePages(
    study.sources,
    study.type.sources,
    study.date?.sources ?? [],
    study.indication?.sources ?? [],
    study.result?.sources ?? [],
  );
}

export function StudiesSection({
  documentId,
  studies,
}: {
  documentId: string;
  studies: Study[];
}) {
  return (
    <CollapsibleSection title={clinicalRecord.studies} count={studies.length}>
      {studies.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {studies.map((study, index) => (
            <RecordItem
              key={`${study.type.value}-${index}`}
              documentId={documentId}
              title={displayValue(study.type.value)}
              fields={[
                {
                  label: clinicalRecord.date,
                  value: study.date?.value,
                  sources: study.date?.sources ?? [],
                },
                {
                  label: clinicalRecord.indication,
                  value: study.indication?.value,
                  sources: study.indication?.sources ?? [],
                },
                {
                  label: clinicalRecord.result,
                  value: study.result?.value,
                  sources: study.result?.sources ?? [],
                },
              ]}
              sources={studySources(study)}
            />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function microbiologySources(result: MicrobiologyResult): Source[] {
  return mergeSourcePages(
    result.sources,
    result.date?.sources ?? [],
    result.sample?.sources ?? [],
    result.organism?.sources ?? [],
    result.result?.sources ?? [],
    result.sensitivity?.sources ?? [],
  );
}

export function MicrobiologySection({
  documentId,
  microbiology,
}: {
  documentId: string;
  microbiology: MicrobiologyResult[];
}) {
  return (
    <CollapsibleSection
      title={clinicalRecord.microbiology}
      count={microbiology.length}
    >
      {microbiology.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {microbiology.map((result, index) => (
            <RecordItem
              key={`${result.organism?.value ?? result.sample?.value ?? index}`}
              documentId={documentId}
              title={displayValue(
                result.organism?.value ?? result.sample?.value,
              )}
              fields={[
                {
                  label: clinicalRecord.date,
                  value: result.date?.value,
                  sources: result.date?.sources ?? [],
                },
                {
                  label: clinicalRecord.sample,
                  value: result.sample?.value,
                  sources: result.sample?.sources ?? [],
                },
                {
                  label: clinicalRecord.result,
                  value: result.result?.value,
                  sources: result.result?.sources ?? [],
                },
                {
                  label: clinicalRecord.sensitivity,
                  value: result.sensitivity?.value,
                  sources: result.sensitivity?.sources ?? [],
                },
              ]}
              sources={microbiologySources(result)}
            />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

export function DischargeSection({
  documentId,
  discharge,
}: {
  documentId: string;
  discharge: ClinicalRecord["discharge"];
}) {
  const fields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.date,
      value: discharge?.date?.value,
      sources: discharge?.date?.sources ?? [],
    },
    {
      label: clinicalRecord.conditionAtDischarge,
      value: discharge?.conditionAtDischarge?.value,
      sources: discharge?.conditionAtDischarge?.sources ?? [],
    },
    {
      label: clinicalRecord.dischargeDiagnosis,
      value: discharge?.diagnosis?.value,
      sources: discharge?.diagnosis?.sources ?? [],
    },
    {
      label: clinicalRecord.treatment,
      value: discharge?.treatment?.value,
      sources: discharge?.treatment?.sources ?? [],
    },
    {
      label: clinicalRecord.instructions,
      value: discharge?.instructions?.value,
      sources: discharge?.instructions?.sources ?? [],
    },
    {
      label: clinicalRecord.warningSigns,
      value: discharge?.warningSigns?.value,
      sources: discharge?.warningSigns?.sources ?? [],
    },
    {
      label: clinicalRecord.followUp,
      value: discharge?.followUp?.value,
      sources: discharge?.followUp?.sources ?? [],
    },
  ];

  return (
    <CollapsibleSection title={clinicalRecord.discharge} defaultOpen>
      {fields.some((field) => hasValue(field.value)) ? (
        <RecordFields documentId={documentId} fields={fields} />
      ) : (
        <RecordEmpty />
      )}
    </CollapsibleSection>
  );
}
```

Note on `medicationFields` status: replace the status field's `value` with the rendered label string so `RecordItem` can display it without importing `MedicationStatusLabel` into the spec. Use:

```ts
    {
      label: clinicalRecord.status,
      value:
        medication.status !== undefined
          ? medicationStatusLabels[medication.status]
          : undefined,
      sources: [],
    },
```

and import `medicationStatusLabels` from `@audit/lib/i18n` in this file. Then `MedicationStatusLabel` in the primitives is unused by this file; keep it only if used, otherwise remove it from `clinical-record-primitives.tsx` to satisfy `noUnusedLocals` (it is an export, so it will not error, but YAGNI — remove it and do not export it). Simpler: **do not add `MedicationStatusLabel` to the primitives at all.** The plan's primitives task should omit it. (Tasks 4 and 5 must agree: the primitive does not exist; sections render status from `medicationStatusLabels`.)

- [ ] **Step 2: Verify types**

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/clinical-record-sections.tsx
git commit -m "feat(web): add clinical record section components"
```

---

### Task 6: Orchestrator and page wiring (web) — requires Task 5

**Files:**
- Modify: `apps/web/components/clinical-record-view.tsx`
- Modify: `apps/web/app/documents/[id]/page.tsx` (A's final version)

**Interfaces:**
- Consumes: the eight sections (Task 5).
- Produces: `ClinicalRecordView` now takes `documentId` and renders all sections.

- [ ] **Step 1: Replace the orchestrator**

Replace `apps/web/components/clinical-record-view.tsx` with:

```tsx
import type { ClinicalRecord } from "@audit/domain";
import {
  failedChunksIndicator,
  failedPagesIndicator,
  ui,
} from "@audit/lib/i18n";
import {
  DischargeSection,
  HistorySection,
  HospitalizationSection,
  LaboratorySection,
  MedicationsSection,
  MicrobiologySection,
  PatientSection,
  StudiesSection,
} from "./clinical-record-sections.tsx";

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
}) {
  return (
    <section className="flex flex-col gap-6">
      {incomplete ? (
        <div className="text-[#d1242f]" role="alert">
          <strong>{ui.incompleteAnalysis}</strong>
          {failedPages.length > 0 ? (
            <span> {failedPagesIndicator(failedPages)}</span>
          ) : null}
          {failedChunks > 0 ? (
            <span> {failedChunksIndicator(failedChunks)}</span>
          ) : null}
        </div>
      ) : null}

      <PatientSection documentId={documentId} patient={record.patient} />
      <HospitalizationSection
        documentId={documentId}
        hospitalization={record.hospitalization}
      />
      <HistorySection documentId={documentId} history={record.history} />
      <MedicationsSection
        documentId={documentId}
        medications={record.medications}
      />
      <LaboratorySection
        documentId={documentId}
        laboratory={record.laboratory}
      />
      <StudiesSection documentId={documentId} studies={record.studies} />
      <MicrobiologySection
        documentId={documentId}
        microbiology={record.microbiology}
      />
      <DischargeSection
        documentId={documentId}
        discharge={record.discharge}
      />
    </section>
  );
}
```

- [ ] **Step 2: Pass `documentId` from the page**

In `apps/web/app/documents/[id]/page.tsx` (A's final version already has `searchParams` handling), add `documentId={doc.id}` to the existing `<ClinicalRecordView>` usage:

```tsx
{clinical !== null ? (
  <ClinicalRecordView
    documentId={doc.id}
    record={clinical.record}
    incomplete={clinical.extractionIncomplete || failedPages.length > 0}
    failedPages={failedPages}
    failedChunks={clinical.failedChunkCount}
  />
) : null}
```

Do not change anything else in the page; `FindingsSection` and `PdfViewer` stay as Slice A left them.

- [ ] **Step 3: Verify**

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS.

Run: `bunx turbo run lint --filter=@audit/web --filter=@audit/lib`
Expected: PASS.

Run: `bun test apps/web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/clinical-record-view.tsx apps/web/app/documents/\[id\]/page.tsx
git commit -m "feat(web): render the full clinical record with per-field evidence"
```

---

### Task 7: Reuse the shared evidence link in the findings card (web) — requires Slice A and Task 3

**Files:**
- Modify: `apps/web/components/finding-card.tsx` (created by Slice A)

**Interfaces:**
- Consumes: `EvidenceLink` (Task 3).
- Produces: no interface change; `finding-card.tsx` no longer inlines a `next/link`.

- [ ] **Step 1: Replace the inline link**

In `apps/web/components/finding-card.tsx`, remove the `import Link from "next/link";` and the `import type { Route } from "next";` lines and the `documentHref` constant. Replace the evidence list item's `<Link …>{copy.viewPage(item.source.pageNumber)}</Link>` with:

```tsx
<EvidenceLink
  documentId={documentId}
  page={item.source.pageNumber}
  hash={`finding-${finding.id}`}
/>
```

and add the import:

```tsx
import { EvidenceLink } from "./evidence-link.tsx";
```

- [ ] **Step 2: Verify**

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS.

Run: `bunx turbo run lint --filter=@audit/web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/finding-card.tsx
git commit -m "refactor(web): reuse the shared evidence link in findings"
```

---

### Task 8: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `bun run lint`
Expected: PASS.

Run: `bun run typecheck`
Expected: PASS.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 2: Manual smoke (requires a running stack)**

Start `docker compose up`, open a document with completed extraction, and confirm:

- Patient shows name, age, sex, and birth date with "Ver página N" links.
- Hospitalization shows admission/discharge dates, reason, diagnoses, discharge
  diagnosis; a conflicted record shows the amber warning with evidence.
- History shows pathological, allergies, and usual medications.
- Medications, Laboratory, Studies, and Microbiology are collapsed by default with counts; expanding shows every item with merged evidence links.
- Discharge shows all documented fields.
- Every "Ver página N" moves the PDF viewer to page N (Slice A behavior).
- `<details>` sections expand/collapse without errors.

- [ ] **Step 3: Report**

Summarize pass/fail for each command and the smoke result.

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Purpose (render all fields, evidence, conflicts, birthDate) | Tasks 1–7 |
| §3 Layout (sections on existing page, no nav) | Tasks 5–6 |
| §3 Evidence (`?page=N`) | Task 3, Task 6 (A's PDF sync) |
| §3 Detail density (collapsible, all items, counts) | Tasks 4–5 |
| §3 Conflicts (dedicated warnings) | Task 5 (`DateConflicts`) |
| §4 Data dropped (all field groups) | Task 5 |
| §5.1 Pure helpers | Task 1 |
| §5.2 Evidence primitive + finding-card reuse | Tasks 3, 7 |
| §5.3 Primitives | Task 4 |
| §5.4 Sections | Task 5 |
| §5.5 Orchestrator + prop change | Task 6 |
| §6 Page wiring (`documentId`) | Task 6 |
| §7 Date conflicts | Task 5 |
| §8 Copy | Task 2 |
| §9 Error handling (empty states, omit blanks) | Tasks 4–5 |
| §10 Testing | Tasks 1–2, 8 |
| §11 Files touched | All tasks |

**Placeholder scan:** No TBD/TODO/"handle edge cases" steps; every code step shows full code.

**Type consistency:** `RecordFieldSpec`, `EvidenceLink`, `EvidenceLinks`, `displayValue`, `sourcePages`, `mergeSourcePages`, `countsBySection`, and the eight section prop shapes are identical across tasks. `MedicationStatusLabel` is explicitly excluded from Task 4 so `medicationStatusLabels` (Task 2) is the single status label source used in Task 5.
