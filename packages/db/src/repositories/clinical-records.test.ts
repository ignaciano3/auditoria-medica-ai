import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ClinicalRecord, Finding, Source } from "@audit/domain";
import { type Database, getDb } from "../client.ts";
import { resolveTestDatabaseUrl } from "../testing/test-database.ts";
import { createClinicalRecordRepository } from "./clinical-records.ts";
import { createDocumentRepository } from "./documents.ts";

const url = resolveTestDatabaseUrl();
const maybe = url ? describe : describe.skip;

const source: Source = { documentId: "doc", pageNumber: 1, text: "texto" };

function record(): ClinicalRecord {
  return {
    patient: { name: { value: "Ana", sources: [source] } },
    hospitalization: {
      admissionDate: { value: "13/02/2026", sources: [source] },
      dischargeDate: { value: "20/02/2026", sources: [source] },
      diagnoses: [{ value: "Sepsis", sources: [source] }],
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

const findings: Finding[] = [
  {
    id: "f1",
    severity: "high",
    category: "contradiction",
    title: "Contradicción",
    explanation: "Dos fechas.",
    evidence: [{ source, relevance: "Fecha contradictoria." }],
    requiresHumanReview: true,
  },
];

maybe("clinical records repository", () => {
  let db: Database;
  let repo: ReturnType<typeof createClinicalRecordRepository>;
  let documents: ReturnType<typeof createDocumentRepository>;
  let createdId = "";

  beforeAll(() => {
    db = getDb(url as string);
    repo = createClinicalRecordRepository(db);
    documents = createDocumentRepository(db);
  });

  afterAll(async () => {
    if (createdId) await documents.remove(createdId);
    await (
      db as unknown as { $client?: { end?: () => Promise<void> } }
    ).$client?.end?.();
  });

  test("upserts and fetches a clinical record with findings", async () => {
    const document = await documents.create({
      originalFilename: "historia.pdf",
      originalKey: "documents/abc/original.pdf",
    });
    createdId = document.id;

    await repo.upsert(
      document.id,
      record(),
      findings,
      {
        patientName: "Ana",
        admissionDate: "13/02/2026",
      },
      { extractionIncomplete: false, failedChunkCount: 0 },
    );

    const fetched = await repo.getByDocument(document.id);
    expect(fetched?.record).toEqual(record());
    expect(fetched?.findings).toEqual(findings);
    expect(fetched?.extractionIncomplete).toBe(false);
    expect(fetched?.failedChunkCount).toBe(0);
  });

  test("updates the existing record on the same document", async () => {
    const updated: ClinicalRecord = {
      ...record(),
      patient: { name: { value: "Ana María", sources: [source] } },
    };

    await repo.upsert(
      createdId,
      updated,
      [],
      { patientName: "Ana María" },
      { extractionIncomplete: true, failedChunkCount: 2 },
    );

    const fetched = await repo.getByDocument(createdId);
    expect(fetched?.record.patient.name?.value).toBe("Ana María");
    expect(fetched?.findings).toEqual([]);
    expect(fetched?.extractionIncomplete).toBe(true);
    expect(fetched?.failedChunkCount).toBe(2);
  });

  test("returns null for an unknown document", async () => {
    const fetched = await repo.getByDocument(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(fetched).toBeNull();
  });

  test("updates the record and findings without touching completeness", async () => {
    const document = await documents.create({
      originalFilename: "corregida.pdf",
      originalKey: "documents/corregida/original.pdf",
    });
    createdId = document.id;

    await repo.upsert(
      document.id,
      record(),
      findings,
      { patientName: "Ana" },
      { extractionIncomplete: true, failedChunkCount: 2 },
    );

    const patched: ClinicalRecord = {
      ...record(),
      patient: { name: { value: "Ariel", sources: [source] } },
    };
    await repo.updateRecord(document.id, patched, [], { patientName: "Ariel" });

    const fetched = await repo.getByDocument(document.id);
    expect(fetched?.record.patient.name?.value).toBe("Ariel");
    expect(fetched?.findings).toEqual([]);
    expect(fetched?.extractionIncomplete).toBe(true);
    expect(fetched?.failedChunkCount).toBe(2);
  });
});
