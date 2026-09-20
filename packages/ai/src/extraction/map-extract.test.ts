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

type FailPredicate = (pages: DocumentPage[], attempt: number) => boolean;

class ScriptedProvider implements LLMProvider {
  readonly calls: Array<{ pages: DocumentPage[]; attempt: number }> = [];
  private readonly attempts = new Map<string, number>();
  private readonly fail: FailPredicate;

  constructor(fail: FailPredicate = () => false) {
    this.fail = fail;
  }

  async extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord> {
    const key = pages.map((p) => p.pageNumber).join(",");
    const attempt = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, attempt);
    this.calls.push({ pages, attempt });
    if (this.fail(pages, attempt)) {
      throw new Error(`chunk ${key} attempt ${attempt} failed`);
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

  async *answerClinicalQuestion(): AsyncIterable<string> {
    yield "";
  }
}

describe("mapExtract", () => {
  test("maps each chunk to one record in chunk order", async () => {
    const chunks = [[page(1, "a")], [page(2, "b")]];
    const provider = new ScriptedProvider();

    const records = await mapExtract(chunks, provider);

    expect(records).toHaveLength(2);
    expect(records[0]?.patient.name?.value).toBe("a");
    expect(records[1]?.patient.name?.value).toBe("b");
    expect(provider.calls.map((call) => call.pages)).toEqual(chunks);
  });

  test("records a failed chunk as empty and keeps the other chunks intact", async () => {
    const chunks = [[page(1, "a")], [page(2, "b")], [page(3, "c")]];
    const provider = new ScriptedProvider((pages) =>
      pages.some((p) => p.pageNumber === 2),
    );
    const errors: Array<{ index: number; error: unknown }> = [];

    const records = await mapExtract(chunks, provider, {
      onChunkError: (index, error) => errors.push({ index, error }),
      sleep: async () => {},
    });

    expect(records).toHaveLength(3);
    expect(records[0]?.patient.name?.value).toBe("a");
    expect(records[1]).toEqual(emptyClinicalRecord());
    expect(records[2]?.patient.name?.value).toBe("c");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.index).toBe(1);
    expect((errors[0]?.error as Error | undefined)?.message).toBe(
      "chunk 2 attempt 3 failed",
    );
  });

  test("does not report errors when every chunk succeeds", async () => {
    const provider = new ScriptedProvider();
    const errors: number[] = [];

    await mapExtract([[page(1, "a")]], provider, {
      onChunkError: (index) => errors.push(index),
    });

    expect(errors).toEqual([]);
  });

  test("retries a chunk that fails transiently and keeps its record", async () => {
    const provider = new ScriptedProvider((_pages, attempt) => attempt === 1);
    const errors: number[] = [];
    const sleeps: number[] = [];

    const records = await mapExtract([[page(1, "a")]], provider, {
      onChunkError: (index) => errors.push(index),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(records[0]?.patient.name?.value).toBe("a");
    expect(errors).toEqual([]);
    expect(provider.calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
  });

  test("reports a chunk only after every attempt fails", async () => {
    const provider = new ScriptedProvider(() => true);
    const errors: Array<{ index: number; error: unknown }> = [];
    const sleeps: number[] = [];

    const records = await mapExtract([[page(1, "a")]], provider, {
      onChunkError: (index, error) => errors.push({ index, error }),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(records[0]).toEqual(emptyClinicalRecord());
    expect(provider.calls).toHaveLength(3);
    expect(errors).toHaveLength(1);
    expect((errors[0]?.error as Error | undefined)?.message).toBe(
      "chunk 1 attempt 3 failed",
    );
    expect(sleeps).toHaveLength(2);
  });

  test("backs off exponentially between attempts", async () => {
    const provider = new ScriptedProvider(() => true);
    const sleeps: number[] = [];

    await mapExtract([[page(1, "a")]], provider, {
      retryDelayMs: 100,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(sleeps).toEqual([100, 200]);
  });

  test("honors a custom maxAttempts", async () => {
    const provider = new ScriptedProvider(() => true);
    const sleeps: number[] = [];

    await mapExtract([[page(1, "a")]], provider, {
      maxAttempts: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(provider.calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
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
