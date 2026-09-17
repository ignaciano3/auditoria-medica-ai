import type { FindingReview } from "@audit/db";
import {
  FINDING_REVIEW_STATUSES,
  type Finding,
  type FindingReviewStatus,
  type FindingSeverity,
} from "@audit/domain";
import { errors } from "@audit/lib/i18n";

export type FindingFilter = "all" | FindingReviewStatus;

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    if (a.title === b.title) return 0;
    return a.title < b.title ? -1 : 1;
  });
}

export function reviewStatusOf(
  reviews: FindingReview[],
  findingId: string,
): FindingReviewStatus {
  return (
    reviews.find((review) => review.findingId === findingId)?.status ??
    "pending"
  );
}

export function filterFindings(
  findings: Finding[],
  reviews: FindingReview[],
  filter: FindingFilter,
): Finding[] {
  if (filter === "all") return findings;
  return findings.filter(
    (finding) => reviewStatusOf(reviews, finding.id) === filter,
  );
}

export function countBySeverity(
  findings: Finding[],
): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = {
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

export function countByStatus(
  findings: Finding[],
  reviews: FindingReview[],
): Record<FindingReviewStatus, number> {
  const counts: Record<FindingReviewStatus, number> = {
    pending: 0,
    reviewed: 0,
    dismissed: 0,
  };
  for (const finding of findings) {
    counts[reviewStatusOf(reviews, finding.id)] += 1;
  }
  return counts;
}

export const MAX_NOTE_LENGTH = 2000;

export type ReviewInput = {
  documentId: string;
  findingId: string;
  status: string;
  note?: string | null;
};

export type ReviewValidation =
  | {
      ok: true;
      value: {
        documentId: string;
        findingId: string;
        status: FindingReviewStatus;
        note: string | null;
      };
    }
  | { ok: false; error: string };

export function validateReviewInput(input: ReviewInput): ReviewValidation {
  const documentId = input.documentId.trim();
  const findingId = input.findingId.trim();
  if (documentId === "" || findingId === "") {
    return { ok: false, error: errors.invalidFinding };
  }
  if (!(FINDING_REVIEW_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: errors.invalidReviewStatus };
  }
  const note = input.note?.trim() ?? "";
  if (note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: errors.noteTooLong };
  }
  return {
    ok: true,
    value: {
      documentId,
      findingId,
      status: input.status as FindingReviewStatus,
      note: note === "" ? null : note,
    },
  };
}
