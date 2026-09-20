import type { ClinicalRecord, DocumentPage, Finding } from "@audit/domain";
import type { ChatIntent, EditProposalInput } from "./chat/edit-proposal.ts";
import type { ChatContext } from "./chat/prompts.ts";

export interface LLMProvider {
  extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord>;
  analyzeClinicalRecord(record: ClinicalRecord): Promise<Finding[]>;
  generateClinicalSummary(record: ClinicalRecord): Promise<string>;
  generateAuditSummary(
    record: ClinicalRecord,
    findings: Finding[],
  ): Promise<string>;
  answerClinicalQuestion(context: ChatContext): AsyncIterable<string>;
  proposeTranscriptionEdit(input: EditProposalInput): Promise<ChatIntent>;
}
