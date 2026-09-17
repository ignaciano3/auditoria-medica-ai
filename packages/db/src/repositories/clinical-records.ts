import type { ClinicalRecord, Finding } from "@audit/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { clinicalRecords } from "../schema.ts";

export type ClinicalRecordIndex = {
  patientName?: string;
  admissionDate?: string;
  dischargeDate?: string;
};

export type ClinicalRecordRow = typeof clinicalRecords.$inferSelect;

export type ClinicalRecordWithFindings = {
  record: ClinicalRecord;
  findings: Finding[];
};

export function createClinicalRecordRepository(db: Database) {
  return {
    async upsert(
      documentId: string,
      record: ClinicalRecord,
      findings: Finding[],
      indexed: ClinicalRecordIndex,
    ): Promise<void> {
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: clinicalRecords.id })
          .from(clinicalRecords)
          .where(eq(clinicalRecords.documentId, documentId))
          .limit(1);
        const values = {
          record,
          findings,
          patientName: indexed.patientName ?? null,
          admissionDate: indexed.admissionDate ?? null,
          dischargeDate: indexed.dischargeDate ?? null,
        };
        if (existing) {
          await tx
            .update(clinicalRecords)
            .set(values)
            .where(eq(clinicalRecords.id, existing.id));
          return;
        }
        await tx.insert(clinicalRecords).values({ documentId, ...values });
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
        record: row.record as ClinicalRecord,
        findings: row.findings as Finding[],
      };
    },
  };
}
