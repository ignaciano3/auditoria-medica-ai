export {
  allowedCitationPages,
  type CitationSegment,
  parseCitations,
  sourcePagesFromContext,
  splitCitations,
  validateCitations,
} from "./chat/citations.ts";
export {
  buildEditProposal,
  buildEditProposalUserPrompt,
  type ChatIntent,
  chatIntentSchema,
  EDIT_PROPOSAL_CORRECTION_PROMPT,
  EDIT_PROPOSAL_SYSTEM_PROMPT,
  type EditProposal,
  type EditProposalInput,
  escapeRegExp,
  replaceLiteral,
  replaceLiteralDeep,
  resolveTargetPage,
  type TranscriptionEditIntent,
} from "./chat/edit-proposal.ts";
export {
  buildChatUserPrompt,
  CHAT_SYSTEM_PROMPT,
  type ChatContext,
  type ChatTurn,
  INSUFFICIENT_EVIDENCE_REPLY,
} from "./chat/prompts.ts";
export {
  type RetrievedPage,
  type RetrieveOptions,
  retrievePages,
  tokenize,
} from "./chat/retriever.ts";
export {
  type ChunkPagesOptions,
  chunkPages,
} from "./extraction/chunk-pages.ts";
export {
  emptyClinicalRecord,
  type MapExtractOptions,
  mapExtract,
  type RetryOptions,
} from "./extraction/map-extract.ts";
export { reduceRecords } from "./extraction/reduce-record.ts";
export {
  ProvenanceError,
  stampFindingProvenance,
  stampProvenance,
} from "./extraction/stamp-provenance.ts";
export type { LLMProvider } from "./llm-provider.ts";
export {
  ANALYSIS_CORRECTION_PROMPT,
  ANALYSIS_SYSTEM_PROMPT,
  AUDIT_SUMMARY_SYSTEM_PROMPT,
  buildAnalysisCorrectionPrompt,
  buildAnalysisUserPrompt,
  buildAuditSummaryUserPrompt,
  buildClinicalSummaryUserPrompt,
  buildExtractionCorrectionPrompt,
  buildExtractionUserPrompt,
  CLINICAL_SUMMARY_SYSTEM_PROMPT,
  EXTRACTION_CORRECTION_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
} from "./prompts/extraction.ts";
export {
  createLlmProvider,
  type LlmClientConfig,
  MissingProviderKeyError,
  resolveLlmConfig,
} from "./providers/factory.ts";
export { FakeLLMProvider } from "./providers/fake/fake-provider.ts";
export { HeuristicLLMProvider } from "./providers/heuristic/heuristic-provider.ts";
export {
  LLMExtractionError,
  type OpenAICompatibleClient,
  OpenAIProvider,
} from "./providers/openai/openai-provider.ts";
