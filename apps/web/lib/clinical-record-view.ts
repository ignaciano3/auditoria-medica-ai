import type {
  ClinicalRecord,
  LabResult,
  Medication,
  MicrobiologyResult,
  Source,
  Study,
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

export function foldText(value: string | undefined): string | undefined {
  const text = displayValue(value);
  if (text === undefined) return undefined;
  const folded = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return folded === "" ? undefined : folded;
}

export type MedicationGroup = {
  name: string | undefined;
  medications: Medication[];
};

export function groupMedications(medications: Medication[]): MedicationGroup[] {
  const groups: MedicationGroup[] = [];
  const named = new Map<string, MedicationGroup>();

  for (const medication of medications) {
    const name = displayValue(medication.name.value);
    const key = foldText(name);
    if (key === undefined) {
      groups.push({ name, medications: [medication] });
      continue;
    }
    let group = named.get(key);
    if (group === undefined) {
      group = { name, medications: [] };
      named.set(key, group);
      groups.push(group);
    }
    group.medications.push(medication);
  }

  return groups;
}

export function medicationGroupItemKey(
  group: MedicationGroup,
  index: number,
): string {
  return `${group.name ?? "medication"}-${index}`;
}

export function labResultItemKey(result: LabResult, index: number): string {
  return `${displayValue(result.name.value) ?? "lab"}-${displayValue(result.value.value) ?? ""}-${index}`;
}

export function diagnosisItemKey(
  value: string | undefined,
  index: number,
): string {
  return `${displayValue(value) ?? "diagnosis"}-${index}`;
}

export function historyEntryItemKey(
  label: string,
  value: string | undefined,
  index: number,
): string {
  return `${label}-${displayValue(value) ?? "entry"}-${index}`;
}

export function studyItemKey(study: Study, index: number): string {
  return `${displayValue(study.type.value) ?? "study"}-${index}`;
}

export function microbiologyItemKey(
  result: MicrobiologyResult,
  index: number,
): string {
  return `${displayValue(result.organism?.value ?? result.sample?.value) ?? "micro"}-${index}`;
}

export function dateConflictItemKey(
  value: string | undefined,
  index: number,
): string {
  return `${displayValue(value) ?? "conflict"}-${index}`;
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
    usualMedications: groupMedications(record.history.usualMedications).length,
    medications: groupMedications(record.medications).length,
    laboratory: record.laboratory.length,
    studies: record.studies.length,
    microbiology: record.microbiology.length,
  };
}
