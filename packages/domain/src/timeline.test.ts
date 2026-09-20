import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, ExtractedValue, Source } from "./index.ts";
import { buildTimeline } from "./timeline.ts";

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

describe("buildTimeline", () => {
  test("synthesizes structured events in chronological order", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.hospitalization.dischargeDate = value("28/02/2026", 2);
    record.medications = [
      {
        name: value("Levofloxacina", 5),
        startDate: value("15/02/2026", 5),
        sources: [source(5)],
      },
    ];

    expect(buildTimeline(record).map((group) => group.key)).toEqual([
      "2026-02-13",
      "2026-02-15",
      "2026-02-28",
    ]);
  });

  test("keeps narrative documented events", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "14/02/2026",
        type: "diagnosis",
        description: "Neumonía adquirida en la comunidad",
        sources: [source(3)],
      },
    ];

    const entries = buildTimeline(record).flatMap((group) => group.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("diagnosis");
    expect(entries[0]?.detail).toEqual({
      kind: "documented",
      description: "Neumonía adquirida en la comunidad",
    });
  });

  test("drops a covered documented event that duplicates a structured one on the same page", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.clinicalEvents = [
      {
        date: "13/02/2026",
        type: "admission",
        description: "Ingreso por neumonía",
        sources: [source(1)],
      },
    ];

    const admissions = buildTimeline(record)
      .flatMap((group) => group.entries)
      .filter((entry) => entry.type === "admission");
    expect(admissions).toHaveLength(1);
    expect(admissions[0]?.detail).toEqual({ kind: "admission" });
  });

  test("keeps a covered documented event when no structured event shares its page", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "13/02/2026",
        type: "laboratory",
        description: "Hemograma de ingreso",
        sources: [source(7)],
      },
    ];

    const entries = buildTimeline(record).flatMap((group) => group.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("laboratory");
  });

  test("groups entries without a usable date last", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);
    record.clinicalEvents = [
      {
        type: "other",
        description: "Evento sin fecha",
        sources: [source(4)],
      },
    ];

    const groups = buildTimeline(record);
    const last = groups[groups.length - 1];
    expect(last?.undated).toBe(true);
    expect(last?.key).toBe("undated");
  });

  test("dedupes identical entries by type, description and date", () => {
    const record = baseRecord();
    record.clinicalEvents = [
      {
        date: "14/02/2026",
        type: "diagnosis",
        description: "Neumonía",
        sources: [source(3)],
      },
      {
        date: "14/02/2026",
        type: "diagnosis",
        description: "NEUMONIA",
        sources: [source(3)],
      },
    ];

    const entries = buildTimeline(record).flatMap((group) => group.entries);
    expect(entries).toHaveLength(1);
  });

  test("produces stable ids and preserves sources", () => {
    const record = baseRecord();
    record.hospitalization.admissionDate = value("13/02/2026", 1);

    const first = buildTimeline(record).flatMap((group) => group.entries);
    const second = buildTimeline(record).flatMap((group) => group.entries);
    expect(first.map((entry) => entry.id)).toEqual(
      second.map((entry) => entry.id),
    );
    expect(first[0]?.id.startsWith("evt-")).toBe(true);
    expect(first[0]?.sources).toEqual([source(1)]);
  });
});
