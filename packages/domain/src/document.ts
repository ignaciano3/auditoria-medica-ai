import type { TextBlock } from "./source.ts";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "extracting"
  | "analyzing"
  | "ready"
  | "error";

export type PageStatus = "pending" | "text" | "vision" | "skipped" | "failed";

export const PAGE_DOC_TYPES = [
  "epicrisis",
  "admission",
  "evolution",
  "imaging",
  "lab",
  "microbiology",
  "medsRecord",
  "flowsheet",
  "nursing",
  "other",
] as const;

export type PageDocType = (typeof PAGE_DOC_TYPES)[number];

export type DocumentPage = {
  pageNumber: number;
  text: string;
  imageKey?: string;
  docType: PageDocType;
  handwritten: boolean;
  dataBearing: boolean;
  status: PageStatus;
  skipReason?: string;
  blocks?: TextBlock[];
};

export type Document = {
  id: string;
  originalFilename: string;
  status: DocumentStatus;
  pageCount: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isTerminalStatus(status: DocumentStatus): boolean {
  return status === "ready" || status === "error";
}
