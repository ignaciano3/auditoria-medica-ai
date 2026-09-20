import { describe, expect, test } from "bun:test";
import type { ClinicalRecord, DocumentPage } from "@audit/domain";
import { HeuristicLLMProvider } from "./heuristic-provider.ts";

function page(text: string, pageNumber = 1): DocumentPage {
  return {
    pageNumber,
    text,
    docType: "other",
    handwritten: false,
    dataBearing: true,
    status: "text",
  };
}

describe("HeuristicLLMProvider", () => {
  test("extracts patient demographics", async () => {
    const provider = new HeuristicLLMProvider();
    const record = await provider.extractClinicalRecord([
      page("Paciente: Juan Carlos Pérez. 45 años, sexo masculino."),
    ]);
    expect(record.patient.name?.value).toBe("Juan Carlos Pérez");
    expect(record.patient.age?.value).toBe(45);
    expect(record.patient.sex?.value).toBe("masculino");
  });

  test("extracts admission and discharge dates", async () => {
    const provider = new HeuristicLLMProvider();
    const record = await provider.extractClinicalRecord([
      page("Fecha de ingreso: 12/03/2025. Fecha de alta: 20/03/2025."),
    ]);
    expect(record.hospitalization.admissionDate?.value).toBe("12/03/2025");
    expect(record.hospitalization.dischargeDate?.value).toBe("20/03/2025");
  });

  test("extracts medications with dose", async () => {
    const provider = new HeuristicLLMProvider();
    const record = await provider.extractClinicalRecord([
      page(
        "1. Amoxicilina 500 mg cada 8 horas\n2. Paracetamol 1 g por vía oral",
      ),
    ]);
    expect(record.medications).toHaveLength(2);
    expect(record.medications[0]?.name.value).toBe("Amoxicilina");
    expect(record.medications[0]?.dose?.value).toBe("500 mg");
    expect(record.medications[1]?.name.value).toBe("Paracetamol");
    expect(record.medications[1]?.dose?.value).toBe("1 g");
  });

  test("extracts lab results", async () => {
    const provider = new HeuristicLLMProvider();
    const record = await provider.extractClinicalRecord([
      page("Laboratorio: Glucosa 110 mg/dl, Creatinina 0.9 mg/dl."),
    ]);
    expect(record.laboratory).toHaveLength(2);
    expect(record.laboratory[0]?.name.value).toBe("Glucosa");
    expect(record.laboratory[0]?.value.value).toBe("110");
    expect(record.laboratory[0]?.unit?.value).toBe("mg/dl");
  });

  test("extracts allergies and diagnoses", async () => {
    const provider = new HeuristicLLMProvider();
    const record = await provider.extractClinicalRecord([
      page("Alergias: penicilina. Diagnósticos: neumonía, hipertensión."),
    ]);
    expect(record.history.allergies).toHaveLength(1);
    expect(record.history.allergies[0]?.value).toBe("penicilina");
    expect(record.hospitalization.diagnoses.map((d) => d.value)).toEqual([
      "neumonía",
      "hipertensión",
    ]);
  });

  test("attaches sources with page number for provenance stamping", async () => {
    const provider = new HeuristicLLMProvider();
    const record = await provider.extractClinicalRecord([
      page("Paciente: Ana María López.", 3),
    ]);
    expect(record.patient.name?.sources).toEqual([
      { documentId: "", pageNumber: 3, text: "Paciente: Ana María López." },
    ]);
  });

  test("returns an empty record when no data matches", async () => {
    const provider = new HeuristicLLMProvider();
    const record = await provider.extractClinicalRecord([
      page("texto sin datos reconocibles"),
    ]);
    expect(record.patient).toEqual({});
    expect(record.medications).toEqual([]);
    expect(record.laboratory).toEqual([]);
  });

  test("flags a medication without dose", async () => {
    const provider = new HeuristicLLMProvider();
    const record: ClinicalRecord = {
      patient: {},
      hospitalization: {
        diagnoses: [],
        admissionDateConflicts: [],
        dischargeDateConflicts: [],
      },
      history: { pathological: [], allergies: [], usualMedications: [] },
      medications: [
        {
          name: {
            value: "Ibuprofeno",
            sources: [{ documentId: "d1", pageNumber: 1, text: "Ibuprofeno" }],
          },
          sources: [{ documentId: "d1", pageNumber: 1, text: "Ibuprofeno" }],
        },
      ],
      laboratory: [],
      studies: [],
      microbiology: [],
      clinicalEvents: [],
    };
    const findings = await provider.analyzeClinicalRecord(record);
    expect(
      findings.some(
        (f) => f.category === "medication" && f.title.includes("Ibuprofeno"),
      ),
    ).toBe(true);
  });

  test("flags a record without discharge date", async () => {
    const provider = new HeuristicLLMProvider();
    const record: ClinicalRecord = {
      patient: {
        name: {
          value: "Juan Pérez",
          sources: [{ documentId: "d1", pageNumber: 1, text: "Juan Pérez" }],
        },
      },
      hospitalization: {
        admissionDate: {
          value: "12/03/2025",
          sources: [{ documentId: "d1", pageNumber: 1, text: "12/03/2025" }],
        },
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
    const findings = await provider.analyzeClinicalRecord(record);
    expect(findings.some((f) => f.category === "temporal")).toBe(true);
  });

  test("generates summaries with extracted data", async () => {
    const provider = new HeuristicLLMProvider();
    const record: ClinicalRecord = {
      patient: {
        name: {
          value: "Juan Pérez",
          sources: [{ documentId: "d1", pageNumber: 1, text: "Juan Pérez" }],
        },
      },
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
    const clinical = await provider.generateClinicalSummary(record);
    expect(clinical).toContain("Juan Pérez");
    const audit = await provider.generateAuditSummary(record, []);
    expect(audit).toContain("Juan Pérez");
  });
});

test("always classifies messages as questions", async () => {
  const provider = new HeuristicLLMProvider();
  await expect(
    provider.proposeTranscriptionEdit({
      question: "corregi Ansel por Ariel",
      history: [],
      pages: [],
    }),
  ).resolves.toEqual({ kind: "question" });
});

test("answers with a page citation when a page is retrieved", async () => {
  const provider = new HeuristicLLMProvider();
  let text = "";
  for await (const chunk of provider.answerClinicalQuestion({
    documentId: "d1",
    record: {
      patient: {},
      hospitalization: { diagnoses: [] },
      history: { pathological: [], allergies: [], usualMedications: [] },
      medications: [],
      laboratory: [],
      studies: [],
      microbiology: [],
      clinicalEvents: [],
    },
    findings: [],
    pages: [{ pageNumber: 3, text: "x", score: 1 }],
    history: [],
    question: "q",
  })) {
    text += chunk;
  }
  expect(text).toContain("[p.3]");
});
