import { describe, expect, test } from "bun:test";
import type { DocumentPage } from "@audit/domain";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
  buildClinicalSummaryUserPrompt,
  buildExtractionCorrectionPrompt,
  buildExtractionUserPrompt,
} from "../index.ts";

const page = (pageNumber: number, text: string): DocumentPage => ({
  pageNumber,
  text,
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
  status: "vision",
});

const emptyRecord = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
};

describe("extraction prompt", () => {
  test("system prompt encodes the spec 18 rules", () => {
    const prompt = EXTRACTION_SYSTEM_PROMPT.toLowerCase();
    expect(prompt).toContain("only extract");
    expect(prompt).toContain("never invent");
    expect(prompt).toContain("source");
    expect(prompt).toContain("date");
    expect(prompt).toContain("contradiction");
    expect(prompt).toContain("do not make a medical diagnosis");
    expect(prompt).toContain("do not recommend treatment");
    expect(prompt).toContain("spanish");
    expect(prompt).toContain("json");
  });

  test("user prompt includes only the provided pages text", () => {
    const prompt = buildExtractionUserPrompt([
      page(1, "SENTINEL-UNO"),
      page(2, "SENTINEL-DOS"),
    ]);
    expect(prompt).toContain("SENTINEL-UNO");
    expect(prompt).toContain("SENTINEL-DOS");
    expect(prompt).not.toContain("SENTINEL-TRES");
  });

  test("correction prompt asks for corrected strict JSON", () => {
    const prompt = buildExtractionCorrectionPrompt().toLowerCase();
    expect(prompt).toContain("json");
    expect(prompt).toContain("correct");
  });

  test("analysis user prompt embeds the record and requires evidence", () => {
    const prompt = buildAnalysisUserPrompt(emptyRecord);
    expect(prompt).toContain("clinicalEvents");
    expect(prompt.toLowerCase()).toContain("evidence");
  });

  test("clinical summary user prompt embeds the record", () => {
    const prompt = buildClinicalSummaryUserPrompt(emptyRecord);
    expect(prompt).toContain("clinicalEvents");
  });
});
