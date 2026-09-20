import type { ClinicalRecord, DocumentPage } from "@audit/domain";
import type { LLMProvider } from "../llm-provider.ts";

export type RetryOptions = {
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type MapExtractOptions = RetryOptions & {
  onChunkError?: (chunkIndex: number, error: unknown) => void;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.trunc(value);
}

function delayFor(attempt: number, baseMs: number): number {
  return baseMs * 2 ** (attempt - 1);
}

export function emptyClinicalRecord(): ClinicalRecord {
  return {
    patient: {},
    hospitalization: {
      diagnoses: [],
      admissionDateConflicts: [],
      dischargeDateConflicts: [],
    },
    history: {
      pathological: [],
      allergies: [],
      usualMedications: [],
    },
    medications: [],
    laboratory: [],
    studies: [],
    microbiology: [],
    clinicalEvents: [],
  };
}

export async function mapExtract(
  chunks: DocumentPage[][],
  provider: LLMProvider,
  options?: MapExtractOptions,
): Promise<ClinicalRecord[]> {
  const records: ClinicalRecord[] = [];
  const maxAttempts = positiveInt(options?.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs = positiveInt(
    options?.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS,
  );
  const sleep = options?.sleep ?? defaultSleep;

  for (const [index, chunk] of chunks.entries()) {
    let record: ClinicalRecord | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        record = await provider.extractClinicalRecord(chunk);
        break;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await sleep(delayFor(attempt, retryDelayMs));
        }
      }
    }
    if (record !== undefined) {
      records.push(record);
    } else {
      records.push(emptyClinicalRecord());
      options?.onChunkError?.(index, lastError);
    }
  }
  return records;
}
