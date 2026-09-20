import type { ClinicalSummary } from "@audit/domain";
import { summary } from "@audit/lib/i18n";

export function durationText(days: number | undefined): string | undefined {
  return days === undefined ? undefined : summary.durationDays(days);
}

export function hasClinicalSummaryContent(clinical: ClinicalSummary): boolean {
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
