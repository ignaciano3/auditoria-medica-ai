import type { ClinicalRecord, Finding } from "@audit/domain";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSource(value: UnknownRecord): boolean {
  return "documentId" in value && "pageNumber" in value;
}

function stampValue(value: unknown, documentId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stampValue(item, documentId));
  }
  if (!isRecord(value)) return value;
  if (isSource(value)) return { ...value, documentId };
  const stamped: UnknownRecord = {};
  for (const [key, child] of Object.entries(value)) {
    stamped[key] = stampValue(child, documentId);
  }
  return stamped;
}

export function stampProvenance(
  record: ClinicalRecord,
  documentId: string,
): ClinicalRecord {
  return stampValue(record, documentId) as ClinicalRecord;
}

export function stampFindingProvenance(
  findings: Finding[],
  documentId: string,
): Finding[] {
  return stampValue(findings, documentId) as Finding[];
}
