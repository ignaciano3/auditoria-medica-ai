import type { ClinicalRecord, Finding } from "@audit/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { clinicalRecords } from "../schema.ts";

export type ClinicalRecordIndex = {
  patientName?: string;
  admissionDate?: string;
  dischargeDate?: string;
};

export type ExtractionCompleteness = {
  extractionIncomplete: boolean;
  failedChunkCount: number;
};

export type ClinicalRecordRow = typeof clinicalRecords.$inferSelect;

export type ClinicalRecordWithFindings = {
  record: ClinicalRecord;
  findings: Finding[];
  extractionIncomplete: boolean;
  failedChunkCount: number;
};

export function createClinicalRecordRepository(db: Database) {
  return {
    async upsert(
      documentId: string,
      record: ClinicalRecord,
      findings: Finding[],
      indexed: ClinicalRecordIndex,
      extraction: ExtractionCompleteness,
    ): Promise<void> {
      const values = {
        documentId,
        record,
        findings,
        patientName: indexed.patientName ?? null,
        admissionDate: indexed.admissionDate ?? null,
        dischargeDate: indexed.dischargeDate ?? null,
        extractionIncomplete: extraction.extractionIncomplete,
        failedChunkCount: extraction.failedChunkCount,
      };
      await db.transaction(async (tx) => {
        await tx
          .insert(clinicalRecords)
          .values(values)
          .onConflictDoUpdate({
            target: clinicalRecords.documentId,
            set: {
              record: values.record,
              findings: values.findings,
              patientName: values.patientName,
              admissionDate: values.admissionDate,
              dischargeDate: values.dischargeDate,
              extractionIncomplete: values.extractionIncomplete,
              failedChunkCount: values.failedChunkCount,
            },
          });
      });
    },
    async getByDocument(
      documentId: string,
    ): Promise<ClinicalRecordWithFindings | null> {
      const [row] = await db
        .select()
        .from(clinicalRecords)
        .where(eq(clinicalRecords.documentId, documentId))
        .limit(1);
      if (!row) return null;
      return {
        record: row.record,
        findings: row.findings,
        extractionIncomplete: row.extractionIncomplete,
        failedChunkCount: row.failedChunkCount,
      };
    },
  };
}
