# Medical Audit AI — MVP Specification

## 1. Objective

Build an MVP web application that assists a medical auditor in reviewing clinical histories.

The application should allow the auditor to:

1. Upload a clinical history as a PDF.
2. Extract text from digital or scanned documents.
3. Convert the clinical information into a normalized structured representation.
4. Reconstruct the hospitalization chronologically.
5. Generate a clinical summary and an audit-oriented summary.
6. Detect possible inconsistencies and situations that require review.
7. Show the original evidence for every finding, including the page and relevant text.
8. Ask questions about the clinical history using natural language.

## 2. Important user-language requirement

The primary end user is a medical auditor who **only speaks Spanish**.

Therefore:

- All user-facing UI must be in Spanish.
- All buttons, navigation, labels, statuses, errors, notifications, summaries, findings, and chat responses must be in Spanish.
- AI-generated content shown to the auditor must be in Spanish.
- Medical terminology should remain appropriate for Spanish-speaking medical professionals.
- The internal codebase, type names, variable names, comments, documentation, and this specification may be in English.
- The system may use English internally for prompts or model instructions if useful, but the final output presented to the user must be Spanish.
- Do not require the auditor to understand English to use any part of the application.

Example UI labels:

- "Nueva historia"
- "Procesando"
- "Resumen"
- "Línea temporal"
- "Hallazgos"
- "Medicaciones"
- "Estudios"
- "Documento original"
- "Ver evidencia"
- "Revisado"
- "Descartar hallazgo"
- "Preguntarle a la historia clínica"

## 3. Core product principle

The application must NOT attempt to automatically determine that medical care was "correct" or "incorrect."

It should function as a **medical-audit copilot**.

The system should use wording such as:

- "Posible inconsistencia"
- "Requiere revisión"
- "Documentación insuficiente"
- "Información potencialmente contradictoria"
- "No se encontró evidencia suficiente"

It should not present an AI interpretation as a definitive medical conclusion.

Every important AI-generated claim must be traceable to the original documentation.

The auditor remains responsible for the final assessment.

---

# 4. MVP Scope

## Input

The MVP supports:

- One PDF per analysis.
- One clinical history / hospitalization per PDF.
- Documents in Spanish.
- Digital PDFs.
- Scanned PDFs.
- Images embedded in PDFs.

## Information to extract

### Patient

- Name, if available.
- Age.
- Sex.
- Date of birth, if available.

### Hospitalization

- Admission date.
- Discharge date.
- Reason for admission.
- Diagnoses.
- Discharge diagnosis, if available.

### Medical history

- Relevant medical history.
- Allergies.
- Usual medications.

### Medications

For each medication:

- Name.
- Dose, if available.
- Route, if available.
- Frequency, if available.
- Start date/time.
- Stop date/time.
- Changes.
- Documentary evidence.

### Laboratory

For each result:

- Date/time.
- Test name.
- Result.
- Unit.
- Reference range, if available.
- Documentary evidence.

### Studies

Examples:

- X-ray.
- CT.
- Ultrasound.
- MRI.
- Other studies.

For each study:

- Date.
- Type.
- Indication, if available.
- Report/result.
- Documentary evidence.

### Microbiology

- Sample type.
- Date.
- Organism.
- Result.
- Sensitivity / antibiogram, if available.
- Documentary evidence.

### Clinical evolution

- Date/time.
- Clinical event.
- Symptoms.
- Relevant signs.
- Treatment changes.
- Clinical evolution.
- Documentary evidence.

### Discharge

- Date.
- Condition at discharge.
- Diagnosis.
- Treatment prescribed.
- Instructions.
- Warning signs.
- Follow-up.

---

# 5. Architecture

Use a simple, modular architecture.

```text
                    ┌─────────────────┐
                    │   Next.js UI    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   API / Server  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        PostgreSQL      Object Storage     Queue
              │                             │
              │                             ▼
              │                    Document Processor
              │                             │
              │                    ┌────────┴────────┐
              │                    ▼                 ▼
              │                  OCR                LLM
              │                    │                 │
              │                    └────────┬────────┘
              │                             ▼
              │                    Structured Record
              │                             │
              │                    ┌────────┴────────┐
              │                    ▼                 ▼
              │              Rule Engine       AI Analysis
              │                    │                 │
              │                    └────────┬────────┘
              │                             ▼
              └────────────────────── Findings
```

## Suggested stack

Use TypeScript throughout.

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

Prefer Next.js server-side functionality for the MVP unless the existing repository already has a backend architecture.

### Database

- PostgreSQL
- Prisma or Drizzle

Use whichever ORM is already present in the repository. Do not introduce a second ORM.

### File storage

Use an S3-compatible abstraction.

The storage provider must be configurable through environment variables.

### Processing

Use a background-job abstraction if document processing can take significant time.

Do not block an HTTP request while processing a large PDF.

---

# 6. Repository-first implementation

Before writing code:

1. Inspect the existing repository.
2. Identify:
   - framework
   - package manager
   - database
   - authentication
   - existing UI components
   - existing storage implementation
   - existing API conventions
   - environment configuration
   - testing setup
3. Reuse existing infrastructure whenever possible.
4. Do not replace existing architecture unnecessarily.
5. Follow the repository's existing conventions.

Do not install large dependencies without first determining whether an existing dependency can perform the required functionality.

---

# 7. Domain model

Implement the domain independently from any specific LLM provider.

## Source

```typescript
type Source = {
  documentId: string;
  pageNumber: number;
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
```

Every extracted clinical fact should retain one or more sources.

---

# 8. Extracted values

Do not store important clinical information as raw values without provenance.

Use:

```typescript
type ExtractedValue<T> = {
  value: T;
  confidence?: number;
  sources: Source[];
};
```

Example:

```typescript
type Patient = {
  name?: ExtractedValue<string>;
  age?: ExtractedValue<number>;
  sex?: ExtractedValue<string>;
  birthDate?: ExtractedValue<string>;
};
```

The UI must be able to navigate from an extracted value back to its source.

---

# 9. ClinicalRecord

Create a central normalized representation.

```typescript
type ClinicalRecord = {
  patient: Patient;

  hospitalization: {
    admissionDate?: ExtractedValue<string>;
    dischargeDate?: ExtractedValue<string>;
    reason?: ExtractedValue<string>;
    diagnoses: ExtractedValue<string>[];
    dischargeDiagnosis?: ExtractedValue<string>;
  };

  history: {
    pathological: ExtractedValue<string>[];
    allergies: ExtractedValue<string>[];
    usualMedications: Medication[];
  };

  medications: Medication[];

  laboratory: LabResult[];

  studies: Study[];

  microbiology: MicrobiologyResult[];

  clinicalEvents: ClinicalEvent[];

  discharge?: DischargeInformation;
};
```

Do not require fields that are absent from the source document.

Missing information must remain explicitly missing.

Never hallucinate values to complete the schema.

---

# 10. Medication

```typescript
type Medication = {
  name: ExtractedValue<string>;
  dose?: ExtractedValue<string>;
  route?: ExtractedValue<string>;
  frequency?: ExtractedValue<string>;

  startDate?: ExtractedValue<string>;
  endDate?: ExtractedValue<string>;

  status?: "active" | "stopped" | "unknown";

  sources: Source[];
};
```

---

# 11. Laboratory

```typescript
type LabResult = {
  date?: ExtractedValue<string>;
  name: ExtractedValue<string>;
  value: ExtractedValue<string>;
  unit?: ExtractedValue<string>;
  referenceRange?: ExtractedValue<string>;
  sources: Source[];
};
```

---

# 12. Study

```typescript
type Study = {
  date?: ExtractedValue<string>;
  type: ExtractedValue<string>;
  indication?: ExtractedValue<string>;
  result?: ExtractedValue<string>;
  sources: Source[];
};
```

---

# 13. Microbiology

```typescript
type MicrobiologyResult = {
  date?: ExtractedValue<string>;
  sample?: ExtractedValue<string>;
  organism?: ExtractedValue<string>;
  result?: ExtractedValue<string>;
  sensitivity?: ExtractedValue<string>;
  sources: Source[];
};
```

---

# 14. Clinical events

Create a normalized timeline.

```typescript
type ClinicalEventType =
  | "admission"
  | "diagnosis"
  | "laboratory"
  | "imaging"
  | "microbiology"
  | "medication_start"
  | "medication_change"
  | "medication_stop"
  | "clinical_evolution"
  | "procedure"
  | "discharge"
  | "other";

type ClinicalEvent = {
  date?: string;
  type: ClinicalEventType;
  description: string;
  sources: Source[];
};
```

Events must be sortable chronologically.

If a date is unknown, do not invent one.

---

# 15. Document processing pipeline

Implement this pipeline:

```text
PDF uploaded
    ↓
Document created
    ↓
PDF inspected
    ↓
Pages extracted
    ↓
Text extraction
    ↓
OCR for pages without usable text
    ↓
Page-level source representation
    ↓
LLM extraction
    ↓
ClinicalRecord
    ↓
Timeline generation
    ↓
Deterministic validation
    ↓
Semantic AI analysis
    ↓
Audit findings
    ↓
Summary generation
    ↓
Ready for review
```

The UI should show processing progress.

Suggested states:

```typescript
type DocumentStatus =
  | "uploaded"
  | "processing"
  | "extracting"
  | "analyzing"
  | "ready"
  | "error";
```

All user-facing labels for these states must be in Spanish.

---

# 16. OCR

The OCR implementation must preserve page boundaries.

Bad:

```text
entire_document_text
```

Preferred:

```typescript
type DocumentPage = {
  pageNumber: number;
  text: string;
  imageUrl?: string;
  blocks?: TextBlock[];
};
```

This is necessary for evidence navigation.

The OCR provider should be abstracted:

```typescript
interface OCRProvider {
  extractPages(file: Buffer): Promise<DocumentPage[]>;
}
```

Do not couple the domain layer to one OCR vendor.

---

# 17. LLM abstraction

Do not call OpenAI, Anthropic, or another provider directly throughout the application.

Create an abstraction:

```typescript
interface LLMProvider {
  extractClinicalRecord(
    pages: DocumentPage[]
  ): Promise<ClinicalRecord>;

  analyzeClinicalRecord(
    record: ClinicalRecord
  ): Promise<Finding[]>;

  generateClinicalSummary(
    record: ClinicalRecord
  ): Promise<string>;

  generateAuditSummary(
    record: ClinicalRecord,
    findings: Finding[]
  ): Promise<string>;
}
```

This should allow changing the model provider later.

The provider should be configurable.

---

# 18. Extraction rules

The extraction prompt must instruct the model:

1. Only extract information supported by the source.
2. Never invent missing information.
3. Preserve exact source references.
4. Preserve dates exactly when possible.
5. Distinguish documented facts from interpretations.
6. If two parts of the document contradict each other, preserve both pieces of information.
7. Do not resolve contradictions automatically.
8. Do not make a medical diagnosis that is not documented.
9. Do not recommend treatment.
10. Return structured data.
11. Extract information from Spanish medical documents.
12. Return user-facing generated content in Spanish.

---

# 19. Evidence

Every important generated claim must have evidence.

```typescript
type Evidence = {
  source: Source;
  relevance: string;
};
```

A finding must contain:

```typescript
type Finding = {
  id: string;

  severity: "high" | "medium" | "low" | "info";

  category:
    | "temporal"
    | "contradiction"
    | "medication"
    | "documentation"
    | "audit"
    | "other";

  title: string;

  explanation: string;

  evidence: Evidence[];

  recommendation?: string;

  requiresHumanReview: true;
};
```

`requiresHumanReview` should always be `true` in the MVP.

---

# 20. Deterministic validation engine

Create a rule engine separate from the LLM.

```typescript
interface AuditRule {
  id: string;
  name: string;
  description: string;

  evaluate(record: ClinicalRecord): Finding[];
}
```

Initially implement generic consistency rules.

## Rule 1 — Date consistency

Look for:

- medication start before admission;
- medication end before medication start;
- discharge before admission;
- events with impossible ordering;
- other obvious temporal inconsistencies.

Do not automatically classify these as errors.

Return:

> Possible temporal inconsistency. Review source documentation.

The user-facing Spanish version should be:

> Posible inconsistencia temporal. Revisar la documentación original.

---

## Rule 2 — Allergy / medication conflict

If a documented allergy appears to conflict with a documented medication, create a finding.

Do not state that the patient was necessarily exposed to the allergen if the document only contains a medication order.

Use cautious language.

---

## Rule 3 — Contradictory patient information

Look for conflicts such as:

- different ages;
- incompatible dates of birth;
- different sex;
- conflicting admission/discharge dates;
- contradictory diagnoses.

Preserve both sources.

---

## Rule 4 — Medication duplication

Look for medications that appear duplicated or simultaneously active in potentially conflicting ways.

This should produce a review finding rather than a clinical conclusion.

---

## Rule 5 — Unexplained medication changes

Identify medication changes and determine whether the surrounding documentation contains an explicit explanation.

This rule may use an LLM for semantic matching.

Output should be similar to:

> Medication change detected. No clear justification was identified in the available documentation.

Spanish user-facing equivalent:

> Se detectó un cambio de medicación. No se encontró una justificación clara en la documentación disponible.

Do not state that the medication change was clinically unjustified.

---

## Rule 6 — Missing documentation

Identify potentially expected information that is absent from the document.

Do not treat absence as proof that the event did not happen.

Use wording such as:

> The reviewed documentation does not contain a clear record of X.

Spanish user-facing equivalent:

> En la documentación revisada no se encontró un registro claro de X.

---

# 21. Audit rules must be configurable

Do not hard-code every future audit criterion into application logic.

Create a structure that allows future rules to be added.

```typescript
type AuditRuleDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: "high" | "medium" | "low" | "info";
  enabled: boolean;
};
```

The actual criteria for medical auditing should eventually be defined and validated by medical professionals.

The system must not invent audit criteria.

---

# 22. Clinical summary

Generate a structured summary containing:

## Patient

Basic documented information.

## Reason for admission

Why the patient was admitted according to the documentation.

## Diagnoses

Documented diagnoses.

## Relevant history

Medical history and allergies.

## Evolution

Chronological clinical evolution.

## Studies

Important studies and results.

## Microbiology

Important microbiological results.

## Treatment

Medications and relevant changes.

## Discharge

Documented discharge information.

Every important section should contain links/references to source pages.

All visible summary content must be in Spanish.

---

# 23. Audit summary

Generate a separate summary:

```text
Hospitalization duration

Reason for hospitalization

Major clinical events

Major treatments

Treatment changes

Relevant studies

Microbiology

Documentation gaps

Potential inconsistencies

Items requiring human review
```

The visible version must be in Spanish.

The audit summary must clearly distinguish:

- documented facts;
- detected inconsistencies;
- missing documentation;
- AI interpretation.

---

# 24. User interface

Create a desktop-first medical review interface.

The target user is a Spanish-speaking medical auditor with no need to understand English.

## Main layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Header                                                      │
├──────────────────┬──────────────────────────────────────────┤
│                  │                                          │
│ Navigation       │ Main content                             │
│                  │                                          │
│ Resumen          │ Summary                                  │
│ Línea temporal   │ Timeline                                 │
│ Medicaciones     │ Findings                                 │
│ Estudios         │                                          │
│ Hallazgos        │                                          │
│ Documento        │                                          │
│                  │                                          │
├──────────────────┴──────────────────────────────────────────┤
│ Optional PDF/document viewer                                │
└─────────────────────────────────────────────────────────────┘
```

---

# 25. Overview page

Display:

- patient information;
- admission date;
- discharge date;
- hospitalization duration;
- reason for admission;
- diagnoses;
- number of findings;
- severity distribution.

Example:

```text
Paciente
45 años · Masculino

Internación
13/02/2026 → 28/02/2026
15 días

Motivo
...

Hallazgos

4 elementos requieren revisión

2 medios
1 bajo
1 informativo
```

All UI text must be Spanish.

---

# 26. Timeline

Display clinical events chronologically.

Example:

```text
13/02
│
├── Ingreso
├── Diagnóstico
└── Inicio de medicación

15/02
│
└── Cambio de medicación

21/02
│
├── Laboratorio
├── Microbiología
└── Cambio de medicación

28/02
│
└── Egreso
```

Each event must be clickable.

Clicking an event should open the source document at the relevant page.

---

# 27. Findings

Each finding should look approximately like:

```text
┌──────────────────────────────────────────────┐
│ 🟠 Posible inconsistencia temporal            │
│                                              │
│ La medicación parece comenzar antes de la    │
│ fecha de ingreso.                            │
│                                              │
│ Evidencia                                    │
│ Página 1: fecha de ingreso 13/02             │
│ Página 4: inicio de medicación 12/02         │
│                                              │
│ [Ver página 1] [Ver página 4]                │
│                                              │
│ Requiere revisión humana                     │
└──────────────────────────────────────────────┘
```

The user must be able to:

- open evidence;
- mark a finding as reviewed;
- dismiss a finding;
- add a note.

For the MVP, dismissal/review status can be stored in the database.

---

# 28. PDF viewer

The PDF viewer should support:

- page navigation;
- zoom;
- page number;
- opening a specific page;
- highlighting evidence where feasible.

When a finding references page 12:

```text
[Ver evidencia]
```

must open page 12.

If bounding boxes are available, highlight the relevant text.

---

# 29. Chat

Add a simple chat interface over the analyzed clinical record.

Example questions:

- "¿Cuándo ingresó?"
- "¿Por qué estuvo internado?"
- "¿Qué antibióticos recibió?"
- "¿Cuándo cambió el tratamiento?"
- "¿Qué cultivos se realizaron?"
- "¿Cuáles fueron los resultados?"
- "¿Qué cosas debería revisar?"
- "¿Dónde aparece documentado X?"

The chat must use retrieval from the structured record and source pages.

Do not send the entire raw PDF to the model for every question.

---

# 30. Chat response requirements

Every factual answer should contain evidence when available.

Example:

> La documentación registra el inicio de levofloxacina el 15/02/2026.
>
> Fuente: página 5.

If evidence is insufficient:

> No encontré información suficiente en la documentación analizada para determinarlo.

Never hallucinate.

All responses shown to the auditor must be in Spanish.

---

# 31. Privacy and security

This application processes sensitive medical information.

Implement security from the beginning.

Requirements:

- authenticated access;
- authorization checks;
- encrypted transport;
- secure object storage;
- no clinical data in application logs;
- avoid sending patient identifiers to analytics services;
- configurable document retention;
- ability to delete documents;
- audit logging of access;
- tenant/user separation if multiple users are supported.

During development, use anonymized or synthetic records.

Before production use with real patient records, the system must be reviewed for applicable Argentine privacy, medical-secrecy, data-protection, hosting, and AI-processing requirements.

Do not claim regulatory compliance unless it has actually been established.

---

# 32. Analytics

Do not use generic analytics that could accidentally capture:

- patient names;
- clinical notes;
- diagnoses;
- medications;
- document contents.

If analytics are implemented, only record non-sensitive application events such as:

```text
document_uploaded
analysis_completed
finding_reviewed
finding_dismissed
```

without patient identifiers.

---

# 33. Error handling

The system must distinguish:

```text
Upload failed
OCR failed
LLM extraction failed
Validation failed
Analysis failed
Database failed
```

User-facing versions must be in Spanish.

Do not silently produce partial results that appear complete.

If extraction is incomplete:

> Análisis incompleto
>
> Algunas páginas no pudieron procesarse. Los resultados pueden estar incompletos.
>
> Páginas afectadas: 7, 8, 12.

---

# 34. Testing strategy

The most important part of the MVP is not UI testing; it is **clinical extraction and finding correctness**.

Create fixture documents with known expected outputs.

Tests should cover:

### Extraction

- admission date;
- discharge date;
- medications;
- allergies;
- diagnoses;
- laboratory;
- studies;
- microbiology;
- timeline events.

### Provenance

Every extracted field must have valid source information.

### Temporal validation

Test:

- valid chronology;
- invalid chronology;
- missing dates.

### Contradiction detection

Test conflicting information.

### Medication/allergy detection

Test both:

- genuine textual conflict;
- similar but non-conflicting medication names.

### Missing information

Ensure missing documentation is not interpreted as proof of absence.

### LLM failures

Test malformed/incomplete LLM output.

---

# 35. LLM output validation

Never trust raw LLM JSON.

Use schema validation.

Recommended:

```text
LLM
 ↓
JSON
 ↓
Zod/schema validation
 ↓
normalized domain model
```

If the output does not validate:

1. Attempt a controlled retry.
2. If still invalid, mark extraction as failed.
3. Never silently coerce medically relevant information.

---

# 36. Model abstraction

Do not optimize prematurely for one model.

The application should make the provider configurable:

```env
LLM_PROVIDER=...
LLM_MODEL=...
OCR_PROVIDER=...
OCR_MODEL=...
```

Keep model-specific code inside provider implementations.

Example:

```text
src/
  ai/
    providers/
      openai/
      anthropic/
      local/
    extraction/
    analysis/
    prompts/
```

The rest of the application should not care which provider is being used.

---

# 37. Suggested project structure

Adapt this to the existing repository rather than blindly replacing its structure.

```text
src/
  app/
    dashboard/
    documents/
    review/
    api/

  components/
    document-uploader/
    clinical-summary/
    timeline/
    findings/
    pdf-viewer/
    chat/

  domain/
    clinical-record/
    findings/
    audit-rules/

  ai/
    providers/
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
```

---

# 38. Development phases

Implement incrementally.

## Phase 1 — Repository + infrastructure

- Inspect repository.
- Reuse existing architecture.
- Configure database.
- Configure storage.
- Create document model.
- Create upload flow.

Acceptance criteria:

- User can upload a PDF.
- PDF is stored securely.
- Document status is visible in Spanish.

---

## Phase 2 — Document processing

Implement:

- page extraction;
- text extraction;
- OCR fallback;
- page-level storage;
- source references.

Acceptance criteria:

- Every processed page has a page number.
- Every page has extracted text when possible.
- OCR works for scanned pages.
- Original document remains available.

---

## Phase 3 — Clinical extraction

Implement:

- ClinicalRecord;
- LLM provider abstraction;
- structured extraction;
- schema validation;
- provenance.

Acceptance criteria:

- Uploaded document produces a ClinicalRecord.
- Missing information remains missing.
- Extracted information points to source pages.
- User-facing generated content is Spanish.

---

## Phase 4 — Timeline + summaries

Implement:

- clinical events;
- timeline;
- clinical summary;
- audit summary.

Acceptance criteria:

- Events are ordered chronologically.
- Clicking an event opens its source.
- Summary does not contain unsupported information.
- Visible content is Spanish.

---

## Phase 5 — Audit engine

Implement:

- deterministic rules;
- semantic LLM analysis;
- Finding model;
- evidence;
- severity;
- review state.

Initial rules:

1. temporal inconsistencies;
2. allergy/medication conflicts;
3. contradictory patient information;
4. medication duplication;
5. unexplained medication changes;
6. missing documentation.

Acceptance criteria:

- Every finding contains evidence.
- Findings are explicitly presented as requiring human review.
- The system never presents a finding as a definitive medical error.

---

## Phase 6 — Review UI

Implement:

- overview;
- findings;
- timeline;
- PDF viewer;
- evidence navigation;
- finding review/dismissal;
- notes.

Acceptance criteria:

A Spanish-speaking medical auditor can upload a document and navigate:

```text
Hallazgo
  ↓
Evidencia
  ↓
Página original
```

without needing technical knowledge or English.

---

## Phase 7 — Chat

Implement:

- question input;
- structured-record retrieval;
- source-aware responses;
- page references.

Acceptance criteria:

- Questions about the record receive grounded answers.
- Unsupported questions produce an explicit uncertainty response.
- Answers link back to evidence.
- All responses are in Spanish.

---

# 39. Definition of Done for MVP

The MVP is complete when a user can:

1. Log in.
2. Upload a clinical-history PDF.
3. Wait for processing.
4. See extracted patient/hospitalization information.
5. See a chronological timeline.
6. Read a clinical summary.
7. Read an audit-oriented summary.
8. See possible inconsistencies.
9. Open the source page for every finding.
10. Review/dismiss findings.
11. Ask questions about the history.
12. Receive source-grounded answers.
13. Delete the document.

All user-facing functionality must be usable entirely in Spanish.

The application should prioritize **traceability and correctness over the number of AI features**.

---

# 40. Important non-goals

The MVP must NOT:

- diagnose patients;
- recommend treatment;
- prescribe medication;
- automatically determine malpractice;
- automatically determine that a physician made an error;
- replace medical audit judgment;
- fabricate missing information;
- infer undocumented clinical facts;
- generate unsupported medical conclusions;
- make autonomous decisions about patient care.

---

# 41. Future roadmap

## V2

- Multiple documents per hospitalization.
- Multiple users.
- Organizations/tenants.
- Custom audit rules.
- Rule management UI.
- Exportable audit reports.
- DOCX/PDF report generation.

## V3

- Hospital/clinic integrations.
- FHIR/HL7 integration where appropriate.
- Structured EHR ingestion.
- Advanced document comparison.
- Historical patient episodes.
- Search across multiple hospitalizations.

## V4

- Organization-specific audit knowledge base.
- Internal protocols.
- Retrieval-augmented generation.
- Feedback-driven improvement.
- Human-reviewed finding datasets.
- Evaluation framework for model accuracy.

---

# 42. Product principle

The core product should not be:

> "AI reads medical records."

It should be:

> **"AI helps a medical auditor understand a medical record faster and identify what deserves human review, while showing exactly where each conclusion came from."**

The system should optimize for:

1. Traceability.
2. Accuracy.
3. Transparency.
4. Human review.
5. Privacy.
6. Useful reduction in audit time.

Do not optimize initially for autonomous decision-making.

---

# 43. First implementation task

Before implementing the complete product, create a technical plan based on the existing repository.

Inspect the codebase and determine:

- existing framework;
- package manager;
- database;
- authentication;
- storage;
- UI component library;
- existing API structure;
- testing framework;
- deployment environment.

Then propose the smallest set of changes required to implement **Phase 1 through Phase 3**.

Do not implement the entire roadmap at once.

After the repository analysis, implement incrementally and keep the application runnable after each phase.

## Final instruction to the coding agent

Do not assume that the medical rules, clinical criteria, or audit standards in this document are authoritative medical guidelines.

The system architecture should make it possible for a qualified medical professional to define, review, modify, and validate audit rules.

When uncertain, preserve the source information and flag it for human review rather than inventing an interpretation.
