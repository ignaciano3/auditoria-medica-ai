import type {
  ClinicalRecord,
  LabResult,
  Medication,
  Source,
} from "@audit/domain";

export function displayValue(
  value: string | number | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

export function isPlaceholderValue(value: string): boolean {
  const text = value.trim();
  if (text === "") return false;
  return !/[\p{L}\p{N}]/u.test(text);
}

export function medicationItemKey(
  medication: Medication,
  index: number,
): string {
  return `${displayValue(medication.name.value) ?? "medication"}-${index}`;
}

export function labResultItemKey(result: LabResult, index: number): string {
  return `${displayValue(result.name.value) ?? "lab"}-${displayValue(result.value.value) ?? ""}-${index}`;
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
