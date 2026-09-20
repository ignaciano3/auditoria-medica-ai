import type { ClinicalRecord, Patient } from "./clinical-record.ts";
import { hospitalizationDurationDays } from "./dates.ts";
import type { Finding } from "./finding.ts";
import type { ExtractedValue } from "./source.ts";

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
  documentationGaps: Finding[];
  inconsistencies: Finding[];
};

export function buildAuditSummary(findings: Finding[]): AuditSummary {
  return {
    documentationGaps: findings.filter(
      (finding) => finding.category === "documentation",
    ),
    inconsistencies: findings.filter(
      (finding) => finding.category !== "documentation",
    ),
  };
}
