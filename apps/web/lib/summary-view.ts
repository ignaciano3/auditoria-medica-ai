import type { ClinicalSummary } from "@audit/domain";
import { summary } from "@audit/lib/i18n";

export function durationText(days: number | undefined): string | undefined {
  return days === undefined ? undefined : summary.durationDays(days);
}

export function hasClinicalSummaryContent(clinical: ClinicalSummary): boolean {
  return (
    clinical.patient.name !== undefined ||
    clinical.patient.age !== undefined ||
    clinical.patient.sex !== undefined ||
    clinical.patient.birthDate !== undefined ||
    clinical.admissionDate !== undefined ||
    clinical.dischargeDate !== undefined ||
    clinical.durationDays !== undefined ||
    clinical.reason !== undefined ||
    clinical.diagnoses.length > 0
  );
}
