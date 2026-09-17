import { describe, expect, test } from "bun:test";
import type { ExtractedValue, Source } from "@audit/domain";
import { emptyClinicalRecord } from "./map-extract.ts";
import { reduceRecords } from "./reduce-record.ts";

const source = (page: number, text: string): Source => ({
  documentId: "d1",
  pageNumber: page,
  text,
});

const extracted = <T>(value: T, page: number): ExtractedValue<T> => ({
  value,
  sources: [source(page, "text")],
});

function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      keyPaths(item, `${prefix}[${index}]`),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => {
        const path = prefix === "" ? key : `${prefix}.${key}`;
        return [path, ...keyPaths(child, path)];
      },
    );
  }
  return [];
}

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

  test("treats an empty value as absent when choosing the first singular value", () => {
    const a = emptyClinicalRecord();
    a.patient.name = { value: "   ", sources: [source(1, "blank")] };
    a.hospitalization.admissionDate = {
      value: "",
      sources: [source(1, "blank")],
    };

    const b = emptyClinicalRecord();
    b.patient.name = { value: "Ana", sources: [source(2, "ana")] };
    b.hospitalization.admissionDate = {
      value: "13/02/2026",
      sources: [source(2, "ingreso")],
    };

    const merged = reduceRecords([a, b]);
    const reversed = reduceRecords([b, a]);

    expect(merged.patient.name?.value).toBe("Ana");
    expect(merged.hospitalization.admissionDate?.value).toBe("13/02/2026");
    expect(merged.hospitalization.admissionDateConflicts).toEqual([]);
    expect(reversed.patient.name?.value).toBe("Ana");
    expect(reversed.hospitalization.admissionDate?.value).toBe("13/02/2026");
  });

  test("does not mutate its inputs when a singular value is merged", () => {
    const a = emptyClinicalRecord();
    a.patient.name = { value: "Ana", sources: [source(1, "ana")] };

    const merged = reduceRecords([a]);
    merged.patient.name?.sources.push(source(9, "extra"));

    expect(a.patient.name?.sources).toHaveLength(1);
  });

  test("keeps clinical events that differ only by date", () => {
    const a = emptyClinicalRecord();
    a.clinicalEvents = [
      {
        date: "01/02/2026",
        type: "admission",
        description: "Ingreso",
        sources: [source(1, "e1")],
      },
    ];

    const b = emptyClinicalRecord();
    b.clinicalEvents = [
      {
        date: "02/02/2026",
        type: "admission",
        description: "Ingreso",
        sources: [source(2, "e2")],
      },
      {
        date: "01/02/2026",
        type: "admission",
        description: " INGRESO ",
        sources: [source(2, "e3")],
      },
    ];

    const merged = reduceRecords([a, b]);

    expect(merged.clinicalEvents).toHaveLength(2);
    expect(merged.clinicalEvents[0]?.date).toBe("01/02/2026");
    expect(merged.clinicalEvents[0]?.sources).toHaveLength(2);
    expect(merged.clinicalEvents[1]?.date).toBe("02/02/2026");
  });

  test("retains every field present in a fully populated record", () => {
    const full = emptyClinicalRecord();
    full.patient = {
      name: extracted("Ana", 1),
      age: extracted(40, 1),
      sex: extracted("F", 1),
      birthDate: extracted("01/01/1986", 1),
    };
    full.hospitalization = {
      admissionDate: extracted("13/02/2026", 1),
      dischargeDate: extracted("20/02/2026", 1),
      reason: extracted("Dolor", 1),
      diagnoses: [extracted("Sepsis", 1)],
      dischargeDiagnosis: extracted("Mejoría", 1),
      admissionDateConflicts: [],
      dischargeDateConflicts: [],
    };
    full.history = {
      pathological: [extracted("HTA", 1)],
      allergies: [extracted("Penicilina", 1)],
      usualMedications: [
        {
          name: extracted("Enalapril", 1),
          dose: extracted("10 mg", 1),
          sources: [source(1, "med")],
        },
      ],
    };
    full.medications = [
      {
        name: extracted("Paracetamol", 1),
        dose: extracted("1 g", 1),
        route: extracted("oral", 1),
        frequency: extracted("cada 8 h", 1),
        startDate: extracted("13/02/2026", 1),
        endDate: extracted("15/02/2026", 1),
        status: "active",
        sources: [source(1, "med")],
      },
    ];
    full.laboratory = [
      {
        date: extracted("13/02/2026", 1),
        name: extracted("Leucocitos", 1),
        value: extracted("12000", 1),
        unit: extracted("/mm3", 1),
        referenceRange: extracted("4000-10000", 1),
        sources: [source(1, "lab")],
      },
    ];
    full.studies = [
      {
        date: extracted("13/02/2026", 1),
        type: extracted("Radiografía", 1),
        indication: extracted("Fiebre", 1),
        result: extracted("Normal", 1),
        sources: [source(1, "study")],
      },
    ];
    full.microbiology = [
      {
        date: extracted("14/02/2026", 1),
        sample: extracted("Sangre", 1),
        organism: extracted("E. coli", 1),
        result: extracted("Positivo", 1),
        sensitivity: extracted("Sensible", 1),
        sources: [source(1, "micro")],
      },
    ];
    full.clinicalEvents = [
      {
        date: "13/02/2026",
        type: "admission",
        description: "Ingreso",
        sources: [source(1, "event")],
      },
    ];
    full.discharge = {
      date: extracted("20/02/2026", 1),
      conditionAtDischarge: extracted("Estable", 1),
      diagnosis: extracted("Neumonía", 1),
      treatment: extracted("Antibióticos", 1),
      instructions: extracted("Control", 1),
      warningSigns: extracted("Fiebre", 1),
      followUp: extracted("Consultorio", 1),
    };

    const merged = reduceRecords([full, emptyClinicalRecord()]);
    const mergedPaths = new Set(keyPaths(merged));

    for (const path of keyPaths(full)) {
      expect(mergedPaths.has(path)).toBe(true);
    }
    for (const path of keyPaths(emptyClinicalRecord())) {
      expect(mergedPaths.has(path)).toBe(true);
    }
  });
});
