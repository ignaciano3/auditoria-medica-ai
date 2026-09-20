import type { ClinicalRecord, Finding } from "@audit/domain";
import type { RetrievedPage } from "./retriever.ts";

const CITATION_PATTERN = /\[p\.(\d+)\]/g;

export type CitationSegment =
  | { kind: "text"; text: string }
  | { kind: "page"; page: number };

function uniquePositive(pages: number[]): number[] {
  return [
    ...new Set(pages.filter((page) => Number.isInteger(page) && page > 0)),
  ].sort((a, b) => a - b);
}

export function parseCitations(text: string): number[] {
  const pages: number[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const page = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(page) && page > 0) pages.push(page);
  }
  return pages;
}

export function validateCitations(
  text: string,
  allowedPages: number[],
): number[] {
  const allowed = new Set(allowedPages);
  return uniquePositive(
    parseCitations(text).filter((page) => allowed.has(page)),
  );
}

export function splitCitations(
  text: string,
  allowedPages: number[],
): CitationSegment[] {
  const allowed = new Set(allowedPages);
  const segments: CitationSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, index) });
    }
    const page = Number.parseInt(match[1] ?? "", 10);
    if (allowed.has(page)) segments.push({ kind: "page", page });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  const merged: CitationSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (segment.kind === "text" && last?.kind === "text") {
      last.text += segment.text;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

function collectPageNumbers(value: unknown, out: number[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPageNumbers(item, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    const recordValue = value as Record<string, unknown>;
    const page = recordValue.pageNumber;
    if (typeof page === "number" && Number.isInteger(page) && page > 0) {
      out.push(page);
    }
    for (const child of Object.values(recordValue)) {
      collectPageNumbers(child, out);
    }
  }
}

export function sourcePagesFromContext(
  record: ClinicalRecord,
  findings: Finding[],
): number[] {
  const pages: number[] = [];
  collectPageNumbers(record, pages);
  collectPageNumbers(findings, pages);
  return uniquePositive(pages);
}

export function allowedCitationPages(input: {
  pages: RetrievedPage[];
  record: ClinicalRecord;
  findings: Finding[];
}): number[] {
  return uniquePositive([
    ...input.pages.map((page) => page.pageNumber),
    ...sourcePagesFromContext(input.record, input.findings),
  ]);
}
