import { describe, expect, test } from "bun:test";
import type { Finding, Source } from "@audit/domain";
import { emptyClinicalRecord } from "./map-extract.ts";
import { stampFindingProvenance, stampProvenance } from "./stamp-provenance.ts";

const emptySource = (pageNumber: number, text: string): Source => ({
  documentId: "",
  pageNumber,
  text,
});

function collectDocumentIds(value: unknown): string[] {
  if (Array.isArray(value))
    return value.flatMap((item) => collectDocumentIds(item));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const own =
      typeof record.documentId === "string" ? [record.documentId] : [];
    return [
      ...own,
      ...Object.values(record).flatMap((child) => collectDocumentIds(child)),
    ];
  }
  return [];
}

function fullRecord() {
  const record = emptyClinicalRecord();
  record.patient.name = { value: "Ana", sources: [emptySource(1, "Ana")] };
  record.patient.age = { value: 60, sources: [emptySource(1, "60")] };
  record.patient.sex = { value: "F", sources: [emptySource(1, "F")] };
  record.patient.birthDate = {
    value: "01/01/1966",
    sources: [emptySource(1, "1966")],
  };
  record.hospitalization.admissionDate = {
    value: "13/02/2026",
    sources: [emptySource(1, "ingreso")],
  };
  record.hospitalization.dischargeDate = {
    value: "20/02/2026",
    sources: [emptySource(2, "alta")],
  };
  record.hospitalization.reason = {
    value: "Dolor torácico",
    sources: [emptySource(1, "dolor")],
  };
  record.hospitalization.diagnoses = [
    { value: "Sepsis", sources: [emptySource(1, "sepsis")] },
  ];
  record.hospitalization.dischargeDiagnosis = {
    value: "Mejoría",
    sources: [emptySource(2, "mejoria")],
  };
  record.hospitalization.admissionDateConflicts = [
    { value: "14/02/2026", sources: [emptySource(3, "conflicto")] },
  ];
  record.hospitalization.dischargeDateConflicts = [
    { value: "21/02/2026", sources: [emptySource(3, "conflicto")] },
  ];
  record.history.pathological = [
    { value: "HTA", sources: [emptySource(1, "hta")] },
  ];
  record.history.allergies = [
    { value: "Penicilina", sources: [emptySource(1, "alergia")] },
  ];
  record.history.usualMedications = [
    {
      name: { value: "Enalapril", sources: [emptySource(1, "enalapril")] },
      sources: [emptySource(1, "enalapril")],
    },
  ];
  record.medications = [
    {
      name: { value: "Paracetamol", sources: [emptySource(1, "para")] },
      dose: { value: "1 g", sources: [emptySource(1, "para")] },
      sources: [emptySource(1, "para")],
    },
  ];
  record.laboratory = [
    {
      name: { value: "Leucocitos", sources: [emptySource(1, "leu")] },
      value: { value: "12", sources: [emptySource(1, "leu")] },
      sources: [emptySource(1, "leu")],
    },
  ];
  record.studies = [
    {
      type: { value: "Radiografía", sources: [emptySource(2, "rx")] },
      sources: [emptySource(2, "rx")],
    },
  ];
  record.microbiology = [
    {
      organism: { value: "E. coli", sources: [emptySource(3, "micro")] },
      sources: [emptySource(3, "micro")],
    },
  ];
  record.clinicalEvents = [
    {
      type: "admission",
      description: "Ingreso",
      sources: [emptySource(1, "ingreso")],
    },
  ];
  record.discharge = {
    date: { value: "20/02/2026", sources: [emptySource(2, "alta")] },
  };
  return record;
}

describe("stampProvenance", () => {
  test("stamps the job document id on every source", () => {
    const stamped = stampProvenance(fullRecord(), "job-1");

    const ids = collectDocumentIds(stamped);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === "job-1")).toBe(true);
    expect(ids.includes("")).toBe(false);
  });

  test("does not mutate the input record", () => {
    const record = fullRecord();
    stampProvenance(record, "job-1");
    expect(record.patient.name?.sources[0]?.documentId).toBe("");
    expect(record.medications[0]?.sources[0]?.documentId).toBe("");
  });
});

describe("stampFindingProvenance", () => {
  test("stamps the job document id on every evidence source", () => {
    const findings: Finding[] = [
      {
        id: "f1",
        severity: "high",
        category: "contradiction",
        title: "Título",
        explanation: "Explicación",
        evidence: [
          { source: emptySource(2, "a"), relevance: "r1" },
          { source: emptySource(3, "b"), relevance: "r2" },
        ],
        requiresHumanReview: true,
      },
    ];

    const stamped = stampFindingProvenance(findings, "job-1");

    expect(stamped[0]?.evidence[0]?.source.documentId).toBe("job-1");
    expect(stamped[0]?.evidence[1]?.source.documentId).toBe("job-1");
    expect(findings[0]?.evidence[0]?.source.documentId).toBe("");
  });
});
