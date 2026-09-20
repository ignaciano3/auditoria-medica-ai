# Timeline and Summaries (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a chronological clinical timeline and deterministic clinical and audit summaries, each grounded to source pages, on the document page.

**Architecture:** Pure, dependency-free builders in `@audit/domain` (`normalizeDate`, `buildTimeline`, `buildClinicalSummary`, `buildAuditSummary`) derive everything on read from the persisted `ClinicalRecord` + `Finding[]`. The web app renders them with existing primitives (`Section`, `RecordFields`, `EvidenceLinks`). No DB, pipeline, worker, or API changes.

**Tech Stack:** Bun workspaces + Turborepo, TypeScript 7 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`), Biome, Next.js 16 App Router (React 19 server components), `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-20-timeline-and-summaries-design.md`

## Global Constraints

- All user-facing strings are **Spanish**, centralized in `packages/lib/src/i18n/es.ts`. Code, identifiers, and docs are English.
- **No code comments** anywhere (project convention). No `any`.
- Optional properties are assigned only via conditional spread (e.g. `...(value !== undefined ? { value } : {})`) because `exactOptionalPropertyTypes` is on.
- Relative imports **must** include the `.ts` / `.tsx` extension. Type-only imports **must** use `import type`.
- **No new dependencies.** No DB migration, no pipeline/worker/API change.
- Never invent a date, value, or finding.
- Definition of done for every task: `bun run lint`, `bun run typecheck`, `bun run test` pass at the repo root.
- Run focused tests as `bun test <path>` from the repo root.

---

### Task 1: Date normalization

**Files:**
- Create: `packages/domain/src/dates.ts`
- Test: `packages/domain/src/dates.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `type NormalizedDate = { original: string; iso?: string; hasYear: boolean }`
  - `normalizeDate(input: string, context?: { referenceYear?: number }): NormalizedDate`
  - `compareNormalizedDates(a: NormalizedDate | undefined, b: NormalizedDate | undefined): number`
  - `hospitalizationDurationDays(admission?: string, discharge?: string): number | undefined`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/dates.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  compareNormalizedDates,
  hospitalizationDurationDays,
  normalizeDate,
} from "./dates.ts";

describe("normalizeDate", () => {
  test("parses dd/mm/yyyy", () => {
    expect(normalizeDate("13/02/2026")).toEqual({
      original: "13/02/2026",
      iso: "2026-02-13",
      hasYear: true,
    });
  });

  test("parses dd/mm/yy as 20yy", () => {
    expect(normalizeDate("5/3/26")).toEqual({
      original: "5/3/26",
      iso: "2026-03-05",
      hasYear: true,
    });
  });

  test("parses bare dd/mm without a year and without context", () => {
    expect(normalizeDate("14/02")).toEqual({
      original: "14/02",
      hasYear: false,
    });
  });

  test("parses bare dd/mm using referenceYear for ordering only", () => {
    expect(normalizeDate("14/02", { referenceYear: 2026 })).toEqual({
      original: "14/02",
      iso: "2026-02-14",
      hasYear: false,
    });
  });

  test("parses yyyy-mm-dd", () => {
    expect(normalizeDate("2026-02-13")).toEqual({
      original: "2026-02-13",
      iso: "2026-02-13",
      hasYear: true,
    });
  });

  test("rejects impossible dates without inventing one", () => {
    expect(normalizeDate("31/02/2026")).toEqual({
      original: "31/02/2026",
      hasYear: true,
    });
  });

  test("returns no iso for unrecognized input", () => {
    expect(normalizeDate("febrero")).toEqual({
      original: "febrero",
      hasYear: false,
    });
  });
});

describe("compareNormalizedDates", () => {
  test("orders by iso ascending", () => {
    expect(
      compareNormalizedDates(
        normalizeDate("13/02/2026"),
        normalizeDate("15/02/2026"),
      ),
    ).toBeLessThan(0);
  });

  test("puts entries without a date last", () => {
    expect(compareNormalizedDates(undefined, normalizeDate("13/02/2026"))).toBeGreaterThan(0);
    expect(compareNormalizedDates(normalizeDate("13/02/2026"), undefined)).toBeLessThan(0);
  });
});

describe("hospitalizationDurationDays", () => {
  test("computes the whole-day difference", () => {
    expect(hospitalizationDurationDays("13/02/2026", "28/02/2026")).toBe(15);
  });

  test("returns undefined when a date is missing", () => {
    expect(hospitalizationDurationDays(undefined, "28/02/2026")).toBeUndefined();
    expect(hospitalizationDurationDays("13/02/2026", undefined)).toBeUndefined();
  });

  test("returns undefined when discharge precedes admission", () => {
    expect(hospitalizationDurationDays("28/02/2026", "13/02/2026")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/domain/src/dates.test.ts`
Expected: FAIL — `Cannot find module "./dates.ts"`.

- [ ] **Step 3: Write the implementation**

Create `packages/domain/src/dates.ts`:

```typescript
export type NormalizedDate = {
  original: string;
  iso?: string;
  hasYear: boolean;
};

const ISO_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_FULL_PATTERN = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
const DMY_SHORT_PATTERN = /^(\d{1,2})[/-](\d{1,2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function expandYear(raw: number): number {
  return raw < 100 ? 2000 + raw : raw;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toIso(
  year: number,
  month: number,
  day: number,
): string | undefined {
  if (!isValidYmd(year, month, day)) return undefined;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function normalizeDate(
  input: string,
  context?: { referenceYear?: number },
): NormalizedDate {
  const original = input.trim();

  const isoMatch = ISO_PATTERN.exec(original);
  if (isoMatch !== null) {
    const iso = toIso(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
    return iso === undefined
      ? { original, hasYear: true }
      : { original, iso, hasYear: true };
  }

  const fullMatch = DMY_FULL_PATTERN.exec(original);
  if (fullMatch !== null) {
    const iso = toIso(
      expandYear(Number(fullMatch[3])),
      Number(fullMatch[2]),
      Number(fullMatch[1]),
    );
    return iso === undefined
      ? { original, hasYear: true }
      : { original, iso, hasYear: true };
  }

  const shortMatch = DMY_SHORT_PATTERN.exec(original);
  if (shortMatch !== null) {
    const day = Number(shortMatch[1]);
    const month = Number(shortMatch[2]);
    const referenceYear = context?.referenceYear;
    if (referenceYear === undefined) {
      if (!isValidYmd(2000, month, day)) {
        return { original, hasYear: false };
      }
      return { original, hasYear: false };
    }
    if (!isValidYmd(referenceYear, month, day)) {
      return { original, hasYear: false };
    }
    return {
      original,
      iso: `${referenceYear}-${pad(month)}-${pad(day)}`,
      hasYear: false,
    };
  }

  return { original, hasYear: false };
}

export function compareNormalizedDates(
  a: NormalizedDate | undefined,
  b: NormalizedDate | undefined,
): number {
  const aIso = a?.iso;
  const bIso = b?.iso;
  if (aIso !== undefined && bIso !== undefined) {
    if (aIso === bIso) return 0;
    return aIso < bIso ? -1 : 1;
  }
  if (aIso !== undefined) return -1;
  if (bIso !== undefined) return 1;
  return 0;
}

export function hospitalizationDurationDays(
  admission?: string,
  discharge?: string,
): number | undefined {
  if (admission === undefined || discharge === undefined) return undefined;
  const start = normalizeDate(admission).iso;
  const end = normalizeDate(discharge).iso;
  if (start === undefined || end === undefined) return undefined;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const days = Math.round((endMs - startMs) / 86_400_000);
  return days < 0 ? undefined : days;
}
```

- [ ] **Step 4: Export from the domain index**

In `packages/domain/src/index.ts`, add at the top (keep the file ordered alphabetically by module path):

```typescript
export {
  compareNormalizedDates,
  hospitalizationDurationDays,
  type NormalizedDate,
  normalizeDate,
} from "./dates.ts";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/domain/src/dates.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/dates.ts packages/domain/src/dates.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add clinical date normalization and duration"
```

---

### Task 2: Timeline builder

**Files:**
- Create: `packages/domain/src/timeline.ts`
- Test: `packages/domain/src/timeline.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `normalizeDate`, `compareNormalizedDates`, `NormalizedDate` from Task 1; `ClinicalRecord`, `ClinicalEventType`, `ExtractedValue` from `./clinical-record.ts`; `Source` from `./source.ts`.
- Produces:
  - `type TimelineDetail` (union, see code)
  - `type TimelineEntry = { id: string; type: ClinicalEventType; date?: string; normalized?: NormalizedDate; sources: Source[]; detail: TimelineDetail }`
  - `type TimelineGroup = { key: string; date?: string; undated: boolean; entries: TimelineEntry[] }`
  - `buildTimeline(record: ClinicalRecord): TimelineGroup[]`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/timeline.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, ExtractedValue, Source } from "./index.ts";
import { buildTimeline } from "./timeline.ts";

function source(pageNumber: number): Source {
  return { documentId: "d1", pageNumber, text: "t" };
}

function value(text: string, page: number): ExtractedValue<string> {
  return { value: text, sources: [source(page)] };
}

function baseRecord(): ClinicalRecord {
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

describe("buildTimeline", () => {
  test("synthesizes structured events in chronological order", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.hospitalization.dischargeDate = value("28/02/2026", 2);
    record.medications = [
      {
        name: value("Levofloxacina", 5),
        startDate: value("15/02/2026", 5),
        sources: [source(5)],
      },
    ];

    expect(buildTimeline(record).map((group) => group.key)).toEqual([
      "2026-02-13",
      "2026-02-15",
      "2026-02-28",
    ]);
  });

  test("keeps narrative documented events", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "14/02/2026",
        type: "diagnosis",
        description: "Neumonía adquirida en la comunidad",
        sources: [source(3)],
      },
    ];

    const entries = buildTimeline(record).flatMap((group) => group.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("diagnosis");
    expect(entries[0]?.detail).toEqual({
      kind: "documented",
      description: "Neumonía adquirida en la comunidad",
    });
  });

  test("drops a covered documented event that duplicates a structured one on the same page", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.clinicalEvents = [
      {
        date: "13/02/2026",
        type: "admission",
        description: "Ingreso por neumonía",
        sources: [source(1)],
      },
    ];

    const admissions = buildTimeline(record)
      .flatMap((group) => group.entries)
      .filter((entry) => entry.type === "admission");
    expect(admissions).toHaveLength(1);
    expect(admissions[0]?.detail).toEqual({ kind: "admission" });
  });

  test("keeps a covered documented event when no structured event shares its page", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "13/02/2026",
        type: "laboratory",
        description: "Hemograma de ingreso",
        sources: [source(7)],
      },
    ];

    const entries = buildTimeline(record).flatMap((group) => group.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("laboratory");
  });

  test("groups entries without a usable date last", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.clinicalEvents = [
      {
        type: "other",
        description: "Evento sin fecha",
        sources: [source(4)],
      },
    ];

    const groups = buildTimeline(record);
    const last = groups[groups.length - 1];
    expect(last?.undated).toBe(true);
    expect(last?.key).toBe("undated");
  });

  test("dedupes identical entries by type, description and date", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "14/02/2026",
        type: "diagnosis",
        description: "Neumonía",
        sources: [source(3)],
      },
      {
        date: "14/02/2026",
        type: "diagnosis",
        description: "NEUMONIA",
        sources: [source(3)],
      },
    ];

    const entries = buildTimeline(record).flatMap((group) => group.entries);
    expect(entries).toHaveLength(1);
  });

  test("produces stable ids and preserves sources", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);

    const first = buildTimeline(record).flatMap((group) => group.entries);
    const second = buildTimeline(record).flatMap((group) => group.entries);
    expect(first.map((entry) => entry.id)).toEqual(
      second.map((entry) => entry.id),
    );
    expect(first[0]?.id.startsWith("evt-")).toBe(true);
    expect(first[0]?.sources).toEqual([source(1)]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/domain/src/timeline.test.ts`
Expected: FAIL — `Cannot find module "./timeline.ts"`.

- [ ] **Step 3: Write the implementation**

Create `packages/domain/src/timeline.ts`:

```typescript
import type { ClinicalEventType, ClinicalRecord } from "./clinical-record.ts";
import {
  compareNormalizedDates,
  type NormalizedDate,
  normalizeDate,
} from "./dates.ts";
import type { ExtractedValue, Source } from "./source.ts";

export type TimelineDetail =
  | { kind: "admission" }
  | { kind: "discharge" }
  | { kind: "medication"; name: string; change: "start" | "stop" }
  | { kind: "laboratory"; name: string; value: string; unit?: string }
  | { kind: "study"; studyType: string; result?: string }
  | {
      kind: "microbiology";
      sample?: string;
      organism?: string;
      result?: string;
    }
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

type DraftEntry = {
  type: ClinicalEventType;
  date?: string;
  sources: Source[];
  detail: TimelineDetail;
};

const NARRATIVE_TYPES: ReadonlySet<ClinicalEventType> = new Set([
  "diagnosis",
  "clinical_evolution",
  "procedure",
  "medication_change",
  "other",
]);

const COVERED_TYPE: Partial<Record<ClinicalEventType, ClinicalEventType>> = {
  admission: "admission",
  discharge: "discharge",
  medication_start: "medication_start",
  medication_stop: "medication_stop",
  laboratory: "laboratory",
  imaging: "imaging",
  microbiology: "microbiology",
};

function extractedDraft(
  type: ClinicalEventType,
  extracted: ExtractedValue<string>,
  detail: TimelineDetail,
): DraftEntry {
  return {
    type,
    date: extracted.value,
    sources: extracted.sources,
    detail,
  };
}

function structuredDrafts(record: ClinicalRecord): DraftEntry[] {
  const drafts: DraftEntry[] = [];
  const { hospitalization, medications, laboratory, studies, microbiology } =
    record;

  if (hospitalization.admissionDate !== undefined) {
    drafts.push(
      extractedDraft("admission", hospitalization.admissionDate, {
        kind: "admission",
      }),
    );
  }
  if (hospitalization.dischargeDate !== undefined) {
    drafts.push(
      extractedDraft("discharge", hospitalization.dischargeDate, {
        kind: "discharge",
      }),
    );
  }
  for (const medication of medications) {
    if (medication.startDate !== undefined) {
      drafts.push(
        extractedDraft("medication_start", medication.startDate, {
          kind: "medication",
          name: medication.name.value,
          change: "start",
        }),
      );
    }
    if (medication.endDate !== undefined) {
      drafts.push(
        extractedDraft("medication_stop", medication.endDate, {
          kind: "medication",
          name: medication.name.value,
          change: "stop",
        }),
      );
    }
  }
  for (const result of laboratory) {
    drafts.push({
      type: "laboratory",
      ...(result.date !== undefined ? { date: result.date.value } : {}),
      sources: result.date?.sources ?? result.sources,
      detail: {
        kind: "laboratory",
        name: result.name.value,
        value: result.value.value,
        ...(result.unit !== undefined ? { unit: result.unit.value } : {}),
      },
    });
  }
  for (const study of studies) {
    drafts.push({
      type: "imaging",
      ...(study.date !== undefined ? { date: study.date.value } : {}),
      sources: study.date?.sources ?? study.sources,
      detail: {
        kind: "study",
        studyType: study.type.value,
        ...(study.result !== undefined ? { result: study.result.value } : {}),
      },
    });
  }
  for (const result of microbiology) {
    drafts.push({
      type: "microbiology",
      ...(result.date !== undefined ? { date: result.date.value } : {}),
      sources: result.date?.sources ?? result.sources,
      detail: {
        kind: "microbiology",
        ...(result.sample !== undefined ? { sample: result.sample.value } : {}),
        ...(result.organism !== undefined
          ? { organism: result.organism.value }
          : {}),
        ...(result.result !== undefined ? { result: result.result.value } : {}),
      },
    });
  }

  return drafts;
}

function documentedDrafts(
  record: ClinicalRecord,
  structured: DraftEntry[],
): DraftEntry[] {
  const structuredPages = new Set(
    structured.map(
      (draft) => `${draft.type}|${draft.sources[0]?.pageNumber ?? ""}`,
    ),
  );
  const drafts: DraftEntry[] = [];

  for (const event of record.clinicalEvents) {
    const covered = COVERED_TYPE[event.type];
    if (covered !== undefined && !NARRATIVE_TYPES.has(event.type)) {
      const page = event.sources[0]?.pageNumber ?? "";
      if (structuredPages.has(`${covered}|${page}`)) continue;
    }
    drafts.push({
      type: event.type,
      ...(event.date !== undefined ? { date: event.date } : {}),
      sources: event.sources,
      detail: { kind: "documented", description: event.description },
    });
  }

  return drafts;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detailText(detail: TimelineDetail): string {
  switch (detail.kind) {
    case "admission":
      return "admission";
    case "discharge":
      return "discharge";
    case "medication":
      return `${detail.change} ${detail.name}`;
    case "laboratory":
      return [detail.name, detail.value, detail.unit ?? ""].join(" ");
    case "study":
      return [detail.studyType, detail.result ?? ""].join(" ");
    case "microbiology":
      return [detail.sample ?? "", detail.organism ?? "", detail.result ?? ""]
        .join(" ")
        .trim();
    case "documented":
      return detail.description;
  }
}

function draftSignature(draft: DraftEntry): string {
  return `${draft.type}|${normalizeText(detailText(draft.detail))}|${draft.date ?? ""}`;
}

function djb2Hex(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function referenceYearOf(record: ClinicalRecord): number | undefined {
  const admission = record.hospitalization.admissionDate?.value;
  if (admission === undefined) return undefined;
  const iso = normalizeDate(admission).iso;
  return iso === undefined ? undefined : Number(iso.slice(0, 4));
}

function toEntry(
  draft: DraftEntry,
  id: string,
  context: { referenceYear?: number },
): TimelineEntry {
  const normalized =
    draft.date === undefined ? undefined : normalizeDate(draft.date, context);
  return {
    id,
    type: draft.type,
    ...(draft.date !== undefined ? { date: draft.date } : {}),
    ...(normalized !== undefined ? { normalized } : {}),
    sources: draft.sources,
    detail: draft.detail,
  };
}

export function buildTimeline(record: ClinicalRecord): TimelineGroup[] {
  const structured = structuredDrafts(record);
  const drafts = [...structured, ...documentedDrafts(record, structured)];

  const seen = new Set<string>();
  const unique: DraftEntry[] = [];
  for (const draft of drafts) {
    const signature = draftSignature(draft);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(draft);
  }

  const referenceYear = referenceYearOf(record);
  const context = referenceYear === undefined ? {} : { referenceYear };

  const occurrences = new Map<string, number>();
  const ordered = unique
    .map((draft, index) => ({
      draft,
      index,
      signature: draftSignature(draft),
    }))
    .sort((a, b) => {
      if (a.signature < b.signature) return -1;
      if (a.signature > b.signature) return 1;
      return a.index - b.index;
    });

  const withIds = ordered.map((item) => {
    const base = `evt-${djb2Hex(item.signature)}`;
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return { index: item.index, entry: toEntry(item.draft, id, context) };
  });

  const entries = withIds
    .sort((a, b) => a.index - b.index)
    .map((item) => item.entry);

  const dated = entries.filter((entry) => entry.normalized?.iso !== undefined);
  const undated = entries.filter(
    (entry) => entry.normalized?.iso === undefined,
  );
  dated.sort((a, b) => compareNormalizedDates(a.normalized, b.normalized));

  const groups: TimelineGroup[] = [];
  for (const entry of dated) {
    const iso = entry.normalized?.iso;
    if (iso === undefined) continue;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === iso) {
      last.entries.push(entry);
    } else {
      groups.push({ key: iso, date: iso, undated: false, entries: [entry] });
    }
  }
  if (undated.length > 0) {
    groups.push({ key: "undated", undated: true, entries: undated });
  }

  return groups;
}
```

- [ ] **Step 4: Export from the domain index**

In `packages/domain/src/index.ts`, add:

```typescript
export {
  buildTimeline,
  type TimelineDetail,
  type TimelineEntry,
  type TimelineGroup,
} from "./timeline.ts";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/domain/src/timeline.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/timeline.ts packages/domain/src/timeline.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): build chronological timeline from record and events"
```

---

### Task 3: Summary builders

**Files:**
- Create: `packages/domain/src/summary.ts`
- Test: `packages/domain/src/summary.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `hospitalizationDurationDays` (Task 1); `buildTimeline`, `TimelineEntry` (Task 2); `Finding` from `./finding.ts`; record types from `./clinical-record.ts`.
- Produces:
  - `type ClinicalSummary` (see code)
  - `buildClinicalSummary(record: ClinicalRecord): ClinicalSummary`
  - `type AuditSummary` (see code)
  - `buildAuditSummary(record: ClinicalRecord, findings: Finding[]): AuditSummary`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/summary.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, ExtractedValue, Finding, Source } from "./index.ts";
import { buildAuditSummary, buildClinicalSummary } from "./summary.ts";

function source(pageNumber: number): Source {
  return { documentId: "d1", pageNumber, text: "t" };
}

function value(text: string, page: number): ExtractedValue<string> {
  return { value: text, sources: [source(page)] };
}

function baseRecord(): ClinicalRecord {
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

function finding(category: Finding["category"]): Finding {
  return {
    id: `fnd-${category}`,
    severity: "medium",
    category,
    title: "Título",
    explanation: "Explicación",
    evidence: [{ source: source(1), relevance: "r" }],
    requiresHumanReview: true,
  };
}

describe("buildClinicalSummary", () => {
  test("computes duration from admission and discharge", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.hospitalization.dischargeDate = value("28/02/2026", 2);

    expect(buildClinicalSummary(record).durationDays).toBe(15);
  });

  test("keeps missing fields missing", () => {
    const summary = buildClinicalSummary(baseRecord());
    expect(summary.reason).toBeUndefined();
    expect(summary.durationDays).toBeUndefined();
    expect(summary.discharge).toBeUndefined();
    expect(summary.evolution).toEqual([]);
  });

  test("includes evolution and diagnosis events in the evolution list", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "14/02/2026",
        type: "clinical_evolution",
        description: "Afebril, buena evolución",
        sources: [source(3)],
      },
    ];

    const evolution = buildClinicalSummary(record).evolution;
    expect(evolution).toHaveLength(1);
    expect(evolution[0]?.type).toBe("clinical_evolution");
  });
});

describe("buildAuditSummary", () => {
  test("groups findings by category and counts review items", () => {
    const audit = buildAuditSummary(baseRecord(), [
      finding("documentation"),
      finding("temporal"),
      finding("medication"),
    ]);

    expect(audit.documentationGaps).toHaveLength(1);
    expect(audit.inconsistencies).toHaveLength(2);
    expect(audit.requiresReview).toBe(3);
  });

  test("collects treatment changes from the timeline", () => {
    const record = baseRecord();
    record.medications = [
      {
        name: value("Levofloxacina", 5),
        startDate: value("15/02/2026", 5),
        sources: [source(5)],
      },
    ];

    const audit = buildAuditSummary(record, []);
    expect(audit.treatmentChanges).toHaveLength(1);
    expect(audit.treatmentChanges[0]?.type).toBe("medication_start");
    expect(audit.majorTreatments).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/domain/src/summary.test.ts`
Expected: FAIL — `Cannot find module "./summary.ts"`.

- [ ] **Step 3: Write the implementation**

Create `packages/domain/src/summary.ts`:

```typescript
import type {
  ClinicalEventType,
  ClinicalRecord,
  DischargeInformation,
  ExtractedValue,
  Medication,
  MicrobiologyResult,
  Patient,
  Study,
} from "./clinical-record.ts";
import { hospitalizationDurationDays } from "./dates.ts";
import type { Finding } from "./finding.ts";
import { buildTimeline, type TimelineEntry } from "./timeline.ts";

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

export function buildClinicalSummary(record: ClinicalRecord): ClinicalSummary {
  const {
    patient,
    hospitalization,
    history,
    medications,
    studies,
    microbiology,
    discharge,
  } = record;

  const durationDays = hospitalizationDurationDays(
    hospitalization.admissionDate?.value,
    hospitalization.dischargeDate?.value,
  );
  const evolution = buildTimeline(record)
    .flatMap((group) => group.entries)
    .filter(
      (entry) =>
        entry.type === "clinical_evolution" || entry.type === "diagnosis",
    );

  return {
    patient,
    ...(hospitalization.admissionDate !== undefined
      ? { admissionDate: hospitalization.admissionDate }
      : {}),
    ...(hospitalization.dischargeDate !== undefined
      ? { dischargeDate: hospitalization.dischargeDate }
      : {}),
    ...(durationDays !== undefined ? { durationDays } : {}),
    ...(hospitalization.reason !== undefined
      ? { reason: hospitalization.reason }
      : {}),
    diagnoses: hospitalization.diagnoses,
    pathological: history.pathological,
    allergies: history.allergies,
    evolution,
    studies,
    microbiology,
    treatment: medications,
    ...(discharge !== undefined ? { discharge } : {}),
  };
}

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

const MAJOR_EVENT_TYPES: ReadonlySet<ClinicalEventType> = new Set([
  "admission",
  "discharge",
  "diagnosis",
  "clinical_evolution",
  "procedure",
  "laboratory",
  "imaging",
  "microbiology",
  "other",
]);

const TREATMENT_CHANGE_TYPES: ReadonlySet<ClinicalEventType> = new Set([
  "medication_start",
  "medication_stop",
  "medication_change",
]);

export function buildAuditSummary(
  record: ClinicalRecord,
  findings: Finding[],
): AuditSummary {
  const { hospitalization, medications, studies, microbiology } = record;
  const durationDays = hospitalizationDurationDays(
    hospitalization.admissionDate?.value,
    hospitalization.dischargeDate?.value,
  );
  const entries = buildTimeline(record).flatMap((group) => group.entries);

  return {
    ...(durationDays !== undefined ? { durationDays } : {}),
    ...(hospitalization.reason !== undefined
      ? { reason: hospitalization.reason }
      : {}),
    majorEvents: entries.filter((entry) => MAJOR_EVENT_TYPES.has(entry.type)),
    majorTreatments: medications,
    treatmentChanges: entries.filter((entry) =>
      TREATMENT_CHANGE_TYPES.has(entry.type),
    ),
    relevantStudies: studies,
    microbiology,
    documentationGaps: findings.filter(
      (finding) => finding.category === "documentation",
    ),
    inconsistencies: findings.filter(
      (finding) => finding.category !== "documentation",
    ),
    requiresReview: findings.length,
  };
}
```

- [ ] **Step 4: Export from the domain index**

In `packages/domain/src/index.ts`, add:

```typescript
export {
  type AuditSummary,
  buildAuditSummary,
  buildClinicalSummary,
  type ClinicalSummary,
} from "./summary.ts";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/domain/src/summary.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/summary.ts packages/domain/src/summary.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): build deterministic clinical and audit summaries"
```

---

### Task 4: i18n copy and timeline display helpers

**Files:**
- Modify: `packages/lib/src/i18n/es.ts`
- Create: `apps/web/lib/timeline-view.ts`
- Test: `apps/web/lib/timeline-view.test.ts`

**Interfaces:**
- Consumes: `TimelineEntry`, `TimelineGroup` from `@audit/domain`.
- Produces: `timeline` and `summary` i18n objects; `formatDateLabel(iso: string): string`, `groupLabel(group: TimelineGroup): string`, `describeEntry(entry: TimelineEntry): string`.

- [ ] **Step 1: Add the Spanish copy**

In `packages/lib/src/i18n/es.ts`, after `medicationStatusLabels`, add:

```typescript
export const timeline = {
  admission: "Ingreso",
  discharge: "Egreso",
  startPrefix: "Inicio de",
  stopPrefix: "Fin de",
  undated: "Sin fecha",
  empty: "Sin eventos documentados.",
  microbiologyFallback: "Resultado de microbiología",
} as const;

export const summary = {
  duration: "Duración",
  durationDays: (days: number) => `${days} días`,
  evolution: "Evolución",
  auditTitle: "Resumen de auditoría",
  documentedFacts: "Hechos documentados",
  inconsistencies: "Inconsistencias detectadas",
  documentationGaps: "Documentación faltante",
  aiInterpretation: "Interpretación de IA",
  requiresHumanReview: "Requiere revisión humana",
  reviewCount: (count: number) => `${count} elementos requieren revisión`,
  majorEvents: "Eventos principales",
  majorTreatments: "Tratamientos principales",
  treatmentChanges: "Cambios de tratamiento",
  relevantStudies: "Estudios relevantes",
} as const;
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/lib/timeline-view.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import type { TimelineEntry, TimelineGroup } from "@audit/domain";
import { describeEntry, formatDateLabel, groupLabel } from "./timeline-view.ts";

function entry(detail: TimelineEntry["detail"]): TimelineEntry {
  return {
    id: "evt-1",
    type: "other",
    sources: [{ documentId: "d1", pageNumber: 1, text: "t" }],
    detail,
  };
}

describe("formatDateLabel", () => {
  test("formats an iso date as dd/mm", () => {
    expect(formatDateLabel("2026-02-13")).toBe("13/02");
  });

  test("returns the input when it cannot be split", () => {
    expect(formatDateLabel("2026")).toBe("2026");
  });
});

describe("groupLabel", () => {
  test("uses Sin fecha for the undated group", () => {
    const group: TimelineGroup = { key: "undated", undated: true, entries: [] };
    expect(groupLabel(group)).toBe("Sin fecha");
  });

  test("formats a dated group", () => {
    const group: TimelineGroup = {
      key: "2026-02-13",
      date: "2026-02-13",
      undated: false,
      entries: [],
    };
    expect(groupLabel(group)).toBe("13/02");
  });
});

describe("describeEntry", () => {
  test("describes admission and discharge", () => {
    expect(describeEntry(entry({ kind: "admission" }))).toBe("Ingreso");
    expect(describeEntry(entry({ kind: "discharge" }))).toBe("Egreso");
  });

  test("describes medication start and stop", () => {
    expect(
      describeEntry(entry({ kind: "medication", name: "Levofloxacina", change: "start" })),
    ).toBe("Inicio de Levofloxacina");
    expect(
      describeEntry(entry({ kind: "medication", name: "Levofloxacina", change: "stop" })),
    ).toBe("Fin de Levofloxacina");
  });

  test("describes a laboratory result with and without a unit", () => {
    expect(
      describeEntry(entry({ kind: "laboratory", name: "Sodio", value: "134", unit: "mEq/L" })),
    ).toBe("Sodio: 134 mEq/L");
    expect(
      describeEntry(entry({ kind: "laboratory", name: "Sodio", value: "134" })),
    ).toBe("Sodio: 134");
  });

  test("describes a study with and without a result", () => {
    expect(
      describeEntry(entry({ kind: "study", studyType: "TAC de tórax", result: "Derrame" })),
    ).toBe("TAC de tórax: Derrame");
    expect(describeEntry(entry({ kind: "study", studyType: "TAC de tórax" }))).toBe(
      "TAC de tórax",
    );
  });

  test("joins microbiology parts and falls back when empty", () => {
    expect(
      describeEntry(
        entry({ kind: "microbiology", sample: "Sangre", organism: "E. coli" }),
      ),
    ).toBe("Sangre · E. coli");
    expect(describeEntry(entry({ kind: "microbiology" }))).toBe(
      "Resultado de microbiología",
    );
  });

  test("passes documented descriptions through", () => {
    expect(
      describeEntry(entry({ kind: "documented", description: "Afebril" })),
    ).toBe("Afebril");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test apps/web/lib/timeline-view.test.ts`
Expected: FAIL — `Cannot find module "./timeline-view.ts"`.

- [ ] **Step 4: Write the implementation**

Create `apps/web/lib/timeline-view.ts`:

```typescript
import type { TimelineEntry, TimelineGroup } from "@audit/domain";
import { timeline } from "@audit/lib/i18n";

export function formatDateLabel(iso: string): string {
  const parts = iso.split("-");
  const month = parts[1];
  const day = parts[2];
  if (month === undefined || day === undefined) return iso;
  return `${day}/${month}`;
}

export function groupLabel(group: TimelineGroup): string {
  if (group.undated || group.date === undefined) return timeline.undated;
  return formatDateLabel(group.date);
}

export function describeEntry(entry: TimelineEntry): string {
  const detail = entry.detail;
  switch (detail.kind) {
    case "admission":
      return timeline.admission;
    case "discharge":
      return timeline.discharge;
    case "medication": {
      const prefix =
        detail.change === "start" ? timeline.startPrefix : timeline.stopPrefix;
      return `${prefix} ${detail.name}`;
    }
    case "laboratory": {
      const unit =
        detail.unit !== undefined && detail.unit !== "" ? ` ${detail.unit}` : "";
      return `${detail.name}: ${detail.value}${unit}`;
    }
    case "study":
      return detail.result !== undefined && detail.result !== ""
        ? `${detail.studyType}: ${detail.result}`
        : detail.studyType;
    case "microbiology": {
      const parts = [detail.sample, detail.organism, detail.result].filter(
        (part): part is string => part !== undefined && part !== "",
      );
      return parts.length > 0
        ? parts.join(" · ")
        : timeline.microbiologyFallback;
    }
    case "documented":
      return detail.description;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test apps/web/lib/timeline-view.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/lib/src/i18n/es.ts apps/web/lib/timeline-view.ts apps/web/lib/timeline-view.test.ts
git commit -m "feat(web): add timeline copy and display helpers"
```

---

### Task 5: Timeline component

**Files:**
- Create: `apps/web/components/timeline.tsx`

**Interfaces:**
- Consumes: `TimelineGroup`; `describeEntry`, `groupLabel` (Task 4); `ui.timeline` from i18n; `sourcePages` from `../lib/clinical-record-view.ts`; `EvidenceLinks`, `Section`.
- Produces: `Timeline({ documentId, groups })`.

- [ ] **Step 1: Write the component**

Create `apps/web/components/timeline.tsx`:

```tsx
import type { TimelineGroup } from "@audit/domain";
import { timeline as timelineLabels, ui } from "@audit/lib/i18n";
import { sourcePages } from "../lib/clinical-record-view.ts";
import { describeEntry, groupLabel } from "../lib/timeline-view.ts";
import { EvidenceLinks } from "./evidence-link.tsx";
import { Section } from "./ui/section.tsx";

export function Timeline({
  documentId,
  groups,
}: {
  documentId: string;
  groups: TimelineGroup[];
}) {
  const count = groups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );

  return (
    <Section title={ui.timeline} count={count} defaultOpen>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{timelineLabels.empty}</p>
      ) : (
        <ol className="flex list-none flex-col gap-4">
          {groups.map((group) => (
            <li key={group.key} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-muted-foreground">
                {groupLabel(group)}
              </p>
              <ul className="flex list-none flex-col gap-2 border-l border-border pl-4">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                  >
                    <span>{describeEntry(entry)}</span>
                    <EvidenceLinks
                      documentId={documentId}
                      pages={sourcePages(entry.sources)}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run --cwd apps/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/timeline.tsx
git commit -m "feat(web): add timeline section component"
```

---

### Task 6: Clinical summary view

**Files:**
- Create: `apps/web/lib/summary-view.ts`
- Test: `apps/web/lib/summary-view.test.ts`
- Create: `apps/web/components/clinical-summary.tsx`

**Interfaces:**
- Consumes: `ClinicalSummary` (Task 3); record primitives (`CollapsibleSection`, `RecordFields`, `RecordItem`, `RecordEmpty`); `EvidenceLinks`; `sourcePages`, `mergeSourcePages`, `displayValue` from `../lib/clinical-record-view.ts`; `clinicalRecord`, `summary` from i18n.
- Produces: `durationText(days: number | undefined): string | undefined`, `hasClinicalSummaryContent(clinical: ClinicalSummary): boolean`; `ClinicalSummaryView({ documentId, summary })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/summary-view.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import type { ClinicalSummary } from "@audit/domain";
import { durationText, hasClinicalSummaryContent } from "./summary-view.ts";

function emptySummary(): ClinicalSummary {
  return {
    patient: {},
    diagnoses: [],
    pathological: [],
    allergies: [],
    evolution: [],
    studies: [],
    microbiology: [],
    treatment: [],
  };
}

describe("durationText", () => {
  test("formats a day count in Spanish", () => {
    expect(durationText(15)).toBe("15 días");
  });

  test("returns undefined when there is no duration", () => {
    expect(durationText(undefined)).toBeUndefined();
  });
});

describe("hasClinicalSummaryContent", () => {
  test("is false for an empty summary", () => {
    expect(hasClinicalSummaryContent(emptySummary())).toBe(false);
  });

  test("is true when any section has content", () => {
    const summary = emptySummary();
    summary.treatment = [
      {
        name: {
          value: "Levofloxacina",
          sources: [{ documentId: "d1", pageNumber: 1, text: "t" }],
        },
        sources: [{ documentId: "d1", pageNumber: 1, text: "t" }],
      },
    ];
    expect(hasClinicalSummaryContent(summary)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/web/lib/summary-view.test.ts`
Expected: FAIL — `Cannot find module "./summary-view.ts"`.

- [ ] **Step 3: Write the helper**

Create `apps/web/lib/summary-view.ts`:

```typescript
import type { ClinicalSummary } from "@audit/domain";
import { summary } from "@audit/lib/i18n";

export function durationText(days: number | undefined): string | undefined {
  return days === undefined ? undefined : summary.durationDays(days);
}

export function hasClinicalSummaryContent(
  clinical: ClinicalSummary,
): boolean {
  return (
    clinical.admissionDate !== undefined ||
    clinical.dischargeDate !== undefined ||
    clinical.reason !== undefined ||
    clinical.diagnoses.length > 0 ||
    clinical.pathological.length > 0 ||
    clinical.allergies.length > 0 ||
    clinical.evolution.length > 0 ||
    clinical.studies.length > 0 ||
    clinical.microbiology.length > 0 ||
    clinical.treatment.length > 0 ||
    clinical.discharge !== undefined
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/web/lib/summary-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the component**

Create `apps/web/components/clinical-summary.tsx`:

```tsx
import type { ClinicalSummary, MicrobiologyResult, Study } from "@audit/domain";
import { clinicalRecord, summary as summaryLabels } from "@audit/lib/i18n";
import {
  displayValue,
  mergeSourcePages,
  sourcePages,
} from "../lib/clinical-record-view.ts";
import { durationText } from "../lib/summary-view.ts";
import {
  CollapsibleSection,
  type RecordFieldSpec,
  RecordEmpty,
  RecordFields,
  RecordItem,
} from "./clinical-record-primitives.tsx";
import { EvidenceLinks } from "./evidence-link.tsx";

function studySources(study: Study): number[] {
  return mergeSourcePages(
    study.sources,
    study.type.sources,
    study.date?.sources ?? [],
    study.indication?.sources ?? [],
    study.result?.sources ?? [],
  );
}

function microbiologySources(result: MicrobiologyResult): number[] {
  return mergeSourcePages(
    result.sources,
    result.date?.sources ?? [],
    result.sample?.sources ?? [],
    result.organism?.sources ?? [],
    result.result?.sources ?? [],
    result.sensitivity?.sources ?? [],
  );
}

export function ClinicalSummaryView({
  documentId,
  summary,
}: {
  documentId: string;
  summary: ClinicalSummary;
}) {
  const patientFields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.name,
      value: summary.patient.name?.value,
      sources: summary.patient.name?.sources ?? [],
    },
    {
      label: clinicalRecord.age,
      value: summary.patient.age?.value,
      sources: summary.patient.age?.sources ?? [],
    },
    {
      label: clinicalRecord.sex,
      value: summary.patient.sex?.value,
      sources: summary.patient.sex?.sources ?? [],
    },
    {
      label: clinicalRecord.birthDate,
      value: summary.patient.birthDate?.value,
      sources: summary.patient.birthDate?.sources ?? [],
    },
  ];

  const hospitalizationFields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.admissionDate,
      value: summary.admissionDate?.value,
      sources: summary.admissionDate?.sources ?? [],
    },
    {
      label: clinicalRecord.dischargeDate,
      value: summary.dischargeDate?.value,
      sources: summary.dischargeDate?.sources ?? [],
    },
    {
      label: summaryLabels.duration,
      value: durationText(summary.durationDays),
      sources: [],
    },
    {
      label: clinicalRecord.reason,
      value: summary.reason?.value,
      sources: summary.reason?.sources ?? [],
    },
  ];

  const historyGroups: Array<{
    label: string;
    entries: ClinicalSummary["pathological"];
  }> = [
    { label: clinicalRecord.pathological, entries: summary.pathological },
    { label: clinicalRecord.allergies, entries: summary.allergies },
  ];

  return (
    <section className="flex flex-col gap-6">
      <CollapsibleSection title={clinicalRecord.patient} defaultOpen>
        <RecordFields documentId={documentId} fields={patientFields} />
      </CollapsibleSection>

      <CollapsibleSection title={clinicalRecord.hospitalization} defaultOpen>
        <RecordFields documentId={documentId} fields={hospitalizationFields} />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {clinicalRecord.diagnoses}
          </h3>
          {summary.diagnoses.length === 0 ? (
            <RecordEmpty />
          ) : (
            <ul className="flex list-none flex-col gap-1">
              {summary.diagnoses.map((diagnosis) => (
                <li
                  key={diagnosis.value}
                  className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                >
                  <span>{displayValue(diagnosis.value)}</span>
                  <EvidenceLinks
                    documentId={documentId}
                    pages={sourcePages(diagnosis.sources)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={clinicalRecord.history}>
        {historyGroups.every((group) => group.entries.length === 0) ? (
          <RecordEmpty />
        ) : (
          <div className="flex flex-col gap-3">
            {historyGroups.map((group) =>
              group.entries.length > 0 ? (
                <div key={group.label} className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {group.label}
                  </h3>
                  <ul className="flex list-none flex-col gap-1">
                    {group.entries.map((entry) => (
                      <li
                        key={`${group.label}-${entry.value}`}
                        className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                      >
                        <span>{displayValue(entry.value)}</span>
                        <EvidenceLinks
                          documentId={documentId}
                          pages={sourcePages(entry.sources)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.evolution}
        count={summary.evolution.length}
      >
        {summary.evolution.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.evolution.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>
                  {entry.detail.kind === "documented"
                    ? entry.detail.description
                    : (entry.date ?? "")}
                </span>
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(entry.sources)}
                />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={clinicalRecord.studies}
        count={summary.studies.length}
      >
        {summary.studies.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.studies.map((study) => (
              <RecordItem
                key={study.type.value}
                documentId={documentId}
                title={displayValue(study.type.value)}
                fields={[
                  {
                    label: clinicalRecord.date,
                    value: study.date?.value,
                    sources: study.date?.sources ?? [],
                  },
                  {
                    label: clinicalRecord.result,
                    value: study.result?.value,
                    sources: study.result?.sources ?? [],
                  },
                ]}
                pages={studySources(study)}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={clinicalRecord.microbiology}
        count={summary.microbiology.length}
      >
        {summary.microbiology.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.microbiology.map((result) => (
              <RecordItem
                key={result.organism?.value ?? result.sample?.value ?? "micro"}
                documentId={documentId}
                title={displayValue(
                  result.organism?.value ?? result.sample?.value,
                )}
                fields={[
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
                pages={microbiologySources(result)}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={clinicalRecord.treatment}
        count={summary.treatment.length}
      >
        {summary.treatment.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-1">
            {summary.treatment.map((medication, index) => (
              <li
                key={`${medication.name.value}-${index}`}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>{displayValue(medication.name.value)}</span>
                {medication.dose !== undefined ? (
                  <span className="text-muted-foreground">
                    {displayValue(medication.dose.value)}
                  </span>
                ) : null}
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(medication.sources)}
                />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {summary.discharge !== undefined ? (
        <CollapsibleSection title={clinicalRecord.discharge}>
          <RecordFields
            documentId={documentId}
            fields={[
              {
                label: clinicalRecord.conditionAtDischarge,
                value: summary.discharge.conditionAtDischarge?.value,
                sources: summary.discharge.conditionAtDischarge?.sources ?? [],
              },
              {
                label: clinicalRecord.treatment,
                value: summary.discharge.treatment?.value,
                sources: summary.discharge.treatment?.sources ?? [],
              },
              {
                label: clinicalRecord.instructions,
                value: summary.discharge.instructions?.value,
                sources: summary.discharge.instructions?.sources ?? [],
              },
              {
                label: clinicalRecord.followUp,
                value: summary.discharge.followUp?.value,
                sources: summary.discharge.followUp?.sources ?? [],
              },
            ]}
          />
        </CollapsibleSection>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 6: Verify it compiles and tests pass**

Run: `bun test apps/web/lib/summary-view.test.ts && bun run --cwd apps/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/summary-view.ts apps/web/lib/summary-view.test.ts apps/web/components/clinical-summary.tsx
git commit -m "feat(web): add clinical summary view"
```

---

### Task 7: Audit summary view

**Files:**
- Create: `apps/web/components/audit-summary.tsx`

**Interfaces:**
- Consumes: `AuditSummary`, `Finding` (Task 3); `describeEntry` (Task 4); `durationText` (Task 6); `sortFindings` from `../lib/findings-view.ts`; `EvidenceLinks`, `CollapsibleSection`, `RecordEmpty`, `RecordFields`; `clinicalRecord`, `summary` from i18n.
- Produces: `AuditSummaryView({ documentId, summary })`.

- [ ] **Step 1: Write the component**

Create `apps/web/components/audit-summary.tsx`:

```tsx
import type { AuditSummary, Finding } from "@audit/domain";
import { clinicalRecord, summary as summaryLabels } from "@audit/lib/i18n";
import { sourcePages } from "../lib/clinical-record-view.ts";
import { sortFindings } from "../lib/findings-view.ts";
import { durationText } from "../lib/summary-view.ts";
import { describeEntry } from "../lib/timeline-view.ts";
import {
  CollapsibleSection,
  RecordEmpty,
  RecordFields,
} from "./clinical-record-primitives.tsx";
import { EvidenceLinks } from "./evidence-link.tsx";

function FindingList({
  documentId,
  items,
}: {
  documentId: string;
  items: Finding[];
}) {
  if (items.length === 0) return <RecordEmpty />;

  return (
    <ul className="flex list-none flex-col gap-2">
      {sortFindings(items).map((finding) => (
        <li
          key={finding.id}
          className="rounded-lg border border-border bg-muted/30 p-3"
        >
          <p className="font-semibold [overflow-wrap:anywhere]">
            {finding.title}
          </p>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {finding.explanation}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {summaryLabels.requiresHumanReview}
          </p>
          <div className="mt-2">
            <EvidenceLinks
              documentId={documentId}
              pages={sourcePages(
                finding.evidence.map((evidence) => evidence.source),
              )}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AuditSummaryView({
  documentId,
  summary,
}: {
  documentId: string;
  summary: AuditSummary;
}) {
  return (
    <section className="flex flex-col gap-6">
      <CollapsibleSection title={summaryLabels.auditTitle} defaultOpen>
        <RecordFields
          documentId={documentId}
          fields={[
            {
              label: summaryLabels.duration,
              value: durationText(summary.durationDays),
              sources: [],
            },
            {
              label: clinicalRecord.reason,
              value: summary.reason?.value,
              sources: summary.reason?.sources ?? [],
            },
          ]}
        />
        <p className="text-sm font-medium text-muted-foreground">
          {summaryLabels.reviewCount(summary.requiresReview)}
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.documentedFacts}
        count={summary.majorEvents.length}
        defaultOpen
      >
        {summary.majorEvents.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.majorEvents.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>{describeEntry(entry)}</span>
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(entry.sources)}
                />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.treatmentChanges}
        count={summary.treatmentChanges.length}
      >
        {summary.treatmentChanges.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.treatmentChanges.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>{describeEntry(entry)}</span>
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(entry.sources)}
                />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.inconsistencies}
        count={summary.inconsistencies.length}
        defaultOpen
      >
        <FindingList
          documentId={documentId}
          items={summary.inconsistencies}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.documentationGaps}
        count={summary.documentationGaps.length}
        defaultOpen
      >
        <FindingList
          documentId={documentId}
          items={summary.documentationGaps}
        />
      </CollapsibleSection>

      <CollapsibleSection title={summaryLabels.aiInterpretation}>
        <p className="text-sm text-muted-foreground">
          {summaryLabels.requiresHumanReview}
        </p>
      </CollapsibleSection>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run --cwd apps/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/audit-summary.tsx
git commit -m "feat(web): add audit summary view"
```

---

### Task 8: Wire into the document page

**Files:**
- Modify: `apps/web/app/documents/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildTimeline`, `buildClinicalSummary`, `buildAuditSummary` from `@audit/domain`; `Timeline` (Task 5); `ClinicalSummaryView` (Task 6); `AuditSummaryView` (Task 7).

- [ ] **Step 1: Import and derive**

In `apps/web/app/documents/[id]/page.tsx`, add to the imports:

```tsx
import {
  buildAuditSummary,
  buildClinicalSummary,
  buildTimeline,
} from "@audit/domain";
import { AuditSummaryView } from "../../../components/audit-summary.tsx";
import { ClinicalSummaryView } from "../../../components/clinical-summary.tsx";
import { Timeline } from "../../../components/timeline.tsx";
```

Then, after the `doc`, `failedPages`, and `pageCount` declarations (around line 81), add:

```tsx
const timelineGroups =
  clinical !== null ? buildTimeline(clinical.record) : [];
const clinicalSummary =
  clinical !== null ? buildClinicalSummary(clinical.record) : null;
const auditSummary =
  clinical !== null
    ? buildAuditSummary(clinical.record, clinical.findings)
    : null;
```

- [ ] **Step 2: Render the new sections**

Replace the two `{clinical !== null ? (...ClinicalRecordView...)}` and `{clinical !== null ? (...FindingsSection...)}` blocks with the following (the new sections precede the full record view; findings stay last):

```tsx
      {clinicalSummary !== null ? (
        <ClinicalSummaryView documentId={doc.id} summary={clinicalSummary} />
      ) : null}
      <Timeline documentId={doc.id} groups={timelineGroups} />
      {auditSummary !== null ? (
        <AuditSummaryView documentId={doc.id} summary={auditSummary} />
      ) : null}
      {clinical !== null ? (
        <ClinicalRecordView
          documentId={doc.id}
          record={clinical.record}
          incomplete={clinical.extractionIncomplete || failedPages.length > 0}
          failedPages={failedPages}
          failedChunks={clinical.failedChunkCount}
        />
      ) : null}
      {clinical !== null ? (
        <FindingsSection
          documentId={doc.id}
          findings={clinical.findings}
          reviews={reviews}
        />
      ) : null}
```

- [ ] **Step 3: Run the full definition of done**

Run: `bun run lint && bun run typecheck && bun run test`
Expected: PASS at the repo root.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/documents/\[id\]/page.tsx
git commit -m "feat(web): render timeline and summaries on the document page"
```

---

## Self-Review

- **Spec coverage:** `dates.ts` → spec §5; `timeline.ts` → §14/§26; `summary.ts` clinical → §22; `summary.ts` audit → §23; i18n → §2/§9; components + page wiring → §24/§26; tests → §11 of the design.
- **Placeholder scan:** no TBD/TODO; all code shown.
- **Type consistency:** `TimelineDetail`, `TimelineEntry`, `TimelineGroup`, `ClinicalSummary`, `AuditSummary` names and shapes match across Tasks 2, 3, 4, 5, 6, 7.
- **Deferred (spec §13):** unused `generateClinicalSummary`/`generateAuditSummary`; no persistence; no bounding boxes; no left-nav shell; findings rules engine (Phase 5).
