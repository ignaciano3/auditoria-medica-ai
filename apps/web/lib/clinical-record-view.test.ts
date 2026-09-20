import { describe, expect, test } from "bun:test";
import type {
  ClinicalRecord,
  LabResult,
  Medication,
  MicrobiologyResult,
  Source,
  Study,
} from "@audit/domain";
import {
  countsBySection,
  dateConflictItemKey,
  diagnosisItemKey,
  displayValue,
  historyEntryItemKey,
  isPlaceholderValue,
  labResultItemKey,
  medicationItemKey,
  mergeSourcePages,
  microbiologyItemKey,
  sourcePages,
  studyItemKey,
} from "./clinical-record-view.ts";

function source(pageNumber: number): Source {
  return { documentId: "d1", pageNumber, text: "t" };
}

function emptyRecord(): ClinicalRecord {
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

describe("displayValue", () => {
  test("returns undefined for undefined", () => {
    expect(displayValue(undefined)).toBeUndefined();
  });

  test("returns undefined for blank strings", () => {
    expect(displayValue("   ")).toBeUndefined();
  });

  test("trims non-empty strings", () => {
    expect(displayValue("  hola  ")).toBe("hola");
  });

  test("stringifies numbers", () => {
    expect(displayValue(45)).toBe("45");
  });
});

describe("list item keys", () => {
  test("disambiguates medications that share a name", () => {
    const medication = (): Medication => ({
      name: { value: "RESULTADO", sources: [source(1)] },
      sources: [source(1)],
    });
    expect(medicationItemKey(medication(), 0)).not.toBe(
      medicationItemKey(medication(), 1),
    );
  });

  test("disambiguates lab results that share a name and value", () => {
    const result = (): LabResult => ({
      name: { value: "SODIO", sources: [source(1)] },
      value: { value: "134,0", sources: [source(1)] },
      sources: [source(1)],
    });
    expect(labResultItemKey(result(), 0)).not.toBe(
      labResultItemKey(result(), 1),
    );
  });

  test("disambiguates diagnoses that share a value", () => {
    expect(diagnosisItemKey("Neumonía", 0)).not.toBe(
      diagnosisItemKey("Neumonía", 1),
    );
  });

  test("disambiguates history entries that share a label and value", () => {
    expect(
      historyEntryItemKey("Antecedentes patológicos", "Niega HTA, DBT2", 0),
    ).not.toBe(
      historyEntryItemKey("Antecedentes patológicos", "Niega HTA, DBT2", 1),
    );
  });

  test("disambiguates studies that share a type", () => {
    const study = (): Study => ({
      type: { value: "TAC de tórax", sources: [source(1)] },
      sources: [source(1)],
    });
    expect(studyItemKey(study(), 0)).not.toBe(studyItemKey(study(), 1));
  });

  test("disambiguates microbiology results that share an organism", () => {
    const result = (): MicrobiologyResult => ({
      organism: { value: "E. coli", sources: [source(1)] },
      sources: [source(1)],
    });
    expect(microbiologyItemKey(result(), 0)).not.toBe(
      microbiologyItemKey(result(), 1),
    );
  });

  test("disambiguates date conflicts that share a value", () => {
    expect(dateConflictItemKey("13/02/2026", 0)).not.toBe(
      dateConflictItemKey("13/02/2026", 1),
    );
  });
});

describe("isPlaceholderValue", () => {
  test("treats punctuation-only strings as placeholders", () => {
    expect(isPlaceholderValue(".")).toBe(true);
    expect(isPlaceholderValue(",")).toBe(true);
    expect(isPlaceholderValue("-")).toBe(true);
    expect(isPlaceholderValue("—")).toBe(true);
    expect(isPlaceholderValue("..")).toBe(true);
    expect(isPlaceholderValue(" , ")).toBe(true);
  });

  test("keeps values with letters or digits", () => {
    expect(isPlaceholderValue("134,0")).toBe(false);
    expect(isPlaceholderValue("SODIO")).toBe(false);
    expect(isPlaceholderValue("0")).toBe(false);
    expect(isPlaceholderValue("N/A")).toBe(false);
    expect(isPlaceholderValue("mg/dl")).toBe(false);
  });

  test("does not treat empty or blank strings as placeholders", () => {
    expect(isPlaceholderValue("")).toBe(false);
    expect(isPlaceholderValue("   ")).toBe(false);
  });
});

describe("sourcePages", () => {
  test("dedupes and sorts page numbers ascending", () => {
    expect(sourcePages([source(3), source(1), source(3)])).toEqual([1, 3]);
  });

  test("ignores non-positive and non-integer pages", () => {
    expect(
      sourcePages([source(0), source(-2), source(1.5), source(2)]),
    ).toEqual([2]);
  });

  test("returns an empty array for no sources", () => {
    expect(sourcePages([])).toEqual([]);
  });
});

describe("mergeSourcePages", () => {
  test("unions groups and dedupes", () => {
    expect(mergeSourcePages([source(3)], [source(1), source(3)], [])).toEqual([
      1, 3,
    ]);
  });
});

describe("countsBySection", () => {
  test("returns zero for an empty record", () => {
    expect(countsBySection(emptyRecord())).toEqual({
      pathological: 0,
      allergies: 0,
      usualMedications: 0,
      medications: 0,
      laboratory: 0,
      studies: 0,
      microbiology: 0,
    });
  });

  test("counts each section", () => {
    const record = emptyRecord();
    record.history.pathological = [{ value: "x", sources: [source(1)] }];
    record.medications = [
      { name: { value: "m", sources: [source(2)] }, sources: [source(2)] },
    ];
    record.laboratory = [
      {
        name: { value: "l", sources: [source(3)] },
        value: { value: "1", sources: [source(3)] },
        sources: [source(3)],
      },
    ];
    record.studies = [
      { type: { value: "s", sources: [source(4)] }, sources: [source(4)] },
    ];
    record.microbiology = [
      { organism: { value: "o", sources: [source(5)] }, sources: [source(5)] },
    ];
    expect(countsBySection(record)).toEqual({
      pathological: 1,
      allergies: 0,
      usualMedications: 0,
      medications: 1,
      laboratory: 1,
      studies: 1,
      microbiology: 1,
    });
  });
});
