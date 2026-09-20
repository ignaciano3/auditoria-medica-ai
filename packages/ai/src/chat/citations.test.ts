import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, Finding } from "@audit/domain";
import {
  allowedCitationPages,
  parseCitations,
  sourcePagesFromContext,
  splitCitations,
  validateCitations,
} from "./citations.ts";

function record(): ClinicalRecord {
  return {
    patient: {
      name: {
        value: "Ana",
        sources: [{ documentId: "d", pageNumber: 2, text: "Ana" }],
      },
    },
    hospitalization: { diagnoses: [] },
    history: { pathological: [], allergies: [], usualMedications: [] },
    medications: [
      {
        name: {
          value: "Levofloxacina",
          sources: [{ documentId: "d", pageNumber: 5, text: "levo" }],
        },
        sources: [{ documentId: "d", pageNumber: 5, text: "levo" }],
      },
    ],
    laboratory: [],
    studies: [],
    microbiology: [],
    clinicalEvents: [],
  };
}

const findings: Finding[] = [
  {
    id: "f1",
    severity: "high",
    category: "contradiction",
    title: "Contradicción",
    explanation: "Dos fechas.",
    evidence: [
      {
        source: { documentId: "d", pageNumber: 9, text: "fecha" },
        relevance: "Fecha contradictoria.",
      },
    ],
    requiresHumanReview: true,
  },
];

describe("parseCitations", () => {
  test("returns markers in order", () => {
    expect(parseCitations("a [p.3] b [p.1] c")).toEqual([3, 1]);
  });
  test("returns [] when there are no markers", () => {
    expect(parseCitations("sin citas")).toEqual([]);
  });
});

describe("validateCitations", () => {
  test("keeps only allowed pages, unique and ascending", () => {
    expect(validateCitations("[p.3] [p.1] [p.9]", [1, 3])).toEqual([1, 3]);
  });
});

describe("splitCitations", () => {
  test("splits text and valid pages, dropping invalid markers", () => {
    expect(splitCitations("Tomó [p.5] y [p.99] mejoró", [5])).toEqual([
      { kind: "text", text: "Tomó " },
      { kind: "page", page: 5 },
      { kind: "text", text: " y  mejoró" },
    ]);
  });
});

describe("sourcePagesFromContext", () => {
  test("collects page numbers from record and findings sources", () => {
    expect(sourcePagesFromContext(record(), findings)).toEqual([2, 5, 9]);
  });
});

describe("allowedCitationPages", () => {
  test("unions retrieved pages with record/finding source pages", () => {
    const pages = [{ pageNumber: 4, text: "x", score: 1 }];
    expect(allowedCitationPages({ pages, record: record(), findings })).toEqual(
      [2, 4, 5, 9],
    );
  });
});
