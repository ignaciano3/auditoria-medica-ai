# Findings Review UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the persisted audit findings in the document page, with evidence links to the source page and review actions (`revisado`/`descartado`/nota) persisted to `findings_review`.

**Architecture:** Findings get deterministic content-derived ids at pipeline finalization so review state survives re-analysis. A new `findings_review` repository (with a unique index on `(document_id, finding_id)`) backs a server action; the document page renders a client Findings section with severity/status counts, a status filter, and per-finding actions. Evidence links use `?page=N#finding-<id>` and the PDF viewer syncs to the query param.

**Tech Stack:** Bun workspaces + Turborepo, TypeScript (strict), Biome, Next.js 16 App Router (React 19, typed routes, cacheComponents), Drizzle ORM + PostgreSQL, Zod, `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-17-findings-review-ui-design.md`

## Global Constraints

- All user-facing strings are **Spanish**, centralized in `packages/lib/src/i18n/es.ts`. Code, identifiers, and docs are English.
- Findings always keep `requiresHumanReview: true`; copy is cautious and never asserts error/omission.
- Biome is the linter/formatter (2-space indent, double quotes, semicolons, organized imports). Run `bunx turbo run lint --filter=<pkg>`.
- Strict TypeScript: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. No `any`.
- Do **not** add comments to code (project convention).
- **No new dependencies.**
- TDD: write the failing test, see it fail, implement minimally, see it pass, commit.
- Test file naming: `<module>.test.ts(x)` beside the module. `bun test` is the runner.
- DB repository tests are gated with `const maybe = url ? describe : describe.skip;` using `process.env.TEST_DATABASE_URL`.
- Commit after every task with the given message.

---

### Task 1: Stable content-derived finding ids (domain)

**Files:**
- Modify: `packages/domain/src/finding.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/finding.test.ts` (create)

**Interfaces:**
- Produces:
  - `FINDING_REVIEW_STATUSES: readonly ["pending", "reviewed", "dismissed"]`
  - `type FindingReviewStatus = "pending" | "reviewed" | "dismissed"`
  - `findingSignature(finding: Finding): string`
  - `assignStableFindingIds(findings: Finding[]): Finding[]` — returns findings in the **same order** as the input, each with a stable `id`.

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/finding.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { Finding } from "./finding.ts";
import { assignStableFindingIds, findingSignature } from "./finding.ts";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "provider-id",
    severity: "high",
    category: "temporal",
    title: "Posible inconsistencia temporal",
    explanation: "explicación",
    evidence: [
      {
        source: { documentId: "d1", pageNumber: 3, text: "texto" },
        relevance: "relevancia",
      },
    ],
    requiresHumanReview: true,
    ...overrides,
  };
}

describe("findingSignature", () => {
  test("normalizes case, accents, punctuation and whitespace", () => {
    const a = makeFinding({ title: "Posible  inconsistencia TEMPORAL." });
    const b = makeFinding({ title: "posible inconsistencia temporal" });
    expect(findingSignature(a)).toBe(findingSignature(b));
  });

  test("ignores the provider-assigned id", () => {
    expect(findingSignature(makeFinding({ id: "x" }))).toBe(
      findingSignature(makeFinding({ id: "y" })),
    );
  });

  test("changes when the evidence page changes", () => {
    const other = makeFinding({
      evidence: [
        {
          source: { documentId: "d1", pageNumber: 4, text: "t" },
          relevance: "r",
        },
      ],
    });
    expect(findingSignature(makeFinding())).not.toBe(findingSignature(other));
  });
});

describe("assignStableFindingIds", () => {
  test("is stable across runs for the same content", () => {
    const first = assignStableFindingIds([makeFinding()]);
    const second = assignStableFindingIds([makeFinding()]);
    expect(first.map((finding) => finding.id)).toEqual(
      second.map((finding) => finding.id),
    );
    expect(first[0]?.id.startsWith("fnd-")).toBe(true);
  });

  test("does not depend on input order", () => {
    const a = makeFinding({ category: "temporal", title: "Alfa" });
    const b = makeFinding({ category: "medication", title: "Beta" });
    const forward = assignStableFindingIds([a, b]).map((finding) => finding.id);
    const backward = assignStableFindingIds([b, a]).map(
      (finding) => finding.id,
    );
    expect([...forward].sort()).toEqual([...backward].sort());
  });

  test("disambiguates duplicate signatures", () => {
    const ids = assignStableFindingIds([makeFinding(), makeFinding()]).map(
      (finding) => finding.id,
    );
    expect(new Set(ids).size).toBe(2);
    expect(ids.some((id) => id.endsWith("-2"))).toBe(true);
  });

  test("preserves input order", () => {
    const a = makeFinding({ category: "temporal", title: "Alfa" });
    const b = makeFinding({ category: "medication", title: "Beta" });
    const ids = assignStableFindingIds([a, b]).map((finding) => finding.id);
    expect(ids[0]).toBe(assignStableFindingIds([a]).map((f) => f.id)[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/domain/src/finding.test.ts`
Expected: FAIL — `assignStableFindingIds` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/domain/src/finding.ts`:

```ts
export const FINDING_REVIEW_STATUSES = [
  "pending",
  "reviewed",
  "dismissed",
] as const;

export type FindingReviewStatus = (typeof FINDING_REVIEW_STATUSES)[number];

function normalizeSignatureText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findingSignature(finding: Finding): string {
  const pages = finding.evidence
    .map((item) => item.source.pageNumber)
    .sort((a, b) => a - b)
    .join(",");
  return `${finding.category}|${normalizeSignatureText(finding.title)}|${pages}`;
}

function djb2Hex(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function assignStableFindingIds(findings: Finding[]): Finding[] {
  const ordered = findings
    .map((finding, index) => ({
      finding,
      index,
      signature: findingSignature(finding),
    }))
    .sort((a, b) => {
      if (a.signature < b.signature) return -1;
      if (a.signature > b.signature) return 1;
      return a.index - b.index;
    });

  const occurrences = new Map<string, number>();
  const stabilized = ordered.map((entry) => {
    const base = `fnd-${djb2Hex(entry.signature)}`;
    const seen = occurrences.get(base) ?? 0;
    occurrences.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;
    return { index: entry.index, finding: { ...entry.finding, id } };
  });

  return stabilized
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.finding);
}
```

Update the findings export block in `packages/domain/src/index.ts` to:

```ts
export {
  assignStableFindingIds,
  FINDING_CATEGORIES,
  FINDING_REVIEW_STATUSES,
  FINDING_SEVERITIES,
  type Finding,
  type FindingCategory,
  type FindingReviewStatus,
  type FindingSeverity,
  findingSchema,
  findingSignature,
} from "./finding.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/domain/src/finding.test.ts`
Expected: PASS (all cases).

Then run: `bunx turbo run typecheck --filter=@audit/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/finding.ts packages/domain/src/finding.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): assign stable content-derived finding ids"
```

---

### Task 2: Finding review repository + unique index (db)

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/repositories/finding-reviews.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/drizzle/0002_*.sql` (generated)
- Test: `packages/db/src/repositories/finding-reviews.test.ts` (create)

**Interfaces:**
- Consumes: `FindingReviewStatus` from `@audit/domain` (Task 1).
- Produces:
  - `type FindingReview = { findingId: string; status: FindingReviewStatus; note: string | null }`
  - `createFindingReviewRepository(db)` returning:
    - `listForDocument(documentId: string): Promise<FindingReview[]>`
    - `setStatus(documentId: string, findingId: string, status: FindingReviewStatus, note: string | null): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `packages/db/src/repositories/finding-reviews.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Database, getDb } from "../client.ts";
import { createDocumentRepository } from "./documents.ts";
import { createFindingReviewRepository } from "./finding-reviews.ts";

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("finding reviews repository", () => {
  let db: Database;
  let reviews: ReturnType<typeof createFindingReviewRepository>;
  let documents: ReturnType<typeof createDocumentRepository>;

  beforeAll(() => {
    db = getDb(url as string);
    reviews = createFindingReviewRepository(db);
    documents = createDocumentRepository(db);
  });

  afterAll(async () => {
    await (
      db as unknown as { $client?: { end?: () => Promise<void> } }
    ).$client?.end?.();
  });

  async function createDocument(): Promise<string> {
    const document = await documents.create({
      originalFilename: "historia.pdf",
      originalKey: "documents/abc/original.pdf",
    });
    return document.id;
  }

  test("inserts then updates a review without duplicating rows", async () => {
    const documentId = await createDocument();

    await reviews.setStatus(documentId, "fnd-1", "reviewed", "ok");
    let listed = await reviews.listForDocument(documentId);
    expect(listed).toEqual([
      { findingId: "fnd-1", status: "reviewed", note: "ok" },
    ]);

    await reviews.setStatus(documentId, "fnd-1", "dismissed", null);
    listed = await reviews.listForDocument(documentId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual({
      findingId: "fnd-1",
      status: "dismissed",
      note: null,
    });

    await documents.remove(documentId);
  });

  test("isolates reviews by document", async () => {
    const documentId = await createDocument();
    const otherId = await createDocument();

    await reviews.setStatus(otherId, "fnd-2", "pending", null);
    expect(await reviews.listForDocument(documentId)).toEqual([]);
    expect(await reviews.listForDocument(otherId)).toEqual([
      { findingId: "fnd-2", status: "pending", note: null },
    ]);

    await documents.remove(documentId);
    await documents.remove(otherId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/db/src/repositories/finding-reviews.test.ts`
Expected: FAIL — module `./finding-reviews.ts` not found. (Without `TEST_DATABASE_URL` the suite skips, so also run `bunx turbo run typecheck --filter=@audit/db` to see the missing-module error.)

- [ ] **Step 3: Add the schema changes**

In `packages/db/src/schema.ts`, add `FindingReviewStatus` to the `@audit/domain` import list, then replace the `findingsReview` definition with:

```ts
export const findingsReview = pgTable(
  "findings_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    findingId: text("finding_id").notNull(),
    status: text("status").$type<FindingReviewStatus>().notNull().default("pending"),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("findings_review_document_finding_idx").on(
      table.documentId,
      table.findingId,
    ),
  ],
);
```

- [ ] **Step 4: Create the repository**

Create `packages/db/src/repositories/finding-reviews.ts`:

```ts
import type { FindingReviewStatus } from "@audit/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { findingsReview } from "../schema.ts";

export type FindingReview = {
  findingId: string;
  status: FindingReviewStatus;
  note: string | null;
};

export function createFindingReviewRepository(db: Database) {
  return {
    async listForDocument(documentId: string): Promise<FindingReview[]> {
      return db
        .select({
          findingId: findingsReview.findingId,
          status: findingsReview.status,
          note: findingsReview.note,
        })
        .from(findingsReview)
        .where(eq(findingsReview.documentId, documentId));
    },
    async setStatus(
      documentId: string,
      findingId: string,
      status: FindingReviewStatus,
      note: string | null,
    ): Promise<void> {
      await db
        .insert(findingsReview)
        .values({ documentId, findingId, status, note })
        .onConflictDoUpdate({
          target: [findingsReview.documentId, findingsReview.findingId],
          set: { status, note, updatedAt: new Date() },
        });
    },
  };
}
```

Update `packages/db/src/index.ts` to add (keeping the export list alphabetized):

```ts
export {
  createFindingReviewRepository,
  type FindingReview,
} from "./repositories/finding-reviews.ts";
```

- [ ] **Step 5: Generate the migration**

Run from `packages/db`: `bun run db:generate`
Expected: a new file `packages/db/drizzle/0002_*.sql` plus `meta` update.

Verify the generated SQL contains:

```sql
CREATE UNIQUE INDEX "findings_review_document_finding_idx" ON "findings_review" USING btree ("document_id","finding_id");
```

If drizzle-kit emitted no changes, the schema edit in Step 3 is wrong — fix before continuing.

- [ ] **Step 6: Run tests to verify**

Run: `bun test packages/db/src/repositories/finding-reviews.test.ts`
Expected: PASS when `TEST_DATABASE_URL` points at a migrated Postgres (apply with `bun run db:migrate` from `packages/db`); SKIP otherwise.

Run: `bunx turbo run typecheck --filter=@audit/db`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/repositories/finding-reviews.ts packages/db/src/repositories/finding-reviews.test.ts packages/db/src/index.ts packages/db/drizzle
git commit -m "feat(db): add finding review repository and unique index"
```

---

### Task 3: Apply stable ids in the worker pipeline

**Files:**
- Modify: `apps/worker/src/pipeline/process-document.ts`
- Test: `apps/worker/src/pipeline/process-document.test.ts`

**Interfaces:**
- Consumes: `assignStableFindingIds` from `@audit/domain` (Task 1).
- Produces: `deps.clinicalRecords.upsert(...)` now receives findings whose `id` is the stable `fnd-*` value (unchanged signature).

- [ ] **Step 1: Write the failing test**

Append these two tests inside the `describe("createProcessDocument", ...)` block in `apps/worker/src/pipeline/process-document.test.ts`:

```ts
  test("assigns stable content-derived finding ids across runs", async () => {
    const first = makeDeps({});
    const second = makeDeps({});

    await first.processDocument({ documentId: "d1" });
    await second.processDocument({ documentId: "d1" });

    const firstIds = first.upserted[0]?.findings.map((finding) => finding.id);
    const secondIds = second.upserted[0]?.findings.map((finding) => finding.id);

    expect(firstIds).toHaveLength(1);
    expect(firstIds?.[0]?.startsWith("fnd-")).toBe(true);
    expect(firstIds).toEqual(secondIds);
  });

  test("does not depend on the order findings come back from the provider", async () => {
    const alpha: Finding = {
      id: "provider-a",
      severity: "high",
      category: "temporal",
      title: "Alfa",
      explanation: "e",
      evidence: [{ source: ghostSource(1, "a"), relevance: "r" }],
      requiresHumanReview: true,
    };
    const beta: Finding = {
      id: "provider-b",
      severity: "low",
      category: "medication",
      title: "Beta",
      explanation: "e",
      evidence: [{ source: ghostSource(2, "b"), relevance: "r" }],
      requiresHumanReview: true,
    };

    const forward = makeDeps({ findings: [alpha, beta] });
    const backward = makeDeps({ findings: [beta, alpha] });

    await forward.processDocument({ documentId: "d1" });
    await backward.processDocument({ documentId: "d1" });

    const forwardIds = (forward.upserted[0]?.findings ?? [])
      .map((finding) => finding.id)
      .sort();
    const backwardIds = (backward.upserted[0]?.findings ?? [])
      .map((finding) => finding.id)
      .sort();

    expect(forwardIds).toEqual(backwardIds);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/worker/src/pipeline/process-document.test.ts`
Expected: FAIL — ids are still `f1`/`provider-a`, not `fnd-*`.

- [ ] **Step 3: Write minimal implementation**

In `apps/worker/src/pipeline/process-document.ts`:

1. Add `assignStableFindingIds` to the `@audit/domain` import block (keep alphabetization):

```ts
import {
  assignStableFindingIds,
  type ClinicalRecord,
  clinicalRecordSchema,
  type DocumentPage,
  type DocumentStatus,
  type Finding,
} from "@audit/domain";
```

2. Immediately after the line `findings = stampFindingProvenance(findings, documentId);` add:

```ts
      findings = assignStableFindingIds(findings);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/worker/src/pipeline/process-document.test.ts`
Expected: PASS (including the pre-existing 15 tests).

Run: `bunx turbo run typecheck --filter=@audit/worker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/pipeline/process-document.ts apps/worker/src/pipeline/process-document.test.ts
git commit -m "feat(worker): stabilize finding ids before persisting"
```

---

### Task 4: Findings view helpers + review validation (web, pure)

**Files:**
- Create: `apps/web/lib/findings-view.ts`
- Modify: `packages/lib/src/i18n/es.ts`
- Test: `apps/web/lib/findings-view.test.ts` (create)

**Interfaces:**
- Consumes: `Finding`, `FindingReviewStatus`, `FindingSeverity`, `FINDING_REVIEW_STATUSES` from `@audit/domain` (Task 1); `FindingReview` from `@audit/db` (Task 2).
- Produces:
  - `type FindingFilter = "all" | FindingReviewStatus`
  - `sortFindings(findings: Finding[]): Finding[]`
  - `reviewStatusOf(reviews: FindingReview[], findingId: string): FindingReviewStatus`
  - `filterFindings(findings: Finding[], reviews: FindingReview[], filter: FindingFilter): Finding[]`
  - `countBySeverity(findings: Finding[]): Record<FindingSeverity, number>`
  - `countByStatus(findings: Finding[], reviews: FindingReview[]): Record<FindingReviewStatus, number>`
  - `MAX_NOTE_LENGTH = 2000`
  - `type ReviewInput = { documentId: string; findingId: string; status: string; note?: string | null }`
  - `validateReviewInput(input: ReviewInput): { ok: true; value: { documentId: string; findingId: string; status: FindingReviewStatus; note: string | null } } | { ok: false; error: string }`

- [ ] **Step 1: Add the Spanish error copy**

In `packages/lib/src/i18n/es.ts`, add to the `errors` object (after `deleteFailed`):

```ts
  invalidFinding: "Hallazgo no válido.",
  invalidReviewStatus: "Estado de revisión no válido.",
  noteTooLong: "La nota no puede superar los 2000 caracteres.",
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/lib/findings-view.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { FindingReview } from "@audit/db";
import type { Finding } from "@audit/domain";
import { errors } from "@audit/lib/i18n";
import {
  countBySeverity,
  countByStatus,
  filterFindings,
  reviewStatusOf,
  sortFindings,
  validateReviewInput,
} from "./findings-view.ts";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "fnd-1",
    severity: "medium",
    category: "temporal",
    title: "Título",
    explanation: "explicación",
    evidence: [
      {
        source: { documentId: "d1", pageNumber: 1, text: "t" },
        relevance: "r",
      },
    ],
    requiresHumanReview: true,
    ...overrides,
  };
}

function review(
  findingId: string,
  status: FindingReview["status"],
  note: string | null = null,
): FindingReview {
  return { findingId, status, note };
}

describe("sortFindings", () => {
  test("orders by severity high to info, then category, then title", () => {
    const sorted = sortFindings([
      finding({ id: "low", severity: "low", title: "Z" }),
      finding({ id: "high", severity: "high", title: "B" }),
      finding({ id: "info", severity: "info", title: "A" }),
      finding({ id: "high2", severity: "high", title: "A" }),
      finding({ id: "medium", severity: "medium", title: "C" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([
      "high2",
      "high",
      "medium",
      "low",
      "info",
    ]);
  });

  test("does not mutate the input array", () => {
    const input = [finding({ id: "a" }), finding({ id: "b", severity: "info" })];
    const copy = [...input];
    sortFindings(input);
    expect(input).toEqual(copy);
  });
});

describe("reviewStatusOf", () => {
  test("defaults to pending when there is no review row", () => {
    expect(reviewStatusOf([], "fnd-1")).toBe("pending");
  });

  test("returns the stored status", () => {
    expect(reviewStatusOf([review("fnd-1", "dismissed")], "fnd-1")).toBe(
      "dismissed",
    );
  });
});

describe("filterFindings", () => {
  const findings = [
    finding({ id: "a" }),
    finding({ id: "b" }),
    finding({ id: "c" }),
  ];
  const reviews = [review("a", "reviewed"), review("b", "dismissed")];

  test("returns everything for the all filter", () => {
    expect(filterFindings(findings, reviews, "all")).toHaveLength(3);
  });

  test("treats findings without a row as pending", () => {
    expect(filterFindings(findings, reviews, "pending").map((f) => f.id)).toEqual(
      ["c"],
    );
  });

  test("filters reviewed and dismissed", () => {
    expect(filterFindings(findings, reviews, "reviewed").map((f) => f.id)).toEqual(
      ["a"],
    );
    expect(
      filterFindings(findings, reviews, "dismissed").map((f) => f.id),
    ).toEqual(["b"]);
  });
});

describe("countBySeverity", () => {
  test("counts each severity", () => {
    expect(
      countBySeverity([
        finding({ severity: "high" }),
        finding({ severity: "high" }),
        finding({ severity: "info" }),
      ]),
    ).toEqual({ high: 2, medium: 0, low: 0, info: 1 });
  });
});

describe("countByStatus", () => {
  test("counts pending for missing rows", () => {
    expect(
      countByStatus(
        [finding({ id: "a" }), finding({ id: "b" }), finding({ id: "c" })],
        [review("a", "reviewed"), review("b", "dismissed")],
      ),
    ).toEqual({ pending: 1, reviewed: 1, dismissed: 1 });
  });
});

describe("validateReviewInput", () => {
  test("accepts a valid status and trims the note", () => {
    expect(
      validateReviewInput({
        documentId: "d1",
        findingId: "fnd-1",
        status: "reviewed",
        note: "  ok  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        documentId: "d1",
        findingId: "fnd-1",
        status: "reviewed",
        note: "ok",
      },
    });
  });

  test("converts a blank note to null", () => {
    const result = validateReviewInput({
      documentId: "d1",
      findingId: "fnd-1",
      status: "pending",
      note: "   ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.note).toBeNull();
  });

  test("omitting the note yields null", () => {
    const result = validateReviewInput({
      documentId: "d1",
      findingId: "fnd-1",
      status: "dismissed",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.note).toBeNull();
  });

  test("rejects an unknown status", () => {
    expect(
      validateReviewInput({
        documentId: "d1",
        findingId: "fnd-1",
        status: "bogus",
      }),
    ).toEqual({ ok: false, error: errors.invalidReviewStatus });
  });

  test("rejects an empty document or finding id", () => {
    expect(
      validateReviewInput({ documentId: " ", findingId: "fnd-1", status: "reviewed" }),
    ).toEqual({ ok: false, error: errors.invalidFinding });
    expect(
      validateReviewInput({ documentId: "d1", findingId: "", status: "reviewed" }),
    ).toEqual({ ok: false, error: errors.invalidFinding });
  });

  test("rejects a note longer than the maximum", () => {
    expect(
      validateReviewInput({
        documentId: "d1",
        findingId: "fnd-1",
        status: "reviewed",
        note: "x".repeat(2001),
      }),
    ).toEqual({ ok: false, error: errors.noteTooLong });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test apps/web/lib/findings-view.test.ts`
Expected: FAIL — `./findings-view.ts` not found.

- [ ] **Step 4: Write minimal implementation**

Create `apps/web/lib/findings-view.ts`:

```ts
import type { FindingReview } from "@audit/db";
import {
  type Finding,
  FINDING_REVIEW_STATUSES,
  type FindingReviewStatus,
  type FindingSeverity,
} from "@audit/domain";
import { errors } from "@audit/lib/i18n";

export type FindingFilter = "all" | FindingReviewStatus;

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    if (a.title === b.title) return 0;
    return a.title < b.title ? -1 : 1;
  });
}

export function reviewStatusOf(
  reviews: FindingReview[],
  findingId: string,
): FindingReviewStatus {
  return (
    reviews.find((review) => review.findingId === findingId)?.status ?? "pending"
  );
}

export function filterFindings(
  findings: Finding[],
  reviews: FindingReview[],
  filter: FindingFilter,
): Finding[] {
  if (filter === "all") return findings;
  return findings.filter(
    (finding) => reviewStatusOf(reviews, finding.id) === filter,
  );
}

export function countBySeverity(
  findings: Finding[],
): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = {
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

export function countByStatus(
  findings: Finding[],
  reviews: FindingReview[],
): Record<FindingReviewStatus, number> {
  const counts: Record<FindingReviewStatus, number> = {
    pending: 0,
    reviewed: 0,
    dismissed: 0,
  };
  for (const finding of findings) {
    counts[reviewStatusOf(reviews, finding.id)] += 1;
  }
  return counts;
}

export const MAX_NOTE_LENGTH = 2000;

export type ReviewInput = {
  documentId: string;
  findingId: string;
  status: string;
  note?: string | null;
};

export type ReviewValidation =
  | {
      ok: true;
      value: {
        documentId: string;
        findingId: string;
        status: FindingReviewStatus;
        note: string | null;
      };
    }
  | { ok: false; error: string };

export function validateReviewInput(input: ReviewInput): ReviewValidation {
  const documentId = input.documentId.trim();
  const findingId = input.findingId.trim();
  if (documentId === "" || findingId === "") {
    return { ok: false, error: errors.invalidFinding };
  }
  if (!(FINDING_REVIEW_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: errors.invalidReviewStatus };
  }
  const note = input.note?.trim() ?? "";
  if (note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: errors.noteTooLong };
  }
  return {
    ok: true,
    value: {
      documentId,
      findingId,
      status: input.status as FindingReviewStatus,
      note: note === "" ? null : note,
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test apps/web/lib/findings-view.test.ts`
Expected: PASS.

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/findings-view.ts apps/web/lib/findings-view.test.ts packages/lib/src/i18n/es.ts
git commit -m "feat(web): add findings view helpers and review validation"
```

---

### Task 5: Review service, server action, container, API parity

**Files:**
- Create: `apps/web/lib/findings-service.ts`
- Create: `apps/web/lib/findings-service.test.ts`
- Modify: `apps/web/lib/container.ts`
- Modify: `apps/web/lib/actions.ts`
- Modify: `apps/web/app/api/documents/[id]/route.ts`

**Interfaces:**
- Consumes: `ReviewInput`, `validateReviewInput` (Task 4); `createFindingReviewRepository`, `FindingReview` (Task 2).
- Produces:
  - `type FindingReviewDeps = { findingReviews: { setStatus(documentId: string, findingId: string, status: FindingReviewStatus, note: string | null): Promise<void> } }`
  - `saveFindingReview(deps: FindingReviewDeps, input: ReviewInput): Promise<{ ok: true } | { ok: false; error: string }>`
  - `setFindingReview(input: ReviewInput): Promise<{ ok: true } | { ok: false; error: string }>` (server action)
  - `Container.findingReviews`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/findings-service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { FindingReviewStatus } from "@audit/domain";
import { errors } from "@audit/lib/i18n";
import { type FindingReviewDeps, saveFindingReview } from "./findings-service.ts";

type Call = [string, string, FindingReviewStatus, string | null];

function makeDeps(): { deps: FindingReviewDeps; calls: Call[] } {
  const calls: Call[] = [];
  const deps: FindingReviewDeps = {
    findingReviews: {
      setStatus: (documentId, findingId, status, note) => {
        calls.push([documentId, findingId, status, note]);
        return Promise.resolve();
      },
    },
  };
  return { deps, calls };
}

describe("saveFindingReview", () => {
  test("persists a valid review with a trimmed note", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "reviewed",
      note: "  ok  ",
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([["d1", "fnd-1", "reviewed", "ok"]]);
  });

  test("converts a blank note to null", async () => {
    const { deps, calls } = makeDeps();
    await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "pending",
      note: "   ",
    });
    expect(calls).toEqual([["d1", "fnd-1", "pending", null]]);
  });

  test("rejects an invalid status without touching the repository", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "bogus",
    });
    expect(result).toEqual({ ok: false, error: errors.invalidReviewStatus });
    expect(calls).toEqual([]);
  });

  test("rejects an over-long note without touching the repository", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "reviewed",
      note: "x".repeat(2001),
    });
    expect(result).toEqual({ ok: false, error: errors.noteTooLong });
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/web/lib/findings-service.test.ts`
Expected: FAIL — `./findings-service.ts` not found.

- [ ] **Step 3: Write the service**

Create `apps/web/lib/findings-service.ts`:

```ts
import type { FindingReviewStatus } from "@audit/domain";
import { type ReviewInput, validateReviewInput } from "./findings-view.ts";

export type FindingReviewDeps = {
  findingReviews: {
    setStatus(
      documentId: string,
      findingId: string,
      status: FindingReviewStatus,
      note: string | null,
    ): Promise<void>;
  };
};

export type SaveFindingReviewResult = { ok: true } | { ok: false; error: string };

export async function saveFindingReview(
  deps: FindingReviewDeps,
  input: ReviewInput,
): Promise<SaveFindingReviewResult> {
  const validation = validateReviewInput(input);
  if (!validation.ok) return validation;
  const { documentId, findingId, status, note } = validation.value;
  await deps.findingReviews.setStatus(documentId, findingId, status, note);
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/web/lib/findings-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the container**

In `apps/web/lib/container.ts`:

1. Add `createFindingReviewRepository` to the `@audit/db` import.
2. Add the type alias:
```ts
type FindingReviewRepository = ReturnType<
  typeof createFindingReviewRepository
>;
```
3. Add `findingReviews: FindingReviewRepository;` to `Container`.
4. Add `findingReviews: createFindingReviewRepository(db),` to the cached container object.

- [ ] **Step 6: Add the server action**

In `apps/web/lib/actions.ts`, add to the imports:

```ts
import { saveFindingReview } from "./findings-service.ts";
import type { ReviewInput } from "./findings-view.ts";
```

Then append:

```ts
export type FindingReviewActionResult = { ok: true } | { ok: false; error: string };

export async function setFindingReview(
  input: ReviewInput,
): Promise<FindingReviewActionResult> {
  const result = await saveFindingReview(getContainer(), input);
  if (result.ok) revalidatePath("/documents/[id]", "page");
  return result;
}
```

- [ ] **Step 7: API parity**

In `apps/web/app/api/documents/[id]/route.ts`, extend the `Promise.all` and payload:

```ts
  const [clinical, pages, reviews] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
    container.findingReviews.listForDocument(id),
  ]);
  return NextResponse.json({
    document: serializeDocument(row),
    record: clinical?.record ?? null,
    findings: clinical?.findings ?? [],
    reviews,
    extractionIncomplete: clinical?.extractionIncomplete ?? false,
    failedChunkCount: clinical?.failedChunkCount ?? 0,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      status: page.status,
      docType: page.docType,
    })),
  });
```

- [ ] **Step 8: Verify**

Run: `bun test apps/web/lib/findings-service.test.ts`
Expected: PASS.

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS — confirms the container structurally satisfies `FindingReviewDeps`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/findings-service.ts apps/web/lib/findings-service.test.ts apps/web/lib/container.ts apps/web/lib/actions.ts apps/web/app/api/documents/\[id\]/route.ts
git commit -m "feat(web): persist finding reviews via server action"
```

---

### Task 6: Findings UI, evidence navigation, page wiring

**Files:**
- Modify: `packages/lib/src/i18n/es.ts`
- Modify: `packages/lib/src/index.ts`
- Create: `apps/web/components/findings-section.tsx`
- Create: `apps/web/components/finding-card.tsx`
- Modify: `apps/web/components/pdf-viewer.tsx`
- Modify: `apps/web/app/documents/[id]/page.tsx`

**Interfaces:**
- Consumes: helpers from Task 4, action from Task 5, `FindingReview` from Task 2.
- Produces: `<FindingsSection documentId findings reviews />`; `PdfViewer` now re-syncs when `initialPage` changes.

- [ ] **Step 1: Add the Spanish UI copy**

In `packages/lib/src/i18n/es.ts`, append a new object after `clinicalRecord`:

```ts
export const findings = {
  empty: "No se encontraron hallazgos.",
  emptyFilter: "No hay hallazgos con este filtro.",
  reviewFailed: "No se pudo guardar la revisión.",
  evidence: "Evidencia",
  note: "Nota",
  notePlaceholder: "Agregar una nota de revisión",
  saveNote: "Guardar nota",
  markPending: "Marcar como pendiente",
  viewPage: (page: number) => `Ver página ${page}`,
  filter: {
    all: "Todos",
    pending: "Pendientes",
    reviewed: "Revisados",
    dismissed: "Descartados",
  },
  status: {
    pending: "Pendiente",
    reviewed: "Revisado",
    dismissed: "Descartado",
  },
  severity: {
    high: "Alta",
    medium: "Media",
    low: "Baja",
    info: "Informativa",
  },
  category: {
    temporal: "Temporal",
    contradiction: "Contradicción",
    medication: "Medicación",
    documentation: "Documentación",
    audit: "Auditoría",
    other: "Otro",
  },
} as const;
```

Add `findings,` to the export list in `packages/lib/src/index.ts` (alphabetized, before `pageDocTypeLabels`).

- [ ] **Step 2: Create the finding card**

Create `apps/web/components/finding-card.tsx`:

```tsx
"use client";

import type { Finding, FindingReviewStatus, FindingSeverity } from "@audit/domain";
import { findings as copy, ui } from "@audit/lib/i18n";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  high: "border-[#d1242f] text-[#d1242f]",
  medium: "border-[#9a6700] text-[#9a6700]",
  low: "border-foreground/40 text-foreground/70",
  info: "border-foreground/30 text-foreground/60",
};

export function FindingCard({
  documentId,
  finding,
  status,
  note,
  onReview,
}: {
  documentId: string;
  finding: Finding;
  status: FindingReviewStatus;
  note: string | null;
  onReview: (
    findingId: string,
    status: FindingReviewStatus,
    note: string | null,
  ) => void;
}) {
  const [draftNote, setDraftNote] = useState(note ?? "");
  const documentHref = `/documents/${documentId}` as Route;

  return (
    <li
      id={`finding-${finding.id}`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-foreground/20 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-sm ${SEVERITY_CLASS[finding.severity]}`}
        >
          {copy.severity[finding.severity]}
        </span>
        <span className="text-sm text-foreground/60">
          {copy.category[finding.category]}
        </span>
        <span className="ml-auto text-sm text-foreground/60">
          {copy.status[status]}
        </span>
      </div>

      <h3 className="font-semibold">{finding.title}</h3>
      <p className="text-sm leading-relaxed">{finding.explanation}</p>
      {finding.recommendation !== undefined ? (
        <p className="text-sm text-foreground/70">{finding.recommendation}</p>
      ) : null}

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-foreground/70">
          {copy.evidence}
        </h4>
        <ul className="flex list-none flex-col gap-1">
          {finding.evidence.map((item) => (
            <li key={`${item.source.pageNumber}-${item.source.text}`}>
              <Link
                className="text-sm underline"
                href={{
                  pathname: documentHref,
                  query: { page: item.source.pageNumber },
                  hash: `finding-${finding.id}`,
                }}
              >
                {copy.viewPage(item.source.pageNumber)}
              </Link>
              <span className="ml-2 text-sm text-foreground/60">
                {item.relevance}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
          onClick={() => onReview(finding.id, "reviewed", note)}
        >
          {ui.reviewed}
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
          onClick={() => onReview(finding.id, "dismissed", note)}
        >
          {ui.dismissFinding}
        </button>
        {status !== "pending" ? (
          <button
            type="button"
            className="cursor-pointer rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
            onClick={() => onReview(finding.id, "pending", note)}
          >
            {copy.markPending}
          </button>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onReview(finding.id, status, draftNote);
        }}
      >
        <label
          className="text-sm font-semibold text-foreground/70"
          htmlFor={`note-${finding.id}`}
        >
          {copy.note}
        </label>
        <textarea
          id={`note-${finding.id}`}
          className="rounded-md border border-foreground/20 bg-background p-2 text-sm"
          maxLength={2000}
          placeholder={copy.notePlaceholder}
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
        />
        <button
          type="submit"
          className="cursor-pointer self-start rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
        >
          {copy.saveNote}
        </button>
      </form>
    </li>
  );
}
```

- [ ] **Step 3: Create the findings section**

Create `apps/web/components/findings-section.tsx`:

```tsx
"use client";

import type { FindingReview } from "@audit/db";
import type { Finding, FindingReviewStatus, FindingSeverity } from "@audit/domain";
import { findings as copy, ui } from "@audit/lib/i18n";
import { useEffect, useState } from "react";
import { setFindingReview } from "../lib/actions.ts";
import {
  countBySeverity,
  countByStatus,
  filterFindings,
  type FindingFilter,
  sortFindings,
} from "../lib/findings-view.ts";
import { FindingCard } from "./finding-card.tsx";

const SEVERITIES: FindingSeverity[] = ["high", "medium", "low", "info"];
const FILTERS: FindingFilter[] = ["all", "pending", "reviewed", "dismissed"];

function toMap(reviews: FindingReview[]): Map<string, FindingReview> {
  return new Map(reviews.map((review) => [review.findingId, review]));
}

export function FindingsSection({
  documentId,
  findings,
  reviews,
}: {
  documentId: string;
  findings: Finding[];
  reviews: FindingReview[];
}) {
  const [reviewMap, setReviewMap] = useState(() => toMap(reviews));
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReviewMap(toMap(reviews));
  }, [reviews]);

  const ordered = sortFindings(findings);
  const currentReviews = [...reviewMap.values()];
  const visible = filterFindings(ordered, currentReviews, filter);
  const severityCounts = countBySeverity(findings);
  const statusCounts = countByStatus(findings, currentReviews);

  async function handleReview(
    findingId: string,
    status: FindingReviewStatus,
    note: string | null,
  ) {
    const previous = reviewMap;
    const next = new Map(previous);
    next.set(findingId, { findingId, status, note });
    setReviewMap(next);
    setFailed(false);
    try {
      const result = await setFindingReview({ documentId, findingId, status, note });
      if (!result.ok) {
        setReviewMap(previous);
        setFailed(true);
      }
    } catch {
      setReviewMap(previous);
      setFailed(true);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">{ui.findings}</h2>
        {SEVERITIES.map((severity) =>
          severityCounts[severity] > 0 ? (
            <span
              key={severity}
              className="rounded-md border border-foreground/20 px-2 py-0.5 text-sm"
            >
              {copy.severity[severity]}: {severityCounts[severity]}
            </span>
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
              filter === option ? "border-foreground bg-foreground/10" : "border-foreground/20"
            }`}
            onClick={() => setFilter(option)}
          >
            {copy.filter[option]}{" "}
            {option === "all"
              ? `(${findings.length})`
              : `(${statusCounts[option]})`}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="text-[#d1242f]" role="alert">
          {copy.reviewFailed}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-foreground/60">
          {findings.length === 0 ? copy.empty : copy.emptyFilter}
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-3">
          {visible.map((finding) => (
            <FindingCard
              key={finding.id}
              documentId={documentId}
              finding={finding}
              status={reviewMap.get(finding.id)?.status ?? "pending"}
              note={reviewMap.get(finding.id)?.note ?? null}
              onReview={handleReview}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Sync the PDF viewer to the query param**

In `apps/web/components/pdf-viewer.tsx`:

1. Change the React import to include `useEffect`:
```ts
import { useEffect, useState } from "react";
```
2. Add this effect immediately after the `useState` declarations:

```ts
  useEffect(() => {
    setPage(clampPage(initialPage, pageCount));
  }, [initialPage, pageCount]);
```

- [ ] **Step 5: Wire the document page**

Replace `apps/web/app/documents/[id]/page.tsx` with:

```tsx
import { ui } from "@audit/lib/i18n";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClinicalRecordView } from "../../../components/clinical-record-view.tsx";
import { DeleteDocumentButton } from "../../../components/delete-document-button.tsx";
import { DocumentStatusBadge } from "../../../components/document-status-badge.tsx";
import { FindingsSection } from "../../../components/findings-section.tsx";
import { PdfViewer } from "../../../components/pdf-viewer.tsx";
import { getContainer } from "../../../lib/container.ts";
import { serializeDocument } from "../../../lib/serialize-document.ts";

export default function DocumentDetailPage({
  params,
  searchParams,
}: PageProps<"/documents/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 sm:px-4">
      <Suspense
        fallback={<output className="text-foreground/60">{ui.loading}</output>}
      >
        <DocumentContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function DocumentContent({
  params,
  searchParams,
}: Pick<PageProps<"/documents/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  await io();
  const container = getContainer();
  const row = await container.documents.getById(id);
  if (!row) notFound();

  const [clinical, pages, reviews] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
    container.findingReviews.listForDocument(id),
  ]);
  const doc = serializeDocument(row);
  const failedPages = pages
    .filter((page) => page.status === "failed")
    .map((page) => page.pageNumber);
  const pageCount = doc.pageCount;

  const pageParam = Array.isArray(query.page) ? query.page[0] : query.page;
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const initialPage = Number.isFinite(parsedPage) ? parsedPage : 1;

  return (
    <>
      <Link
        className="text-sm text-foreground/60 hover:text-foreground"
        href="/"
      >
        {ui.backToHome}
      </Link>
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold [overflow-wrap:anywhere]">
          {doc.originalFilename}
        </h1>
        <DocumentStatusBadge status={doc.status} />
        <DeleteDocumentButton
          documentId={doc.id}
          fileName={doc.originalFilename}
          redirectTo="/"
        />
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
      {clinical !== null ? (
        <FindingsSection
          documentId={doc.id}
          findings={clinical.findings}
          reviews={reviews}
        />
      ) : null}
      {pageCount !== null && pageCount > 0 ? (
        <PdfViewer
          documentId={doc.id}
          pageCount={pageCount}
          initialPage={initialPage}
          pages={pages}
        />
      ) : (
        <p className="text-foreground/60">
          {pageCount === null ? ui.loading : ui.noPages}
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 6: Verify**

Run: `bunx turbo run typecheck --filter=@audit/web`
Expected: PASS.

Run: `bunx turbo run lint --filter=@audit/web --filter=@audit/lib`
Expected: PASS (no formatting/lint errors).

Run: `bun test apps/web`
Expected: PASS (existing + new helper/service tests).

Manual smoke (requires a running stack): start `docker compose up`, upload a PDF, wait for `ready`, confirm the Halazgos section renders, filter buttons change the list, `Ver página N` moves the PDF viewer, and `Revisado`/`Descartar`/note survive a page reload.

- [ ] **Step 7: Commit**

```bash
git add packages/lib/src/i18n/es.ts packages/lib/src/index.ts apps/web/components/findings-section.tsx apps/web/components/finding-card.tsx apps/web/components/pdf-viewer.tsx apps/web/app/documents/\[id\]/page.tsx
git commit -m "feat(web): render findings with review actions and evidence links"
```

---

### Task 7: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `bun run lint`
Expected: PASS.

Run: `bun run typecheck`
Expected: PASS.

Run: `bun run test`
Expected: PASS. DB repository tests SKIP unless `TEST_DATABASE_URL` is set; to exercise them, apply migrations (`bun run db:migrate` from `packages/db`) and set `TEST_DATABASE_URL`, then re-run `bun test packages/db/src/repositories/finding-reviews.test.ts`.

- [ ] **Step 2: Confirm spec coverage**

Re-read `docs/superpowers/specs/2026-09-17-findings-review-ui-design.md` §4–§9 and confirm each is implemented:
- stable ids (§4) → Task 1 + Task 3
- schema/repo (§5) → Task 2
- container/action/API (§5) → Task 5
- UI/filter/counts/note (§6) → Task 4 + Task 6
- evidence navigation (§7) → Task 6
- error handling (§8) → Task 4 + Task 5 + Task 6
- tests (§9) → each task

- [ ] **Step 3: Commit any fixes**

If a task required a fix during verification, commit it:

```bash
git add -A
git commit -m "fix(web): address findings review verification findings"
```

---

## Follow-ups (not part of this plan)

- Prune `findings_review` rows whose `finding_id` no longer exists.
- Slice B (full clinical record view), C (timeline), D (summaries), E (audit rules), F (chat), G (lifecycle/hardening).
- Move findings into the spec §10 left-nav shell once navigation exists.
