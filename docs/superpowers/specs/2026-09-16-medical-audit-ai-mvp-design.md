# Medical Audit AI — MVP Technical Design

Date: 2026-09-16
Source spec: `MEDICAL_AUDIT_AI_MVP_SPEC.md`
Status: Approved design (pre-implementation plan)

## 1. Purpose

This document defines the technical design for the Medical Audit AI MVP. It
turns the product spec into concrete architectural decisions, fills the gaps
the spec leaves open, and records decisions made during brainstorming with the
project owner. It is the input to the implementation plan created by the
`writing-plans` skill.

The product is a **medical-audit copilot** for a Spanish-speaking auditor. It
does not diagnose, does not judge care as correct/incorrect, and never presents
an AI interpretation as a definitive conclusion. Every important claim must be
traceable to the original document.

## 2. Confirmed decisions

These were decided with the project owner during brainstorming:

| Area | Decision |
|---|---|
| Hosting | Self-hosted on the owner's Ubuntu server via **Docker Compose**. Everything runs locally except LLM calls. |
| LLM provider | **OpenAI** is the first implementation behind a provider abstraction. Provider/model configurable via env. |
| OCR | **Vision-capable OpenAI model** transcribes scanned/image pages. OCR is abstracted behind `OCRProvider`. |
| Auth | **No authentication for the MVP.** Network/reverse-proxy is the only protection. `userId` is still stored on rows for future multi-user. |
| Processing model | Single repo, one image, two processes (`web` + `worker`), background jobs via **pg-boss** (Postgres-backed queue). No Redis. |
| ORM | **Drizzle** (TypeScript-first) with PostgreSQL. |
| Extraction | **Map-reduce**: classify pages, extract per chunk, merge deterministically. |
| Handwritten flowsheets | **Skipped with a reason**, not extracted cell-by-cell. |
| Chat retrieval | **Keyword/BM25 over page text + structured-record lookup.** No embeddings at MVP. |
| Time coverage | Full MVP (Phase 1–7 of the spec) is designed; execution is phased so the app stays runnable after every phase. |
| Scaffolding | Use the **official scaffolders/CLIs** (`bun create next-app`, `shadcn` init, Drizzle init, etc.) to generate files and current dependency versions. Do not hand-write `package.json`, lockfiles, or framework config from memory. |

## 3. Findings from the real example document

The owner supplied `auditoria-ejemplo.pdf`, a real 110-page Argentine hospital
packet. Analysis changed several spec assumptions and informed the design:

- **110 pages, zero text layer.** Every page is a raster scan; PDF embedded-text
  extraction returns nothing. All page text must come from vision OCR.
- **Heterogeneous page types** in one packet:
  - typed clinical notes: `EPICRISIS`, `INGRESO GUARDIA EXTERNA`,
    `EVOLUCION CLINICA MEDICA`, `EVOLUCIÓN UTI`;
  - typed service reports: `Servicio de Diagnóstico por Imágenes`;
  - handwritten records: `ALERGIA A PENICILINA` medication-administration
    checklist, `PLANILLAS DE CONTROLES - BALANCES HIDRICO` (fluid balance /
    vitals flowsheets), `Evolución de Enfermería` nursing notes.
- **Lab values and antibiograms are inline in UTI note tables** (e.g. a
  bacteriology/antibióticos grid listing `Proteus mirabilis`), not in separate
  lab documents.
- **A repeating identity header** (patient name, age, plan, bed, admission
  date, `N° INTERNACIÓN`) appears on nearly every page.
- **Date formats vary**: `dd/mm/yyyy`, `dd/mm/yy`, and bare `dd/mm`; shorthand
  like `FI: 15/02`, `FF: 14/02`.
- **Handwritten flowsheets dominate many pages** and are low-yield,
  hallucination-prone tabular data. Extracting every cell is impractical and
  costly.

Consequences: the pipeline is **classify → map → reduce**, not a single
extraction call; a page classifier gates cost; handwritten flowsheets are
recorded as skipped; date normalization is a first-class utility.

### 3.1 Privacy incident

`auditoria-ejemplo.pdf` contains real patient and physician identifiers and was
committed to git (commit `f7ac61d`) with a GitHub remote configured. This
contradicts spec §31 ("use anonymized or synthetic records during development").
Mitigation is part of P0 (see §10): remove from the index, add to `.gitignore`,
purge from history, and use a de-identified copy for any committed fixture. The
real file stays local-only.

## 4. Runtime and infrastructure

One Bun + TypeScript repository, one Docker image, two process entrypoints:

- `web` — Next.js (App Router): UI + server-side API. Enqueues jobs; never
  processes documents inline.
- `worker` — same codebase, different entrypoint. Polls pg-boss and runs the
  document pipeline.

`docker compose up` starts:

| Service | Purpose | Notes |
|---|---|---|
| `postgres` | Application data + pg-boss queue tables | Named volume |
| `minio` | S3-compatible object storage | Named volume; private bucket |
| `web` | UI + API | Depends on postgres, minio |
| `worker` | Document processing | Same image as `web` |

No Redis. No cloud dependencies except the LLM/OCR provider calls.

**Storage abstraction.** `StorageProvider` interface with an S3 implementation
(MinIO locally, any S3-compatible provider later). Configurable via `S3_*` env
vars. Original PDFs and rendered page images are stored here; the domain never
reads raw bytes from disk.

**Configuration** via `.env` (see `.env.example`): `LLM_PROVIDER`, `LLM_MODEL`,
`OCR_PROVIDER`, `OCR_MODEL`, `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `OPENAI_API_KEY`, retention settings.

**Progress model.** Pipeline steps write `documents.status` and per-page
`PageStatus`. The UI polls (`~2s`) and renders Spanish labels. Status values
follow spec §15 (`uploaded`, `processing`, `extracting`, `analyzing`, `ready`,
`error`) plus page-level detail.

## 5. Document processing pipeline

Stages, each with status + retry and a Spanish label:

```text
upload → store original → inspect → render page images → classify pages
  → OCR(text pages) / Vision transcribe(scanned) → map-extract
  → reduce/merge → timeline → deterministic rules → semantic AI analysis
  → summaries → ready
```

- **Store original**: upload PDF to object storage; create `documents` row
  (`uploaded`).
- **Inspect**: page count and PDF metadata (mupdf, already validated in
  brainstorming).
- **Render**: every page to an image at fixed DPI; store under a
  document-scoped key. Serves both vision transcription and the PDF viewer.
- **Classify** (vision, low cost): per page → `docType`, `handwritten`,
  `dataBearing`. Persisted on `document_pages`. Gates downstream cost.
- **Extract text**: digital pages use embedded text if usable; otherwise the
  vision provider transcribes the page image. Handwritten flowsheets are marked
  `skipped` with a reason instead of transcription.
- **Map-extract**: group pages into chunks (e.g. 3–5 typed pages, or one
  clinical note) capped by token budget. Each call returns a **partial**
  `ClinicalRecord` where every value carries `Source` metadata
  (`documentId`, `pageNumber`, `text`, optional `boundingBox`).
- **Reduce**: deterministic merge — dedupe identical facts, union sources,
  **never overwrite contradictory values** (both are kept for contradiction
  rules).
- **Validate**: every LLM JSON payload is validated with Zod. On failure: one
  controlled retry, then mark extraction failed with affected page numbers.
  Never silently coerce medically relevant information.
- **Date normalization**: standalone utility handling `dd/mm/yyyy`,
  `dd/mm/yy`, bare `dd/mm` (year inferred from document context), and ranges;
  used by the timeline and temporal rules.

The UI must show processing progress; an incomplete analysis must be labelled
"Análisis incompleto" with affected pages, never presented as complete.

## 6. Domain model and database

### 6.1 Types

The domain types follow spec §7–§14 verbatim: `Source`, `ExtractedValue<T>`,
`Patient`, `ClinicalRecord`, `Medication`, `LabResult`, `Study`,
`MicrobiologyResult`, `ClinicalEventType`, `ClinicalEvent`, `Evidence`,
`Finding`, `DocumentStatus`. Additions required by the real document:

```typescript
type DocumentPage = {
  pageNumber: number;
  text: string;
  imageKey?: string;
  docType: PageDocType;
  handwritten: boolean;
  dataBearing: boolean;
  blocks?: TextBlock[];
};

type PageStatus = "pending" | "text" | "vision" | "skipped" | "failed";
```

`PageDocType` is a closed enum (epicrisis, admission, evolution, imaging, lab,
microbiology, medsRecord, flowsheet, nursing, other) so classification results
are queryable and testable.

### 6.2 Persistence

Drizzle + PostgreSQL. Tables:

- `documents` — id, original key, status, page count, error, timestamps,
  `userId` (nullable, future).
- `document_pages` — document id, page number, text, image key, doc type,
  flags, page status, skip reason.
- `clinical_records` — document id, normalized `ClinicalRecord` as JSONB,
  `Finding[]` as JSONB, plus indexed extraction columns (`patient_name`,
  `admission_date`, `discharge_date`) for lists/search.
- `findings_review` — finding id, status (`pending|reviewed|dismissed`), note,
  timestamps.
- `chat_messages` — document id, role, content, cited page numbers, timestamp.
- `access_log` — actor, action, document id, timestamp (no clinical content).
- pg-boss internal tables.

`Source` values resolve to `documentId + pageNumber`; the extracted quote is
stored inside the JSON so evidence stays frozen even if reprocessing changes
page text.

## 7. AI abstraction

- `LLMProvider` interface exactly per spec §17: `extractClinicalRecord`,
  `analyzeClinicalRecord`, `generateClinicalSummary`, `generateAuditSummary`.
- `OCRProvider` interface per spec §16: `extractPages(file) → DocumentPage[]`.
- First implementations live under `ai/providers/openai/` and
  `documents/ocr/openai/`; provider-specific code (SDKs, prompts, image
  encoding, JSON mode) never leaks out.
- Prompts under `ai/prompts/` implement spec §18 extraction rules: extract only
  supported information, never invent, preserve sources and dates, keep
  contradictions, do not diagnose or recommend treatment, extract from Spanish
  documents, return Spanish user-facing content.
- All LLM outputs are schema-validated (Zod) before entering the domain model.

## 8. Audit engine

Deterministic rules and semantic AI analysis are separate layers.

- `audit/rules/` — each rule implements `AuditRule.evaluate(record): Finding[]`
  and is registered in an `AuditRuleRegistry` driven by
  `AuditRuleDefinition[]` (id, name, description, category, severity, enabled)
  per spec §21. Doctors can add/disable rules without editing engine logic.
- Initial rules (spec §20): (1) date consistency, (2) allergy/medication
  conflict, (3) contradictory patient information, (4) medication duplication,
  (5) unexplained medication changes (may call the LLM for semantic
  justification matching), (6) missing documentation.
- All findings set `requiresHumanReview: true` and use cautious Spanish copy
  exactly as specified (e.g. "Posible inconsistencia temporal. Revisar la
  documentación original."). Rules never state that care was wrong or that an
  omission is proven.
- The AI analysis layer adds findings, each Zod-validated and required to cite
  at least one `Source`; findings without evidence are dropped.
- Findings persist in the record JSONB with stable ids; review state is stored
  separately in `findings_review`.

## 9. Summaries and chat

- **Clinical summary** and **audit summary** are generated in Spanish from the
  structured record (not the raw PDF). The audit summary explicitly separates
  documented facts, detected inconsistencies, missing documentation, and AI
  interpretation (spec §23). Important sections carry page references.
- **Chat** uses retrieval over the structured record plus page text; it never
  sends the whole PDF. A lightweight retriever (BM25/keyword over
  `document_pages.text` plus typed lookup against record fields) builds a small
  grounded context. Every factual answer cites page numbers; unsupported
  questions return the exact Spanish fallback ("No encontré información
  suficiente en la documentación analizada para determinarlo.").

## 10. User interface

Next.js App Router + React + Tailwind + shadcn/ui. Desktop-first. Layout per
spec §24: header, left navigation (Resumen · Línea temporal · Medicaciones ·
Estudios · Hallazgos · Documento · Chat), main content, optional PDF pane.

All user-facing strings are Spanish, centralized in one `es` copy module so no
English leaks into the UI (no i18n framework at MVP).

- **Overview** (spec §25): patient, admission → discharge, duration, reason,
  diagnoses, finding counts by severity.
- **Timeline** (spec §26): events grouped chronologically; clicking an event
  opens the PDF at the relevant page.
- **Findings** (spec §27): severity badge, cautious text, evidence list with
  `[Ver página N]`, plus `Revisado`, `Descartar`, and add-note actions
  persisted to `findings_review`.
- **PDF viewer** (spec §28): page navigation, zoom, current page, jump-to-page;
  evidence clicks open the page and highlight the quote/bounding box when
  available.
- **Chat** (spec §29): Spanish Q&A grounded in the record, with page citations.

## 11. Privacy, security, and operations

- **PHI**: `.gitignore` the real PDF and all `*.pdf`; commit a **de-identified**
  fixture instead; purge the committed PDF from git history. No clinical text
  in logs (log ids, statuses and page numbers only). Private storage bucket.
- **Retention/delete**: configurable retention plus an endpoint that deletes the
  original, page images, record, findings and chat for a document.
- **Transport**: documented reverse-proxy TLS profile (e.g. Caddy) in front of
  `web`. Since the MVP has no auth, network/reverse-proxy is the only access
  control and must be documented clearly as such.
- **Access log**: `access_log` records who/what/when for document access,
  without clinical content.
- **No analytics** capturing identifiers or clinical data (spec §32); only
  non-sensitive events if any.
- **Ops**: compose file with healthchecks, `.env.example`, and a README run book
  for the Ubuntu server.

## 12. Testing strategy

Bun test. The priority is clinical extraction and finding correctness, not UI.

- **Unit**: date normalization (`dd/mm/yyyy`, `dd/mm/yy`, bare `dd/mm`, ranges),
  reduce/merge (dedupe + contradiction preservation), Zod validation and the
  retry/fail path, every deterministic rule (valid/invalid/missing chronology,
  contradicting identity, real vs similar-name med/allergy non-conflict,
  "missing ≠ proof").
- **Pipeline**: a committed **de-identified fixture** with expected outputs for
  extraction, provenance (every field has a valid source), timeline ordering,
  and finding detection. LLM calls are mocked behind `LLMProvider` for
  deterministic, free CI.
- **Integration** (opt-in): a separate test hits the real provider and is not
  part of the default run.
- **Failure paths**: malformed/incomplete LLM output, retry then fail,
  incomplete-analysis labelling.

## 13. Repository layout

Adapted from spec §37 to a single Bun/Next app:

```text
src/
  app/                      # Next.js routes (dashboard, documents, review, api)
  components/               # uploader, clinical-summary, timeline, findings, pdf-viewer, chat
  domain/                   # clinical-record, findings, audit-rules types + logic
  ai/
    providers/openai/
    extraction/
    analysis/
    prompts/
  documents/
    ingestion/
    ocr/
    parsing/
  audit/
    rules/
    engine/
  db/
    schema/
    repositories/
  lib/
    validation/
    storage/
    dates/
  worker/                   # worker entrypoint
```

## 14. Phased execution

The app must stay runnable after each phase.

- **P0 — scaffold & safety.** Generate the app with the **official scaffolders
  and current package versions** (`bun create next-app`, `shadcn` init, Drizzle
  init) rather than hand-written files; add Tailwind + shadcn + Drizzle +
  compose; `.gitignore` PHI and purge the committed PDF; `.env.example`;
  `/health` placeholder in Spanish. Verify the scaffolded app boots before
  adding any custom code.
- **P1 — upload & storage.** Document model, MinIO storage, upload flow,
  pg-boss, Spanish status UI.
- **P2 — processing.** Page render, classify, OCR/vision transcription, page
  persistence, PDF viewer.
- **P3 — clinical extraction.** Map-reduce extraction, Zod validation,
  provenance, `ClinicalRecord` view.
- **P4 — timeline & summaries.** Clinical events/timeline, clinical summary,
  audit summary.
- **P5 — audit engine.** Deterministic rules + AI analysis + `Finding` model.
- **P6 — review UI.** Evidence navigation, PDF viewer polish, review/dismiss/
  note.
- **P7 — chat & lifecycle.** Grounded Spanish chat, delete/retention.
- **P8 — hardening.** Tests, PHI/logging audit, TLS run book, docs.

## 15. Non-goals (unchanged from spec §40)

The MVP must not diagnose, recommend or prescribe treatment, determine
malpractice or physician error, replace audit judgment, fabricate or infer
undocumented facts, or generate unsupported medical conclusions.

## 16. Open questions

None blocking. Items intentionally deferred: embeddings-based retrieval,
multi-user/organizations, import of multiple documents per hospitalization,
and exportable reports (spec §41 V2/V3).
