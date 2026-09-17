import type { ClinicalRecord, DocumentPage } from "@audit/domain";
import type { LLMProvider } from "../llm-provider.ts";

export type MapExtractOptions = {
  onChunkError?: (chunkIndex: number, error: unknown) => void;
};

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
  for (const [index, chunk] of chunks.entries()) {
    try {
      records.push(await provider.extractClinicalRecord(chunk));
    } catch (error) {
      records.push(emptyClinicalRecord());
      options?.onChunkError?.(index, error);
    }
  }
  return records;
}
