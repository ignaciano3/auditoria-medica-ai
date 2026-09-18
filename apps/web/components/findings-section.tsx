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
import { Badge, type BadgeTone } from "./ui/badge.tsx";
import { Callout } from "./ui/callout.tsx";

const SEVERITIES: FindingSeverity[] = ["high", "medium", "low", "info"];
const FILTERS: FindingFilter[] = ["all", "pending", "reviewed", "dismissed"];

const SEVERITY_TONE: Record<FindingSeverity, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
  info: "neutral",
};

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
  const [failed, setFailed] = useState<string | null>(null);

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
    setFailed(null);
    try {
      const result = await setFindingReview({
        documentId,
        findingId,
        status,
        note,
      });
      if (!result.ok) {
        setReviewMap(previous);
        setFailed(result.error);
      }
    } catch {
      setReviewMap(previous);
      setFailed(copy.reviewFailed);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{ui.findings}</h2>
        {SEVERITIES.map((severity) =>
          severityCounts[severity] > 0 ? (
            <Badge key={severity} tone={SEVERITY_TONE[severity]}>
              {copy.severity[severity]}: {severityCounts[severity]}
            </Badge>
          ) : null,
        )}
      </div>

      <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              filter === option
                ? "bg-surface text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setFilter(option)}
          >
            {copy.filter[option]}{" "}
            <span className="text-muted-foreground">
              ({option === "all" ? findings.length : statusCounts[option]})
            </span>
          </button>
        ))}
      </div>

      {failed !== null ? (
        <Callout tone="danger" role="alert">
          <p>{failed}</p>
        </Callout>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
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
