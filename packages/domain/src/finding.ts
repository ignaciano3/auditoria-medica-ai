import { z } from "zod";
import { evidenceSchema } from "./clinical-record.ts";
import type { Evidence } from "./source.ts";

export const FINDING_SEVERITIES = ["high", "medium", "low", "info"] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_CATEGORIES = [
  "temporal",
  "contradiction",
  "medication",
  "documentation",
  "audit",
  "other",
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export type Finding = {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  explanation: string;
  evidence: Evidence[];
  recommendation?: string;
  requiresHumanReview: true;
};

export const findingSchema = z.object({
  id: z.string(),
  severity: z.enum(FINDING_SEVERITIES),
  category: z.enum(FINDING_CATEGORIES),
  title: z.string(),
  explanation: z.string(),
  evidence: z.array(evidenceSchema).min(1),
  recommendation: z.string().optional(),
  requiresHumanReview: z.literal(true),
});

export const FINDING_REVIEW_STATUSES = [
  "pending",
  "reviewed",
  "dismissed",
] as const;

export type FindingReviewStatus = (typeof FINDING_REVIEW_STATUSES)[number];

function normalizeSignatureText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findingSignature(finding: Finding): string {
  const pages = finding.evidence
    .map((item) => item.source.pageNumber)
    .sort((a, b) => a - b)
    .join(",");
  return `${finding.category}|${normalizeSignatureText(finding.title)}|${pages}`;
}

function djb2Hex(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function assignStableFindingIds(findings: Finding[]): Finding[] {
  const ordered = findings
    .map((finding, index) => ({
      finding,
      index,
      signature: findingSignature(finding),
    }))
    .sort((a, b) => {
      if (a.signature < b.signature) return -1;
      if (a.signature > b.signature) return 1;
      return a.index - b.index;
    });

  const occurrences = new Map<string, number>();
  const stabilized = ordered.map((entry) => {
    const base = `fnd-${djb2Hex(entry.signature)}`;
    const seen = occurrences.get(base) ?? 0;
    occurrences.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;
    return { index: entry.index, finding: { ...entry.finding, id } };
  });

  return stabilized
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.finding);
}
