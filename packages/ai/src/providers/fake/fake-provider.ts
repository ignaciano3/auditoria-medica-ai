import type { ClinicalRecord, DocumentPage, Finding } from "@audit/domain";
import type { LLMProvider } from "../../llm-provider.ts";

export class FakeLLMProvider implements LLMProvider {
  private readonly record: ClinicalRecord;
  private readonly findings: Finding[];
  private readonly clinicalSummary: string;
  private readonly auditSummary: string;

  constructor(options: {
    record: ClinicalRecord;
    findings?: Finding[];
    clinicalSummary?: string;
    auditSummary?: string;
  }) {
    this.record = options.record;
    this.findings = options.findings ?? [];
    this.clinicalSummary = options.clinicalSummary ?? "";
    this.auditSummary = options.auditSummary ?? "";
  }

  async extractClinicalRecord(_pages: DocumentPage[]): Promise<ClinicalRecord> {
    return this.record;
  }

  async analyzeClinicalRecord(_record: ClinicalRecord): Promise<Finding[]> {
    return this.findings;
  }

  async generateClinicalSummary(_record: ClinicalRecord): Promise<string> {
    return this.clinicalSummary;
  }

  async generateAuditSummary(
    _record: ClinicalRecord,
    _findings: Finding[],
  ): Promise<string> {
    return this.auditSummary;
  }
}
