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
  foldText,
  groupMedications,
  historyEntryItemKey,
  isPlaceholderValue,
  labResultItemKey,
  medicationGroupItemKey,
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

describe("foldText", () => {
  test("lowercases, strips diacritics and collapses whitespace", () => {
    expect(foldText("  Levofloxacina  ")).toBe("levofloxacina");
    expect(foldText("Neumonía")).toBe("neumonia");
    expect(foldText("E.  Coli")).toBe("e. coli");
  });

  test("returns undefined for blank values", () => {
    expect(foldText(undefined)).toBeUndefined();
    expect(foldText("   ")).toBeUndefined();
  });
});

describe("groupMedications", () => {
  function medication(
    name: string,
    extra: Partial<Medication> = {},
  ): Medication {
    return {
      name: { value: name, sources: [source(1)] },
      sources: [source(1)],
      ...extra,
    };
  }

  test("merges same-name medications regardless of case and accents", () => {
    const groups = groupMedications([
      medication("Levofloxacina"),
      medication("LEVOFLOXACINA"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.medications).toHaveLength(2);
    expect(groups[0]?.name).toBe("Levofloxacina");
  });

  test("merges same-name medications with different route, dates and status", () => {
    const groups = groupMedications([
      medication("Levofloxacina", {
        route: { value: "endovenosa", sources: [source(1)] },
        startDate: { value: "15/02", sources: [source(1)] },
        status: "stopped",
      }),
      medication("Levofloxacina", {
        route: { value: "EV", sources: [source(7)] },
        startDate: { value: "14/2", sources: [source(7)] },
        status: "active",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.medications).toHaveLength(2);
  });

  test("keeps different drug names as separate groups", () => {
    const groups = groupMedications([
      medication("Metformina"),
      medication("Levofloxacina"),
    ]);
    expect(groups).toHaveLength(2);
  });

  test("preserves first-seen order", () => {
    const groups = groupMedications([
      medication("B"),
      medication("A"),
      medication("B"),
    ]);
    expect(groups.map((group) => group.name)).toEqual(["B", "A"]);
  });

  test("keeps medications without a name as separate groups", () => {
    const groups = groupMedications([medication(""), medication("")]);
    expect(groups).toHaveLength(2);
  });
});

describe("list item keys", () => {
  test("disambiguates medication groups that share a name", () => {
    const group = { name: "Levofloxacina", medications: [] };
    expect(medicationGroupItemKey(group, 0)).not.toBe(
      medicationGroupItemKey(group, 1),
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

  test("counts duplicate medications as a single group", () => {
    const record = emptyRecord();
    record.medications = [
      {
        name: { value: "Levofloxacina", sources: [source(1)] },
        sources: [source(1)],
      },
      {
        name: { value: "LEVOFLOXACINA", sources: [source(2)] },
        sources: [source(2)],
      },
    ];
    expect(countsBySection(record).medications).toBe(1);
  });
});
