import type { ClinicalRecord, Finding } from "@audit/domain";

type UnknownRecord = Record<string, unknown>;

export class ProvenanceError extends Error {
  constructor() {
    super("Provenance stamping left an empty document id");
    this.name = "ProvenanceError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSource(value: UnknownRecord): boolean {
  return "documentId" in value && "pageNumber" in value;
}

function collectSourceDocumentIds(value: unknown, ids: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceDocumentIds(item, ids);
    return;
  }
  if (!isRecord(value)) return;
  if (isSource(value) && typeof value.documentId === "string") {
    ids.push(value.documentId);
    return;
  }
  for (const child of Object.values(value))
    collectSourceDocumentIds(child, ids);
}

function assertStamped(value: unknown): void {
  const ids: string[] = [];
  collectSourceDocumentIds(value, ids);
  if (ids.some((id) => id.length === 0)) throw new ProvenanceError();
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
  const stamped = stampValue(record, documentId) as ClinicalRecord;
  assertStamped(stamped);
  return stamped;
}

export function stampFindingProvenance(
  findings: Finding[],
  documentId: string,
): Finding[] {
  const stamped = stampValue(findings, documentId) as Finding[];
  assertStamped(stamped);
  return stamped;
}
