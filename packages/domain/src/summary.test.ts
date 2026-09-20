import { describe, expect, test } from "bun:test";
import type {
  ClinicalRecord,
  ExtractedValue,
  Finding,
  Source,
} from "./index.ts";
import { buildAuditSummary, buildClinicalSummary } from "./summary.ts";

function source(pageNumber: number): Source {
  return { documentId: "d1", pageNumber, text: "t" };
}

function value(text: string, page: number): ExtractedValue<string> {
  return { value: text, sources: [source(page)] };
}

function baseRecord(): ClinicalRecord {
  return {
    patient: {},
    hospitalization: {
      diagnoses: [],
      admissionDateConflicts: [],
      dischargeDateConflicts: [],
    },
    history: { pathological: [], allergies: [], usualMedications: [] },
    medications: [],
    laboratory: [],
    studies: [],
    microbiology: [],
    clinicalEvents: [],
  };
}

function finding(category: Finding["category"]): Finding {
  return {
    id: `fnd-${category}`,
    severity: "medium",
    category,
    title: "Título",
    explanation: "Explicación",
    evidence: [{ source: source(1), relevance: "r" }],
    requiresHumanReview: true,
  };
}

describe("buildClinicalSummary", () => {
  test("computes duration from admission and discharge", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.hospitalization.dischargeDate = value("28/02/2026", 2);

    expect(buildClinicalSummary(record).durationDays).toBe(15);
  });

  test("keeps missing fields missing", () => {
    const summary = buildClinicalSummary(baseRecord());
    expect(summary.reason).toBeUndefined();
    expect(summary.durationDays).toBeUndefined();
    expect(summary.discharge).toBeUndefined();
    expect(summary.evolution).toEqual([]);
  });

  test("includes evolution and diagnosis events in the evolution list", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "14/02/2026",
        type: "clinical_evolution",
        description: "Afebril, buena evolución",
        sources: [source(3)],
      },
    ];

    const evolution = buildClinicalSummary(record).evolution;
    expect(evolution).toHaveLength(1);
    expect(evolution[0]?.type).toBe("clinical_evolution");
  });
});

describe("buildAuditSummary", () => {
  test("groups findings by category and counts review items", () => {
    const audit = buildAuditSummary(baseRecord(), [
      finding("documentation"),
      finding("temporal"),
      finding("medication"),
    ]);

    expect(audit.documentationGaps).toHaveLength(1);
    expect(audit.inconsistencies).toHaveLength(2);
    expect(audit.requiresReview).toBe(3);
  });

  test("collects treatment changes from the timeline", () => {
    const record = baseRecord();
    record.medications = [
      {
        name: value("Levofloxacina", 5),
        startDate: value("15/02/2026", 5),
        sources: [source(5)],
      },
    ];

    const audit = buildAuditSummary(record, []);
    expect(audit.treatmentChanges).toHaveLength(1);
    expect(audit.treatmentChanges[0]?.type).toBe("medication_start");
    expect(audit.majorTreatments).toHaveLength(1);
  });
});
