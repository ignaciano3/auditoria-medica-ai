"use client";

import type { FindingReview } from "@audit/db";
import type {
  Finding,
  FindingReviewStatus,
  FindingSeverity,
} from "@audit/domain";
import { findings as copy, ui } from "@audit/lib/i18n";
import { useEffect, useState } from "react";
import { setFindingReview } from "../lib/actions.ts";
import {
  countBySeverity,
  countByStatus,
  type FindingFilter,
  filterFindings,
  sortFindings,
} from "../lib/findings-view.ts";
import { FindingCard } from "./finding-card.tsx";

const SEVERITIES: FindingSeverity[] = ["high", "medium", "low", "info"];
const FILTERS: FindingFilter[] = ["all", "pending", "reviewed", "dismissed"];

function toMap(reviews: FindingReview[]): Map<string, FindingReview> {
  return new Map(reviews.map((review) => [review.findingId, review]));
}

export function FindingsSection({
  documentId,
  findings,
  reviews,
}: {
  documentId: string;
  findings: Finding[];
  reviews: FindingReview[];
}) {
  const [reviewMap, setReviewMap] = useState(() => toMap(reviews));
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReviewMap(toMap(reviews));
  }, [reviews]);

  const ordered = sortFindings(findings);
  const currentReviews = [...reviewMap.values()];
  const visible = filterFindings(ordered, currentReviews, filter);
  const severityCounts = countBySeverity(findings);
  const statusCounts = countByStatus(findings, currentReviews);

  async function handleReview(
    findingId: string,
    status: FindingReviewStatus,
    note: string | null,
  ) {
    const previous = reviewMap;
    const next = new Map(previous);
    next.set(findingId, { findingId, status, note });
    setReviewMap(next);
    setFailed(false);
    try {
      const result = await setFindingReview({
        documentId,
        findingId,
        status,
        note,
      });
      if (!result.ok) {
        setReviewMap(previous);
        setFailed(true);
      }
    } catch {
      setReviewMap(previous);
      setFailed(true);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">{ui.findings}</h2>
        {SEVERITIES.map((severity) =>
          severityCounts[severity] > 0 ? (
            <span
              key={severity}
              className="rounded-md border border-foreground/20 px-2 py-0.5 text-sm"
            >
              {copy.severity[severity]}: {severityCounts[severity]}
            </span>
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
              filter === option
                ? "border-foreground bg-foreground/10"
                : "border-foreground/20"
            }`}
            onClick={() => setFilter(option)}
          >
            {copy.filter[option]}{" "}
            {option === "all"
              ? `(${findings.length})`
              : `(${statusCounts[option]})`}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="text-[#d1242f]" role="alert">
          {copy.reviewFailed}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-foreground/60">
          {findings.length === 0 ? copy.empty : copy.emptyFilter}
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-3">
          {visible.map((finding) => (
            <FindingCard
              key={finding.id}
              documentId={documentId}
              finding={finding}
              status={reviewMap.get(finding.id)?.status ?? "pending"}
              note={reviewMap.get(finding.id)?.note ?? null}
              onReview={handleReview}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
