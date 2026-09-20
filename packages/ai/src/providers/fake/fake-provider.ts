import type { ClinicalRecord, DocumentPage, Finding } from "@audit/domain";
import type { ChatContext } from "../../chat/prompts.ts";
import { INSUFFICIENT_EVIDENCE_REPLY } from "../../chat/prompts.ts";
import type { LLMProvider } from "../../llm-provider.ts";

export class FakeLLMProvider implements LLMProvider {
  private readonly record: ClinicalRecord;
  private readonly findings: Finding[];
  private readonly clinicalSummary: string;
  private readonly auditSummary: string;
  private readonly answer: string;

  constructor(options: {
    record: ClinicalRecord;
    findings?: Finding[];
    clinicalSummary?: string;
    auditSummary?: string;
    answer?: string;
  }) {
    this.record = options.record;
    this.findings = options.findings ?? [];
    this.clinicalSummary = options.clinicalSummary ?? "";
    this.auditSummary = options.auditSummary ?? "";
    this.answer = options.answer ?? INSUFFICIENT_EVIDENCE_REPLY;
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

  async *answerClinicalQuestion(_context: ChatContext): AsyncIterable<string> {
    yield this.answer;
  }
}
