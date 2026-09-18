"use client";

import type {
  Finding,
  FindingReviewStatus,
  FindingSeverity,
} from "@audit/domain";
import { findings as copy, ui } from "@audit/lib/i18n";
import { useState } from "react";
import { EvidenceLink } from "./evidence-link.tsx";
import { CheckCircleIcon, TrashIcon } from "./icons.tsx";
import { Badge, type BadgeTone } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";

const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  high: "border-l-danger",
  medium: "border-l-warning",
  low: "border-l-muted-foreground/50",
  info: "border-l-border",
};

const SEVERITY_TONE: Record<FindingSeverity, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
  info: "neutral",
};

const STATUS_TONE: Record<FindingReviewStatus, BadgeTone> = {
  pending: "neutral",
  reviewed: "success",
  dismissed: "neutral",
};

export function FindingCard({
  documentId,
  finding,
  status,
  note,
  onReview,
}: {
  documentId: string;
  finding: Finding;
  status: FindingReviewStatus;
  note: string | null;
  onReview: (
    findingId: string,
    status: FindingReviewStatus,
    note: string | null,
  ) => void;
}) {
  const [draftNote, setDraftNote] = useState(note ?? "");
  const statusNote = draftNote.trim() !== "" ? draftNote : note;

  return (
    <li
      id={`finding-${finding.id}`}
      className={`flex scroll-mt-4 flex-col gap-3 rounded-xl border-y border-r border-l-4 border-border bg-surface p-4 shadow-xs ${SEVERITY_CLASS[finding.severity]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[finding.severity]}>
          {copy.severity[finding.severity]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {copy.category[finding.category]}
        </span>
        <span className="ml-auto">
          <Badge tone={STATUS_TONE[status]}>{copy.status[status]}</Badge>
        </span>
      </div>

      <h3 className="font-semibold">{finding.title}</h3>
      <p className="text-sm leading-relaxed">{finding.explanation}</p>
      {finding.recommendation !== undefined ? (
        <p className="text-sm text-muted-foreground">
          {finding.recommendation}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <h4 className="text-sm font-semibold text-muted-foreground">
          {copy.evidence}
        </h4>
        <ul className="flex list-none flex-col gap-1.5">
          {finding.evidence.map((item, index) => {
            const evidenceKey = `${item.source.pageNumber}-${index}-${item.source.text}`;
            return (
              <li
                key={evidenceKey}
                className="flex flex-wrap items-center gap-2"
              >
                <EvidenceLink
                  documentId={documentId}
                  page={item.source.pageNumber}
                />
                <span className="text-sm text-muted-foreground">
                  {item.relevance}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onReview(finding.id, "reviewed", statusNote)}
        >
          <CheckCircleIcon className="size-4" />
          {ui.reviewed}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onReview(finding.id, "dismissed", statusNote)}
        >
          <TrashIcon className="size-4" />
          {ui.dismissFinding}
        </Button>
        {status !== "pending" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onReview(finding.id, "pending", statusNote)}
          >
            {copy.markPending}
          </Button>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onReview(finding.id, status, draftNote);
        }}
      >
        <label
          className="text-sm font-semibold text-muted-foreground"
          htmlFor={`note-${finding.id}`}
        >
          {copy.note}
        </label>
        <textarea
          id={`note-${finding.id}`}
          className="rounded-md border border-border bg-background p-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          maxLength={2000}
          placeholder={copy.notePlaceholder}
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
        />
        <Button
          className="self-start"
          variant="secondary"
          size="sm"
          type="submit"
        >
          {copy.saveNote}
        </Button>
      </form>
    </li>
  );
}
