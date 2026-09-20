/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import type { AuditSummary, Finding, Source } from "@audit/domain";
import { render } from "@testing-library/react";
import { AuditSummaryView } from "./audit-summary.tsx";

function source(pageNumber: number): Source {
  return { documentId: "d1", pageNumber, text: "t" };
}

function finding(): Finding {
  return {
    id: "fnd-1",
    severity: "medium",
    category: "temporal",
    title: "Posible inconsistencia temporal",
    explanation: "explicación",
    evidence: [{ source: source(1), relevance: "r" }],
    requiresHumanReview: true,
  };
}

function summary(): AuditSummary {
  return {
    durationDays: 15,
    majorEvents: [],
    majorTreatments: [],
    treatmentChanges: [],
    relevantStudies: [],
    microbiology: [],
    documentationGaps: [],
    inconsistencies: [finding()],
    requiresReview: 1,
  };
}

describe("AuditSummaryView", () => {
  test("shows finding counts without repeating the findings list", () => {
    const { getByText, queryByText } = render(
      <AuditSummaryView documentId="d1" summary={summary()} />,
    );

    expect(getByText("Inconsistencias detectadas")).not.toBeNull();
    expect(queryByText("Posible inconsistencia temporal")).toBeNull();
    expect(getByText("1 elementos requieren revisión")).not.toBeNull();
  });
});
