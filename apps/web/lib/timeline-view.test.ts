import { describe, expect, test } from "bun:test";
import type { TimelineEntry, TimelineGroup } from "@audit/domain";
import { describeEntry, formatDateLabel, groupLabel } from "./timeline-view.ts";

function entry(detail: TimelineEntry["detail"]): TimelineEntry {
  return {
    id: "evt-1",
    type: "other",
    sources: [{ documentId: "d1", pageNumber: 1, text: "t" }],
    detail,
  };
}

describe("formatDateLabel", () => {
  test("formats an iso date as dd/mm", () => {
    expect(formatDateLabel("2026-02-13")).toBe("13/02");
  });

  test("returns the input when it cannot be split", () => {
    expect(formatDateLabel("2026")).toBe("2026");
  });
});

describe("groupLabel", () => {
  test("uses Sin fecha for the undated group", () => {
    const group: TimelineGroup = { key: "undated", undated: true, entries: [] };
    expect(groupLabel(group)).toBe("Sin fecha");
  });

  test("formats a dated group", () => {
    const group: TimelineGroup = {
      key: "2026-02-13",
      date: "2026-02-13",
      undated: false,
      entries: [],
    };
    expect(groupLabel(group)).toBe("13/02");
  });
});

describe("describeEntry", () => {
  test("describes admission and discharge", () => {
    expect(describeEntry(entry({ kind: "admission" }))).toBe("Ingreso");
    expect(describeEntry(entry({ kind: "discharge" }))).toBe("Egreso");
  });

  test("describes medication start and stop", () => {
    expect(
      describeEntry(
        entry({ kind: "medication", name: "Levofloxacina", change: "start" }),
      ),
    ).toBe("Inicio de Levofloxacina");
    expect(
      describeEntry(
        entry({ kind: "medication", name: "Levofloxacina", change: "stop" }),
      ),
    ).toBe("Fin de Levofloxacina");
  });

  test("describes a laboratory result with and without a unit", () => {
    expect(
      describeEntry(
        entry({
          kind: "laboratory",
          name: "Sodio",
          value: "134",
          unit: "mEq/L",
        }),
      ),
    ).toBe("Sodio: 134 mEq/L");
    expect(
      describeEntry(entry({ kind: "laboratory", name: "Sodio", value: "134" })),
    ).toBe("Sodio: 134");
  });

  test("describes a study with and without a result", () => {
    expect(
      describeEntry(
        entry({ kind: "study", studyType: "TAC de tórax", result: "Derrame" }),
      ),
    ).toBe("TAC de tórax: Derrame");
    expect(
      describeEntry(entry({ kind: "study", studyType: "TAC de tórax" })),
    ).toBe("TAC de tórax");
  });

  test("joins microbiology parts and falls back when empty", () => {
    expect(
      describeEntry(
        entry({ kind: "microbiology", sample: "Sangre", organism: "E. coli" }),
      ),
    ).toBe("Sangre · E. coli");
    expect(describeEntry(entry({ kind: "microbiology" }))).toBe(
      "Resultado de microbiología",
    );
  });

  test("passes documented descriptions through", () => {
    expect(
      describeEntry(entry({ kind: "documented", description: "Afebril" })),
    ).toBe("Afebril");
  });
});
