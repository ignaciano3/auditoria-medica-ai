import { describe, expect, test } from "bun:test";
import type { ClinicalSummary } from "@audit/domain";
import { durationText, hasClinicalSummaryContent } from "./summary-view.ts";

function emptySummary(): ClinicalSummary {
  return {
    patient: {},
    diagnoses: [],
    pathological: [],
    allergies: [],
    evolution: [],
    studies: [],
    microbiology: [],
    treatment: [],
  };
}

describe("durationText", () => {
  test("formats a day count in Spanish", () => {
    expect(durationText(15)).toBe("15 días");
  });

  test("returns undefined when there is no duration", () => {
    expect(durationText(undefined)).toBeUndefined();
  });
});

describe("hasClinicalSummaryContent", () => {
  test("is false for an empty summary", () => {
    expect(hasClinicalSummaryContent(emptySummary())).toBe(false);
  });

  test("is true when any section has content", () => {
    const summary = emptySummary();
    summary.treatment = [
      {
        name: {
          value: "Levofloxacina",
          sources: [{ documentId: "d1", pageNumber: 1, text: "t" }],
        },
        sources: [{ documentId: "d1", pageNumber: 1, text: "t" }],
      },
    ];
    expect(hasClinicalSummaryContent(summary)).toBe(true);
  });
});
