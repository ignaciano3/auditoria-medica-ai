import { describe, expect, test } from "bun:test";
import {
  type ClinicalRecord,
  clinicalRecordSchema,
  type DocumentPage,
  type Finding,
} from "@audit/domain";
import type { LLMProvider } from "../llm-provider.ts";
import { emptyClinicalRecord, mapExtract } from "./map-extract.ts";

const page = (n: number, text: string): DocumentPage => ({
  pageNumber: n,
  text,
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
  status: "vision",
});

function taggedRecord(text: string): ClinicalRecord {
  return {
    ...emptyClinicalRecord(),
    patient: { name: { value: text, sources: [] } },
  };
}

class TaggingProvider implements LLMProvider {
  readonly chunks: DocumentPage[][] = [];
  private readonly failAt: number | undefined;

  constructor(failAt?: number) {
    this.failAt = failAt;
  }

  async extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord> {
    const index = this.chunks.length;
    this.chunks.push(pages);
    if (index === this.failAt) {
      throw new Error(`chunk ${index} failed`);
    }
    return taggedRecord(pages.map((p) => p.text).join(""));
  }

  async analyzeClinicalRecord(_record: ClinicalRecord): Promise<Finding[]> {
    return [];
  }

  async generateClinicalSummary(_record: ClinicalRecord): Promise<string> {
    return "";
  }

  async generateAuditSummary(
    _record: ClinicalRecord,
    _findings: Finding[],
  ): Promise<string> {
    return "";
  }
}

describe("mapExtract", () => {
  test("maps each chunk to one record in chunk order", async () => {
    const chunks = [[page(1, "a")], [page(2, "b")]];
    const provider = new TaggingProvider();

    const records = await mapExtract(chunks, provider);

    expect(records).toHaveLength(2);
    expect(records[0]?.patient.name?.value).toBe("a");
    expect(records[1]?.patient.name?.value).toBe("b");
    expect(provider.chunks).toEqual(chunks);
  });

  test("records a failed chunk as empty and keeps the other chunks intact", async () => {
    const chunks = [[page(1, "a")], [page(2, "b")], [page(3, "c")]];
    const provider = new TaggingProvider(1);
    const errors: Array<{ index: number; error: unknown }> = [];

    const records = await mapExtract(chunks, provider, {
      onChunkError: (index, error) => errors.push({ index, error }),
    });

    expect(records).toHaveLength(3);
    expect(records[0]?.patient.name?.value).toBe("a");
    expect(records[1]).toEqual(emptyClinicalRecord());
    expect(records[2]?.patient.name?.value).toBe("c");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.index).toBe(1);
    expect((errors[0]?.error as Error | undefined)?.message).toBe(
      "chunk 1 failed",
    );
  });

  test("does not report errors when every chunk succeeds", async () => {
    const provider = new TaggingProvider();
    const errors: number[] = [];

    await mapExtract([[page(1, "a")]], provider, {
      onChunkError: (index) => errors.push(index),
    });

    expect(errors).toEqual([]);
  });
});

describe("emptyClinicalRecord", () => {
  test("returns a schema-valid empty record", () => {
    const record = emptyClinicalRecord();

    const parsed = clinicalRecordSchema.parse(record);

    expect(parsed.patient).toEqual({});
    expect(parsed.hospitalization.diagnoses).toEqual([]);
    expect(parsed.hospitalization.admissionDateConflicts).toEqual([]);
    expect(parsed.hospitalization.dischargeDateConflicts).toEqual([]);
    expect(parsed.history.pathological).toEqual([]);
    expect(parsed.history.allergies).toEqual([]);
    expect(parsed.history.usualMedications).toEqual([]);
    expect(parsed.medications).toEqual([]);
    expect(parsed.laboratory).toEqual([]);
    expect(parsed.studies).toEqual([]);
    expect(parsed.microbiology).toEqual([]);
    expect(parsed.clinicalEvents).toEqual([]);
  });
});
