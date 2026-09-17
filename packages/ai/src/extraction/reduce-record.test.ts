import { describe, expect, test } from "bun:test";
import type { Source } from "@audit/domain";
import { emptyClinicalRecord } from "./map-extract.ts";
import { reduceRecords } from "./reduce-record.ts";

const source = (page: number, text: string): Source => ({
  documentId: "d1",
  pageNumber: page,
  text,
});

describe("reduceRecords", () => {
  test("dedupes identical diagnoses but keeps conflicting admission dates", () => {
    const a = emptyClinicalRecord();
    a.hospitalization.admissionDate = {
      value: "13/02/2026",
      sources: [source(1, "ingreso 13/02/2026")],
    };
    a.hospitalization.diagnoses = [
      { value: "Sepsis", sources: [source(1, "sepsis")] },
    ];

    const b = emptyClinicalRecord();
    b.hospitalization.admissionDate = {
      value: "14/02/2026",
      sources: [source(2, "ingreso 14/02/2026")],
    };
    b.hospitalization.diagnoses = [
      { value: "Sepsis", sources: [source(2, "sepsis")] },
    ];

    const merged = reduceRecords([a, b]);

    expect(merged.hospitalization.diagnoses).toHaveLength(1);
    expect(merged.hospitalization.admissionDate?.value).toBe("13/02/2026");
    expect(merged.hospitalization.admissionDateConflicts).toHaveLength(2);
    expect(merged.hospitalization.admissionDateConflicts?.[0]?.value).toBe(
      "13/02/2026",
    );
    expect(merged.hospitalization.admissionDateConflicts?.[1]?.value).toBe(
      "14/02/2026",
    );
  });

  test("unions sources of duplicate facts and dedupes by document and page", () => {
    const a = emptyClinicalRecord();
    a.hospitalization.diagnoses = [
      {
        value: "  SEPSIS ",
        sources: [source(1, "sepsis"), source(1, "sepsis")],
      },
    ];

    const b = emptyClinicalRecord();
    b.hospitalization.diagnoses = [
      { value: "sepsis", sources: [source(2, "sepsis")] },
    ];

    const merged = reduceRecords([a, b]);

    expect(merged.hospitalization.diagnoses).toHaveLength(1);
    expect(merged.hospitalization.diagnoses[0]?.value).toBe("  SEPSIS ");
    expect(merged.hospitalization.diagnoses[0]?.sources).toEqual([
      source(1, "sepsis"),
      source(2, "sepsis"),
    ]);
  });

  test("keeps first-seen array order across records", () => {
    const a = emptyClinicalRecord();
    a.hospitalization.diagnoses = [
      { value: "B", sources: [source(1, "b")] },
      { value: "A", sources: [source(1, "a")] },
    ];

    const b = emptyClinicalRecord();
    b.hospitalization.diagnoses = [
      { value: "A", sources: [source(2, "a")] },
      { value: "C", sources: [source(2, "c")] },
    ];

    const merged = reduceRecords([a, b]);

    expect(merged.hospitalization.diagnoses.map((d) => d.value)).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  test("keeps the first non-empty singular value and never overwrites", () => {
    const a = emptyClinicalRecord();
    a.patient.name = { value: "Ana", sources: [source(1, "ana")] };
    a.hospitalization.reason = {
      value: "Dolor torácico",
      sources: [source(1, "dolor")],
    };

    const b = emptyClinicalRecord();
    b.patient.name = { value: "Beatriz", sources: [source(2, "beatriz")] };
    b.hospitalization.reason = {
      value: "Fiebre",
      sources: [source(2, "fiebre")],
    };

    const merged = reduceRecords([a, b]);

    expect(merged.patient.name?.value).toBe("Ana");
    expect(merged.hospitalization.reason?.value).toBe("Dolor torácico");
  });

  test("does not flag agreeing dates as a conflict and unions their sources", () => {
    const a = emptyClinicalRecord();
    a.hospitalization.admissionDate = {
      value: "13/02/2026",
      sources: [source(1, "ingreso")],
    };

    const b = emptyClinicalRecord();
    b.hospitalization.admissionDate = {
      value: "13/02/2026",
      sources: [source(2, "ingreso")],
    };

    const merged = reduceRecords([a, b]);

    expect(merged.hospitalization.admissionDate?.value).toBe("13/02/2026");
    expect(merged.hospitalization.admissionDate?.sources).toHaveLength(2);
    expect(merged.hospitalization.admissionDateConflicts).toEqual([]);
  });

  test("dedupes structured facts by normalized content and unions sources", () => {
    const a = emptyClinicalRecord();
    a.medications = [
      {
        name: { value: "Paracetamol", sources: [source(1, "para")] },
        dose: { value: "1 g", sources: [source(1, "para")] },
        sources: [source(1, "para")],
      },
    ];

    const b = emptyClinicalRecord();
    b.medications = [
      {
        name: { value: "paracetamol", sources: [source(2, "para")] },
        dose: { value: "1 g", sources: [source(2, "para")] },
        sources: [source(2, "para")],
      },
      {
        name: { value: "Paracetamol", sources: [source(2, "para2")] },
        dose: { value: "500 mg", sources: [source(2, "para2")] },
        sources: [source(2, "para2")],
      },
    ];

    const merged = reduceRecords([a, b]);

    expect(merged.medications).toHaveLength(2);
    expect(merged.medications[0]?.name.value).toBe("Paracetamol");
    expect(merged.medications[0]?.sources).toEqual([
      source(1, "para"),
      source(2, "para"),
    ]);
    expect(merged.medications[1]?.dose?.value).toBe("500 mg");
  });

  test("merges discharge fields and conflict dates across records", () => {
    const a = emptyClinicalRecord();
    a.discharge = {
      conditionAtDischarge: {
        value: "Estable",
        sources: [source(1, "estable")],
      },
    };
    a.hospitalization.dischargeDate = {
      value: "20/02/2026",
      sources: [source(1, "alta")],
    };

    const b = emptyClinicalRecord();
    b.discharge = {
      instructions: { value: "Control", sources: [source(2, "control")] },
    };
    b.hospitalization.dischargeDate = {
      value: "21/02/2026",
      sources: [source(2, "alta")],
    };

    const merged = reduceRecords([a, b]);

    expect(merged.discharge?.conditionAtDischarge?.value).toBe("Estable");
    expect(merged.discharge?.instructions?.value).toBe("Control");
    expect(merged.hospitalization.dischargeDate?.value).toBe("20/02/2026");
    expect(merged.hospitalization.dischargeDateConflicts).toHaveLength(2);
  });

  test("returns an empty record for an empty input", () => {
    expect(reduceRecords([])).toEqual(emptyClinicalRecord());
  });
});
