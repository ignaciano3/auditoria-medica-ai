import type { ClinicalRecord, DocumentPage, Finding } from "@audit/domain";

export const EXTRACTION_SYSTEM_PROMPT = [
  "You extract structured clinical information from Spanish medical documents.",
  "Follow these rules strictly:",
  "1. Only extract information that is explicitly supported by the provided source text.",
  "2. Never invent missing information. Omit anything you cannot support.",
  "3. Preserve exact source references: every extracted value must cite the page number and the exact supporting quote.",
  "4. Preserve dates exactly as written whenever possible; do not normalize or reinterpret them.",
  "5. Distinguish documented facts from interpretations and record only documented facts.",
  "6. If two parts of the document contradict each other, preserve both pieces of information.",
  "7. Do not resolve contradictions automatically.",
  "8. Do not make a medical diagnosis that is not documented.",
  "9. Do not recommend treatment.",
  "10. Return structured data as strict JSON matching the requested shape.",
  "11. Extract information from Spanish medical documents.",
  "12. Write all generated content in Spanish.",
  "Reply with JSON only. Do not add markdown fences or commentary.",
].join("\n");

const EXTRACTION_OUTPUT_SHAPE = [
  "Return a single JSON object with this shape:",
  "{",
  '  "patient": { "name"?: extractedString, "age"?: extractedNumber, "sex"?: extractedString, "birthDate"?: extractedString },',
  '  "hospitalization": { "admissionDate"?: extractedString, "dischargeDate"?: extractedString, "reason"?: extractedString, "diagnoses": extractedString[], "dischargeDiagnosis"?: extractedString, "admissionDateConflicts": extractedString[], "dischargeDateConflicts": extractedString[] },',
  '  "history": { "pathological": extractedString[], "allergies": extractedString[], "usualMedications": medication[] },',
  '  "medications": medication[],',
  '  "laboratory": labResult[],',
  '  "studies": study[],',
  '  "microbiology": microbiologyResult[],',
  '  "clinicalEvents": clinicalEvent[],',
  '  "discharge"?: { "date"?: extractedString, "conditionAtDischarge"?: extractedString, "diagnosis"?: extractedString, "treatment"?: extractedString, "instructions"?: extractedString, "warningSigns"?: extractedString, "followUp"?: extractedString }',
  "}",
  'where extractedString = { "value": string, "confidence"?: number, "sources": source[] }, extractedNumber = { "value": number, "confidence"?: number, "sources": source[] }, and source = { "documentId": string, "pageNumber": number, "text": string }.',
  'Use an empty string for "documentId" when no document identifier is provided with the page.',
  'medication = { "name": extractedString, "dose"?: extractedString, "route"?: extractedString, "frequency"?: extractedString, "startDate"?: extractedString, "endDate"?: extractedString, "status"?: "active" | "stopped" | "unknown", "sources": source[] }.',
  'labResult = { "date"?: extractedString, "name": extractedString, "value": extractedString, "unit"?: extractedString, "referenceRange"?: extractedString, "sources": source[] }.',
  'study = { "date"?: extractedString, "type": extractedString, "indication"?: extractedString, "result"?: extractedString, "sources": source[] }.',
  'microbiologyResult = { "date"?: extractedString, "sample"?: extractedString, "organism"?: extractedString, "result"?: extractedString, "sensitivity"?: extractedString, "sources": source[] }.',
  'clinicalEvent = { "date"?: string, "type": "admission" | "diagnosis" | "laboratory" | "imaging" | "microbiology" | "medication_start" | "medication_change" | "medication_stop" | "clinical_evolution" | "procedure" | "discharge" | "other", "description": string, "sources": source[] }.',
  "Omit unknown optional fields. Every extracted value and every list item must include at least one source.",
].join("\n");

export const EXTRACTION_CORRECTION_PROMPT = [
  "The previous answer was not valid JSON or did not match the required shape.",
  "Return the corrected result as strict JSON only, using the requested shape exactly.",
  "Do not add markdown fences or commentary.",
].join("\n");

function formatPage(page: DocumentPage): string {
  return [
    `<page pageNumber="${page.pageNumber}" docType="${page.docType}">`,
    page.text,
    "</page>",
  ].join("\n");
}

export function buildExtractionUserPrompt(pages: DocumentPage[]): string {
  return [
    "Extract the clinical record from these document pages only:",
    pages.map(formatPage).join("\n"),
    "",
    EXTRACTION_OUTPUT_SHAPE,
  ].join("\n");
}

export function buildExtractionCorrectionPrompt(): string {
  return EXTRACTION_CORRECTION_PROMPT;
}

export const ANALYSIS_SYSTEM_PROMPT = [
  "You analyze a structured clinical record and report potential audit findings in Spanish.",
  "Follow these rules strictly:",
  "1. Only report findings supported by the provided record; never invent information.",
  "2. Every finding must include an evidence array citing at least one source with documentId, pageNumber and the exact supporting quote.",
  "3. Use cautious language. Do not state that care was wrong or that an omission is proven.",
  "4. Do not make a medical diagnosis that is not documented and do not recommend treatment.",
  "5. If two parts of the record contradict each other, report the contradiction and keep both values.",
  "6. Write all user-facing text (title, explanation, recommendation) in Spanish.",
  "7. Set requiresHumanReview to true for every finding.",
  "Reply with a strict JSON array of findings only. Do not add markdown fences or commentary.",
].join("\n");

export const ANALYSIS_CORRECTION_PROMPT = [
  "The previous answer was not valid JSON or did not match the required findings shape.",
  "Return the corrected result as a strict JSON array only, with evidence for every finding.",
].join("\n");

export function buildAnalysisUserPrompt(record: ClinicalRecord): string {
  return [
    "Analyze this structured clinical record:",
    JSON.stringify(record, null, 2),
    "",
    "Return a JSON array of findings. Each finding must have this shape:",
    '{ "id": string, "severity": "high" | "medium" | "low" | "info", "category": "temporal" | "contradiction" | "medication" | "documentation" | "audit" | "other", "title": string, "explanation": string, "evidence": [{ "source": { "documentId": string, "pageNumber": number, "text": string }, "relevance": string }], "recommendation"?: string, "requiresHumanReview": true }',
    "If there are no findings, return an empty array.",
  ].join("\n");
}

export function buildAnalysisCorrectionPrompt(): string {
  return ANALYSIS_CORRECTION_PROMPT;
}

export const CLINICAL_SUMMARY_SYSTEM_PROMPT = [
  "You write a clinical summary in Spanish based only on the structured record provided.",
  "Never invent information. Do not make a diagnosis that is not documented and do not recommend treatment.",
  "Reference the source page numbers where relevant.",
].join("\n");

export function buildClinicalSummaryUserPrompt(record: ClinicalRecord): string {
  return [
    "Write a structured clinical summary in Spanish from this record:",
    JSON.stringify(record, null, 2),
    "Cover, when documented: patient, reason for admission, diagnoses, relevant history, evolution, studies, microbiology, treatment and discharge. Reference source page numbers.",
  ].join("\n");
}

export const AUDIT_SUMMARY_SYSTEM_PROMPT = [
  "You write an audit summary in Spanish based only on the structured record and findings provided.",
  "Clearly distinguish documented facts, detected inconsistencies, missing documentation and AI interpretation.",
  "Never invent information. Do not make a diagnosis that is not documented and do not recommend treatment.",
  "Reference the source page numbers where relevant.",
].join("\n");

export function buildAuditSummaryUserPrompt(
  record: ClinicalRecord,
  findings: Finding[],
): string {
  return [
    "Write an audit summary in Spanish from this record and these findings:",
    JSON.stringify(record, null, 2),
    "Findings:",
    JSON.stringify(findings, null, 2),
    "Cover: hospitalization duration, reason for hospitalization, major clinical events, major treatments, treatment changes, relevant studies, microbiology, documentation gaps, potential inconsistencies and items requiring human review. Clearly separate documented facts, detected inconsistencies, missing documentation and AI interpretation.",
  ].join("\n");
}
