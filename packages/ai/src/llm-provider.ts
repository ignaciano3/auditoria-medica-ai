import type { ClinicalRecord, DocumentPage, Finding } from "@audit/domain";

export interface LLMProvider {
  extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord>;
  analyzeClinicalRecord(record: ClinicalRecord): Promise<Finding[]>;
  generateClinicalSummary(record: ClinicalRecord): Promise<string>;
  generateAuditSummary(
    record: ClinicalRecord,
    findings: Finding[],
  ): Promise<string>;
}
