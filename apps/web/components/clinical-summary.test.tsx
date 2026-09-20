/// <reference lib="dom" />

import { describe, expect, spyOn, test } from "bun:test";
import type { ClinicalSummary, MedicalHistory, Source } from "@audit/domain";
import { render } from "@testing-library/react";
import { HistorySection } from "./clinical-record-sections.tsx";
import { ClinicalSummaryView } from "./clinical-summary.tsx";

function source(pageNumber: number): Source {
  return { documentId: "d1", pageNumber, text: "t" };
}

function duplicateHistorySummary(): ClinicalSummary {
  return {
    patient: {},
    diagnoses: [],
    pathological: [
      { value: "Niega HTA, DBT2", sources: [source(1)] },
      { value: "Niega HTA, DBT2", sources: [source(2)] },
    ],
    allergies: [],
    evolution: [],
    studies: [],
    microbiology: [],
    treatment: [],
  };
}

describe("ClinicalSummaryView", () => {
  test("renders repeated clinical values without duplicate React keys", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    render(
      <ClinicalSummaryView
        documentId="d1"
        summary={duplicateHistorySummary()}
      />,
    );

    const keyWarnings = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("same key"),
    );
    errorSpy.mockRestore();

    expect(keyWarnings).toHaveLength(0);
  });

  test("history section renders repeated values without duplicate React keys", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const history: MedicalHistory = {
      pathological: [
        { value: "Niega HTA, DBT2", sources: [source(1)] },
        { value: "Niega HTA, DBT2", sources: [source(2)] },
      ],
      allergies: [],
      usualMedications: [],
    };

    render(<HistorySection documentId="d1" history={history} />);

    const keyWarnings = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("same key"),
    );
    errorSpy.mockRestore();

    expect(keyWarnings).toHaveLength(0);
  });
});
