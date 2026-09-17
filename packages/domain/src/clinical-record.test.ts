import { describe, expect, test } from "bun:test";
import { clinicalRecordSchema } from "./clinical-record.ts";
import { findingSchema } from "./finding.ts";

describe("clinicalRecordSchema", () => {
  test("accepts an empty record with provenance-carrying fields", () => {
    const record = {
      patient: {},
      hospitalization: { diagnoses: [] },
      history: { pathological: [], allergies: [], usualMedications: [] },
      medications: [],
      laboratory: [],
      studies: [],
      microbiology: [],
      clinicalEvents: [],
    };
    expect(() => clinicalRecordSchema.parse(record)).not.toThrow();
  });

  test("rejects a value without sources", () => {
    const record = {
      patient: { name: { value: "X", sources: [] } },
      hospitalization: { diagnoses: [] },
      history: { pathological: [], allergies: [], usualMedications: [] },
      medications: [],
      laboratory: [],
      studies: [],
      microbiology: [],
      clinicalEvents: [],
    };
    expect(() => clinicalRecordSchema.parse(record)).toThrow();
  });

  test("preserves conflicting admission dates through validation", () => {
    const record = {
      patient: {},
      hospitalization: {
        diagnoses: [],
        admissionDate: {
          value: "14/02/2026",
          sources: [
            { documentId: "d1", pageNumber: 2, text: "ingreso 14/02/2026" },
          ],
        },
        admissionDateConflicts: [
          {
            value: "13/02/2026",
            sources: [
              { documentId: "d1", pageNumber: 1, text: "ingreso 13/02/2026" },
            ],
          },
          {
            value: "14/02/2026",
            sources: [
              { documentId: "d1", pageNumber: 2, text: "ingreso 14/02/2026" },
            ],
          },
        ],
      },
      history: { pathological: [], allergies: [], usualMedications: [] },
      medications: [],
      laboratory: [],
      studies: [],
      microbiology: [],
      clinicalEvents: [],
    };
    const parsed = clinicalRecordSchema.parse(record);
    expect(parsed.hospitalization.admissionDateConflicts).toHaveLength(2);
    expect(
      parsed.hospitalization.admissionDateConflicts?.[0]?.sources[0]
        ?.pageNumber,
    ).toBe(1);
  });
});

describe("findingSchema", () => {
  const evidence = {
    source: { documentId: "d1", pageNumber: 3, text: "texto" },
    relevance: "relevancia",
  };

  test("accepts a finding that requires human review with evidence", () => {
    const finding = {
      id: "f1",
      severity: "medium",
      category: "temporal",
      title: "Posible inconsistencia temporal",
      explanation: "La medicación parece comenzar antes del ingreso.",
      evidence: [evidence],
      requiresHumanReview: true,
    };
    expect(() => findingSchema.parse(finding)).not.toThrow();
  });

  test("rejects a finding without evidence", () => {
    const finding = {
      id: "f1",
      severity: "medium",
      category: "temporal",
      title: "Posible inconsistencia temporal",
      explanation: "La medicación parece comenzar antes del ingreso.",
      evidence: [],
      requiresHumanReview: true,
    };
    expect(() => findingSchema.parse(finding)).toThrow();
  });

  test("rejects a finding that does not require human review", () => {
    const finding = {
      id: "f1",
      severity: "medium",
      category: "temporal",
      title: "Posible inconsistencia temporal",
      explanation: "La medicación parece comenzar antes del ingreso.",
      evidence: [evidence],
      requiresHumanReview: false,
    };
    expect(() => findingSchema.parse(finding)).toThrow();
  });
});
