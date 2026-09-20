import type {
  ClinicalEventType,
  ClinicalRecord,
  Medication,
  MicrobiologyResult,
  Patient,
  Study,
} from "./clinical-record.ts";
import { hospitalizationDurationDays } from "./dates.ts";
import type { Finding } from "./finding.ts";
import type { ExtractedValue } from "./source.ts";
import { buildTimeline, type TimelineEntry } from "./timeline.ts";

export type ClinicalSummary = {
  patient: Patient;
  admissionDate?: ExtractedValue<string>;
  dischargeDate?: ExtractedValue<string>;
  durationDays?: number;
  reason?: ExtractedValue<string>;
  diagnoses: ExtractedValue<string>[];
};

export function buildClinicalSummary(record: ClinicalRecord): ClinicalSummary {
  const { patient, hospitalization } = record;
  const durationDays = hospitalizationDurationDays(
    hospitalization.admissionDate?.value,
    hospitalization.dischargeDate?.value,
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
