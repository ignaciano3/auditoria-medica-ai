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
    expect(summary.diagnoses).toEqual([]);
  });

  test("passes documented diagnoses through", () => {
    const record = baseRecord();
    record.hospitalization.diagnoses = [value("Neumonía", 3)];

    expect(buildClinicalSummary(record).diagnoses).toHaveLength(1);
  });
});

describe("buildAuditSummary", () => {
  test("groups findings by category", () => {
    const audit = buildAuditSummary([
      finding("documentation"),
      finding("temporal"),
      finding("medication"),
    ]);

    expect(audit.documentationGaps).toHaveLength(1);
    expect(audit.inconsistencies).toHaveLength(2);
  });
});
