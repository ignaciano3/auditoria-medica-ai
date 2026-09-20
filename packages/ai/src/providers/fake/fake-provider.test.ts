import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, Finding } from "@audit/domain";
import { FakeLLMProvider } from "../../index.ts";

const record: ClinicalRecord = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
};

const findings: Finding[] = [
  {
    id: "f1",
    severity: "high",
    category: "contradiction",
    title: "Contradicción",
    explanation: "Dos fechas distintas.",
    evidence: [
      {
        source: { documentId: "d1", pageNumber: 2, text: "14/02/2026" },
        relevance: "Fecha contradictoria.",
      },
    ],
    requiresHumanReview: true,
  },
];

describe("FakeLLMProvider", () => {
  test("returns the configured fixture from every method", async () => {
    const provider = new FakeLLMProvider({
      record,
      findings,
      clinicalSummary: "Resumen clínico.",
      auditSummary: "Resumen de auditoría.",
    });

    await expect(provider.extractClinicalRecord([])).resolves.toEqual(record);
    await expect(provider.analyzeClinicalRecord(record)).resolves.toEqual(
      findings,
    );
    await expect(provider.generateClinicalSummary(record)).resolves.toBe(
      "Resumen clínico.",
    );
    await expect(provider.generateAuditSummary(record, findings)).resolves.toBe(
      "Resumen de auditoría.",
    );
  });

  test("defaults findings and summaries when not configured", async () => {
    const provider = new FakeLLMProvider({ record });
    await expect(provider.analyzeClinicalRecord(record)).resolves.toEqual([]);
    await expect(provider.generateClinicalSummary(record)).resolves.toBe("");
    await expect(provider.generateAuditSummary(record, [])).resolves.toBe("");
  });
});

test("returns the configured chat intent", async () => {
  const provider = new FakeLLMProvider({
    record,
    intent: { kind: "edit", incorrect: "Ansel", correct: "Ariel" },
  });
  await expect(
    provider.proposeTranscriptionEdit({
      question: "q",
      history: [],
      pages: [],
    }),
  ).resolves.toEqual({
    kind: "edit",
    incorrect: "Ansel",
    correct: "Ariel",
  });
});

test("defaults the chat intent to a question", async () => {
  const provider = new FakeLLMProvider({ record });
  await expect(
    provider.proposeTranscriptionEdit({
      question: "q",
      history: [],
      pages: [],
    }),
  ).resolves.toEqual({ kind: "question" });
});

test("streams the configured answer", async () => {
  const provider = new FakeLLMProvider({ record, answer: "Respuesta [p.1]" });
  let text = "";
  for await (const chunk of provider.answerClinicalQuestion({
    documentId: "d1",
    record,
    findings: [],
    pages: [],
    history: [],
    question: "q",
  })) {
    text += chunk;
  }
  expect(text).toBe("Respuesta [p.1]");
});
